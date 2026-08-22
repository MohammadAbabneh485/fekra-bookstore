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
  // ملء الأقسام
  const select = document.getElementById('bookCat');
  if (select) {
    select.innerHTML = '';
    (data.categories || []).forEach(cat => {
      select.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
  }

  // ملء الكتب المتوفرة
  const booksContainer = document.getElementById('adminBooksList');
  if (booksContainer) {
    booksContainer.innerHTML = '';
    (data.books || []).forEach(book => {
      booksContainer.innerHTML += `
        <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <img src="${book.image}" style="width:100%; height:130px; object-fit:cover; border-radius:6px;">
          <div style="font-weight:700; margin-top:6px; font-size:13px;">${book.title}</div>
          <div style="font-size:12px; color:#b45309; font-weight:700;">${book.price} د.أ | الكمية: ${book.quantity}</div>
          <span style="font-size:10px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">${book.category}</span>
        </div>
      `;
    });
  }

  // تجميع الطلبات حسب الأيام
  const ordersContainer = document.getElementById('ordersList');
  if (!ordersContainer) return;
  ordersContainer.innerHTML = '';

  if (!data.orders || data.orders.length === 0) {
    ordersContainer.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">لا توجد أي طلبات واردة حالياً.</p>';
    return;
  }

  // تجميع في كائن بحسب التاريخ
  const groupedOrders = {};
  data.orders.forEach(order => {
    const day = order.date || 'طلبات سابقة';
    if (!groupedOrders[day]) groupedOrders[day] = [];
    groupedOrders[day].push(order);
  });

  // رسم المجموعات اليومية
  for (const day in groupedOrders) {
    const dayOrders = groupedOrders[day];
    let dayHtml = `
      <div style="margin-bottom: 25px;">
        <div style="background:#0F172A; color:#D4AF37; padding:8px 15px; border-radius:8px; font-weight:700; font-size:14px; margin-bottom:10px; display:flex; justify-content:space-between;">
          <span>📅 طلبات يوم: ${day}</span>
          <span>(${dayOrders.length} طلبات)</span>
        </div>
    `;

    dayOrders.forEach(ord => {
      const isDone = ord.status === 'تم التجهيز';
      dayHtml += `
        <div style="background: ${isDone ? '#F0FDF4' : '#FFFFFF'}; border: 1.5px solid ${isDone ? '#86EFAC' : '#E2E8F0'}; border-radius:10px; padding:14px; margin-bottom:10px; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
              <span style="font-weight:800; font-size:15px; color:#0F172A;">👤 ${ord.customerName}</span>
              <a href="tel:${ord.phone}" style="margin-right:8px; font-size:13px; color:#2563EB; text-decoration:none; font-weight:600;">📞 ${ord.phone}</a>
            </div>
            <span style="font-weight:800; font-size:16px; color:#B45309;">${ord.total} د.أ</span>
          </div>

          <div style="font-size:13px; color:#475569; margin-bottom:6px;">
            📍 <b>العنوان:</b> ${ord.city} ${ord.address ? '- ' + ord.address : ''} | ⏰ ${ord.time || ''}
          </div>

          <div style="font-size:12px; background:#F8FAFC; padding:6px 10px; border-radius:6px; margin-bottom:10px; color:#334155;">
            📚 <b>الكتب المطلوبة:</b> ${ord.items.map(i => `${i.title} (${i.qty})`).join(' ، ')}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:700; color: ${isDone ? '#16A34A' : '#D97706'};">
              الحالة: ${ord.status || 'جديد'}
            </span>
            <button onclick="toggleOrderStatus('${ord.id}', '${isDone ? 'جديد' : 'تم التجهيز'}')" 
                    style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer; border:none; background:${isDone ? '#94A3B8' : '#16A34A'}; color:#fff;">
              ${isDone ? '↩️ إعادة كطلب جديد' : '✅ تم التجهيز'}
            </button>
          </div>
        </div>
      `;
    });

    dayHtml += `</div>`;
    ordersContainer.innerHTML += dayHtml;
  }
}

// دالة إرسال التحديث
async function toggleOrderStatus(orderId, newStatus) {
  await fetch('/api/orders/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, status: newStatus })
  });
}
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
