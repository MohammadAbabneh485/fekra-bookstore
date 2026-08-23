const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// الاتصال بقاعدة البيانات عبر متغير البيئة MONGO_URI
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// تعريف جداول قاعدة البيانات
const Book = mongoose.model('Book', new mongoose.Schema({
  title: String,
  author: String,
  price: Number,
  categories: [String],
  category: String,
  quantity: Number,
  image: String,
  description: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
  orderId: String,
  customerName: String,
  phone: String,
  city: String,
  address: String,
  items: Array,
  deliveryFee: Number,
  total: Number,
  date: String,
  time: String,
  status: { type: String, default: 'جديد' },
  createdAt: String
}));

const Category = mongoose.model('Category', new mongoose.Schema({
  name: { type: String, unique: true }
}));

// دالة جلب كافة البيانات المحدثة
async function getFullData() {
  const books = await Book.find({ quantity: { $gt: 0 } });
  const orders = await Order.find().sort({ _id: -1 });
  let categories = await Category.find();
  
  if (categories.length === 0) {
    const defaultCats = ['الكتب الدينية', 'كتب أدبية', 'قسم الروايات', 'كتب سياسية'];
    await Category.insertMany(defaultCats.map(name => ({ name })));
    categories = await Category.find();
  }
  
  return {
    books: books.map(b => ({ ...b.toObject(), id: b._id.toString() })),
    orders: orders.map(o => ({ ...o.toObject(), id: o.orderId })),
    categories: categories.map(c => c.name)
  };
}

// مسارات واجهات العرض
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// مسار قراءة البيانات
app.get('/api/data', async (req, res) => {
  try {
    res.json(await getFullData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة قسم جديد
app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (name) {
    await Category.findOneAndUpdate({ name }, { name }, { upsert: true });
    io.emit('data_updated', await getFullData());
  }
  res.json({ success: true });
});

// إضافة كتاب جديد
app.post('/api/books', async (req, res) => {
  const { title, author, price, categories, category, quantity, image, description } = req.body;
  const selectedCats = Array.isArray(categories) && categories.length > 0 ? categories : [category || 'عام'];

  const book = new Book({
    title,
    author: author || 'غير محدد',
    price: parseFloat(price),
    categories: selectedCats,
    category: selectedCats[0],
    quantity: parseInt(quantity) || 1,
    image,
    description: description || ''
  });

  await book.save();
  io.emit('data_updated', await getFullData());
  res.json({ success: true, book });
});

// تعديل كمية كتاب يدويًا
app.post('/api/books/quantity', async (req, res) => {
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
});

// حذف كتاب نهائياً
app.post('/api/books/delete', async (req, res) => {
  const { bookId } = req.body;
  await Book.findByIdAndDelete(bookId);
  io.emit('data_updated', await getFullData());
  res.json({ success: true });
});

// إنشاء طلب جديد وحفظه في الداتابيز
app.post('/api/order', async (req, res) => {
  const { customerName, phone, address, city, items } = req.body;

  // خصم الكميات من الداتابيز
  for (const item of items) {
    const book = await Book.findById(item.id);
    if (book) {
      book.quantity -= item.qty;
      if (book.quantity <= 0) {
        await Book.findByIdAndDelete(item.id);
      } else {
        await book.save();
      }
    }
  }

  const now = new Date();
  const dateKey = now.toLocaleDateString('ar-JO');
  const timeKey = now.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
  const orderId = 'ORD-' + Date.now().toString().slice(-6);

  const newOrder = new Order({
    orderId,
    customerName,
    phone,
    address,
    city,
    items,
    deliveryFee: 2,
    total: items.reduce((sum, i) => sum + (i.price * i.qty), 0) + 2,
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
});

// إلغاء الطلب: تحويل حالته إلى "ملغي" في الداتابيز واسترجاع الكتب لمرة واحدة فقط
app.post('/api/orders/cancel', async (req, res) => {
  const { orderId } = req.body;
  const order = await Order.findOne({ orderId });

  if (!order) {
    return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  }

  // منع تكرار الإلغاء وزيادة كميات الكتب أكثر من مرة
  if (order.status === 'ملغي') {
    return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });
  }

  // منع الإلغاء إذا تم تجهيز الطلب وتغليفه
  if (order.status === 'تم التجهيز') {
    return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه وتغليفه' });
  }

  // إعادة كميات الكتب إلى الداتابيز لمرة واحدة فقط
  for (const item of order.items) {
    const existing = await Book.findById(item.id);
    if (existing) {
      existing.quantity += item.qty;
      await existing.save();
    } else {
      await Book.create({
        _id: item.id,
        title: item.title,
        author: item.author || 'غير محدد',
        price: item.price,
        categories: item.categories || [item.category || 'عام'],
        category: item.category || 'عام',
        quantity: item.qty,
        image: item.image || 'logo.jpg.jpeg',
        description: item.description || ''
      });
    }
  }

  // تعديل حالة الطلب في قاعدة البيانات إلى "ملغي" دون حذفه
  order.status = 'ملغي';
  await order.save();

  const fullData = await getFullData();
  io.emit('data_updated', fullData);

  res.json({ success: true, message: 'تم إلغاء الطلب بنجاح واسترجاع الكتب للمتجر' });
});

// تعديل حالة الطلب يدوياً (جديد / تم التجهيز / ملغي)
app.post('/api/orders/status', async (req, res) => {
  const { orderId, status } = req.body;
  const order = await Order.findOne({ orderId });

  if (order) {
    order.status = status;
    await order.save();
    io.emit('data_updated', await getFullData());
    res.json({ success: true, order });
  } else {
    res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
