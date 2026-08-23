const socket = io();
let allBooks = [];
let allOrders = [];
let allCategories = [];
let cart = [];
let currentCategory = 'all';

// تحميل البيانات من السيرفر
async function loadData() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    allBooks = data.books || [];
    allOrders = data.orders || [];
    allCategories = data.categories || [];
    renderCategories();
    renderBooks();
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

// استماع للتحديثات اللحظية
socket.on('data_updated', (data) => {
  allBooks = data.books || [];
  allOrders = data.orders || [];
  allCategories = data.categories || [];
  renderBooks();
  const trackInput = document.getElementById('trackPhoneInput');
  if (trackInput && trackInput.value.trim()) {
    searchMyOrders();
  }
});

function renderCategories() {
  const bar = document.getElementById('categoriesBar');
  if (!bar) return;
  bar.innerHTML = `<button class="cat-btn ${currentCategory === 'all' ? 'active' : ''}" onclick="filterCategory('all', event)">جميع الكتب</button>`;
  allCategories.forEach(cat => {
    bar.innerHTML += `<button class="cat-btn ${currentCategory === cat ? 'active' : ''}" onclick="filterCategory('${cat}', event)">${cat}</button>`;
  });
}

function filterCategory(cat, e) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  if (e) e.target.classList.add('active');
  renderBooks();
}

function handleSearch() {
  renderBooks();
}

function renderBooks() {
  const grid = document.getElementById('booksGrid');
  const empty = document.getElementById('emptyState');
  if (!grid) return;
  
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  let filtered = allBooks.filter(b => b.quantity > 0);

  if (currentCategory !== 'all') {
    filtered = filtered.filter(b => (b.categories && b.categories.includes(currentCategory)) || b.category === currentCategory);
  }

  if (query) {
    filtered = filtered.filter(b => 
      (b.title && b.title.toLowerCase().includes(query)) ||
      (b.author && b.author.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = filtered.map(b => `
    <div class="book-card" style="background:#fff; border-radius:12px; padding:15px; border:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between;">
      <img src="${b.image || 'logo.jpg.jpeg'}" alt="${b.title}" style="width:100%; height:200px; object-fit:cover; border-radius:8px; margin-bottom:10px;" onerror="this.src='logo.jpg.jpeg'">
      <div>
        <h4 style="margin:0 0 4px 0; font-size:16px; font-weight:bold;">${b.title}</h4>
        <p style="color:#64748b; font-size:13px; margin:0 0 6px 0;">المؤلف: ${b.author || 'غير محدد'}</p>
        <p style="color:#0f172a; font-weight:bold; font-size:15px; margin:0 0 10px 0;">السعر: ${b.price} د.أ</p>
      </div>
      <button onclick="addToCart('${b.id || b._id}')" style="background:#1e293b; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%;">أضف للسلة 🛒</button>
    </div>
  `).join('');
}

// السلة
function addToCart(bookId) {
  const book = allBooks.find(b => (b.id || b._id) === bookId);
  if (!book) return;

  const inCart = cart.find(item => item.id === bookId);
  if (inCart) {
    if (inCart.qty < book.quantity) {
      inCart.qty += 1;
    } else {
      alert('عذراً، هذه أقصى كمية متوفرة من هذا الكتاب');
    }
  } else {
    cart.push({
      id: book.id || book._id,
      title: book.title,
      price: book.price,
      qty: 1,
      maxQty: book.quantity
    });
  }
  updateCartUI();
}

function updateCartUI() {
  const countElem = document.getElementById('cartCount');
  if (countElem) countElem.innerText = cart.reduce((sum, it) => sum + it.qty, 0);

  const list = document.getElementById('cartItemsList');
  if (list) {
    if (cart.length === 0) {
      list.innerHTML = '<p style="text-align:center; color:#94a3b8;">السلة فارغة</p>';
    } else {
      list.innerHTML = cart.map((it, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#f8fafc; padding:8px 12px; border-radius:6px;">
          <span><b>${it.title}</b> (${it.price} د.أ)</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <button onclick="changeQty(${idx}, -1)" style="padding:2px 8px; cursor:pointer;">-</button>
            <b>${it.qty}</b>
            <button onclick="changeQty(${idx}, 1)" style="padding:2px 8px; cursor:pointer;">+</button>
          </div>
        </div>
      `).join('');
    }
  }

  const subTotal = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
  const subElem = document.getElementById('subTotal');
  const finalElem = document.getElementById('finalTotal');
  if (subElem) subElem.innerText = subTotal + ' د.أ';
  if (finalElem) finalElem.innerText = (subTotal > 0 ? subTotal + 2 : 0) + ' د.أ';
}

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) {
    cart.splice(idx, 1);
  } else if (cart[idx].qty > cart[idx].maxQty) {
    cart[idx].qty = cart[idx].maxQty;
    alert('هذه أقصى كمية متوفرة');
  }
  updateCartUI();
}

function openCart() {
  document.getElementById('cartModal').style.display = 'flex';
  updateCartUI();
}

function closeCart() {
  document.getElementById('cartModal').style.display = 'none';
}

async function submitOrder() {
  if (cart.length === 0) {
    alert('السلة فارغة!');
    return;
  }
  const customerName = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const city = document.getElementById('custCity').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if (!customerName || !phone || !city) {
    alert('يرجى ملء كافة الحقول الإجبارية (*)');
    return;
  }

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, phone, city, address, items: cart })
    });
    const result = await res.json();
    if (result.success) {
      alert('تم تثبيت طلبك بنجاح! رقم الطلب: ' + result.order.orderId);
      cart = [];
      updateCartUI();
      closeCart();
      document.getElementById('custName').value = '';
      document.getElementById('custPhone').value = '';
      document.getElementById('custCity').value = '';
      document.getElementById('custAddress').value = '';
    } else {
      alert('حدث خطأ أثناء تثبيت الطلب');
    }
  } catch (err) {
    alert('تعذر الاتصال بالسيرفر');
  }
}

// نافذة متابعة الطلبات للعميل
function openMyOrdersModal() {
  document.getElementById('myOrdersModal').style.display = 'flex';
}

function closeMyOrdersModal() {
  document.getElementById('myOrdersModal').style.display = 'none';
}

function searchMyOrders() {
  const phone = (document.getElementById('trackPhoneInput')?.value || '').trim();
  const container = document.getElementById('myOrdersContent');

  if (!phone) {
    container.innerHTML = '<p style="text-align:center; color:#ef4444; font-weight:bold;">يرجى إدخال رقم الهاتف للبحث</p>';
    return;
  }

  const userOrders = allOrders.filter(o => o.phone && o.phone.trim() === phone);

  if (userOrders.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px 0;">لا توجد طلبات مسجلة بهذا الرقم.</p>';
    return;
  }

  container.innerHTML = userOrders.map(order => {
    const orderIdVal = order.orderId || order.id;
    
    // فحص شارة الحالة
    let statusBadge = `<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">⏳ قيد المراجعة</span>`;
    if (order.status === 'ملغي') {
      statusBadge = `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">❌ ملغي</span>`;
    } else if (order.status === 'تم التجهيز') {
      statusBadge = `<span style="background:#dcfce7; color:#16a34a; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">📦 تم التجهيز</span>`;
    }

    // إخفاء زر الإلغاء إذا تم الإلغاء أو التجهيز
    let actionBtn = '';
    if (order.status === 'ملغي') {
      actionBtn = `<div style="background:#fee2e2; color:#b91c1c; text-align:center; padding:8px; border-radius:6px; font-weight:bold; font-size:13px; margin-top:10px;">تم إلغاء هذا الطلب واسترجاع الكتب للمتجر</div>`;
    } else if (order.status === 'تم التجهيز') {
      actionBtn = `<div style="background:#dcfce7; color:#15803d; text-align:center; padding:8px; border-radius:6px; font-weight:bold; font-size:13px; margin-top:10px;">تم تجهيز وتغليف طلبك وهو جاهز للشحن</div>`;
    } else {
      actionBtn = `<button onclick="cancelCustomerOrder('${orderIdVal}')" style="background:#ef4444; color:#fff; border:none; padding:8px 12px; border-radius:6px; width:100%; cursor:pointer; font-weight:bold; margin-top:10px;">إلغاء الطلب بالكامل ✖</button>`;
    }

    return `
      <div style="border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:12px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:bold; font-size:14px; color:#1e293b;">طلب: ${orderIdVal}</span>
          ${statusBadge}
        </div>
        <div style="font-size:12px; color:#64748b; margin-bottom:8px;">
          📅 ${order.date || ''} - ${order.time || ''} | المجموع الكلي: <b>${order.total} د.أ</b>
        </div>
        <div style="background:#f8fafc; padding:8px 12px; border-radius:6px; font-size:13px;">
          <div style="font-weight:bold; margin-bottom:4px; color:#334155;">الكتب المطلوبة:</div>
          <ul style="margin:0; padding-right:18px; color:#475569;">
            ${order.items.map(it => `<li>${it.title} (${it.qty})</li>`).join('')}
          </ul>
        </div>
        ${actionBtn}
      </div>
    `;
  }).join('');
}

async function cancelCustomerOrder(orderId) {
  if (!confirm('هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟')) return;

  try {
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    if (data.success) {
      alert('تم إلغاء الطلب بنجاح');
      searchMyOrders();
    } else {
      alert(data.message || 'تعذر إلغاء الطلب');
    }
  } catch (err) {
    alert('حدث خطأ أثناء محاولة الإلغاء');
  }
}

window.onload = loadData;
