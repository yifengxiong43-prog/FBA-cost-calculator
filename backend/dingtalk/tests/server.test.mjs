import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProduct, createConversationHandler, fallbackRecognize, formatCalculationReply,
  createHttpServer, missingFields, sendDingTalkText, validateDingTalkWebhook, validateProduct
} from '../server.mjs';

test('fallback extraction recognizes Chinese units and delivery date', () => {
  const result = fallbackRecognize('这是一套36色丙烯马克笔，包装尺寸30×20×5cm，重量0.8kg，售价19.99美元，预计2027年2月10日配送。');
  assert.deepEqual(result.values, { productName: '36色丙烯马克笔', length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' });
  assert.deepEqual(missingFields(result.values), []);
});

test('missing fields are reported without guessing', () => {
  const result = fallbackRecognize('包装30×20×5cm，重800g，售价19.99美元');
  assert.deepEqual(missingFields(result.values), ['feeDate']);
});

test('calculation uses the supplied date to select peak and returns four countries', () => {
  const result = calculateProduct({ productName: '测试', length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' });
  assert.equal(result.season.season, '淡季');
  assert.equal(result.countries.US.fba.status, 'ok');
  assert.equal(result.countries.DE.nonFbaTail.total, 9.48);
  assert.equal(result.countries.GB.nonFbaTail, undefined);
  assert.equal(result.countries.CA.nonFbaTail, undefined);
});

test('invalid product values are rejected at the API boundary', () => {
  assert.throws(() => validateProduct({ length: 300, width: 200, height: 50, weight: 0, price: 19.99, feeDate: '2027-02-10' }), /有效/);
  assert.throws(() => validateProduct({ length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-30' }), /有效/);
});

test('conversation handler asks for missing values then calculates after follow-up', async () => {
  const replies = [];
  const handler = createConversationHandler({ send: async (_webhook, text) => replies.push(text), recognize: async text => fallbackRecognize(text) });
  const payload = { conversationId: 'c1', sessionWebhook: 'https://oapi.dingtalk.com/robot/send?x=1', text: { content: '包装30×20×5cm，重800g，售价19.99美元' } };
  const first = await handler(payload);
  assert.equal(first.complete, false);
  assert.match(replies[0], /FBA配送日期/);
  const second = await handler({ ...payload, text: { content: '配送日期2027年2月10日' } });
  assert.equal(second.complete, true);
  assert.match(replies[1], /美国：/);
});

test('only official DingTalk webhook hosts are accepted', () => {
  assert.equal(validateDingTalkWebhook('https://oapi.dingtalk.com/robot/send?x=1').startsWith('https://'), true);
  assert.throws(() => validateDingTalkWebhook('https://evil.example/steal'), /受信任/);
  assert.throws(() => validateDingTalkWebhook('http://oapi.dingtalk.com/robot/send'), /受信任/);
});

test('DingTalk replies use text messages and never expose the webhook in errors', async () => {
  let request;
  await sendDingTalkText('https://api.dingtalk.com/v1.0/robot/send', '测试', async (url, options) => {
    request = { url, options };
    return new Response('{}', { status: 200 });
  });
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { msgtype: 'text', text: { content: '测试' } });
});

test('reply formatting includes season and available tail estimates', () => {
  const result = calculateProduct({ length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' });
  const text = formatCalculationReply(result);
  assert.match(text, /淡季/);
  assert.match(text, /美国：/);
  assert.match(text, /非FBA尾程/);
  assert.match(text, /英国：/);
});

test('HTTP calculation endpoint validates auth and reuses the calculation result', async t => {
  const server = createHttpServer({ config: { calculateApiToken: 'test-token' } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const body = JSON.stringify({ length: 300, width: 200, height: 50, weight: 800, price: 19.99, feeDate: '2027-02-10' });
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/calculate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`http://127.0.0.1:${port}/api/calculate`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' }, body });
  assert.equal(authorized.status, 200);
  const result = await authorized.json();
  assert.equal(result.countries.US.fba.status, 'ok');
});
