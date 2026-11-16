const COUNTRY_DEFINITIONS = [
  { key: 'US', name: '美国', currency: 'USD', rateKey: 'USD', fields: [['FBA费用', 'usFbaValue'], ['空运头程', null], ['海运头程', 'usSeaValue'], ['非FBA尾程', 'usTailValue']] },
  { key: 'DE', name: '德国', currency: 'EUR', rateKey: 'EUR', fields: [['FBA费用', 'deFbaValue'], ['空运头程', null], ['海运头程', 'deSeaValue'], ['非FBA尾程', 'deTailValue']] },
  { key: 'GB', name: '英国', currency: 'GBP', rateKey: 'GBP', fields: [['FBA费用', 'gbFbaValue'], ['空运头程', null], ['海运头程', 'gbSeaValue'], ['非FBA尾程', null]] },
  { key: 'CA', name: '加拿大', currency: 'CAD', rateKey: 'CAD', fields: [['FBA费用', 'caFbaValue'], ['空运头程', null], ['海运头程', 'caSeaValue'], ['非FBA尾程', null]] }
];

const FORM_KEYS = ['productName', 'length', 'width', 'height', 'weight', 'price', 'feeDate'];

export function parseDisplayedAmount(display) {
  const text = String(display ?? '').trim();
  if (!text || /待计算|待补充|待接入|请补充|超出报价范围|—/.test(text)) return null;
  const match = text.replace(/,/g, '').match(/(?:<\s*)?(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function fieldSnapshot(label, display, currency, statusOverride) {
  const cleanDisplay = String(display ?? '').trim() || '待补充';
  const amount = parseDisplayedAmount(cleanDisplay);
  const status = statusOverride || (amount === null
    ? (/待接入/.test(cleanDisplay) ? '待接入' : '待补充')
    : '已计算');
  return { label, display: cleanDisplay, amount, currency, status };
}

function readText(document, id, fallback = '') {
  return document?.querySelector?.(`#${id}`)?.textContent?.trim() || fallback;
}

function readValue(document, id, fallback = '') {
  return document?.querySelector?.(`#${id}`)?.value ?? fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resultStatus(document, id) {
  if (!id) return '待接入';
  const element = document?.querySelector?.(`#${id}`);
  if (!element) return '待接入';
  const text = element.textContent?.trim() || '';
  return parseDisplayedAmount(text) === null ? '待补充' : '已计算';
}

export function buildReportSnapshot({ form = {}, countries = [], rates = {}, rateUpdated = '', rateSource = '', season = '', seasonLabel = '', volumeMm3 = null, airChargeableWeightG = null, generatedAt = new Date().toISOString(), missingItems = [] } = {}) {
  const normalizedForm = Object.fromEntries(FORM_KEYS.map(key => [key, form[key] ?? '']));
  const weightG = numberOrNull(normalizedForm.weight);
  const length = numberOrNull(normalizedForm.length);
  const width = numberOrNull(normalizedForm.width);
  const height = numberOrNull(normalizedForm.height);
  const volume = numberOrNull(volumeMm3) ?? (length && width && height ? length * width * height : null);
  const airWeight = numberOrNull(airChargeableWeightG) ?? (volume ? volume / 5000 : null);
  const normalizedCountries = countries.map(country => {
    const components = (country.components || []).map(component => fieldSnapshot(component.label, component.display, component.currency || country.currency, component.status));
    const complete = components.length > 0 && components.every(component => component.status === '已计算');
    const total = complete ? components.reduce((sum, component) => sum + component.amount, 0) : null;
    const rate = country.currency === 'USD' ? 1 : Number(rates[country.rateKey || country.currency]);
    return {
      key: country.key || country.name,
      name: country.name,
      currency: country.currency,
      rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      components,
      complete,
      total,
      totalUsd: complete && total !== null ? total / rate : null,
      status: complete ? '已计算' : (components.some(component => component.status === '待补充') ? '待补充' : '待接入')
    };
  });
  const comparableCountries = normalizedCountries.filter(country => country.complete && country.totalUsd !== null);
  const comparable = normalizedCountries.length === 4 && comparableCountries.length === 4;
  const lowestCountry = comparable ? [...comparableCountries].sort((a, b) => a.totalUsd - b.totalUsd)[0]?.name || null : null;
  const derivedMissing = normalizedCountries.flatMap(country => country.components.filter(component => component.status !== '已计算').map(component => `${country.name}${component.label}`));
  return Object.freeze({
    version: 1,
    generatedAt,
    form: normalizedForm,
    season: season || '—',
    seasonLabel: seasonLabel || season || '—',
    volumeMm3: volume,
    airChargeableWeightG: airWeight,
    weightKg: weightG === null ? null : weightG / 1000,
    weightLb: weightG === null ? null : weightG / 453.59237,
    priceUsd: numberOrNull(normalizedForm.price),
    countries: normalizedCountries,
    rates: { USD: 1, EUR: numberOrNull(rates.EUR), GBP: numberOrNull(rates.GBP), CAD: numberOrNull(rates.CAD) },
    rateUpdated: rateUpdated || '—',
    rateSource: rateSource || '页面实时汇率',
    missingItems: [...new Set([...(missingItems || []), ...derivedMissing])],
    calculated: normalizedCountries.some(country => country.components.some(component => component.status === '已计算')),
    comparable,
    lowestCountry
  });
}

export function readReportSnapshot(document, { generatedAt = new Date().toISOString(), rateSource = '页面实时汇率' } = {}) {
  const form = Object.fromEntries(FORM_KEYS.map(key => [key, readValue(document, key)]));
  const rates = { USD: 1, EUR: numberOrNull(readText(document, 'fxEUR')), GBP: numberOrNull(readText(document, 'fxGBP')), CAD: numberOrNull(readText(document, 'fxCAD')) };
  const countries = COUNTRY_DEFINITIONS.map(definition => ({
    key: definition.key,
    name: definition.name,
    currency: definition.currency,
    rateKey: definition.rateKey,
    components: definition.fields.map(([label, id]) => {
      if (!id) return { label, display: '待补充', currency: definition.currency, status: '待补充' };
      const display = readText(document, id, '待补充');
      return { label, display, currency: definition.currency, status: resultStatus(document, id) };
    })
  }));
  const seasonBadge = readText(document, 'seasonBadge', '—');
  const snapshot = buildReportSnapshot({
    form,
    countries,
    rates,
    rateUpdated: readText(document, 'fxUpdated', '—'),
    rateSource,
    season: seasonBadge,
    seasonLabel: seasonBadge,
    volumeMm3: parseDisplayedAmount(readText(document, 'volumeValue')),
    airChargeableWeightG: parseDisplayedAmount(readText(document, 'airWeightValue')),
    generatedAt
  });
  const resultHint = readText(document, 'resultHint', '');
  return Object.freeze({ ...snapshot, calculated: /^计算完成/.test(resultHint), resultHint });
}

export function snapshotFingerprint(snapshot) {
  const form = snapshot?.form || {};
  return JSON.stringify({
    form,
    season: snapshot?.season,
    countries: (snapshot?.countries || []).map(country => ({ name: country.name, components: country.components.map(component => [component.label, component.display, component.status]) })),
    rates: snapshot?.rates
  });
}

export { COUNTRY_DEFINITIONS };
