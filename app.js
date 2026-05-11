// ====================================================
// نظام إدارة الزيت والجبنة
// واجهة: index_v4.html | قاعدة البيانات: Google Sheets
// ====================================================

const state = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  apiKey: localStorage.getItem('apiKey') || '',
  deletePassword: localStorage.getItem('deletePassword') || '1234',
  opCounter: parseInt(localStorage.getItem('opCounter')) || 0,

  users: [],
  tankRecords: [],       // OilTanks في Sheets
  installments: [],      // Installments في Sheets
  cashPayments: [],      // CashPayments في Sheets
  purchases: [],         // OilPurchases في Sheets
  cheese: [],            // Cheese في Sheets
  otherTransfers: [],    // Transfers في Sheets
  bankMessages: [],      // BankMessages في Sheets
};

// ====================================================
// API - Google Sheets
// ====================================================
async function callApi(action, sheet, extraParams = {}) {
  if (!state.apiUrl || !state.apiKey) {
    toast('يرجى ضبط إعدادات الاتصال من تبويبة الإعدادات', 'warning');
    return { success: false };
  }
  try {
    const body = { apiKey: state.apiKey, action, sheet, ...extraParams };
    const response = await fetch(state.apiUrl, {
      method: 'POST', mode: 'cors', redirect: 'follow',
      body: JSON.stringify(body)
    });
    const result = await response.json();
    return result;
  } catch (err) {
    toast('فشل الاتصال: ' + err.message, 'error');
    return { success: false };
  }
}

// ====================================================
// تحميل كل البيانات من Sheets
// ====================================================
async function loadAllData() {
  toast('جاري تحميل البيانات...', 'info');

  const map = [
    ['Users',        'users'],
    ['OilTanks',     'tankRecords'],
    ['Installments', 'installments'],
    ['CashPayments', 'cashPayments'],
    ['OilPurchases', 'purchases'],
    ['Cheese',       'cheese'],
    ['Transfers',    'otherTransfers'],
    ['BankMessages', 'bankMessages'],
  ];

  for (const [sheet, key] of map) {
    const r = await callApi('getAll', sheet);
    if (r.success) state[key] = r.data || [];
  }

  refreshUsersDL();
  refreshBatchDropdown();
  renderAll();
  checkLatePayments();
  toast('تم التحميل ✓', 'success');
}

// ====================================================
// ID Generators
// ====================================================
function randChars() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return c[Math.floor(Math.random() * c.length)] + c[Math.floor(Math.random() * c.length)];
}
function genUserId() {
  const nums = String(1000 + state.users.length + Math.floor(Math.random() * 9));
  return nums + randChars();
}
function genTxId(prefix) {
  const nums = String(1000 + Math.floor(Math.random() * 9000));
  return (prefix || 'TX') + '-' + nums + randChars();
}
function nowISO() { return new Date().toISOString(); }

// ====================================================
// Helpers
// ====================================================
function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtMoney(n) {
  if (isNaN(n) || n == null) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function esc(t) {
  if (t == null) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}

// ====================================================
// Toast
// ====================================================
function toast(msg, type) {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(16px)';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ====================================================
// Modal
// ====================================================
function showModal(title, body, onConfirm, confirmLabel) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalConfirm').textContent = confirmLabel || 'تأكيد';
  document.getElementById('modalOverlay').classList.add('active');
  const btn = document.getElementById('modalConfirm').cloneNode(true);
  document.getElementById('modalConfirm').replaceWith(btn);
  btn.addEventListener('click', () => { onConfirm(); closeModal(); });
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

// ====================================================
// Users
// ====================================================
async function getOrCreateUser(nameOrId) {
  const q = String(nameOrId).trim();
  if (!q) return null;
  let u = state.users.find(x => x.id === q || x.name === q);
  if (!u) {
    u = { id: genUserId(), name: q, cashPrice: 0, installmentPrice: 0, createdAt: nowISO() };
    const r = await callApi('add', 'Users', { data: u });
    if (r.success) {
      state.users.push(u);
      refreshUsersDL();
    } else {
      toast('فشل إضافة المستخدم', 'error');
      return null;
    }
  }
  return u;
}

function findUser(nameOrId) {
  const q = String(nameOrId || '').trim();
  return state.users.find(x => x.id === q || x.name === q) || null;
}

function refreshUsersDL() {
  const dl = document.getElementById('usersDL');
  if (!dl) return;
  dl.innerHTML = state.users.map(u =>
    `<option value="${esc(u.name)}">[${esc(u.id)}]</option>`
  ).join('');
}

function fillUserPrices(prefix) {
  const u = findUser(document.getElementById(prefix + '_nameId').value);
  if (!u) return;
  const cp = document.getElementById(prefix + '_cashPrice');
  const ip = document.getElementById(prefix + '_instPrice');
  if (cp && !cp.value) cp.value = u.cashPrice || '';
  if (ip && !ip.value) ip.value = u.installmentPrice || '';
}

// ====================================================
// Inventory
// ====================================================
function getTotalPurchased() {
  return state.purchases.reduce((s, b) => s + (parseInt(b.count) || 0), 0);
}
function getTotalDistributed() {
  return state.tankRecords.reduce((s, r) => s + (parseInt(r.cash) || 0) + (parseInt(r.inst) || 0), 0);
}
function getStock() { return getTotalPurchased() - getTotalDistributed(); }

function refreshBatchDropdown() {
  const sel = document.getElementById('tk_batch');
  if (!sel) return;
  const batches = [...state.purchases].sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0));
  sel.innerHTML = '<option value="">-- اختر دفعة --</option>' +
    batches.map(b => `<option value="${esc(b.num)}">دفعة ${esc(b.num)} (${b.count} تنك)</option>`).join('');
}

// ====================================================
// CALC CASH (مستقل تماماً)
// ====================================================
function calcCash(userId) {
  const userTanks = state.tankRecords.filter(r => r.userId === userId);
  const totalCashTanks = userTanks.reduce((s, r) => s + (parseInt(r.cash) || 0), 0);
  const totalCashDue = userTanks.reduce((s, r) =>
    s + ((parseInt(r.cash) || 0) * (parseFloat(r.cashPrice) || 0)), 0);
  const avgCashPrice = totalCashTanks > 0 ? totalCashDue / totalCashTanks : 0;
  const totalCashPaid = state.cashPayments
    .filter(t => t.userId === userId)
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const cashTanksPaid = avgCashPrice > 0 ? Math.floor(totalCashPaid / avgCashPrice) : 0;
  const cashTanksRemaining = Math.max(0, totalCashTanks - cashTanksPaid);
  const cashMoneyRemaining = totalCashDue - totalCashPaid;
  return { totalCashTanks, avgCashPrice, totalCashDue, totalCashPaid, cashTanksPaid, cashTanksRemaining, cashMoneyRemaining };
}

// ====================================================
// CALC INSTALLMENTS (مستقل تماماً)
// ====================================================
function calcInstallments(userId) {
  const userTanks = state.tankRecords.filter(r => r.userId === userId);
  const totalInstTanks = userTanks.reduce((s, r) => s + (parseInt(r.inst) || 0), 0);
  const totalInstDue = userTanks.reduce((s, r) =>
    s + ((parseInt(r.inst) || 0) * (parseFloat(r.instPrice) || 0)), 0);
  const avgInstPrice = totalInstTanks > 0 ? totalInstDue / totalInstTanks : 0;
  const totalInstPaid = state.installments
    .filter(t => t.userId === userId)
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const instTanksPaid = avgInstPrice > 0 ? Math.floor(totalInstPaid / avgInstPrice) : 0;
  const instTanksRemaining = Math.max(0, totalInstTanks - instTanksPaid);
  const instMoneyRemaining = totalInstDue - totalInstPaid;
  return { totalInstTanks, avgInstPrice, totalInstDue, totalInstPaid, instTanksPaid, instTanksRemaining, instMoneyRemaining };
}

// ====================================================
// ADD TANK RECORD
// ====================================================
async function addTankRecord() {
  const nameOrId  = document.getElementById('tk_nameId').value.trim();
  const batch     = document.getElementById('tk_batch').value;
  const cashCount = parseInt(document.getElementById('tk_cash').value) || 0;
  const cashPrice = parseFloat(document.getElementById('tk_cashPrice').value) || 0;
  const instCount = parseInt(document.getElementById('tk_inst').value) || 0;
  const instPrice = parseFloat(document.getElementById('tk_instPrice').value) || 0;
  const notes     = document.getElementById('tk_notes').value.trim();

  if (!nameOrId)                           { toast('أدخل الاسم أو ID', 'error'); return; }
  if (!batch)                              { toast('اختر الدفعة', 'error'); return; }
  if (cashCount + instCount <= 0)          { toast('أدخل عدد تنكات صحيح', 'error'); return; }
  if (cashCount > 0 && cashPrice <= 0)    { toast('أدخل سعر تنك الكاش', 'error'); return; }
  if (instCount > 0 && instPrice <= 0)    { toast('أدخل سعر تنك الأقساط', 'error'); return; }

  const total = cashCount + instCount;
  const stock = getStock();
  if (total > stock) {
    toast(`❌ المخزن يحتوي فقط ${stock} تنك — لا يمكن تسجيل ${total}`, 'error');
    return;
  }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  if (cashPrice > 0)  user.cashPrice = cashPrice;
  if (instPrice > 0)  user.installmentPrice = instPrice;

  const rec = {
    id: genTxId('TK'),
    userId: user.id, userName: user.name,
    batch, cash: cashCount, cashPrice,
    inst: instCount, instPrice,
    notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'OilTanks', { data: rec });
  if (r.success) {
    state.tankRecords.push(rec);
    incCounter();
    document.getElementById('tk_nameId').value   = '';
    document.getElementById('tk_cash').value     = '0';
    document.getElementById('tk_cashPrice').value = '';
    document.getElementById('tk_inst').value     = '0';
    document.getElementById('tk_instPrice').value = '';
    document.getElementById('tk_notes').value    = '';
    renderAll();
    toast(`تم تسجيل ${total} تنك ✓`, 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD INSTALLMENT
// ====================================================
async function addInstallment() {
  const nameOrId = document.getElementById('inst_nameId').value.trim();
  const amount   = parseFloat(document.getElementById('inst_amount').value);
  const month    = document.getElementById('inst_month').value;
  const method   = document.getElementById('inst_method').value;
  const notes    = document.getElementById('inst_notes').value.trim();

  if (!nameOrId)                  { toast('أدخل الاسم أو ID', 'error'); return; }
  if (isNaN(amount) || amount<=0) { toast('أدخل مبلغاً صحيحاً', 'error'); return; }
  if (!month)                     { toast('اختر الشهر', 'error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    id: genTxId('IN'), userId: user.id, userName: user.name,
    amount, month, method, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'Installments', { data: rec });
  if (r.success) {
    state.installments.push(rec);
    incCounter();
    document.getElementById('inst_nameId').value = '';
    document.getElementById('inst_amount').value = '';
    document.getElementById('inst_notes').value  = '';
    renderAll();
    toast('تم حفظ القسط ✓', 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD CASH PAYMENT
// ====================================================
async function addCashPayment() {
  const nameOrId = document.getElementById('cash_nameId').value.trim();
  const amount   = parseFloat(document.getElementById('cash_amount').value);
  const method   = document.getElementById('cash_method').value;
  const notes    = document.getElementById('cash_notes').value.trim();

  if (!nameOrId)                  { toast('أدخل الاسم أو ID', 'error'); return; }
  if (isNaN(amount) || amount<=0) { toast('أدخل مبلغاً صحيحاً', 'error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    id: genTxId('CA'), userId: user.id, userName: user.name,
    amount, method, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'CashPayments', { data: rec });
  if (r.success) {
    state.cashPayments.push(rec);
    incCounter();
    document.getElementById('cash_nameId').value = '';
    document.getElementById('cash_amount').value = '';
    document.getElementById('cash_notes').value  = '';
    renderAll();
    toast('تم حفظ دفعة الكاش ✓', 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD PURCHASE
// ====================================================
async function addPurchase() {
  const supplier = document.getElementById('pur_supplier').value.trim();
  const batchNum = document.getElementById('pur_batch').value.trim();
  const count    = parseInt(document.getElementById('pur_count').value);
  const notes    = document.getElementById('pur_notes').value.trim();

  if (!supplier)                            { toast('أدخل اسم المورد', 'error'); return; }
  if (!batchNum || isNaN(parseInt(batchNum))) { toast('أدخل رقم دفعة صحيح', 'error'); return; }
  if (isNaN(count) || count <= 0)           { toast('أدخل عدداً صحيحاً', 'error'); return; }
  if (state.purchases.find(b => String(b.num) === String(batchNum))) {
    toast(`❌ دفعة ${batchNum} موجودة مسبقاً`, 'error'); return;
  }

  const rec = { id: genTxId('PU'), num: batchNum, supplier, count, notes, createdAt: nowISO() };

  const r = await callApi('add', 'OilPurchases', { data: rec });
  if (r.success) {
    state.purchases.push(rec);
    incCounter();
    document.getElementById('pur_supplier').value = '';
    document.getElementById('pur_batch').value    = '';
    document.getElementById('pur_count').value    = '';
    document.getElementById('pur_notes').value    = '';
    refreshBatchDropdown();
    renderAll();
    toast(`تم تسجيل دفعة ${batchNum} (${count} تنك) ✓`, 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD CHEESE
// ====================================================
async function addCheese() {
  const nameOrId = document.getElementById('ch_nameId').value.trim();
  const batch    = document.getElementById('ch_batch').value.trim();
  const paid     = parseFloat(document.getElementById('ch_paid').value);
  const total    = parseFloat(document.getElementById('ch_total').value);
  const notes    = document.getElementById('ch_notes').value.trim();

  if (!nameOrId)                { toast('أدخل الاسم أو ID', 'error'); return; }
  if (!batch)                   { toast('أدخل رقم الدفعة', 'error'); return; }
  if (isNaN(paid) || paid < 0)  { toast('أدخل المدفوع', 'error'); return; }
  if (isNaN(total) || total<=0) { toast('أدخل الإجمالي', 'error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    id: genTxId('CH'), userId: user.id, userName: user.name,
    batch, paid, total, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'Cheese', { data: rec });
  if (r.success) {
    state.cheese.push(rec);
    incCounter();
    document.getElementById('ch_nameId').value = '';
    document.getElementById('ch_paid').value   = '';
    document.getElementById('ch_total').value  = '';
    renderAll();
    const rem = total - paid;
    toast(`تم الحفظ. متبقي: ${fmtMoney(rem)} د.أ`, rem > total * 0.5 ? 'warning' : 'success');
    if (rem > total * 0.5) toast('⚠️ المتبقي أكبر من 50%!', 'warning');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD TRANSFER
// ====================================================
async function addTransfer() {
  const desc   = document.getElementById('tr_desc').value.trim();
  const amount = parseFloat(document.getElementById('tr_amount').value);
  const type   = document.getElementById('tr_type').value;
  const method = document.getElementById('tr_method').value;
  const notes  = document.getElementById('tr_notes').value.trim();

  if (!desc)                      { toast('أدخل الوصف', 'error'); return; }
  if (isNaN(amount) || amount<=0) { toast('أدخل مبلغاً صحيحاً', 'error'); return; }

  const rec = { id: genTxId('TR'), desc, amount, type, method, notes, createdAt: nowISO() };

  const r = await callApi('add', 'Transfers', { data: rec });
  if (r.success) {
    state.otherTransfers.push(rec);
    incCounter();
    document.getElementById('tr_desc').value   = '';
    document.getElementById('tr_amount').value = '';
    document.getElementById('tr_notes').value  = '';
    renderTransfers();
    toast('تم حفظ التحويل ✓', 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// ADD BANK MSG
// ====================================================
async function addBankMsg() {
  const amount = parseFloat(document.getElementById('bank_amount').value);
  const type   = document.getElementById('bank_type').value;
  const msg    = document.getElementById('bank_msg').value.trim();

  if (!msg) { toast('أدخل نص الرسالة', 'error'); return; }

  const rec = {
    id: genTxId('BK'),
    amount: isNaN(amount) ? 0 : amount,
    type, msg, createdAt: nowISO()
  };

  const r = await callApi('add', 'BankMessages', { data: rec });
  if (r.success) {
    state.bankMessages.push(rec);
    document.getElementById('bank_amount').value = '';
    document.getElementById('bank_msg').value    = '';
    renderBank();
    toast('تم حفظ الرسالة ✓', 'success');
  } else {
    toast('فشل الحفظ', 'error');
  }
}

// ====================================================
// DELETE
// ====================================================
function askDelete(sheetName, id, stateKey, isNested) {
  showModal('🗑️ تأكيد الحذف',
    `<p style="margin-bottom:12px">أدخل كلمة سر الحذف:</p>
     <input type="password" id="delPassConfirm" placeholder="كلمة السر"
       style="width:100%;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:var(--r);font-family:inherit;font-size:13px">`,
    async () => {
      const pass = document.getElementById('delPassConfirm').value;
      if (pass !== state.deletePassword) { toast('كلمة سر خاطئة', 'error'); return; }

      const r = await callApi('delete', sheetName, { id });
      if (r.success) {
        if (stateKey === 'purchases') {
          state.purchases = state.purchases.filter(x => x.num !== id && x.id !== id);
        } else {
          state[stateKey] = state[stateKey].filter(x => x.id !== id);
        }
        renderAll();
        toast('تم الحذف', 'success');
      } else {
        toast('فشل الحذف', 'error');
      }
    }, '🗑️ احذف');
}

// ====================================================
// RENDER TANKS
// ====================================================
function renderTanks() {
  const tbody = document.querySelector('#tanksTable tbody');
  const recs = [...state.tankRecords].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>';
  } else {
    tbody.innerHTML = recs.map(r => `<tr>
      <td><code style="font-size:11px">${esc(r.id)}</code></td>
      <td><strong>${esc(r.userName)}</strong><br><small style="color:var(--text3)">${esc(r.userId)}</small></td>
      <td>دفعة ${esc(r.batch)}</td>
      <td style="color:var(--gold);font-weight:700">${r.cash}</td>
      <td>${fmtMoney(r.cashPrice)} د.أ</td>
      <td style="color:var(--purple);font-weight:700">${r.inst}</td>
      <td>${fmtMoney(r.instPrice)} د.أ</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td><button class="btn-icon" onclick="askDelete('OilTanks','${r.id}','tankRecords',false)">🗑️</button></td>
    </tr>`).join('');
  }

  // Batch summary
  const bsMap = {};
  state.tankRecords.forEach(r => {
    if (!bsMap[r.batch]) bsMap[r.batch] = { cash: 0, inst: 0 };
    bsMap[r.batch].cash += parseInt(r.cash) || 0;
    bsMap[r.batch].inst += parseInt(r.inst) || 0;
  });
  const bs = document.getElementById('batchSummary');
  const entries = Object.entries(bsMap).sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0));
  if (!entries.length) {
    bs.innerHTML = '<p style="color:var(--text3)">لا توجد دفعات</p>';
  } else {
    bs.innerHTML = entries.map(([b, v]) => `
      <div class="batch-card">
        <div class="batch-num">دفعة ${esc(b)}</div>
        <div class="batch-total">${v.cash + v.inst} تنك</div>
        <div class="batch-detail">💵 كاش: ${v.cash} | 📅 أقساط: ${v.inst}</div>
      </div>`).join('');
  }
}

// ====================================================
// RENDER INSTALLMENTS
// ====================================================
function renderInstallments() {
  const tbody = document.querySelector('#instTable tbody');
  const recs = [...state.installments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>';
    return;
  }
  tbody.innerHTML = recs.map(r => {
    const ci = calcInstallments(r.userId);
    const remClass = ci.instTanksRemaining > 0 ? 'rem-pos' : 'rem-zero';
    const remText  = ci.instTanksRemaining <= 0 ? 'مكتمل ✅' : `${ci.instTanksRemaining} تنك`;
    return `<tr>
      <td><code style="font-size:11px">${esc(r.id)}</code></td>
      <td><strong>${esc(r.userName)}</strong></td>
      <td>${fmtMoney(r.amount)} د.أ</td>
      <td>${esc(r.month)}</td>
      <td style="color:var(--purple)">${ci.instTanksPaid}</td>
      <td class="${remClass}">${remText}</td>
      <td>${r.method === 'electronic' ? '💳' : '💵'}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td><button class="btn-icon" onclick="askDelete('Installments','${r.id}','installments',false)">🗑️</button></td>
    </tr>`;
  }).join('');
}

// ====================================================
// RENDER CASH
// ====================================================
function renderCash() {
  const tbody = document.querySelector('#cashTable tbody');
  const recs = [...state.cashPayments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>';
    return;
  }
  tbody.innerHTML = recs.map(r => {
    const cc = calcCash(r.userId);
    const remText  = cc.cashTanksRemaining <= 0
      ? 'مكتمل ✅'
      : `${cc.cashTanksRemaining} تنك (${fmtMoney(cc.cashMoneyRemaining)} د.أ)`;
    const remClass = cc.cashTanksRemaining <= 0 ? 'rem-zero' : 'rem-pos';
    return `<tr>
      <td><code style="font-size:11px">${esc(r.id)}</code></td>
      <td><strong>${esc(r.userName)}</strong></td>
      <td>${fmtMoney(r.amount)} د.أ</td>
      <td style="color:var(--gold)">${cc.cashTanksPaid}</td>
      <td class="${remClass}">${remText}</td>
      <td>${r.method === 'electronic' ? '💳' : '💵'}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td><button class="btn-icon" onclick="askDelete('CashPayments','${r.id}','cashPayments',false)">🗑️</button></td>
    </tr>`;
  }).join('');
}

// ====================================================
// RENDER PURCHASES
// ====================================================
function renderPurchases() {
  const tbody = document.querySelector('#purTable tbody');
  const batches = [...state.purchases].sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0));
  if (!batches.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">لا توجد بيانات</td></tr>';
  } else {
    tbody.innerHTML = batches.map(b => `<tr>
      <td><strong>دفعة ${esc(b.num)}</strong></td>
      <td>${esc(b.supplier)}</td>
      <td style="color:var(--green);font-weight:700">${b.count}</td>
      <td>${fmtDate(b.createdAt)}</td>
      <td><button class="btn-icon" onclick="askDelete('OilPurchases','${b.id}','purchases',false)">🗑️</button></td>
    </tr>`).join('');
  }

  // Matching report
  const mr = document.getElementById('matchReport');
  const distByBatch = {};
  state.tankRecords.forEach(r => {
    if (!distByBatch[r.batch]) distByBatch[r.batch] = { cash: 0, inst: 0 };
    distByBatch[r.batch].cash += parseInt(r.cash) || 0;
    distByBatch[r.batch].inst += parseInt(r.inst) || 0;
  });

  const allBatches = new Set([...batches.map(b => b.num), ...Object.keys(distByBatch)]);
  const totalP = batches.reduce((s, b) => s + (parseInt(b.count) || 0), 0);
  const totalD = getTotalDistributed();
  const gDiff  = totalP - totalD;

  let html = `<div style="background:var(--bg2);padding:14px;border-radius:var(--r);margin-bottom:12px">
    <div class="match-row ${gDiff===0?'match-ok':gDiff>0?'match-low':'match-high'}" style="border-radius:var(--r)">
      <div><strong>الإجمالي</strong></div>
      <div>مُشترى: <strong>${totalP}</strong></div>
      <div>مُوزَّع: <strong>${totalD}</strong></div>
      <div class="match-status ${gDiff===0?'ms-ok':gDiff>0?'ms-low':'ms-high'}">
        ${gDiff===0?'✅ متطابق':gDiff>0?`⚠️ متبقي ${gDiff}`:`🔴 زيادة ${Math.abs(gDiff)}`}
      </div>
    </div>
  </div>`;

  Array.from(allBatches).sort((a, b) => (parseInt(a)||0) - (parseInt(b)||0)).forEach(bNum => {
    const pur      = batches.find(b => b.num === bNum);
    const purchased = pur ? parseInt(pur.count) || 0 : 0;
    const dist     = distByBatch[bNum] || { cash: 0, inst: 0 };
    const sold     = dist.cash + dist.inst;
    const diff     = purchased - sold;
    const cls      = diff===0?'ok':diff>0?'low':'high';
    html += `<div class="match-row match-${cls}">
      <div><strong>دفعة ${esc(bNum)}</strong></div>
      <div>مُشترى: <strong>${purchased}</strong></div>
      <div>كاش: ${dist.cash} | أقساط: ${dist.inst}</div>
      <div class="match-status ms-${cls}">
        ${diff===0?'✅ متطابق':diff>0?`⚠️ نقص ${diff}`:`🔴 زيادة ${Math.abs(diff)}`}
      </div>
    </div>`;
  });
  mr.innerHTML = html;
}

// ====================================================
// RENDER CHEESE
// ====================================================
function renderCheese() {
  const tbody = document.querySelector('#cheeseTable tbody');
  const recs = [...state.cheese].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>';
    return;
  }
  tbody.innerHTML = recs.map(r => {
    const rem   = (parseFloat(r.total) || 0) - (parseFloat(r.paid) || 0);
    const alert = rem > (parseFloat(r.total) || 0) * 0.5;
    return `<tr ${alert ? 'style="background:rgba(239,68,68,.07)"' : ''}>
      <td><code style="font-size:11px">${esc(r.id)}</code></td>
      <td><strong>${esc(r.userName)}</strong></td>
      <td><code>${esc(r.batch)}</code></td>
      <td>${fmtMoney(r.paid)} د.أ</td>
      <td>${fmtMoney(r.total)} د.أ</td>
      <td class="${rem>0?'rem-pos':rem===0?'rem-zero':'rem-neg'}">${fmtMoney(rem)} د.أ${alert?' ⚠️':''}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td><button class="btn-icon" onclick="askDelete('Cheese','${r.id}','cheese',false)">🗑️</button></td>
    </tr>`;
  }).join('');
}

// ====================================================
// RENDER TRANSFERS
// ====================================================
function renderTransfers() {
  const tbody = document.querySelector('#transfersTable tbody');
  const recs = [...state.otherTransfers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>';
    return;
  }
  tbody.innerHTML = recs.map(r => `<tr>
    <td><code style="font-size:11px">${esc(r.id)}</code></td>
    <td>${esc(r.desc)}</td>
    <td style="color:${r.type==='in'?'var(--green)':'var(--red)'};font-weight:700">${fmtMoney(r.amount)} د.أ</td>
    <td>${r.type==='in'?'📥 وارد':'📤 صادر'}</td>
    <td>${r.method==='electronic'?'💳':'💵'}</td>
    <td>${esc(r.notes)}</td>
    <td>${fmtDate(r.createdAt)}</td>
    <td><button class="btn-icon" onclick="askDelete('Transfers','${r.id}','otherTransfers',false)">🗑️</button></td>
  </tr>`).join('');
}

// ====================================================
// RENDER BANK
// ====================================================
function renderBank() {
  const tbody = document.querySelector('#bankTable tbody');
  const recs = [...state.bankMessages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!recs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">لا توجد رسائل</td></tr>';
    return;
  }
  tbody.innerHTML = recs.map(r => `<tr>
    <td style="color:${r.type==='in'?'var(--green)':'var(--red)'};font-weight:700">${fmtMoney(r.amount)} د.أ</td>
    <td>${r.type==='in'?'📥 دخول':'📤 خروج'}</td>
    <td style="max-width:300px;word-break:break-word;font-size:12px">${esc(r.msg)}</td>
    <td>${fmtDate(r.createdAt)}</td>
    <td><button class="btn-icon" onclick="askDelete('BankMessages','${r.id}','bankMessages',false)">🗑️</button></td>
  </tr>`).join('');
}

// ====================================================
// RENDER STATS
// ====================================================
function renderStats() {
  const received    = getTotalPurchased();
  const distributed = getTotalDistributed();
  const stock       = received - distributed;
  document.getElementById('st_received').textContent    = received;
  document.getElementById('st_distributed').textContent = distributed;
  document.getElementById('st_stock').textContent       = stock;
  document.getElementById('stockDisplay').textContent   = stock;
}

// ====================================================
// RENDER ALL
// ====================================================
function renderAll() {
  renderStats();
  renderTanks();
  renderInstallments();
  renderCash();
  renderPurchases();
  renderCheese();
  renderTransfers();
  renderBank();
}

// ====================================================
// SEARCH
// ====================================================
function doSearch() {
  const q   = document.getElementById('searchInput').value.trim().toLowerCase();
  const res = document.getElementById('searchResults');
  if (!q) { res.innerHTML = ''; return; }

  const matched = state.users.filter(u =>
    u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
  );

  if (!matched.length) {
    res.innerHTML = '<p style="color:var(--text3);padding:20px;text-align:center">لم يُعثر على نتائج</p>';
    return;
  }

  res.innerHTML = matched.map(u => {
    const cc = calcCash(u.id);
    const ci = calcInstallments(u.id);
    const uTanks    = state.tankRecords.filter(r => r.userId === u.id);
    const uInstPay  = state.installments.filter(t => t.userId === u.id);
    const uCashPay  = state.cashPayments.filter(t => t.userId === u.id);
    const uCheese   = state.cheese.filter(c => c.userId === u.id);

    const cashRemDisplay = cc.cashTanksRemaining <= 0
      ? '<span style="color:var(--green)">مكتمل ✅</span>'
      : `<span style="color:var(--orange)">${cc.cashTanksRemaining} تنك (${fmtMoney(cc.cashMoneyRemaining)} د.أ)</span>`;

    const instRemDisplay = ci.instTanksRemaining <= 0
      ? '<span style="color:var(--green)">مكتمل ✅</span>'
      : `<span style="color:var(--orange)">${ci.instTanksRemaining} تنك (${fmtMoney(ci.instMoneyRemaining)} د.أ)</span>`;

    return `<div class="card">
      <h3 class="card-title">👤 ${esc(u.name)}
        <code style="font-size:12px;color:var(--text3);font-weight:normal">ID: ${esc(u.id)}</code>
      </h3>
      <div class="summary-grid">
        <div class="sum-item"><div class="sum-label">💵 تنكات كاش</div>
          <div class="sum-value" style="color:var(--gold)">${cc.totalCashTanks}</div></div>
        <div class="sum-item"><div class="sum-label">💵 مدفوع كاش</div>
          <div class="sum-value" style="color:var(--green)">${fmtMoney(cc.totalCashPaid)} د.أ</div></div>
        <div class="sum-item"><div class="sum-label">💵 متبقي كاش</div>
          <div class="sum-value">${cashRemDisplay}</div></div>
        <div class="sum-item"><div class="sum-label">📅 تنكات أقساط</div>
          <div class="sum-value" style="color:var(--purple)">${ci.totalInstTanks}</div></div>
        <div class="sum-item"><div class="sum-label">📅 مدفوع أقساط</div>
          <div class="sum-value" style="color:var(--green)">${fmtMoney(ci.totalInstPaid)} د.أ</div></div>
        <div class="sum-item"><div class="sum-label">📅 متبقي أقساط</div>
          <div class="sum-value">${instRemDisplay}</div></div>
      </div>

      ${uTanks.length ? `
        <div class="section-divider">🛢️ سجل التنكات</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>الدفعة</th><th>كاش</th><th>سعر كاش</th><th>أقساط</th><th>سعر أقساط</th><th>التاريخ</th></tr></thead>
          <tbody>${uTanks.map(r => `<tr>
            <td>دفعة ${esc(r.batch)}</td>
            <td style="color:var(--gold)">${r.cash}</td>
            <td>${fmtMoney(r.cashPrice)} د.أ</td>
            <td style="color:var(--purple)">${r.inst}</td>
            <td>${fmtMoney(r.instPrice)} د.أ</td>
            <td>${fmtDate(r.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}

      ${uCashPay.length ? `
        <div class="section-divider">💵 مدفوعات الكاش</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>المبلغ</th><th>طريقة</th><th>التاريخ</th></tr></thead>
          <tbody>${uCashPay.map(p => `<tr>
            <td>${fmtMoney(p.amount)} د.أ</td>
            <td>${p.method==='electronic'?'💳':'💵'}</td>
            <td>${fmtDate(p.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}

      ${uInstPay.length ? `
        <div class="section-divider">📅 دفعات الأقساط</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>المبلغ</th><th>الشهر</th><th>طريقة</th><th>التاريخ</th></tr></thead>
          <tbody>${uInstPay.map(p => `<tr>
            <td>${fmtMoney(p.amount)} د.أ</td>
            <td>${esc(p.month)}</td>
            <td>${p.method==='electronic'?'💳':'💵'}</td>
            <td>${fmtDate(p.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}

      ${uCheese.length ? `
        <div class="section-divider">🧀 الجبنة</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>الدفعة</th><th>المدفوع</th><th>الإجمالي</th><th>المتبقي</th></tr></thead>
          <tbody>${uCheese.map(c => {
            const rem = (parseFloat(c.total)||0) - (parseFloat(c.paid)||0);
            return `<tr>
              <td><code>${esc(c.batch)}</code></td>
              <td>${fmtMoney(c.paid)} د.أ</td>
              <td>${fmtMoney(c.total)} د.أ</td>
              <td style="color:${rem>0?'var(--orange)':'var(--green)'}">${fmtMoney(rem)} د.أ</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : ''}
    </div>`;
  }).join('');
}

// ====================================================
// LATE PAYMENTS CHECK
// ====================================================
function checkLatePayments() {
  const today        = new Date();
  const day          = today.getDate();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

  if ([1,15,25].includes(day)) {
    toast(`📅 تذكير: اليوم ${day} — راجع المدفوعات`, 'warning');
  }

  if (day >= 25) {
    const late = [];
    state.users.forEach(u => {
      const hasInstTanks = state.tankRecords.some(r => r.userId===u.id && parseInt(r.inst)>0);
      if (!hasInstTanks) return;
      const paidThisMonth = state.installments.some(t => t.userId===u.id && t.month===currentMonth);
      if (!paidThisMonth) late.push(u.name);
    });

    const bar  = document.getElementById('notifBar');
    const list = document.getElementById('lateList');
    if (late.length) {
      bar.classList.add('show');
      list.textContent = late.join(' • ');
    } else {
      bar.classList.remove('show');
    }
  }
}

// ====================================================
// EXPORT CSV
// ====================================================
function exportCSV() {
  const rows = [['النوع','ID','الاسم','المبلغ/العدد','التاريخ']];
  state.tankRecords.forEach(r    => rows.push(['تنك',r.id,r.userName,`كاش:${r.cash} أقساط:${r.inst}`,r.createdAt]));
  state.installments.forEach(r  => rows.push(['قسط',r.id,r.userName,r.amount,r.createdAt]));
  state.cashPayments.forEach(r  => rows.push(['كاش',r.id,r.userName,r.amount,r.createdAt]));
  state.cheese.forEach(r        => rows.push(['جبنة',r.id,r.userName,`مدفوع:${r.paid} إجمالي:${r.total}`,r.createdAt]));
  state.otherTransfers.forEach(r => rows.push(['تحويل',r.id,r.desc,r.amount,r.createdAt]));

  let csv = '\uFEFF';
  rows.forEach(row => {
    csv += row.map(v => {
      let s = String(v==null?'':v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) s = '"' + s.replace(/"/g,'""') + '"';
      return s;
    }).join(',') + '\n';
  });

  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `oil_cheese_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('تم تصدير CSV ✓', 'success');
}

// ====================================================
// COUNTER
// ====================================================
function incCounter() {
  state.opCounter = (state.opCounter || 0) + 1;
  localStorage.setItem('opCounter', state.opCounter);
  if (state.opCounter % 50 === 0) {
    showModal('⚠️ تذكير نسخة احتياطية',
      `<p>وصلت لـ <strong style="color:var(--green)">${state.opCounter}</strong> عملية. يُنصح بتصدير CSV الآن.</p>`,
      () => exportCSV(), '📊 تصدير CSV');
  }
}

// ====================================================
// SETTINGS
// ====================================================
function saveDelPass() {
  const v = document.getElementById('delPassInput').value;
  if (v.length < 4) { toast('4 أحرف على الأقل', 'error'); return; }
  state.deletePassword = v;
  localStorage.setItem('deletePassword', v);
  document.getElementById('delPassInput').value = '';
  toast('تم حفظ كلمة السر ✓', 'success');
}

function saveApiSettings() {
  const url = document.getElementById('apiUrlInput').value.trim();
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!url || !key) { toast('أدخل الرابط والمفتاح', 'error'); return; }
  state.apiUrl = url;
  state.apiKey = key;
  localStorage.setItem('apiUrl', url);
  localStorage.setItem('apiKey', key);
  toast('تم الحفظ. جاري التحميل...', 'success');
  setTimeout(loadAllData, 500);
}

// ====================================================
// TABS
// ====================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ====================================================
// INIT
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();

  // ربط الأزرار
  document.getElementById('addTankBtn')?.addEventListener('click', addTankRecord);
  document.getElementById('addInstBtn')?.addEventListener('click', addInstallment);
  document.getElementById('addCashBtn')?.addEventListener('click', addCashPayment);
  document.getElementById('addPurBtn')?.addEventListener('click', addPurchase);
  document.getElementById('addCheeseBtn')?.addEventListener('click', addCheese);
  document.getElementById('addTransferBtn')?.addEventListener('click', addTransfer);
  document.getElementById('addBankBtn')?.addEventListener('click', addBankMsg);
  document.getElementById('searchBtn')?.addEventListener('click', doSearch);
  document.getElementById('searchInput')?.addEventListener('keypress', e => { if (e.key==='Enter') doSearch(); });
  document.getElementById('saveDelPassBtn')?.addEventListener('click', saveDelPass);
  document.getElementById('saveApiBtn')?.addEventListener('click', saveApiSettings);
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);

  // تحميل الإعدادات المحفوظة
  const apiUrlEl = document.getElementById('apiUrlInput');
  const apiKeyEl = document.getElementById('apiKeyInput');
  if (apiUrlEl) apiUrlEl.value = state.apiUrl;
  if (apiKeyEl) apiKeyEl.value = state.apiKey;

  // تحميل البيانات إذا الإعدادات موجودة
  if (state.apiUrl && state.apiKey) {
    loadAllData();
  } else {
    toast('يرجى ضبط إعدادات الاتصال من تبويبة الإعدادات', 'warning');
  }
});
