const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'data.json');

// قراءة البيانات
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      categories: ['الكتب الدينية', 'كتب أدبية', 'قسم الروايات', 'كتب سياسية'],
      books: [],
      orders: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// حفظ البيانات
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// مسارات الصفحات
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// جلب البيانات
app.get('/api/data', (req, res) => res.json(loadData()));

// إضافة قسم
// تعديل كمية كتاب (زيادة أو تقليل)
app.post('/api/books/quantity', (req, res) => {
  const { bookId, change } = req.body; // change: +1 أو -1
  const data = loadData();
  const book = data.books.find(b => b.id === bookId);

  if (!book) return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });

  book.quantity = (parseInt(book.quantity) || 0) + parseInt(change);

  // إذا أصبحت الكمية 0 أو أقل يتم حذف الكتاب من قائمة المعروض
  if (book.quantity <= 0) {
    data.books = data.books.filter(b => b.id !== bookId);
  }

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, books: data.books });
});

// حذف كتاب نهائياً
app.post('/api/books/delete', (req, res) => {
  const { bookId } = req.body;
  const data = loadData();
  data.books = data.books.filter(b => b.id !== bookId);

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, message: 'تم حذف الكتاب بنجاح' });
});
// إضافة كتاب
app.post('/api/books', (req, res) => {
  const { title, author, price, category, quantity, image, description } = req.body;
  const data = loadData();
  const newBook = {
    id: Date.now().toString(),
    title,
    author: author || 'غير محدد',
    price: parseFloat(price),
    category,
    quantity: parseInt(quantity) || 1,
    image,
    description: description || ''
  };
  data.books.push(newBook);
  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, book: newBook });
});

// تأكيد الطلب
app.post('/api/order', (req, res) => {
  const { customerName, phone, address, city, items } = req.body;
  const data = loadData();

  // خصم الكميات
  items.forEach(orderItem => {
    const book = data.books.find(b => b.id === orderItem.id);
    if (book) {
      book.quantity -= orderItem.qty;
    }
  });

  // إخفاء الكتب التي أصبحت كميتها 0
  data.books = data.books.filter(b => b.quantity > 0);

  const now = new Date();
  const dateKey = now.toLocaleDateString('ar-JO');
  const timeKey = now.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

  const newOrder = {
    id: 'ORD-' + Date.now().toString().slice(-6),
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
  };

  data.orders.unshift(newOrder);
  saveData(data);

  io.emit('data_updated', data);
  io.emit('new_order', newOrder);

  res.json({ success: true, order: newOrder });
});

// دالة مساعدة لإعادة الكتب للمخزون
function restoreBookInventory(data, item) {
  const existingBook = data.books.find(b => b.id === item.id);
  if (existingBook) {
    existingBook.quantity += item.qty;
  } else {
    // إعادة الكتاب المنتهي إلى المتجر بكامل بياناته
    data.books.push({
      id: item.id,
      title: item.title,
      author: item.author || 'غير محدد',
      price: item.price,
      category: item.category || 'عام',
      quantity: item.qty,
      image: item.image || 'logo.jpg.jpeg',
      description: item.description || ''
    });
  }
}

// إلغاء الطلب بالكامل
app.post('/api/orders/cancel', (req, res) => {
  const { orderId } = req.body;
  const data = loadData();
  const orderIndex = data.orders.findIndex(o => o.id === orderId);

  if (orderIndex === -1) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  const order = data.orders[orderIndex];
  if (order.status === 'تم التجهيز') {
    return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه وتغليفه بالفعل' });
  }

  // إعادة جميع الكتب للمخزون
  order.items.forEach(item => restoreBookInventory(data, item));

  // حذف أو تعديل حالة الطلب لـ "ملغي"
  data.orders.splice(orderIndex, 1);
  saveData(data);

  io.emit('data_updated', data);
  res.json({ success: true, message: 'تم إلغاء الطلب واسترجاع الكتب للمتجر' });
});

// تعديل الطلب بحذف عنصر واحد منه
app.post('/api/orders/remove-item', (req, res) => {
  const { orderId, itemId } = req.body;
  const data = loadData();
  const order = data.orders.find(o => o.id === orderId);

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === 'تم التجهيز') {
    return res.status(400).json({ success: false, message: 'لا يمكن تعديل الطلب لأنه تم تجهيزه بالفعل' });
  }

  const itemIndex = order.items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return res.status(404).json({ success: false, message: 'الكتاب غير موجود في الطلب' });

  const [removedItem] = order.items.splice(itemIndex, 1);
  restoreBookInventory(data, removedItem);

  if (order.items.length === 0) {
    // إذا حذف كل العناصر يُلغى الطلب تلقائياً
    data.orders = data.orders.filter(o => o.id !== orderId);
  } else {
    // إعادة حساب مجموع الطلب
    order.total = order.items.reduce((sum, i) => sum + (i.price * i.qty), 0) + order.deliveryFee;
  }

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, order });
});

// تحديث حالة الطلب من قبل الأدمن
app.post('/api/orders/status', (req, res) => {
  const { orderId, status } = req.body;
  const data = loadData();
  const order = data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = status;
    saveData(data);
    io.emit('data_updated', data);
    res.json({ success: true, order });
  } else {
    res.status(404).json({ success: false, message: 'Order not found' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
