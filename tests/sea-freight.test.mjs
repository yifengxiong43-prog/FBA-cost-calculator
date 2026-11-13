import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSeaFreight } from '../sea-freight.mjs';

test('uses all eight USD container quotes from the supplied workbook', () => {
  for (const [country, season, quote] of [
    ['US', 'nonpeak', 8000], ['DE', 'nonpeak', 4000],
    ['GB', 'nonpeak', 3500], ['CA', 'nonpeak', 8000],
    ['US', 'peak', 13000], ['DE', 'peak', 6000],
    ['GB', 'peak', 4000], ['CA', 'peak', 12000]
  ]) {
    const result = calculateSeaFreight({ country, date: season === 'peak' ? '2026-11-13' : '2027-02-10', dimensionsMm: [300, 200, 50] });
    assert.equal(result.currency, 'USD');
    assert.equal(result.containerQuoteUsd, quote);
    assert.equal(result.volumeM3, 0.003);
    assert.ok(Math.abs(result.total - quote / 63.5 * 0.003) < 1e-12);
  }
});

test('preserves decimal dimensions and unrounded unit cost for currency conversion', () => {
  const result = calculateSeaFreight({ country: 'GB', date: '2027-02-10', dimensionsMm: [300.25, 200.5, 50.75] });
  assert.equal(result.volumeM3, 0.00305515634375);
  assert.ok(Math.abs(result.total - 0.16839444414370079) < 1e-12);
});

test('switches sea quotes at the user-confirmed seasonal date boundaries', () => {
  for (const [date, quote] of [['2026-10-14', 8000], ['2026-10-15', 13000], ['2027-01-14', 13000], ['2027-01-15', 8000]]) {
    assert.equal(calculateSeaFreight({ country: 'US', date, dimensionsMm: [300, 200, 50] }).containerQuoteUsd, quote);
  }
  for (const date of [undefined, '', '2027-02-29', '2026-13-01']) {
    assert.throws(() => calculateSeaFreight({ country: 'US', date, dimensionsMm: [300, 200, 50] }), /日期/);
  }
});

test('rejects missing, zero, negative, and non-finite dimensions and unknown countries', () => {
  for (const dimensionsMm of [undefined, [1, 2], [0, 2, 3], [-1, 2, 3], [NaN, 2, 3], [Infinity, 2, 3], ['300', 200, 50]]) {
    assert.throws(() => calculateSeaFreight({ country: 'US', date: '2026-11-13', dimensionsMm }), /尺寸/);
  }
  assert.throws(() => calculateSeaFreight({ country: 'FR', date: '2026-11-13', dimensionsMm: [300, 200, 50] }), /国家/);
});
