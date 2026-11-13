import { getUsFeeSeason } from './fba-calculator.mjs';

// 美德英加头程计算-陈畅.xlsx, Sheet1!A1:G9 and B11.
// USD per 40HQ / 63.5 m³. Quotes fluctuate; no effective year is supplied.
// User confirmed the freight peak window: Oct 15 through Jan 14 inclusive.
const CONTAINER_QUOTES_USD = {
  US: { nonpeak: 8000, peak: 13000 },
  DE: { nonpeak: 4000, peak: 6000 },
  GB: { nonpeak: 3500, peak: 4000 },
  CA: { nonpeak: 8000, peak: 12000 }
};

export function calculateSeaFreight({ country, date, dimensionsMm }) {
  if (!Array.isArray(dimensionsMm) || dimensionsMm.length !== 3
    || dimensionsMm.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('请提供有效的包装长宽高尺寸。');
  }
  const season = getUsFeeSeason(date);
  if (!season) throw new TypeError('请提供有效的配送日期。');
  if (!Object.hasOwn(CONTAINER_QUOTES_USD, country)) throw new TypeError('该国家没有海运报价。');
  const containerQuoteUsd = CONTAINER_QUOTES_USD[country][season.season === '旺季' ? 'peak' : 'nonpeak'];
  const volumeM3 = dimensionsMm[0] * dimensionsMm[1] * dimensionsMm[2] / 1e9;
  return { currency: 'USD', total: containerQuoteUsd / 63.5 * volumeM3,
    containerQuoteUsd, containerVolumeM3: 63.5, volumeM3, season: season.season };
}
