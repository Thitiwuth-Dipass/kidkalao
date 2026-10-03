// คิดค่าเหล้า — การคำนวณทั้งหมด (ไม่มีส่วนที่ยุ่งกับหน้าจอ)
// เงินทุกจำนวนคิดเป็น "สตางค์" (จำนวนเต็ม) เพื่อไม่ให้เศษทศนิยมเพี้ยน

export const CATS = [
  { id: 'drink',  label: 'เหล้า/เบียร์',     drink: true },
  { id: 'mixer',  label: 'มิกเซอร์/น้ำแข็ง', drink: true },
  { id: 'food',   label: 'อาหาร/กับแกล้ม' },
  { id: 'room',   label: 'ค่าห้อง/ค่าร้าน' },
  { id: 'travel', label: 'ค่ารถ' },
  { id: 'other',  label: 'อื่นๆ' }
];
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
export const QUICK = [['เบียร์','drink'],['เหล้า','drink'],['โซดา','mixer'],['น้ำแข็ง','mixer'],['น้ำอัดลม','mixer'],['กับแกล้ม','food'],['ค่าห้อง','room'],['ค่ารถ','travel']];
export const MODES = [['all','ทุกคน'],['drinkers','เฉพาะคนดื่ม'],['custom','เลือกเอง'],['treat','มีคนเลี้ยง']];
export const MODE_LABEL = Object.fromEntries(MODES);
export const WEIGHTS = [[1,'เต็ม'],[0.5,'ครึ่ง'],[1.5,'1.5 เท่า'],[2,'2 เท่า'],[0,'ไม่ต้องจ่าย']];
export const ROUNDS = [[0,'ไม่ปัด'],[1,'1 บาท'],[5,'5 บาท'],[10,'10 บาท']];

/* ---------- รูปแบบตัวเลขและวันที่ ---------- */
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = s => { s = Math.abs(s); return s % 100 === 0 ? nf0.format(s / 100) : nf2.format(s / 100); };
export const signed = s => (s < 0 ? '−' : '') + money(s);
export function thDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  try { return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso; }
}
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const parseMoney = v => { const n = parseFloat(String(v).replace(/[,\s฿]/g, '')); return Number.isFinite(n) ? n : NaN; };

/* ---------- ข้อมูลในบิล ---------- */
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1);
export const listOf = map => Object.entries(map || {}).map(([id, v]) => Object.assign({ id }, v)).sort(byOrder);
export const itemTotal = it => Math.round((Number(it.price) || 0) * 100) * (Number(it.qty) || 0);
export function nameIn(people, id) {
  const p = people.find(x => x.id === id);
  return p ? ((p.name || '').trim() || 'ไม่มีชื่อ') : 'คนที่ถูกลบ';
}

/* ใครต้องร่วมจ่ายรายการนี้ และด้วยน้ำหนักเท่าไร (น้ำหนัก ×2 ให้เป็นจำนวนเต็ม) */
export function participants(entry, people) {
  let list, warn = '';
  if (entry.mode === 'treat') {
    const t = people.find(p => p.id === entry.treater);
    if (t) return { list: [t], w: [1], warn: '' };
    list = people; warn = 'ยังไม่ได้เลือกคนเลี้ยง จึงหารทุกคนแทน';
  } else if (entry.mode === 'drinkers') {
    list = people.filter(p => p.drinks);
    if (!list.length) { list = people; warn = 'ยังไม่มีใครเป็นคนดื่ม จึงหารทุกคนแทน'; }
  } else if (entry.mode === 'custom') {
    const s = new Set(entry.members || []);
    list = people.filter(p => s.has(p.id));
    if (!list.length) { list = people; warn = 'ไม่ได้เลือกใคร จึงหารทุกคนแทน'; }
  } else list = people;
  let w = list.map(p => Math.round((Number(p.weight) || 0) * 2));
  if (w.every(x => x === 0)) w = list.map(() => 1);
  return { list, w, warn };
}

/* แบ่ง total ตามน้ำหนัก เศษสตางค์ที่เหลือแจกให้คนที่มีเศษมากที่สุดก่อน ผลรวมจึงเท่ากับ total เสมอ */
export function alloc(total, w) {
  const W = w.reduce((a, b) => a + b, 0);
  if (!W) return w.map(() => 0);
  const base = w.map(x => Math.floor(total * x / W));
  const rem = total - base.reduce((a, b) => a + b, 0);
  const order = w.map((x, i) => [(total * x) % W, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < rem; k++) base[order[k][1]]++;
  return base;
}

/* คนที่ติดลบโอนให้คนที่ติดบวก จับคู่ยอดที่เท่ากันพอดีก่อน แล้วจับยอดใหญ่กับยอดใหญ่ เพื่อให้จำนวนครั้งที่ต้องโอนน้อย */
export function settle(people, by) {
  const cred = people.filter(p => by[p.id].net > 0).map(p => ({ id: p.id, amt: by[p.id].net }));
  const debt = people.filter(p => by[p.id].net < 0).map(p => ({ id: p.id, amt: -by[p.id].net }));
  const out = [];
  for (const d of debt) {
    const c = cred.find(c => c.amt > 0 && c.amt === d.amt);
    if (c) { out.push({ from: d.id, to: c.id, amt: d.amt }); c.amt = 0; d.amt = 0; }
  }
  const D = debt.filter(d => d.amt > 0).sort((a, b) => b.amt - a.amt);
  const C = cred.filter(c => c.amt > 0).sort((a, b) => b.amt - a.amt);
  let i = 0, j = 0;
  while (i < D.length && j < C.length) {
    const m = Math.min(D[i].amt, C[j].amt);
    if (m > 0) out.push({ from: D[i].id, to: C[j].id, amt: m });
    D[i].amt -= m; C[j].amt -= m;
    if (D[i].amt === 0) i++;
    if (C[j].amt === 0) j++;
  }
  return out;
}
export const roundUp = (satang, baht) => baht ? Math.ceil(satang / (baht * 100)) * baht * 100 : satang;

/*
  คำนวณทั้งบิล
  - share   : ส่วนที่แต่ละคนต้องรับผิดชอบ (รวมเงินสมทบที่ตัวเองออก หักส่วนที่เงินสมทบช่วย)
  - paid    : เงินที่สำรองจ่ายค่ารายการไปก่อน
  - cashOut/cashIn : เงินสมทบที่ยื่นเป็นเงินสดให้กันไปแล้ว
  - sent/received  : การโอนที่กด "โอนแล้ว" ไปแล้ว (ใช้ยอดจริง amt ส่วนที่ปัดเศษเกินถือเป็นของคนรับ)
  net = paid + cashOut − cashIn + sent − received − share   (บวก = รอรับเงิน, ลบ = ต้องโอน)
*/
export function compute(bill) {
  const people = listOf(bill.people);
  const items = listOf(bill.items);
  const contribs = listOf(bill.contribs);
  const payments = listOf(bill.payments);
  const by = {}, catTot = {};
  people.forEach(p => by[p.id] = { share: 0, paid: 0, cats: {}, contrib: 0, sponsored: 0, cashOut: 0, cashIn: 0, sent: 0, received: 0, net: 0 });
  let total = 0, contribTotal = 0;

  for (const it of items) {
    const t = itemTotal(it);
    total += t;
    catTot[it.cat] = (catTot[it.cat] || 0) + t;
    if (by[it.payer]) by[it.payer].paid += t;
    if (!people.length) continue;
    const { list, w } = participants(it, people);
    alloc(t, w).forEach((a, i) => { const b = by[list[i].id]; b.share += a; b.cats[it.cat] = (b.cats[it.cat] || 0) + a; });
  }
  for (const c of contribs) {
    const A = Math.round((Number(c.amt) || 0) * 100);
    if (!(A > 0) || !by[c.from]) continue;
    contribTotal += A;
    by[c.from].share += A; by[c.from].contrib += A;
    const { list, w } = participants(c, people);
    alloc(A, w).forEach((a, i) => { const b = by[list[i].id]; b.share -= a; b.sponsored += a; });
    if (c.handed && c.handed !== c.from && by[c.handed]) { by[c.from].cashOut += A; by[c.handed].cashIn += A; }
  }
  for (const pm of payments) {
    const A = Math.round(Number(pm.amt) || 0);
    if (!(A > 0) || !by[pm.from] || !by[pm.to]) continue;
    by[pm.from].sent += A; by[pm.to].received += A;
  }
  people.forEach(p => { const b = by[p.id]; b.net = b.paid + b.cashOut - b.cashIn + b.sent - b.received - b.share; });

  /* ยอดที่ต้องโอนที่เหลือ ปัดขึ้นตามที่ตั้งไว้ ยอดที่เล็กกว่าหน่วยปัดถือเป็นเศษ ไม่ต้องโอน */
  const step = Number(bill.round) || 0;
  const raw = settle(people, by);
  const transfers = [], crumbs = [];
  for (const t of raw) {
    if (step && t.amt < step * 100) crumbs.push(t);
    else transfers.push(Object.assign({}, t, { pay: roundUp(t.amt, step) }));
  }
  return { people, items, contribs, payments, by, total, contribTotal, catTot, transfers, crumbs };
}

/* ---------- พร้อมเพย์ (มาตรฐาน EMVCo ของ ธปท.) ---------- */
export function ppKind(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '0') return { tag: '01', val: ('0000000000000' + d.replace(/^0/, '66')).slice(-13), digits: d };
  if (d.length === 13) return { tag: '02', val: d, digits: d };
  if (d.length === 15) return { tag: '03', val: d, digits: d };
  return null;
}
export function crc16(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function ppPayload(raw, satang) {
  const k = ppKind(raw); if (!k) return null;
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const body = f('00', '01') + f('01', satang ? '12' : '11') +
    f('29', f('00', 'A000000677010111') + f(k.tag, k.val)) +
    f('58', 'TH') + f('53', '764') + (satang ? f('54', (satang / 100).toFixed(2)) : '') + '6304';
  return body + crc16(body);
}
export function ppPretty(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d;
}
