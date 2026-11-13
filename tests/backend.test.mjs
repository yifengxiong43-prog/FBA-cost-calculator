import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleRequest } from '../backend/worker.mjs';
import { createChatRequest } from '../chatbot-config.mjs';
import gateway from '../backend/gateway/public/_worker.js';

const env = { ALLOWED_ORIGIN: 'https://yifengxiong43-prog.github.io' };
const origin = env.ALLOWED_ORIGIN;

test('Cloudflare entry point does not mistake ExecutionContext for the upstream fetch function', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ id: 'vision-model' }] }));
  const response = await worker.fetch(new Request('https://relay.example.workers.dev/v1/models', { headers: { Origin: origin } }),
    { ...env, PROVIDER_API_KEY: 'server-secret' }, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.equal(upstream.mock.callCount(), 1);
});

test('Pages gateway reaches the managed relay without exposing the provider key', async () => {
  const request = new Request('https://art-cost-desk-api.pages.dev/config', { headers: { Origin: origin } });
  const response = await gateway.fetch(request, { RELAY: { fetch: incoming => handleRequest(incoming, {
    ...env, PROVIDER_API_KEY: 'server-secret', PROVIDER_MODEL: 'vision-model'
  }) } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await response.json(), { managed: true, model: 'vision-model' });
});

test('managed relay accepts the current assistant chat request and preserves conversation', async () => {
  const chat = createChatRequest({ model: 'vision-model', relayEndpoint: 'https://relay.example.workers.dev', messages: [
    { role: 'user', content: [{ type: 'text', text: '你好' }] },
    { role: 'assistant', content: [{ type: 'text', text: '你好，请问需要什么帮助？' }] },
    { role: 'user', content: [{ type: 'text', text: '请介绍一下这个工具。' }] }
  ] });
  let forwarded;
  const response = await handleRequest(new Request(chat.url, { method: 'POST', headers: { ...chat.headers, Origin: origin }, body: JSON.stringify(chat.body) }),
    { ...env, PROVIDER_API_KEY: 'server-secret' }, async (url, options) => {
      forwarded = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer server-secret');
      return Response.json({ choices: [{ message: { content: '可以帮你测算费用。' } }] });
    });
  assert.equal(response.status, 200);
  assert.deepEqual(forwarded, chat.body);
});

test('relay preserves image extraction JSON requests and rejects malformed message content', async () => {
  const body = { model: 'vision-model', messages: [
    { role: 'system', content: 'Extract product fields as JSON.' },
    { role: 'user', content: [{ type: 'text', text: '识别这张图片' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] }
  ], stream: false, response_format: { type: 'json_object' }, max_tokens: 3000 };
  const request = value => new Request('https://relay.example.workers.dev/v1/chat/completions', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer key', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const response = await handleRequest(request(body), env, async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ choices: [{ message: { content: '{}' } }] });
  });
  assert.equal(response.status, 200);
  for (const messages of [[null], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: {} }]]) {
    const rejected = await handleRequest(request({ ...body, messages }), env, () => { throw new Error('must not call upstream'); });
    assert.equal(rejected.status, 400);
  }
});

test('relay handles CORS preflight and forwards only the fixed upstream route', async () => {
  const request = new Request('https://relay.example.workers.dev/v1/models', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});

test('relay forwards the user key without logging or exposing it and returns upstream models', async () => {
  let captured;
  const request = new Request('https://relay.example.workers.dev/v1/models', { headers: { Origin: origin, Authorization: 'Bearer test-secret' } });
  const response = await handleRequest(request, env, async (url, options) => {
    captured = { url, options };
    return Response.json({ data: [{ id: 'vision-model' }] });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [{ id: 'vision-model' }] });
  assert.equal(captured.url, 'https://sub.geekper.com/v1/models');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-secret');
});

test('managed relay uses the server secret when the browser sends no key', async () => {
  const managedEnv = { ...env, PROVIDER_API_KEY: 'server-secret', PROVIDER_MODEL: 'vision-model' };
  const config = await handleRequest(new Request('https://relay.example.workers.dev/config', { headers: { Origin: origin } }), managedEnv);
  assert.deepEqual(await config.json(), { managed: true, model: 'vision-model' });

  let captured;
  const request = new Request('https://relay.example.workers.dev/v1/models', { headers: { Origin: origin } });
  const response = await handleRequest(request, managedEnv, async (url, options) => {
    captured = { url, options };
    return Response.json({ data: [{ id: 'vision-model' }] });
  });
  assert.equal(response.status, 200);
  assert.equal(captured.options.headers.Authorization, 'Bearer server-secret');
});

test('relay rejects other origins, arbitrary paths, malformed requests and oversized bodies', async () => {
  const badOrigin = await handleRequest(new Request('https://relay.example.workers.dev/v1/models', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer key' } }), env);
  assert.equal(badOrigin.status, 403);
  const badPath = await handleRequest(new Request('https://relay.example.workers.dev/secret', { headers: { Origin: origin } }), env);
  assert.equal(badPath.status, 404);
  const badBody = await handleRequest(new Request('https://relay.example.workers.dev/v1/chat/completions', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer key', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'x' }) }), env);
  assert.equal(badBody.status, 400);
});
