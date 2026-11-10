import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUsFba } from '../fba-calculator.mjs';

test('automatically matches small standard size 1 and uses the price bracket without a surcharge', () => {
  const result = calculateUsFba({
    dimensionsMm: [200, 150, 18], weightG: 50, dimensionalWeightG: 40,
    priceUsd: 9.99, date: '2026-01-15'
  });
  assert.equal(result.total, 2.43);
  assert.equal(result.billedWeightLb, 0.125);
  assert.equal(result.tier, '小号标准尺寸 1');
});

test('automatically matches large standard and rounds billable weight up by 4 oz above 3 lb', () => {
  const result = calculateUsFba({
    dimensionsMm: [450, 350, 100], weightG: 1500, dimensionalWeightG: 1500,
    priceUsd: 51, date: '2026-10-14'
  });
  assert.equal(result.billedWeightLb, 3.5);
  assert.equal(result.total, 7.39);
});

test('selects a different US rate table for 2027 dates', () => {
  const input = { dimensionsMm: [200, 150, 18], weightG: 20, dimensionalWeightG: 20, priceUsd: 5 };
  assert.equal(calculateUsFba({ ...input, date: '2026-01-15' }).total, 2.43);
  assert.equal(calculateUsFba({ ...input, date: '2027-01-15' }).total, 2.64);
});

test('does not extrapolate rates into dates absent from the supplied tables', () => {
  const input = { dimensionsMm: [200, 150, 80], weightG: 500, dimensionalWeightG: 500, priceUsd: 20 };
  for (const date of ['2026-10-15', '2027-01-14', '2027-10-15']) {
    const result = calculateUsFba({ ...input, date });
    assert.equal(result.status, 'missing_rate');
    assert.equal(result.total, null);
  }
});

test('reports weights beyond the large standard rate table instead of extrapolating', () => {
  const result = calculateUsFba({
    dimensionsMm: [200, 150, 80], weightG: 9200, dimensionalWeightG: 500,
    priceUsd: 20, date: '2026-03-01'
  });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.total, null);
});

test('reports packages outside both supported size tiers', () => {
  const result = calculateUsFba({
    dimensionsMm: [600, 400, 250],
    weightG: 50, dimensionalWeightG: 40, priceUsd: 10, date: '2026-03-01'
  });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.total, null);
});
