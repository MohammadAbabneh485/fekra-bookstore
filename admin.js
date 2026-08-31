const socket = io();
let currentImagesBase64 = [];
let globalData = { books: [], categories: [], orders: [] };
let currentOrdersFilter = 'all';

// معالجة رفع الصور المتعددة وضغطها
const fileInput = document.getElementById('bookImageFile');
if (fileInput) {
  fileInput.addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    currentImagesBase64 = [];
    const statusElem = document.getElementById('imagesUploadStatus');
    
    if (statusElem) statusElem.innerText = `⏳ جارٍ معالجة وتجهيز ${files.length} صورة...`;

    for (const file of files) {
      const base64 = await processAndCompressImage(file);
      currentImagesBase64.push(base64);
    }

    if (statusElem) statusElem.innerText = `✅ تم تجهيز ${currentImagesBase64.length} صورة بنجاح`;
  });
}

function processAndCompressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

socket.on('data_updated', (data) => {
  globalData = data;
  renderData(data);
});

socket.on('new_order', (order) => {
  alert(`🔔 طلب جديد وصل من: ${order.customerName} بقيمة ${order.total} د.أ`);
});

async function initAdmin() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    globalData = data;
    renderData(data);
  } catch (err) {
    console.error(err);
  }
}

// دالة البحث المباشر في لوحة الأدمن
function filterAdminBooks() {
  const query = (document.getElementById('adminSearchInput')?.value || '').toLowerCase().trim();
  if (!query) {
    renderBooksGrid(globalData.books || []);
    return;
  }
  const filtered = (globalData.books || []).filter(book => 
    (book.title && book.title.toLowerCase().includes(query)) || 
    (book.author && book.author.toLowerCase().includes(query))
  );
  renderBooksGrid(filtered);
}

function renderBooksGrid(books) {
  const booksContainer = document.getElementById('adminBooksList');
  const countBadge = document.getElementById('booksCountBadge');
  if (countBadge) countBadge.innerText = `${books.length} كتاب`;
  if (!booksContainer) return;
  booksContainer.innerHTML = '';

  if (!books || books.length === 0) {
    booksContainer.innerHTML = '<p style="color:#888; font-size:13px; grid-column: 1/-1; text-align:center; padding:20px;">لا توجد نتائج مطابقة للبحث.</p>';
    return;
  }

  books.forEach(book => {
    const catsDisplay = Array.isArray(book.categories) ? book.categories.join(' ، ') : (book.category || 'عام');
    booksContainer.innerHTML += `
      <div style="border:1px solid #E2E8F0; border-radius:12px; padding:12px; text-align:center; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.03); display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <img src="${book.image || 'logo.jpg.jpeg'}" loading="lazy" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:8px;" onerror="this.src='logo.jpg.jpeg'">
          <div style="font-weight:800; font-size:14px; color:#0F172A; line-height:1.3;">${book.title}</div>
          <div style="font-size:12px; color:#64748B; margin:3px 0;">${book.author || 'مؤلف غير محدد'}</div>
          <div style="font-size:13px; color:#B45309; font-weight:800; margin-bottom:6px;">${book.price} د.أ</div>
          <span style="font-size:11px; background:#F1F5F9; color:#475569; padding:2px 8px; border-radius:12px; display:inline-block;">📂 ${catsDisplay}</span>
        </div>

        <div style="margin-top:12px; border-top:1px solid #F1F5F9; padding-top:10px;">
          <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px;">
            <button onclick="changeBookQty('${book.id}', -1)" style="width:28px; height:28px; border-radius:6px; border:1px solid #CBD5E1; background:#F8FAFC; cursor:pointer; font-weight:bold; font-size:16px;">-</button>
            <span style="font-size:13px; font-weight:800; color:#0F172A; min-width:60px;">الكمية: ${book.quantity}</span>
            <button onclick="changeBookQty('${book.id}', 1)" style="width:28px; height:28px; border-radius:6px; border:1px solid #CBD5E1; background:#F8FAFC; cursor:pointer; font-weight:bold; font-size:16px;">+</button>
          </div>

          <div style="display:flex; gap:6px;">
            <button onclick="openEditModal('${book.id}')" style="flex:1; background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:6px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
              ✏️ تعديل
            </button>
            <button onclick="deleteBook('${book.id}', '${book.title}')" style="flex:1; background:#FEE2E2; color:#DC2626; border:none; padding:6px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
              🗑️ حذف
            </button>
          </div>
        </div>
      </div>
    `;
  });
}

// عرض وإدارة وتصفية الطلبات
function renderOrdersList() {
  const ordersContainer = document.getElementById('ordersList');
  const badge = document.getElementById('ordersHeaderBadge');
  
  const allOrders = globalData.orders || [];
  const pendingCount = allOrders.filter(o => o.status !== 'تم التوصيل' && o.status !== 'ملغي').length;
  if (badge) badge.innerText = pendingCount;

  if (!ordersContainer) return;
  ordersContainer.innerHTML = '';

  let filteredOrders = allOrders;
  if (currentOrdersFilter !== 'all') {
    filteredOrders = allOrders.filter(o => (o.status || 'جديد') === currentOrdersFilter);
  }

  if (filteredOrders.length === 0) {
    ordersContainer.innerHTML = '<p style="color:#888; text-align:center; padding:40px 20px; font-size:14px;">لا توجد أي طلبات مطابقة لهذا الفلتر.</p>';
    return;
  }

  const groupedOrders = {};
  filteredOrders.forEach(order => {
    const day = order.date || order.createdAt?.split(' - ')[0] || 'الطلبات الحالية';
    if (!groupedOrders[day]) groupedOrders[day] = [];
    groupedOrders[day].push(order);
  });

  for (const day in groupedOrders) {
    const dayOrders = groupedOrders[day];
    let dayBlock = `
      <div style="margin-bottom: 20px;">
        <div style="background:#0F172A; color:#D4AF37; padding:8px 14px; border-radius:8px; font-weight:700; font-size:13px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <span>📅 طلبات: ${day}</span>
          <span style="background:rgba(212,175,55,0.2); padding:2px 8px; border-radius:10px; font-size:11px;">${dayOrders.length} طلبات</span>
        </div>
    `;

    dayOrders.forEach(ord => {
      const isCancelled = ord.status === 'ملغي';
      const isDone = ord.status === 'تم التجهيز';
      const isDelivered = ord.status === 'تم التوصيل';

      let cardBg = '#FFFFFF';
      let cardBorder = '#E2E8F0';
      if (isCancelled) {
        cardBg = '#FEF2F2';
        cardBorder = '#FECACA';
      } else if (isDelivered) {
        cardBg = '#F8FAFC';
        cardBorder = '#CBD5E1';
      } else if (isDone) {
        cardBg = '#F0FDF4';
        cardBorder = '#86EFAC';
      }

      let statusFooterHTML = '';
      if (isCancelled) {
        statusFooterHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #FCA5A5; padding-top:8px;">
            <span style="font-size:12px; font-weight:800; color:#DC2626;">❌ الحالة: ملغي</span>
            <span style="background:#FEE2E2; color:#991B1B; font-size:11px; padding:4px 8px; border-radius:6px; font-weight:700;">تم إلغاء الطلب</span>
          </div>
        `;
      } else if (isDelivered) {
        statusFooterHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #CBD5E1; padding-top:8px;">
            <span style="font-size:12px; font-weight:800; color:#1E293B;">🎉 الحالة: تم التوصيل للعميل بنجاح</span>
            <span style="background:#E2E8F0; color:#475569; font-size:11px; padding:4px 8px; border-radius:6px; font-weight:700;">🔒 طلب مكتمل ومقفل</span>
          </div>
        `;
      } else {
        statusFooterHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-top:1px dashed #E2E8F0; padding-top:8px;">
            <span style="font-size:12px; font-weight:700; color: ${isDone ? '#16A34A' : '#D97706'};">
              ● الحالة: ${ord.status || 'جديد'}
            </span>
            <div style="display:flex; gap:6px;">
              <button onclick="toggleOrderStatus('${ord.orderId || ord.id}', '${isDone ? 'جديد' : 'تم التجهيز'}')" 
                      style="padding:6px 12px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; border:none; background:${isDone ? '#64748B' : '#16A34A'}; color:#fff; transition:0.2s;">
                ${isDone ? '↩️ كجديد' : '✅ جاهز'}
              </button>
              <button onclick="confirmDelivery('${ord.orderId || ord.id}')" 
                      style="padding:6px 12px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; border:none; background:#2563EB; color:#fff; transition:0.2s;">
                🚚 وصل الطلب
              </button>
            </div>
          </div>
        `;
      }

      dayBlock += `
        <div style="background: ${cardBg}; border: 1.5px solid ${cardBorder}; border-radius:10px; padding:14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
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

          <div style="font-size:12px; background:rgba(255,255,255,0.7); border:1px solid #E2E8F0; padding:8px 10px; border-radius:6px; margin-bottom:10px; color:#334155;">
            📚 <b>الكتب:</b> ${ord.items.map(i => `${i.title} (الكمية: ${i.qty})`).join(' ، ')}
          </div>

          ${statusFooterHTML}
        </div>
      `;
    });

    dayBlock += `</div>`;
    ordersContainer.innerHTML += dayBlock;
  }
}

function openOrdersModal() {
  const modal = document.getElementById('ordersModal');
  if (modal) {
    modal.style.display = 'flex';
    renderOrdersList();
  }
}

function closeOrdersModal() {
  const modal = document.getElementById('ordersModal');
  if (modal) modal.style.display = 'none';
}

function filterOrdersByStatus(status, e) {
  currentOrdersFilter = status;
  document.querySelectorAll('.order-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  renderOrdersList();
}

function renderData(data) {
  // 1. خيارات الأقسام لنموذج الإضافة
  const catListContainer = document.getElementById('categoriesCheckboxList');
  if (catListContainer) {
    catListContainer.innerHTML = '';
    (data.categories || []).forEach((cat, index) => {
      catListContainer.innerHTML += `
        <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #334155;">
          <input type="checkbox" name="bookCategories" value="${cat}" ${index === 0 ? 'checked' : ''}>
          <span>${cat}</span>
        </label>
      `;
    });
  }

  // 2. عرض شبكة الكتب المتاحة مع البحث
  filterAdminBooks();

  // 3. تحديث قائمة وشارة الطلبات
  renderOrdersList();
}

// دالة تأكيد وصول الطلب وقفله نهائياً
async function confirmDelivery(orderId) {
  if (!confirm('هل تأكد استلام العميل للطلب؟ بعد الضغط على موافق لن تتمكن من تغيير حالة الطلب.')) return;
  await toggleOrderStatus(orderId, 'تم التوصيل');
}

// دالة فتح نافذة التعديل
function openEditModal(bookId) {
  const book = (globalData.books || []).find(b => b.id === bookId || b._id === bookId);
  if (!book) return;

  document.getElementById('editBookId').value = book.id || book._id;
  document.getElementById('editTitle').value = book.title || '';
  document.getElementById('editAuthor').value = book.author || '';
  document.getElementById('editPrice').value = book.price || 0;
  document.getElementById('editQuantity').value = book.quantity || 1;
  document.getElementById('editDesc').value = book.description || '';

  const editCatContainer = document.getElementById('editCategoriesCheckboxList');
  if (editCatContainer) {
    editCatContainer.innerHTML = '';
    const bookCats = book.categories || [book.category || 'عام'];
    (globalData.categories || []).forEach(cat => {
      const isChecked = bookCats.includes(cat) ? 'checked' : '';
      editCatContainer.innerHTML += `
        <label style="display:flex; align-items:center; gap:4px; font-size:12px; color:#334155; cursor:pointer;">
          <input type="checkbox" value="${cat}" ${isChecked}>
          <span>${cat}</span>
        </label>
      `;
    });
  }

  const modal = document.getElementById('editModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.style.display = 'none';
}

// دالة حفظ التعديل وإرسالها للسيرفر
async function saveEditBook() {
  const bookId = document.getElementById('editBookId').value;
  const title = document.getElementById('editTitle').value.trim();
  const author = document.getElementById('editAuthor').value.trim();
  const price = parseFloat(document.getElementById('editPrice').value);
  const quantity = parseInt(document.getElementById('editQuantity').value);
  const description = document.getElementById('editDesc').value.trim();

  const checkedCats = Array.from(
    document.querySelectorAll('#editCategoriesCheckboxList input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (!title || isNaN(price)) {
    return alert('يرجى التأكد من ملء عنوان الكتاب والسعر بشكل صحيح');
  }

  try {
    const res = await fetch(`/api/books/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        author,
        price,
        quantity,
        description,
        categories: checkedCats.length > 0 ? checkedCats : undefined
      })
    });

    const result = await res.json();
    if (result.success) {
      closeEditModal();
    } else {
      alert('حدث خطأ أثناء حفظ التعديل: ' + (result.message || result.error));
    }
  } catch (err) {
    alert('فشل الاتصال بالسيرفر أثناء حفظ التعديل');
  }
}

async function changeBookQty(bookId, change) {
  await fetch('/api/books/quantity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, change })
  });
}

async function deleteBook(bookId, title) {
  if (!confirm(`هل أنت متأكد من حذف كتاب "${title}" نهائياً من المتجر؟`)) return;
  await fetch('/api/books/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId })
  });
}

async function toggleOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status: newStatus })
    });
    const result = await res.json();
    if (!result.success && result.message) alert(result.message);
  } catch (err) {
    alert('حدث خطأ أثناء تعديل حالة الطلب');
  }
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
  const price = document.getElementById('bookPrice').value;
  const quantity = document.getElementById('bookQty').value;
  const description = document.getElementById('bookDesc')?.value.trim() || '';

  const checkedBoxes = document.querySelectorAll('input[name="bookCategories"]:checked');
  const selectedCategories = Array.from(checkedBoxes).map(cb => cb.value);

  if (!title || !price || currentImagesBase64.length === 0) {
    return alert('يرجى إدخال عنوان الكتاب والسعر واختيار صورة واحدة على الأقل');
  }

  if (selectedCategories.length === 0) {
    return alert('يرجى اختيار قسم واحد على الأقل للكتاب');
  }

  const btn = document.querySelector('.add-btn[onclick="saveBook()"]') || document.querySelector('button[onclick="saveBook()"]');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'جارٍ النشر...';
  }

  try {
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        author,
        categories: selectedCategories,
        category: selectedCategories[0],
        price,
        quantity,
        description,
        image: currentImagesBase64[0],
        images: currentImagesBase64
      })
    });

    const result = await res.json();
    if (result.success) {
      document.getElementById('bookTitle').value = '';
      document.getElementById('bookAuthor').value = '';
      document.getElementById('bookPrice').value = '';
      if (document.getElementById('bookDesc')) document.getElementById('bookDesc').value = '';
      document.getElementById('bookImageFile').value = '';
      
      const statusElem = document.getElementById('imagesUploadStatus');
      if (statusElem) statusElem.innerText = '';
      
      currentImagesBase64 = [];
      alert('تم نشر الكتاب بنجاح!');
    } else {
      alert('حدث خطأ أثناء حفظ الكتاب: ' + (result.message || 'خطأ غير معروف'));
    }
  } catch (err) {
    alert('فشل الاتصال بالسيرفر');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'نشر الكتاب في المتجر';
    }
  }
}

initAdmin();
