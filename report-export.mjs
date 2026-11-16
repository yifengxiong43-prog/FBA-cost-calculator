import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

let reportFontName = 'Roboto';

const money = value => value === null || value === undefined ? '待补充' : Number(value).toFixed(2);
const number = (value, digits = 3) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '待补充'
  : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
const amountWithUnit = (value, currency, suffix = '/件') => value === null || value === undefined
  ? '待补充'
  : `${money(value)} ${currency}${suffix}`;
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
  const rows = [[
    '产品名称', '国家', 'FBA配送日期', '季节', '售价 (USD)', '包装重量 (g)', '包装重量 (kg)', '包装重量 (lb)',
    '包装长 (mm)', '包装宽 (mm)', '包装高 (mm)', '包装体积 (mm³)', '空运计费重 (g)', '当地币种',
    'FBA费用 (当地币种/件)', '空运头程 (当地币种/件)', '海运头程 (当地币种/件)', '非FBA尾程 (当地币种/件)',
    '当前可计算费用合计 (当地币种/件)', '折算USD (USD/件)', '数据状态'
  ]];
  for (const country of snapshot.countries) {
    const values = Object.fromEntries(country.components.map(component => [component.label, component]));
    rows.push([
      snapshot.form.productName || '待补充',
      country.name,
      snapshot.form.feeDate || '待补充',
      snapshot.seasonLabel || '待补充',
      snapshot.priceUsd === null ? '待补充' : snapshot.priceUsd,
      snapshot.form.weight === '' ? '待补充' : Number(snapshot.form.weight),
      snapshot.weightKg === null ? '待补充' : snapshot.weightKg,
      snapshot.weightLb === null ? '待补充' : snapshot.weightLb,
      snapshot.form.length === '' ? '待补充' : Number(snapshot.form.length),
      snapshot.form.width === '' ? '待补充' : Number(snapshot.form.width),
      snapshot.form.height === '' ? '待补充' : Number(snapshot.form.height),
      snapshot.volumeMm3 ?? '待补充',
      snapshot.airChargeableWeightG ?? '待补充',
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
    ['汇率', `1 USD = ${snapshot.rates.EUR ?? '待补充'} EUR；1 USD = ${snapshot.rates.GBP ?? '待补充'} GBP；1 USD = ${snapshot.rates.CAD ?? '待补充'} CAD`],
    ['汇率更新时间', snapshot.rateUpdated],
    ['汇率来源', snapshot.rateSource],
    ['待补充项目', snapshot.missingItems.length ? snapshot.missingItems.join('、') : '无'],
    ['说明', '本报告仅作为测算参考，金额来自网页当前计算结果快照。']
  ];
  const productSheet = XLSX.utils.aoa_to_sheet(product);
  productSheet['!cols'] = [{ wch: 24 }, { wch: 34 }];
  productSheet['!rows'] = [{ hpt: 28 }];
  productSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  const feesSheet = XLSX.utils.aoa_to_sheet(rows);
  feesSheet['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 13 }, { wch: 14 }, { wch: 15 }, { wch: 15 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 17 }, { wch: 12 }, { wch: 23 }, { wch: 25 },
    { wch: 25 }, { wch: 27 }, { wch: 31 }, { wch: 20 }, { wch: 12 }
  ];
  feesSheet['!rows'] = [{ hpt: 36 }];
  feesSheet['!autofilter'] = { ref: `A1:U${rows.length}` };
  feesSheet['!freeze'] = { xSplit: 2, ySplit: 1 };
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet['!cols'] = [{ wch: 22 }, { wch: 90 }];
  notesSheet['!rows'] = [{ hpt: 28 }];
  notesSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(book, productSheet, '产品参数');
  XLSX.utils.book_append_sheet(book, feesSheet, '四国费用');
  XLSX.utils.book_append_sheet(book, notesSheet, '计算说明');
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
  const component = label => values[label]?.status === '已计算'
    ? amountWithUnit(values[label].amount, country.currency)
    : (values[label]?.status || '待补充');
  return [country.name, country.currency, ...['FBA费用', '空运头程', '海运头程', '非FBA尾程'].map(component), country.total === null ? country.status : amountWithUnit(country.total, country.currency), country.totalUsd === null ? country.status : amountWithUnit(country.totalUsd, 'USD'), country.status];
}

export function buildPdfDefinition(snapshot) {
  if (pdfFonts?.pdfMake?.vfs) pdfMake.vfs = pdfFonts.pdfMake.vfs;
  else if (pdfFonts?.vfs) pdfMake.vfs = pdfFonts.vfs;
  const productRows = [
    ['产品名称', snapshot.form.productName || '待补充'],
    ['报告生成时间', snapshot.generatedAt],
    ['FBA配送日期', snapshot.form.feeDate || '待补充'],
    ['季节', snapshot.seasonLabel || '待补充'],
    ['包装长', snapshot.form.length === '' ? '待补充' : `${number(Number(snapshot.form.length), 2)} mm`],
    ['包装宽', snapshot.form.width === '' ? '待补充' : `${number(Number(snapshot.form.width), 2)} mm`],
    ['包装高', snapshot.form.height === '' ? '待补充' : `${number(Number(snapshot.form.height), 2)} mm`],
    ['包装重量', snapshot.weightKg === null ? '待补充' : `${number(Number(snapshot.form.weight), 2)} g`],
    ['重量换算', snapshot.weightKg === null ? '待补充' : `${number(snapshot.weightKg, 3)} kg / ${number(snapshot.weightLb, 3)} lb`],
    ['售价', snapshot.priceUsd === null ? '待补充' : amountWithUnit(snapshot.priceUsd, 'USD', '')],
    ['包装体积', snapshot.volumeMm3 === null ? '待补充' : `${number(snapshot.volumeMm3, 0)} mm³`],
    ['空运计费重', snapshot.airChargeableWeightG === null ? '待补充' : `${number(snapshot.airChargeableWeightG, 2)} g`]
  ];
  const table = [['国家', '币种', 'FBA (币/件)', '空运 (币/件)', '海运 (币/件)', '尾程 (币/件)', '合计 (币/件)', 'USD/件', '状态'], ...snapshot.countries.map(row)];
  const tableRows = table.map((cells, index) => index === 0
    ? cells.map(text => ({ text, style: 'tableHeader' }))
    : cells.map((text, column) => ({ text, style: column === 0 ? 'countryName' : 'tableCell' })));
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [30, 34, 30, 34],
    defaultStyle: { font: reportFontName, fontSize: 8 },
    content: [
      { text: '跨境费用测算报告', style: 'title' },
      { text: '基本信息与产品参数', style: 'heading' },
      { table: { widths: [115, '*'], body: productRows }, layout: 'lightHorizontalLines' },
      { text: '四国费用结果', style: 'heading' },
      { table: { headerRows: 1, widths: [40, 29, 53, 53, 53, 53, 57, 50, '*'], body: tableRows }, layout: 'lightHorizontalLines' },
      { text: '汇率与计算说明', style: 'heading' },
      { ul: [
        `1 USD = ${snapshot.rates.EUR ?? '待补充'} EUR；1 USD = ${snapshot.rates.GBP ?? '待补充'} GBP；1 USD = ${snapshot.rates.CAD ?? '待补充'} CAD`,
        `汇率更新时间：${snapshot.rateUpdated}；来源：${snapshot.rateSource}`,
        `旺淡季规则：${snapshot.seasonLabel || '待补充'}`,
        `待补充项目：${snapshot.missingItems.length ? snapshot.missingItems.join('、') : '无'}`,
        snapshot.comparable ? `最低成本国家：${snapshot.lowestCountry}` : '当前各国费用项目尚未全部接入，暂时不能比较完整总成本。',
        '本报告仅作为测算参考，金额来自网页当前计算结果快照。'
      ] }
    ],
    styles: {
      title: { fontSize: 18, bold: true, color: '#087f5b', margin: [0, 0, 0, 14] },
      heading: { fontSize: 11, bold: true, color: '#182230', margin: [0, 14, 0, 6] },
      tableHeader: { bold: true, color: '#ffffff', fillColor: '#087f5b', alignment: 'center', margin: [3, 4, 3, 4] },
      countryName: { bold: true, color: '#182230', fillColor: '#f0f8f4', margin: [3, 4, 3, 4] },
      tableCell: { margin: [3, 4, 3, 4] }
    }
  };
}

export function exportPdf(snapshot, { save = true } = {}) {
  const definition = buildPdfDefinition(snapshot);
  const pdf = pdfMake.createPdf(definition);
  if (save && typeof document !== 'undefined') pdf.download(reportFilename(snapshot, 'pdf'));
  return { definition, pdf };
}
