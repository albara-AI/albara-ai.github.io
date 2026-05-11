// ====================================================
// نظام إدارة الزيت والجبنة - v2
// ====================================================

const state = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  apiKey: localStorage.getItem('apiKey') || '',
  deletePassword: localStorage.getItem('deletePassword') || '1234',
  installmentsCounter: parseInt(localStorage.getItem('installmentsCounter')) || 0,
  users: [],
  installments: [],
  oilTanks: [],
  oilPurchases: [],
  cheese: [],
  cheeseDetails: [],
  transfers: [],
};

// ====================================================
// ID Generators
// ====================================================
function generateUserId() {
  const existing = state.users.map(u => parseInt(u.userId)).filter(n => !isNaN(n));
  return existing.length > 0 ? String(Math.max(...existing) + 1) : '1001';
}

function generateTxId(prefix) {
  const num = String(Date.now()).slice(-6);
  return `${prefix}${num}`;
}

// ====================================================
// API
// ====================================================
async function callApi(action, sheet, extraParams = {}) {
  if (!state.apiUrl || !state.apiKey) {
    showToast('يرجى ضبط إعدادات الاتصال', 'warning');
    return { success: false };
  }
  setConnectionStatus('connecting');
  try {
    const body = { apiKey: state.apiKey, action, sheet, ...extraParams };
    const response = await fetch(state.apiUrl, {
      method: 'POST', mode: 'cors', redirect: 'follow',
      body: JSON.stringify(body)
    });
    const result = await response.json();
    setConnectionStatus(result.success ? 'connected' : 'error');
    return result;
  } catch (err) {
    setConnectionStatus('error');
    showToast('فشل الاتصال: ' + err.message, 'error');
    return { success: false };
  }
}

function setConnectionStatus(status) {
  const el = document.getElementById('connectionStatus');
  el.className = 'connection-status ' + status;
  const labels = { connecting: 'جاري الاتصال...', connected: 'متصل ✓', error: 'خطأ في الاتصال' };
  el.querySelector('.status-text').textContent = labels[status] || '';
}

// ====================================================
// Helpers
// ====================================================
function nowISO() { return new Date().toISOString(); }

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(n) {
  if (isNaN(n) || n == null) return '0 د.أ';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' د.أ';
}

function esc(t) {
  if (t == null) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}

function showToast(msg, type = 'success', dur = 3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, dur);
}

function showModal(title, bodyHtml, onConfirm, confirmText = 'تأكيد') {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalConfirm').textContent = confirmText;
  overlay.classList.add('active');
  const close = () => overlay.classList.remove('active');
  const newBtn = document.getElementById('modalConfirm').cloneNode(true);
  document.getElementById('modalConfirm').replaceWith(newBtn);
  newBtn.addEventListener('click', () => { onConfirm(); close(); });
  document.getElementById('modalCancel').onclick = close;
}

// ====================================================
// Users
// ====================================================
async function getOrCreateUser(nameOrId) {
  const q = String(nameOrId).trim();
  if (!q) return null;
  let user = state.users.find(u => u.userId === q || u.name === q);
  if (user) return user;
  const newUser = { userId: generateUserId(), name: q, createdAt: nowISO() };
  const result = await callApi('add', 'Users', { data: newUser });
  if (result.success) { state.users.push(newUser); refreshUsersList(); return newUser; }
  return null;
}

function refreshUsersList() {
  const dl = document.getElementById('usersList');
  dl.innerHTML = state.users.map(u => `<option value="${esc(u.name)}">[${u.userId}] ${esc(u.name)}</option>`).join('');
}

function resolveUser(nameOrId) {
  const q = String(nameOrId).trim();
  return state.users.find(u => u.userId === q || u.name === q) || null;
}

// ====================================================
// Stock calculation
// ====================================================
function getTotalPurchased() {
  return state.oilPurchases.reduce((s, p) => s + (parseInt(p.tanksCount) || 0), 0);
}

function getTotalSold() {
  return state.oilTanks.reduce((s, t) => s + (parseInt(t.tanksCount) || 0), 0);
}

function getStockRemaining() {
  return getTotalPurchased() - getTotalSold();
}

function getAvailableBatches() {
  return state.oilPurchases
    .sort((a, b) => (parseInt(a.batchNumber) || 0) - (parseInt(b.batchNumber) || 0))
    .map(p => ({ num: p.batchNumber, count: parseInt(p.tanksCount) || 0 }));
}

// ====================================================
// Load Data
// ====================================================
async function loadAllData() {
  showToast('جاري تحميل البيانات...', 'info');
  const map = [
    ['Users', 'users'], ['Installments', 'installments'],
    ['OilTanks', 'oilTanks'], ['OilPurchases', 'oilPurchases'],
    ['Cheese', 'cheese'], ['CheeseDetails', 'cheeseDetails'],
    ['Transfers', 'transfers']
  ];
  for (const [sheet, key] of map) {
    const r = await callApi('getAll', sheet);
    if (r.success) state[key] = r.data || [];
  }
  refreshUsersList();
  refreshBatchSelect();
  refreshCashTankSelect();
  renderAll();
  checkLatePayments();
  showToast('تم التحميل ✓', 'success');
}

function renderAll() {
  renderInstallments();
  renderTanks();
  renderPurchases();
  renderCheese();
  renderCheeseDetails();
  renderTransfers();
  updateGlobalStats();
}

function updateGlobalStats() {
  const rem = getStockRemaining();
  document.getElementById('totalTanksDisplay').textContent = rem;
  document.getElementById('totalReceivedDisplay').textContent = getTotalPurchased();
  document.getElementById('totalSoldDisplay').textContent = getTotalSold();
  document.getElementById('stockRemainingDisplay').textContent = rem;
}

// ====================================================
// Batch select (for tanks form)
// ====================================================
function refreshBatchSelect() {
  const sel = document.getElementById('tank_batch');
  const batches = getAvailableBatches();
  sel.innerHTML = '<option value="">اختر دفعة من المورد...</option>' +
    batches.map(b => `<option value="${esc(b.num)}">دفعة ${esc(b.num)} (${b.count} تنك)</option>`).join('');
}

// Cash tanks select (for installment cash payment)
function refreshCashTankSelect() {
  const sel = document.getElementById('inst_tank_ref');
  const unpaid = state.oilTanks.filter(t => t.tankType === 'cash' && t.cashPaid !== 'yes');
  sel.innerHTML = '<option value="">اختر التنك الكاش...</option>' +
    unpaid.map(t => `<option value="${esc(t.transactionId)}">#${esc(t.transactionId)} - ${esc(t.userName)} (${t.tanksCount} تنك)</option>`).join('');
}

function toggleInstallmentType() {
  const type = document.getElementById('inst_type').value;
  document.getElementById('inst_month_group').style.display = type === 'installment' ? '' : 'none';
  document.getElementById('inst_tank_ref_group').style.display = type === 'cash_payment' ? '' : 'none';
}

// ====================================================
// Delete
// ====================================================
function deleteTransaction(sheetName, transactionId, stateKey) {
  showModal('🗑️ تأكيد الحذف',
    `<p style="margin-bottom:12px">أدخل كلمة سر الحذف:</p>
     <input type="password" id="delPass" placeholder="كلمة السر"
      style="width:100%;padding:12px;background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;font-family:inherit">`,
    async () => {
      const pass = document.getElementById('delPass').value;
      if (pass !== state.deletePassword) { showToast('كلمة السر خاطئة', 'error'); return; }
      const r = await callApi('delete', sheetName, { transactionId });
      if (r.success) {
        state[stateKey] = state[stateKey].filter(x => x.transactionId !== transactionId);
        renderAll();
        showToast('تم الحذف', 'success');
      }
    }, '🗑️ احذف');
}

// ====================================================
// Remaining calc per user
// ====================================================
function calcRemaining(userId) {
  const userTanksList = state.oilTanks.filter(t => t.userId === userId);

  // ===== حسابات الكاش (منعزلة) =====
  const cashTanksList = userTanksList.filter(t => t.tankType === 'cash');
  const cashTanks = cashTanksList.reduce((s, t) => s + (parseInt(t.tanksCount) || 0), 0);
  const cashTotalDue = cashTanksList.reduce((s, t) =>
    s + ((parseInt(t.tanksCount) || 0) * (parseFloat(t.tankPrice) || 0)), 0);
  const cashPaid = state.installments
    .filter(i => i.userId === userId && i.payType === 'cash_payment')
    .reduce((s, i) => s + (parseFloat(i.amountPaid) || 0), 0);
  const cashTanksPaid = cashTotalDue > 0
    ? Math.floor(cashPaid / (cashTotalDue / cashTanks))
    : 0;
  const cashRemaining = cashTotalDue - cashPaid;

  // ===== حسابات الأقساط (منعزلة) =====
  const instTanksList = userTanksList.filter(t => t.tankType === 'installment');
  const installmentTanks = instTanksList.reduce((s, t) => s + (parseInt(t.tanksCount) || 0), 0);
  const instTotalDue = instTanksList.reduce((s, t) =>
    s + ((parseInt(t.tanksCount) || 0) * (parseFloat(t.tankPrice) || 0)), 0);
  const installmentsPaid = state.installments
    .filter(i => i.userId === userId && i.payType === 'installment')
    .reduce((s, i) => s + (parseFloat(i.amountPaid) || 0), 0);
  const instTanksPaid = instTotalDue > 0
    ? Math.floor(installmentsPaid / (instTotalDue / installmentTanks))
    : 0;
  const instRemaining = instTotalDue - installmentsPaid;

  // ===== إجماليات =====
  const tankCount = cashTanks + installmentTanks;
  const unpaidCashTanks = cashTanksList.filter(t => t.cashPaid !== 'yes').length;

  return {
    // كاش
    cashTanks, cashTotalDue, cashPaid, cashTanksPaid,
    cashRemaining, cashTanksRemaining: cashTanks - cashTanksPaid,
    // أقساط
    installmentTanks, instTotalDue, installmentsPaid, instTanksPaid,
    instRemaining, instTanksRemaining: installmentTanks - instTanksPaid,
    // إجماليات
    tankCount, unpaidCashTanks,
    totalDue: cashTotalDue + instTotalDue,
    totalPaid: cashPaid + installmentsPaid,
    remaining: cashRemaining + instRemaining
  };
}
// ====================================================
// Installments
// ====================================================
async function addInstallment() {
  const nameOrId = document.getElementById('inst_name').value.trim();
  const type = document.getElementById('inst_type').value;
  const amount = parseFloat(document.getElementById('inst_amount').value);
  const month = document.getElementById('inst_month').value;
  const tankRef = document.getElementById('inst_tank_ref').value;
  const method = document.getElementById('inst_method').value;
  const notes = document.getElementById('inst_notes').value.trim();

  if (!nameOrId) { showToast('أدخل الاسم أو ID', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
  if (type === 'installment' && !month) { showToast('اختر الشهر', 'error'); return; }
  if (type === 'cash_payment' && !tankRef) { showToast('اختر تنك الكاش', 'error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: generateTxId('IN'),
    userId: user.userId,
    userName: user.name,
    payType: type,
    amountPaid: amount,
    monthPaid: type === 'installment' ? month : '',
    tankRef: type === 'cash_payment' ? tankRef : '',
    paymentMethod: method,
    notes,
    createdAt: nowISO()
  };

  const r = await callApi('add', 'Installments', { data: rec });
  if (r.success) {
    state.installments.push(rec);

    // تحديث حالة تنك الكاش إلى مدفوع
    if (type === 'cash_payment' && tankRef) {
      const tank = state.oilTanks.find(t => t.transactionId === tankRef);
      if (tank) {
        tank.cashPaid = 'yes';
        await callApi('update', 'OilTanks', { transactionId: tankRef, data: { cashPaid: 'yes' } });
      }
      refreshCashTankSelect();
    }

    state.installmentsCounter++;
    localStorage.setItem('installmentsCounter', state.installmentsCounter);
    if (state.installmentsCounter % 50 === 0) showBackupReminder();

    document.getElementById('inst_name').value = '';
    document.getElementById('inst_amount').value = '';
    document.getElementById('inst_notes').value = '';

    renderAll();
    showToast('تم الحفظ ✓', 'success');
  }
}

function renderInstallments() {
  const tbody = document.querySelector('#installmentsTable tbody');
  if (!state.installments.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">لا توجد بيانات</td></tr>'; return;
  }
  const sorted = [...state.installments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(i => {
    const { remaining } = calcRemaining(i.userId);
    const remClass = remaining > 0 ? 'remaining-positive' : remaining === 0 ? 'remaining-zero' : 'remaining-negative';
    const typeLabel = i.payType === 'cash_payment' ? '💵 دفع كاش' : '📅 قسط شهري';
    const ref = i.payType === 'cash_payment' ? `#${esc(i.tankRef)}` : esc(i.monthPaid);
    return `<tr>
      <td><strong>${esc(i.userName)}</strong><br><small style="color:var(--text-muted)">${esc(i.userId)}</small></td>
      <td>${typeLabel}</td>
      <td>${formatMoney(i.amountPaid)}</td>
      <td>${ref}</td>
      <td class="${remClass}">${formatMoney(remaining)}</td>
      <td>${i.paymentMethod === 'electronic' ? '💳' : '💵'}</td>
      <td>${formatDate(i.createdAt)}</td>
      <td><button class="btn-icon" onclick="deleteTransaction('Installments','${i.transactionId}','installments')">🗑️</button></td>
    </tr>`;
  }).join('');
}

function showBackupReminder() {
  showModal('⚠️ تذكير نسخة احتياطية',
    `<p>وصلت لـ <strong style="color:var(--accent-primary)">${state.installmentsCounter}</strong> عملية. يُنصح بتصدير نسخة الآن.</p>`,
    () => exportToCSV('installments'), '📥 تصدير');
}

// ====================================================
// Tanks
// ====================================================
async function addTank() {
  const nameOrId = document.getElementById('tank_name').value.trim();
  const type = document.getElementById('tank_type').value;
  const batch = document.getElementById('tank_batch').value;
  const count = parseInt(document.getElementById('tank_count').value);
  const price = parseFloat(document.getElementById('tank_price').value);
  const notes = document.getElementById('tank_notes').value.trim();

  if (!nameOrId) { showToast('أدخل الاسم أو ID', 'error'); return; }
  if (!batch) { showToast('اختر الدفعة', 'error'); return; }
  if (isNaN(count) || count <= 0) { showToast('أدخل عدداً صحيحاً', 'error'); return; }
  if (isNaN(price) || price <= 0) { showToast('أدخل سعراً صحيحاً', 'error'); return; }

  // التحقق من المخزن
  const stock = getStockRemaining();
  if (count > stock) {
    showToast(`❌ لا يوجد في المخزن سوى ${stock} تنك. لا يمكن تسجيل ${count}`, 'error', 5000);
    return;
  }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: generateTxId('TK'),
    userId: user.userId,
    userName: user.name,
    tankType: type,
    batchNumber: batch,
    tanksCount: count,
    tankPrice: price,
    cashPaid: type === 'cash' ? 'no' : 'n/a',
    notes,
    createdAt: nowISO()
  };

  const r = await callApi('add', 'OilTanks', { data: rec });
  if (r.success) {
    state.oilTanks.push(rec);
    document.getElementById('tank_name').value = '';
    document.getElementById('tank_count').value = '';
    document.getElementById('tank_price').value = '';
    document.getElementById('tank_notes').value = '';
    refreshCashTankSelect();
    renderAll();
    showToast(`تم تسجيل ${count} تنك (${type === 'cash' ? 'كاش' : 'أقساط'}) ✓`, 'success');
  }
}

function renderTanks() {
  const tbody = document.querySelector('#tanksTable tbody');
  if (!state.oilTanks.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">لا توجد بيانات</td></tr>';
  } else {
    const sorted = [...state.oilTanks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tbody.innerHTML = sorted.map(t => {
      const typeLabel = t.tankType === 'cash'
        ? `<span style="color:var(--accent-gold)">💵 كاش</span>`
        : `<span style="color:var(--accent-secondary)">📅 أقساط</span>`;
      const cashStatus = t.tankType === 'cash'
        ? (t.cashPaid === 'yes'
          ? '<span style="color:var(--accent-primary)">✓ مدفوع</span>'
          : '<span style="color:var(--accent-danger)">✗ غير مدفوع</span>')
        : '-';
      return `<tr>
        <td><code>${esc(t.transactionId)}</code></td>
        <td><strong>${esc(t.userName)}</strong><br><small style="color:var(--text-muted)">${esc(t.userId)}</small></td>
        <td>${typeLabel}</td>
        <td>دفعة ${esc(t.batchNumber)}</td>
        <td><strong style="color:var(--accent-primary)">${t.tanksCount}</strong></td>
        <td>${formatMoney(t.tankPrice)}</td>
        <td>${cashStatus}</td>
        <td>${formatDate(t.createdAt)}</td>
        <td><button class="btn-icon" onclick="deleteTransaction('OilTanks','${t.transactionId}','oilTanks')">🗑️</button></td>
      </tr>`;
    }).join('');
  }
  renderBatchesSummary();
}

function renderBatchesSummary() {
  const container = document.getElementById('batchesSummary');
  const batches = {};
  state.oilTanks.forEach(t => {
    if (!batches[t.batchNumber]) batches[t.batchNumber] = { total: 0, cash: 0, inst: 0 };
    batches[t.batchNumber].total += parseInt(t.tanksCount) || 0;
    if (t.tankType === 'cash') batches[t.batchNumber].cash += parseInt(t.tanksCount) || 0;
    else batches[t.batchNumber].inst += parseInt(t.tanksCount) || 0;
  });
  const entries = Object.entries(batches);
  if (!entries.length) { container.innerHTML = '<p style="color:var(--text-muted)">لا توجد دفعات</p>'; return; }
  container.innerHTML = entries.map(([b, v]) => `
    <div class="batch-card">
      <div class="batch-number">دفعة ${esc(b)}</div>
      <div class="batch-total">${v.total} تنك</div>
      <div style="font-size:12px;margin-top:6px;color:var(--text-secondary)">
        أقساط: ${v.inst} | كاش: ${v.cash}
      </div>
    </div>`).join('');
}

// ====================================================
// Purchases
// ====================================================
async function addPurchase() {
  const supplier = document.getElementById('pur_supplier').value.trim();
  const batch = document.getElementById('pur_batch').value.trim();
  const count = parseInt(document.getElementById('pur_count').value);
  const notes = document.getElementById('pur_notes').value.trim();

  if (!supplier) { showToast('أدخل اسم المورد', 'error'); return; }
  if (!batch || isNaN(parseInt(batch))) { showToast('أدخل رقم دفعة صحيح', 'error'); return; }
  if (isNaN(count) || count <= 0) { showToast('أدخل عدداً صحيحاً', 'error'); return; }

  // لا تكرار رقم الدفعة
  if (state.oilPurchases.find(p => String(p.batchNumber) === String(batch))) {
    showToast(`❌ دفعة رقم ${batch} موجودة مسبقاً`, 'error'); return;
  }

  const rec = {
    transactionId: generateTxId('PU'),
    supplierName: supplier,
    batchNumber: batch,
    tanksCount: count,
    notes,
    createdAt: nowISO()
  };

  const r = await callApi('add', 'OilPurchases', { data: rec });
  if (r.success) {
    state.oilPurchases.push(rec);
    document.getElementById('pur_supplier').value = '';
    document.getElementById('pur_batch').value = '';
    document.getElementById('pur_count').value = '';
    document.getElementById('pur_notes').value = '';
    refreshBatchSelect();
    renderAll();
    showToast(`تم تسجيل دفعة ${batch} (${count} تنك) ✓`, 'success');
  }
}

function renderPurchases() {
  const tbody = document.querySelector('#purchasesTable tbody');
  if (!state.oilPurchases.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">لا توجد بيانات</td></tr>';
  } else {
    const sorted = [...state.oilPurchases].sort((a, b) => (parseInt(a.batchNumber) || 0) - (parseInt(b.batchNumber) || 0));
    tbody.innerHTML = sorted.map(p => `<tr>
      <td><strong>دفعة ${esc(p.batchNumber)}</strong></td>
      <td>${esc(p.supplierName)}</td>
      <td><strong style="color:var(--accent-primary)">${p.tanksCount}</strong></td>
      <td>${formatDate(p.createdAt)}</td>
      <td><button class="btn-icon" onclick="deleteTransaction('OilPurchases','${p.transactionId}','oilPurchases')">🗑️</button></td>
    </tr>`).join('');
  }
  renderMatchingReport();
}

function renderMatchingReport() {
  const container = document.getElementById('matchingReport');
  const byBatch = {};
  state.oilPurchases.forEach(p => {
    byBatch[p.batchNumber] = { purchased: parseInt(p.tanksCount) || 0, sold: 0, cash: 0, inst: 0 };
  });
  state.oilTanks.forEach(t => {
    if (!byBatch[t.batchNumber]) byBatch[t.batchNumber] = { purchased: 0, sold: 0, cash: 0, inst: 0 };
    byBatch[t.batchNumber].sold += parseInt(t.tanksCount) || 0;
    if (t.tankType === 'cash') byBatch[t.batchNumber].cash += parseInt(t.tanksCount) || 0;
    else byBatch[t.batchNumber].inst += parseInt(t.tanksCount) || 0;
  });

  const totalP = Object.values(byBatch).reduce((s, v) => s + v.purchased, 0);
  const totalS = Object.values(byBatch).reduce((s, v) => s + v.sold, 0);
  const totalC = Object.values(byBatch).reduce((s, v) => s + v.cash, 0);
  const totalI = Object.values(byBatch).reduce((s, v) => s + v.inst, 0);
  const diff = totalP - totalS;

  let html = `
    <div style="background:var(--bg-secondary);padding:16px;border-radius:12px;margin-bottom:16px">
      <h4 style="margin-bottom:12px;color:var(--accent-primary)">📊 الإجمالي الكلي</h4>
      <div class="match-row ${diff === 0 ? 'match-ok' : diff > 0 ? 'match-low' : 'match-high'}">
        <div><strong>الإجمالي</strong></div>
        <div>مُشترى: <strong>${totalP}</strong></div>
        <div>مُباع: <strong>${totalS}</strong> (كاش: ${totalC} | أقساط: ${totalI})</div>
        <div class="match-status ${diff === 0 ? 'ok' : diff > 0 ? 'low' : 'high'}">
          ${diff === 0 ? '✅ متطابق' : diff > 0 ? `⚠️ متبقي ${diff}` : `🔴 زيادة ${Math.abs(diff)}`}
        </div>
      </div>
    </div>
    <h4 style="margin-bottom:12px">📋 تفصيل كل دفعة</h4>`;

  Object.entries(byBatch).sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0)).forEach(([batch, v]) => {
    const d = v.purchased - v.sold;
    const cls = d === 0 ? 'ok' : d > 0 ? 'low' : 'high';
    const rowCls = d === 0 ? 'match-ok' : d > 0 ? 'match-low' : 'match-high';
    html += `<div class="match-row ${rowCls}">
      <div><strong>دفعة ${esc(batch)}</strong></div>
      <div>مُشترى: <strong>${v.purchased}</strong></div>
      <div>مُباع: <strong>${v.sold}</strong><br><small>كاش: ${v.cash} | أقساط: ${v.inst}</small></div>
      <div class="match-status ${cls}">
        ${d === 0 ? '✅ متطابق' : d > 0 ? `⚠️ نقص ${d}` : `🔴 زيادة ${Math.abs(d)}`}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

// ====================================================
// Cheese
// ====================================================
async function addCheese() {
  const nameOrId = document.getElementById('ch_name').value.trim();
  const batch = document.getElementById('ch_batch').value.trim();
  const paid = parseFloat(document.getElementById('ch_paid').value);
  const total = parseFloat(document.getElementById('ch_total').value);
  const notes = document.getElementById('ch_notes').value.trim();

  if (!nameOrId) { showToast('أدخل الاسم أو ID', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(paid) || paid < 0) { showToast('أدخل المدفوع', 'error'); return; }
  if (isNaN(total) || total <= 0) { showToast('أدخل الإجمالي', 'error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: generateTxId('CH'),
    userId: user.userId, userName: user.name,
    batchNumber: batch, amountPaid: paid, totalAmount: total, notes, createdAt: nowISO()
  };
  const r = await callApi('add', 'Cheese', { data: rec });
  if (r.success) {
    state.cheese.push(rec);
    document.getElementById('ch_name').value = '';
    document.getElementById('ch_paid').value = '';
    document.getElementById('ch_total').value = '';
    renderAll();
    const rem = total - paid;
    showToast(`تم الحفظ. متبقي: ${formatMoney(rem)}`, rem > total * 0.5 ? 'warning' : 'success');
    if (rem > total * 0.5) showToast('⚠️ المتبقي أكبر من 50%!', 'warning', 5000);
  }
}

function renderCheese() {
  const tbody = document.querySelector('#cheeseTable tbody');
  if (!state.cheese.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد بيانات</td></tr>'; return; }
  const sorted = [...state.cheese].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(c => {
    const rem = (parseFloat(c.totalAmount) || 0) - (parseFloat(c.amountPaid) || 0);
    const alert = rem > (parseFloat(c.totalAmount) || 0) * 0.5;
    return `<tr ${alert ? 'style="background:rgba(239,68,68,0.08)"' : ''}>
      <td><strong>${esc(c.userName)}</strong></td>
      <td><code>${esc(c.batchNumber)}</code></td>
      <td>${formatMoney(c.amountPaid)}</td>
      <td>${formatMoney(c.totalAmount)}</td>
      <td class="${rem > 0 ? 'remaining-positive' : 'remaining-zero'}">${formatMoney(rem)}${alert ? ' ⚠️' : ''}</td>
      <td>${formatDate(c.createdAt)}</td>
      <td><button class="btn-icon" onclick="deleteTransaction('Cheese','${c.transactionId}','cheese')">🗑️</button></td>
    </tr>`;
  }).join('');
}

// ====================================================
// Cheese Details
// ====================================================
async function addCheeseDetail() {
  const nameOrId = document.getElementById('chd_name').value.trim();
  const batch = document.getElementById('chd_batch').value.trim();
  const halves = parseInt(document.getElementById('chd_halves').value);
  const isPaid = document.getElementById('chd_paid').value;
  const method = document.getElementById('chd_method').value;

  if (!nameOrId) { showToast('أدخل الاسم أو ID', 'error'); return; }
  if (!batch) { showToast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(halves) || halves <= 0) { showToast('أدخل عدد أنصاف صحيح', 'error'); return; }

  const match = state.cheese.find(c => c.batchNumber === batch && c.userName === nameOrId);
  if (!match) {
    showModal('⚠️ لا يوجد سجل مطابق',
      `<p>لا يوجد في جدول الجبنة سجل بالاسم "<strong>${esc(nameOrId)}</strong>" والدفعة "<strong>${esc(batch)}</strong>". هل تكمل؟</p>`,
      async () => { await saveCheeseDetail(nameOrId, batch, halves, isPaid, method); }, 'متابعة');
    return;
  }
  await saveCheeseDetail(nameOrId, batch, halves, isPaid, method);
}

async function saveCheeseDetail(nameOrId, batch, halves, isPaid, method) {
  const user = await getOrCreateUser(nameOrId);
  if (!user) return;
  const rec = {
    transactionId: generateTxId('CD'),
    userId: user.userId, userName: user.name,
    batchNumber: batch, halvesCount: halves, isPaid, paymentMethod: method, createdAt: nowISO()
  };
  const r = await callApi('add', 'CheeseDetails', { data: rec });
  if (r.success) {
    state.cheeseDetails.push(rec);
    document.getElementById('chd_name').value = '';
    document.getElementById('chd_batch').value = '';
    document.getElementById('chd_halves').value = '';
    renderAll();
    showToast(`تم تسجيل ${halves} نصف ✓`, 'success');
  }
}

function renderCheeseDetails() {
  const tbody = document.querySelector('#cheeseDetailsTable tbody');
  if (!state.cheeseDetails.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد بيانات</td></tr>'; return; }
  const sorted = [...state.cheeseDetails].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(d => `<tr>
    <td><strong>${esc(d.userName)}</strong></td>
    <td><code>${esc(d.batchNumber)}</code></td>
    <td>${d.halvesCount}</td>
    <td>${d.isPaid === 'yes' ? '<span style="color:var(--accent-primary)">✓</span>' : '<span style="color:var(--accent-warning)">✗</span>'}</td>
    <td>${d.paymentMethod === 'electronic' ? '💳' : '💵'}</td>
    <td>${formatDate(d.createdAt)}</td>
    <td><button class="btn-icon" onclick="deleteTransaction('CheeseDetails','${d.transactionId}','cheeseDetails')">🗑️</button></td>
  </tr>`).join('');
}

// ====================================================
// Transfers
// ====================================================
async function addTransfer() {
  const desc = document.getElementById('tr_desc').value.trim();
  const amount = parseFloat(document.getElementById('tr_amount').value);
  const type = document.getElementById('tr_type').value;
  const method = document.getElementById('tr_method').value;
  const notes = document.getElementById('tr_notes').value.trim();

  if (!desc) { showToast('أدخل الوصف', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }

  const rec = {
    transactionId: generateTxId('TR'),
    description: desc, amount, transferType: type,
    paymentMethod: method, notes, createdAt: nowISO()
  };
  const r = await callApi('add', 'Transfers', { data: rec });
  if (r.success) {
    state.transfers.push(rec);
    document.getElementById('tr_desc').value = '';
    document.getElementById('tr_amount').value = '';
    document.getElementById('tr_notes').value = '';
    renderTransfers();
    showToast('تم حفظ التحويل ✓', 'success');
  }
}

function renderTransfers() {
  const tbody = document.querySelector('#transfersTable tbody');
  if (!state.transfers.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">لا توجد تحويلات</td></tr>'; return; }
  const sorted = [...state.transfers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  tbody.innerHTML = sorted.map(t => `<tr>
    <td><code>${esc(t.transactionId)}</code></td>
    <td>${esc(t.description)}</td>
    <td><strong style="color:${t.transferType === 'in' ? 'var(--accent-primary)' : 'var(--accent-danger)'}">${formatMoney(t.amount)}</strong></td>
    <td>${t.transferType === 'in' ? '📥 وارد' : '📤 صادر'}</td>
    <td>${t.paymentMethod === 'electronic' ? '💳 إلكتروني' : '💵 يدوي'}</td>
    <td>${esc(t.notes)}</td>
    <td>${formatDate(t.createdAt)}</td>
    <td><button class="btn-icon" onclick="deleteTransaction('Transfers','${t.transactionId}','transfers')">🗑️</button></td>
  </tr>`).join('');
}

// ====================================================
// Search
// ====================================================
function performSearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const res = document.getElementById('searchResults');
  if (!q) { res.innerHTML = ''; return; }

  const matched = state.users.filter(u =>
    u.name.toLowerCase().includes(q) || u.userId.includes(q)
  );

  if (!matched.length) { res.innerHTML = '<p style="color:var(--accent-warning);padding:24px;text-align:center">لم يُعثر على زبون</p>'; return; }

  res.innerHTML = matched.map(user => {
    const { totalDue, totalPaid, remaining, tankCount, installmentTanks, cashTanks, unpaidCashTanks } = calcRemaining(user.userId);
    const uInst = state.installments.filter(i => i.userId === user.userId);
    const uTanks = state.oilTanks.filter(t => t.userId === user.userId);
    const uCheese = state.cheese.filter(c => c.userId === user.userId);

    return `<div class="card">
      <h3 class="card-title">👤 ${esc(user.name)} <code style="font-size:12px;color:var(--text-muted);font-weight:normal">ID: ${esc(user.userId)}</code></h3>
      <div class="summary-grid" style="margin-bottom:20px">
        <div class="summary-item"><div class="label">إجمالي التنكات</div><div class="value">${tankCount}</div></div>
        <div class="summary-item"><div class="label">تنكات أقساط</div><div class="value" style="color:var(--accent-secondary)">${installmentTanks}</div></div>
        <div class="summary-item"><div class="label">تنكات كاش</div><div class="value" style="color:var(--accent-gold)">${cashTanks}</div></div>
        <div class="summary-item"><div class="label">كاش غير مدفوع</div><div class="value" style="color:${unpaidCashTanks > 0 ? 'var(--accent-danger)' : 'var(--accent-primary)'}">${unpaidCashTanks} تنك</div></div>
        <div class="summary-item" style="border-top:2px solid var(--accent-gold)">
          <div class="label">💵 كاش - المستحق</div><div class="value">${formatMoney(cashTotalDue)}</div>
        </div>
        <div class="summary-item">
          <div class="label">💵 كاش - المدفوع</div>
          <div class="value" style="color:var(--accent-primary)">${formatMoney(cashPaid)}</div>
        </div>
        <div class="summary-item">
          <div class="label">💵 كاش - المتبقي</div>
          <div class="value" style="color:${cashRemaining > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">
            ${formatMoney(cashRemaining)}
          </div>
        </div>
        <div class="summary-item">
          <div class="label">💵 تنكات كاش مدفوعة</div>
          <div class="value">${cashTanksPaid} / ${cashTanks}</div>
        </div>
        <div class="summary-item" style="border-top:2px solid var(--accent-secondary)">
          <div class="label">📅 أقساط - المستحق</div><div class="value">${formatMoney(instTotalDue)}</div>
        </div>
        <div class="summary-item">
          <div class="label">📅 أقساط - المدفوع</div>
          <div class="value" style="color:var(--accent-primary)">${formatMoney(installmentsPaid)}</div>
        </div>
        <div class="summary-item">
          <div class="label">📅 أقساط - المتبقي</div>
          <div class="value" style="color:${instRemaining > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">
            ${formatMoney(instRemaining)}
          </div>
        </div>
        <div class="summary-item">
          <div class="label">📅 تنكات أقساط مدفوعة</div>
          <div class="value">${instTanksPaid} / ${installmentTanks}</div>
        </div>
        ${unpaidCashTanks > 0 ? `<div class="summary-item" style="border:1px solid var(--accent-danger)"><div class="label">⚠️ تنبيه</div><div class="value" style="font-size:14px;color:var(--accent-danger)">يوجد ${unpaidCashTanks} تنك كاش لم يُدفع</div></div>` : ''}
      </div>

      ${uTanks.length ? `
        <h4 style="margin:16px 0 8px">🛢️ التنكات</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>النوع</th><th>الدفعة</th><th>العدد</th><th>السعر</th><th>حالة الكاش</th><th>التاريخ</th></tr></thead>
            <tbody>${uTanks.map(t => `<tr>
              <td>${t.tankType === 'cash' ? '💵 كاش' : '📅 أقساط'}</td>
              <td>دفعة ${esc(t.batchNumber)}</td>
              <td>${t.tanksCount}</td>
              <td>${formatMoney(t.tankPrice)}</td>
              <td>${t.tankType === 'cash' ? (t.cashPaid === 'yes' ? '<span style="color:var(--accent-primary)">✓ مدفوع</span>' : '<span style="color:var(--accent-danger)">✗ غير مدفوع</span>') : '-'}</td>
              <td>${formatDate(t.createdAt)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}

      ${uInst.length ? `
        <h4 style="margin:16px 0 8px">💰 المدفوعات (${uInst.length})</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>النوع</th><th>المبلغ</th><th>الشهر/مرجع</th><th>طريقة</th><th>التاريخ</th></tr></thead>
            <tbody>${uInst.map(i => `<tr>
              <td>${i.payType === 'cash_payment' ? '💵 كاش' : '📅 قسط'}</td>
              <td>${formatMoney(i.amountPaid)}</td>
              <td>${i.payType === 'cash_payment' ? `#${esc(i.tankRef)}` : esc(i.monthPaid)}</td>
              <td>${i.paymentMethod === 'electronic' ? '💳' : '💵'}</td>
              <td>${formatDate(i.createdAt)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}

      ${uCheese.length ? `
        <h4 style="margin:16px 0 8px">🧀 الجبنة (${uCheese.length})</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>الدفعة</th><th>المدفوع</th><th>الإجمالي</th><th>المتبقي</th></tr></thead>
            <tbody>${uCheese.map(c => {
              const rem = (parseFloat(c.totalAmount) || 0) - (parseFloat(c.amountPaid) || 0);
              return `<tr><td><code>${esc(c.batchNumber)}</code></td><td>${formatMoney(c.amountPaid)}</td><td>${formatMoney(c.totalAmount)}</td><td style="color:${rem > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)'}">${formatMoney(rem)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : ''}
    </div>`;
  }).join('');
}

// ====================================================
// Late Payments Check
// ====================================================
function checkLatePayments() {
  const today = new Date();
  const day = today.getDate();
  if (day < 25) return; // تحقق فقط من اليوم 25 فما فوق

  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const late = [];

  state.users.forEach(user => {
    const paidThisMonth = state.installments.some(i =>
      i.userId === user.userId &&
      i.payType === 'installment' &&
      i.monthPaid === currentMonth
    );
    const hasTanks = state.oilTanks.some(t => t.userId === user.userId && t.tankType === 'installment');
    if (hasTanks && !paidThisMonth) late.push(user.name);
  });

  const bar = document.getElementById('latePaymentsBar');
  const list = document.getElementById('latePaymentsList');

  if (late.length) {
    bar.style.display = 'flex';
    list.textContent = late.join(' | ');
  } else {
    bar.style.display = 'none';
  }
}

// ====================================================
// Export CSV
// ====================================================
function exportToCSV(key) {
  const data = state[key];
  if (!data || !data.length) { showToast('لا توجد بيانات', 'warning'); return; }
  const headers = Object.keys(data[0]);
  let csv = '\uFEFF' + headers.join(',') + '\n';
  data.forEach(row => {
    csv += headers.map(h => {
      let v = row[h] != null ? String(row[h]) : '';
      if (v.includes(',') || v.includes('"') || v.includes('\n')) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    }).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`تم تصدير ${data.length} سجل`, 'success');
}

// ====================================================
// Settings
// ====================================================
function saveDeletePassword() {
  const v = document.getElementById('deletePasswordInput').value;
  if (v.length < 4) { showToast('4 أحرف على الأقل', 'error'); return; }
  state.deletePassword = v;
  localStorage.setItem('deletePassword', v);
  document.getElementById('deletePasswordInput').value = '';
  showToast('تم حفظ كلمة السر', 'success');
}

function saveApiSettings() {
  const url = document.getElementById('apiUrlInput').value.trim();
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!url || !key) { showToast('أدخل الرابط والمفتاح', 'error'); return; }
  state.apiUrl = url; state.apiKey = key;
  localStorage.setItem('apiUrl', url); localStorage.setItem('apiKey', key);
  showToast('تم الحفظ. جاري التحميل...', 'success');
  setTimeout(loadAllData, 500);
}

// ====================================================
// Init
// ====================================================
function init() {
  document.getElementById('apiUrlInput').value = state.apiUrl;
  document.getElementById('apiKeyInput').value = state.apiKey;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('addInstallmentBtn').addEventListener('click', addInstallment);
  document.getElementById('addTankBtn').addEventListener('click', addTank);
  document.getElementById('addPurchaseBtn').addEventListener('click', addPurchase);
  document.getElementById('addCheeseBtn').addEventListener('click', addCheese);
  document.getElementById('addCheeseDetailBtn').addEventListener('click', addCheeseDetail);
  document.getElementById('addTransferBtn').addEventListener('click', addTransfer);
  document.getElementById('saveDeletePasswordBtn').addEventListener('click', saveDeletePassword);
  document.getElementById('saveApiSettingsBtn').addEventListener('click', saveApiSettings);
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('searchInput').addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });

  if (state.apiUrl && state.apiKey) loadAllData();
  else { showToast('يرجى ضبط إعدادات الاتصال من تبويبة الإعدادات', 'warning', 6000); setConnectionStatus('error'); }
}

document.addEventListener('DOMContentLoaded', init);
