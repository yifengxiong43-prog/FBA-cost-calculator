import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createHistoryDatabase, createHistoryStore } from '../history-store.mjs';
import { buildReportSnapshot } from '../report-data.mjs';

let db;
let store;
beforeEach(() => {
  db = createHistoryDatabase(`test-history-${Date.now()}-${Math.random()}`);
  store = createHistoryStore(db);
});
afterEach(async () => db.delete());

function snapshot(weight = '800') {
  return buildReportSnapshot({ form: { productName: '马克笔', weight, feeDate: '2027-02-10' }, countries: [], rates: { EUR: 7 } });
}

test('history saves, reads latest, copies parameters and deletes records', async () => {
  const saved = await store.save(snapshot(), { fingerprint: 'one' });
  assert.ok(saved.id);
  assert.equal((await store.latest()).snapshot.form.productName, '马克笔');
  const copied = await store.copy(saved.id);
  assert.equal(copied.id, undefined);
  assert.equal(copied.snapshot.form.weight, '800');
  assert.equal(copied.fingerprint, '');
  await store.remove(saved.id);
  assert.equal(await store.get(saved.id), undefined);
  assert.equal((await store.list()).length, 0);
});

test('same fingerprint does not save a duplicate and snapshots keep old rates', async () => {
  const first = await store.save(snapshot('800'), { fingerprint: 'same' });
  const duplicate = await store.save(snapshot('800'), { fingerprint: 'same' });
  assert.equal(duplicate.id, first.id);
  const later = await store.save(snapshot('900'), { fingerprint: 'new' });
  later.snapshot.rates.EUR = 99;
  const storedFirst = await store.get(first.id);
  assert.equal(storedFirst.snapshot.rates.EUR, 7);
});
