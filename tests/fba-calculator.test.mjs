import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFba } from '../fba-calculator.mjs';

const sample = {
  dimensionsMm: [313, 243, 78],
  weightG: 1980,
  priceUsd: 54.99,
  fx: { EUR: 0.85, GBP: 0.75 }
};

test('calculates the supplied four-country peak sample', () => {
  const result = calculateFba({ ...sample, season: 'peak' });
  assert.deepEqual(
    Object.fromEntries(Object.entries(result).map(([country, fee]) => [country, fee.total])),
    { US: '8.54', CA: '11.85', DE: '4.76', UK: '3.41' }
  );
  assert.equal(result.CA.status, 'ok');
});

test('uses the non-peak rate card for US and seasonal parcels in DE and UK', () => {
  const result = calculateFba({ ...sample, season: 'off' });
  assert.equal(result.US.total, '7.98');
  assert.equal(result.DE.total, '4.55');
  assert.equal(result.UK.status, 'ok');
});

test('keeps annual envelope rates unchanged when the season changes', () => {
  const input = { dimensionsMm: [300, 200, 20], weightG: 20, priceUsd: 5, fx: { EUR: 0.85, GBP: 0.75 } };
  const off = calculateFba({ ...input, season: 'off' });
  const peak = calculateFba({ ...input, season: 'peak' });
  assert.equal(off.DE.total, peak.DE.total);
  assert.equal(off.UK.total, peak.UK.total);
});

test('uses the supplied seasonal rates for US bulky tiers', () => {
  const input = { dimensionsMm: [762, 254, 127], weightG: 2000, priceUsd: 60, fx: { EUR: 0.85, GBP: 0.75 } };
  const off = calculateFba({ ...input, season: 'off' });
  const peak = calculateFba({ ...input, season: 'peak' });
  assert.equal(off.US.total, '11.75');
  assert.equal(peak.US.total, '12.82');
});

test('calculates complete EU bulky tiers with the supplied 1 kg increments', () => {
  const result = calculateFba({
    dimensionsMm: [600, 450, 400], weightG: 1000, priceUsd: 30,
    season: 'peak', fx: { EUR: 0.85, GBP: 0.75 }
  });
  assert.equal(result.DE.tier, '小号大件');
  assert.equal(result.DE.total, '8.47');
  assert.equal(result.UK.tier, '小号大件');
  assert.equal(result.UK.total, '8.23');
});

test('does not infer a Canadian standard-size boundary', () => {
  const result = calculateFba({
    season: 'peak', dimensionsMm: [300, 200, 100], weightG: 500,
    priceUsd: 30, fx: { EUR: 0.85, GBP: 0.75 }
  });
  assert.equal(result.CA.status, 'rule_conflict');
  assert.equal(result.CA.total, null);
});

test('returns a missing-rule result instead of borrowing an adjacent size tier', () => {
  const result = calculateFba({
    season: 'peak', dimensionsMm: [2000, 1000, 1000], weightG: 1000,
    priceUsd: 30, fx: { EUR: 0.85, GBP: 0.75 }
  });
  assert.equal(result.US.status, 'unsupported');
  assert.equal(result.CA.status, 'missing_rule');
});
