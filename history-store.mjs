import Dexie from 'dexie';

export function createHistoryDatabase(name = 'art-cost-desk-history') {
  const db = new Dexie(name);
  db.version(1).stores({ calculations: '++id, productName, createdAt, updatedAt, fingerprint' });
  return db;
}

export function createHistoryStore(db = createHistoryDatabase()) {
  return {
    async save(snapshot, { fingerprint } = {}) {
      const now = new Date().toISOString();
      const record = {
        id: snapshot.id,
        productName: snapshot.form?.productName || '未命名产品',
        form: structuredClone(snapshot.form || {}),
        snapshot: structuredClone(snapshot),
        fingerprint: fingerprint || '',
        createdAt: snapshot.createdAt || now,
        updatedAt: now
      };
      if (record.fingerprint) {
        const existing = await db.calculations.where('fingerprint').equals(record.fingerprint).first();
        if (existing) return existing;
      }
      const id = await db.calculations.add(record);
      return { ...record, id };
    },
    async list() {
      return db.calculations.orderBy('createdAt').reverse().toArray();
    },
    async get(id) {
      return db.calculations.get(id);
    },
    async remove(id) {
      return db.calculations.delete(id);
    },
    async latest() {
      return db.calculations.orderBy('createdAt').reverse().first();
    },
    async copy(id) {
      const record = await db.calculations.get(id);
      if (!record) return null;
      const copy = structuredClone(record);
      delete copy.id;
      copy.fingerprint = '';
      copy.snapshot = structuredClone(record.snapshot);
      copy.snapshot.copiedFrom = id;
      return copy;
    }
  };
}
