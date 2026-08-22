const socket = io();
let allBooks = [];
let cart = [];
let currentCategory = 'all';

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
  bar.innerHTML = `<button class="cat-btn ${currentCategory==='all'?'active':''}" onclick="filterCategory('all')">جميع الكتب</button>`;
  categories.forEach(cat => {
    bar.innerHTML += `<button class="cat-btn ${currentCategory===cat?'active':''}" onclick="filterCategory('${cat}')">${cat}</button>`;
  });
}

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  renderBooks();
}

function renderBooks() {
  const grid = document.getElementById('booksGrid');
  const empty = document.getElementById('emptyState');
  const filtered = currentCategory === 'all' ? allBooks : allBooks.filter(b => b.category === currentCategory);

  grid.innerHTML = '';
  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(book => {
    grid.innerHTML += `
      <div class="book-card">
        <img src="${book.image || 'https://via.placeholder.com/250x300?text=Fekra'}" class="book-img" alt="${book.title}">
        <div class="book-info">
          <div>
            <div class="book-title">${book.title}</div>
            <div class="book-author">${book.author}</div>
            ${book.description ? `<p style="font-size:12px; color:#666; margin-bottom:8px;">${book.description}</p>` : ''}
          </div>
          <div>
            <div class="book-price">${book.price} د.أ</div>
            <button class="add-btn" onclick="addToCart('${book.id}')">أضف للسلة</button>
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
  if (cart.length === 0) return alert('السلة فارغة!');
  const list = document.getElementById('cartItemsList');
  list.innerHTML = '';
  let subTotal = 0;

  cart.forEach(item => {
    subTotal += item.price * item.qty;
    list.innerHTML += `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">
        <span>${item.title} (${item.qty})</span>
        <b>${item.price * item.qty} د.أ</b>
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

  if (!customerName || !phone || !city) return alert('يرجى تعبئة الاسم ورقم الهاتف والمنطقة');

  const orderData = { customerName, phone, city, address, items: cart };

  const res = await fetch('/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });

  const result = await res.json();
  if (result.success) {
    alert('تم تثبيت طلبك بنجاح! شكراً لاختيارك مكتبة فكرة.');
    cart = [];
    updateCartCount();
    closeCart();
  }
}

init();