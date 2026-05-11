// ====================================================
// نظام إدارة الزيت والجبنة - JavaScript الكامل
// ====================================================

// ====================================================
// الحالة العامة (State)
// ====================================================
const state = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  apiKey: localStorage.getItem('apiKey') || '',
  tankPrice: parseFloat(localStorage.getItem('tankPrice')) || 0,
  cashTanks: parseInt(localStorage.getItem('cashTanks')) || 0,
  deletePassword: localStorage.getItem('deletePassword') || '1234',
  installmentsCounter: parseInt(localStorage.getItem('installmentsCounter')) || 0,
  users: [],
  installments: [],
  oilTanks: [],
  oilPurchases: [],
  cheese: [],
  cheeseDetails: [],
};

// ====================================================
// الاتصال بـ Apps Script
// ====================================================
async function callApi(action, sheet, extraParams = {}) {
  if (!state.apiUrl || !state.apiKey) {
    showToast('يرجى ضبط إعدادات الاتصال من تبويبة "الإعدادات"', 'warning');
    return { success: false };
  }
  
  setConnectionStatus('connecting');
  
  try {
    const body = { apiKey: state.apiKey, action, sheet, ...extraParams };
    const response = await fetch(state.apiUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      body: JSON.stringify(body)
    });
    const result = await response.json();
    setConnectionStatus(result.success ? 'connected' : 'error');
    return result;
  } catch (err) {
    console.error('API Error:', err);
    setConnectionStatus('error');
    showToast('فشل الاتصال بالخادم: ' + err.message, 'error');
    return { success: false, error: err.message };
  }
}

function setConnectionStatus(status) {
  const el = document.getElementById('connectionStatus');
  const text = el.querySelector('.status-text');
  el.className = 'connection-status ' + status;
  const labels = {
    connecting: 'جاري الاتصال...',
    connected: 'متصل ✓',
    error: 'خطأ في الاتصال'
  };
  text.textContent = labels[status] || '';
}

// ====================================================
// دوال مساعدة
// ====================================================
function generateId(prefix = 'ID') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

function nowISO() { return new Date().toISOString(); }

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatNumber(num) {
  if (isNaN(num) || num === null || num === undefined) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatMoney(num) { return formatNumber(num) + ' د.أ'; }

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showModal(title, bodyHtml, onConfirm, confirmText = 'تأكيد') {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalConfirm').textContent = confirmText;
  overlay.classList.add('active');
  
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  const close = () => overlay.classList.remove('active');
  
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.addEventListener('click', () => { onConfirm(); close(); });
  cancelBtn.onclick = close;
}

// ====================================================
// إدارة المستخدمين
// ====================================================
async function getOrCreateUser(name) {
  name = name.trim();
  if (!name) return null;
  
  let user = state.users.find(u => u.name === name);
  if (user) return user;
  
  const newUser = {
    userId: generateId('U'),
    name: name,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'Users', { data: newUser });
  if (result.success) {
    state.users.push(newUser);
    refreshUsersList();
    return newUser;
  }
  return null;
}

function refreshUsersList() {
  const datalist = document.getElementById('usersList');
  datalist.innerHTML = state.users
    .map(u => `<option value="${escapeHtml(u.name)}">${u.userId}</option>`)
    .join('');
}

// ====================================================
// تحميل البيانات
// ====================================================
async function loadAllData() {
  showToast('جاري تحميل البيانات...', 'info');
  const sheets = ['Users', 'Installments', 'OilTanks', 'OilPurchases', 'Cheese', 'CheeseDetails'];
  const stateKeys = ['users', 'installments', 'oilTanks', 'oilPurchases', 'cheese', 'cheeseDetails'];
  
  for (let i = 0; i < sheets.length; i++) {
    const result = await callApi('getAll', sheets[i]);
    if (result.success) state[stateKeys[i]] = result.data || [];
  }
  
  refreshUsersList();
  renderAll();
  showToast('تم التحميل بنجاح ✓', 'success');
}

function renderAll() {
  renderInstallments();
  renderTanks();
  renderPurchases();
  renderCheese();
  renderCheeseDetails();
  updateGlobalStats();
}

function updateGlobalStats() {
  const totalTanks = state.oilTanks.reduce((sum, t) => sum + (parseInt(t.tanksCount) || 0), 0);
  document.getElementById('totalTanksDisplay').textContent = formatNumber(totalTanks);
  const installmentTanks = totalTanks - state.cashTanks;
  document.getElementById('installmentTanksDisplay').textContent = formatNumber(installmentTanks);
  document.getElementById('totalTanksValueDisplay').textContent = formatNumber(totalTanks);
  document.getElementById('cashTanksInput').value = state.cashTanks;
}

// ====================================================
// الإعدادات
// ====================================================
function saveTankPrice() {
  const val = parseFloat(document.getElementById('tankPriceInput').value);
  if (isNaN(val) || val < 0) { showToast('يرجى إدخال سعر صحيح', 'error'); return; }
  state.tankPrice = val;
  localStorage.setItem('tankPrice', val);
  showToast('تم حفظ السعر: ' + formatMoney(val), 'success');
  renderInstallments();
}

function saveDeletePassword() {
  const val = document.getElementById('deletePasswordInput').value;
  if (val.length < 4) { showToast('كلمة السر يجب أن تكون 4 أحرف على الأقل', 'error'); return; }
  state.deletePassword = val;
  localStorage.setItem('deletePassword', val);
  document.getElementById('deletePasswordInput').value = '';
  showToast('تم حفظ كلمة السر', 'success');
}

function saveApiSettings() {
  const url = document.getElementById('apiUrlInput').value.trim();
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!url || !key) { showToast('يرجى تعبئة الحقلين', 'error'); return; }
  state.apiUrl = url;
  state.apiKey = key;
  localStorage.setItem('apiUrl', url);
  localStorage.setItem('apiKey', key);
  showToast('تم حفظ الإعدادات. جاري إعادة التحميل...', 'success');
  setTimeout(loadAllData, 500);
}

function deleteTransaction(sheetName, transactionId, stateKey) {
  showModal(
    '🗑️ تأكيد الحذف',
    `<p style="margin-bottom:16px;">سيتم حذف هذه العملية نهائياً. أدخل كلمة سر الحذف للتأكيد:</p>
     <input type="password" id="deleteConfirmPass" placeholder="كلمة السر"
            style="width:100%; padding:12px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:8px; font-family:inherit;">`,
    async () => {
      const pass = document.getElementById('deleteConfirmPass').value;
      if (pass !== state.deletePassword) { showToast('كلمة السر خاطئة', 'error'); return; }
      const result = await callApi('delete', sheetName, { transactionId });
      if (result.success) {
        state[stateKey] = state[stateKey].filter(r => r.transactionId !== transactionId);
        renderAll();
        showToast('تم الحذف بنجاح', 'success');
      } else {
        showToast('فشل الحذف: ' + (result.error || ''), 'error');
      }
    },
    '🗑️ احذف'
  );
}

// ====================================================
// الميزة 2: الأقساط
// ====================================================
async function addInstallment() {
  const name = document.getElementById('inst_name').value.trim();
  const amount = parseFloat(document.getElementById('inst_amount').value);
  const month = document.getElementById('inst_month').value;
  const method = document.getElementById('inst_method').value;
  const notes = document.getElementById('inst_notes').value.trim();
  
  if (!name) { showToast('أدخل الاسم', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }
  if (!month) { showToast('اختر الشهر', 'error'); return; }
  
  const user = await getOrCreateUser(name);
  if (!user) { showToast('فشل في حفظ المستخدم', 'error'); return; }
  
  const newInstallment = {
    transactionId: generateId('INST'),
    userId: user.userId,
    userName: user.name,
    amountPaid: amount,
    monthPaid: month,
    paymentMethod: method,
    notes: notes,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'Installments', { data: newInstallment });
  if (result.success) {
    state.installments.push(newInstallment);
    state.installmentsCounter++;
    localStorage.setItem('installmentsCounter', state.installmentsCounter);
    if (state.installmentsCounter % 50 === 0) showBackupReminder();
  
    document.getElementById('inst_name').value = '';
    document.getElementById('inst_amount').value = '';
    document.getElementById('inst_notes').value = '';
  
    renderAll();
    showToast(`تم حفظ القسط (${state.installmentsCounter} عملية إجمالاً)`, 'success');
    showUserSummary(user.userId);
  } else {
    showToast('فشل الحفظ', 'error');
  }
}

function calculateRemaining(userId) {
  const userTanksList = state.oilTanks.filter(t => t.userId === userId);
  const totalDue = userTanksList.reduce((sum, t) =>
    sum + ((parseInt(t.tanksCount) || 0) * (parseFloat(t.tankPrice) || state.tankPrice))
  , 0);
  const totalPaid = state.installments
    .filter(i => i.userId === userId)
    .reduce((sum, i) => sum + (parseFloat(i.amountPaid) || 0), 0);
  const userTanks = userTanksList.reduce((s, t) => s + (parseInt(t.tanksCount) || 0), 0);
  const remaining = totalDue - totalPaid;
  return { userTanks, totalPaid, totalDue, remaining };
}

function renderInstallments() {
  const tbody = document.querySelector('#installmentsTable tbody');
  if (state.installments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد بيانات حالياً</td></tr>';
    return;
  }
  
  const sorted = [...state.installments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(inst => {
    const { remaining } = calculateRemaining(inst.userId);
    const remClass = remaining > 0 ? 'remaining-positive' : remaining === 0 ? 'remaining-zero' : 'remaining-negative';
    return `
      <tr>
        <td><strong>${escapeHtml(inst.userName)}</strong></td>
        <td>${formatMoney(inst.amountPaid)}</td>
        <td>${escapeHtml(inst.monthPaid)}</td>
        <td class="${remClass}">${formatMoney(remaining)}</td>
        <td>${inst.paymentMethod === 'electronic' ? '💳 إلكتروني' : '💵 يدوي'}</td>
        <td>${formatDate(inst.createdAt)}</td>
        <td><button class="btn-icon" onclick="deleteTransaction('Installments', '${inst.transactionId}', 'installments')" title="حذف">🗑️</button></td>
      </tr>
    `;
  }).join('');
}

function showUserSummary(userId) {
  const user = state.users.find(u => u.userId === userId);
  if (!user) return;
  const { userTanks, totalPaid, totalDue, remaining } = calculateRemaining(userId);
  const userInstallments = state.installments.filter(i => i.userId === userId);
  const cashCount = userInstallments.filter(i => i.paymentMethod === 'manual').length;
  const electronicCount = userInstallments.filter(i => i.paymentMethod === 'electronic').length;
  
  const html = `
    <div class="user-summary">
      <h4>📊 ملخص: ${escapeHtml(user.name)}</h4>
      <div class="summary-grid">
        <div class="summary-item"><div class="label">عدد التنكات</div><div class="value">${formatNumber(userTanks)}</div></div>
        <div class="summary-item"><div class="label">إجمالي المستحق</div><div class="value">${formatMoney(totalDue)}</div></div>
        <div class="summary-item"><div class="label">المدفوع</div><div class="value" style="color:var(--accent-primary)">${formatMoney(totalPaid)}</div></div>
        <div class="summary-item"><div class="label">المتبقي</div><div class="value" style="color:${remaining > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">${formatMoney(remaining)}</div></div>
        <div class="summary-item"><div class="label">دفعات يدوية</div><div class="value">${cashCount}</div></div>
        <div class="summary-item"><div class="label">دفعات إلكترونية</div><div class="value">${electronicCount}</div></div>
      </div>
    </div>
  `;
  
  const existing = document.querySelector('#tab-installments .user-summary');
  if (existing) existing.remove();
  const target = document.querySelector('#tab-installments .table-wrapper').parentElement;
  target.insertAdjacentHTML('beforebegin', html);
  setTimeout(() => {
    const elem = document.querySelector('#tab-installments .user-summary');
    if (elem) elem.style.opacity = '0.5';
  }, 8000);
}

function showBackupReminder() {
  showModal(
    '⚠️ تذكير: نسخة احتياطية',
    `<p>لقد قمت بإدخال <strong style="color:var(--accent-primary)">${state.installmentsCounter}</strong> قسط حتى الآن.</p>
     <p style="margin-top:12px;">يُنصح بتصدير نسخة احتياطية الآن للحفاظ على بياناتك.</p>`,
    () => { exportToCSV('installments'); showToast('تم تصدير الأقساط', 'success'); },
    '📥 صدّر الآن'
  );
}

// ====================================================
// الميزة 3: التنكات
// ====================================================
function saveCashTanks() {
  const val = parseInt(document.getElementById('cashTanksInput').value);
  if (isNaN(val) || val < 0) { showToast('أدخل رقم صحيح', 'error'); return; }
  state.cashTanks = val;
  localStorage.setItem('cashTanks', val);
  updateGlobalStats();
  showToast('تم حفظ تنكات الكاش: ' + val, 'success');
}

async function addTank() {
  const name = document.getElementById('tank_name').value.trim();
  const batch = document.getElementById('tank_batch').value.trim();
  const count = parseInt(document.getElementById('tank_count').value);
  const notes = document.getElementById('tank_notes').value.trim();
  
  if (!name) { showToast('أدخل الاسم', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(count) || count <= 0) { showToast('أدخل عدد تنكات صحيح', 'error'); return; }
  
  const user = await getOrCreateUser(name);
  if (!user) { showToast('فشل في حفظ المستخدم', 'error'); return; }
  
  const newTank = {
    transactionId: generateId('TANK'),
    userId: user.userId,
    userName: user.name,
    batchNumber: batch,
    tanksCount: count,
    tankPrice: parseFloat(document.getElementById('tank_price').value) || state.tankPrice,
    notes: notes,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'OilTanks', { data: newTank });
  if (result.success) {
    state.oilTanks.push(newTank);
    document.getElementById('tank_name').value = '';
    document.getElementById('tank_count').value = '';
    document.getElementById('tank_notes').value = '';
    renderAll();
    showToast(`تم تسجيل ${count} تنك للدفعة ${batch}`, 'success');
  }
}

function renderTanks() {
  const tbody = document.querySelector('#tanksTable tbody');
  if (state.oilTanks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">لا توجد بيانات</td></tr>';
  } else {
    const sorted = [...state.oilTanks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tbody.innerHTML = sorted.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.userName)}</strong></td>
        <td><code>${escapeHtml(t.batchNumber)}</code></td>
        <td><strong style="color:var(--accent-primary)">${formatNumber(t.tanksCount)}</strong></td>
        <td>${formatDate(t.createdAt)}</td>
        <td><button class="btn-icon" onclick="deleteTransaction('OilTanks', '${t.transactionId}', 'oilTanks')" title="حذف">🗑️</button></td>
      </tr>
    `).join('');
  }
  renderBatchesSummary();
}

function renderBatchesSummary() {
  const container = document.getElementById('batchesSummary');
  const batches = {};
  state.oilTanks.forEach(t => {
    const b = t.batchNumber;
    batches[b] = (batches[b] || 0) + (parseInt(t.tanksCount) || 0);
  });
  const entries = Object.entries(batches);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">لا توجد دفعات بعد</p>';
    return;
  }
  container.innerHTML = entries.map(([batch, total]) => `
    <div class="batch-card">
      <div class="batch-number">دفعة ${escapeHtml(batch)}</div>
      <div class="batch-total">${formatNumber(total)} تنك</div>
    </div>
  `).join('');
}

// ====================================================
// الميزة 4: شراء الزيت والمطابقة
// ====================================================
async function addPurchase() {
  const supplier = document.getElementById('pur_supplier').value.trim();
  const batch = document.getElementById('pur_batch').value.trim();
  const count = parseInt(document.getElementById('pur_count').value);
  const notes = document.getElementById('pur_notes').value.trim();
  
  if (!supplier) { showToast('أدخل اسم المورّد', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(count) || count <= 0) { showToast('أدخل عدد صحيح', 'error'); return; }
  
  const newPurchase = {
    transactionId: generateId('PUR'),
    supplierName: supplier,
    batchNumber: batch,
    tanksCount: count,
    tankPrice: parseFloat(document.getElementById('tank_price').value) || state.tankPrice,
    notes: notes,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'OilPurchases', { data: newPurchase });
  if (result.success) {
    state.oilPurchases.push(newPurchase);
    document.getElementById('pur_supplier').value = '';
    document.getElementById('pur_count').value = '';
    document.getElementById('pur_notes').value = '';
    renderAll();
    showToast(`تم تسجيل شراء ${count} تنك للدفعة ${batch}`, 'success');
  }
}

function renderPurchases() {
  const tbody = document.querySelector('#purchasesTable tbody');
  if (state.oilPurchases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">لا توجد بيانات</td></tr>';
  } else {
    const sorted = [...state.oilPurchases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tbody.innerHTML = sorted.map(p => `
      <tr>
        <td>${formatDate(p.createdAt)}</td>
        <td><strong>${escapeHtml(p.supplierName)}</strong></td>
        <td><code>${escapeHtml(p.batchNumber)}</code></td>
        <td><strong style="color:var(--accent-secondary)">${formatNumber(p.tanksCount)}</strong></td>
        <td><button class="btn-icon" onclick="deleteTransaction('OilPurchases', '${p.transactionId}', 'oilPurchases')" title="حذف">🗑️</button></td>
      </tr>
    `).join('');
  }
  renderMatchingReport();
}

function renderMatchingReport() {
  const container = document.getElementById('matchingReport');
  const purchasesByBatch = {};
  state.oilPurchases.forEach(p => {
    purchasesByBatch[p.batchNumber] = (purchasesByBatch[p.batchNumber] || 0) + (parseInt(p.tanksCount) || 0);
  });
  const tanksByBatch = {};
  state.oilTanks.forEach(t => {
    tanksByBatch[t.batchNumber] = (tanksByBatch[t.batchNumber] || 0) + (parseInt(t.tanksCount) || 0);
  });
  const allBatches = new Set([...Object.keys(purchasesByBatch), ...Object.keys(tanksByBatch)]);
  
  if (allBatches.size === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">لا توجد دفعات للمقارنة</p>';
    return;
  }
  
  const totalPurchased = Object.values(purchasesByBatch).reduce((s, v) => s + v, 0);
  const totalSold = Object.values(tanksByBatch).reduce((s, v) => s + v, 0);
  const globalDiff = totalPurchased - totalSold;
  
  let html = `
    <div style="background:var(--bg-secondary); padding:16px; border-radius:12px; margin-bottom:16px;">
      <h4 style="margin-bottom:12px; color:var(--accent-primary);">📊 الإجمالي الكلي</h4>
      <div class="match-row ${globalDiff === 0 ? 'match-ok' : globalDiff > 0 ? 'match-low' : 'match-high'}">
        <div><strong>الإجمالي</strong></div>
        <div>مُشترى: <strong>${formatNumber(totalPurchased)}</strong></div>
        <div>مُباع: <strong>${formatNumber(totalSold)}</strong></div>
        <div class="match-status ${globalDiff === 0 ? 'ok' : globalDiff > 0 ? 'low' : 'high'}">
          ${globalDiff === 0 ? '✅ متطابق' : globalDiff > 0 ? '⚠️ متبقي ' + globalDiff : '🔴 زيادة ' + Math.abs(globalDiff)}
        </div>
      </div>
    </div>
    <h4 style="margin-bottom:12px;">📋 المطابقة لكل دفعة</h4>
  `;
  
  Array.from(allBatches).sort().forEach(batch => {
    const purchased = purchasesByBatch[batch] || 0;
    const sold = tanksByBatch[batch] || 0;
    const diff = purchased - sold;
    let statusClass, statusText, rowClass;
    if (diff === 0) { statusClass = 'ok'; statusText = '✅ متطابق'; rowClass = 'match-ok'; }
    else if (diff > 0) { statusClass = 'low'; statusText = `⚠️ نقص ${diff}`; rowClass = 'match-low'; }
    else { statusClass = 'high'; statusText = `🔴 زيادة ${Math.abs(diff)}`; rowClass = 'match-high'; }
  
    html += `
      <div class="match-row ${rowClass}">
        <div><strong>دفعة ${escapeHtml(batch)}</strong></div>
        <div>مُشترى: <strong>${formatNumber(purchased)}</strong></div>
        <div>مُباع: <strong>${formatNumber(sold)}</strong></div>
        <div class="match-status ${statusClass}">${statusText}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ====================================================
// الميزة 5: الجبنة
// ====================================================
async function addCheese() {
  const name = document.getElementById('ch_name').value.trim();
  const batch = document.getElementById('ch_batch').value.trim();
  const paid = parseFloat(document.getElementById('ch_paid').value);
  const total = parseFloat(document.getElementById('ch_total').value);
  const notes = document.getElementById('ch_notes').value.trim();
  
  if (!name) { showToast('أدخل الاسم', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(paid) || paid < 0) { showToast('أدخل المدفوع', 'error'); return; }
  if (isNaN(total) || total <= 0) { showToast('أدخل الإجمالي', 'error'); return; }
  
  const user = await getOrCreateUser(name);
  if (!user) return;
  
  const newCheese = {
    transactionId: generateId('CH'),
    userId: user.userId,
    userName: user.name,
    batchNumber: batch,
    amountPaid: paid,
    totalAmount: total,
    notes: notes,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'Cheese', { data: newCheese });
  if (result.success) {
    state.cheese.push(newCheese);
    document.getElementById('ch_name').value = '';
    document.getElementById('ch_paid').value = '';
    document.getElementById('ch_total').value = '';
    document.getElementById('ch_notes').value = '';
    renderAll();
    const remaining = total - paid;
    showToast(`تم الحفظ. المتبقي: ${formatMoney(remaining)}`, remaining > 0 ? 'warning' : 'success');
    if (remaining > total * 0.5) {
      showToast(`⚠️ تنبيه: المتبقي أكبر من 50% من الإجمالي!`, 'warning', 5000);
    }
  }
}

function renderCheese() {
  const tbody = document.querySelector('#cheeseTable tbody');
  if (state.cheese.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد بيانات</td></tr>';
    return;
  }
  
  const sorted = [...state.cheese].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(c => {
    const paid = parseFloat(c.amountPaid) || 0;
    const total = parseFloat(c.totalAmount) || 0;
    const remaining = total - paid;
    const remClass = remaining > 0 ? 'remaining-positive' : remaining === 0 ? 'remaining-zero' : 'remaining-negative';
    const isAlert = total > 0 && remaining > total * 0.5;
    return `
      <tr ${isAlert ? 'style="background:rgba(239,68,68,0.08)"' : ''}>
        <td><strong>${escapeHtml(c.userName)}</strong></td>
        <td><code>${escapeHtml(c.batchNumber)}</code></td>
        <td>${formatMoney(paid)}</td>
        <td>${formatMoney(total)}</td>
        <td class="${remClass}">${formatMoney(remaining)}${isAlert ? ' ⚠️' : ''}</td>
        <td>${formatDate(c.createdAt)}</td>
        <td><button class="btn-icon" onclick="deleteTransaction('Cheese', '${c.transactionId}', 'cheese')" title="حذف">🗑️</button></td>
      </tr>
    `;
  }).join('');
}

// ====================================================
// الميزة 6: تفاصيل الجبنة
// ====================================================
async function addCheeseDetail() {
  const name = document.getElementById('chd_name').value.trim();
  const batch = document.getElementById('chd_batch').value.trim();
  const halves = parseInt(document.getElementById('chd_halves').value);
  const isPaid = document.getElementById('chd_paid').value;
  const method = document.getElementById('chd_method').value;
  
  if (!name) { showToast('أدخل الاسم', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(halves) || halves <= 0) { showToast('أدخل عدد الأنصاف', 'error'); return; }
  
  const matchingCheese = state.cheese.find(c => c.batchNumber === batch && c.userName === name);
  
  if (!matchingCheese) {
    showModal(
      '⚠️ دفعة غير موجودة',
      `<p>لا يوجد سجل في جدول الجبنة الرئيسي بالاسم "<strong>${escapeHtml(name)}</strong>" ورقم الدفعة "<strong>${escapeHtml(batch)}</strong>".</p>
       <p style="margin-top:12px;">هل تريد المتابعة على أي حال؟</p>`,
      async () => { await saveCheeseDetail(name, batch, halves, isPaid, method); },
      'متابعة'
    );
    return;
  }
  
  await saveCheeseDetail(name, batch, halves, isPaid, method);
}

async function saveCheeseDetail(name, batch, halves, isPaid, method) {
  const user = await getOrCreateUser(name);
  if (!user) return;
  const newDetail = {
    transactionId: generateId('CHD'),
    userId: user.userId,
    userName: user.name,
    batchNumber: batch,
    halvesCount: halves,
    isPaid: isPaid,
    paymentMethod: method,
    createdAt: nowISO()
  };
  
  const result = await callApi('add', 'CheeseDetails', { data: newDetail });
  if (result.success) {
    state.cheeseDetails.push(newDetail);
    document.getElementById('chd_name').value = '';
    document.getElementById('chd_batch').value = '';
    document.getElementById('chd_halves').value = '';
    renderAll();
    showToast(`تم تسجيل ${halves} نصف للدفعة ${batch}`, 'success');
  }
}

function renderCheeseDetails() {
  const tbody = document.querySelector('#cheeseDetailsTable tbody');
  if (state.cheeseDetails.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد بيانات</td></tr>';
    return;
  }
  const sorted = [...state.cheeseDetails].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(d => `
    <tr>
      <td><strong>${escapeHtml(d.userName)}</strong></td>
      <td><code>${escapeHtml(d.batchNumber)}</code></td>
      <td><strong>${formatNumber(d.halvesCount)}</strong></td>
      <td>${d.isPaid === 'yes' ? '<span style="color:var(--accent-primary)">✓ نعم</span>' : '<span style="color:var(--accent-warning)">✗ لا</span>'}</td>
      <td>${d.paymentMethod === 'electronic' ? '💳 إلكتروني' : '💵 يدوي'}</td>
      <td>${formatDate(d.createdAt)}</td>
      <td><button class="btn-icon" onclick="deleteTransaction('CheeseDetails', '${d.transactionId}', 'cheeseDetails')" title="حذف">🗑️</button></td>
    </tr>
  `).join('');
}

// ====================================================
// البحث
// ====================================================
function performSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const results = document.getElementById('searchResults');
  
  if (!query) {
    results.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:24px;">اكتب اسماً أو User ID للبحث</p>';
    return;
  }
  
  const matchedUsers = state.users.filter(u =>
    u.name.toLowerCase().includes(query) || u.userId.toLowerCase().includes(query)
  );
  
  if (matchedUsers.length === 0) {
    results.innerHTML = '<p style="color:var(--accent-warning); text-align:center; padding:24px;">لم يُعثر على أي زبون</p>';
    return;
  }
  
  let html = '';
  matchedUsers.forEach(user => {
    const userInstallments = state.installments.filter(i => i.userId === user.userId);
    const userTanksList = state.oilTanks.filter(t => t.userId === user.userId);
    const userCheese = state.cheese.filter(c => c.userId === user.userId);
    const { userTanks: tanksTotal, totalPaid, totalDue, remaining } = calculateRemaining(user.userId);
    const cashCount = userInstallments.filter(i => i.paymentMethod === 'manual').length;
    const electronicCount = userInstallments.filter(i => i.paymentMethod === 'electronic').length;
  
    html += `
      <div class="card">
        <h3 class="card-title">👤 ${escapeHtml(user.name)} 
          <code style="font-size:12px; color:var(--text-muted); font-weight:normal;">${escapeHtml(user.userId)}</code>
        </h3>
        <div class="summary-grid" style="margin-bottom:20px;">
          <div class="summary-item"><div class="label">عدد التنكات</div><div class="value">${formatNumber(tanksTotal)}</div></div>
          <div class="summary-item"><div class="label">إجمالي المستحق</div><div class="value">${formatMoney(totalDue)}</div></div>
          <div class="summary-item"><div class="label">المدفوع</div><div class="value" style="color:var(--accent-primary)">${formatMoney(totalPaid)}</div></div>
          <div class="summary-item"><div class="label">المتبقي</div><div class="value" style="color:${remaining > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">${formatMoney(remaining)}</div></div>
          <div class="summary-item"><div class="label">دفعات يدوية</div><div class="value">${cashCount}</div></div>
          <div class="summary-item"><div class="label">دفعات إلكترونية</div><div class="value">${electronicCount}</div></div>
        </div>
      
        ${userInstallments.length > 0 ? `
          <h4 style="margin:16px 0 8px;">💰 الأقساط (${userInstallments.length})</h4>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>المبلغ</th><th>الشهر</th><th>طريقة الدفع</th><th>التاريخ</th></tr></thead>
              <tbody>
                ${userInstallments.map(i => `
                  <tr><td>${formatMoney(i.amountPaid)}</td><td>${escapeHtml(i.monthPaid)}</td>
                      <td>${i.paymentMethod === 'electronic' ? '💳' : '💵'}</td><td>${formatDate(i.createdAt)}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      
        ${userTanksList.length > 0 ? `
          <h4 style="margin:16px 0 8px;">🛢️ التنكات (${userTanksList.length})</h4>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>الدفعة</th><th>العدد</th><th>التاريخ</th></tr></thead>
              <tbody>
                ${userTanksList.map(t => `
                  <tr><td><code>${escapeHtml(t.batchNumber)}</code></td><td>${formatNumber(t.tanksCount)}</td><td>${formatDate(t.createdAt)}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      
        ${userCheese.length > 0 ? `
          <h4 style="margin:16px 0 8px;">🧀 الجبنة (${userCheese.length})</h4>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>الدفعة</th><th>المدفوع</th><th>الإجمالي</th><th>المتبقي</th></tr></thead>
              <tbody>
                ${userCheese.map(c => {
                  const rem = (parseFloat(c.totalAmount) || 0) - (parseFloat(c.amountPaid) || 0);
                  return `<tr><td><code>${escapeHtml(c.batchNumber)}</code></td><td>${formatMoney(c.amountPaid)}</td>
                          <td>${formatMoney(c.totalAmount)}</td>
                          <td style="color:${rem > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">${formatMoney(rem)}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  });
  
  results.innerHTML = html;
}

// ====================================================
// تصدير CSV
// ====================================================
function exportToCSV(stateKey) {
  const data = state[stateKey];
  if (!data || data.length === 0) {
    showToast('لا توجد بيانات للتصدير', 'warning');
    return;
  }
  
  const headers = Object.keys(data[0]);
  let csv = '\uFEFF';
  csv += headers.join(',') + '\n';
  data.forEach(row => {
    const values = headers.map(h => {
      let val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csv += values.join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `${stateKey}_${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`تم تصدير ${data.length} سجل`, 'success');
}

// ====================================================
// التهيئة (Init)
// ====================================================
function init() {
  document.getElementById('tankPriceInput').value = state.tankPrice || '';
  document.getElementById('apiUrlInput').value = state.apiUrl;
  document.getElementById('apiKeyInput').value = state.apiKey;
  document.getElementById('cashTanksInput').value = state.cashTanks;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
    });
  });
  
  document.getElementById('addInstallmentBtn').addEventListener('click', addInstallment);
  document.getElementById('addTankBtn').addEventListener('click', addTank);
  document.getElementById('addPurchaseBtn').addEventListener('click', addPurchase);
  document.getElementById('addCheeseBtn').addEventListener('click', addCheese);
  document.getElementById('addCheeseDetailBtn').addEventListener('click', addCheeseDetail);
  document.getElementById('saveTankPriceBtn').addEventListener('click', saveTankPrice);
  document.getElementById('saveDeletePasswordBtn').addEventListener('click', saveDeletePassword);
  document.getElementById('saveApiSettingsBtn').addEventListener('click', saveApiSettings);
  document.getElementById('saveCashTanksBtn').addEventListener('click', saveCashTanks);
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  if (state.apiUrl && state.apiKey) {
    loadAllData();
  } else {
    showToast('يرجى ضبط إعدادات الاتصال من تبويبة "الإعدادات"', 'warning', 6000);
    setConnectionStatus('error');
  }
}

document.addEventListener('DOMContentLoaded', init);