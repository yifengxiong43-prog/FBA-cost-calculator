import test from 'node:test';
import assert from 'node:assert/strict';
import { FILE_MAX_BYTES, readProductFile, truncateFileText } from '../file-reader.mjs';

test('reads TXT and CSV files as normalized product text', async () => {
  const file = new File(['产品名称,重量(g)\r\n马克笔,800'], 'params.csv', { type: 'text/csv' });
  const result = await readProductFile(file);
  assert.equal(result.fileName, 'params.csv');
  assert.equal(result.kind, 'text');
  assert.match(result.text, /产品名称,重量\(g\)\n马克笔,800/);
});

test('uses a parser adapter for PDF, Word and Excel files', async () => {
  const file = new File(['binary'], 'params.pdf', { type: 'application/pdf' });
  const result = await readProductFile(file, { pdf: async input => `读取了 ${input.name}` });
  assert.equal(result.text, '读取了 params.pdf');
});

test('rejects unsupported and oversized files before parsing', async () => {
  await assert.rejects(readProductFile(new File(['x'], 'params.zip', { type: 'application/zip' })), /不支持/);
  const oversized = { name: 'large.txt', size: FILE_MAX_BYTES + 1, type: 'text/plain', text: async () => 'x' };
  await assert.rejects(readProductFile(oversized), /10 MB/);
});

test('truncates long extracted text with a visible marker', () => {
  const result = truncateFileText('x'.repeat(20), 10);
  assert.match(result, /文件内容已截断/);
  assert.ok(result.length > 10);
});
