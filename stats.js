// คิดค่าเหล้า — สถิติวง (คำนวณล้วนๆ ไม่ยุ่งกับหน้าจอ)
// เงินทุกจำนวนเป็นสตางค์ เวลาเป็นมิลลิวินาที
import { CATS, listOf, itemTotal } from './calc.js';

export const BEER_PRICE_DEFAULT = 70;   // ราคาเบียร์ขวดใหญ่ที่ใช้เทียบ (บาท) ตั้งใหม่ได้ในหน้าวง
const KRAPAO_PRICE = 50;                // ข้าวกะเพรา 1 จาน (บาท)
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];

/* ---------- เครื่องมือ ---------- */
export const normName = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
export function stableStr(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
}
export const toMillis = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (Number.isFinite(Number(v)) ? Number(v) : 0);
function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3], dow: new Date(+m[1], +m[2] - 1, +m[3]).getDay() } : null;
}
export function monthLabel(y, m) {
  try { return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }); }
  catch (e) { return `${m}/${y + 543}`; }
}
export function duration(ms) {
  if (!(ms > 0)) return '';
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} นาที`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} ชม.`;
  const d = h / 24;
  return `${d < 10 ? (Math.round(d * 10) / 10) : Math.round(d)} วัน`;
}
const pct = (a, b) => (b > 0 ? Math.round(a * 100 / b) : 0);
const fmt = n => new Intl.NumberFormat('en-US').format(n);
/* สถิติแสดงเป็นบาทเต็ม ไม่มีสตางค์ */
const baht = s => fmt(Math.round((Number(s) || 0) / 100));

/* ---------- จับคนในบิลเข้ากับสมาชิกวง ----------
   ใช้บัญชี LINE ก่อน ถ้าไม่มีใช้ชื่อ หนึ่งสมาชิกจับได้กับคนเดียวในบิลเดียวกัน (คนชื่อซ้ำจะได้สมาชิกใหม่) */
export function canonOf(members, mid) {
  let cur = mid;
  for (let i = 0; i < 10 && members[cur] && members[cur].mergedInto && members[members[cur].mergedInto]; i++) cur = members[cur].mergedInto;
  return cur;
}
export function mapPeopleToMembers(peopleList, members, newId) {
  const roster = members || {};
  const assign = {}, newMembers = {}, memberUpdates = {};
  const used = new Set();
  const canon = id => canonOf(roster, id);
  peopleList.forEach(p => { if (p.mid && roster[p.mid]) used.add(canon(p.mid)); });
  /* ค้นทั้งสมาชิกปกติและชื่อที่ถูกรวมไปแล้ว (ชื่อเก่ายังจับได้) โดยให้สมาชิกปกติมาก่อน */
  const all = Object.entries(roster).sort((a, b) => (a[1].mergedInto ? 1 : 0) - (b[1].mergedInto ? 1 : 0));
  const now = Date.now();
  peopleList.forEach((p, i) => {
    if (p.mid && roster[p.mid]) {
      const c = canon(p.mid);
      if (p.lineId && roster[c].lineId !== p.lineId) {
        /* เจ้าตัวยืนยันบัญชี LINE แล้ว และมีสมาชิกที่ผูกบัญชีนี้อยู่ก่อน ให้ย้ายไปเป็นคนนั้น */
        const other = all.find(([id, m]) => m.lineId === p.lineId && canon(id) !== c && !used.has(canon(id)));
        if (other) { const o = canon(other[0]); assign[p.id] = o; used.delete(c); used.add(o); return; }
        if (!roster[c].lineId) memberUpdates[c] = { lineId: p.lineId, pic: p.pic || '' };
      }
      return;
    }
    if (p.mid && !roster[p.mid] && !newMembers[p.mid]) {
      newMembers[p.mid] = memberFrom(p, now + i);
      used.add(p.mid);
      return;
    }
    let hit = null;
    if (p.lineId) hit = all.find(([id, m]) => m.lineId === p.lineId && !used.has(canon(id)));
    if (!hit && normName(p.name)) hit = all.find(([id, m]) => {
      const c = canon(id), cl = roster[c].lineId;
      return !used.has(c) && normName(m.name) === normName(p.name) && (!cl || !p.lineId || cl === p.lineId);
    });
    if (hit) {
      const c = canon(hit[0]);
      assign[p.id] = c; used.add(c);
      if (p.lineId && !roster[c].lineId) memberUpdates[c] = { lineId: p.lineId, pic: p.pic || '' };
    } else {
      const id = newId();
      newMembers[id] = memberFrom(p, now + i);
      assign[p.id] = id; used.add(id);
    }
  });
  return { assign, newMembers, memberUpdates };
}
function memberFrom(p, order) {
  const m = { name: String(p.name || '').trim().slice(0, 30) || 'ไม่มีชื่อ', order };
  if (p.lineId) { m.lineId = p.lineId; m.pic = p.pic || ''; }
  if (p.pp) m.pp = String(p.pp).slice(0, 20);
  return m;
}

/* ---------- แนะนำชื่อที่น่าจะเป็นคนเดียวกัน ----------
   ตัดคำนำหน้า (พี่ น้อง ไอ้ ...) วงเล็บ และตัวเลขหรือเครื่องหมายท้ายชื่อ แล้วเทียบแก่นของชื่อ
   ไม่รวมให้อัตโนมัติ เพราะ "พี่สุย" กับ "น้องสุย" อาจเป็นคนละคนจริง */
const PREFIXES = ['พี่', 'น้อง', 'ไอ้', 'คุณ', 'เฮีย', 'เจ๊', 'ป๋า', 'ลุง', 'ป้า', 'น้า', 'หนู', 'อาจารย์', 'จารย์', "p'", 'p’', 'p.'];
export function nameCore(name) {
  let s = normName(name).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').trim();
  for (let again = true; again;) {
    again = false;
    for (const pre of PREFIXES) {
      if (s.startsWith(pre)) {
        const rest = s.slice(pre.length).trim();
        if (Array.from(rest).length >= 2) { s = rest; again = true; }
      }
    }
  }
  s = s.replace(/[\s0-9๐-๙_.\-+*#!?~'’"]+$/u, '').replace(/\s+/g, '');
  return Array.from(s).length >= 2 ? s : '';
}
export function mergeSuggestions(crew) {
  const ms = (crew && crew.members) || {};
  const dismissed = ((crew && crew.settings) || {}).notSame || {};
  const count = {}, together = new Set();
  Object.values((crew && crew.bills) || {}).forEach(b => {
    const ids = [...new Set(Object.keys(b.p || {}).map(m => canonOf(ms, m)))];
    ids.forEach(m => { count[m] = (count[m] || 0) + 1; });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) together.add(pairKey(ids[i], ids[j]));
  });
  const groups = {};
  Object.entries(ms).forEach(([id, m]) => {
    if (m.mergedInto || !count[id]) return;
    const core = nameCore(m.name);
    if (core) (groups[core] = groups[core] || []).push(id);
  });
  const out = [];
  Object.values(groups).forEach(ids => {
    if (ids.length < 2) return;
    /* ปลายทาง: คนที่ผูกบัญชี LINE ก่อน แล้วคนที่อยู่ในบิลมากสุด แล้วชื่อสั้นสุด */
    const target = ids.slice().sort((a, b) => (ms[b].lineId ? 1 : 0) - (ms[a].lineId ? 1 : 0) || (count[b] || 0) - (count[a] || 0) ||
      Array.from(ms[a].name || '').length - Array.from(ms[b].name || '').length)[0];
    /* คนที่เคยอยู่บิลเดียวกันถือว่าคนละคน จึงไม่แนะนำให้รวม */
    const accepted = [target];
    ids.filter(id => id !== target).sort((a, b) => (count[b] || 0) - (count[a] || 0)).forEach(id => {
      if (ms[id].lineId && ms[target].lineId && ms[id].lineId !== ms[target].lineId) return;   // คนละบัญชี LINE แน่นอน
      if (dismissed[pairKey(id, target)]) return;
      if (accepted.some(a => together.has(pairKey(a, id)))) return;
      accepted.push(id);
      out.push({ from: id, to: target, fromName: ms[id].name, toName: ms[target].name });
    });
  });
  return out;
}
export const pairKey = (a, b) => [a, b].sort().join('_');

/* ---------- สรุปบิล 1 ใบ เก็บไว้ในเอกสารของวง ----------
   คีย์สั้นเพื่อให้เอกสารวงเล็ก: t ชื่อ, d วันที่, c เวลาสร้าง, tot ยอดรวม, ctb เงินสมทบ, cat ยอดตามหมวด,
   p รายคน { s ส่วนที่ต้องจ่าย, f สำรองจ่าย, tr เลี้ยง+สมทบ, d ดื่ม, w สัดส่วน, dr ส่วนค่าเหล้า, fd ส่วนค่าอาหาร, m เหรียญ, at โอนครั้งล่าสุด, ow ยังค้าง },
   st เคลียร์ครบ, sa เวลาที่เคลียร์ครบ, lp คนโอนคนสุดท้าย, np จำนวนการโอน */
export function billSummary(bill, calc, createdAt) {
  const pid2mid = {};
  calc.people.forEach(p => { if (p.mid) pid2mid[p.id] = p.mid; });
  const p = {};
  calc.people.forEach(per => {
    const mid = per.mid; if (!mid) return;
    const b = calc.by[per.id];
    const cur = p[mid] || (p[mid] = { s: 0, f: 0, tr: 0, d: 0, w: 1, dr: 0, fd: 0, m: 0, at: 0, ow: 0 });
    cur.s += b.share; cur.f += b.paid;
    cur.dr += b.cats.drink || 0; cur.fd += b.cats.food || 0;
    cur.d = per.drinks ? 1 : cur.d;
    cur.w = Number(per.weight); if (!Number.isFinite(cur.w)) cur.w = 1;
  });
  calc.items.forEach(it => {
    if (it.mode === 'treat' && pid2mid[it.treater]) p[pid2mid[it.treater]].tr += itemTotal(it);
  });
  calc.contribs.forEach(c => {
    const A = Math.round((Number(c.amt) || 0) * 100);
    if (A > 0 && pid2mid[c.from]) p[pid2mid[c.from]].tr += A;
  });
  /* เหรียญ 3 คนแรกที่โอน และคนโอนคนสุดท้าย */
  const pays = calc.payments.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const ranked = [];
  pays.forEach(pm => {
    const mid = pid2mid[pm.from]; if (!mid) return;
    if (!ranked.includes(mid) && ranked.length < 3) { ranked.push(mid); p[mid].m = ranked.length; }
    p[mid].at = Math.max(p[mid].at, Number(pm.at) || 0);
  });
  calc.transfers.forEach(t => { const mid = pid2mid[t.from]; if (mid) p[mid].ow += t.pay; });
  const cat = {};
  CATS.forEach(c => { if (calc.catTot[c.id]) cat[c.id] = calc.catTot[c.id]; });
  const settled = calc.transfers.length === 0;
  const last = pays.length ? pays[pays.length - 1] : null;
  const out = {
    t: String(bill.title || '').slice(0, 60), d: bill.date || '', c: createdAt || 0,
    tot: calc.total, ctb: calc.contribTotal, cat, p,
    st: settled ? 1 : 0, np: pays.length
  };
  if (settled && last) { out.sa = Number(last.at) || 0; if (pid2mid[last.from]) out.lp = pid2mid[last.from]; }
  return out;
}

/* ---------- ช่วงเวลา ---------- */
export function periodsOf(crew) {
  const bills = Object.values((crew && crew.bills) || {});
  const months = new Set(), years = new Set();
  bills.forEach(b => { const d = parseDate(b.d); if (d) { months.add(`${d.y}-${String(d.m).padStart(2, '0')}`); years.add(d.y); } });
  const out = [...months].sort().reverse().map(k => { const [y, m] = k.split('-').map(Number); return { key: 'm:' + k, kind: 'month', label: monthLabel(y, m) }; });
  [...years].sort().reverse().forEach(y => out.push({ key: 'y:' + y, kind: 'year', label: 'ปี ' + (y + 543) }));
  out.push({ key: 'all', kind: 'all', label: 'ทั้งหมด' });
  return out;
}
function inPeriod(key, date) {
  const d = parseDate(date); if (!d) return key === 'all';
  if (key === 'all') return true;
  if (key.startsWith('y:')) return d.y === Number(key.slice(2));
  if (key.startsWith('m:')) { const [y, m] = key.slice(2).split('-').map(Number); return d.y === y && d.m === m; }
  return false;
}
function prevKey(key) {
  if (key.startsWith('m:')) { let [y, m] = key.slice(2).split('-').map(Number); m--; if (!m) { m = 12; y--; } return `m:${y}-${String(m).padStart(2, '0')}`; }
  if (key.startsWith('y:')) return 'y:' + (Number(key.slice(2)) - 1);
  return null;
}
function periodEnd(key) {
  if (key.startsWith('m:')) return key.slice(2) + '-31';
  if (key.startsWith('y:')) return key.slice(2) + '-12-31';
  return '9999-12-31';
}
const WORDS = {
  month: { total: 'ทั้งเดือน', suffix: 'ประจำเดือน', prev: 'เดือนก่อน' },
  year: { total: 'ทั้งปี', suffix: 'ประจำปี', prev: 'ปีก่อน' },
  all: { total: 'ทั้งหมด', suffix: 'ตลอดกาล', prev: '' }
};

/* ---------- คำนวณสถิติทั้งหมดของช่วงเวลา ---------- */
export function computeStats(crew, periodKey) {
  const members = (crew && crew.members) || {};
  const settings = (crew && crew.settings) || {};
  const beerPrice = Number(settings.beerPrice) > 0 ? Number(settings.beerPrice) : BEER_PRICE_DEFAULT;
  const allBills = Object.entries((crew && crew.bills) || {})
    .map(([id, b]) => Object.assign({ id }, b))
    .filter(b => b && b.tot > 0)
    .sort((a, b) => (a.d || '').localeCompare(b.d || '') || (a.c || 0) - (b.c || 0));
  const period = periodsOf(crew).find(x => x.key === periodKey) || { key: 'all', kind: 'all', label: 'ทั้งหมด' };
  const W = WORDS[period.kind];
  const bills = allBills.filter(b => inPeriod(period.key, b.d));
  const canon = mid => canonOf(members, mid);
  const nameOf = mid => ((members[mid] && members[mid].name) || 'ไม่มีชื่อ').trim() || 'ไม่มีชื่อ';
  const peopleOf = b => {           // รวมคนที่ถูกรวมเป็นคนเดียวกันแล้ว
    const out = {};
    Object.entries(b.p || {}).forEach(([mid, x]) => {
      const c = canon(mid);
      const cur = out[c] || (out[c] = { s: 0, f: 0, tr: 0, d: 0, w: x.w, dr: 0, fd: 0, m: 0, at: 0, ow: 0 });
      ['s', 'f', 'tr', 'dr', 'fd', 'ow'].forEach(k => { cur[k] += Number(x[k]) || 0; });
      cur.d = cur.d || x.d; cur.m = cur.m && x.m ? Math.min(cur.m, x.m) : (cur.m || x.m || 0); cur.at = Math.max(cur.at, x.at || 0);
    });
    return out;
  };
  const headcount = b => Object.keys(peopleOf(b)).length;

  /* ภาพรวม */
  const count = bills.length;
  const total = bills.reduce((a, b) => a + b.tot, 0);
  const cats = {};
  bills.forEach(b => Object.entries(b.cat || {}).forEach(([k, v]) => { cats[k] = (cats[k] || 0) + v; }));
  const attendTotal = bills.reduce((a, b) => a + headcount(b), 0);
  let delta = null;
  const pk = prevKey(period.key);
  if (pk) {
    const prev = allBills.filter(b => inPeriod(pk, b.d)).reduce((a, b) => a + b.tot, 0);
    if (prev > 0 && total > 0) {
      const d = Math.round((total - prev) * 100 / prev);
      delta = d > 0 ? `📈 มากกว่า${W.prev} ${d}%` : d < 0 ? `📉 น้อยกว่า${W.prev} ${-d}%` : `➖ เท่ากับ${W.prev}`;
    }
  }
  const drink = cats.drink || 0;
  const facts = [], moreFacts = [];
  const beers = Math.round(drink / (beerPrice * 100));
  if (beers >= 1) facts.push(`🍺 ค่าเหล้าเทียบเท่าเบียร์ขวดใหญ่ราว ${fmt(beers)} ขวด`);
  if (count >= 2) {
    const dow = {};
    bills.forEach(b => { const d = parseDate(b.d); if (d) dow[d.dow] = (dow[d.dow] || 0) + 1; });
    const best = Object.entries(dow).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) facts.push(`📅 วันโปรด: ${DAYS[best[0]]} (${best[1]} จาก ${count} วง)`);
  }
  const krapao = Math.round(total / (KRAPAO_PRICE * 100));
  if (krapao >= 1) facts.push(`🍛 เท่ากับข้าวกะเพรา ${fmt(krapao)} จาน`);
  if (drink) moreFacts.push(`ค่าเหล้าคิดเป็น ${pct(drink, total)}% ของยอดรวม`);
  let drinkAttend = 0;
  bills.forEach(b => Object.values(peopleOf(b)).forEach(x => { if (x.d) { drinkAttend++; } }));
  if (drink && drinkAttend) moreFacts.push(`ค่าเหล้าเฉลี่ยคนละ ${baht(Math.round(drink / drinkAttend))} บาทต่อวง (นับเฉพาะคนดื่ม)`);
  if (period.kind !== 'month' && count) {
    const byMonth = {};
    bills.forEach(b => { const d = parseDate(b.d); if (d) { const k = `${d.y}-${d.m}`; byMonth[k] = (byMonth[k] || 0) + b.tot; } });
    const top = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
    if (top && Object.keys(byMonth).length >= 2) { const [y, m] = top[0].split('-').map(Number); moreFacts.push(`เดือนที่หนักที่สุด: ${monthLabel(y, m)} (${baht(top[1])} บาท)`); }
  }

  /* ทำเนียบบิล */
  const billTitle = b => (b.t || '').trim() || 'บิลไม่มีชื่อ';
  const shortDate = iso => { const d = parseDate(iso); if (!d) return ''; try { return new Date(d.y, d.m - 1, d.d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch (e) { return iso; } };
  const topBills = bills.slice().sort((a, b) => b.tot - a.tot).slice(0, 3)
    .map(b => ({ id: b.id, title: billTitle(b), sub: [shortDate(b.d), `${headcount(b)} คน`].filter(Boolean).join(' · '), total: baht(b.tot) }));
  const billAwards = [];
  if (count >= 2) {
    const big = bills.slice().sort((a, b) => headcount(b) - headcount(a) || b.tot - a.tot)[0];
    billAwards.push({ key: 'biggest', icon: '👥', label: 'วงใหญ่สุด', name: billTitle(big), detail: shortDate(big.d), value: `${headcount(big)} คน` });
    const perHeadOf = b => Math.round(b.tot / Math.max(1, headcount(b)));
    const pricey = bills.slice().sort((a, b) => perHeadOf(b) - perHeadOf(a))[0];
    billAwards.push({ key: 'pricey', icon: '💸', label: 'แพงต่อหัวสุด', name: billTitle(pricey), detail: shortDate(pricey.d), value: `${baht(perHeadOf(pricey))}/คน` });
    const hard = bills.filter(b => (b.cat || {}).drink > 0).sort((a, b) => b.cat.drink / b.tot - a.cat.drink / a.tot)[0];
    if (hard) {
      const p = pct(hard.cat.drink, hard.tot);
      billAwards.push({ key: 'hard', icon: '🍺', label: 'บิลสายแข็ง', name: billTitle(hard), detail: p > 50 ? 'ค่าเหล้าเกินครึ่งบิล' : 'สัดส่วนค่าเหล้าสูงสุด', value: `${p}%` });
    }
    const cleared = bills.filter(b => b.st && b.np > 0 && b.c > 0 && b.sa > b.c).map(b => Object.assign({ dur: b.sa - b.c }, b)).sort((a, b) => a.dur - b.dur);
    if (cleared.length) billAwards.push({ key: 'fast', icon: '⚡', label: 'เคลียร์ไวสุด', name: billTitle(cleared[0]), detail: 'โอนครบทุกคน', value: duration(cleared[0].dur) });
    if (cleared.length >= 2) { const s = cleared[cleared.length - 1]; billAwards.push({ key: 'slow', icon: '🐌', label: 'เคลียร์ช้าสุด', name: billTitle(s), detail: 'กว่าจะโอนครบ', value: duration(s.dur) }); }
  }

  /* สะสมรายคน */
  const P = {};
  const get = mid => P[mid] || (P[mid] = { mid, attend: 0, s: 0, f: 0, fN: 0, tr: 0, dr: 0, fd: 0, gold: 0, dry: 0, half: 0, last: 0, delays: [], present: [] });
  bills.forEach((b, i) => {
    const ppl = peopleOf(b);
    Object.entries(ppl).forEach(([mid, x]) => {
      const r = get(mid);
      r.attend++; r.s += x.s; r.f += x.f; if (x.f > 0) r.fN++; r.tr += x.tr; r.dr += x.dr; r.fd += x.fd;
      if (x.m === 1) r.gold++;
      if (!x.d) r.dry++;
      if (x.w > 0 && x.w < 1) r.half++;
      if (x.at > 0 && b.c > 0 && x.at > b.c) r.delays.push(x.at - b.c);
      r.present.push(i);
    });
    if (b.st && b.np > 0 && b.lp) get(canon(b.lp)).last++;
  });
  const rows = Object.values(P);
  const names = mids => {
    const n = mids.map(nameOf);
    if (n.length <= 2) return n.join(' & ');
    if (n.length === 3) return `${n[0]}, ${n[1]} & ${n[2]}`;
    return `${n[0]}, ${n[1]} และอีก ${n.length - 2} คน`;
  };
  const best = (key, min = 1) => {
    const mx = Math.max(0, ...rows.map(r => r[key]));
    if (!(mx >= min)) return null;
    const w = rows.filter(r => r[key] === mx).sort((a, b) => b.s - a.s);
    return { mids: w.map(r => r.mid), v: mx, row: w[0] };
  };

  const praise = [];
  if (count >= 2) {
    const a = best('attend', 1);
    if (a) praise.push({ key: 'regular', icon: '🪑', label: 'ขาประจำ', name: names(a.mids), detail: a.v === count ? 'มาครบทุกวง ไม่เคยขาด' : `มา ${a.v} จาก ${count} วง`, value: `${a.v}/${count}` });
  }
  const pushTop = (list, key, icon, label, detail, value, min = 1) => {
    const w = best(key, min); if (!w) return;
    list.push({ key, icon, label, name: names(w.mids), detail: typeof detail === 'function' ? detail(w) : detail, value: value(w) });
  };
  pushTop(praise, 's', '💰', 'กระเป๋าตังค์ของวง', 'ยอดจ่ายรวมสูงสุด', w => baht(w.v));
  pushTop(praise, 'f', '🏦', 'ธนาคารประจำวง', w => `สำรองจ่ายไปก่อน ${w.row.fN} ครั้ง`, w => baht(w.v));
  pushTop(praise, 'tr', '🎁', 'สายเลี้ยง', 'เลี้ยงและสมทบรวม', w => baht(w.v));
  pushTop(praise, 'dr', '🍻', 'คอทองแดง', 'ส่วนค่าเหล้ารวมสูงสุด', w => baht(w.v));
  pushTop(praise, 'fd', '🍗', 'สายกับแกล้ม', 'ส่วนค่ากับแกล้มรวมสูงสุด', w => baht(w.v));
  pushTop(praise, 'gold', '🥇', 'เจ้าแห่งความไว', 'ได้เหรียญทองโอนไว', w => `×${w.v}`);
  /* คู่หู */
  if (count >= 2) {
    const pairs = {};
    bills.forEach(b => {
      const ids = Object.keys(peopleOf(b)).sort();
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] + '|' + ids[j]; pairs[k] = (pairs[k] || 0) + 1; }
    });
    const mx = Math.max(0, ...Object.values(pairs));
    const top = Object.entries(pairs).filter(([, v]) => v === mx);
    if (mx >= 2 && top.length <= 3) {
      const [x, y] = top[0][0].split('|');
      praise.push({ key: 'duo', icon: '💞', label: 'คู่หูตัวติด', name: `${nameOf(x)} & ${nameOf(y)}`, detail: 'มาวงเดียวกัน', value: `${mx} วง` });
    }
  }
  /* มาติดกัน */
  rows.forEach(r => { let run = 0, bestRun = 0, prev = -2; r.present.forEach(i => { run = i === prev + 1 ? run + 1 : 1; prev = i; bestRun = Math.max(bestRun, run); }); r.streak = bestRun; });
  pushTop(praise, 'streak', '🔥', 'มาติดกัน', w => w.v === count ? 'ไม่ขาดสักวง' : `มาติดกัน ${w.v} วง`, w => `${w.v} วง`, 3);

  const tease = [];
  /* จอมดอง */
  rows.forEach(r => { r.avgDelay = r.delays.length ? r.delays.reduce((a, b) => a + b, 0) / r.delays.length : 0; });
  const settledN = bills.filter(b => b.st && b.np > 0).length;
  const slow = best('last', 1);
  if (slow) {
    const r = rows.find(x => x.mid === slow.mids[0]);
    tease.push({ key: 'slowpoke', icon: '🐢', label: 'จอมดอง', name: names(slow.mids), detail: `โอนเป็นคนสุดท้าย ${slow.v} จาก ${settledN} วง`, value: r && r.avgDelay ? duration(r.avgDelay) : '' });
  } else {
    const d = best('avgDelay', 1);
    if (d && rows.filter(r => r.avgDelay > 0).length >= 2) tease.push({ key: 'slowpoke', icon: '🐢', label: 'จอมดอง', name: names(d.mids), detail: 'ใช้เวลาโอนนานที่สุด', value: duration(d.v) });
  }
  /* หายสาบสูญ: นับจากบิลทั้งหมดของวงจนถึงท้ายช่วงเวลา */
  const upto = allBills.filter(b => (b.d || '') <= periodEnd(period.key));
  const lastSeen = {};
  upto.forEach((b, i) => Object.keys(peopleOf(b)).forEach(mid => { lastSeen[mid] = i; }));
  const gone = Object.entries(lastSeen).map(([mid, i]) => ({ mid, n: upto.length - 1 - i })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n);
  if (gone.length) {
    const g = gone.filter(x => x.n === gone[0].n).map(x => x.mid);
    tease.push({ key: 'ghost', icon: '🕵️', label: 'หายสาบสูญ', name: names(g), detail: `ไม่โผล่มา ${gone[0].n} วงติด ยังหายใจอยู่ไหม?`, value: `${gone[0].n} วง` });
  }
  pushTop(tease, 'dry', '🧃', 'สายสุขภาพ', w => w.mids.length === 1 && w.v === w.row.attend ? `มา ${w.v} วง ไม่ดื่มเลยสักแก้ว 👏` : `ไม่ดื่ม ${w.v} จาก ${w.row.attend} วงที่มา`, w => `${w.v} วง`);
  pushTop(tease, 'half', '👻', 'มาครึ่งทาง', 'ใช้สิทธิ์จ่ายครึ่งเดียว', w => `${w.v} ครั้ง`);
  /* ลูกหนี้: ยอดค้างตอนนี้ รวมทุกบิลของวง */
  const owe = {};
  allBills.forEach(b => Object.entries(peopleOf(b)).forEach(([mid, x]) => { if (x.ow > 0) owe[mid] = (owe[mid] || 0) + x.ow; }));
  const oweTop = Object.entries(owe).sort((a, b) => b[1] - a[1]);
  if (oweTop.length) {
    const w = oweTop.filter(x => x[1] === oweTop[0][1]).map(x => x[0]);
    tease.push({ key: 'debtor', icon: '💸', label: 'ลูกหนี้ตัวท็อป', name: names(w), detail: 'ยังค้างโอนรวมทุกบิล', value: baht(oweTop[0][1]) });
  }

  /* ตารางรายคน */
  const table = rows.map(r => ({ mid: r.mid, name: nameOf(r.mid), attend: r.attend, share: r.s, fronted: r.f, gold: r.gold, owe: owe[r.mid] || 0 }))
    .sort((a, b) => b.attend - a.attend || b.share - a.share);

  const teaser = tease.find(x => x.key === 'slowpoke') ? `🐢 จอมดอง${W.suffix}: ${tease.find(x => x.key === 'slowpoke').name}`
    : tease.find(x => x.key === 'debtor') ? `💸 ลูกหนี้ตัวท็อป: ${tease.find(x => x.key === 'debtor').name}`
    : topBills.length ? `🏆 บิลแห่งความพัง: ${topBills[0].title}` : '';

  return {
    crewName: ((crew && crew.name) || '').trim() || 'วงไม่มีชื่อ',
    period, words: W, count, total, delta, beerPrice,
    perBill: count ? Math.round(total / count) : 0,
    perHead: attendTotal ? Math.round(total / attendTotal) : 0,
    cats: CATS.filter(c => cats[c.id]).map(c => ({ id: c.id, label: c.label, amt: cats[c.id] })).sort((a, b) => b.amt - a.amt),
    facts, moreFacts, topBills, billAwards, praise, tease, table, teaser,
    unsettled: bills.filter(b => !b.st).length
  };
}

/* ---------- การ์ดส่งเข้ากลุ่ม LINE (carousel) ---------- */
const C = {
  ink: '#13222A', muted: '#566870', line: '#E3E8EA', soft: '#F2F6F7',
  amber: '#A85F00', amberSoft: '#FBEBD1', green: '#1F7346', greenSoft: '#E3F4E8',
  red: '#B8432F', redSoft: '#FDEBE7', white: '#FFFFFF'
};
const CAT_COLOR = { drink: '#D9850B', mixer: '#2793A8', food: '#C4553A', room: '#7457BD', travel: '#4D8A39', other: '#86939A' };
const tx = (text, o = {}) => Object.assign({ type: 'text', text: String(text) }, o);
const bx = (layout, contents, o = {}) => Object.assign({ type: 'box', layout, contents: contents.filter(Boolean) }, o);

function fxHeader(bg, eyebrow, title, page) {
  return bx('vertical', [
    bx('horizontal', [
      tx(eyebrow, { size: 'xs', color: '#FFFFFFCC', flex: 1, wrap: true }),
      page && tx(page, { size: 'xs', color: '#FFFFFF99', flex: 0, align: 'end' })
    ]),
    tx(title, { size: 'xl', weight: 'bold', color: C.white, wrap: true })
  ], { backgroundColor: bg, paddingAll: '20px', spacing: 'xs' });
}
const fxFooter = (color, link) => bx('vertical', [
  { type: 'button', style: 'primary', color, height: 'sm', action: { type: 'uri', label: 'ดูสถิติเต็ม', uri: link } }
], { paddingAll: '16px', paddingTop: '0px' });
function fxAward(a, tint, accent) {
  return bx('horizontal', [
    bx('vertical', [tx(a.icon, { size: 'lg', align: 'center' })],
      { width: '40px', height: '40px', cornerRadius: '20px', backgroundColor: tint, justifyContent: 'center', alignItems: 'center', flex: 0 }),
    bx('vertical', [
      tx(a.label, { size: 'xxs', color: accent, weight: 'bold' }),
      tx(a.name, { size: 'md', weight: 'bold', color: C.ink, wrap: true }),
      a.detail && tx(a.detail, { size: 'xxs', color: C.muted, wrap: true })
    ], { flex: 1 }),
    a.value && tx(a.value, { size: 'sm', weight: 'bold', color: accent, flex: 0, align: 'end', gravity: 'center' })
  ], { spacing: 'md', alignItems: 'center' });
}

export function statsMessage(s, link) {
  const eyebrow = `${s.crewName} · ${s.period.label}`;
  const pages = [];
  /* 1. ภาพรวม */
  const tile = (value, label) => bx('vertical', [
    tx(value, { size: 'lg', weight: 'bold', color: C.ink, align: 'center' }),
    tx(label, { size: 'xxs', color: C.muted, align: 'center' })
  ], { backgroundColor: C.soft, cornerRadius: 'md', paddingAll: '10px', flex: 1 });
  pages.push(page => ({
    type: 'bubble', size: 'mega',
    header: fxHeader(C.ink, eyebrow, `📊 สรุปสถิติวง${s.words.suffix}`, page),
    body: bx('vertical', [
      tx(`ยอดรวม${s.words.total}`, { size: 'xs', color: C.muted }),
      tx(`${baht(s.total)} บาท`, { size: 'xxl', weight: 'bold', color: C.ink }),
      s.delta && tx(s.delta, { size: 'xs', color: C.amber, weight: 'bold' }),
      bx('horizontal', [tile(String(s.count), 'ตั้งวง'), tile(baht(s.perBill), 'เฉลี่ย/วง'), tile(baht(s.perHead), 'เฉลี่ย/หัว')], { spacing: 'sm', margin: 'lg' }),
      s.cats.length && tx('ใช้ไปกับอะไรบ้าง', { size: 'sm', weight: 'bold', color: C.ink, margin: 'xl' }),
      s.cats.length && bx('horizontal', s.cats.map(c => bx('vertical', [], { flex: Math.max(1, Math.round(c.amt / 100)), backgroundColor: CAT_COLOR[c.id] || CAT_COLOR.other })),
        { height: '10px', cornerRadius: '5px', spacing: 'xs', margin: 'sm' }),
      s.cats.length && bx('vertical', s.cats.map(c => bx('horizontal', [
        bx('vertical', [], { width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: CAT_COLOR[c.id] || CAT_COLOR.other, flex: 0 }),
        tx(c.label, { size: 'xs', color: C.muted, flex: 1 }),
        tx(baht(c.amt), { size: 'xs', color: C.ink, weight: 'bold', flex: 0, align: 'end' })
      ], { spacing: 'sm', alignItems: 'center' })), { spacing: 'xs', margin: 'md' }),
      s.facts.length && bx('vertical', s.facts.map(f => tx(f, { size: 'sm', color: C.amber, wrap: true })),
        { backgroundColor: C.amberSoft, cornerRadius: 'md', paddingAll: '12px', spacing: 'xs', margin: 'xl' })
    ], { paddingAll: '20px' }),
    footer: fxFooter(C.amber, link)
  }));
  /* 2. ทำเนียบบิล */
  if (s.topBills.length) {
    const MEDAL = ['🥇', '🥈', '🥉'];
    pages.push(page => ({
      type: 'bubble', size: 'mega',
      header: fxHeader(C.amber, eyebrow, '🏆 ทำเนียบบิล', page),
      body: bx('vertical', [
        tx('บิลแห่งความพัง', { size: 'sm', weight: 'bold', color: C.ink }),
        bx('vertical', s.topBills.map((b, i) => bx('horizontal', [
          tx(MEDAL[i], { size: 'xl', flex: 0, gravity: 'center' }),
          bx('vertical', [tx(b.title, { size: 'sm', weight: 'bold', color: C.ink, wrap: true }), tx(b.sub || ' ', { size: 'xxs', color: C.muted })], { flex: 1 }),
          tx(b.total, { size: i === 0 ? 'lg' : 'md', weight: 'bold', color: i === 0 ? C.amber : C.ink, flex: 0, align: 'end', gravity: 'center' })
        ], { spacing: 'md', alignItems: 'center', paddingAll: '10px', cornerRadius: 'md', backgroundColor: i === 0 ? C.amberSoft : C.white })), { spacing: 'xs', margin: 'sm' }),
        s.billAwards.length && { type: 'separator', margin: 'lg', color: C.line },
        s.billAwards.length && bx('vertical', s.billAwards.map(a => fxAward(a, C.amberSoft, C.amber)), { spacing: 'lg', margin: 'lg' })
      ], { paddingAll: '20px' }),
      footer: fxFooter(C.amber, link)
    }));
  }
  /* 3. ทำเนียบคน */
  if (s.praise.length) pages.push(page => ({
    type: 'bubble', size: 'mega',
    header: fxHeader(C.green, eyebrow, '🎖️ ทำเนียบคนเด่น', page),
    body: bx('vertical', s.praise.map(a => fxAward(a, C.greenSoft, C.green)), { paddingAll: '20px', spacing: 'lg' }),
    footer: fxFooter(C.green, link)
  }));
  /* 4. รางวัลแซว */
  if (s.tease.length) pages.push(page => ({
    type: 'bubble', size: 'mega',
    header: fxHeader(C.red, eyebrow, `🙈 รางวัลแซว${s.words.suffix}`, page),
    body: bx('vertical', [
      ...s.tease.map(a => fxAward(a, C.redSoft, C.red)),
      tx('คำนวณจากบิลจริง ห้ามเถียง 😆', { size: 'xxs', color: C.muted, align: 'center', margin: 'xl' })
    ], { paddingAll: '20px', spacing: 'lg' }),
    footer: fxFooter(C.red, link)
  }));
  const n = pages.length;
  const bubbles = pages.map((f, i) => f(n > 1 ? `${i + 1}/${n}` : ''));
  return {
    type: 'flex',
    altText: `สรุปสถิติวง ${s.crewName} ${s.period.label} · ${baht(s.total)} บาท${s.teaser ? ' · ' + s.teaser : ''}`.slice(0, 380),
    contents: n > 1 ? { type: 'carousel', contents: bubbles } : bubbles[0]
  };
}

/* ข้อความล้วน ใช้ตอนส่งการ์ดไม่ได้ */
export function statsText(s, link) {
  const out = [];
  out.push(`📊 สรุปสถิติวง ${s.crewName} · ${s.period.label}`);
  out.push(`ยอดรวม${s.words.total} ${baht(s.total)} บาท · ตั้งวง ${s.count} ครั้ง · เฉลี่ยวงละ ${baht(s.perBill)} · หัวละ ${baht(s.perHead)}`);
  if (s.delta) out.push(s.delta);
  s.facts.forEach(f => out.push(f));
  if (s.topBills.length) {
    out.push('', '🏆 บิลแห่งความพัง');
    s.topBills.forEach((b, i) => out.push(`${['🥇', '🥈', '🥉'][i]} ${b.title} ${b.total} บาท`));
  }
  const sec = (title, list) => { if (!list.length) return; out.push('', title); list.forEach(a => out.push(`${a.icon} ${a.label}: ${a.name}${a.value ? ` (${a.value})` : ''}`)); };
  sec('🏅 รางวัลบิล', s.billAwards);
  sec('🎖️ ทำเนียบคนเด่น', s.praise);
  sec(`🙈 รางวัลแซว${s.words.suffix}`, s.tease);
  if (link) out.push('', 'ดูสถิติเต็ม: ' + link);
  return out.join('\n');
}

export { listOf };
