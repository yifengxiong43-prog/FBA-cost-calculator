import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndpoint, normalizeRecognition, recognizeProduct, discoverModels } from '../product-recognition.mjs';

test('discovers actual model IDs from a base or chat URL using authenticated GET', async () => {
  for (const endpoint of ['https://provider.example/custom/v1/', 'https://provider.example/custom/v1/chat/completions']) {
    const models = await discoverModels({ endpoint, apiKey: 'test-key' }, async (url, options) => {
      assert.equal(url, 'https://provider.example/custom/v1/models');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.redirect, 'error');
      return Response.json({ data: [{ id: 'vision-a' }, { id: 'vision-b' }, { id: 'vision-a' }] });
    });
    assert.deepEqual(models, ['vision-a', 'vision-b']);
  }
});

test('model verification explains auth, website HTML, unavailable lists and network errors', async () => {
  const config = { endpoint: 'https://provider.example/v1', apiKey: 'test-key' };
  for (const code of [401, 403, 404, 429, 500]) {
    await assert.rejects(discoverModels(config, async () => new Response('private detail', { status: code })), new RegExp(String(code)));
  }
  await assert.rejects(discoverModels(config, async () => new Response('<html>dashboard</html>', { headers: { 'Content-Type': 'text/html' } })), /管理页面/);
  for (const body of [{ data: [] }, { data: [{ id: 123 }] }, {}]) {
    await assert.rejects(discoverModels(config, async () => Response.json(body)), /模型/);
  }
  await assert.rejects(discoverModels(config, async () => { throw new TypeError('private'); }), /CORS/);
  await assert.rejects(discoverModels({ ...config, apiKey: '' }, async () => assert.fail()), /Key/);
});

const keys = ['productName', 'length', 'width', 'height', 'weight', 'price', 'feeDate'];
function missingFields() {
  return { fields: Object.fromEntries(keys.map(key => [key, { value: null, unit: null, status: 'missing', evidence: '', note: '' }])), notes: [] };
}
const identified = (value, unit, evidence) => ({ value, unit, status: 'recognized', evidence, note: '' });

test('accepts a base URL or full compatible chat endpoint without leaking credentials into the URL', () => {
  assert.equal(normalizeEndpoint('https://provider.example/v1/'), 'https://provider.example/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://provider.example/v1/chat/completions'), 'https://provider.example/v1/chat/completions');
  assert.equal(normalizeEndpoint('http://127.0.0.1:4175/v1'), 'http://127.0.0.1:4175/v1/chat/completions');
  for (const url of ['http://provider.example/v1', 'https://key@provider.example/v1', 'https://provider.example/v1?key=private', 'javascript:alert(1)']) {
    assert.throws(() => normalizeEndpoint(url));
  }
});

test('the user table maps dimension and gram columns but does not choose between retail and transaction prices', () => {
  const raw = missingFields();
  raw.fields.length = identified(260, 'mm', '长(mm) 260');
  raw.fields.width = identified(190, 'mm', '宽(mm) 190');
  raw.fields.height = identified(100, 'mm', '高(mm) 100');
  raw.fields.weight = identified(1640, 'g', '重量(g) 1640');
  raw.fields.price = { value: null, unit: 'USD', status: 'uncertain', evidence: '零售价 $62.99；成交价 $52.99', note: '请选择零售价或成交价，并确认 $ 的币种。' };
  const result = normalizeRecognition(raw);
  assert.deepEqual([result.values.length, result.values.width, result.values.height, result.values.weight], ['260', '190', '100', '1640']);
  assert.equal(result.values.price, '');
  assert.equal(result.fields.price.status, 'uncertain');
  assert.equal(result.values.feeDate, '');
});

test('natural language identifies name and price, defaulting unitless dimensions to mm and weight to g', () => {
  const raw = missingFields();
  raw.fields.productName = identified('96色滚珠笔', null, '96色滚珠笔');
  raw.fields.price = identified(62.99, 'USD', '卖62.99美元');
  raw.fields.length = identified(260, null, '长260');
  raw.fields.width = identified(190, null, '宽190');
  raw.fields.height = identified(100, null, '高100');
  raw.fields.weight = identified(1640, null, '重1640');
  const result = normalizeRecognition(raw);
  assert.equal(result.values.productName, '96色滚珠笔');
  assert.equal(result.values.price, '62.99');
  assert.deepEqual([result.values.length, result.values.width, result.values.height, result.values.weight], ['260', '190', '100', '1640']);
});

test('converts source units deterministically and keeps valid dates', () => {
  const raw = missingFields();
  raw.fields.length = identified(30, 'cm', '30cm');
  raw.fields.width = identified(2, 'in', '2 inches');
  raw.fields.height = identified(0.05, 'm', '0.05m');
  raw.fields.weight = identified(0.8, 'kg', '0.8kg');
  raw.fields.feeDate = identified('2027-02-10', null, '2027年2月10日配送');
  const result = normalizeRecognition(raw);
  assert.deepEqual([result.values.length, result.values.width, result.values.height, result.values.weight], ['300', '50.8', '50', '800']);
  assert.equal(result.values.feeDate, '2027-02-10');
});

test('invalid values, unsupported currency, absent evidence and ambiguous values cannot enter the form', () => {
  const raw = missingFields();
  raw.fields.length = identified(-1, 'mm', '长-1mm');
  raw.fields.width = identified(200, 'mm', '');
  raw.fields.height = { ...identified(30, 'mm', '30mm或40mm'), status: 'uncertain' };
  raw.fields.weight = identified('800', 'g', '800g');
  raw.fields.price = identified(99, 'CNY', '99元');
  raw.fields.feeDate = identified('2027-02-30', null, '2027-02-30');
  const result = normalizeRecognition(raw);
  for (const key of keys) assert.equal(result.values[key], '');
  assert.throws(() => normalizeRecognition({ fields: {} }), /格式/);
});

test('sends raw image plus user text to the chosen endpoint, never putting the API key into the model prompt', async () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  const config = { endpoint: 'https://provider.example/v1', model: 'vision-model', apiKey: 'test-only-not-a-real-key' };
  let sent;
  const fetchImpl = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(missingFields()) } }] }));
  };
  await recognizeProduct({ ...config, text: '按成交价，币种 USD', image }, fetchImpl);
  assert.equal(sent.url, 'https://provider.example/v1/chat/completions');
  assert.equal(sent.options.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(sent.options.credentials, 'omit');
  assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.body.response_format.type, 'json_object');
  assert.deepEqual(sent.body.messages[1].content[1], { type: 'image_url', image_url: { url: image } });
  assert.equal(JSON.stringify(sent.body).includes(config.apiKey), false);
});

test('API errors, refusals, truncated JSON, and network failures report a clear error without echoing provider content', async () => {
  const config = { endpoint: 'https://provider.example/v1', model: 'vision-model', apiKey: 'test-key', text: 'test' };
  for (const status of [401, 429, 400, 500]) {
    await assert.rejects(recognizeProduct(config, async () => new Response('private upstream detail', { status })), error => !error.message.includes('private') && error.message.includes(String(status)));
  }
  await assert.rejects(recognizeProduct(config, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }))), /完整/);
  await assert.rejects(recognizeProduct(config, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { refusal: 'refused' } }] }))), /拒绝/);
  await assert.rejects(recognizeProduct(config, async () => { throw new TypeError('Failed to fetch'); }), /CORS/);
});

test('does not call an API for empty input, invalid images or missing API configuration', async () => {
  const fetchImpl = async () => assert.fail('invalid input must not make a network request');
  const config = { endpoint: 'https://provider.example/v1', model: 'vision-model', apiKey: 'test-key' };
  await assert.rejects(recognizeProduct(config, fetchImpl));
  await assert.rejects(recognizeProduct({ ...config, text: 'test', apiKey: '' }, fetchImpl));
  await assert.rejects(recognizeProduct({ ...config, image: 'https://untrusted.example/photo.png' }, fetchImpl));
});

test('cancels an in-flight request without returning a replacement product', async () => {
  const controller = new AbortController();
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    controller.abort();
  });
  await assert.rejects(recognizeProduct({ endpoint: 'https://provider.example/v1', model: 'vision', apiKey: 'test-key', text: 'test', signal: controller.signal }, fetchImpl), /已取消/);
});
