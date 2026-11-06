// ที่เก็บข้อมูล มี 2 แบบ
// 1) Firebase Firestore — ทุกคนที่มีลิงก์เห็นข้อมูลเดียวกันแบบสด
// 2) โหมดทดลอง — เก็บในเบราว์เซอร์เครื่องนี้ ใช้ตอนยังไม่ได้ใส่ค่า Firebase
// ทั้งสองแบบมีคำสั่งเหมือนกัน: create(id, data, col), subscribe(id, onData, onError, col), update(id, changes, col)
// col คือชื่อคอลเลกชัน 'bills' (บิล, ค่าเริ่มต้น) หรือ 'crews' (วง)
// changes คือ { 'items.abc123': {...}, 'title': 'ชื่อใหม่' } ใส่ DELETE เพื่อลบช่องนั้น

export const DELETE = Symbol('delete');
export const FIREBASE_VERSION = '12.19.0';
const COLS = ['bills', 'crews'];
const checkCol = col => { if (!COLS.includes(col)) throw new Error('unknown collection ' + col); return col; };

export function firebaseConfigured(cfg) {
  return !!(cfg && typeof cfg.apiKey === 'string' && cfg.apiKey.length > 20 && !/ใส่/.test(cfg.apiKey) && cfg.projectId && !/ใส่/.test(cfg.projectId));
}

const defaultLoader = name => import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${name}.js`);

export async function createFirestoreStore(cfg, loader = defaultLoader) {
  const [appMod, fs, authMod] = await Promise.all([loader('firebase-app'), loader('firebase-firestore'), loader('firebase-auth')]);
  const app = appMod.initializeApp(cfg);
  const auth = authMod.getAuth(app);
  await authMod.signInAnonymously(auth);
  const db = fs.getFirestore(app);
  const ref = (id, col) => fs.doc(db, checkCol(col), id);
  const convert = changes => {
    const out = {};
    for (const [k, v] of Object.entries(changes)) out[k] = v === DELETE ? fs.deleteField() : v;
    out.updatedAt = fs.serverTimestamp();
    return out;
  };
  return {
    kind: 'firebase',
    create(id, data, col = 'bills') {
      return fs.setDoc(ref(id, col), Object.assign({}, data, { createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }));
    },
    subscribe(id, onData, onError, col = 'bills') {
      return fs.onSnapshot(ref(id, col), snap => onData(snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null), onError);
    },
    update(id, changes, col = 'bills') {
      return fs.updateDoc(ref(id, col), convert(changes));
    }
  };
}

/* ---------- โหมดทดลอง ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (value === DELETE) delete cur[last];
  else cur[last] = clone(value);
}

export function createLocalStore() {
  const PREFIX = 'kidkalao.demo.';
  const key = (id, col) => (checkCol(col) === 'bills' ? PREFIX + id : PREFIX + col + '.' + id);
  const mem = {};
  const subs = new Map();
  const read = k => {
    try { const s = localStorage.getItem(k); if (s) return JSON.parse(s); } catch (e) { /* ใช้ค่าในหน่วยความจำแทน */ }
    return mem[k] ? clone(mem[k]) : null;
  };
  const write = (k, data) => {
    mem[k] = clone(data);
    try { localStorage.setItem(k, JSON.stringify(data)); } catch (e) { /* เก็บไม่ได้ ใช้หน่วยความจำ */ }
  };
  const emit = k => (subs.get(k) || []).forEach(fn => fn(read(k)));
  try {
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith(PREFIX)) emit(e.key); });
  } catch (e) {}
  return {
    kind: 'local',
    async create(id, data, col = 'bills') { write(key(id, col), Object.assign({}, data, { createdAt: Date.now(), updatedAt: Date.now() })); },
    subscribe(id, onData, onError, col = 'bills') {
      const k = key(id, col);
      const list = subs.get(k) || [];
      list.push(onData); subs.set(k, list);
      Promise.resolve().then(() => onData(read(k)));
      return () => subs.set(k, (subs.get(k) || []).filter(f => f !== onData));
    },
    async update(id, changes, col = 'bills') {
      const k = key(id, col);
      const d = read(k);
      if (!d) throw new Error('ไม่พบข้อมูลนี้');
      for (const [p, v] of Object.entries(changes)) setPath(d, p, v);
      d.updatedAt = Date.now();
      write(k, d); emit(k);
    }
  };
}
