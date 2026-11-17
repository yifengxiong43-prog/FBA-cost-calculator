import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

let reportFontName = 'Roboto';

const money = value => value === null || value === undefined ? '待补充' : Number(value).toFixed(2);
const number = (value, digits = 3) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '待补充'
  : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
const amountWithUnit = (value, currency, suffix = '/件') => value === null || value === undefined
  ? '待补充'
  : `${money(value)} ${currency}${suffix}`;
const localPrice = (snapshot, country) => !Number.isFinite(Number(snapshot.priceUsd)) || !Number.isFinite(Number(country.rate))
  ? '待补充'
  : Number(snapshot.priceUsd) * Number(country.rate);
const exportComponentValue = (values, label, { blankPending = false } = {}) => {
  const item = values[label];
  if (item?.status === '已计算') return item.amount;
  return blankPending ? '' : item?.status || '待补充';
};
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
    '产品名称', '国家', 'FBA配送日期', '季节', '售价 (当地币种)', '包装重量 (g)', '包装重量 (kg)', '包装重量 (lb)',
    '包装长 (mm)', '包装宽 (mm)', '包装高 (mm)', '包装体积 (mm³)', '空运计费重 (g)', '当地币种',
    'FBA费用 (当地币种/件)', '空运头程 (当地币种/件)', '海运头程 (当地币种/件)', '非FBA尾程 (当地币种/件)'
  ]];
  for (const country of snapshot.countries) {
    const values = Object.fromEntries(country.components.map(component => [component.label, component]));
    rows.push([
      snapshot.form.productName || '待补充',
      country.name,
      snapshot.form.feeDate || '待补充',
      snapshot.seasonLabel || '待补充',
      localPrice(snapshot, country),
      snapshot.form.weight === '' ? '待补充' : Number(snapshot.form.weight),
      snapshot.weightKg === null ? '待补充' : snapshot.weightKg,
      snapshot.weightLb === null ? '待补充' : snapshot.weightLb,
      snapshot.form.length === '' ? '待补充' : Number(snapshot.form.length),
      snapshot.form.width === '' ? '待补充' : Number(snapshot.form.width),
      snapshot.form.height === '' ? '待补充' : Number(snapshot.form.height),
      snapshot.volumeMm3 ?? '待补充',
      snapshot.airChargeableWeightG ?? '待补充',
      country.currency,
      exportComponentValue(values, 'FBA费用'),
      exportComponentValue(values, '空运头程', { blankPending: true }),
      exportComponentValue(values, '海运头程'),
      exportComponentValue(values, '非FBA尾程')
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
    { wch: 25 }, { wch: 27 }
  ];
  feesSheet['!rows'] = [{ hpt: 42 }, ...snapshot.countries.map(() => ({ hpt: 30 }))];
  feesSheet['!autofilter'] = { ref: `A1:R${rows.length}` };
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

const EXCEL_STYLE = {
  normal: 0,
  title: 1,
  label: 2,
  value: 3,
  header: 4,
  pending: 5,
  notesLabel: 6,
  notesValue: 7,
  productDimension: 8,
  productInteger: 9,
  productDecimal: 10,
  productUsd: 11,
  productVolume: 12,
  countries: {
    美国: 13,
    德国: 19,
    英国: 25,
    加拿大: 31
  }
};

const countryCurrencyFormat = {
  美国: 164,
  德国: 165,
  英国: 166,
  加拿大: 167
};

function excelStyleXml() {
  const font = ({ bold = false, size = 10, color = 'FF182230' } = {}) =>
    `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="${color}"/><name val="等线"/></font>`;
  const fill = color => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const border = '<border><left style="thin"><color rgb="FFD9E5DF"/></left><right style="thin"><color rgb="FFD9E5DF"/></right><top style="thin"><color rgb="FFD9E5DF"/></top><bottom style="thin"><color rgb="FFD9E5DF"/></bottom><diagonal/></border>';
  const alignment = (horizontal = 'center', wrapText = false) =>
    `<alignment horizontal="${horizontal}" vertical="center"${wrapText ? ' wrapText="1"' : ''}/>`;
  const xf = ({ numFmtId = 0, fontId = 0, fillId = 0, borderId = 0, horizontal = 'center', wrapText = false } = {}) => {
    const apply = [numFmtId ? ' applyNumberFormat="1"' : '', fontId ? ' applyFont="1"' : '', fillId ? ' applyFill="1"' : '', borderId ? ' applyBorder="1"' : ''].join('');
    return `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${apply}>${alignment(horizontal, wrapText)}</xf>`;
  };

  const fonts = [
    font({ size: 11 }),
    font({ bold: true, size: 15, color: 'FFFFFFFF' }),
    font({ bold: true, size: 10 }),
    font({ size: 10 })
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    fill('FF087F5B'),
    fill('FFEAF6F0'),
    fill('FFFEF2CA'),
    fill('FFF9DBDE'),
    fill('FFD3F4F1'),
    fill('FF99CCFF'),
    fill('FFFFF3CD')
  ];
  const xfs = [
    xf(),
    xf({ fontId: 1, fillId: 2, borderId: 1, horizontal: 'left' }),
    xf({ fontId: 2, fillId: 3, borderId: 1, horizontal: 'left' }),
    xf({ fontId: 3, borderId: 1, horizontal: 'left' }),
    xf({ fontId: 1, fillId: 2, borderId: 1, wrapText: true }),
    xf({ fontId: 2, fillId: 8, borderId: 1 }),
    xf({ fontId: 2, fillId: 3, borderId: 1, horizontal: 'left', wrapText: true }),
    xf({ fontId: 3, borderId: 1, horizontal: 'left', wrapText: true }),
    xf({ numFmtId: 2, borderId: 1 }),
    xf({ numFmtId: 3, borderId: 1 }),
    xf({ numFmtId: 4, borderId: 1 }),
    xf({ numFmtId: 168, borderId: 1 }),
    xf({ numFmtId: 3, borderId: 1 }),
  ];

  const countryFills = [4, 5, 6, 7];
  const countryNames = ['美国', '德国', '英国', '加拿大'];
  countryNames.forEach((country, index) => {
    const fillId = countryFills[index];
    const base = EXCEL_STYLE.countries[country];
    xfs.push(
      xf({ fontId: 3, fillId, borderId: 1 }),
      xf({ numFmtId: 3, fillId, borderId: 1 }),
      xf({ numFmtId: 4, fillId, borderId: 1 }),
      xf({ numFmtId: 2, fillId, borderId: 1 }),
      xf({ numFmtId: countryCurrencyFormat[country], fillId, borderId: 1 }),
      xf({ numFmtId: 168, fillId, borderId: 1 })
    );
    if (base !== EXCEL_STYLE.countries[country]) throw new Error(`Excel style index mismatch for ${country}`);
  });

  const numFmts = [
    '<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\-&quot;$&quot;#,##0.00"/>',
    '<numFmt numFmtId="165" formatCode="&quot;€&quot;#,##0.00;[Red]\-&quot;€&quot;#,##0.00"/>',
    '<numFmt numFmtId="166" formatCode="&quot;£&quot;#,##0.00;[Red]\-&quot;£&quot;#,##0.00"/>',
    '<numFmt numFmtId="167" formatCode="&quot;C$&quot;#,##0.00;[Red]\-&quot;C$&quot;#,##0.00"/>',
    '<numFmt numFmtId="168" formatCode="&quot;$&quot;#,##0.00;[Red]\-&quot;$&quot;#,##0.00"/>'
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="5">${numFmts}</numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}

function xmlCellText(cellXml) {
  const match = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  return match ? match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>') : '';
}

function isPendingCell(cellXml) {
  return /待补充|待接入|待计算/.test(xmlCellText(cellXml));
}

function patchCellStyles(xml, sheetNumber, countryCount) {
  const styleCell = (full, column, rowText, attributes, body = '') => {
    const row = Number(rowText);
    const columnNumber = column.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
    const cellContent = `${full}${body}`;
    let style = EXCEL_STYLE.normal;
    if (sheetNumber === 1) {
      if (row === 1) style = EXCEL_STYLE.title;
      else if (columnNumber === 1) style = EXCEL_STYLE.label;
      else if (columnNumber === 2) {
        style = EXCEL_STYLE.value;
        if (isPendingCell(cellContent)) style = EXCEL_STYLE.pending;
        else if (row >= 6 && row <= 8) style = EXCEL_STYLE.productDimension;
        else if (row === 9 || row === 14) style = EXCEL_STYLE.productInteger;
        else if (row === 10 || row === 11) style = EXCEL_STYLE.productDecimal;
        else if (row === 12) style = EXCEL_STYLE.productUsd;
        else if (row === 13) style = EXCEL_STYLE.productVolume;
      }
    } else if (sheetNumber === 2) {
      if (row === 1) style = EXCEL_STYLE.header;
      else if (row >= 2 && row <= countryCount + 1) {
        const base = EXCEL_STYLE.countries[['美国', '德国', '英国', '加拿大'][row - 2]] ?? EXCEL_STYLE.countries.美国;
        if (isPendingCell(cellContent)) style = EXCEL_STYLE.pending;
        else if ([5, 15, 16, 17, 18].includes(columnNumber)) style = base + 4;
        else if ([6, 12, 13].includes(columnNumber)) style = base + 1;
        else if ([7, 8].includes(columnNumber)) style = base + 2;
        else if ([9, 10, 11].includes(columnNumber)) style = base + 3;
        else style = base;
      }
    } else if (sheetNumber === 3) {
      if (row === 1) style = EXCEL_STYLE.title;
      else if (columnNumber === 1) style = EXCEL_STYLE.notesLabel;
      else style = isPendingCell(cellContent) ? EXCEL_STYLE.pending : EXCEL_STYLE.notesValue;
    }
    const cleanAttributes = attributes.replace(/\s+s="[^"]*"/g, '');
    return `<c r="${column}${row}"${cleanAttributes} s="${style}">${body}</c>`;
  };
  let styled = xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g, (full, column, rowText, attributes, body) => styleCell(full, column, rowText, attributes, body));
  styled = styled.replace(/<c r="([A-Z]+)(\d+)"([^>]*)\/>/g, (full, column, rowText, attributes) => {
    const styledCell = styleCell(full, column, rowText, attributes, '');
    return styledCell.replace('</c>', '/>');
  });
  return styled;
}

function patchWorksheetView(xml, frozen = false) {
  if (!frozen) return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0" zoomScale="95"/></sheetViews>');
  return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0" zoomScale="85"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>');
}

function styleExcelWorkbook(data, snapshot) {
  const files = unzipSync(new Uint8Array(data));
  files['xl/styles.xml'] = strToU8(excelStyleXml());
  for (let index = 1; index <= 3; index += 1) {
    const fileName = `xl/worksheets/sheet${index}.xml`;
    if (!files[fileName]) continue;
    let xml = strFromU8(files[fileName]);
    xml = patchCellStyles(xml, index, snapshot.countries.length);
    xml = patchWorksheetView(xml, index === 2);
    files[fileName] = strToU8(xml);
  }
  return zipSync(files, { level: 6 });
}

export function exportExcel(snapshot, { save = true } = {}) {
  const book = buildWorkbook(snapshot);
  const data = styleExcelWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), snapshot);
  if (save && typeof document !== 'undefined') downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFilename(snapshot, 'xlsx'));
  return data;
}

function row(country, snapshot) {
  const values = Object.fromEntries(country.components.map(component => [component.label, component]));
  const component = label => values[label]?.status === '已计算'
    ? amountWithUnit(values[label].amount, country.currency)
    : label === '空运头程' ? '' : (values[label]?.status || '待补充');
  const price = localPrice(snapshot, country);
  return [country.name, country.currency, typeof price === 'number' ? amountWithUnit(price, country.currency, '') : price,
    ...['FBA费用', '空运头程', '海运头程', '非FBA尾程'].map(component)];
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
  const table = [['国家', '币种', '售价 (当地币种)', 'FBA (币/件)', '空运 (币/件)', '海运 (币/件)', '尾程 (币/件)'], ...snapshot.countries.map(country => row(country, snapshot))];
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
      { table: { headerRows: 1, widths: [40, 29, 68, 53, 53, 53, 53], body: tableRows }, layout: 'lightHorizontalLines' },
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
