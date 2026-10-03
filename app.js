// คิดค่าเหล้า — LINE MINI App (LIFF) แบบบิลร่วมกัน
import { LIFF_ID, FIREBASE_CONFIG } from './config.js';
import {
  CATS, CAT, QUICK, MODES, MODE_LABEL, WEIGHTS, ROUNDS,
  money, signed, thDate, todayISO, parseMoney, itemTotal, nameIn, participants, compute,
  ppKind, ppPayload, ppPretty
} from './calc.js';
import { DELETE, createFirestoreStore, createLocalStore, firebaseConfigured } from './store.js';

/* ---------- เครื่องมือเล็กๆ ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ALNUM = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomId(n) {
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  let s = '';
  for (const x of r) s += ALNUM[x % 62];
  return s;
}
const newKey = prefix => prefix + randomId(9);
const catColor = id => `var(--c-${CAT[id] ? id : 'other'})`;
const LIFF_OK = typeof LIFF_ID === 'string' && /^\d+-[A-Za-z0-9]+$/.test(LIFF_ID.trim());
const RECENT_KEY = 'kidkalao.recent';

const app = { store: null, liff: false, me: null, billId: null, bill: null, calc: null, unsub: null, first: true };
const L = () => window.liff;
const people = () => (app.calc ? app.calc.people : []);
const nameOf = id => nameIn(people(), id);
const myPerson = () => (app.me ? people().find(p => p.lineId === app.me.id) || null : null);
const firstChar = s => (Array.from(String(s || '').trim())[0] || '?');
function avatarHTML(pic, name) {
  return pic
    ? `<img class="avatar" src="${esc(pic)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="avatar" aria-hidden="true">${esc(firstChar(name))}</span>`;
}

/* ---------- แจ้งเตือน ---------- */
let toastTimer = null, undoFn = null;
function toast(msg, undo) {
  $('toastMsg').textContent = msg;
  undoFn = undo || null;
  $('toastUndo').hidden = !undo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; undoFn = null; }, undo ? 6000 : 3200);
}
$('toastUndo').addEventListener('click', () => { const f = undoFn; undoFn = null; $('toast').hidden = true; if (f) f(); });
function banner(html, kind) {
  const d = document.createElement('div');
  d.className = 'banner' + (kind ? ' ' + kind : '');
  d.innerHTML = `<p>${html}</p>`;
  $('banners').appendChild(d);
}

/* ---------- บันทึกลงฐานข้อมูล ---------- */
function write(changes, okMsg, undo) {
  if (!app.billId || !app.store) return Promise.resolve(false);
  return app.store.update(app.billId, changes)
    .then(() => { if (okMsg) toast(okMsg, undo); return true; })
    .catch(err => { console.error(err); toast('บันทึกไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return false; });
}

/* ---------- เริ่มต้น ---------- */
async function boot() {
  $('nbDate').value = todayISO();
  setupStatic();

  if (LIFF_OK && L()) {
    try {
      await L().init({ liffId: LIFF_ID.trim() });
      app.liff = true;
      if (L().isLoggedIn()) {
        try {
          const p = await L().getProfile();
          app.me = { id: p.userId, name: p.displayName || 'ฉัน', pic: p.pictureUrl || '' };
        } catch (e) { console.warn('getProfile', e); }
      }
    } catch (e) {
      console.error(e);
      banner(`เชื่อมต่อ LINE ไม่สำเร็จ (${esc(e.message || e)}) ให้ตรวจ LIFF ID ในไฟล์ config.js`, 'bad');
    }
  } else if (!LIFF_OK) {
    banner('ยังไม่ได้ใส่ LIFF ID ในไฟล์ config.js จึงยังใช้ชื่อจาก LINE และส่งข้อความเข้ากลุ่มโดยตรงไม่ได้');
  } else {
    banner('โหลดระบบของ LINE ไม่สำเร็จ ลองปิดแล้วเปิดใหม่อีกครั้ง', 'bad');
  }

  if (firebaseConfigured(FIREBASE_CONFIG)) {
    try { app.store = await createFirestoreStore(FIREBASE_CONFIG); }
    catch (e) {
      console.error(e);
      banner(`เชื่อมต่อ Firebase ไม่สำเร็จ (${esc(e.code || e.message || e)}) ตอนนี้ใช้โหมดทดลองไปก่อน`, 'bad');
      app.store = createLocalStore();
    }
  } else {
    app.store = createLocalStore();
    banner('โหมดทดลอง: ยังไม่ได้ใส่ค่า Firebase ในไฟล์ config.js บิลจะอยู่ในเครื่องนี้เท่านั้น เพื่อนเปิดลิงก์แล้วจะไม่เห็น');
  }
  renderMe();
  route();
}

function renderMe() {
  const el = $('meChip');
  if (app.me) el.innerHTML = `${avatarHTML(app.me.pic, app.me.name)}<span>${esc(app.me.name)}</span>`;
  else if (app.liff && !L().isInClient()) el.innerHTML = '<button type="button" class="btn small" id="loginBtn">เข้าสู่ระบบ LINE</button>';
  else el.innerHTML = '';
}
$('meChip').addEventListener('click', e => {
  if (e.target.closest('#loginBtn') && app.liff) L().login({ redirectUri: location.href });
});

/* ---------- หน้าต่างๆ ---------- */
function billParam() {
  const id = new URLSearchParams(location.search).get('bill');
  return id && /^[A-Za-z0-9]{16,40}$/.test(id) ? id : null;
}
function route() { const id = billParam(); if (id) openBill(id); else showHome(); }
function go(url) { history.pushState(null, '', url); route(); window.scrollTo(0, 0); }
window.addEventListener('popstate', route);
function show(which) {
  ['loading', 'home', 'notFound', 'billView'].forEach(k => { $(k).hidden = k !== which; });
  $('bar').hidden = which !== 'billView';
}
const homeUrl = () => location.pathname;
const billUrl = id => location.pathname + '?bill=' + id;
$('homeLink').addEventListener('click', () => go(homeUrl()));
$('toHome').addEventListener('click', () => go(homeUrl()));
$('nfHome').addEventListener('click', () => go(homeUrl()));

function closeBill() {
  if (app.unsub) { try { app.unsub(); } catch (e) {} }
  app.unsub = null; app.billId = null; app.bill = null; app.calc = null; app.first = true; app.link = null;
}
function showHome() {
  closeBill();
  renderRecent();
  document.title = 'คิดค่าเหล้า';
  show('home');
}

/* ---------- บิลที่เคยเปิด (เก็บในเครื่อง) ---------- */
function readRecent() {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
function saveRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {} }
function remember() {
  const list = readRecent().filter(r => r.id !== app.billId);
  list.unshift({ id: app.billId, title: app.bill.title, date: app.bill.date, at: Date.now() });
  saveRecent(list);
}
function renderRecent() {
  const list = readRecent();
  $('recentEmpty').hidden = list.length > 0;
  $('recent').innerHTML = list.map(r => `
    <li class="recent-row" data-id="${esc(r.id)}">
      <a href="${esc(billUrl(r.id))}" class="open-bill">${esc((r.title || '').trim() || 'บิลไม่มีชื่อ')}</a>
      <button type="button" class="link hide-bill">ซ่อน</button>
      <small>${esc(thDate(r.date) || '')}</small>
    </li>`).join('');
}
$('recent').addEventListener('click', e => {
  const li = e.target.closest('.recent-row'); if (!li) return;
  if (e.target.closest('.open-bill')) { e.preventDefault(); go(billUrl(li.dataset.id)); }
  else if (e.target.closest('.hide-bill')) { saveRecent(readRecent().filter(r => r.id !== li.dataset.id)); renderRecent(); }
});

/* ---------- สร้างบิล ---------- */
async function createBill(title, date, peopleMap) {
  const id = randomId(20);
  const ppl = peopleMap || {};
  if (!peopleMap && app.me) {
    ppl[newKey('p')] = { name: app.me.name.slice(0, 30), drinks: true, weight: 1, pp: '', lineId: app.me.id, pic: app.me.pic || '', order: Date.now() };
  }
  const data = { v: 1, title: String(title || '').trim().slice(0, 60), date: date || todayISO(), round: 1, people: ppl, items: {}, contribs: {}, payments: {} };
  await app.store.create(id, data);
  go(billUrl(id));
}
$('newBill').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('nbSubmit');
  btn.disabled = true; btn.textContent = 'กำลังสร้าง…';
  try { await createBill($('nbTitle').value, $('nbDate').value); $('nbTitle').value = ''; }
  catch (err) { console.error(err); toast('สร้างบิลไม่สำเร็จ ตรวจอินเทอร์เน็ตหรือการตั้งค่า Firebase'); }
  finally { btn.disabled = false; btn.textContent = 'สร้างบิล'; }
});
$('newWithPeople').addEventListener('click', async () => {
  const ppl = {};
  people().forEach((p, i) => {
    const copy = { name: p.name || '', drinks: !!p.drinks, weight: 1, pp: p.pp || '', order: Date.now() + i };
    if (p.lineId) { copy.lineId = p.lineId; copy.pic = p.pic || ''; }
    ppl[newKey('p')] = copy;
  });
  try { await createBill('', todayISO(), ppl); toast('สร้างบิลใหม่แล้ว รายชื่อเดิมอยู่ครบ'); }
  catch (err) { console.error(err); toast('สร้างบิลไม่สำเร็จ ลองใหม่อีกครั้ง'); }
});

/* ---------- เปิดบิล ---------- */
function normalize(d) {
  return {
    title: d.title || '', date: d.date || '', round: Number.isFinite(d.round) ? d.round : 1,
    people: d.people || {}, items: d.items || {}, contribs: d.contribs || {}, payments: d.payments || {}
  };
}
function openBill(id) {
  if (app.billId === id && app.unsub) return;
  closeBill();
  app.billId = id;
  show('loading');
  app.unsub = app.store.subscribe(id, data => {
    if (app.billId !== id) return;
    if (!data) {
      $('notFoundMsg').textContent = app.store.kind === 'local'
        ? 'บิลนี้อาจสร้างไว้ในโหมดทดลองบนเครื่องอื่น หรือลิงก์ไม่ครบ'
        : 'ลิงก์อาจไม่ครบ ลองขอลิงก์ใหม่จากเพื่อนในกลุ่ม';
      show('notFound');
      return;
    }
    onBill(normalize(data));
  }, err => {
    console.error(err);
    $('notFoundMsg').textContent = 'เปิดบิลไม่ได้ (' + (err.code || err.message || err) + ')';
    show('notFound');
  });
}
function onBill(bill) {
  app.bill = bill;
  app.calc = compute(bill);
  if (app.first) { app.first = false; show('billView'); resetForm(); resetCForm(); refreshLink(); }
  renderHeader(); renderWho(); renderPeople();
  syncFormPeople(); syncContribPeople();
  renderItems(); renderContribs(); renderSummary();
  remember();
}

/* ---------- หัวบิล ---------- */
function renderHeader() {
  const b = app.bill;
  if (document.activeElement !== $('title')) $('title').value = b.title;
  if (document.activeElement !== $('date')) $('date').value = b.date;
  $('dateTh').textContent = thDate(b.date);
  document.title = (b.title.trim() || 'บิลไม่มีชื่อ') + ' · คิดค่าเหล้า';
}
$('title').addEventListener('change', e => write({ title: e.target.value.trim().slice(0, 60) }));
$('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('date').addEventListener('change', e => write({ date: e.target.value }));

/* ---------- คุณคือใคร ---------- */
function renderWho() {
  const sec = $('whoami');
  if (!app.me || myPerson()) { sec.hidden = true; return; }
  const free = people().filter(p => !p.lineId);
  $('whoPick').innerHTML = free.map(p => `<button type="button" class="chip" data-id="${p.id}">${esc((p.name || '').trim() || 'ไม่มีชื่อ')}</button>`).join('') +
    `<button type="button" class="chip" data-add="1" aria-pressed="true">+ เพิ่ม ${esc(app.me.name)} เข้าบิล</button>`;
  sec.hidden = false;
}
$('whoPick').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b || !app.me) return;
  if (b.dataset.add) {
    write({ ['people.' + newKey('p')]: { name: app.me.name.slice(0, 30), drinks: true, weight: 1, pp: '', lineId: app.me.id, pic: app.me.pic || '', order: Date.now() } }, `เพิ่ม ${app.me.name} แล้ว`);
  } else {
    write({ ['people.' + b.dataset.id + '.lineId']: app.me.id, ['people.' + b.dataset.id + '.pic']: app.me.pic || '' }, 'เชื่อมชื่อกับบัญชี LINE ของคุณแล้ว');
  }
});

/* ---------- รายชื่อ ---------- */
let peopleDirty = false;
function pMsg(p, isMine) {
  const parts = [];
  if (isMine) parts.push('<span class="ok">นี่คือคุณ</span> <button type="button" class="link p-unclaim">ไม่ใช่ฉัน</button>');
  if (p.pp) parts.push(ppKind(p.pp) ? '<span class="ok">สร้าง QR พร้อมเพย์ได้</span>' : '<span class="error" style="font-size:12px">ใช้เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก</span>');
  return parts.join(' · ');
}
function renderPeople() {
  const list = $('peopleList');
  const P = people();
  $('peopleCount').textContent = P.length ? P.length + ' คน' : '';
  const a = document.activeElement;
  if (a && list.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { peopleDirty = true; return; }
  peopleDirty = false;
  const mine = myPerson();
  list.innerHTML = P.map(p => {
    const isMine = mine && mine.id === p.id;
    const nm = (p.name || '').trim() || 'ไม่มีชื่อ';
    return `<li class="person${isMine ? ' mine' : ''}" data-id="${p.id}">
      ${avatarHTML(p.pic, p.name)}
      <input class="inp soft p-name" value="${esc(p.name)}" aria-label="ชื่อ" maxlength="30">
      <button type="button" class="tog" aria-pressed="${!!p.drinks}" aria-label="${esc(nm)} ดื่มไหม">${p.drinks ? 'ดื่ม' : 'ไม่ดื่ม'}</button>
      <select class="inp p-w" aria-label="สัดส่วนการจ่ายของ ${esc(nm)}">${WEIGHTS.map(([v, l]) => `<option value="${v}"${Number(p.weight) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button type="button" class="icon-btn p-del" aria-label="ลบ ${esc(nm)}">×</button>
      <input class="inp soft p-pp num" value="${esc(p.pp || '')}" inputmode="numeric" placeholder="เบอร์พร้อมเพย์ (ไม่ใส่ก็ได้)" aria-label="พร้อมเพย์ของ ${esc(nm)}" maxlength="20">
      <div class="p-msg">${pMsg(p, isMine)}</div>
    </li>`;
  }).join('');
}
$('peopleList').addEventListener('focusout', () => setTimeout(() => {
  if (peopleDirty && !$('peopleList').contains(document.activeElement)) renderPeople();
}, 0));
const personOf = el => { const li = el.closest('.person'); return li && people().find(p => p.id === li.dataset.id); };

$('peopleList').addEventListener('change', e => {
  const p = personOf(e.target); if (!p) return;
  const t = e.target;
  if (t.classList.contains('p-name')) write({ ['people.' + p.id + '.name']: t.value.trim().slice(0, 30) });
  else if (t.classList.contains('p-pp')) write({ ['people.' + p.id + '.pp']: t.value.trim().slice(0, 20) });
  else if (t.classList.contains('p-w')) write({ ['people.' + p.id + '.weight']: Number(t.value) });
});
$('peopleList').addEventListener('input', e => {
  if (!e.target.classList.contains('p-pp')) return;
  const p = personOf(e.target); if (!p) return;
  const mine = myPerson();
  e.target.closest('.person').querySelector('.p-msg').innerHTML = pMsg(Object.assign({}, p, { pp: e.target.value }), mine && mine.id === p.id);
});
$('peopleList').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); }
});
$('peopleList').addEventListener('click', e => {
  const p = personOf(e.target); if (!p) return;
  const tog = e.target.closest('.tog');
  if (tog) {
    const v = !p.drinks;
    tog.setAttribute('aria-pressed', v); tog.textContent = v ? 'ดื่ม' : 'ไม่ดื่ม';
    write({ ['people.' + p.id + '.drinks']: v });
  } else if (e.target.closest('.p-unclaim')) {
    write({ ['people.' + p.id + '.lineId']: DELETE, ['people.' + p.id + '.pic']: DELETE }, 'ยกเลิกการเชื่อมชื่อแล้ว');
  } else if (e.target.closest('.p-del')) {
    deletePerson(p);
  }
});
function deletePerson(p) {
  const c = app.calc;
  const paid = c.items.filter(i => i.payer === p.id).length;
  const treats = c.items.filter(i => i.mode === 'treat' && i.treater === p.id).length;
  const gives = c.contribs.filter(x => x.from === p.id || x.handed === p.id).length;
  const pays = c.payments.filter(x => x.from === p.id || x.to === p.id).length;
  const nm = (p.name || '').trim() || 'คนนี้';
  if (paid || treats || gives || pays) {
    const why = paid ? `เป็นคนจ่าย ${paid} รายการ` : treats ? `เป็นคนเลี้ยง ${treats} รายการ` : gives ? 'มีชื่ออยู่ในเงินสมทบ' : 'มีประวัติการโอน';
    toast(`ลบ ${nm} ไม่ได้ เพราะ${why} ให้แก้ตรงนั้นก่อน`);
    return;
  }
  const changes = { ['people.' + p.id]: DELETE }, undo = {};
  const { id: _pid, ...personData } = p;
  undo['people.' + p.id] = personData;
  c.items.forEach(it => { if ((it.members || []).includes(p.id)) { changes['items.' + it.id + '.members'] = it.members.filter(m => m !== p.id); undo['items.' + it.id + '.members'] = it.members; } });
  c.contribs.forEach(x => { if ((x.members || []).includes(p.id)) { changes['contribs.' + x.id + '.members'] = x.members.filter(m => m !== p.id); undo['contribs.' + x.id + '.members'] = x.members; } });
  form.members.delete(p.id); cform.members.delete(p.id);
  write(changes, `ลบ ${nm} แล้ว`, () => write(undo, `คืน ${nm} แล้ว`));
}
$('addPerson').addEventListener('submit', e => {
  e.preventDefault();
  const names = $('newPerson').value.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
  if (!names.length) { $('newPerson').focus(); return; }
  const changes = {}, now = Date.now();
  names.forEach((n, i) => { changes['people.' + newKey('p')] = { name: n.slice(0, 30), drinks: true, weight: 1, pp: '', order: now + i }; });
  $('newPerson').value = '';
  write(changes, names.length > 1 ? `เพิ่ม ${names.length} คนแล้ว` : `เพิ่ม ${names[0]} แล้ว`);
});

/* ---------- ฟอร์มรายการ ---------- */
const form = { editing: null, order: null, mode: 'drinkers', modeTouched: false, members: new Set(), lastPayer: null };
function setupStatic() {
  $('quick').innerHTML = QUICK.map(([n, c]) => `<button type="button" class="chip" data-name="${n}" data-cat="${c}">${n}</button>`).join('');
  $('fCat').innerHTML = CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  $('fMode').innerHTML = MODES.map(([id, l]) => `<button type="button" data-mode="${id}" aria-pressed="false">${l}</button>`).join('');
  $('cMode').innerHTML = MODES.filter(m => m[0] !== 'treat').map(([id, l]) => `<button type="button" data-mode="${id}" aria-pressed="false">${l}</button>`).join('');
}
const defaultMode = cat => (CAT[cat] && CAT[cat].drink ? 'drinkers' : 'all');
function setMode(m) {
  form.mode = m;
  $('fMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  $('fMembers').hidden = m !== 'custom';
  $('fTreatWrap').hidden = m !== 'treat';
  if (m === 'custom' && form.members.size === 0) people().forEach(p => form.members.add(p.id));
  if (m === 'treat' && !$('fTreater').value) $('fTreater').value = $('fPayer').value;
  renderMembers(); modeHint();
}
function renderMembers() {
  $('fMembers').innerHTML = people().map(p => `<button type="button" class="chip" data-id="${p.id}" aria-pressed="${form.members.has(p.id)}">${esc((p.name || '').trim() || 'ไม่มีชื่อ')}</button>`).join('');
}
function modeHint() {
  if (!people().length) { $('fModeHint').textContent = ''; return; }
  const { list, warn } = participants({ mode: form.mode, members: [...form.members], treater: $('fTreater').value }, people());
  const t = form.mode === 'treat' && !warn
    ? `${nameOf(list[0].id)} จ่ายรายการนี้คนเดียว คนอื่นไม่ต้องหาร`
    : `หาร ${list.length} คน: ${list.map(p => nameOf(p.id)).join(', ')}`;
  $('fModeHint').textContent = warn ? warn + ' · ' + t : t;
}
function optionsHTML() { return people().map(p => `<option value="${p.id}">${esc((p.name || '').trim() || 'ไม่มีชื่อ')}</option>`).join(''); }
function syncFormPeople() {
  const P = people();
  const curPayer = $('fPayer').value || form.lastPayer || (myPerson() || {}).id, curTreat = $('fTreater').value;
  const opts = optionsHTML();
  $('fPayer').innerHTML = opts; $('fTreater').innerHTML = opts;
  if (P.some(p => p.id === curPayer)) $('fPayer').value = curPayer;
  if (P.some(p => p.id === curTreat)) $('fTreater').value = curTreat;
  [...form.members].forEach(id => { if (!P.some(p => p.id === id)) form.members.delete(id); });
  renderMembers(); modeHint();
  $('noPeople').hidden = P.length > 0;
  $('itemForm').querySelectorAll('input,select,button').forEach(el => { if (el.id !== 'fCancel') el.disabled = !P.length; });
}
function updateLineTotal() {
  const price = parseMoney($('fPrice').value), qty = parseInt($('fQty').value, 10);
  $('fTotal').textContent = price > 0 && qty > 0 ? money(Math.round(price * 100) * qty) : '0';
}
function resetForm() {
  form.editing = null; form.order = null; form.modeTouched = false; form.members.clear();
  $('fName').value = ''; $('fPrice').value = ''; $('fQty').value = '1';
  $('formTitle').textContent = 'เพิ่มรายการ'; $('fSubmit').textContent = 'เพิ่มรายการ';
  $('fCancel').hidden = true; $('itemForm').classList.remove('editing'); $('fError').hidden = true;
  $('quick').hidden = false;
  setMode(defaultMode($('fCat').value || 'drink'));
  updateLineTotal();
}
function loadForm(it) {
  form.editing = it.id; form.order = it.order || Date.now(); form.modeTouched = true;
  form.members = new Set(it.members || []);
  $('fName').value = it.name; $('fPrice').value = String(it.price); $('fQty').value = String(it.qty);
  $('fCat').value = CAT[it.cat] ? it.cat : 'other';
  if (people().some(p => p.id === it.payer)) $('fPayer').value = it.payer;
  if (it.treater && people().some(p => p.id === it.treater)) $('fTreater').value = it.treater;
  $('formTitle').textContent = 'แก้ไข: ' + it.name; $('fSubmit').textContent = 'บันทึก';
  $('fCancel').hidden = false; $('itemForm').classList.add('editing'); $('fError').hidden = true;
  $('quick').hidden = true;
  setMode(it.mode); updateLineTotal();
}
function formError(msg, focusId) { $('fError').textContent = msg; $('fError').hidden = false; if (focusId) $(focusId).focus(); }

$('quick').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  $('fName').value = b.dataset.name; $('fCat').value = b.dataset.cat;
  if (!form.modeTouched) setMode(defaultMode(b.dataset.cat));
  $('fPrice').focus();
});
$('fCat').addEventListener('change', () => { if (!form.modeTouched) setMode(defaultMode($('fCat').value)); });
$('fPayer').addEventListener('change', () => { form.lastPayer = $('fPayer').value; modeHint(); });
$('fTreater').addEventListener('change', modeHint);
$('fMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; form.modeTouched = true; setMode(b.dataset.mode); });
$('fMembers').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const id = b.dataset.id;
  if (form.members.has(id)) form.members.delete(id); else form.members.add(id);
  b.setAttribute('aria-pressed', form.members.has(id)); modeHint();
});
$('fPrice').addEventListener('input', updateLineTotal);
$('fQty').addEventListener('input', updateLineTotal);
$('qMinus').addEventListener('click', () => { $('fQty').value = Math.max(1, (parseInt($('fQty').value, 10) || 1) - 1); updateLineTotal(); });
$('qPlus').addEventListener('click', () => { $('fQty').value = (parseInt($('fQty').value, 10) || 0) + 1; updateLineTotal(); });
$('fCancel').addEventListener('click', () => { resetForm(); renderItems(); });

$('itemForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!people().length) return;
  const price = parseMoney($('fPrice').value);
  const qty = Number($('fQty').value);
  const cat = $('fCat').value;
  if (!(price > 0)) return formError('ใส่ราคาเป็นตัวเลขมากกว่า 0', 'fPrice');
  if (!(Number.isInteger(qty) && qty >= 1)) return formError('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'fQty');
  if (form.mode === 'custom' && form.members.size === 0) return formError('เลือกคนที่จะหารอย่างน้อย 1 คน');
  const id = form.editing || newKey('i');
  const item = {
    name: ($('fName').value.trim() || CAT[cat].label).slice(0, 60),
    cat, price: Math.round(price * 100) / 100, qty,
    payer: $('fPayer').value, mode: form.mode,
    members: form.mode === 'custom' ? [...form.members] : [],
    treater: form.mode === 'treat' ? $('fTreater').value : null,
    order: form.order || Date.now()
  };
  if (app.me) item.by = app.me.name.slice(0, 30);
  form.lastPayer = item.payer;
  const wasEdit = !!form.editing;
  resetForm();
  write({ ['items.' + id]: item }, wasEdit ? `บันทึก ${item.name} แล้ว` : `เพิ่ม ${item.name} ${money(itemTotal(item))} บาท แล้ว`);
  if (!wasEdit) $('fName').focus();
});

/* ---------- รายการค่าใช้จ่าย ---------- */
function splitLabel(it) {
  const { list, warn } = participants(it, people());
  if (warn) return { text: 'หารทุกคน', warn };
  if (it.mode === 'treat') return { text: `${nameOf(it.treater)} เลี้ยง`, warn: '' };
  if (it.mode === 'custom') return { text: `หาร ${list.map(p => nameOf(p.id)).join(', ')}`, warn: '' };
  return { text: `หาร${MODE_LABEL[it.mode] || 'ทุกคน'} (${list.length})`, warn: '' };
}
function renderItems() {
  const order = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
  const items = app.calc.items.slice().sort((a, b) => ((order[a.cat] ?? 9) - (order[b.cat] ?? 9)) || ((a.order || 0) - (b.order || 0)));
  $('itemCount').textContent = items.length ? items.length + ' รายการ' : '';
  $('itemList').innerHTML = items.map(it => {
    const s = people().length ? splitLabel(it) : { text: '', warn: '' };
    const qtyTxt = it.qty > 1 ? `${it.qty} × ${money(Math.round(it.price * 100))} · ` : '';
    return `<li class="item${form.editing === it.id ? ' editing' : ''}" data-id="${it.id}">
      <span class="dot" style="--c:${catColor(it.cat)}" title="${esc((CAT[it.cat] || CAT.other).label)}"></span>
      <div>
        <div class="it-name">${esc(it.name)}</div>
        <div class="it-meta">${qtyTxt}${esc(nameOf(it.payer))} จ่าย · ${esc(s.text)}${it.by ? ` · ใส่โดย ${esc(it.by)}` : ''}</div>
        ${s.warn ? `<div class="it-warn">${esc(s.warn)}</div>` : ''}
      </div>
      <div class="it-side">
        <span class="it-amt">${money(itemTotal(it))}</span>
        <span class="it-act"><button type="button" class="link it-edit">แก้ไข</button><button type="button" class="link it-del">ลบ</button></span>
      </div>
    </li>`;
  }).join('');
  $('itemsFoot').innerHTML = items.length
    ? `<span>รวมทุกรายการ</span><b>${money(app.calc.total)} บาท</b>`
    : '<span class="empty-note" style="flex:1">ยังไม่มีรายการ ใส่ค่าเหล้า ค่ากับแกล้ม หรือค่าห้องได้จากฟอร์มด้านบน ทุกคนในกลุ่มช่วยกันใส่ได้</span>';
}
$('itemList').addEventListener('click', e => {
  const li = e.target.closest('.item'); if (!li) return;
  const it = app.calc.items.find(x => x.id === li.dataset.id); if (!it) return;
  if (e.target.closest('.it-edit')) {
    loadForm(it); renderItems();
    $('itemForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('fPrice').focus({ preventScroll: true });
  } else if (e.target.closest('.it-del')) {
    const { id, ...data } = it;
    if (form.editing === id) resetForm();
    write({ ['items.' + id]: DELETE }, `ลบ ${it.name} แล้ว`, () => write({ ['items.' + id]: data }, `คืน ${it.name} แล้ว`));
  }
});

/* ---------- เงินสมทบ ---------- */
const cform = { editing: null, order: null, mode: 'all', members: new Set() };
function contribLabel(c) {
  const { list, warn } = participants(c, people());
  if (warn) return { text: 'หักให้ทุกคน', warn };
  if (c.mode === 'custom') return { text: `หักให้ ${list.map(p => nameOf(p.id)).join(', ')}`, warn: '' };
  return { text: `หักให้${MODE_LABEL[c.mode] || 'ทุกคน'} (${list.length})`, warn: '' };
}
function setCMode(m) {
  cform.mode = m;
  $('cMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  $('cMembers').hidden = m !== 'custom';
  if (m === 'custom' && cform.members.size === 0) people().forEach(p => cform.members.add(p.id));
  renderCMembers(); cModeHint();
}
function renderCMembers() {
  $('cMembers').innerHTML = people().map(p => `<button type="button" class="chip" data-id="${p.id}" aria-pressed="${cform.members.has(p.id)}">${esc((p.name || '').trim() || 'ไม่มีชื่อ')}</button>`).join('');
}
function cModeHint() {
  if (!people().length) { $('cModeHint').textContent = ''; return; }
  const { list, warn } = participants({ mode: cform.mode, members: [...cform.members] }, people());
  const amt = parseMoney($('cAmt').value);
  const sameW = list.every(p => Number(p.weight) === Number(list[0].weight));
  let t = `หักให้ ${list.length} คน: ${list.map(p => nameOf(p.id)).join(', ')}`;
  if (amt > 0) t += sameW ? ` · คนละประมาณ ${money(Math.round(amt * 100 / list.length))} บาท` : ' · หักตามสัดส่วนของแต่ละคน';
  $('cModeHint').textContent = warn ? warn + ' · ' + t : t;
}
function fillHanded() {
  const from = $('cFrom').value, cur = $('cHanded').value;
  $('cHanded').innerHTML = '<option value="">ยังไม่ได้ให้ ให้คิดรวมในรายการโอน</option>' +
    people().filter(p => p.id !== from).map(p => `<option value="${p.id}">ให้เป็นเงินสดกับ ${esc((p.name || '').trim() || 'ไม่มีชื่อ')} แล้ว</option>`).join('');
  if (cur && cur !== from && people().some(p => p.id === cur)) $('cHanded').value = cur;
}
function syncContribPeople() {
  const P = people(), cur = $('cFrom').value;
  $('cFrom').innerHTML = optionsHTML();
  if (P.some(p => p.id === cur)) $('cFrom').value = cur;
  [...cform.members].forEach(id => { if (!P.some(p => p.id === id)) cform.members.delete(id); });
  fillHanded(); renderCMembers(); cModeHint();
  $('cForm').querySelectorAll('input,select,button').forEach(el => { if (el.id !== 'cCancel') el.disabled = !P.length; });
}
function resetCForm() {
  cform.editing = null; cform.order = null; cform.members.clear();
  $('cAmt').value = ''; $('cHanded').value = '';
  $('cFormTitle').textContent = 'เพิ่มเงินสมทบ'; $('cSubmit').textContent = 'เพิ่มเงินสมทบ';
  $('cCancel').hidden = true; $('cForm').classList.remove('editing'); $('cError').hidden = true;
  setCMode('all');
}
function loadCForm(c) {
  cform.editing = c.id; cform.order = c.order || Date.now(); cform.members = new Set(c.members || []);
  if (people().some(p => p.id === c.from)) $('cFrom').value = c.from;
  fillHanded();
  $('cHanded').value = c.handed || '';
  $('cAmt').value = String(c.amt);
  $('cFormTitle').textContent = 'แก้ไขเงินสมทบของ ' + nameOf(c.from); $('cSubmit').textContent = 'บันทึก';
  $('cCancel').hidden = false; $('cForm').classList.add('editing'); $('cError').hidden = true;
  setCMode(c.mode || 'all');
}
function renderContribs() {
  const C = app.calc.contribs;
  $('contribCount').textContent = C.length ? `${C.length} ก้อน` : '';
  $('cList').innerHTML = C.map(c => {
    const s = people().length ? contribLabel(c) : { text: '', warn: '' };
    const handed = c.handed ? `ให้เงินสดกับ ${esc(nameOf(c.handed))} แล้ว` : 'คิดรวมในรายการโอน';
    return `<li class="item${cform.editing === c.id ? ' editing' : ''}" data-id="${c.id}">
      <span class="dot" style="--c:var(--good)"></span>
      <div>
        <div class="it-name">${esc(nameOf(c.from))} ออกให้</div>
        <div class="it-meta">${esc(s.text)} · ${handed}</div>
        ${s.warn ? `<div class="it-warn">${esc(s.warn)}</div>` : ''}
      </div>
      <div class="it-side">
        <span class="it-amt">−${money(Math.round(c.amt * 100))}</span>
        <span class="it-act"><button type="button" class="link c-edit">แก้ไข</button><button type="button" class="link c-del">ลบ</button></span>
      </div>
    </li>`;
  }).join('');
}
$('cFrom').addEventListener('change', fillHanded);
$('cAmt').addEventListener('input', cModeHint);
$('cMode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setCMode(b.dataset.mode); });
$('cMembers').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const id = b.dataset.id;
  if (cform.members.has(id)) cform.members.delete(id); else cform.members.add(id);
  b.setAttribute('aria-pressed', cform.members.has(id)); cModeHint();
});
$('cCancel').addEventListener('click', () => { resetCForm(); renderContribs(); });
$('cForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!people().length) return;
  const amt = parseMoney($('cAmt').value);
  const err = (m, f) => { $('cError').textContent = m; $('cError').hidden = false; if (f) $(f).focus(); };
  if (!(amt > 0)) return err('ใส่จำนวนเงินเป็นตัวเลขมากกว่า 0', 'cAmt');
  if (cform.mode === 'custom' && cform.members.size === 0) return err('เลือกคนที่จะได้หักอย่างน้อย 1 คน');
  const id = cform.editing || newKey('c');
  const c = {
    from: $('cFrom').value, amt: Math.round(amt * 100) / 100, mode: cform.mode,
    members: cform.mode === 'custom' ? [...cform.members] : [],
    handed: $('cHanded').value || '', order: cform.order || Date.now()
  };
  const wasEdit = !!cform.editing;
  resetCForm();
  write({ ['contribs.' + id]: c }, wasEdit ? 'บันทึกเงินสมทบแล้ว' : `เพิ่มเงินสมทบจาก ${nameOf(c.from)} ${money(Math.round(c.amt * 100))} บาท แล้ว`);
});
$('cList').addEventListener('click', e => {
  const li = e.target.closest('.item'); if (!li) return;
  const c = app.calc.contribs.find(x => x.id === li.dataset.id); if (!c) return;
  if (e.target.closest('.c-edit')) {
    loadCForm(c); renderContribs();
    $('cForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('cAmt').focus({ preventScroll: true });
  } else if (e.target.closest('.c-del')) {
    const { id, ...data } = c;
    if (cform.editing === id) resetCForm();
    write({ ['contribs.' + id]: DELETE }, `ลบเงินสมทบของ ${nameOf(c.from)} แล้ว`, () => write({ ['contribs.' + id]: data }, 'คืนเงินสมทบแล้ว'));
  }
});

/* ---------- สรุป ---------- */
const timeTH = ms => { try { return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
function renderSummary() {
  const r = app.calc, b = app.bill, P = r.people, mine = myPerson();
  $('rTitle').textContent = b.title.trim() || 'บิลไม่มีชื่อ';
  $('rDate').textContent = thDate(b.date);
  $('rTotal').textContent = money(r.total);
  const toSplit = r.total - r.contribTotal;
  if (r.contribTotal) {
    $('rLines').innerHTML = `<div><span>หักเงินสมทบ</span><span class="num minus">−${money(r.contribTotal)}</span></div>
      <div class="strong"><span>ที่ต้องหารกัน</span><span class="num">${signed(toSplit)}</span></div>
      ${toSplit < 0 ? '<div class="warn">เงินสมทบมากกว่าค่าใช้จ่ายทั้งหมด บางคนจะได้เงินคืน</div>' : ''}`;
    $('rLines').hidden = false;
  } else { $('rLines').innerHTML = ''; $('rLines').hidden = true; }
  const avg = P.length ? Math.round(toSplit / P.length) : 0;
  $('rSub').textContent = `${P.length} คน · ${r.items.length} รายการ${P.length && toSplit > 0 ? ' · เฉลี่ยคนละ ' + money(avg) : ''}`;

  const cats = CATS.filter(c => r.catTot[c.id]);
  $('catBar').innerHTML = r.total ? cats.map(c => `<span style="--c:${catColor(c.id)};flex:${r.catTot[c.id]} 1 0"></span>`).join('') : '';
  $('catLegend').innerHTML = cats.map(c => `<li><span class="dot" style="--c:${catColor(c.id)}"></span><span class="lbl">${c.label}</span><span class="num">${money(r.catTot[c.id])}</span></li>`).join('');

  /* ตารางรายคน */
  const open = new Set([...document.querySelectorAll('.prow-btn[aria-expanded="true"]')].map(x => x.closest('.prow').dataset.id));
  $('pTable').innerHTML = P.length ? `<div class="p-headrow"><span>ชื่อ</span><span>ส่วนของตัวเอง</span><span>คงเหลือ</span></div>` + P.map(p => {
    const x = r.by[p.id];
    const wl = Number(p.weight) !== 1 ? (WEIGHTS.find(w => w[0] === Number(p.weight)) || [0, ''])[1] : '';
    const tags = [mine && mine.id === p.id ? 'คุณ' : '', !p.drinks ? 'ไม่ดื่ม' : '', wl].filter(Boolean).join(' · ');
    const net = x.net < 0 ? `<span class="net owe">ต้องโอน ${money(x.net)}</span>` : x.net > 0 ? `<span class="net back">รอรับ ${money(x.net)}</span>` : '<span class="net even">ครบแล้ว</span>';
    const isOpen = open.has(p.id);
    let lines = CATS.filter(c => x.cats[c.id]).map(c => `<div><span class="dline"><span class="dot" style="--c:${catColor(c.id)}"></span>${c.label}</span><span class="num">${money(x.cats[c.id])}</span></div>`).join('');
    if (x.contrib) lines += `<div><span class="dline"><span class="dot" style="--c:var(--good)"></span>เงินสมทบที่ออกให้</span><span class="num">+${money(x.contrib)}</span></div>`;
    if (x.sponsored) lines += `<div><span class="dline"><span class="dot" style="--c:var(--good)"></span>เงินสมทบช่วยหักให้</span><span class="num">−${money(x.sponsored)}</span></div>`;
    let paid = `<div class="sep"><span>จ่ายไปก่อนแล้ว</span><span class="num">${money(x.paid)}</span></div>`;
    if (x.cashOut) paid += `<div><span>ให้เงินสดเป็นเงินสมทบแล้ว</span><span class="num">${money(x.cashOut)}</span></div>`;
    if (x.cashIn) paid += `<div><span>รับเงินสดเงินสมทบไว้แล้ว</span><span class="num">−${money(x.cashIn)}</span></div>`;
    if (x.sent) paid += `<div><span>โอนให้คนอื่นแล้ว</span><span class="num">${money(x.sent)}</span></div>`;
    if (x.received) paid += `<div><span>ได้รับโอนแล้ว</span><span class="num">−${money(x.received)}</span></div>`;
    return `<div class="prow" data-id="${p.id}">
      <button type="button" class="prow-btn" aria-expanded="${isOpen}">
        <span class="pr-name">${esc((p.name || '').trim() || 'ไม่มีชื่อ')}${tags ? `<small>${tags}</small>` : ''}</span>
        <span class="pr-share">${signed(x.share)}</span>
        <span class="pr-net">${net}</span>
      </button>
      <div class="pr-detail"${isOpen ? '' : ' hidden'}>${lines || '<div>ไม่มีส่วนที่ต้องจ่าย</div>'}${paid}</div>
    </div>`;
  }).join('') : '<div class="none-note">ยังไม่มีรายชื่อคน</div>';

  /* ใครโอนให้ใคร */
  $('roundSeg').innerHTML = ROUNDS.map(([v, l]) => `<button type="button" data-round="${v}" aria-pressed="${Number(b.round) === v}">${l}</button>`).join('');
  const trs = r.transfers;
  $('trProgress').textContent = (trs.length || r.payments.length) ? `โอนแล้ว ${r.payments.length} · เหลือ ${trs.length}` : '';
  $('trList').innerHTML = trs.length ? trs.map(t => {
    const to = P.find(p => p.id === t.to);
    const meFrom = mine && mine.id === t.from, meTo = mine && mine.id === t.to;
    const qr = to && ppKind(to.pp)
      ? `<button type="button" class="btn small tr-qr" data-to="${t.to}" data-amt="${t.pay}">QR พร้อมเพย์</button>`
      : `<button type="button" class="link tr-addpp" data-to="${t.to}">ใส่พร้อมเพย์ของ ${esc(nameOf(t.to))}</button>`;
    const note = meFrom ? '<small>คุณต้องโอน</small>' : meTo ? '<small>คุณจะได้รับ</small>' : '';
    return `<li class="tr${meFrom ? ' me-from' : ''}${meTo ? ' me-to' : ''}">
      <div class="tr-who">${note}${esc(nameOf(t.from))}<span class="arrow">โอนให้</span>${esc(nameOf(t.to))}</div>
      <div class="tr-amt">${money(t.pay)}</div>
      <div class="tr-act">${qr}<button type="button" class="btn small good tr-done" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amt}" data-pay="${t.pay}">โอนแล้ว</button></div>
    </li>`;
  }).join('') : `<li class="none-note">${r.items.length ? (r.payments.length ? 'โอนครบทุกคนแล้ว' : 'ทุกคนจ่ายพอดีแล้ว ไม่ต้องโอน') : 'ใส่รายการก่อน แล้วรายการโอนจะขึ้นตรงนี้'}</li>`;
  const step = Number(b.round) || 0;
  const extra = trs.reduce((a, t) => a + (t.pay - t.amt), 0);
  const notes = [];
  if (step && extra) notes.push(`ปัดขึ้นแล้ว คนรับได้เกินรวม ${money(extra)} บาท`);
  if (r.crumbs.length) notes.push(`มีเศษต่ำกว่า ${step} บาท ${r.crumbs.length} รายการ ไม่ต้องโอน`);
  if (trs.length) notes.push('กด "โอนแล้ว" หลังโอนเสร็จ ทุกคนในกลุ่มจะเห็นทันที');
  $('roundNote').textContent = notes.join(' · ');
  $('roundNote').hidden = !notes.length;
  $('paidList').innerHTML = r.payments.slice().sort((a, b2) => (b2.at || 0) - (a.at || 0)).map(pm => `
    <li data-id="${pm.id}">
      <span class="who"><b>${esc(nameOf(pm.from))}</b> โอนให้ <b>${esc(nameOf(pm.to))}</b> · ${pm.by ? 'บันทึกโดย ' + esc(pm.by) + ' ' : ''}${esc(timeTH(pm.at))}</span>
      <span><span class="num">${money(pm.paid || pm.amt)}</span> <button type="button" class="link pm-undo">ยกเลิก</button></span>
    </li>`).join('');

  /* แถบล่าง */
  if (mine) {
    const owe = trs.filter(t => t.from === mine.id), get = trs.filter(t => t.to === mine.id);
    const sum = a => a.reduce((s, t) => s + t.pay, 0);
    if (owe.length) {
      $('bTotal').textContent = '฿' + money(sum(owe)); $('bTotal').className = 'b-total owe';
      $('bSub').textContent = 'คุณต้องโอนให้ ' + owe.map(t => nameOf(t.to)).join(', ');
    } else if (get.length) {
      $('bTotal').textContent = '฿' + money(sum(get)); $('bTotal').className = 'b-total back';
      $('bSub').textContent = `คุณจะได้รับจาก ${get.length} คน`;
    } else {
      $('bTotal').textContent = '฿' + money(r.total); $('bTotal').className = 'b-total';
      $('bSub').textContent = r.items.length ? 'คุณไม่ต้องโอนแล้ว' : `${P.length} คน · ยังไม่มีรายการ`;
    }
  } else {
    $('bTotal').textContent = '฿' + money(r.total); $('bTotal').className = 'b-total';
    $('bSub').textContent = `${P.length} คน · ${trs.length ? `เหลือโอน ${trs.length} ครั้ง` : 'ไม่ต้องโอน'}`;
  }
  $('copyText').value = buildText(null);
}

function buildText(link) {
  const r = app.calc, b = app.bill, P = r.people;
  const out = [];
  const title = b.title.trim() || 'บิลไม่มีชื่อ';
  out.push(`คิดค่าเหล้า: ${title}${b.date ? ` (${thDate(b.date)})` : ''}`);
  out.push(`ยอดรวม ${money(r.total)} บาท · ${P.length} คน · ${r.items.length} รายการ`);
  if (r.contribTotal) out.push(`หักเงินสมทบ ${money(r.contribTotal)} บาท · ที่ต้องหารกัน ${signed(r.total - r.contribTotal)} บาท`);
  out.push('', 'ส่วนของแต่ละคน');
  P.forEach(p => { const x = r.by[p.id]; out.push(`- ${(p.name || '').trim() || 'ไม่มีชื่อ'} ${signed(x.share)}${x.contrib ? ` (รวมเงินสมทบ ${money(x.contrib)})` : ''}`); });
  if (r.contribs.length) {
    out.push('', 'เงินสมทบ');
    r.contribs.forEach(c => out.push(`- ${nameOf(c.from)} ออกให้ ${money(Math.round(c.amt * 100))} บาท (${contribLabel(c).text}${c.handed ? `, ให้เงินสดกับ ${nameOf(c.handed)} แล้ว` : ''})`));
  }
  out.push('');
  if (r.transfers.length) {
    out.push(`ยังต้องโอน${b.round ? ` (ปัดขึ้นเป็นหลัก ${b.round} บาท)` : ''}`);
    r.transfers.forEach(t => out.push(`- ${nameOf(t.from)} โอนให้ ${nameOf(t.to)} ${money(t.pay)} บาท`));
    const pps = [...new Set(r.transfers.map(t => t.to))].map(id => P.find(p => p.id === id)).filter(p => p && ppKind(p.pp));
    if (pps.length) { out.push('', 'พร้อมเพย์'); pps.forEach(p => out.push(`- ${nameOf(p.id)} ${ppPretty(p.pp)}`)); }
  } else out.push(r.payments.length ? 'โอนครบทุกคนแล้ว' : 'ไม่ต้องโอน ทุกคนจ่ายพอดีแล้ว');
  if (r.payments.length) {
    out.push('', 'โอนแล้ว');
    r.payments.forEach(pm => out.push(`- ${nameOf(pm.from)} โอนให้ ${nameOf(pm.to)} ${money(pm.paid || pm.amt)} บาท`));
  }
  if (r.items.length) {
    out.push('', 'รายการ');
    r.items.forEach(it => out.push(`- ${it.name}${it.qty > 1 ? ` ${it.qty}×${money(Math.round(it.price * 100))}` : ''} = ${money(itemTotal(it))} (${nameOf(it.payer)}จ่าย, ${splitLabel(it).text})`));
  }
  if (link) out.push('', 'เปิดบิล: ' + link);
  return out.join('\n');
}

$('pTable').addEventListener('click', e => {
  const btn = e.target.closest('.prow-btn'); if (!btn) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', open);
  btn.nextElementSibling.hidden = !open;
});
$('roundSeg').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  write({ round: Number(btn.dataset.round) });
});
$('trList').addEventListener('click', e => {
  const q = e.target.closest('.tr-qr');
  if (q) { openQR(q.dataset.to, Number(q.dataset.amt)); return; }
  const a = e.target.closest('.tr-addpp');
  if (a) {
    const li = document.querySelector(`.person[data-id="${a.dataset.to}"]`);
    if (li) {
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
      li.querySelector('.p-pp').focus({ preventScroll: true });
    }
    return;
  }
  const d = e.target.closest('.tr-done');
  if (d) {
    const id = newKey('m');
    /* amt = ยอดจริงที่ใช้คิดบัญชี, paid = ยอดที่โอนจริงหลังปัดเศษ (ส่วนที่ปัดเกินถือเป็นของคนรับ ยอดของคนอื่นจึงไม่ขยับ) */
    const pm = { from: d.dataset.from, to: d.dataset.to, amt: Number(d.dataset.amt), paid: Number(d.dataset.pay), at: Date.now(), order: Date.now(), by: app.me ? app.me.name.slice(0, 30) : '' };
    d.disabled = true;
    write({ ['payments.' + id]: pm }, `บันทึกแล้ว: ${nameOf(pm.from)} โอนให้ ${nameOf(pm.to)} ${money(pm.paid)} บาท`, () => write({ ['payments.' + id]: DELETE }, 'ยกเลิกการบันทึกแล้ว'));
  }
});
$('paidList').addEventListener('click', e => {
  if (!e.target.closest('.pm-undo')) return;
  const li = e.target.closest('li');
  const pm = app.calc.payments.find(x => x.id === li.dataset.id); if (!pm) return;
  const { id, ...data } = pm;
  write({ ['payments.' + id]: DELETE }, 'ยกเลิกรายการโอนแล้ว', () => write({ ['payments.' + id]: data }, 'คืนรายการโอนแล้ว'));
});
$('toSummary').addEventListener('click', () => $('trTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }));

/* ---------- ส่งเข้า LINE ---------- */
/* ลิงก์ของบิล: ถ้าเชื่อม LINE แล้วใช้ลิงก์ที่เปิดในแอป LINE ได้ ไม่งั้นใช้ลิงก์เว็บตรงๆ
   คำนวณไว้ล่วงหน้า เพื่อให้ปุ่มคัดลอกทำงานได้ทันทีตอนกด */
function fallbackLink() {
  return app.liff ? `https://liff.line.me/${LIFF_ID.trim()}?bill=${app.billId}` : location.origin + location.pathname + '?bill=' + app.billId;
}
function refreshLink() {
  const id = app.billId;
  app.link = fallbackLink();
  if (!app.liff || !L().permanentLink || !L().permanentLink.createUrlBy) return;
  L().permanentLink.createUrlBy(location.origin + location.pathname + '?bill=' + id)
    .then(l => { if (app.billId === id && l) app.link = l; })
    .catch(e => console.warn('createUrlBy', e));
}
const currentLink = () => app.link || fallbackLink();
function flexMessage(kind, link) {
  const r = app.calc, b = app.bill;
  const INK = '#13222A', MUTED = '#566870', ACCENT = '#8A5100', GOOD = '#1F7346';
  const title = b.title.trim() || 'บิลไม่มีชื่อ';
  const row = (l, v, strong) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', contents: [
      { type: 'text', text: l, size: 'sm', color: strong ? INK : MUTED, flex: 5, wrap: true },
      { type: 'text', text: v, size: 'sm', color: INK, align: 'end', weight: 'bold', flex: 3 }
    ]
  });
  const body = [
    { type: 'text', text: 'คิดค่าเหล้า', size: 'xs', color: ACCENT, weight: 'bold' },
    { type: 'text', text: title, size: 'lg', weight: 'bold', color: INK, wrap: true },
    { type: 'text', text: [thDate(b.date), `${r.people.length} คน`].filter(Boolean).join(' · '), size: 'xs', color: MUTED },
    { type: 'separator', margin: 'md' }
  ];
  const totals = [row('ยอดรวม', money(r.total) + ' บาท', true)];
  if (r.contribTotal) {
    totals.push(row('หักเงินสมทบ', '−' + money(r.contribTotal)));
    totals.push(row('ที่ต้องหารกัน', signed(r.total - r.contribTotal) + ' บาท', true));
  }
  body.push({ type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: totals });
  if (kind === 'summary' && r.transfers.length) {
    const shown = r.transfers.slice(0, 12);
    body.push({ type: 'text', text: 'ยังต้องโอน', size: 'sm', weight: 'bold', color: INK, margin: 'lg' });
    body.push({ type: 'box', layout: 'vertical', spacing: 'xs', margin: 'sm', contents: shown.map(t => row(`${nameOf(t.from)} → ${nameOf(t.to)}`, money(t.pay), true)) });
    if (r.transfers.length > shown.length) body.push({ type: 'text', text: `และอีก ${r.transfers.length - shown.length} รายการ`, size: 'xs', color: MUTED });
  } else if (kind === 'summary' && r.items.length) {
    body.push({ type: 'text', text: r.payments.length ? 'โอนครบทุกคนแล้ว' : 'ทุกคนจ่ายพอดีแล้ว ไม่ต้องโอน', size: 'sm', weight: 'bold', color: GOOD, margin: 'lg', wrap: true });
  } else {
    body.push({ type: 'text', text: 'มาช่วยกันใส่ค่าใช้จ่ายในบิลนี้ แล้วระบบจะคิดให้ว่าใครต้องโอนให้ใครเท่าไร', size: 'sm', color: MUTED, margin: 'lg', wrap: true });
  }
  return {
    type: 'flex',
    altText: `คิดค่าเหล้า: ${title} · ยอดรวม ${money(r.total)} บาท`.slice(0, 380),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: '#A85F00', height: 'sm', action: { type: 'uri', label: kind === 'summary' ? 'เปิดบิล' : 'เปิดบิลแล้วช่วยกันใส่', uri: link } }
      ] }
    }
  };
}
async function sendToLine(kind) {
  if (!app.bill) return;
  const link = currentLink();
  if (app.liff && !L().isLoggedIn()) { L().login({ redirectUri: location.href }); return; }
  if (app.liff && L().isApiAvailable && L().isApiAvailable('shareTargetPicker')) {
    try {
      const res = await L().shareTargetPicker([flexMessage(kind, link)], { isMultiple: true });
      if (res) toast('ส่งเข้า LINE แล้ว');
      return;
    } catch (e) {
      console.error(e);
      toast('ส่งเข้า LINE ไม่สำเร็จ จึงคัดลอกข้อความให้แทน');
    }
  }
  const title = app.bill.title.trim() || 'บิลไม่มีชื่อ';
  const text = kind === 'invite' ? `มาช่วยกันใส่ค่าใช้จ่าย "${title}" ในบิลนี้\n${link}` : buildText(link);
  copyText(text, kind === 'invite' ? 'คัดลอกลิงก์แล้ว ไปวางในแชท LINE ได้เลย' : 'คัดลอกสรุปแล้ว ไปวางในแชท LINE ได้เลย');
}
function copyText(text, okMsg) {
  const fallback = () => {
    $('copyText').value = text;
    $('preview').open = true;
    $('summary').scrollIntoView({ behavior: 'smooth', block: 'end' });
    $('copyText').focus(); $('copyText').select();
    toast('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความแล้วกดคัดลอกเอง');
  };
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); }
  catch (e) { fallback(); }
}
$('inviteBtn').addEventListener('click', () => sendToLine('invite'));
$('sendSummary').addEventListener('click', () => sendToLine('summary'));
$('copyBtn').addEventListener('click', () => copyText(buildText(currentLink()), 'คัดลอกสรุปแล้ว ไปวางในแชท LINE ได้เลย'));
$('copyLinkBtn').addEventListener('click', () => copyText(currentLink(), 'คัดลอกลิงก์บิลแล้ว'));

/* ---------- QR พร้อมเพย์ ---------- */
let qrDigits = '', lastFocus = null;
function qrSvg(text) {
  if (typeof window.qrcode !== 'function') return null;
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2, size = n + m * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR พร้อมเพย์"><rect width="${size}" height="${size}" fill="var(--qr-bg)"/><path d="${d}" fill="var(--qr-fg)"/></svg>`;
}
function openQR(toId, satang) {
  const p = people().find(x => x.id === toId); if (!p) return;
  const payload = ppPayload(p.pp, satang);
  const svg = payload && qrSvg(payload);
  $('qrTitle').textContent = 'โอนให้ ' + nameOf(toId);
  $('qrBox').innerHTML = svg || '<p>สร้าง QR ไม่ได้ในตอนนี้ ใช้เลขพร้อมเพย์ด้านล่างโอนแทน</p>';
  $('qrAmt').textContent = '฿' + money(satang);
  qrDigits = String(p.pp).replace(/\D/g, '');
  $('qrId').textContent = 'พร้อมเพย์ ' + ppPretty(p.pp);
  lastFocus = document.activeElement;
  $('qrModal').hidden = false;
  $('qrClose').focus();
}
function closeQR() { $('qrModal').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('qrClose').addEventListener('click', closeQR);
$('qrModal').addEventListener('click', e => { if (e.target === $('qrModal')) closeQR(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('qrModal').hidden) closeQR(); });
$('qrCopy').addEventListener('click', () => copyText(qrDigits, 'คัดลอกเลขพร้อมเพย์แล้ว'));

boot().catch(err => {
  console.error(err);
  banner('เปิดแอปไม่สำเร็จ ลองปิดแล้วเปิดใหม่อีกครั้ง', 'bad');
  show('home');
});

// ให้ทดสอบได้จากภายนอก
window.__kidkalao = { app, flexMessage, buildText };
