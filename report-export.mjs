import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

let reportFontName = 'Roboto';

const money = value => value === null || value === undefined ? '待补充' : Number(value).toFixed(2);
const datePart = value => String(value || new Date().toISOString()).slice(0, 10).replaceAll('-', '');
const safeName = value => String(value || '未命名产品').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名产品';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportFilename(snapshot, extension) {
  return `${safeName(snapshot?.form?.productName)}_跨境费用测算_${datePart(snapshot?.generatedAt)}.${extension}`;
}

export function configurePdfFont(base64Font) {
  const bundledVfs = pdfFonts?.pdfMake?.vfs || pdfFonts?.vfs || {};
  pdfMake.vfs = { ...bundledVfs, 'SimHei-subset.ttf': base64Font };
  pdfMake.fonts = { SimHei: { normal: 'SimHei-subset.ttf', bold: 'SimHei-subset.ttf', italics: 'SimHei-subset.ttf', bolditalics: 'SimHei-subset.ttf' } };
  reportFontName = 'SimHei';
}

export function buildWorkbook(snapshot) {
  const book = XLSX.utils.book_new();
  const product = [
    ['跨境费用测算报告', ''],
    ['产品名称', snapshot.form.productName || '待补充'],
    ['报告生成时间', snapshot.generatedAt],
    ['FBA配送日期', snapshot.form.feeDate || '待补充'],
    ['季节', snapshot.seasonLabel || '待补充'],
    ['包装长 (mm)', snapshot.form.length === '' ? '待补充' : Number(snapshot.form.length)],
    ['包装宽 (mm)', snapshot.form.width === '' ? '待补充' : Number(snapshot.form.width)],
    ['包装高 (mm)', snapshot.form.height === '' ? '待补充' : Number(snapshot.form.height)],
    ['包装重量 (g)', snapshot.weightKg === null ? '待补充' : Number(snapshot.form.weight)],
    ['包装重量 (kg)', snapshot.weightKg === null ? '待补充' : snapshot.weightKg],
    ['包装重量 (lb)', snapshot.weightLb === null ? '待补充' : snapshot.weightLb],
    ['售价 (USD)', snapshot.priceUsd === null ? '待补充' : snapshot.priceUsd],
    ['包装体积 (mm³)', snapshot.volumeMm3 ?? '待补充'],
    ['空运计费重 (g)', snapshot.airChargeableWeightG ?? '待补充']
  ];
  const rows = [['国家', '当地币种', 'FBA费用', '空运头程', '海运头程', '非FBA尾程', '当前可计算费用合计', '折算USD', '数据状态']];
  for (const country of snapshot.countries) {
    const values = Object.fromEntries(country.components.map(component => [component.label, component]));
    rows.push([
      country.name,
      country.currency,
      values.FBA费用?.status === '已计算' ? values.FBA费用.amount : values.FBA费用?.status || '待补充',
      values.空运头程?.status === '已计算' ? values.空运头程.amount : values.空运头程?.status || '待补充',
      values.海运头程?.status === '已计算' ? values.海运头程.amount : values.海运头程?.status || '待补充',
      values.非FBA尾程?.status === '已计算' ? values.非FBA尾程.amount : values.非FBA尾程?.status || '待补充',
      country.total === null ? country.status : country.total,
      country.totalUsd === null ? country.status : country.totalUsd,
      country.status
    ]);
  }
  const notes = [
    ['计算说明', ''],
    ['可比较完整总成本', snapshot.comparable ? '是' : '否'],
    ['最低成本国家', snapshot.lowestCountry || '当前各国费用项目尚未全部接入，暂时不能比较完整总成本。'],
    ['汇率', `USD/EUR ${snapshot.rates.EUR ?? '待补充'}；USD/GBP ${snapshot.rates.GBP ?? '待补充'}；USD/CAD ${snapshot.rates.CAD ?? '待补充'}`],
    ['汇率更新时间', snapshot.rateUpdated],
    ['汇率来源', snapshot.rateSource],
    ['待补充项目', snapshot.missingItems.length ? snapshot.missingItems.join('、') : '无'],
    ['说明', '本报告仅作为测算参考，金额来自网页当前计算结果快照。']
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(product), '产品参数');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '四国费用');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(notes), '计算说明');
  return book;
}

export function exportExcel(snapshot, { save = true } = {}) {
  const book = buildWorkbook(snapshot);
  const data = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  if (save && typeof document !== 'undefined') downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFilename(snapshot, 'xlsx'));
  return data;
}

function row(country) {
  const values = Object.fromEntries(country.components.map(component => [component.label, component]));
  return [country.name, country.currency, ...['FBA费用', '空运头程', '海运头程', '非FBA尾程'].map(label => values[label]?.status === '已计算' ? money(values[label].amount) : (values[label]?.status || '待补充')), country.total === null ? country.status : money(country.total), country.totalUsd === null ? country.status : `${money(country.totalUsd)} USD`, country.status];
}

export function buildPdfDefinition(snapshot) {
  if (pdfFonts?.pdfMake?.vfs) pdfMake.vfs = pdfFonts.pdfMake.vfs;
  else if (pdfFonts?.vfs) pdfMake.vfs = pdfFonts.vfs;
  const productRows = [
    ['产品名称', snapshot.form.productName || '待补充'],
    ['报告生成时间', snapshot.generatedAt],
    ['FBA配送日期', snapshot.form.feeDate || '待补充'],
    ['季节', snapshot.seasonLabel || '待补充'],
    ['尺寸 (mm)', `${snapshot.form.length || '待补充'} × ${snapshot.form.width || '待补充'} × ${snapshot.form.height || '待补充'}`],
    ['重量', snapshot.weightKg === null ? '待补充' : `${snapshot.form.weight}g / ${snapshot.weightKg.toFixed(3)}kg / ${snapshot.weightLb.toFixed(3)}lb`],
    ['售价', snapshot.priceUsd === null ? '待补充' : `${money(snapshot.priceUsd)} USD`],
    ['体积 / 空运计费重', `${snapshot.volumeMm3 ?? '待补充'} mm³ / ${snapshot.airChargeableWeightG ?? '待补充'} g`]
  ];
  const table = [['国家', '币种', 'FBA', '空运', '海运', '尾程', '合计', 'USD', '状态'], ...snapshot.countries.map(row)];
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [30, 34, 30, 34],
    defaultStyle: { font: reportFontName, fontSize: 8 },
    content: [
      { text: '跨境费用测算报告', style: 'title' },
      { text: '基本信息与产品参数', style: 'heading' },
      { table: { widths: [115, '*'], body: productRows }, layout: 'lightHorizontalLines' },
      { text: '四国费用结果', style: 'heading' },
      { table: { headerRows: 1, widths: [52, 35, 48, 48, 48, 48, 52, 52, '*'], body: table }, layout: 'lightHorizontalLines' },
      { text: '汇率与计算说明', style: 'heading' },
      { ul: [
        `USD/EUR：${snapshot.rates.EUR ?? '待补充'}；USD/GBP：${snapshot.rates.GBP ?? '待补充'}；USD/CAD：${snapshot.rates.CAD ?? '待补充'}`,
        `汇率更新时间：${snapshot.rateUpdated}；来源：${snapshot.rateSource}`,
        `旺淡季规则：${snapshot.seasonLabel || '待补充'}`,
        `待补充项目：${snapshot.missingItems.length ? snapshot.missingItems.join('、') : '无'}`,
        snapshot.comparable ? `最低成本国家：${snapshot.lowestCountry}` : '当前各国费用项目尚未全部接入，暂时不能比较完整总成本。',
        '本报告仅作为测算参考，金额来自网页当前计算结果快照。'
      ] }
    ],
    styles: { title: { fontSize: 18, bold: true, margin: [0, 0, 0, 14] }, heading: { fontSize: 11, bold: true, margin: [0, 14, 0, 6] } }
  };
}

export function exportPdf(snapshot, { save = true } = {}) {
  const definition = buildPdfDefinition(snapshot);
  const pdf = pdfMake.createPdf(definition);
  if (save && typeof document !== 'undefined') pdf.download(reportFilename(snapshot, 'pdf'));
  return { definition, pdf };
}
