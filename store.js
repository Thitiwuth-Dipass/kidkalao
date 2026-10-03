// ที่เก็บข้อมูลบิล มี 2 แบบ
// 1) Firebase Firestore — ทุกคนที่มีลิงก์เห็นบิลเดียวกันแบบสด
// 2) โหมดทดลอง — เก็บในเบราว์เซอร์เครื่องนี้ ใช้ตอนยังไม่ได้ใส่ค่า Firebase
// ทั้งสองแบบมีคำสั่งเหมือนกัน: create(id, data), subscribe(id, onData, onError), update(id, changes)
// changes คือ { 'items.abc123': {...}, 'title': 'ชื่อใหม่' } ใส่ DELETE เพื่อลบช่องนั้น

export const DELETE = Symbol('delete');
export const FIREBASE_VERSION = '12.19.0';

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
  const ref = id => fs.doc(db, 'bills', id);
  const convert = changes => {
    const out = {};
    for (const [k, v] of Object.entries(changes)) out[k] = v === DELETE ? fs.deleteField() : v;
    out.updatedAt = fs.serverTimestamp();
    return out;
  };
  return {
    kind: 'firebase',
    create(id, data) {
      return fs.setDoc(ref(id), Object.assign({}, data, { createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }));
    },
    subscribe(id, onData, onError) {
      return fs.onSnapshot(ref(id), snap => onData(snap.exists() ? snap.data() : null), onError);
    },
    update(id, changes) {
      return fs.updateDoc(ref(id), convert(changes));
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
  const mem = {};
  const subs = new Map();
  const read = id => {
    try { const s = localStorage.getItem(PREFIX + id); if (s) return JSON.parse(s); } catch (e) { /* ใช้ค่าในหน่วยความจำแทน */ }
    return mem[id] ? clone(mem[id]) : null;
  };
  const write = (id, data) => {
    mem[id] = clone(data);
    try { localStorage.setItem(PREFIX + id, JSON.stringify(data)); } catch (e) { /* เก็บไม่ได้ ใช้หน่วยความจำ */ }
  };
  const emit = id => (subs.get(id) || []).forEach(fn => fn(read(id)));
  try {
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length)); });
  } catch (e) {}
  return {
    kind: 'local',
    async create(id, data) { write(id, Object.assign({}, data, { createdAt: Date.now(), updatedAt: Date.now() })); },
    subscribe(id, onData) {
      const list = subs.get(id) || [];
      list.push(onData); subs.set(id, list);
      Promise.resolve().then(() => onData(read(id)));
      return () => subs.set(id, (subs.get(id) || []).filter(f => f !== onData));
    },
    async update(id, changes) {
      const d = read(id);
      if (!d) throw new Error('ไม่พบบิลนี้');
      for (const [k, v] of Object.entries(changes)) setPath(d, k, v);
      d.updatedAt = Date.now();
      write(id, d); emit(id);
    }
  };
}
