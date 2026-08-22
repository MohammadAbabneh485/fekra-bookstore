const socket = io();
let currentImageBase64 = '';

document.getElementById('bookImageFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      currentImageBase64 = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
});

socket.on('data_updated', (data) => {
  renderData(data);
});

socket.on('new_order', (order) => {
  alert(`🔔 طلب جديد وصل من: ${order.customerName} بقيمة ${order.total} د.أ`);
});

async function initAdmin() {
  const res = await fetch('/api/data');
  const data = await res.json();
  renderData(data);
}

function renderData(data) {
  // ملء الأقسام في الـ Dropdown
  const select = document.getElementById('bookCat');
  select.innerHTML = '';
  (data.categories || []).forEach(cat => {
    select.innerHTML += `<option value="${cat}">${cat}</option>`;
  });

  // ملء الكتب
  const booksContainer = document.getElementById('adminBooksList');
  booksContainer.innerHTML = '';
  (data.books || []).forEach(book => {
    booksContainer.innerHTML += `
      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center; background:#fafafa;">
        <img src="${book.image}" style="width:100%; height:140px; object-fit:cover; border-radius:4px;">
        <div style="font-weight:700; margin-top:6px; font-size:14px;">${book.title}</div>
        <div style="font-size:12px; color:#666;">الكمية: ${book.quantity} | ${book.price} د.أ</div>
        <span style="font-size:11px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px;">${book.category}</span>
      </div>
    `;
  });

  // ملء الطلبات
  const ordersContainer = document.getElementById('ordersList');
  ordersContainer.innerHTML = '';
  if (!data.orders || data.orders.length === 0) {
    ordersContainer.innerHTML = '<p style="color:#888;">لا توجد طلبات بعد.</p>';
    return;
  }
  data.orders.forEach(ord => {
    ordersContainer.innerHTML += `
      <div style="border-bottom:1px solid #eee; padding:10px 0;">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>👤 ${ord.customerName} (${ord.phone})</span>
          <span style="color:#16a34a;">${ord.total} د.أ</span>
        </div>
        <div style="font-size:13px; color:#666; margin:4px 0;">📍 ${ord.city} - ${ord.address} | ⏰ ${ord.createdAt}</div>
        <div style="font-size:12px; color:#444;">📚 الكتب: ${ord.items.map(i => `${i.title} (${i.qty})`).join('، ')}</div>
      </div>
    `;
  });
}

async function addCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  document.getElementById('newCatName').value = '';
}

async function saveBook() {
  const title = document.getElementById('bookTitle').value.trim();
  const author = document.getElementById('bookAuthor').value.trim();
  const category = document.getElementById('bookCat').value;
  const price = document.getElementById('bookPrice').value;
  const quantity = document.getElementById('bookQty').value;
  const description = document.getElementById('bookDesc').value.trim();

  if (!title || !price || !currentImageBase64) {
    return alert('يرجى كتابة عنوان الكتاب والسعر واختيار صورة الغلاف');
  }

  await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title, author, category, price, quantity, description, image: currentImageBase64
    })
  });

  // تصفير الحقول
  document.getElementById('bookTitle').value = '';
  document.getElementById('bookAuthor').value = '';
  document.getElementById('bookPrice').value = '';
  document.getElementById('bookDesc').value = '';
  document.getElementById('bookImageFile').value = '';
  currentImageBase64 = '';
  alert('تمت إضافة الكتاب بنجاح!');
}

initAdmin();