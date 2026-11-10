const KG_PER_LB = 0.45359237;
const INCHES_PER_CM = 2.54;
const SURCHARGE = { US: 0.035, CA: 0.035, DE: 0.015, UK: 0.015 };

const US_SMALL = [
  [2.43, 3.32, 3.58, 2.62, 3.51, 3.77], [2.49, 3.42, 3.68, 2.68, 3.61, 3.87],
  [2.56, 3.45, 3.71, 2.76, 3.65, 3.91], [2.66, 3.54, 3.80, 2.86, 3.74, 4.00],
  [2.77, 3.68, 3.94, 2.98, 3.89, 4.15], [2.82, 3.78, 4.04, 3.03, 3.99, 4.25],
  [2.92, 3.91, 4.17, 3.14, 4.13, 4.39], [2.95, 3.96, 4.22, 3.17, 4.18, 4.44]
];
const US_SMALL_MAX_LB = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const US_LARGE = [
  [2.91, 3.73, 3.99, 3.15, 3.97, 4.23], [3.13, 3.95, 4.21, 3.39, 4.21, 4.47],
  [3.38, 4.20, 4.46, 3.66, 4.48, 4.74], [3.78, 4.60, 4.86, 4.07, 4.89, 5.15],
  [4.22, 5.04, 5.30, 4.52, 5.34, 5.60], [4.60, 5.42, 5.68, 4.91, 5.73, 5.99],
  [4.75, 5.57, 5.83, 5.07, 5.89, 6.15], [5.00, 5.82, 7.63, 5.33, 6.15, 8.17],
  [5.10, 5.92, 6.18, 5.47, 6.29, 6.55], [5.28, 6.10, 6.36, 5.67, 6.49, 6.75],
  [5.44, 6.26, 6.52, 5.84, 6.66, 6.92], [5.85, 6.67, 6.93, 6.26, 7.08, 7.34]
];
const US_LARGE_MAX_LB = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const US_ABOVE3_BASE = [[6.15, 6.97, 7.23], [6.69, 7.51, 7.77]];
const US_BULKY = [
  { name: 'Small bulky', dims: [37, 28, 20], first: [[6.78, 7.55, 7.55], [7.82, 8.59, 8.59]], step: 1, increment: 0.38 },
  { name: 'Large bulky', dims: [59, 33, 33], first: [[8.58, 9.35, 9.35], [9.62, 10.39, 10.39]], step: 1, increment: 0.38 }
];

const CA_ENVELOPE = [[4.46, 4.73], [4.71, 4.99], [5.01, 5.31], [5.28, 5.60], [5.62, 5.95]];
const CA_STANDARD = [
  [5.92, 6.28], [6.12, 6.49], [6.36, 6.74], [6.73, 7.13], [7.23, 7.65],
  [7.40, 7.84], [7.71, 8.17], [7.95, 8.43], [8.25, 8.74], [8.49, 8.99],
  [8.58, 9.10], [8.84, 9.37], [9.04, 9.58], [9.29, 9.85], [9.60, 10.17]
];
const CA_OVERSIZE = [
  { name: 'Small oversize', maxKg: 32, maxLong: 152, maxMedian: 76, maxGirth: 330, fee: [15.43, 16.77], increment: 0.46 },
  { name: 'Medium oversize', maxKg: 68, maxLong: 270, maxMedian: Infinity, maxGirth: 330, fee: [37.78, 41.64], increment: 0.52 },
  { name: 'Large oversize', maxKg: 68, maxLong: 270, maxMedian: Infinity, maxGirth: 419, fee: [82.20, 89.59], increment: 0.58 }
];
const CA_STANDARD_LARGE_CALIBRATION = { dims: [29.5, 17.6, 7.9], actualKg: 0.5, roundedKg: 0.9, fee: [10.68, 11.17] };

const EU_PARCEL_DIMS = [
  [35, 25, 7], [35, 25, 9], [35, 25, 12], [40, 30, 6], [40, 30, 20], [45, 34, 10], [45, 34, 26]
];
const EU_PARCEL_MAX_ACTUAL_KG = [3.9, 3.9, 3.9, 11.9, 11.9, 11.9, 11.9];
const EU_SEASON_RATES = {
  DE: { off: [[3.30, .05], [3.34, .06], [3.38, .07], [3.50, .07], [3.73, .07], [3.97, .07], [4.38, .08]], peak: [[3.51, .05], [3.55, .06], [3.59, .07], [3.72, .07], [3.97, .07], [4.22, .07], [4.66, .09]] },
  UK: { off: [[2.83, .02], [2.87, .02], [2.91, .02], [2.97, .02], [3.10, .03], [3.34, .03], [3.97, .03]], peak: [[2.94, .02], [2.98, .02], [3.02, .02], [3.08, .02], [3.22, .03], [3.47, .03], [4.12, .03]] }
};
const EU_LOWER_PRICE = {
  DE: [
    [[33, 23, 2.5], .02, 1.87], [[33, 23, 2.5], .04, 1.90], [[33, 23, 2.5], .06, 1.92], [[33, 23, 2.5], .08, 2.06], [[33, 23, 2.5], .1, 2.09],
    [[33, 23, 2.5], .21, 2.12], [[33, 23, 2.5], .46, 2.28], [[33, 23, 4], .96, 2.65], [[33, 23, 6], .96, 3.04],
    [[35, 25, 12], .15, 3.04], [[35, 25, 12], .4, 3.25]
  ],
  UK: [
    [[33, 23, 2.5], .02, 1.83], [[33, 23, 2.5], .04, 1.87], [[33, 23, 2.5], .06, 1.89], [[33, 23, 2.5], .08, 2.07], [[33, 23, 2.5], .1, 2.08],
    [[33, 23, 2.5], .21, 2.10], [[33, 23, 2.5], .46, 2.16], [[33, 23, 4], .96, 2.72], [[33, 23, 6], .96, 2.94],
    [[35, 25, 12], .15, 2.91], [[35, 25, 12], .4, 2.70]
  ]
};
const EU_REGULAR_ENVELOPES = {
  DE: [
    [[33, 23, 2.5], .02, 2.33], [[33, 23, 2.5], .04, 2.37], [[33, 23, 2.5], .06, 2.39], [[33, 23, 2.5], .08, 2.52], [[33, 23, 2.5], .1, 2.54],
    [[33, 23, 2.5], .21, 2.57], [[33, 23, 2.5], .46, 2.68], [[33, 23, 4], .96, 3.04], [[33, 23, 6], .96, 3.42]
  ],
  UK: [
    [[33, 23, 2.5], .02, 1.83], [[33, 23, 2.5], .04, 1.87], [[33, 23, 2.5], .06, 1.89], [[33, 23, 2.5], .08, 2.07], [[33, 23, 2.5], .1, 2.08],
    [[33, 23, 2.5], .21, 2.10], [[33, 23, 2.5], .46, 2.16], [[33, 23, 4], .96, 2.72], [[33, 23, 6], .96, 2.94]
  ]
};
const EU_BULKY = {
  DE: [
    { name: '小号大件', dims: [61, 46, 46], maxActualKg: 1.76, maxDimensionalKg: 25.82, firstKg: .76, fee: 4.56, increment: .18 },
    { name: '标准大件轻型', dims: [101, 60, 60], maxActualKg: 15, maxDimensionalKg: 72.72, firstKg: .76, fee: 4.59, increment: .18 },
    { name: '标准大件重型', dims: [101, 60, 60], maxActualKg: 23, maxDimensionalKg: 72.72, minActualKg: 15, firstKg: 15.76, fee: 7.25, increment: .07 },
    { name: '标准大件大型', dims: [120, 60, 60], maxActualKg: 23, maxDimensionalKg: 86.4, firstKg: .76, fee: 6.06, increment: .08 }
  ],
  UK: [
    { name: '小号大件', dims: [61, 46, 46], maxActualKg: 1.76, maxDimensionalKg: 25.82, firstKg: .76, fee: 3.49, increment: .22 },
    { name: '标准大件轻型', dims: [101, 60, 60], maxActualKg: 15, maxDimensionalKg: 72.72, firstKg: .76, fee: 4.35, increment: .15 },
    { name: '标准大件重型', dims: [101, 60, 60], maxActualKg: 23, maxDimensionalKg: 72.72, minActualKg: 15, firstKg: 15.76, fee: 6.58, increment: .08 },
    { name: '标准大件大型', dims: [120, 60, 60], maxActualKg: 23, maxDimensionalKg: 86.4, firstKg: .76, fee: 5.67, increment: .07 }
  ]
};

function ceilSteps(value, step) {
  return Math.max(0, Math.ceil(value / step - 1e-10));
}

function roundMoney(value) {
  return (Math.round(value * 100 + 1e-8) / 100).toFixed(2);
}

function feeResult(country, base, tier, billableWeight, reason = '') {
  const surcharge = Math.round(base * SURCHARGE[country] * 100 + 1e-8) / 100;
  return {
    status: 'ok', country, currency: { US: 'USD', CA: 'CAD', DE: 'EUR', UK: 'GBP' }[country], tier,
    billableWeight, baseFee: roundMoney(base), surcharge: surcharge.toFixed(2),
    total: roundMoney(base + surcharge), reason
  };
}

function unresolved(country, status, reason, details = {}) {
  return { status, country, currency: { US: 'USD', CA: 'CAD', DE: 'EUR', UK: 'GBP' }[country], total: null, reason, ...details };
}

function fits(dims, limits) {
  return dims.every((value, index) => value <= limits[index] + 1e-10);
}

function usFee({ dimsIn, actualKg, dimensionalKg, priceUsd, season }) {
  const rawKg = Math.max(actualKg, dimensionalKg);
  const rawLb = rawKg / KG_PER_LB;
  const priceIndex = priceUsd < 10 ? 0 : priceUsd <= 50 ? 1 : 2;
  const seasonOffset = season === 'peak' ? 3 : 0;
  if (fits(dimsIn, [15, 12, .75]) && rawLb <= 1) {
    const row = US_SMALL_MAX_LB.findIndex(max => rawLb <= max + 1e-10);
    if (row < 0) return unresolved('US', 'unsupported', '超出美国 Small standard 费率范围。');
    const billable = Math.ceil(rawLb / .125 - 1e-10) * .125;
    return feeResult('US', US_SMALL[row][priceIndex + seasonOffset], 'Small standard', `${billable.toFixed(3)} lb`);
  }
  if (fits(dimsIn, [18, 14, 8]) && rawLb <= 20) {
    const billable = Math.ceil(rawLb / .25 - 1e-10) * .25;
    if (billable <= 3) {
      const row = US_LARGE_MAX_LB.findIndex(max => billable <= max + 1e-10);
      if (row < 0) return unresolved('US', 'missing_rule', '美国标准尺寸重量档没有匹配费率。');
      const knownConflict = season === 'off' && priceIndex === 1 && billable === 3 && dimsIn[0] <= 18 && rawKg / KG_PER_LB > 2.75;
      if (knownConflict) return unresolved('US', 'rule_conflict', '该重量档表格值 6.67 与单产品明细 6.66 冲突，需核对原始报价。');
      return feeResult('US', US_LARGE[row][priceIndex + seasonOffset], 'Large standard', `${billable.toFixed(2)} lb`);
    }
    const base = US_ABOVE3_BASE[season === 'peak' ? 1 : 0][priceIndex] + ceilSteps(billable - 3, .25) * .08;
    return feeResult('US', base, 'Large standard', `${billable.toFixed(2)} lb`);
  }
  const lengthGirth = dimsIn[0] + 2 * (dimsIn[1] + dimsIn[2]);
  const tier = US_BULKY.find(row => fits(dimsIn, row.dims) && rawLb <= 50 && lengthGirth <= 130);
  if (!tier) return unresolved('US', 'unsupported', '超出已提供的美国规则范围（含 Extra-Large），不套用邻近费率。');
  const steps = ceilSteps(rawLb - 1, tier.step);
  const first = tier.first[season === 'peak' ? 1 : 0][priceIndex];
  return feeResult('US', first + steps * tier.increment, tier.name, `${Math.ceil(rawLb)} lb 起计`);
}

function caFee({ dimsCm, actualKg, dimensionalKg, season }) {
  const rawKg = Math.max(actualKg, dimensionalKg);
  const peak = season === 'peak' ? 1 : 0;
  const lengthGirth = dimsCm[0] + 2 * (dimsCm[1] + dimsCm[2]);
  if (fits(dimsCm, [38, 27, 2]) && rawKg <= .5) {
    const rounded = Math.ceil(rawKg / .1 - 1e-10) * .1;
    const row = Math.min(CA_ENVELOPE.length - 1, Math.ceil(rounded / .1) - 1);
    return feeResult('CA', CA_ENVELOPE[row][peak], 'Envelope', `${Math.round(rounded * 1000)} g`);
  }
  if (fits(dimsCm, [45, 35, 20]) && rawKg <= 9) {
    const rounded = Math.ceil(rawKg / .1 - 1e-10) * .1;
    if (rounded > 1.5) {
      const base = 10.32 + peak * .68 + ceilSteps(rounded - 1.5, .1) * .09;
      return feeResult('CA', base, 'Standard-Size', `${Math.round(rounded * 1000)} g`);
    }
    const sorted = [...dimsCm].sort((a, b) => b - a);
    const cal = CA_STANDARD_LARGE_CALIBRATION;
    const exactCalibration = sorted.every((d, i) => Math.abs(d - [...cal.dims].sort((a, b) => b - a)[i]) <= .02)
      && Math.abs(actualKg - cal.actualKg) <= 1e-9 && Math.abs(rounded - cal.roundedKg) <= 1e-9;
    if (exactCalibration) {
      return unresolved('CA', 'rule_conflict', '加拿大该产品组合存在历史校准值与普通 Standard 表冲突。', { candidates: [`${cal.fee[0].toFixed(2)} CAD（淡季）`, `${cal.fee[1].toFixed(2)} CAD（旺季）`] });
    }
    return unresolved('CA', 'rule_conflict', '加拿大 Standard ≤1.5 kg 的档位边界解释有冲突，暂不自动选价。', { billableWeight: `${Math.round(rounded * 1000)} g` });
  }
  const tier = CA_OVERSIZE.find(row => actualKg <= row.maxKg && dimsCm[0] <= row.maxLong
    && dimsCm[1] <= row.maxMedian && lengthGirth <= row.maxGirth);
  if (!tier) return unresolved('CA', 'missing_rule', '加拿大特殊大件条件或尺寸范围不完整，需人工核对。');
  const rounded = Math.ceil(rawKg / .5 - 1e-10) * .5;
  const steps = ceilSteps(rounded - .5, .5);
  return feeResult('CA', tier.fee[peak] + steps * tier.increment, tier.name, `${rounded.toFixed(1)} kg`);
}

function euFee(country, { dimsCm, actualKg, dimensionalKg, localPrice, season }) {
  const rawKg = Math.max(actualKg, dimensionalKg);
  const rateSeason = EU_SEASON_RATES[country][season];
  if (localPrice < 20) {
    const tier = EU_LOWER_PRICE[country].find(([limits, maxActual]) => fits(dimsCm, limits) && actualKg <= maxActual);
    if (!tier) return unresolved(country, 'missing_rule', `当地售价低于 20，但${country}低价费率的尺寸/实际重量条件不满足；回退规则未确认。`);
    return feeResult(country, tier[2], '低价费率', `${Math.round(actualKg * 1000)} g 实重`);
  }
  const parcelIndex = EU_PARCEL_DIMS.findIndex((limits, index) => fits(dimsCm, limits) && actualKg <= EU_PARCEL_MAX_ACTUAL_KG[index]);
  if (parcelIndex >= 0) {
    const [firstFee, increment] = rateSeason[parcelIndex];
    const steps = ceilSteps(rawKg - .1, .1);
    return feeResult(country, firstFee + steps * increment, `季节包裹${parcelIndex + 1}`, `${(.1 + steps * .1).toFixed(1)} kg`);
  }
  const envelope = EU_REGULAR_ENVELOPES[country].find(([limits, maxKg]) => fits(dimsCm, limits) && rawKg <= maxKg);
  if (envelope) return feeResult(country, envelope[2], '全年同价信封', `${Math.ceil(rawKg * 1000)} g`);
  const bulky = EU_BULKY[country].find(row => fits(dimsCm, row.dims) && actualKg <= row.maxActualKg
    && dimensionalKg <= row.maxDimensionalKg && (row.minActualKg === undefined || actualKg > row.minActualKg));
  if (bulky) {
    const steps = ceilSteps(rawKg - bulky.firstKg, 1);
    const billable = bulky.firstKg + steps;
    return feeResult(country, bulky.fee + steps * bulky.increment, bulky.name, `${billable.toFixed(2)} kg`);
  }
  return unresolved(country, 'missing_rule', `没有匹配到${country}完整尺寸档；大件或特殊尺寸规则需要人工核对。`);
}

export function calculateFba({ dimensionsMm, weightG, priceUsd, season, fx = {} }) {
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3 || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(weightG) || weightG <= 0 || !Number.isFinite(priceUsd) || priceUsd <= 0
    || !['off', 'peak'].includes(season)) {
    throw new TypeError('请提供有效的三边毫米数、克重、USD 售价和淡旺季。');
  }
  const dimsCm = dimensionsMm.map(value => value / 10).sort((a, b) => b - a);
  const dimsIn = dimsCm.map(value => value / INCHES_PER_CM);
  const actualKg = weightG / 1000;
  const dimensionalKg = dimsCm.reduce((product, value) => product * value, 1) / (INCHES_PER_CM ** 3) / 139 * KG_PER_LB;
  const baseInput = { dimsCm, dimsIn, actualKg, dimensionalKg, season };
  const output = {
    US: usFee({ ...baseInput, priceUsd }),
    CA: caFee(baseInput)
  };
  for (const country of ['DE', 'UK']) {
    const rate = fx[country === 'DE' ? 'EUR' : 'GBP'];
    if (!Number.isFinite(rate) || rate <= 0) {
      output[country] = unresolved(country, 'fx_required', '缺少有效的本币/美元汇率，无法判断当地 20 元售价档。');
    } else {
      output[country] = euFee(country, { ...baseInput, localPrice: priceUsd * 1.1 * rate });
    }
  }
  return output;
}
