const socket = io();
let allBooks = [];
let cart = [];
let currentCategory = 'all';
let searchQuery = '';

socket.on('data_updated', (data) => {
  allBooks = data.books || [];
  renderCategories(data.categories || []);
  renderBooks();
});

async function init() {
  const res = await fetch('/api/data');
  const data = await res.json();
  allBooks = data.books || [];
  renderCategories(data.categories || []);
  renderBooks();
}

function renderCategories(categories) {
  const bar = document.getElementById('categoriesBar');
  bar.innerHTML = `<button class="cat-btn ${currentCategory==='all'?'active':''}" onclick="filterCategory('all', event)">جميع الكتب</button>`;
  categories.forEach(cat => {
    bar.innerHTML += `<button class="cat-btn ${currentCategory===cat?'active':''}" onclick="filterCategory('${cat}', event)">${cat}</button>`;
  });
}

function filterCategory(cat, e) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  renderBooks();
}

function handleSearch() {
  searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
  renderBooks();
}

function renderBooks() {
  const grid = document.getElementById('booksGrid');
  const empty = document.getElementById('emptyState');
  
  let filtered = currentCategory === 'all' ? allBooks : allBooks.filter(b => b.category === currentCategory);
  
  if (searchQuery) {
    filtered = filtered.filter(b => 
      (b.title && b.title.toLowerCase().includes(searchQuery)) ||
      (b.author && b.author.toLowerCase().includes(searchQuery))
    );
  }

  grid.innerHTML = '';
  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(book => {
    grid.innerHTML += `
      <div class="book-card">
        <div class="img-wrapper">
          <span class="badge-cat">${book.category}</span>
          <img src="${book.image || 'logo.jpg.jpeg'}" class="book-img" alt="${book.title}">
        </div>
        <div class="book-info">
          <div>
            <h4 class="book-title">${book.title}</h4>
            <div class="book-author">${book.author || 'مؤلف غير محدد'}</div>
          </div>
          <div>
            <div class="book-meta">
              <span style="font-size:12px; color:#64748B;">السعر:</span>
              <div class="book-price">${book.price} <span>د.أ</span></div>
            </div>
            <button class="add-btn" onclick="addToCart('${book.id}')">🛒 إضافة إلى السلة</button>
          </div>
        </div>
      </div>
    `;
  });
}

function addToCart(id) {
  const book = allBooks.find(b => b.id === id);
  if (!book) return;
  const existing = cart.find(i => i.id === id);
  if (existing) {
    if (existing.qty < book.quantity) existing.qty++;
    else alert('عذراً، هذه هي الكمية المتوفرة الوحيدة من هذا الكتاب');
  } else {
    cart.push({ ...book, qty: 1 });
  }
  updateCartCount();
}

function updateCartCount() {
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cartCount').innerText = totalQty;
}

function openCart() {
  if (cart.length === 0) return alert('السلة فارغة حالياً');
  const list = document.getElementById('cartItemsList');
  list.innerHTML = '';
  let subTotal = 0;

  cart.forEach(item => {
    subTotal += item.price * item.qty;
    list.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:14px;">
        <span>📖 ${item.title} (x${item.qty})</span>
        <b style="color:#b45309;">${item.price * item.qty} د.أ</b>
      </div>
    `;
  });

  document.getElementById('subTotal').innerText = subTotal + ' د.أ';
  document.getElementById('finalTotal').innerText = (subTotal + 2) + ' د.أ';
  document.getElementById('cartModal').style.display = 'flex';
}

function closeCart() {
  document.getElementById('cartModal').style.display = 'none';
}

async function submitOrder() {
  const customerName = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const city = document.getElementById('custCity').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if (!customerName || !phone || !city) return alert('يرجى كتابة الاسم ورقم الهاتف والمحافظة/المنطقة');

  const orderData = { customerName, phone, city, address, items: cart };

  const res = await fetch('/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });

  const result = await res.json();
  if (result.success) {
    alert('🎉 تم تأكيد طلبك بنجاح! سنتواصل معك قريباً لتوصيل الكتب.');
    cart = [];
    updateCartCount();
    closeCart();
  }
}

init();
