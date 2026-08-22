const socket = io();
let currentImageBase64 = '';

const fileInput = document.getElementById('bookImageFile');
if (fileInput) {
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        currentImageBase64 = evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

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
  // 1. ملء قائمة الأقسام
  const select = document.getElementById('bookCat');
  if (select) {
    select.innerHTML = '';
    (data.categories || []).forEach(cat => {
      select.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
  }

  // 2. ملء الكتب المتوفرة
  const booksContainer = document.getElementById('adminBooksList');
  if (booksContainer) {
    booksContainer.innerHTML = '';
    if (!data.books || data.books.length === 0) {
      booksContainer.innerHTML = '<p style="color:#888; font-size:13px; grid-column: 1/-1;">لا توجد كتب متوفرة حالياً.</p>';
    } else {
      data.books.forEach(book => {
        booksContainer.innerHTML += `
          <div style="border:1px solid #E2E8F0; border-radius:10px; padding:10px; text-align:center; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.03);">
            <img src="${book.image || 'logo.jpg.jpeg'}" style="width:100%; height:130px; object-fit:cover; border-radius:6px;">
            <div style="font-weight:700; margin-top:6px; font-size:13px; color:#0F172A;">${book.title}</div>
            <div style="font-size:12px; color:#B45309; font-weight:700;">${book.price} د.أ | الكمية: ${book.quantity}</div>
            <span style="font-size:11px; background:#F1F5F9; color:#475569; padding:2px 8px; border-radius:12px; display:inline-block; margin-top:4px;">${book.category}</span>
          </div>
        `;
      });
    }
  }

  // 3. تجميع الطلبات حسب الأيام وزر الحالة
  const ordersContainer = document.getElementById('ordersList');
  if (!ordersContainer) return;
  ordersContainer.innerHTML = '';

  if (!data.orders || data.orders.length === 0) {
    ordersContainer.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">لا توجد أي طلبات واردة حتى الآن.</p>';
    return;
  }

  const groupedOrders = {};
  data.orders.forEach(order => {
    const day = order.date || order.createdAt?.split(' - ')[0] || 'الطلبات الحالية';
    if (!groupedOrders[day]) groupedOrders[day] = [];
    groupedOrders[day].push(order);
  });

  for (const day in groupedOrders) {
    const dayOrders = groupedOrders[day];
    let dayBlock = `
      <div style="margin-bottom: 22px;">
        <div style="background:#0F172A; color:#D4AF37; padding:9px 14px; border-radius:8px; font-weight:700; font-size:13px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <span>📅 طلبات: ${day}</span>
          <span style="background:rgba(212,175,55,0.2); padding:2px 8px; border-radius:10px; font-size:11px;">${dayOrders.length} طلبات</span>
        </div>
    `;

    dayOrders.forEach(ord => {
      const isDone = ord.status === 'تم التجهيز';
      dayBlock += `
        <div style="background: ${isDone ? '#F0FDF4' : '#FFFFFF'}; border: 1.5px solid ${isDone ? '#86EFAC' : '#E2E8F0'}; border-radius:10px; padding:14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
              <span style="font-weight:800; font-size:15px; color:#0F172A;">👤 ${ord.customerName}</span>
              <a href="tel:${ord.phone}" style="margin-right:8px; font-size:13px; color:#2563EB; text-decoration:none; font-weight:700;">📞 ${ord.phone}</a>
            </div>
            <span style="font-weight:900; font-size:16px; color:#B45309;">${ord.total} د.أ</span>
          </div>

          <div style="font-size:13px; color:#475569; margin-bottom:6px;">
            📍 <b>العنوان:</b> ${ord.city} ${ord.address ? '- ' + ord.address : ''} ${ord.time ? `| ⏰ ${ord.time}` : ''}
          </div>

          <div style="font-size:12px; background:#F8FAFC; padding:8px 10px; border-radius:6px; margin-bottom:10px; color:#334155;">
            📚 <b>الكتب:</b> ${ord.items.map(i => `${i.title} (الكمية: ${i.qty})`).join(' ، ')}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #E2E8F0; padding-top:8px;">
            <span style="font-size:12px; font-weight:700; color: ${isDone ? '#16A34A' : '#D97706'};">
              ● الحالة: ${ord.status || 'جديد'}
            </span>
            <button onclick="toggleOrderStatus('${ord.id}', '${isDone ? 'جديد' : 'تم التجهيز'}')" 
                    style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer; border:none; background:${isDone ? '#64748B' : '#16A34A'}; color:#fff; transition:0.2s;">
              ${isDone ? '↩️ إعادة تعيين كجديد' : '✅ تم تجهيز الطلب'}
            </button>
          </div>
        </div>
      `;
    });

    dayBlock += `</div>`;
    ordersContainer.innerHTML += dayBlock;
  }
}

async function toggleOrderStatus(orderId, newStatus) {
  await fetch('/api/orders/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, status: newStatus })
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
  const description = document.getElementById('bookDesc')?.value.trim() || '';

  if (!title || !price || !currentImageBase64) {
    return alert('يرجى إدخال عنوان الكتاب والسعر واختيار صورة الغلاف');
  }

  await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title, author, category, price, quantity, description, image: currentImageBase64
    })
  });

  document.getElementById('bookTitle').value = '';
  if (document.getElementById('bookAuthor')) document.getElementById('bookAuthor').value = '';
  document.getElementById('bookPrice').value = '';
  if (document.getElementById('bookDesc')) document.getElementById('bookDesc').value = '';
  document.getElementById('bookImageFile').value = '';
  currentImageBase64 = '';
  alert('تمت إضافة الكتاب بنجاح إلى المتجر!');
}

initAdmin();
