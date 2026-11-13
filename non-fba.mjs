// 美、德非FBA尾程算法-甘咏珊.pdf, pages 1–3. No effective year supplied.
// User-selected estimate: max(Zone 6 weight price, Zone 6 Cubic price).
// Cubic ranges are interpreted in ft³; no dimensional-weight divisor is used.
const GRAMS_PER_LB = 453.59237;
const US_OUNCE_ROWS = [[4, 4.75], [8, 4.89], [12, 5.77], [15.999, 6.56]];
const US_POUND_RATES = [8.17, 8.51, 10.05, 11.23, 11.78, 12.52, 13.08, 13.60, 14.19, 14.79,
  15.78, 16.47, 17.18, 17.91, 18.65, 19.37, 19.94, 20.56, 21.17, 22.52];
const US_CUBIC_RATES = [7.78, 8.60, 9.76, 10.94, 11.62, 12.35];

function validateWeight(billedWeightG) {
  if (!Number.isFinite(billedWeightG) || billedWeightG <= 0) {
    throw new TypeError('请提供有效的计费重量（克）。');
  }
}

export function calculateUsWeightQuote({ billedWeightG }) {
  validateWeight(billedWeightG);
  for (const [oz, total] of US_OUNCE_ROWS) {
    if (billedWeightG <= oz * GRAMS_PER_LB / 16 + 1e-9) {
      return { status: 'ok', total, currency: 'USD', tier: `${oz} OZ`, zone: 6 };
    }
  }
  const index = US_POUND_RATES.findIndex((_, index) => billedWeightG <= (index + 1) * GRAMS_PER_LB + 1e-9);
  if (index < 0) return { status: 'unsupported', total: null, reason: '计费重量超出已提供的20磅报价范围。' };
  return { status: 'ok', total: US_POUND_RATES[index], currency: 'USD', tier: `${index + 1} lb`, zone: 6 };
}

export function calculateUsNonFba({ weightG, dimensionsMm }) {
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3
    || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('请提供有效的包装长宽高尺寸。');
  }
  const weightQuote = calculateUsWeightQuote({ billedWeightG: weightG });
  const volumeFt3 = dimensionsMm[0] * dimensionsMm[1] * dimensionsMm[2] / (304.8 ** 3);
  const index = US_CUBIC_RATES.findIndex((_, i) => volumeFt3 <= (i + 1) / 10 + 1e-12);
  if (weightQuote.status !== 'ok' || index < 0) {
    return { status: 'unsupported', total: null, reason: weightQuote.status !== 'ok'
      ? weightQuote.reason : '体积超出已提供的0.6 ft³报价范围。' };
  }
  const volumeFee = US_CUBIC_RATES[index];
  return { status: 'ok', currency: 'USD', total: Math.max(weightQuote.total, volumeFee),
    weightFee: weightQuote.total, weightTier: weightQuote.tier, volumeFee,
    volumeTier: `Cubic Tier ${index + 1}`, volumeFt3, zone: 6,
    basis: volumeFee > weightQuote.total ? 'volume' : 'weight' };
}

export function calculateGermanyNonFba({ billedWeightG }) {
  validateWeight(billedWeightG);
  const weightKg = billedWeightG / 1000;
  return { status: 'ok', total: Math.round((8.54 + weightKg * 0.42 + 0.6) * 100) / 100,
    currency: 'EUR', base: 8.54, perKg: 0.42, surcharge: 0.6, weightKg };
}
