const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 25000
});

// تفعيل ضغط البيانات لتسريع التحميل بشكل كبير
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname, { maxAge: '1d' }));

// الاتصال بقاعدة البيانات عبر متغير البيئة MONGO_URI
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// تعريف المخططات والجداول (Schemas)
const BookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, default: 'غير محدد' },
  price: { type: Number, required: true },
  categories: { type: [String], default: [] },
  category: { type: String, default: 'عام' },
  quantity: { type: Number, default: 1 },
  image: { type: String, default: 'logo.jpg.jpeg' },
  description: { type: String, default: '' }
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, index: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  city: { type: String, required: true },
  address: { type: String, default: '' },
  items: { type: Array, default: [] },
  deliveryFee: { type: Number, default: 2 },
  total: { type: Number, required: true },
  date: String,
  time: String,
  status: { type: String, default: 'جديد' },
  createdAt: String
}, { timestamps: true });

const CategorySchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true }
});

const Book = mongoose.model('Book', BookSchema);
const Order = mongoose.model('Order', OrderSchema);
const Category = mongoose.model('Category', CategorySchema);

// دالة جلب كافة البيانات المحدثة بتنسيق Lean خفيف وسريع
async function getFullData() {
  const [books, orders, categoriesDocs] = await Promise.all([
    Book.find({ quantity: { $gt: 0 } }).lean(),
    Order.find().sort({ _id: -1 }).lean(),
    Category.find().lean()
  ]);

  let categories = categoriesDocs.map(c => c.name);
  if (categories.length === 0) {
    const defaultCats = ['الكتب الدينية', 'كتب أدبية', 'قسم الروايات', 'كتب سياسية'];
    await Category.insertMany(defaultCats.map(name => ({ name })));
    categories = defaultCats;
  }

  return {
    books: books.map(b => ({ ...b, id: b._id.toString() })),
    orders: orders.map(o => ({ ...o, id: o.orderId || o._id.toString() })),
    categories
  };
}

// مسارات واجهات العرض
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.redirect('/shop'));

// مسار قراءة البيانات العام
app.get('/api/data', async (req, res) => {
  try {
    const data = await getFullData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة قسم جديد
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (name && name.trim()) {
      await Category.findOneAndUpdate({ name: name.trim() }, { name: name.trim() }, { upsert: true });
      io.emit('data_updated', await getFullData());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إضافة كتاب جديد
app.post('/api/books', async (req, res) => {
  try {
    const { title, author, price, categories, category, quantity, image, description } = req.body;
    const selectedCats = Array.isArray(categories) && categories.length > 0 ? categories : [category || 'عام'];

    const book = new Book({
      title: title?.trim(),
      author: author?.trim() || 'غير محدد',
      price: parseFloat(price) || 0,
      categories: selectedCats,
      category: selectedCats[0],
      quantity: parseInt(quantity) || 1,
      image: image || 'logo.jpg.jpeg',
      description: description?.trim() || ''
    });

    await book.save();
    io.emit('data_updated', await getFullData());
    res.json({ success: true, book });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تعديل كمية كتاب يدوياً
app.post('/api/books/quantity', async (req, res) => {
  try {
    const { bookId, change } = req.body;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });

    book.quantity += parseInt(change);
    if (book.quantity <= 0) {
      await Book.findByIdAndDelete(bookId);
    } else {
      await book.save();
    }

    io.emit('data_updated', await getFullData());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// حذف كتاب نهائياً
app.post('/api/books/delete', async (req, res) => {
  try {
    const { bookId } = req.body;
    await Book.findByIdAndDelete(bookId);
    io.emit('data_updated', await getFullData());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إنشاء طلب جديد
app.post('/api/order', async (req, res) => {
  try {
    const { customerName, phone, address, city, items } = req.body;

    if (!customerName || !phone || !city || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'البيانات غير مكتملة' });
    }

    // خصم الكميات من قاعدة البيانات
    for (const item of items) {
      if (mongoose.Types.ObjectId.isValid(item.id)) {
        const book = await Book.findById(item.id);
        if (book) {
          book.quantity -= parseInt(item.qty) || 1;
          if (book.quantity <= 0) {
            await Book.findByIdAndDelete(item.id);
          } else {
            await book.save();
          }
        }
      }
    }

    const now = new Date();
    const dateKey = now.toLocaleDateString('ar-JO');
    const timeKey = now.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
    const orderId = 'ORD-' + Date.now().toString().slice(-6);

    const newOrder = new Order({
      orderId,
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address?.trim() || '',
      city: city.trim(),
      items,
      deliveryFee: 2,
      total: items.reduce((sum, i) => sum + (parseFloat(i.price) * parseInt(i.qty)), 0) + 2,
      date: dateKey,
      time: timeKey,
      status: 'جديد',
      createdAt: `${dateKey} - ${timeKey}`
    });

    await newOrder.save();

    const fullData = await getFullData();
    io.emit('data_updated', fullData);
    io.emit('new_order', newOrder);

    res.json({ success: true, order: newOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إلغاء الطلب واسترجاع الكتب
app.post('/api/orders/cancel', async (req, res) => {
  try {
    const targetId = req.body.orderId || req.body.id;
    
    let order = await Order.findOne({ orderId: targetId });
    if (!order && mongoose.Types.ObjectId.isValid(targetId)) {
      order = await Order.findById(targetId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    if (order.status === 'ملغي') {
      return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });
    }

    if (order.status === 'تم التجهيز') {
      return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه وتغليفه' });
    }

    // استرجاع كميات الكتب
    for (const item of order.items) {
      let existing = null;
      if (mongoose.Types.ObjectId.isValid(item.id)) {
        existing = await Book.findById(item.id);
      }
      if (existing) {
        existing.quantity += parseInt(item.qty) || 1;
        await existing.save();
      } else {
        await Book.create({
          ...(mongoose.Types.ObjectId.isValid(item.id) ? { _id: item.id } : {}),
          title: item.title,
          author: item.author || 'غير محدد',
          price: item.price,
          categories: item.categories || [item.category || 'عام'],
          category: item.category || 'عام',
          quantity: parseInt(item.qty) || 1,
          image: item.image || 'logo.jpg.jpeg',
          description: item.description || ''
        });
      }
    }

    order.status = 'ملغي';
    await order.save();

    const fullData = await getFullData();
    io.emit('data_updated', fullData);

    res.json({ success: true, message: 'تم إلغاء الطلب بنجاح واسترجاع الكتب للمتجر' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تعديل حالة الطلب من الأدمن
app.post('/api/orders/status', async (req, res) => {
  try {
    const targetId = req.body.orderId || req.body.id;
    const newStatus = req.body.status;

    let order = await Order.findOne({ orderId: targetId });
    if (!order && mongoose.Types.ObjectId.isValid(targetId)) {
      order = await Order.findById(targetId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    if (order.status === 'ملغي') {
      return res.status(400).json({ success: false, message: 'هذا الطلب تم إلغاؤه مسبقاً ولا يمكن تعديل حالته' });
    }

    order.status = newStatus;
    await order.save();

    const fullData = await getFullData();
    io.emit('data_updated', fullData);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running smoothly on port ${PORT}`));
