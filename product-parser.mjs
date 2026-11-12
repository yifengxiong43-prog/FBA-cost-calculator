const FIELD_LABELS = {
  productName: '产品名称', length: '包装长', width: '包装宽', height: '包装高',
  weight: '包装重量', price: '售价（USD）', shippingMode: '头程方式', feeDate: 'FBA配送日期'
};

const NUMBER = '(\\d+(?:\\.\\d+)?)';
const DIMENSION_UNIT = '(mm|毫米|millimeters?|cm|厘米|centimeters?|m|米|meters?|inches?|inch|英寸)?';

function formatNumber(value) {
  return String(Math.round(value * 100) / 100);
}

function dimensionToMm(value, unit) {
  const normalized = (unit || '').toLowerCase();
  if (['mm', '毫米', 'millimeter', 'millimeters'].includes(normalized)) return value;
  if (['cm', '厘米', 'centimeter', 'centimeters'].includes(normalized)) return value * 10;
  if (['m', '米', 'meter', 'meters'].includes(normalized)) return value * 1000;
  if (['inch', 'inches', '英寸'].includes(normalized)) return value * 25.4;
  return null;
}

function parseDimensions(text, values, uncertain) {
  const dimensionPattern = new RegExp(`(?:包装尺寸|尺寸|长宽高|package\\s*size|dimensions?)\\s*(?:为|是|[:：=])?\\s*${NUMBER}\\s*${DIMENSION_UNIT}\\s*[×xX*]\\s*${NUMBER}\\s*${DIMENSION_UNIT}\\s*[×xX*]\\s*${NUMBER}\\s*${DIMENSION_UNIT}`, 'i');
  const match = text.match(dimensionPattern);
  if (match) {
    const rawValues = [Number(match[1]), Number(match[3]), Number(match[5])];
    const units = [match[2], match[4], match[6]];
    const sharedUnit = units.find(Boolean);
    const converted = rawValues.map((value, index) => dimensionToMm(value, units[index] || sharedUnit));
    if (converted.some(value => value === null)) {
      uncertain.push('已识别到三边尺寸，但缺少单位，请确认是 mm、cm、m 还是英寸。');
      return;
    }
    [values.length, values.width, values.height] = converted.map(formatNumber);
    return;
  }

  const partialPattern = new RegExp(`(?:包装尺寸|尺寸|长宽高|package\\s*size|dimensions?)\\s*(?:为|是|[:：=])?\\s*${NUMBER}\\s*${DIMENSION_UNIT}\\s*[×xX*]\\s*${NUMBER}\\s*${DIMENSION_UNIT}`, 'i');
  if (partialPattern.test(text)) uncertain.push('只识别到部分尺寸，长、宽、高三边未齐全，因此没有填入尺寸。');
}

function parseWeight(text, values, uncertain) {
  const match = text.match(new RegExp(`(?:包装重量|重量|毛重|净重|gross\\s*weight|weight)\\s*(?:为|是|[:：=])?\\s*${NUMBER}\\s*(kg|公斤|千克|g|克|lb|lbs?|pounds?|磅|oz|盎司)`, 'i'));
  if (!match) return;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const grams = ['kg', '公斤', '千克'].includes(unit) ? amount * 1000
    : ['g', '克'].includes(unit) ? amount
      : ['lb', 'lbs', 'pound', 'pounds', '磅'].includes(unit) ? amount * 453.59237
        : ['oz', '盎司'].includes(unit) ? amount * 28.349523125 : null;
  if (grams === null) uncertain.push('识别到重量，但无法确认单位。');
  else values.weight = formatNumber(grams);
}

function parsePrice(text, values, uncertain) {
  const match = text.match(new RegExp(`(?:售价|销售价|价格|price)\\s*(?:为|是|[:：=])?\\s*(US\\$|USD|\\$|美元|CNY|RMB|人民币|¥)?\\s*${NUMBER}\\s*(USD|美元|US\\s*dollars?|CNY|RMB|人民币|元|¥)?`, 'i'));
  if (!match) return;
  const currency = `${match[1] || ''}${match[3] || ''}`.toLowerCase();
  if (/^(us\$|usd|\$|美元|us dollars?)$/.test(currency)) values.price = Number(match[2]).toFixed(2);
  else uncertain.push(currency ? '识别到售价，但币种不是 USD；当前售价栏只接受 USD。' : '识别到售价数字，但未识别出币种，请确认是否为 USD。');
}

function parseDate(text, values, uncertain) {
  const match = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/)
    || text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    uncertain.push('识别到日期，但日期无效，请检查。');
    return;
  }
  values.feeDate = `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseProductDetails(input) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  const values = {
    productName: '', length: '', width: '', height: '', weight: '', price: '', shippingMode: '', feeDate: ''
  };
  const uncertain = [];
  const named = text.match(/(?:产品名称|产品名|品名|product)\s*[:：为是]?\s*([^，,。;；]+)/i)
    || text.match(/这(?:是一套|是一款|是一个|是一件|是|为)\s*([^，,。;；]+)/);
  if (named) values.productName = named[1].trim();

  parseDimensions(text, values, uncertain);
  parseWeight(text, values, uncertain);
  parsePrice(text, values, uncertain);
  parseDate(text, values, uncertain);

  const hasAir = /空运|空派|\bair\b/i.test(text);
  const hasSea = /海运|海派|\bsea\b/i.test(text);
  if (hasAir && hasSea) values.shippingMode = 'both';
  else if (hasAir) values.shippingMode = 'air';
  else if (hasSea) values.shippingMode = 'sea';

  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => FIELD_LABELS[key]);
  const recognized = Object.entries(values).filter(([, value]) => Boolean(value)).map(([key]) => FIELD_LABELS[key]);
  return { values, recognized, missing, uncertain };
}
