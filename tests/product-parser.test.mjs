import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductDetails } from '../product-parser.mjs';

test('parses a complete Chinese product description and converts units', () => {
  const result = parseProductDetails('这是一套36色丙烯马克笔，包装尺寸为30×20×5cm，重量0.8kg，售价19.99美元，空运和海运都需要计算，预计2027年2月10日配送。');
  assert.deepEqual(result.values, {
    productName: '36色丙烯马克笔',
    length: '300', width: '200', height: '50', weight: '800', price: '19.99',
    shippingMode: 'both', feeDate: '2027-02-10'
  });
  assert.deepEqual(result.uncertain, []);
  assert.deepEqual(result.missing, []);
});

test('parses mixed units and English labels', () => {
  const result = parseProductDetails('Product: marker set; package size 300 mm x 20 cm x 50 mm; gross weight 1.2 lb; price $24.50; air only; delivery 2027-02-10');
  assert.equal(result.values.productName, 'marker set');
  assert.deepEqual([result.values.length, result.values.width, result.values.height], ['300', '200', '50']);
  assert.equal(result.values.weight, '544.31');
  assert.equal(result.values.price, '24.50');
  assert.equal(result.values.shippingMode, 'air');
  assert.equal(result.values.feeDate, '2027-02-10');
});

test('does not guess dimensions without units or incomplete dimensions', () => {
  const noUnit = parseProductDetails('包装尺寸30×20×5，重量500g，售价10美元');
  assert.deepEqual([noUnit.values.length, noUnit.values.width, noUnit.values.height], ['', '', '']);
  assert.ok(noUnit.uncertain.some(item => item.includes('尺寸') && item.includes('单位')));

  const partial = parseProductDetails('包装尺寸30×20cm');
  assert.deepEqual([partial.values.length, partial.values.width, partial.values.height], ['', '', '']);
  assert.ok(partial.uncertain.some(item => item.includes('三边')));
});

test('does not map a non-USD or currency-free price into the USD field', () => {
  for (const text of ['售价99元', '售价19.99']) {
    const result = parseProductDetails(text);
    assert.equal(result.values.price, '');
    assert.ok(result.uncertain.some(item => item.includes('售价')));
  }
});

test('lists fields that are absent without inventing values', () => {
  const result = parseProductDetails('丙烯马克笔，重量800g');
  assert.equal(result.values.weight, '800');
  assert.equal(result.values.price, '');
  assert.equal(result.values.feeDate, '');
  assert.ok(result.missing.some(label => label.startsWith('售价')));
  assert.ok(result.missing.includes('FBA配送日期'));
});
