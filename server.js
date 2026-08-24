const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// مسار خفيف جداً لـ UptimeRobot لإبقاء السيرفر نشطاً دون استهلاك باقة الإنترنت (حجمه 4 بايت فقط)
app.get('/ping', (req, res) => res.status(200).send('pong'));

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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

// جلب البيانات مع الكاش السريع
let cachedData = null;

async function getFullData(forceRefresh = false) {
  if (cachedData && !forceRefresh) {
    return cachedData;
  }

  // جلب الكتب التي كميتها أكبر من صفر فقط للمتجر
  const books = await Book.find({ quantity: { $gt: 0 } }, '-image').lean();
  const orders = await Order.find().sort({ _id: -1 }).lean();
  let categories = await Category.find().lean();
  
  if (categories.length === 0) {
    const defaultCats = ['الكتب الدينية', 'كتب أدبية', 'قسم الروايات', 'كتب سياسية'];
    await Category.insertMany(defaultCats.map(name => ({ name })));
    categories = await Category.find().lean();
  }
  
  cachedData = {
    books: books.map(b => ({
      ...b,
      id: b._id.toString(),
      image: `/api/book-image/${b._id.toString()}`
    })),
    orders: orders.map(o => ({ ...o, id: o.orderId || o._id.toString() })),
    categories: categories.map(c => c.name)
  };

  return cachedData;
}

// مسارات الصفحات
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.redirect('/shop'));

// مسار إرسال صورة كتاب محدد بسرعة عالية
app.get('/api/book-image/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id, 'image').lean();
    if (!book || !book.image) {
      return res.redirect('/logo.jpg.jpeg');
    }

    if (book.image.startsWith('data:image')) {
      const parts = book.image.split(';base64,');
      const mimeType = parts[0].replace('data:', '');
      const imgBuffer = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(imgBuffer);
    }

    res.redirect(book.image);
  } catch (err) {
    res.redirect('/logo.jpg.jpeg');
  }
});

// مسار قراءة البيانات السريع جداً
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
    await Category.findOneAndUpdate({ name: name.trim() }, { name: name.trim() }, { upsert: true });
    io.emit('data_updated', await getFullData(true));
  }
  res.json({ success: true });
});

// إضافة كتاب جديد
app.post('/api/books', async (req, res) => {
  const { title, author, price, categories, category, quantity, image, description } = req.body;
  const selectedCats = Array.isArray(categories) && categories.length > 0 ? categories : [category || 'عام'];

  const book = new Book({
    title: title?.trim(),
    author: author?.trim() || 'غير محدد',
    price: parseFloat(price) || 0,
    categories: selectedCats,
    category: selectedCats[0],
    quantity: parseInt(quantity) || 1,
    image,
    description: description?.trim() || ''
  });

  await book.save();
  io.emit('data_updated', await getFullData(true));
  res.json({ success: true, book });
});

// تعديل كمية كتاب
app.post('/api/books/quantity', async (req, res) => {
  const { bookId, change } = req.body;
  const book = await Book.findById(bookId);
  if (!book) return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });

  book.quantity = Math.max(0, book.quantity + parseInt(change));
  await book.save();

  io.emit('data_updated', await getFullData(true));
  res.json({ success: true });
});

// حذف كتاب نهائياً بطلب من الأدمن فقط
app.post('/api/books/delete', async (req, res) => {
  const { bookId } = req.body;
  await Book.findByIdAndDelete(bookId);
  io.emit('data_updated', await getFullData(true));
  res.json({ success: true });
});

// إنشاء طلب جديد (تصفير الكمية دون حذف السجل لحفظ القسم والتفاصيل)
app.post('/api/order', async (req, res) => {
  const { customerName, phone, address, city, items } = req.body;

  for (const item of items) {
    if (mongoose.Types.ObjectId.isValid(item.id)) {
      const book = await Book.findById(item.id);
      if (book) {
        book.quantity = Math.max(0, book.quantity - (parseInt(item.qty) || 1));
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

  const fullData = await getFullData(true);
  io.emit('data_updated', fullData);
  io.emit('new_order', newOrder);

  res.json({ success: true, order: newOrder });
});

// إلغاء الطلب واسترجاع الكتاب مع كامل بياناته الأصلية
app.post('/api/orders/cancel', async (req, res) => {
  const targetId = req.body.orderId || req.body.id;
  let order = await Order.findOne({ orderId: targetId });
  if (!order && mongoose.Types.ObjectId.isValid(targetId)) {
    order = await Order.findById(targetId);
  }

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === 'ملغي') return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });
  if (order.status === 'تم التجهيز') return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه' });

  for (const item of order.items) {
    let existing = null;
    if (mongoose.Types.ObjectId.isValid(item.id)) {
      existing = await Book.findById(item.id);
    }
    
    // إذا كان الكتاب موجوداً بالاسم مسبقاً
    if (!existing && item.title) {
      existing = await Book.findOne({ title: item.title });
    }

    if (existing) {
      existing.quantity += parseInt(item.qty) || 1;
      await existing.save();
    } else {
      const itemCats = Array.isArray(item.categories) && item.categories.length > 0 
        ? item.categories 
        : [item.category || 'عام'];

      await Book.create({
        ...(mongoose.Types.ObjectId.isValid(item.id) ? { _id: item.id } : {}),
        title: item.title,
        author: item.author || 'غير محدد',
        price: item.price,
        categories: itemCats,
        category: itemCats[0],
        quantity: parseInt(item.qty) || 1,
        image: item.image || 'logo.jpg.jpeg',
        description: item.description || ''
      });
    }
  }

  order.status = 'ملغي';
  await order.save();

  const fullData = await getFullData(true);
  io.emit('data_updated', fullData);
  res.json({ success: true, message: 'تم إلغاء الطلب بنجاح' });
});

// تعديل حالة الطلب
app.post('/api/orders/status', async (req, res) => {
  const targetId = req.body.orderId || req.body.id;
  const newStatus = req.body.status;

  let order = await Order.findOne({ orderId: targetId });
  if (!order && mongoose.Types.ObjectId.isValid(targetId)) {
    order = await Order.findById(targetId);
  }

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === 'ملغي') return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });

  order.status = newStatus;
  await order.save();

  const fullData = await getFullData(true);
  io.emit('data_updated', fullData);
  res.json({ success: true, order });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
