// ====================================================
// نظام إدارة الزيت والجبنة
// واجهة: index_v4.html | قاعدة البيانات: Google Sheets
// ====================================================

const state = {
  apiUrl:         localStorage.getItem('apiUrl')         || '',
  apiKey:         localStorage.getItem('apiKey')         || '',
  deletePassword: localStorage.getItem('deletePassword') || '1234',
  opCounter:      parseInt(localStorage.getItem('opCounter')) || 0,
  users:          [],
  tankRecords:    [],
  installments:   [],
  cashPayments:   [],
  purchases:      [],
  cheese:         [],
  otherTransfers: [],
  bankMessages:   [],
};

// ====================================================
// API
// ====================================================
async function callApi(action, sheet, extraParams = {}) {
  if (!state.apiUrl || !state.apiKey) {
    toast('يرجى ضبط إعدادات الاتصال من تبويبة الإعدادات', 'warning');
    return { success: false };
  }
  try {
    const body = { apiKey: state.apiKey, action, sheet, ...extraParams };
    const res  = await fetch(state.apiUrl, {
      method: 'POST', mode: 'cors', redirect: 'follow',
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    toast('فشل الاتصال: ' + err.message, 'error');
    return { success: false };
  }
}

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
  return c[Math.floor(Math.random()*c.length)] + c[Math.floor(Math.random()*c.length)];
}
function genUserId() {
  return String(1000 + state.users.length + Math.floor(Math.random()*9)) + randChars();
}
function genTxId(prefix) {
  return (prefix||'TX') + '-' + String(1000+Math.floor(Math.random()*9000)) + randChars();
}
function nowISO() { return new Date().toISOString(); }

// ====================================================
// Helpers
// ====================================================
function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ar-EG', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  });
}
function fmtMoney(n) {
  if (isNaN(n) || n == null) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:2 });
}
function esc(t) {
  if (t == null) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}

// ====================================================
// Toast / Modal
// ====================================================
function toast(msg, type) {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' '+type : '');
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateY(16px)';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}
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
  let u = state.users.find(x => x.userId === q || x.name === q);
  if (!u) {
    u = { userId: genUserId(), name: q, createdAt: nowISO() };
    const r = await callApi('add', 'Users', { data: u });
    if (r.success) { state.users.push(u); refreshUsersDL(); }
    else { toast('فشل إضافة المستخدم', 'error'); return null; }
  }
  return u;
}
function findUser(nameOrId) {
  const q = String(nameOrId||'').trim();
  return state.users.find(x => x.userId === q || x.name === q) || null;
}
function refreshUsersDL() {
  const dl = document.getElementById('usersDL');
  if (!dl) return;
  dl.innerHTML = state.users.map(u =>
    `<option value="${esc(u.name)}">[${esc(u.userId)}]</option>`).join('');
}
function fillUserPrices(prefix) {
  const u = findUser(document.getElementById(prefix+'_nameId').value);
  if (!u) return;
  const cp = document.getElementById(prefix+'_cashPrice');
  const ip = document.getElementById(prefix+'_instPrice');
  if (cp && !cp.value) cp.value = u.cashPrice || '';
  if (ip && !ip.value) ip.value = u.installmentPrice || '';
}

// ====================================================
// Inventory
// ====================================================
function getTotalPurchased() {
  return state.purchases.reduce((s,b) => s+(parseInt(b.tanksCount)||0), 0);
}
function getTotalDistributed() {
  return state.tankRecords.reduce((s,r) =>
    s+(parseInt(r.cashCount)||0)+(parseInt(r.instCount)||0), 0);
}
function getStock() { return getTotalPurchased() - getTotalDistributed(); }

function refreshBatchDropdown() {
  const sel = document.getElementById('tk_batch');
  if (!sel) return;
  const batches = [...state.purchases].sort((a,b) =>
    (parseInt(a.batchNumber)||0)-(parseInt(b.batchNumber)||0));
  sel.innerHTML = '<option value="">-- اختر دفعة --</option>' +
    batches.map(b =>
      `<option value="${esc(b.batchNumber)}">دفعة ${esc(b.batchNumber)} (${b.tanksCount} تنك)</option>`
    ).join('');
}

// ====================================================
// CALC CASH (مستقل)
// OilTanks: cashCount, cashPrice
// CashPayments: amount
// ====================================================
function calcCash(userId) {
  const userTanks      = state.tankRecords.filter(r => r.userId === userId);
  const totalCashTanks = userTanks.reduce((s,r) => s+(parseInt(r.cashCount)||0), 0);
  const totalCashDue   = userTanks.reduce((s,r) =>
    s+((parseInt(r.cashCount)||0)*(parseFloat(r.cashPrice)||0)), 0);
  const avgCashPrice   = totalCashTanks > 0 ? totalCashDue/totalCashTanks : 0;
  const totalCashPaid  = state.cashPayments
    .filter(t => t.userId === userId)
    .reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const cashTanksPaid      = avgCashPrice > 0 ? Math.floor(totalCashPaid/avgCashPrice) : 0;
  const cashTanksRemaining = Math.max(0, totalCashTanks - cashTanksPaid);
  const cashMoneyRemaining = totalCashDue - totalCashPaid;
  return { totalCashTanks, avgCashPrice, totalCashDue, totalCashPaid,
           cashTanksPaid, cashTanksRemaining, cashMoneyRemaining };
}

// ====================================================
// CALC INSTALLMENTS (مستقل)
// OilTanks: instCount, instPrice
// Installments: amountPaid
// ====================================================
function calcInstallments(userId) {
  const userTanks      = state.tankRecords.filter(r => r.userId === userId);
  const totalInstTanks = userTanks.reduce((s,r) => s+(parseInt(r.instCount)||0), 0);
  const totalInstDue   = userTanks.reduce((s,r) =>
    s+((parseInt(r.instCount)||0)*(parseFloat(r.instPrice)||0)), 0);
  const avgInstPrice   = totalInstTanks > 0 ? totalInstDue/totalInstTanks : 0;
  const totalInstPaid  = state.installments
    .filter(t => t.userId === userId)
    .reduce((s,t) => s+(parseFloat(t.amountPaid)||0), 0);
  const instTanksPaid      = avgInstPrice > 0 ? Math.floor(totalInstPaid/avgInstPrice) : 0;
  const instTanksRemaining = Math.max(0, totalInstTanks - instTanksPaid);
  const instMoneyRemaining = totalInstDue - totalInstPaid;
  return { totalInstTanks, avgInstPrice, totalInstDue, totalInstPaid,
           instTanksPaid, instTanksRemaining, instMoneyRemaining };
}

// ====================================================
// ADD TANK RECORD
// OilTanks: transactionId, userId, userName, batchNumber,
//           cashCount, cashPrice, instCount, instPrice,
//           notes, createdAt
// ====================================================
async function addTankRecord() {
  const nameOrId  = document.getElementById('tk_nameId').value.trim();
  const batch     = document.getElementById('tk_batch').value;
  const cashCount = parseInt(document.getElementById('tk_cash').value)||0;
  const cashPrice = parseFloat(document.getElementById('tk_cashPrice').value)||0;
  const instCount = parseInt(document.getElementById('tk_inst').value)||0;
  const instPrice = parseFloat(document.getElementById('tk_instPrice').value)||0;
  const notes     = document.getElementById('tk_notes').value.trim();

  if (!nameOrId)                       { toast('أدخل الاسم أو ID','error'); return; }
  if (!batch)                          { toast('اختر الدفعة','error'); return; }
  if (cashCount+instCount <= 0)        { toast('أدخل عدد تنكات صحيح','error'); return; }
  if (cashCount>0 && cashPrice<=0)     { toast('أدخل سعر تنك الكاش','error'); return; }
  if (instCount>0 && instPrice<=0)     { toast('أدخل سعر تنك الأقساط','error'); return; }

  const total = cashCount+instCount;
  const stock = getStock();
  if (total > stock) {
    toast(`❌ المخزن يحتوي فقط ${stock} تنك — لا يمكن تسجيل ${total}`,'error'); return;
  }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: genTxId('TK'),
    userId: user.userId, userName: user.name,
    batchNumber: batch,
    cashCount, cashPrice, instCount, instPrice,
    notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'OilTanks', { data: rec });
  if (r.success) {
    state.tankRecords.push(rec); incCounter();
    document.getElementById('tk_nameId').value='';
    document.getElementById('tk_cash').value='0';
    document.getElementById('tk_cashPrice').value='';
    document.getElementById('tk_inst').value='0';
    document.getElementById('tk_instPrice').value='';
    document.getElementById('tk_notes').value='';
    renderAll();
    toast(`تم تسجيل ${total} تنك ✓`,'success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD INSTALLMENT
// Installments: transactionId, userId, userName,
//               amountPaid, monthPaid, paymentMethod,
//               notes, createdAt
// ====================================================
async function addInstallment() {
  const nameOrId = document.getElementById('inst_nameId').value.trim();
  const amount   = parseFloat(document.getElementById('inst_amount').value);
  const month    = document.getElementById('inst_month').value;
  const method   = document.getElementById('inst_method').value;
  const notes    = document.getElementById('inst_notes').value.trim();

  if (!nameOrId)                  { toast('أدخل الاسم أو ID','error'); return; }
  if (isNaN(amount)||amount<=0)   { toast('أدخل مبلغاً صحيحاً','error'); return; }
  if (!month)                     { toast('اختر الشهر','error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: genTxId('IN'),
    userId: user.userId, userName: user.name,
    amountPaid: amount, monthPaid: month,
    paymentMethod: method, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'Installments', { data: rec });
  if (r.success) {
    state.installments.push(rec); incCounter();
    document.getElementById('inst_nameId').value='';
    document.getElementById('inst_amount').value='';
    document.getElementById('inst_notes').value='';
    renderAll();
    toast('تم حفظ القسط ✓','success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD CASH PAYMENT
// CashPayments: transactionId, userId, userName,
//               amount, paymentMethod, notes, createdAt
// ====================================================
async function addCashPayment() {
  const nameOrId = document.getElementById('cash_nameId').value.trim();
  const amount   = parseFloat(document.getElementById('cash_amount').value);
  const method   = document.getElementById('cash_method').value;
  const notes    = document.getElementById('cash_notes').value.trim();

  if (!nameOrId)                { toast('أدخل الاسم أو ID','error'); return; }
  if (isNaN(amount)||amount<=0) { toast('أدخل مبلغاً صحيحاً','error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: genTxId('CA'),
    userId: user.userId, userName: user.name,
    amount, paymentMethod: method, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'CashPayments', { data: rec });
  if (r.success) {
    state.cashPayments.push(rec); incCounter();
    document.getElementById('cash_nameId').value='';
    document.getElementById('cash_amount').value='';
    document.getElementById('cash_notes').value='';
    renderAll();
    toast('تم حفظ دفعة الكاش ✓','success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD PURCHASE
// OilPurchases: transactionId, supplierName,
//               batchNumber, tanksCount, notes, createdAt
// ====================================================
async function addPurchase() {
  const supplier = document.getElementById('pur_supplier').value.trim();
  const batchNum = document.getElementById('pur_batch').value.trim();
  const count    = parseInt(document.getElementById('pur_count').value);
  const notes    = document.getElementById('pur_notes').value.trim();

  if (!supplier)                              { toast('أدخل اسم المورد','error'); return; }
  if (!batchNum||isNaN(parseInt(batchNum)))   { toast('أدخل رقم دفعة صحيح','error'); return; }
  if (isNaN(count)||count<=0)                 { toast('أدخل عدداً صحيحاً','error'); return; }
  if (state.purchases.find(b => String(b.batchNumber)===String(batchNum))) {
    toast(`❌ دفعة ${batchNum} موجودة مسبقاً`,'error'); return;
  }

  const rec = {
    transactionId: genTxId('PU'),
    supplierName: supplier, batchNumber: batchNum,
    tanksCount: count, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'OilPurchases', { data: rec });
  if (r.success) {
    state.purchases.push(rec); incCounter();
    document.getElementById('pur_supplier').value='';
    document.getElementById('pur_batch').value='';
    document.getElementById('pur_count').value='';
    document.getElementById('pur_notes').value='';
    refreshBatchDropdown(); renderAll();
    toast(`تم تسجيل دفعة ${batchNum} (${count} تنك) ✓`,'success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD CHEESE
// Cheese: transactionId, userId, userName, batchNumber,
//         amountPaid, totalAmount, notes, createdAt
// ====================================================
async function addCheese() {
  const nameOrId = document.getElementById('ch_nameId').value.trim();
  const batch    = document.getElementById('ch_batch').value.trim();
  const paid     = parseFloat(document.getElementById('ch_paid').value);
  const total    = parseFloat(document.getElementById('ch_total').value);
  const notes    = document.getElementById('ch_notes').value.trim();

  if (!nameOrId)              { toast('أدخل الاسم أو ID','error'); return; }
  if (!batch)                 { toast('أدخل رقم الدفعة','error'); return; }
  if (isNaN(paid)||paid<0)    { toast('أدخل المدفوع','error'); return; }
  if (isNaN(total)||total<=0) { toast('أدخل الإجمالي','error'); return; }

  const user = await getOrCreateUser(nameOrId);
  if (!user) return;

  const rec = {
    transactionId: genTxId('CH'),
    userId: user.userId, userName: user.name,
    batchNumber: batch, amountPaid: paid,
    totalAmount: total, notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'Cheese', { data: rec });
  if (r.success) {
    state.cheese.push(rec); incCounter();
    document.getElementById('ch_nameId').value='';
    document.getElementById('ch_paid').value='';
    document.getElementById('ch_total').value='';
    renderAll();
    const rem = total-paid;
    toast(`تم الحفظ. متبقي: ${fmtMoney(rem)} د.أ`, rem>total*0.5?'warning':'success');
    if (rem>total*0.5) toast('⚠️ المتبقي أكبر من 50%!','warning');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD TRANSFER
// Transfers: transactionId, description, amount,
//            transferType, paymentMethod, notes, createdAt
// ====================================================
async function addTransfer() {
  const desc   = document.getElementById('tr_desc').value.trim();
  const amount = parseFloat(document.getElementById('tr_amount').value);
  const type   = document.getElementById('tr_type').value;
  const method = document.getElementById('tr_method').value;
  const notes  = document.getElementById('tr_notes').value.trim();

  if (!desc)                    { toast('أدخل الوصف','error'); return; }
  if (isNaN(amount)||amount<=0) { toast('أدخل مبلغاً صحيحاً','error'); return; }

  const rec = {
    transactionId: genTxId('TR'),
    description: desc, amount,
    transferType: type, paymentMethod: method,
    notes, createdAt: nowISO()
  };

  const r = await callApi('add', 'Transfers', { data: rec });
  if (r.success) {
    state.otherTransfers.push(rec); incCounter();
    document.getElementById('tr_desc').value='';
    document.getElementById('tr_amount').value='';
    document.getElementById('tr_notes').value='';
    renderTransfers();
    toast('تم حفظ التحويل ✓','success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// ADD BANK MSG
// BankMessages: transactionId, amount, msgType, msg, createdAt
// ====================================================
async function addBankMsg() {
  const amount = parseFloat(document.getElementById('bank_amount').value);
  const type   = document.getElementById('bank_type').value;
  const msg    = document.getElementById('bank_msg').value.trim();

  if (!msg) { toast('أدخل نص الرسالة','error'); return; }

  const rec = {
    transactionId: genTxId('BK'),
    amount: isNaN(amount)?0:amount,
    msgType: type, msg, createdAt: nowISO()
  };

  const r = await callApi('add', 'BankMessages', { data: rec });
  if (r.success) {
    state.bankMessages.push(rec);
    document.getElementById('bank_amount').value='';
    document.getElementById('bank_msg').value='';
    renderBank();
    toast('تم حفظ الرسالة ✓','success');
  } else toast('فشل الحفظ','error');
}

// ====================================================
// DELETE
// ====================================================
function askDelete(sheetName, transactionId, stateKey) {
  showModal('🗑️ تأكيد الحذف',
    `<p style="margin-bottom:12px">أدخل كلمة سر الحذف:</p>
     <input type="password" id="delPassConfirm" placeholder="كلمة السر"
       style="width:100%;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);
              color:var(--text);border-radius:var(--r);font-family:inherit;font-size:13px">`,
    async () => {
      const pass = document.getElementById('delPassConfirm').value;
      if (pass !== state.deletePassword) { toast('كلمة سر خاطئة','error'); return; }
      const r = await callApi('delete', sheetName, { transactionId });
      if (r.success) {
        state[stateKey] = state[stateKey].filter(x => x.transactionId !== transactionId);
        renderAll();
        toast('تم الحذف ✓','success');
      } else toast('فشل الحذف','error');
    }, '🗑️ احذف');
}

// ====================================================
// RENDER TANKS
// ====================================================
function renderTanks() {
  const tbody  = document.querySelector('#tanksTable tbody');
  const recs   = [...state.tankRecords].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>'
    : recs.map(r=>`<tr>
        <td><code style="font-size:11px">${esc(r.transactionId)}</code></td>
        <td><strong>${esc(r.userName)}</strong><br>
            <small style="color:var(--text3)">${esc(r.userId)}</small></td>
        <td>دفعة ${esc(r.batchNumber)}</td>
        <td style="color:var(--gold);font-weight:700">${r.cashCount||0}</td>
        <td>${fmtMoney(r.cashPrice)} د.أ</td>
        <td style="color:var(--purple);font-weight:700">${r.instCount||0}</td>
        <td>${fmtMoney(r.instPrice)} د.أ</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn-icon"
              onclick="askDelete('OilTanks','${r.transactionId}','tankRecords')">🗑️</button></td>
      </tr>`).join('');

  const bsMap = {};
  state.tankRecords.forEach(r => {
    if (!bsMap[r.batchNumber]) bsMap[r.batchNumber]={cash:0,inst:0};
    bsMap[r.batchNumber].cash += parseInt(r.cashCount)||0;
    bsMap[r.batchNumber].inst += parseInt(r.instCount)||0;
  });
  const entries = Object.entries(bsMap).sort((a,b)=>(parseInt(a[0])||0)-(parseInt(b[0])||0));
  document.getElementById('batchSummary').innerHTML = entries.length
    ? entries.map(([b,v])=>`
        <div class="batch-card">
          <div class="batch-num">دفعة ${esc(b)}</div>
          <div class="batch-total">${v.cash+v.inst} تنك</div>
          <div class="batch-detail">💵 كاش: ${v.cash} | 📅 أقساط: ${v.inst}</div>
        </div>`).join('')
    : '<p style="color:var(--text3)">لا توجد دفعات</p>';
}

// ====================================================
// RENDER INSTALLMENTS
// ====================================================
function renderInstallments() {
  const tbody = document.querySelector('#instTable tbody');
  const recs  = [...state.installments].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>'
    : recs.map(r => {
        const ci = calcInstallments(r.userId);
        return `<tr>
          <td><code style="font-size:11px">${esc(r.transactionId)}</code></td>
          <td><strong>${esc(r.userName)}</strong></td>
          <td>${fmtMoney(r.amountPaid)} د.أ</td>
          <td>${esc(r.monthPaid)}</td>
          <td style="color:var(--purple)">${ci.instTanksPaid}</td>
          <td class="${ci.instTanksRemaining>0?'rem-pos':'rem-zero'}">
            ${ci.instTanksRemaining<=0?'مكتمل ✅':`${ci.instTanksRemaining} تنك`}</td>
          <td>${r.paymentMethod==='electronic'?'💳':'💵'}</td>
          <td>${fmtDate(r.createdAt)}</td>
          <td><button class="btn-icon"
                onclick="askDelete('Installments','${r.transactionId}','installments')">🗑️</button></td>
        </tr>`;
      }).join('');
}

// ====================================================
// RENDER CASH
// ====================================================
function renderCash() {
  const tbody = document.querySelector('#cashTable tbody');
  const recs  = [...state.cashPayments].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>'
    : recs.map(r => {
        const cc = calcCash(r.userId);
        const remText = cc.cashTanksRemaining<=0
          ? 'مكتمل ✅'
          : `${cc.cashTanksRemaining} تنك (${fmtMoney(cc.cashMoneyRemaining)} د.أ)`;
        return `<tr>
          <td><code style="font-size:11px">${esc(r.transactionId)}</code></td>
          <td><strong>${esc(r.userName)}</strong></td>
          <td>${fmtMoney(r.amount)} د.أ</td>
          <td style="color:var(--gold)">${cc.cashTanksPaid}</td>
          <td class="${cc.cashTanksRemaining<=0?'rem-zero':'rem-pos'}">${remText}</td>
          <td>${r.paymentMethod==='electronic'?'💳':'💵'}</td>
          <td>${fmtDate(r.createdAt)}</td>
          <td><button class="btn-icon"
                onclick="askDelete('CashPayments','${r.transactionId}','cashPayments')">🗑️</button></td>
        </tr>`;
      }).join('');
}

// ====================================================
// RENDER PURCHASES
// ====================================================
function renderPurchases() {
  const tbody   = document.querySelector('#purTable tbody');
  const batches = [...state.purchases].sort((a,b)=>(parseInt(a.batchNumber)||0)-(parseInt(b.batchNumber)||0));
  tbody.innerHTML = !batches.length
    ? '<tr><td colspan="5" class="empty">لا توجد بيانات</td></tr>'
    : batches.map(b=>`<tr>
        <td><strong>دفعة ${esc(b.batchNumber)}</strong></td>
        <td>${esc(b.supplierName)}</td>
        <td style="color:var(--green);font-weight:700">${b.tanksCount}</td>
        <td>${fmtDate(b.createdAt)}</td>
        <td><button class="btn-icon"
              onclick="askDelete('OilPurchases','${b.transactionId}','purchases')">🗑️</button></td>
      </tr>`).join('');

  const distByBatch = {};
  state.tankRecords.forEach(r => {
    if (!distByBatch[r.batchNumber]) distByBatch[r.batchNumber]={cash:0,inst:0};
    distByBatch[r.batchNumber].cash += parseInt(r.cashCount)||0;
    distByBatch[r.batchNumber].inst += parseInt(r.instCount)||0;
  });
  const allBatches = new Set([...batches.map(b=>b.batchNumber),...Object.keys(distByBatch)]);
  const totalP = batches.reduce((s,b)=>s+(parseInt(b.tanksCount)||0),0);
  const totalD = getTotalDistributed();
  const gDiff  = totalP - totalD;

  let html = `<div style="background:var(--bg2);padding:14px;border-radius:var(--r);margin-bottom:12px">
    <div class="match-row ${gDiff===0?'match-ok':gDiff>0?'match-low':'match-high'}">
      <div><strong>الإجمالي</strong></div>
      <div>مُشترى: <strong>${totalP}</strong></div>
      <div>مُوزَّع: <strong>${totalD}</strong></div>
      <div class="match-status ${gDiff===0?'ms-ok':gDiff>0?'ms-low':'ms-high'}">
        ${gDiff===0?'✅ متطابق':gDiff>0?`⚠️ متبقي ${gDiff}`:`🔴 زيادة ${Math.abs(gDiff)}`}
      </div>
    </div></div>`;

  Array.from(allBatches).sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0)).forEach(bNum=>{
    const pur=batches.find(b=>b.batchNumber===bNum);
    const purchased=pur?parseInt(pur.tanksCount)||0:0;
    const dist=distByBatch[bNum]||{cash:0,inst:0};
    const sold=dist.cash+dist.inst;
    const diff=purchased-sold;
    const cls=diff===0?'ok':diff>0?'low':'high';
    html+=`<div class="match-row match-${cls}">
      <div><strong>دفعة ${esc(bNum)}</strong></div>
      <div>مُشترى: <strong>${purchased}</strong></div>
      <div>كاش: ${dist.cash} | أقساط: ${dist.inst}</div>
      <div class="match-status ms-${cls}">
        ${diff===0?'✅ متطابق':diff>0?`⚠️ نقص ${diff}`:`🔴 زيادة ${Math.abs(diff)}`}
      </div></div>`;
  });
  document.getElementById('matchReport').innerHTML = html;
}

// ====================================================
// RENDER CHEESE
// ====================================================
function renderCheese() {
  const tbody = document.querySelector('#cheeseTable tbody');
  const recs  = [...state.cheese].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>'
    : recs.map(r=>{
        const rem=(parseFloat(r.totalAmount)||0)-(parseFloat(r.amountPaid)||0);
        const alert=rem>(parseFloat(r.totalAmount)||0)*0.5;
        return `<tr ${alert?'style="background:rgba(239,68,68,.07)"':''}>
          <td><code style="font-size:11px">${esc(r.transactionId)}</code></td>
          <td><strong>${esc(r.userName)}</strong></td>
          <td><code>${esc(r.batchNumber)}</code></td>
          <td>${fmtMoney(r.amountPaid)} د.أ</td>
          <td>${fmtMoney(r.totalAmount)} د.أ</td>
          <td class="${rem>0?'rem-pos':rem===0?'rem-zero':'rem-neg'}">
            ${fmtMoney(rem)} د.أ${alert?' ⚠️':''}</td>
          <td>${fmtDate(r.createdAt)}</td>
          <td><button class="btn-icon"
                onclick="askDelete('Cheese','${r.transactionId}','cheese')">🗑️</button></td>
        </tr>`;
      }).join('');
}

// ====================================================
// RENDER TRANSFERS
// ====================================================
function renderTransfers() {
  const tbody = document.querySelector('#transfersTable tbody');
  const recs  = [...state.otherTransfers].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="8" class="empty">لا توجد بيانات</td></tr>'
    : recs.map(r=>`<tr>
        <td><code style="font-size:11px">${esc(r.transactionId)}</code></td>
        <td>${esc(r.description)}</td>
        <td style="color:${r.transferType==='in'?'var(--green)':'var(--red)'};font-weight:700">
          ${fmtMoney(r.amount)} د.أ</td>
        <td>${r.transferType==='in'?'📥 وارد':'📤 صادر'}</td>
        <td>${r.paymentMethod==='electronic'?'💳':'💵'}</td>
        <td>${esc(r.notes)}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn-icon"
              onclick="askDelete('Transfers','${r.transactionId}','otherTransfers')">🗑️</button></td>
      </tr>`).join('');
}

// ====================================================
// RENDER BANK
// ====================================================
function renderBank() {
  const tbody = document.querySelector('#bankTable tbody');
  const recs  = [...state.bankMessages].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  tbody.innerHTML = !recs.length
    ? '<tr><td colspan="5" class="empty">لا توجد رسائل</td></tr>'
    : recs.map(r=>`<tr>
        <td style="color:${r.msgType==='in'?'var(--green)':'var(--red)'};font-weight:700">
          ${fmtMoney(r.amount)} د.أ</td>
        <td>${r.msgType==='in'?'📥 دخول':'📤 خروج'}</td>
        <td style="max-width:300px;word-break:break-word;font-size:12px">${esc(r.msg)}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn-icon"
              onclick="askDelete('BankMessages','${r.transactionId}','bankMessages')">🗑️</button></td>
      </tr>`).join('');
}

// ====================================================
// RENDER STATS
// ====================================================
function renderStats() {
  const received=getTotalPurchased(), distributed=getTotalDistributed(), stock=received-distributed;
  document.getElementById('st_received').textContent    = received;
  document.getElementById('st_distributed').textContent = distributed;
  document.getElementById('st_stock').textContent       = stock;
  document.getElementById('stockDisplay').textContent   = stock;
}

function renderAll() {
  renderStats(); renderTanks(); renderInstallments(); renderCash();
  renderPurchases(); renderCheese(); renderTransfers(); renderBank();
}

// ====================================================
// SEARCH
// ====================================================
function doSearch() {
  const q   = document.getElementById('searchInput').value.trim().toLowerCase();
  const res = document.getElementById('searchResults');
  if (!q) { res.innerHTML=''; return; }

  const matched = state.users.filter(u =>
    u.name.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q));

  if (!matched.length) {
    res.innerHTML='<p style="color:var(--text3);padding:20px;text-align:center">لم يُعثر على نتائج</p>';
    return;
  }

  res.innerHTML = matched.map(u => {
    const cc=calcCash(u.userId), ci=calcInstallments(u.userId);
    const uTanks=state.tankRecords.filter(r=>r.userId===u.userId);
    const uInstPay=state.installments.filter(t=>t.userId===u.userId);
    const uCashPay=state.cashPayments.filter(t=>t.userId===u.userId);
    const uCheese=state.cheese.filter(c=>c.userId===u.userId);

    return `<div class="card">
      <h3 class="card-title">👤 ${esc(u.name)}
        <code style="font-size:12px;color:var(--text3);font-weight:normal">ID: ${esc(u.userId)}</code>
      </h3>
      <div class="summary-grid">
        <div class="sum-item"><div class="sum-label">💵 تنكات كاش</div>
          <div class="sum-value" style="color:var(--gold)">${cc.totalCashTanks}</div></div>
        <div class="sum-item"><div class="sum-label">💵 مدفوع كاش</div>
          <div class="sum-value" style="color:var(--green)">${fmtMoney(cc.totalCashPaid)} د.أ</div></div>
        <div class="sum-item"><div class="sum-label">💵 متبقي كاش</div>
          <div class="sum-value">${cc.cashTanksRemaining<=0
            ?'<span style="color:var(--green)">مكتمل ✅</span>'
            :`<span style="color:var(--orange)">${cc.cashTanksRemaining} تنك (${fmtMoney(cc.cashMoneyRemaining)} د.أ)</span>`
          }</div></div>
        <div class="sum-item"><div class="sum-label">📅 تنكات أقساط</div>
          <div class="sum-value" style="color:var(--purple)">${ci.totalInstTanks}</div></div>
        <div class="sum-item"><div class="sum-label">📅 مدفوع أقساط</div>
          <div class="sum-value" style="color:var(--green)">${fmtMoney(ci.totalInstPaid)} د.أ</div></div>
        <div class="sum-item"><div class="sum-label">📅 متبقي أقساط</div>
          <div class="sum-value">${ci.instTanksRemaining<=0
            ?'<span style="color:var(--green)">مكتمل ✅</span>'
            :`<span style="color:var(--orange)">${ci.instTanksRemaining} تنك (${fmtMoney(ci.instMoneyRemaining)} د.أ)</span>`
          }</div></div>
      </div>
      ${uTanks.length?`
        <div class="section-divider">🛢️ سجل التنكات</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>الدفعة</th><th>كاش</th><th>سعر كاش</th><th>أقساط</th><th>سعر أقساط</th><th>التاريخ</th></tr></thead>
          <tbody>${uTanks.map(r=>`<tr>
            <td>دفعة ${esc(r.batchNumber)}</td>
            <td style="color:var(--gold)">${r.cashCount||0}</td>
            <td>${fmtMoney(r.cashPrice)} د.أ</td>
            <td style="color:var(--purple)">${r.instCount||0}</td>
            <td>${fmtMoney(r.instPrice)} د.أ</td>
            <td>${fmtDate(r.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>`:''}
      ${uCashPay.length?`
        <div class="section-divider">💵 مدفوعات الكاش</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>المبلغ</th><th>طريقة</th><th>التاريخ</th></tr></thead>
          <tbody>${uCashPay.map(p=>`<tr>
            <td>${fmtMoney(p.amount)} د.أ</td>
            <td>${p.paymentMethod==='electronic'?'💳':'💵'}</td>
            <td>${fmtDate(p.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>`:''}
      ${uInstPay.length?`
        <div class="section-divider">📅 دفعات الأقساط</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>المبلغ</th><th>الشهر</th><th>طريقة</th><th>التاريخ</th></tr></thead>
          <tbody>${uInstPay.map(p=>`<tr>
            <td>${fmtMoney(p.amountPaid)} د.أ</td>
            <td>${esc(p.monthPaid)}</td>
            <td>${p.paymentMethod==='electronic'?'💳':'💵'}</td>
            <td>${fmtDate(p.createdAt)}</td>
          </tr>`).join('')}</tbody>
        </table></div>`:''}
      ${uCheese.length?`
        <div class="section-divider">🧀 الجبنة</div>
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>الدفعة</th><th>المدفوع</th><th>الإجمالي</th><th>المتبقي</th></tr></thead>
          <tbody>${uCheese.map(c=>{
            const rem=(parseFloat(c.totalAmount)||0)-(parseFloat(c.amountPaid)||0);
            return `<tr><td><code>${esc(c.batchNumber)}</code></td>
              <td>${fmtMoney(c.amountPaid)} د.أ</td>
              <td>${fmtMoney(c.totalAmount)} د.أ</td>
              <td style="color:${rem>0?'var(--orange)':'var(--green)'}">${fmtMoney(rem)} د.أ</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`:''}
    </div>`;
  }).join('');
}

// ====================================================
// LATE PAYMENTS
// ====================================================
function checkLatePayments() {
  const today=new Date(), day=today.getDate();
  const currentMonth=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  if ([1,15,25].includes(day)) toast(`📅 تذكير: اليوم ${day} — راجع المدفوعات`,'warning');
  if (day >= 25) {
    const late=[];
    state.users.forEach(u => {
      if (!state.tankRecords.some(r=>r.userId===u.userId&&parseInt(r.instCount)>0)) return;
      if (!state.installments.some(t=>t.userId===u.userId&&t.monthPaid===currentMonth))
        late.push(u.name);
    });
    const bar=document.getElementById('notifBar'), list=document.getElementById('lateList');
    if (late.length) { bar.classList.add('show'); list.textContent=late.join(' • '); }
    else bar.classList.remove('show');
  }
}

// ====================================================
// EXPORT CSV
// ====================================================
function exportCSV() {
  const rows=[['النوع','ID','الاسم/الوصف','المبلغ/العدد','التاريخ']];
  state.tankRecords.forEach(r=>rows.push(['تنك',r.transactionId,r.userName,`كاش:${r.cashCount||0} أقساط:${r.instCount||0}`,r.createdAt]));
  state.installments.forEach(r=>rows.push(['قسط',r.transactionId,r.userName,r.amountPaid,r.createdAt]));
  state.cashPayments.forEach(r=>rows.push(['كاش',r.transactionId,r.userName,r.amount,r.createdAt]));
  state.cheese.forEach(r=>rows.push(['جبنة',r.transactionId,r.userName,`مدفوع:${r.amountPaid} إجمالي:${r.totalAmount}`,r.createdAt]));
  state.otherTransfers.forEach(r=>rows.push(['تحويل',r.transactionId,r.description,r.amount,r.createdAt]));

  let csv='\uFEFF';
  rows.forEach(row=>{
    csv+=row.map(v=>{
      let s=String(v==null?'':v);
      if(s.includes(',')||s.includes('"')||s.includes('\n')) s='"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(',')+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`oil_cheese_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('تم تصدير CSV ✓','success');
}

function incCounter() {
  state.opCounter=(state.opCounter||0)+1;
  localStorage.setItem('opCounter',state.opCounter);
  if(state.opCounter%50===0)
    showModal('⚠️ تذكير نسخة احتياطية',
      `<p>وصلت لـ <strong style="color:var(--green)">${state.opCounter}</strong> عملية. يُنصح بتصدير CSV الآن.</p>`,
      ()=>exportCSV(),'📊 تصدير CSV');
}

// ====================================================
// SETTINGS / INIT
// ====================================================
function saveDelPass() {
  const v=document.getElementById('delPassInput').value;
  if(v.length<4){toast('4 أحرف على الأقل','error');return;}
  state.deletePassword=v; localStorage.setItem('deletePassword',v);
  document.getElementById('delPassInput').value='';
  toast('تم حفظ كلمة السر ✓','success');
}
function saveApiSettings() {
  const url=document.getElementById('apiUrlInput').value.trim();
  const key=document.getElementById('apiKeyInput').value.trim();
  if(!url||!key){toast('أدخل الرابط والمفتاح','error');return;}
  state.apiUrl=url; state.apiKey=key;
  localStorage.setItem('apiUrl',url); localStorage.setItem('apiKey',key);
  toast('تم الحفظ. جاري التحميل...','success');
  setTimeout(loadAllData,500);
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  const apiUrlEl=document.getElementById('apiUrlInput');
  const apiKeyEl=document.getElementById('apiKeyInput');
  if(apiUrlEl) apiUrlEl.value=state.apiUrl;
  if(apiKeyEl) apiKeyEl.value=state.apiKey;
  if(state.apiUrl&&state.apiKey) loadAllData();
  else toast('يرجى ضبط إعدادات الاتصال من تبويبة الإعدادات','warning');
});
