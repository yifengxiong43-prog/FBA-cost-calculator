import { getUsFeeSeason } from './fba-calculator.mjs';

// 美德英加头程计算-陈畅.xlsx, Sheet1!A14:F21.
// Rates are USD per chargeable kilogram. The supplied workbook lists the same
// quote for peak and non-peak seasons; keep the seasonal key explicit so a
// future seasonal update does not change the calculation interface.
const AIR_QUOTES_USD_PER_KG = {
  US: { nonpeak: 12, peak: 12 },
  DE: { nonpeak: 10.08, peak: 10.08 },
  GB: { nonpeak: 10.64, peak: 10.64 },
  CA: { nonpeak: 9.94, peak: 9.94 }
};

const AIR_DIMENSIONAL_FACTOR = 167;

export function calculateAirFreight({ country, date, weightG, dimensionsMm }) {
  if (!Number.isFinite(weightG) || weightG <= 0) throw new TypeError('请提供有效的包装重量。');
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3
    || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('请提供有效的包装长宽高尺寸。');
  }
  const season = getUsFeeSeason(date);
  if (!season) throw new TypeError('请提供有效的配送日期。');
  if (!Object.hasOwn(AIR_QUOTES_USD_PER_KG, country)) throw new TypeError('该国家没有空运报价。');

  const volumeM3 = dimensionsMm[0] * dimensionsMm[1] * dimensionsMm[2] / 1e9;
  const actualWeightKg = weightG / 1000;
  const volumeWeightKg = volumeM3 * AIR_DIMENSIONAL_FACTOR;
  const chargeableWeightKg = Math.max(actualWeightKg, volumeWeightKg);
  const quoteUsdPerKg = AIR_QUOTES_USD_PER_KG[country][season.season === '旺季' ? 'peak' : 'nonpeak'];

  return {
    currency: 'USD',
    total: chargeableWeightKg * quoteUsdPerKg,
    quoteUsdPerKg,
    actualWeightKg,
    volumeM3,
    volumeWeightKg,
    chargeableWeightKg,
    dimensionalFactor: AIR_DIMENSIONAL_FACTOR,
    season: season.season,
    ratePeriod: season.ratePeriod
  };
}
