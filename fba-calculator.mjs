const US_RATES = {
  '2026': {
    small: [[2.43, 3.32, 3.58], [2.49, 3.42, 3.68], [2.56, 3.45, 3.71], [2.66, 3.54, 3.80], [2.77, 3.68, 3.94], [2.82, 3.78, 4.04], [2.92, 3.91, 4.17], [2.95, 3.96, 4.22]],
    large: [[2.91, 3.73, 3.99], [3.13, 3.95, 4.21], [3.38, 4.20, 4.46], [3.78, 4.60, 4.86], [4.22, 5.04, 5.30], [4.60, 5.42, 5.68], [4.75, 5.57, 5.83], [5.00, 5.82, 6.08], [5.10, 5.92, 6.18], [5.28, 6.10, 6.36], [5.44, 6.26, 6.52], [5.85, 6.67, 6.93]],
    over3: [6.15, 6.97, 7.23]
  },
  '2027': {
    small: [[2.64, 3.75, 4.31], [2.72, 3.78, 4.34], [2.80, 3.92, 4.47], [2.83, 3.97, 4.53], [2.87, 4.06, 4.62], [2.92, 4.16, 4.73], [2.96, 4.30, 4.85], [2.99, 4.32, 4.88]],
    large: [[2.91, 3.79, 4.35], [3.13, 4.01, 4.57], [3.38, 4.26, 4.83], [3.78, 4.67, 5.23], [4.22, 5.19, 5.75], [4.60, 5.57, 6.14], [4.75, 5.72, 6.29], [5.00, 5.98, 6.54], [5.10, 6.08, 6.64], [5.28, 6.26, 6.83], [5.44, 6.42, 6.99], [5.85, 6.85, 7.41]],
    over3: [6.15, 7.16, 7.73]
  }
};
const SMALL_STANDARD_MAX_LB = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const LARGE_STANDARD_MAX_LB = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const LB_PER_KG = 1 / 0.45359237;
export function calculateUsFba({ dimensionsMm, weightG, dimensionalWeightG, priceUsd, date }) {
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3 || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)
    || ![weightG, dimensionalWeightG, priceUsd].every(value => Number.isFinite(value) && value > 0)
    || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new TypeError('请提供有效的包装尺寸、重量、售价和配送日期。');
  }
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(5);
  if (!['2026', '2027'].includes(String(year)) || monthDay < '01-15' || monthDay > '10-14') {
    return { status: 'missing_rate', total: null, reason: '所选日期不在已提供的费率期间（每年 1 月 15 日至 10 月 14 日）。' };
  }

  const billableLb = Math.max(weightG, dimensionalWeightG) / 1000 * LB_PER_KG;
  const priceIndex = priceUsd < 10 ? 0 : priceUsd <= 50 ? 1 : 2;
  const rates = US_RATES[String(year)];
  const inches = dimensionsMm.map(value => value / 25.4).sort((a, b) => b - a);
  const fitsSmall = inches.every((value, index) => value <= [15, 12, 0.75][index] + 1e-10);
  const fitsLarge = inches.every((value, index) => value <= [18, 14, 8][index] + 1e-10);
  const sizeTier = fitsSmall && billableLb <= 1 ? 'small-standard-1' : fitsLarge ? 'large-standard' : null;
  if (!sizeTier) return { status: 'unsupported', total: null, reason: '包装尺寸超出已录入的美国标准尺寸档范围。' };
  let baseFee;
  let billedWeightLb;
  let tier;

  if (sizeTier === 'small-standard-1') {
    if (billableLb > 1) return { status: 'unsupported', total: null, reason: '小号标准尺寸 1 的费率表最高到 16 盎司。' };
    const index = SMALL_STANDARD_MAX_LB.findIndex(max => billableLb <= max + 1e-10);
    baseFee = rates.small[index][priceIndex];
    billedWeightLb = SMALL_STANDARD_MAX_LB[index];
    tier = '小号标准尺寸 1';
  } else {
    if (billableLb > 20) return { status: 'unsupported', total: null, reason: '大号标准尺寸费率表最高到 20 磅。' };
    billedWeightLb = Math.ceil(billableLb / 0.25 - 1e-10) * 0.25;
    if (billedWeightLb <= 3) {
      const index = LARGE_STANDARD_MAX_LB.findIndex(max => billedWeightLb <= max + 1e-10);
      baseFee = rates.large[index][priceIndex];
    } else {
      baseFee = rates.over3[priceIndex] + Math.ceil((billedWeightLb - 3) / 0.25 - 1e-10) * 0.08;
    }
    tier = '大号标准尺寸';
  }

  return {
    status: 'ok',
    currency: 'USD',
    tier,
    billedWeightLb,
    total: Math.round(baseFee * 100) / 100,
    ratePeriod: `${year}-01-15 至 ${year}-10-14`
  };
}
