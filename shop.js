const socket = io();
let allBooks = [];
let allOrders = [];
let allCategories = [];
let cart = [];
let currentCategory = 'all';

// تحميل البيانات الأساسية
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

// التحديثات اللحظية عبر Socket.io
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

// رسم بطاقات الكتب مع إتاحة النقر على البطاقة أو الغلاف
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
      <div class="book-card" style="background:#fff; border-radius:14px; padding:15px; border:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 2px 8px rgba(0,0,0,0.03); transition:transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 8px 20px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.03)'">
        
        <!-- النقر على الصورة أو النصوص يفتح صفحة التفاصيل الواسعة -->
        <div style="cursor:pointer;" onclick="openBookModal('${bookId}')" title="اضغط لعرض تفاصيل الكتاب كاملة">
          <div style="overflow:hidden; border-radius:10px; margin-bottom:12px; position:relative; background:#f8fafc;">
            <img src="${b.image || 'logo.jpg.jpeg'}" alt="${b.title}" style="width:100%; height:220px; object-fit:cover; display:block; transition:transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onerror="this.src='logo.jpg.jpeg'">
            <span style="position:absolute; bottom:8px; right:8px; background:rgba(15, 23, 42, 0.8); backdrop-filter:blur(2px); color:#fff; font-size:11px; padding:3px 8px; border-radius:6px; font-weight:bold;">🔎 عرض الغلاف والوصف</span>
          </div>
          <h4 style="margin:0 0 4px 0; font-size:16px; font-weight:800; color:#0f172a; line-height:1.4;">${b.title}</h4>
          <p style="color:#64748b; font-size:13px; margin:0 0 6px 0;">المؤلف: ${b.author || 'غير محدد'}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="color:#b45309; font-weight:900; font-size:16px;">${b.price} د.أ</span>
            <span style="color:#16a34a; font-size:12px; font-weight:700; background:#dcfce7; padding:2px 8px; border-radius:12px;">متوفر: ${b.quantity}</span>
          </div>
        </div>

        <button onclick="addToCart('${bookId}')" style="background:#1e293b; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; transition:background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#1e293b'">
          أضف للسلة 🛒
        </button>
      </div>
    `;
  }).join('');
}

// فتح نافذة تفاصيل الكتاب الكبيرة والواضحة
function openBookModal(bookId) {
  const book = allBooks.find(b => (b.id || b._id) === bookId);
  if (!book) return;

  const modal = document.getElementById('bookDetailsModal');
  const body = document.getElementById('bookModalBody');
  const catsDisplay = Array.isArray(book.categories) ? book.categories.join(' ، ') : (book.category || 'عام');

  body.innerHTML = `
    <button class="close-details-btn" onclick="closeBookModal()" title="إغلاق">✕</button>

    <!-- الجانب الأيمن: صورة الغلاف كاملة بدون قص -->
    <div style="display:flex; justify-content:center; align-items:center; background:#f8fafc; border-radius:12px; padding:10px; border:1px solid #e2e8f0;">
      <img src="${book.image || 'logo.jpg.jpeg'}" alt="${book.title}" style="max-width:100%; max-height:480px; object-fit:contain; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08);" onerror="this.src='logo.jpg.jpeg'">
    </div>

    <!-- الجانب الأيسر: التفاصيل والوصف والطلب -->
    <div style="display:flex; flex-direction:column; justify-content:space-between; text-align:right;">
      <div>
        <div style="margin-bottom:8px;">
          <span style="background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:8px; font-size:12px; font-weight:700;">📂 ${catsDisplay}</span>
        </div>
        <h2 style="margin:0 0 8px 0; font-size:22px; color:#0f172a; font-weight:900; line-height:1.3;">${book.title}</h2>
        <p style="color:#64748b; font-size:15px; margin:0 0 16px 0;">المؤلف: <b style="color:#334155;">${book.author || 'غير محدد'}</b></p>
        
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:20px;">
          <div style="font-weight:800; color:#0f172a; font-size:14px; margin-bottom:6px;">📖 نبذة عن الكتاب وحالته:</div>
          <p style="color:#334155; font-size:14px; line-height:1.7; margin:0; white-space:pre-line;">
            ${book.description ? book.description : 'كتاب بحالة ممتازة وجاهز للتوصيل مباشرة.'}
          </p>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-top:1px dashed #e2e8f0; padding-top:12px;">
          <div>
            <span style="font-size:13px; color:#64748b; display:block;">السعر:</span>
            <span style="font-size:22px; font-weight:900; color:#b45309;">${book.price} د.أ</span>
          </div>
          <div>
            <span style="font-size:13px; color:#16a34a; font-weight:700; background:#dcfce7; padding:4px 12px; border-radius:10px;">متوفر بالمخزون: ${book.quantity} نسخ</span>
          </div>
        </div>

        <button onclick="addToCart('${book.id || book._id}'); closeBookModal();" style="background:#16a34a; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:800; font-size:15px; cursor:pointer; width:100%; box-shadow:0 4px 12px rgba(22,163,74,0.25); transition:0.2s;" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">
          إضافة هذا الكتاب إلى السلة 🛒
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeBookModal() {
  const modal = document.getElementById('bookDetailsModal');
  if (modal) modal.style.display = 'none';
}

function handleModalOutsideClick(e) {
  if (e.target.id === 'bookDetailsModal') {
    closeBookModal();
  }
}

// السلة والطلبات
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

// مودال متابعة الطلبات
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
