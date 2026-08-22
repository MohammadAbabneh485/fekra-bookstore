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
app.use(express.static(path.join(__dirname, 'public')));

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
app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// APIs
app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// إضافة قسم
app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  const data = loadData();
  if (name && !data.categories.includes(name)) {
    data.categories.push(name);
    saveData(data);
    io.emit('data_updated', data);
  }
  res.json({ success: true, categories: data.categories });
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

// تأكيد الطلب وخصم المخزون
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

  // حذف أو إخفاء الكتب التي أصبحت 0
  data.books = data.books.filter(b => b.quantity > 0);

  const newOrder = {
    id: 'ORD-' + Date.now().toString().slice(-6),
    customerName,
    phone,
    address,
    city,
    items,
    deliveryFee: 2,
    total: items.reduce((sum, i) => sum + (i.price * i.qty), 0) + 2,
    createdAt: new Date().toLocaleString('ar-JO')
  };

  data.orders.unshift(newOrder);
  saveData(data);

  // إشعار فوري لجميع المتصفحات (شاشة العميل وشاشة الأدمن)
  io.emit('data_updated', data);
  io.emit('new_order', newOrder);

  res.json({ success: true, order: newOrder });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/shop`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});