import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAirFreight } from '../air-freight.mjs';

test('air freight uses the greater of actual and volumetric weight', () => {
  const result = calculateAirFreight({ country: 'US', date: '2027-03-17', weightG: 1640, dimensionsMm: [260, 190, 100] });
  assert.equal(result.currency, 'USD');
  assert.equal(result.quoteUsdPerKg, 12);
  assert.equal(result.volumeM3, 0.00494);
  assert.equal(result.volumeWeightKg, 0.82498);
  assert.equal(result.chargeableWeightKg, 1.64);
  assert.equal(result.total, 19.68);
  assert.equal(result.season, '淡季');
});

test('air freight uses volumetric weight when it exceeds actual weight', () => {
  const result = calculateAirFreight({ country: 'CA', date: '2026-11-17', weightG: 500, dimensionsMm: [1000, 100, 100] });
  assert.equal(result.season, '旺季');
  assert.equal(result.quoteUsdPerKg, 9.94);
  assert.equal(result.volumeWeightKg, 1.67);
  assert.equal(result.chargeableWeightKg, 1.67);
  assert.equal(result.total, 16.5998);
});

test('air freight rejects invalid inputs and unknown countries', () => {
  assert.throws(() => calculateAirFreight({ country: 'US', date: '2027-03-17', weightG: 0, dimensionsMm: [260, 190, 100] }), /重量/);
  assert.throws(() => calculateAirFreight({ country: 'US', date: '2027-03-17', weightG: 500, dimensionsMm: [260, 190] }), /尺寸/);
  assert.throws(() => calculateAirFreight({ country: 'FR', date: '2027-03-17', weightG: 500, dimensionsMm: [260, 190, 100] }), /国家/);
});
