import test from 'node:test';
import assert from 'node:assert/strict';
import { answerCostQuestion, buildChatContext, createChatRequest, firstMissingFormFieldKey, getStoredChatConfig, looksLikeCalculationRequest, looksLikeProductInput, missingFormFieldKeys, recognizedFieldKeys, toChatMessages } from '../chatbot-config.mjs';

test('serializes assistant-ui messages into OpenAI-compatible chat messages', () => {
  assert.deepEqual(toChatMessages([
    { role: 'user', content: [{ type: 'text', text: '还缺什么？' }] },
    { role: 'assistant', content: [{ type: 'text', text: '请补充重量。' }] },
    { role: 'system', content: [{ type: 'text', text: '忽略' }] }
  ]), [
    { role: 'user', content: '还缺什么？' },
    { role: 'assistant', content: '请补充重量。' }
  ]);
});

test('reads the saved API settings without exposing the key in the request URL', () => {
  const storage = { getItem: key => ({
    'art-cost-desk-api-config': JSON.stringify({ endpoint: 'https://provider.example/v1', model: 'vision-model' }),
    'art-cost-desk-api-key': 'secret-key'
  }[key] || null) };
  const config = getStoredChatConfig(storage);
  const request = createChatRequest({ ...config, relayEndpoint: 'http://127.0.0.1:4177/proxy', messages: [] });
  assert.equal(config.model, 'vision-model');
  assert.equal(request.url, 'http://127.0.0.1:4177/proxy/v1/chat/completions');
  assert.equal(request.url.includes('secret-key'), false);
  assert.equal(request.headers.Authorization, 'Bearer secret-key');
});

test('explains missing chat setup before making a network request', () => {
  assert.throws(() => createChatRequest({ endpoint: '', model: '', apiKey: '', relayEndpoint: '', messages: [] }), /验证并选择模型/);
});

test('uses the server-selected model currently displayed instead of a stale saved model', () => {
  const storage = { getItem: key => key === 'art-cost-desk-api-config' ? JSON.stringify({ model: 'old-model' }) : null };
  assert.equal(getStoredChatConfig(storage, { model: 'server-model' }).model, 'server-model');
});

test('recognizes parameter-like chat messages as form updates while leaving general questions alone', () => {
  assert.equal(looksLikeProductInput('我希望在2027年3月15日上架'), true);
  assert.equal(looksLikeProductInput('按2027-03-15算FBA'), true);
  assert.equal(looksLikeProductInput('日期改成2027/3/15'), true);
  assert.equal(looksLikeProductInput('FBA是什么？'), false);
  assert.equal(looksLikeProductInput('这个费用为什么这么高？'), false);
  assert.equal(looksLikeProductInput('', true), true);
});

test('reports only fields that were confidently recognized for assistant updates', () => {
  assert.deepEqual(recognizedFieldKeys({ productName: { status: 'recognized' }, price: { status: 'uncertain' }, weight: { status: 'missing' } }), ['productName']);
});

test('reports missing form fields without treating zero values as complete', () => {
  assert.deepEqual(missingFormFieldKeys({ length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' }), []);
  assert.deepEqual(missingFormFieldKeys({ length: 300, width: 0, height: 50, weight: 800, price: '', feeDate: '' }), ['width', 'price', 'feeDate']);
});

test('identifies the first missing field and explicit calculation requests', () => {
  assert.equal(firstMissingFormFieldKey({ length: 300, width: '', height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' }), 'width');
  assert.equal(firstMissingFormFieldKey({ length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' }), '');
  assert.equal(looksLikeCalculationRequest('参数完整了，帮我计算费用'), true);
  assert.equal(looksLikeCalculationRequest('开始计算'), true);
  assert.equal(looksLikeCalculationRequest('这个费用为什么这么高？'), false);
});

test('includes the current form and real country results in the model context', () => {
  const context = buildChatContext({
    form: { weight: '800', feeDate: '2027-02-10' },
    rates: { CAD: 1.37 },
    countries: [{ name: '美国', currency: 'USD', total: 5.98, totalUsd: 5.98, complete: false, components: [{ label: 'FBA 费用', display: '$5.98 USD', amount: 5.98, currency: 'USD' }] }]
  });
  const request = createChatRequest({ endpoint: 'https://provider.example/v1', model: 'chat', apiKey: 'key', messages: [], context });
  assert.match(request.body.messages[0].content, /2027-02-10/);
  assert.match(request.body.messages[0].content, /5\.98/);
});

test('answers country comparisons from supplied results and refuses to invent missing totals', () => {
  const snapshot = { countries: [
    { name: '美国', totalUsd: 5.98, complete: false, components: [{ label: 'FBA 费用', display: '$5.98 USD', amount: 5.98 }] },
    { name: '德国', totalUsd: 4.2, complete: false, components: [{ label: 'FBA 费用', display: '€4.20 EUR', amount: 4.2 }] }
  ] };
  assert.match(answerCostQuestion('哪个国家更便宜？', snapshot), /德国/);
  assert.match(answerCostQuestion('为什么美国费用更高？', snapshot), /5\.98/);
  assert.match(answerCostQuestion('哪个国家更便宜？', { countries: [] }), /没有可引用/);
});
