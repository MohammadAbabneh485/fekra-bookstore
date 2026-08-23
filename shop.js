const socket = io();
let allBooks = [];
let allOrders = [];
let allCategories = [];
let cart = [];
let currentCategory = 'all';

// تحميل البيانات
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

// التحديثات اللحظية
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

// رسم شبكة الكتب مع جعل الصورة قابلة للنقر
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
  grid.innerHTML = filtered.map(b => {
    const bookId = b.id || b._id;
    return `
      <div class="book-card" style="background:#fff; border-radius:12px; padding:15px; border:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="cursor:pointer;" onclick="openBookModal('${bookId}')" title="اضغط لعرض الغلاف والوصف الكامل">
          <div style="overflow:hidden; border-radius:8px; margin-bottom:10px; position:relative;">
            <img src="${b.image || 'logo.jpg.jpeg'}" alt="${b.title}" style="width:100%; height:200px; object-fit:cover; display:block; transition:0.3s transform;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'" onerror="this.src='logo.jpg.jpeg'">
            <span style="position:absolute; bottom:6px; left:6px; background:rgba(15,23,42,0.7); color:#fff; font-size:11px; padding:2px 8px; border-radius:6px;">🔍 عرض التفاصيل</span>
          </div>
          <h4 style="margin:0 0 4px 0; font-size:16px; font-weight:bold; color:#0f172a;">${b.title}</h4>
          <p style="color:#64748b; font-size:13px; margin:0 0 6px 0;">المؤلف: ${b.author || 'غير محدد'}</p>
          <p style="color:#b45309; font-weight:bold; font-size:15px; margin:0 0 10px 0;">السعر: ${b.price} د.أ</p>
        </div>
        <button onclick="addToCart('${bookId}')" style="background:#1e293b; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; margin-top:5px;">أضف للسلة 🛒</button>
      </div>
    `;
  }).join('');
}

// دالة فتح تفاصيل الغلاف والوصف الكامل
function openBookModal(bookId) {
  const book = allBooks.find(b => (b.id || b._id) === bookId);
  if (!book) return;

  const modal = document.getElementById('bookDetailsModal');
  const body = document.getElementById('bookModalBody');
  const catsDisplay = Array.isArray(book.categories) ? book.categories.join(' ، ') : (book.category || 'عام');

  body.innerHTML = `
    <img src="${book.image || 'logo.jpg.jpeg'}" alt="${book.title}" style="width:100%; max-height:360px; object-fit:contain; border-radius:10px; background:#f8fafc; margin-bottom:14px;" onerror="this.src='logo.jpg.jpeg'">
    <h3 style="margin:0 0 6px 0; font-size:18px; color:#0f172a; font-weight:800;">${book.title}</h3>
    <p style="color:#64748b; font-size:14px; margin:0 0 8px 0;">المؤلف: <b>${book.author || 'غير محدد'}</b></p>
    <div style="margin-bottom:12px;">
      <span style="background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600;">📂 ${catsDisplay}</span>
    </div>
    
    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:8px; text-align:right; margin-bottom:15px; font-size:13px; line-height:1.6; color:#334155;">
      <b style="color:#0f172a; display:block; margin-bottom:4px;">📖 نبذة عن الكتاب:</b>
      ${book.description ? book.description : '<span style="color:#94a3b8;">لا يوجد وصف إضافي متوفر لهذا الكتاب حالياً.</span>'}
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <span style="font-size:16px; font-weight:800; color:#b45309;">السعر: ${book.price} د.أ</span>
      <span style="font-size:13px; color:#16a34a; font-weight:700;">متوفر: ${book.quantity} نسخ</span>
    </div>

    <button onclick="addToCart('${book.id || book._id}'); closeBookModal();" style="background:#16a34a; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:bold; font-size:14px; cursor:pointer; width:100%;">
      إضافة إلى السلة مباشرة 🛒
    </button>
  `;

  modal.style.display = 'flex';
}

function closeBookModal() {
  const modal = document.getElementById('bookDetailsModal');
  if (modal) modal.style.display = 'none';
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

// متابعة الطلبات
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
    
    let statusBadge = `<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">⏳ قيد المراجعة</span>`;
    if (order.status === 'ملغي') {
      statusBadge = `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">❌ ملغي</span>`;
    } else if (order.status === 'تم التجهيز') {
      statusBadge = `<span style="background:#dcfce7; color:#16a34a; padding:4px 10px; border-radius:6px; font-weight:bold; font-size:13px;">📦 تم التجهيز</span>`;
    }

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
