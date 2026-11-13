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

const US_PEAK_RATES = {
  '2026': {
    small: [[2.62, 3.51, 3.77], [2.68, 3.61, 3.87], [2.76, 3.65, 3.91], [2.86, 3.74, 4.00], [2.98, 3.89, 4.15], [3.03, 3.99, 4.25], [3.14, 4.13, 4.39], [3.17, 4.18, 4.44]],
    large: [[3.15, 3.97, 4.23], [3.39, 4.21, 4.47], [3.66, 4.48, 4.74], [4.07, 4.89, 5.15], [4.52, 5.34, 5.60], [4.91, 5.73, 5.99], [5.07, 5.89, 6.15], [5.33, 6.15, 6.41], [5.47, 6.29, 6.55], [5.67, 6.49, 6.75], [5.84, 6.66, 6.92], [6.26, 7.08, 7.34]],
    over3: [6.69, 7.51, 7.77]
  }
};

const CA_RATES = {
  '2026': {
    standard: {
      nonpeak: [5.92, 6.12, 6.36, 6.73, 7.23, 7.40, 7.71, 7.95, 8.25, 8.49, 8.58, 8.84, 9.04, 9.29, 9.60],
      peak: [6.28, 6.49, 6.74, 7.13, 7.65, 7.84, 8.17, 8.43, 8.74, 8.99, 9.10, 9.37, 9.58, 9.85, 10.17]
    }
  },
  '2027': {
    small: [4.53, 4.78, 5.09, 5.36, 5.70],
    large: [6.01, 6.21, 6.46, 6.83, 7.34, 7.51, 7.83, 8.07, 8.37, 8.62, 8.71, 8.97, 9.18, 9.43, 9.74]
  }
};

const SMALL_STANDARD_MAX_LB = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const LARGE_STANDARD_MAX_LB = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

export function getLocalDateIso(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  return parsedDate.getUTCFullYear() === year && parsedDate.getUTCMonth() === month - 1 && parsedDate.getUTCDate() === day
    ? { year, month, day } : null;
}

export function getUsFeeSeason(date) {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  const isPeak = (month === 10 && day >= 15) || month === 11 || month === 12 || (month === 1 && day <= 14);
  if (isPeak) {
    const startYear = month === 1 ? year - 1 : year;
    return { season: '旺季', ratePeriod: `${startYear}-10-15 至 ${startYear + 1}-01-14` };
  }
  return { season: '淡季', ratePeriod: `${year}-01-15 至 ${year}-10-14` };
}

export const getCanadaFeeSeason = getUsFeeSeason;

function validateCommon({ dimensionsMm, weightG, priceUsd, date }, requirePrice = true) {
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3 || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(weightG) || weightG <= 0 || (requirePrice && (!Number.isFinite(priceUsd) || priceUsd <= 0)) || !parseDate(date)) {
    throw new TypeError(requirePrice ? '请提供有效的包装尺寸、重量、售价和配送日期。' : '请提供有效的包装尺寸、重量和配送日期。');
  }
}

function usRatesFor(date, season) {
  const year = Number(date.slice(0, 4));
  const rateYear = season.season === '旺季' ? Number(season.ratePeriod.slice(0, 4)) : year;
  return { rates: season.season === '旺季' ? US_PEAK_RATES[String(rateYear)] : US_RATES[String(year)], rateYear };
}

export function calculateUsFba({ dimensionsMm, weightG, dimensionalWeightG: _providedDimensionalWeightG, priceUsd, date }) {
  validateCommon({ dimensionsMm, weightG, priceUsd, date });
  const feeSeason = getUsFeeSeason(date);
  const { rates, rateYear } = usRatesFor(date, feeSeason);
  if (!rates) return { status: 'missing_rate', total: null, season: feeSeason.season, ratePeriod: feeSeason.ratePeriod, reason: `${feeSeason.ratePeriod} 的美国费率资料尚未导入。` };

  const inches = dimensionsMm.map(value => value / 25.4).sort((a, b) => b - a);
  const unitLb = weightG / 453.59237;
  const dimensionalLb = inches[0] * inches[1] * inches[2] / 139;
  const fitsSmall = inches.every((value, index) => value <= [15, 12, 0.75][index] + 1e-10);
  const fitsLarge = inches.every((value, index) => value <= [18, 14, 8][index] + 1e-10);
  const sizeTier = fitsSmall && unitLb <= 1 ? 'small-standard-1' : fitsLarge ? 'large-standard' : null;
  if (!sizeTier) return { status: 'unsupported', total: null, reason: '包装尺寸超出已录入的美国标准尺寸档范围。' };

  const priceIndex = priceUsd < 10 ? 0 : priceUsd <= 50 ? 1 : 2;
  let baseFee;
  let billedWeightLb;
  let tier;
  if (sizeTier === 'small-standard-1') {
    const index = SMALL_STANDARD_MAX_LB.findIndex(max => unitLb <= max + 1e-10);
    if (index < 0) return { status: 'unsupported', total: null, reason: '小号标准尺寸 1 的费率表最高到 16 盎司。' };
    baseFee = rates.small[index][priceIndex];
    billedWeightLb = SMALL_STANDARD_MAX_LB[index];
    tier = '小号标准尺寸 1';
  } else {
    const billableLb = Math.max(unitLb, dimensionalLb);
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
  return { status: 'ok', currency: 'USD', tier, billedWeightLb, total: Math.round(baseFee * 100) / 100, season: feeSeason.season, ratePeriod: feeSeason.ratePeriod, rateYear };
}

export function calculateCanadaFba({ dimensionsMm, weightG, sizeTier = 'large-standard', date }) {
  validateCommon({ dimensionsMm, weightG, date }, false);
  const feeSeason = getCanadaFeeSeason(date);
  const year = Number(date.slice(0, 4));
  const rateYear = feeSeason.season === '旺季' ? Number(feeSeason.ratePeriod.slice(0, 4)) : year;
  const roundedG = Math.ceil(Math.max(weightG, dimensionsMm[0] * dimensionsMm[1] * dimensionsMm[2] / 5000) / 100 - 1e-10) * 100;
  const tier = sizeTier === 'small-standard-1' || sizeTier === 'small' ? 'small' : 'large';
  let total;
  if (rateYear === 2026) {
    const rows = CA_RATES['2026'].standard[feeSeason.season === '旺季' ? 'peak' : 'nonpeak'];
    if (roundedG <= 1500) total = rows[roundedG / 100 - 1];
    else if (roundedG <= 9000) total = (feeSeason.season === '旺季' ? 11 : 10.32) + ((roundedG - 1500) / 100) * 0.09;
  } else if (rateYear === 2027 && feeSeason.season === '淡季') {
    const rows = CA_RATES['2027'][tier];
    if (rows && roundedG <= rows.length * 100) total = rows[roundedG / 100 - 1];
    else if (tier === 'large' && roundedG <= 9000) total = 10.47 + ((roundedG - 1500) / 100) * 0.09;
  }
  if (total === undefined) return { status: rateYear === 2026 || rateYear === 2027 ? 'unsupported' : 'missing_rate', total: null, season: feeSeason.season, ratePeriod: feeSeason.ratePeriod, shippingWeightG: roundedG, reason: rateYear === 2026 || rateYear === 2027 ? '加拿大当前尺寸档或计费重量超出已导入费率表。' : `${feeSeason.ratePeriod} 的加拿大费率资料尚未导入。` };
  return { status: 'ok', currency: 'CAD', tier: tier === 'small' ? '小号标准尺寸' : '大号标准尺寸', total: Math.round(total * 100) / 100, season: feeSeason.season, ratePeriod: feeSeason.ratePeriod, shippingWeightG: roundedG, rateYear };
}
