import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../backend/worker.mjs';

const env = { ALLOWED_ORIGIN: 'https://yifengxiong43-prog.github.io' };
const origin = env.ALLOWED_ORIGIN;

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

test('relay rejects other origins, arbitrary paths, malformed requests and oversized bodies', async () => {
  const badOrigin = await handleRequest(new Request('https://relay.example.workers.dev/v1/models', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer key' } }), env);
  assert.equal(badOrigin.status, 403);
  const badPath = await handleRequest(new Request('https://relay.example.workers.dev/secret', { headers: { Origin: origin } }), env);
  assert.equal(badPath.status, 404);
  const badBody = await handleRequest(new Request('https://relay.example.workers.dev/v1/chat/completions', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer key', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'x' }) }), env);
  assert.equal(badBody.status, 400);
});
