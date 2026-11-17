import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSnapshot } from '../report-data.mjs';
import { buildWorkbook, buildPdfDefinition, exportExcel, reportFilename } from '../report-export.mjs';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';

const snapshot = buildReportSnapshot({
  form: { productName: '测试产品', length: '300', width: '200', height: '50', weight: '800', price: '19.99', feeDate: '2027-02-10' },
  season: '淡季', rateUpdated: '2026-11-16', generatedAt: '2026-11-16T00:00:00.000Z',
  rates: { EUR: 0.92, GBP: 0.79, CAD: 1.38 },
  countries: [{ name: '美国', currency: 'USD', rateKey: 'USD', components: [
    { label: 'FBA费用', display: '$7.23 USD' }, { label: '空运头程', display: '待补充' }, { label: '海运头程', display: '0.50 USD' }, { label: '非FBA尾程', display: '8.54 USD' }
  ] }]
});

test('workbook has required sheets and does not turn pending into zero', () => {
  const workbook = buildWorkbook(snapshot);
  assert.deepEqual(workbook.SheetNames, ['产品参数', '四国费用', '计算说明']);
  const values = XLSX.utils.sheet_to_json(workbook.Sheets['四国费用'], { header: 1 });
  const headers = values[0];
  assert.equal(values[1][headers.indexOf('空运头程 (当地币种/件)')], '');
  assert.equal(headers[14], 'FBA费用 (当地币种/件)');
  assert.equal(headers.length, 18);
  assert.equal(headers.includes('当前可计算费用合计 (当地币种/件)'), false);
  assert.equal(headers.includes('折算USD (USD/件)'), false);
  assert.equal(headers.includes('数据状态'), false);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['产品参数'], { header: 1 })[5][0], '包装长 (mm)');
  assert.match(reportFilename(snapshot, 'xlsx'), /测试产品_跨境费用测算_20261116\.xlsx/);
});

test('country rows convert the USD sale price into each local currency', () => {
  const localizedSnapshot = buildReportSnapshot({
    form: { productName: '测试产品', price: '19.99' },
    rates: { EUR: 0.92 },
    countries: [{ name: '德国', currency: 'EUR', rateKey: 'EUR', components: [] }]
  });
  const values = XLSX.utils.sheet_to_json(buildWorkbook(localizedSnapshot).Sheets['四国费用'], { header: 1 });
  const headers = values[0];
  assert.equal(headers[4], '售价 (当地币种)');
  assert.equal(values[1][4], 19.99 * 0.92);
});

test('unavailable air and non-FBA tail cells export as blank', () => {
  const pendingSnapshot = buildReportSnapshot({
    form: { productName: '测试产品' },
    countries: [{ name: '英国', currency: 'GBP', rateKey: 'GBP', components: [
      { label: '空运头程', display: '待补充' },
      { label: '非FBA尾程', display: '待补充' }
    ] }]
  });
  const workbookValues = XLSX.utils.sheet_to_json(buildWorkbook(pendingSnapshot).Sheets['四国费用'], { header: 1 });
  const headers = workbookValues[0];
  assert.equal(workbookValues[1][headers.indexOf('空运头程 (当地币种/件)')], '');
  assert.equal(workbookValues[1][headers.indexOf('非FBA尾程 (当地币种/件)')], '');
  const definition = buildPdfDefinition(pendingSnapshot);
  const feeTable = definition.content.find(item => item.table?.headerRows === 1)?.table?.body || [];
  assert.equal(feeTable[1][4].text, '');
  assert.equal(feeTable[1][6].text, '');
});

test('excel export applies reference-like colors, units, number formats and freeze pane', () => {
  const files = unzipSync(new Uint8Array(exportExcel(snapshot, { save: false })));
  const styles = strFromU8(files['xl/styles.xml']);
  const fees = strFromU8(files['xl/worksheets/sheet2.xml']);
  assert.match(styles, /<fills count="9">/);
  assert.match(styles, /087F5B/);
  assert.match(styles, /numFmtId="164"/);
  assert.match(fees, /<c r="A1"[^>]*s="4"/);
  assert.match(fees, /<c r="P2"[^>]*s="17"/);
  assert.match(fees, /<c r="Q2"[^>]*s="17"/);
  assert.match(fees, /state="frozen"/);
});

test('pdf definition is A4 portrait with a table and pagination-safe content', () => {
  const definition = buildPdfDefinition(snapshot);
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.pageOrientation, 'portrait');
  assert.ok(definition.content.some(item => item.table));
  const parameterTable = definition.content.find(item => item.table)?.table?.body || [];
  assert.match(String(parameterTable[4]?.[1]), /mm/);
  assert.match(JSON.stringify(definition), /售价 \(当地币种\)/);
  const feeTable = definition.content.find(item => item.table?.headerRows === 1)?.table?.body || [];
  assert.deepEqual(feeTable[0].map(cell => cell.text), ['国家', '币种', '售价 (当地币种)', 'FBA (币/件)', '空运 (币/件)', '海运 (币/件)', '尾程 (币/件)']);
  assert.match(reportFilename(snapshot, 'pdf'), /\.pdf$/);
});
