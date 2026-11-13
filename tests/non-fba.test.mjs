import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUsWeightQuote, calculateUsNonFba, calculateGermanyNonFba } from '../non-fba.mjs';

test('matches the supplied US 5 lb example: Zone 6 costs 11.78 USD', () => {
  const fee = calculateUsWeightQuote({ billedWeightG: 2267.96185 });
  assert.equal(fee.status, 'ok');
  assert.equal(fee.total, 11.78);
  assert.equal(fee.currency, 'USD');
  assert.equal(fee.tier, '5 lb');
});

test('matches every Zone 6 ounce and pound row at its exact weight', () => {
  for (const [oz, total] of [[4, 4.75], [8, 4.89], [12, 5.77], [15.999, 6.56]]) {
    assert.equal(calculateUsWeightQuote({ billedWeightG: oz * 28.349523125 }).total, total);
  }
  const prices = [8.17, 8.51, 10.05, 11.23, 11.78, 12.52, 13.08, 13.60, 14.19, 14.79,
    15.78, 16.47, 17.18, 17.91, 18.65, 19.37, 19.94, 20.56, 21.17, 22.52];
  prices.forEach((total, index) => {
    assert.equal(calculateUsWeightQuote({ billedWeightG: (index + 1) * 453.59237 }).total, total);
  });
});


test('Germany uses the confirmed 0.6 EUR surcharge and matches the 5 kg example', () => {
  const fee = calculateGermanyNonFba({ billedWeightG: 5000 });
  assert.equal(fee.currency, 'EUR');
  assert.equal(fee.total, 11.24);
  assert.equal(fee.surcharge, 0.6);
  assert.equal(calculateGermanyNonFba({ billedWeightG: 5500 }).total, 11.45);
});

test('US rounds the supplied billable weight up to the next quoted bracket', () => {
  assert.equal(calculateUsWeightQuote({ billedWeightG: 4.2 * 453.59237 }).total, 11.78);
  assert.equal(calculateUsWeightQuote({ billedWeightG: 4 * 28.349523125 + 0.01 }).total, 4.89);
  assert.equal(calculateUsWeightQuote({ billedWeightG: 15.999 * 28.349523125 }).total, 6.56);
  assert.equal(calculateUsWeightQuote({ billedWeightG: 453.59237 }).total, 8.17);
  assert.equal(calculateUsWeightQuote({ billedWeightG: 453.59237 + 0.01 }).total, 8.51);
});

test('US does not extrapolate beyond the 20 lb source table', () => {
  const fee = calculateUsWeightQuote({ billedWeightG: 20 * 453.59237 + 0.01 });
  assert.equal(fee.status, 'unsupported');
  assert.equal(fee.total, null);
});

test('both quotes require a positive finite billable weight', () => {
  for (const billedWeightG of [undefined, NaN, Infinity, 0, -1, '5000']) {
    for (const calculate of [calculateUsWeightQuote, calculateGermanyNonFba]) {
      assert.throws(() => calculate({ billedWeightG }), /计费重量/);
    }
  }
});


test('US chooses the more expensive of Zone 6 weight and Cubic prices', () => {
  const volumeWins = calculateUsNonFba({ weightG: 100, dimensionsMm: [300, 200, 50] });
  assert.equal(volumeWins.weightFee, 4.75);
  assert.equal(volumeWins.volumeFee, 8.60);
  assert.equal(volumeWins.total, 8.60);
  assert.equal(volumeWins.basis, 'volume');
  assert.equal(volumeWins.volumeTier, 'Cubic Tier 2');
  const weightWins = calculateUsNonFba({ weightG: 2267.96185, dimensionsMm: [300, 200, 50] });
  assert.equal(weightWins.total, 11.78);
  assert.equal(weightWins.basis, 'weight');
});

test('US converts mm to cubic feet and matches all six Cubic boundaries', () => {
  const prices = [7.78, 8.60, 9.76, 10.94, 11.62, 12.35];
  prices.forEach((price, index) => {
    const dimensionsMm = [304.8, 304.8, 304.8 * (index + 1) / 10];
    const fee = calculateUsNonFba({ weightG: 100, dimensionsMm });
    assert.equal(fee.volumeFee, price);
    assert.equal(fee.volumeTier, `Cubic Tier ${index + 1}`);
    if (index < 5) {
      dimensionsMm[2] += 0.01;
      assert.equal(calculateUsNonFba({ weightG: 100, dimensionsMm }).volumeFee, prices[index + 1]);
    }
  });
});

test('US returns no final quote if either price is outside the supplied table', () => {
  for (const input of [
    { weightG: 100, dimensionsMm: [304.8, 304.8, 182.89] },
    { weightG: 9071.86, dimensionsMm: [300, 200, 50] }
  ]) {
    const fee = calculateUsNonFba(input);
    assert.equal(fee.status, 'unsupported');
    assert.equal(fee.total, null);
  }
});

test('US rejects missing and invalid dimensions rather than using only the weight price', () => {
  for (const dimensionsMm of [undefined, [1, 2], [0, 2, 3], [-1, 2, 3], [NaN, 2, 3], [Infinity, 2, 3]]) {
    assert.throws(() => calculateUsNonFba({ weightG: 100, dimensionsMm }), /尺寸/);
  }
});
