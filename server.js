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

// مسار خفيف لـ UptimeRobot لإبقاء السيرفر نشطاً دون استهلاك باقة الإنترنت
app.get('/ping', (req, res) => res.status(200).send('pong'));

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Schema الكتاب مع مصفوفة الصور وحقل imagesCount الخفيف
const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  price: Number,
  categories: [String],
  category: String,
  quantity: Number,
  image: String,
  images: [String],
  imagesCount: { type: Number, default: 1 },
  description: String
}, { timestamps: true });

const Book = mongoose.model('Book', bookSchema);

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
  adminNotes: { type: String, default: '' }, // حقل ملاحظات الأدمن
  createdAt: String
}));

const Category = mongoose.model('Category', new mongoose.Schema({
  name: { type: String, unique: true }
}));

let cachedData = null;

async function getFullData(forceRefresh = false) {
  if (cachedData && !forceRefresh) {
    return cachedData;
  }

  const books = await Book.find({ quantity: { $gt: 0 } }, '-image -images').sort({ createdAt: -1 }).lean();
  const orders = await Order.find().sort({ _id: -1 }).lean();
  let categories = await Category.find().lean();
  
  if (categories.length === 0) {
    const defaultCats = ['الكتب الدينية', 'كتب أدبية', 'قسم الروايات', 'كتب سياسية'];
    await Category.insertMany(defaultCats.map(name => ({ name })));
    categories = await Category.find().lean();
  }
  
  cachedData = {
    books: books.map(b => {
      const bId = b._id.toString();
      const count = b.imagesCount || 1;
      const imagesList = [];
      for (let i = 0; i < count; i++) {
        imagesList.push(`/api/book-image/${bId}/${i}`);
      }
      return {
        ...b,
        id: bId,
        image: `/api/book-image/${bId}/0`,
        images: imagesList.length > 0 ? imagesList : [`/api/book-image/${bId}/0`],
        createdAt: b.createdAt || null
      };
    }),
    orders: orders.map(o => ({ ...o, id: o.orderId || o._id.toString() })),
    categories: categories.map(c => c.name)
  };

  return cachedData;
}

app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.redirect('/shop'));

app.get('/api/book-image/:id/:index?', async (req, res) => {
  try {
    const index = parseInt(req.params.index) || 0;
    const book = await Book.findById(req.params.id, 'image images').lean();
    if (!book) return res.redirect('/logo.jpg.jpeg');

    let targetImg = null;
    if (book.images && book.images.length > index) {
      targetImg = book.images[index];
    } else if (index === 0 && book.image) {
      targetImg = book.image;
    }

    if (!targetImg) return res.redirect('/logo.jpg.jpeg');

    if (targetImg.startsWith('data:image')) {
      const parts = targetImg.split(';base64,');
      const mimeType = parts[0].replace('data:', '');
      const imgBuffer = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(imgBuffer);
    }

    res.redirect(targetImg);
  } catch (err) {
    res.redirect('/logo.jpg.jpeg');
  }
});

app.get('/api/data', async (req, res) => {
  try {
    res.json(await getFullData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (name) {
    await Category.findOneAndUpdate({ name: name.trim() }, { name: name.trim() }, { upsert: true });
    io.emit('data_updated', await getFullData(true));
  }
  res.json({ success: true });
});

app.post('/api/books', async (req, res) => {
  const { title, author, price, categories, category, quantity, image, images, description } = req.body;
  const selectedCats = Array.isArray(categories) && categories.length > 0 ? categories : [category || 'عام'];
  const allImages = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);

  const book = new Book({
    title: title?.trim(),
    author: author?.trim() || 'غير محدد',
    price: parseFloat(price) || 0,
    categories: selectedCats,
    category: selectedCats[0],
    quantity: parseInt(quantity) || 1,
    image: allImages[0] || '',
    images: allImages,
    imagesCount: allImages.length || 1,
    description: description?.trim() || ''
  });

  await book.save();
  io.emit('data_updated', await getFullData(true));
  res.json({ success: true, book });
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const { title, author, price, categories, category, quantity, description, image, images } = req.body;
    const selectedCats = Array.isArray(categories) && categories.length > 0 ? categories : (category ? [category] : undefined);

    const updateFields = {};
    if (title !== undefined) updateFields.title = title.trim();
    if (author !== undefined) updateFields.author = author.trim();
    if (price !== undefined) updateFields.price = parseFloat(price);
    if (description !== undefined) updateFields.description = description.trim();
    if (quantity !== undefined) updateFields.quantity = parseInt(quantity);
    
    if (Array.isArray(images) && images.length > 0) {
      updateFields.images = images;
      updateFields.image = images[0];
      updateFields.imagesCount = images.length;
    } else if (image) {
      updateFields.image = image;
      updateFields.images = [image];
      updateFields.imagesCount = 1;
    }

    if (selectedCats) {
      updateFields.categories = selectedCats;
      updateFields.category = selectedCats[0];
    }

    const updatedBook = await Book.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!updatedBook) {
      return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });
    }

    io.emit('data_updated', await getFullData(true));
    res.json({ success: true, book: updatedBook });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/books/quantity', async (req, res) => {
  const { bookId, change } = req.body;
  const book = await Book.findById(bookId);
  if (!book) return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });

  book.quantity = Math.max(0, book.quantity + parseInt(change));
  await book.save();

  io.emit('data_updated', await getFullData(true));
  res.json({ success: true });
});

app.post('/api/books/delete', async (req, res) => {
  const { bookId } = req.body;
  await Book.findByIdAndDelete(bookId);
  io.emit('data_updated', await getFullData(true));
  res.json({ success: true });
});

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
    adminNotes: '',
    createdAt: `${dateKey} - ${timeKey}`
  });

  await newOrder.save();

  const fullData = await getFullData(true);
  io.emit('data_updated', fullData);
  io.emit('new_order', newOrder);

  res.json({ success: true, order: newOrder });
});

// تعديل الطلب (مشترك بين العميل والأدمن، ويدعم حفظ الملاحظات)
app.post('/api/orders/update', async (req, res) => {
  try {
    const { orderId, customerName, phone, city, address, items, adminNotes, isAdmin } = req.body;

    let order = await Order.findOne({ orderId });
    if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    }

    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    
    // إذا لم يكن أدمن: لا يسمح بالتعديل إذا كان مجهزاً أو ملغياً
    if (!isAdmin) {
      if (order.status === 'ملغي') return res.status(400).json({ success: false, message: 'لا يمكن تعديل طلب ملغي' });
      if (order.status === 'تم التجهيز' || order.status === 'تم التوصيل') {
        return res.status(400).json({ success: false, message: 'عذراً، تم البدء بتجهيز أو شحن طلبك ولا يمكن تعديله حالياً' });
      }
    }

    if (items && items.length > 0) {
      // 1. إعادة الكتب القديمة للمخزون
      for (const oldItem of order.items) {
        const bookId = oldItem.id || oldItem._id;
        if (mongoose.Types.ObjectId.isValid(bookId)) {
          await Book.findByIdAndUpdate(bookId, { $inc: { quantity: parseInt(oldItem.qty) || 1 } });
        } else if (oldItem.title) {
          await Book.findOneAndUpdate({ title: oldItem.title }, { $inc: { quantity: parseInt(oldItem.qty) || 1 } });
        }
      }

      // 2. خصم الكميات الجديدة
      for (const newItem of items) {
        const bookId = newItem.id || newItem._id;
        let book = null;
        if (mongoose.Types.ObjectId.isValid(bookId)) {
          book = await Book.findById(bookId);
        } else if (newItem.title) {
          book = await Book.findOne({ title: newItem.title });
        }

        const reqQty = parseInt(newItem.qty) || 1;
        if (book) {
          if (!isAdmin && book.quantity < reqQty) {
            io.emit('data_updated', await getFullData(true));
            return res.status(400).json({ 
              success: false, 
              message: `عذراً، الكمية المتوفرة من كتاب "${book.title}" هي ${book.quantity} فقط.` 
            });
          }
          book.quantity = Math.max(0, book.quantity - reqQty);
          await book.save();
        }
      }
      order.items = items;
      order.total = items.reduce((sum, i) => sum + (parseFloat(i.price) * parseInt(i.qty)), 0) + (order.deliveryFee || 2);
    }

    if (customerName) order.customerName = customerName.trim();
    if (phone) order.phone = phone.trim();
    if (city) order.city = city.trim();
    if (address !== undefined) order.address = address.trim();
    if (adminNotes !== undefined) order.adminNotes = adminNotes.trim();

    await order.save();

    const fullData = await getFullData(true);
    io.emit('data_updated', fullData);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تعديل الطلب: ' + err.message });
  }
});

// إلغاء الطلب واسترجاع الكتب للمخزون
app.post('/api/orders/cancel', async (req, res) => {
  const targetId = req.body.orderId || req.body.id;
  const isAdmin = req.body.isAdmin || false;

  let order = await Order.findOne({ orderId: targetId });
  if (!order && mongoose.Types.ObjectId.isValid(targetId)) {
    order = await Order.findById(targetId);
  }

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === 'ملغي') return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });
  
  if (!isAdmin) {
    if (order.status === 'تم التجهيز') return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه' });
    if (order.status === 'تم التوصيل') return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب بعد إتمام التوصيل' });
  }

  for (const item of order.items) {
    let existing = null;
    if (mongoose.Types.ObjectId.isValid(item.id)) {
      existing = await Book.findById(item.id);
    }
    
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
        images: item.images || [item.image || 'logo.jpg.jpeg'],
        imagesCount: (item.images && item.images.length) || 1,
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
  if (order.status === 'ملغي' && newStatus !== 'جديد') return res.status(400).json({ success: false, message: 'تم إلغاء هذا الطلب مسبقاً' });

  order.status = newStatus;
  await order.save();

  const fullData = await getFullData(true);
  io.emit('data_updated', fullData);
  res.json({ success: true, order });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
