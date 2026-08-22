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

function loadData() {
  try {
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
  } catch (e) {
    return { categories: [], books: [], orders: [] };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

function restoreBookInventory(data, item) {
  const existingBook = data.books.find(b => b.id === item.id);
  if (existingBook) {
    existingBook.quantity += (item.qty || 1);
    if (item.categories && Array.isArray(item.categories)) {
      existingBook.categories = item.categories;
    }
  } else {
    let bookCategories = [];
    if (Array.isArray(item.categories) && item.categories.length > 0) {
      bookCategories = item.categories;
    } else if (item.category) {
      bookCategories = [item.category];
    } else {
      bookCategories = ['عام'];
    }

    data.books.push({
      id: item.id,
      title: item.title,
      author: item.author || 'غير محدد',
      price: item.price,
      categories: bookCategories,
      category: bookCategories[0],
      quantity: item.qty || 1,
      image: item.image || 'logo.jpg.jpeg',
      description: item.description || ''
    });
  }
}

// مسارات العرض
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'shop.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// جلب البيانات
app.get('/api/data', (req, res) => res.json(loadData()));

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
  const { title, author, price, categories, category, quantity, image, description } = req.body;
  const data = loadData();
  
  let selectedCategories = [];
  if (Array.isArray(categories) && categories.length > 0) {
    selectedCategories = categories;
  } else if (category) {
    selectedCategories = [category];
  } else {
    selectedCategories = ['عام'];
  }

  const newBook = {
    id: Date.now().toString(),
    title,
    author: author || 'غير محدد',
    price: parseFloat(price),
    categories: selectedCategories,
    category: selectedCategories[0],
    quantity: parseInt(quantity) || 1,
    image,
    description: description || ''
  };
  
  data.books.push(newBook);
  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, book: newBook });
});

// تعديل كمية كتاب
app.post('/api/books/quantity', (req, res) => {
  const { bookId, change } = req.body;
  const data = loadData();
  const book = data.books.find(b => b.id === bookId);

  if (!book) return res.status(404).json({ success: false, message: 'الكتاب غير موجود' });

  book.quantity = (parseInt(book.quantity) || 0) + parseInt(change);

  if (book.quantity <= 0) {
    data.books = data.books.filter(b => b.id !== bookId);
  }

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, books: data.books });
});

// حذف كتاب
app.post('/api/books/delete', (req, res) => {
  const { bookId } = req.body;
  const data = loadData();
  data.books = data.books.filter(b => b.id !== bookId);

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, message: 'تم حذف الكتاب بنجاح' });
});

// تأكيد الطلب
app.post('/api/order', (req, res) => {
  const { customerName, phone, address, city, items } = req.body;
  const data = loadData();

  const detailedItems = (items || []).map(orderItem => {
    const book = data.books.find(b => b.id === orderItem.id);
    if (book) {
      book.quantity -= orderItem.qty;
      return {
        ...orderItem,
        categories: book.categories || (book.category ? [book.category] : ['عام']),
        category: book.category || (book.categories ? book.categories[0] : 'عام')
      };
    }
    return orderItem;
  });

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
    items: detailedItems,
    deliveryFee: 2,
    total: detailedItems.reduce((sum, i) => sum + (i.price * i.qty), 0) + 2,
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

// إلغاء الطلب بالكامل
app.post('/api/orders/cancel', (req, res) => {
  const { orderId } = req.body;
  const data = loadData();
  const orderIndex = data.orders.findIndex(o => o.id === orderId);

  if (orderIndex === -1) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  const order = data.orders[orderIndex];
  if (order.status === 'تم التجهيز') {
    return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه تم تجهيزه بالفعل' });
  }

  (order.items || []).forEach(item => restoreBookInventory(data, item));

  data.orders.splice(orderIndex, 1);
  saveData(data);

  io.emit('data_updated', data);
  res.json({ success: true, message: 'تم إلغاء الطلب واسترجاع الكتب للمتجر' });
});

// حذف عنصر من الطلب
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
    data.orders = data.orders.filter(o => o.id !== orderId);
  } else {
    order.total = order.items.reduce((sum, i) => sum + (i.price * i.qty), 0) + (order.deliveryFee || 2);
  }

  saveData(data);
  io.emit('data_updated', data);
  res.json({ success: true, order });
});

// تحديث حالة الطلب
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
