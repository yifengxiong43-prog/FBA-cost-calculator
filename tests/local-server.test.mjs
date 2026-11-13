import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = 4300 + Math.floor(Math.random() * 500);
const child = spawn(process.execPath, ['local-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

await once(child.stdout, 'data');

test.after(() => child.kill());

test('serves the local page as HTML instead of serializing file buffers', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /ART COST DESK/);
});

test('forwards authenticated model checks to the upstream service', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/proxy/v1/models`, {
    headers: { Authorization: 'Bearer test-key' }
  });
  const body = await response.text();

  assert.equal(response.status, 401);
  assert.match(body, /Invalid API key/i);
});

test('serves the sea freight calculator module to the browser', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/sea-freight.mjs?v=20261113-sea`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  assert.match(await response.text(), /export function calculateSeaFreight/);
});
