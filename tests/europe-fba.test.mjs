import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEuropeFba, getEuropeFeeSeason } from '../europe-fba.mjs';

test('uses the local UK and Germany non-peak rows for a standard small parcel', () => {
  const input = { dimensionsMm: [300, 200, 70], weightG: 800, date: '2027-02-10' };
  assert.deepEqual(getEuropeFeeSeason(input.date), { season: '淡季', ratePeriod: '2027-01-15 至 2027-10-14', rateYear: 2026 });
  assert.deepEqual(calculateEuropeFba({ ...input, country: 'GB' }), {
    status: 'ok', country: 'GB', currency: 'GBP', tier: '小包裹', billedWeightG: 900,
    total: 3.04, season: '淡季', ratePeriod: '2027-01-15 至 2027-10-14', rateYear: 2026
  });
  assert.deepEqual(calculateEuropeFba({ ...input, country: 'DE' }), {
    status: 'ok', country: 'DE', currency: 'EUR', tier: '小包裹', billedWeightG: 900,
    total: 3.40, season: '淡季', ratePeriod: '2027-01-15 至 2027-10-14', rateYear: 2026
  });
});

test('switches the same package to the 2026 holiday peak rows', () => {
  const input = { dimensionsMm: [300, 200, 70], weightG: 800, date: '2026-11-13' };
  assert.equal(calculateEuropeFba({ ...input, country: 'GB' }).total, 3.15);
  assert.equal(calculateEuropeFba({ ...input, country: 'DE' }).total, 3.61);
  assert.equal(calculateEuropeFba({ ...input, country: 'GB' }).season, '旺季');
});

test('uses dimensional weight when it is higher for a standard parcel', () => {
  const result = calculateEuropeFba({ country: 'GB', dimensionsMm: [450, 340, 260], weightG: 100, date: '2026-01-15' });
  assert.equal(result.tier, '标准包裹');
  assert.equal(result.billedWeightG, 8000);
  assert.equal(result.total, 3.57);
});

test('rejects dates, countries and dimensions outside the supplied local tables', () => {
  assert.equal(getEuropeFeeSeason('2026-02-30'), null);
  assert.equal(calculateEuropeFba({ country: 'FR', dimensionsMm: [300, 200, 50], weightG: 800, date: '2026-01-15' }).status, 'unsupported');
  assert.equal(calculateEuropeFba({ country: 'GB', dimensionsMm: [500, 400, 300], weightG: 800, date: '2026-01-15' }).status, 'unsupported');
});
