import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSnapshot, fieldSnapshot, parseDisplayedAmount, snapshotFingerprint, COUNTRY_DEFINITIONS } from '../report-data.mjs';

test('report mappings read all four air freight result fields', () => {
  assert.deepEqual(COUNTRY_DEFINITIONS.map(country => country.fields.find(([label]) => label === '空运头程')?.[1]), [
    'usAirValue', 'deAirValue', 'gbAirValue', 'caAirValue'
  ]);
});

test('report data keeps pending values as statuses and converts weight units', () => {
  const snapshot = buildReportSnapshot({
    form: { productName: '马克笔', length: '300', width: '200', height: '50', weight: '800', price: '19.99', feeDate: '2027-02-10' },
    season: '淡季',
    countries: [{ name: '美国', currency: 'USD', rateKey: 'USD', components: [
      { label: 'FBA费用', display: '$7.23 USD' },
      { label: '空运头程', display: '待补充' },
      { label: '海运头程', display: '0.48 USD/件' },
      { label: '非FBA尾程', display: '8.54 USD/件' }
    ] }],
    rates: { USD: 1 }
  });
  assert.equal(snapshot.weightKg, 0.8);
  assert.equal(snapshot.weightLb.toFixed(3), '1.764');
  assert.equal(snapshot.volumeMm3, 3000000);
  assert.equal(snapshot.countries[0].components[1].status, '待补充');
  assert.equal(snapshot.countries[0].total, null);
  assert.equal(snapshot.comparable, false);
  assert.equal(snapshot.lowestCountry, null);
});

test('amount parser rejects placeholders and reads decimal amounts', () => {
  assert.equal(parseDisplayedAmount('$7.23 USD'), 7.23);
  assert.equal(parseDisplayedAmount('待补充'), null);
  assert.equal(fieldSnapshot('FBA费用', '待接入', 'GBP').status, '待接入');
});

test('incomplete countries cannot produce a lowest cost country', () => {
  const country = (name, amount) => ({ name, currency: 'USD', rateKey: 'USD', components: [
    { label: 'FBA费用', display: `${amount} USD` },
    { label: '空运头程', display: '1 USD' },
    { label: '海运头程', display: '2 USD' },
    { label: '非FBA尾程', display: '3 USD' }
  ] });
  const snapshot = buildReportSnapshot({ countries: [country('美国', 1), country('德国', 2), country('英国', 3), { ...country('加拿大', 4), components: country('加拿大', 4).components.map(item => item.label === '海运头程' ? { ...item, display: '待补充' } : item) }], rates: { USD: 1, EUR: 1, GBP: 1, CAD: 1 } });
  assert.equal(snapshot.comparable, false);
  assert.equal(snapshot.lowestCountry, null);
});

test('fingerprint changes when a calculation snapshot changes', () => {
  const base = buildReportSnapshot({ form: { weight: '800' } });
  const changed = buildReportSnapshot({ form: { weight: '900' } });
  assert.notEqual(snapshotFingerprint(base), snapshotFingerprint(changed));
});
