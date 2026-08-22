const socket = io();
let allBooks = [];
let allOrders = [];
let cart = [];
let currentCategory = 'all';
let searchQuery = '';

socket.on('data_updated', (data) => {
  allBooks = data.books || [];
  allOrders = data.orders || [];
  renderCategories(data.categories || []);
  renderBooks();
  refreshMyOrdersView();
});

async function init() {
  const res = await fetch('/api/data');
  const data = await res.json();
  allBooks = data.books || [];
  allOrders = data.orders || [];
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
  
  // فلترة حسب ما إذا كان القسم المحدد موجوداً في مصفوفة أقسام الكتاب
  let filtered = currentCategory === 'all' 
    ? allBooks 
    : allBooks.filter(b => {
        if (Array.isArray(b.categories)) {
          return b.categories.includes(currentCategory);
        }
        return b.category === currentCategory;
      });
  
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
    // تحديد القسم الأساسي أو دمج الأقسام للعرض على شارة الغلاف
    const badgeText = Array.isArray(book.categories) ? book.categories[0] : (book.category || 'عام');

    grid.innerHTML += `
      <div class="book-card">
        <div class="img-wrapper">
          <span class="badge-cat">${badgeText}</span>
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
    localStorage.setItem('fekra_last_phone', phone);
    alert('🎉 تم تأكيد طلبك بنجاح! يمكنك متابعة وتعديل طلبك من زر "طلباتي" في الأعلى.');
    cart = [];
    updateCartCount();
    closeCart();
  }
}

// ---------------- منطق متابعة وتعديل وإلغاء طلباتي ---------------- //

function openMyOrdersModal() {
  const savedPhone = localStorage.getItem('fekra_last_phone') || '';
  if (savedPhone) {
    document.getElementById('trackPhoneInput').value = savedPhone;
    searchMyOrders();
  }
  document.getElementById('myOrdersModal').style.display = 'flex';
}

function closeMyOrdersModal() {
  document.getElementById('myOrdersModal').style.display = 'none';
}

function searchMyOrders() {
  const phone = document.getElementById('trackPhoneInput').value.trim();
  const container = document.getElementById('myOrdersContent');
  if (!phone) {
    container.innerHTML = '<p style="color:#888; text-align:center;">يرجى كتابة رقم هاتفك للبحث عن طلباتك.</p>';
    return;
  }

  localStorage.setItem('fekra_last_phone', phone);
  const myOrders = allOrders.filter(o => o.phone === phone);

  if (myOrders.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#64748B; padding:20px;">لا توجد طلبات مسجلة بهذا الرقم.</div>';
    return;
  }

  let html = '';
  myOrders.forEach(ord => {
    const isReady = ord.status === 'تم التجهيز';
    html += `
      <div style="background:#F8FAFC; border:1.5px solid ${isReady ? '#86EFAC' : '#CBD5E1'}; border-radius:12px; padding:14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <b style="color:var(--primary); font-size:14px;">طلب: ${ord.id}</b>
          <span style="font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px; background:${isReady ? '#DCFCE7' : '#FEF3C7'}; color:${isReady ? '#166534' : '#B45309'};">
            ${isReady ? '✅ تم التجهيز' : '⏳ قيد المراجعة'}
          </span>
        </div>

        <div style="font-size:12px; color:#64748B; margin-bottom:8px;">
          📅 ${ord.createdAt || ord.date} | المجموع الكلي: <b style="color:#B45309;">${ord.total} د.أ</b>
        </div>

        <div style="background:#fff; border-radius:8px; padding:8px; margin-bottom:10px; border:1px solid #E2E8F0;">
          <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">الكتب في الطلب:</div>
          ${ord.items.map(i => `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 0; border-bottom:1px solid #F1F5F9;">
              <span>• ${i.title} (${i.qty})</span>
              ${!isReady ? `<button onclick="removeItemFromOrder('${ord.id}', '${i.id}')" style="background:#FEE2E2; color:#DC2626; border:none; padding:2px 6px; border-radius:4px; cursor:pointer; font-size:11px;">حذف</button>` : ''}
            </div>
          `).join('')}
        </div>

        ${isReady 
          ? `<div style="font-size:11px; color:#166534; font-weight:700; background:#DCFCE7; padding:6px; border-radius:6px; text-align:center;">🔒 تم تجهيز الطلب للتوصيل، لا يمكن التعديل أو الإلغاء.</div>`
          : `<div style="display:flex; justify-content:flex-end;">
               <button onclick="cancelFullOrder('${ord.id}')" style="background:#EF4444; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">❌ إلغاء الطلب بالكامل</button>
             </div>`
        }
      </div>
    `;
  });

  container.innerHTML = html;
}

function refreshMyOrdersView() {
  const modal = document.getElementById('myOrdersModal');
  if (modal && modal.style.display === 'flex') {
    searchMyOrders();
  }
}

async function cancelFullOrder(orderId) {
  if (!confirm('هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ سيتم استرجاع الكتب إلى المتجر فوراً.')) return;
  const res = await fetch('/api/orders/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId })
  });
  const data = await res.json();
  alert(data.message || 'تمت العملية');
}

async function removeItemFromOrder(orderId, itemId) {
  if (!confirm('هل تريد إزالة هذا الكتاب من الطلب؟ سيتم إعادة الكتاب للمتجر وتعديل قيمة الفاتورة.')) return;
  const res = await fetch('/api/orders/remove-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, itemId })
  });
  const data = await res.json();
  if (data.success) alert('تم تعديل الطلب وإعادة الكتاب للمخزون');
  else alert(data.message);
}

init();
