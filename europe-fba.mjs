const LOCAL_RATES = {
  GB: {
    currency: 'GBP',
    envelopes: [
      { tier: '轻型信封', max: [330, 230, 25], weights: [20, 40, 60, 80, 100, 210], nonpeak: [1.83, 1.87, 1.89, 2.07, 2.08, 2.10], peak: [1.83, 1.87, 1.89, 2.07, 2.08, 2.10] },
      { tier: '标准信封', max: [330, 230, 25], weights: [460], nonpeak: [2.16], peak: [2.16] },
      { tier: '大号信封', max: [330, 230, 40], weights: [960], nonpeak: [2.72], peak: [2.79] },
      { tier: '超大号信封', max: [330, 230, 60], weights: [960], nonpeak: [2.94], peak: [3.01] }
    ],
    parcels: [
      { tier: '小包裹', max: [350, 250, 120], maxWeight: 3900, weights: [150, 400, 900, 1400, 1900, 3900], nonpeak: [2.91, 3.00, 3.04, 3.05, 3.25, 3.27], peak: [3.02, 3.11, 3.15, 3.16, 3.37, 3.39] },
      { tier: '标准包裹', max: [450, 340, 260], maxWeight: 11900, weights: [150, 400, 900, 1400, 1900, 2900, 3900, 5900, 8900, 11900], nonpeak: [2.94, 3.02, 3.06, 3.26, 3.48, 3.49, 3.54, 3.56, 3.57, 3.58], peak: [3.05, 3.16, 3.18, 3.38, 3.61, 3.62, 3.67, 3.69, 3.70, 3.71] }
    ]
  },
  DE: {
    currency: 'EUR',
    envelopes: [
      { tier: '轻型信封', max: [330, 230, 25], weights: [20, 40, 60, 80, 100, 210], nonpeak: [2.33, 2.37, 2.39, 2.52, 2.54, 2.57], peak: [2.33, 2.37, 2.39, 2.52, 2.54, 2.57] },
      { tier: '标准信封', max: [330, 230, 25], weights: [460], nonpeak: [2.68], peak: [2.68] },
      { tier: '大号信封', max: [330, 230, 40], weights: [960], nonpeak: [3.04], peak: [3.04] },
      { tier: '超大号信封', max: [330, 230, 60], weights: [960], nonpeak: [3.42], peak: [3.42] }
    ],
    parcels: [
      { tier: '小包裹', max: [350, 250, 120], maxWeight: 3900, weights: [150, 400, 900, 1400, 1900, 3900], nonpeak: [3.38, 3.39, 3.40, 3.41, 3.43, 4.54], peak: [3.59, 3.60, 3.61, 3.63, 3.65, 4.83] },
      { tier: '标准包裹', max: [450, 340, 260], maxWeight: 11900, weights: [150, 400, 900, 1400, 1900, 2900, 3900, 5900, 8900, 11900], nonpeak: [3.39, 3.42, 3.44, 3.93, 3.95, 4.55, 5.09, 5.22, 6.03, 6.65], peak: [3.60, 3.64, 3.66, 4.18, 4.20, 4.84, 5.42, 5.56, 6.42, 7.09] }
    ]
  }
};

function parseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? { year, month, day } : null;
}

export function getEuropeFeeSeason(date) {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  const peak = (month === 10 && day >= 15) || month === 11 || month === 12 || (month === 1 && day <= 14);
  if (peak) {
    const startYear = month === 1 ? year - 1 : year;
    return { season: '旺季', ratePeriod: `${startYear}-10-15 至 ${startYear + 1}-01-14`, rateYear: startYear };
  }
  return { season: '淡季', ratePeriod: `${year}-01-15 至 ${year}-10-14`, rateYear: 2026 };
}

function fits(dimensionsMm, maxDimensionsMm) {
  const dimensions = [...dimensionsMm].sort((a, b) => b - a);
  const max = [...maxDimensionsMm].sort((a, b) => b - a);
  return dimensions.every((value, index) => value <= max[index] + 1e-10);
}

function validate({ country, dimensionsMm, weightG, date }) {
  if (!LOCAL_RATES[country] || !Array.isArray(dimensionsMm) || dimensionsMm.length !== 3
    || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(weightG) || weightG <= 0 || !parseDate(date)) return false;
  return true;
}

function findRate(tier, billedWeightG, season) {
  const row = tier.weights.findIndex(max => billedWeightG <= max + 1e-10);
  return row < 0 ? null : { total: tier[season][row], row };
}

function findTier(rates, dimensionsMm, weightG) {
  for (const tier of rates.envelopes) {
    if (fits(dimensionsMm, tier.max) && weightG <= tier.weights.at(-1) + 1e-10) return { tier, dimensional: false };
  }
  for (const tier of rates.parcels) {
    if (fits(dimensionsMm, tier.max) && weightG <= tier.maxWeight + 1e-10) return { tier, dimensional: true };
  }
  return null;
}

export function calculateEuropeFba({ country, dimensionsMm, weightG, date }) {
  if (!validate({ country, dimensionsMm, weightG, date })) return { status: 'unsupported', total: null, reason: '请提供有效的英国或德国包装尺寸、重量和配送日期。' };
  const season = getEuropeFeeSeason(date);
  const rates = LOCAL_RATES[country];
  const selected = findTier(rates, dimensionsMm, weightG);
  if (!selected) return { status: 'unsupported', country, total: null, reason: '包装尺寸或重量超出英国、德国本地 FBA 已导入的包裹费率表。' };
  const volumeWeightG = dimensionsMm[0] * dimensionsMm[1] * dimensionsMm[2] / 5000;
  const billedWeightG = selected.dimensional ? Math.ceil(Math.max(weightG, volumeWeightG) / 100 - 1e-10) * 100 : weightG;
  const quote = findRate(selected.tier, billedWeightG, season.season === '旺季' ? 'peak' : 'nonpeak');
  if (!quote) return { status: 'unsupported', country, tier: selected.tier.tier, total: null, billedWeightG, season: season.season, ratePeriod: season.ratePeriod, reason: '计费重量超出该尺寸档的已导入费率表。' };
  return {
    status: 'ok', country, currency: rates.currency, tier: selected.tier.tier, billedWeightG,
    total: Math.round(quote.total * 100) / 100, season: season.season, ratePeriod: season.ratePeriod, rateYear: season.rateYear
  };
}
