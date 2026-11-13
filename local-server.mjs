import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4177);
const upstream = 'https://sub.geekper.com';
const managedKey = process.env.PROVIDER_API_KEY?.trim();
const managedModel = process.env.PROVIDER_MODEL?.trim() || '';
const maxBody = 15 * 1024 * 1024;
const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/product-recognition.mjs', ['product-recognition.mjs', 'text/javascript; charset=utf-8']],
  ['/recognition-ui.mjs', ['recognition-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/file-reader.mjs', ['file-reader.mjs', 'text/javascript; charset=utf-8']],
  ['/file-reader.bundle.js', ['file-reader.bundle.js', 'text/javascript; charset=utf-8']],
  ['/relay-config.mjs', ['relay-config.mjs', 'text/javascript; charset=utf-8']],
  ['/fba-calculator.mjs', ['fba-calculator.mjs', 'text/javascript; charset=utf-8']],
  ['/sea-freight.mjs', ['sea-freight.mjs', 'text/javascript; charset=utf-8']],
  ['/non-fba.mjs', ['non-fba.mjs', 'text/javascript; charset=utf-8']],
  ['/chatbot.bundle.js', ['chatbot.bundle.js', 'text/javascript; charset=utf-8']],
  ['/ohuhu-marker.svg', ['ohuhu-marker.svg', 'image/svg+xml']]
]);

function send(res, status, body, headers = {}) {
  const data = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Length': data.length, 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > maxBody) reject(new Error('too_large')); else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function proxy(req, res, pathname) {
  if (pathname === '/proxy/config' && req.method === 'GET') {
    return send(res, 200, { managed: Boolean(managedKey), model: managedModel }, { 'Content-Type': 'application/json' });
  }
  const route = pathname === '/proxy/v1/models' ? 'models' : pathname === '/proxy/v1/chat/completions' ? 'chat/completions' : null;
  if (!route || req.method !== (route === 'models' ? 'GET' : 'POST')) return send(res, 404, { error: { code: 'NOT_FOUND' } }, { 'Content-Type': 'application/json' });
  const authorization = managedKey ? `Bearer ${managedKey}` : req.headers.authorization || '';
  if (!/^Bearer [\x21-\x7e]{1,4096}$/.test(authorization)) return send(res, 401, { error: { code: 'KEY_REQUIRED' } }, { 'Content-Type': 'application/json' });
  let body;
  if (route !== 'models') {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(res, 415, { error: { code: 'JSON_REQUIRED' } }, { 'Content-Type': 'application/json' });
    try { body = await readBody(req); JSON.parse(body); } catch (error) { return send(res, error.message === 'too_large' ? 413 : 400, { error: { code: error.message === 'too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON' } }, { 'Content-Type': 'application/json' }); }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), route === 'models' ? 20000 : 60000);
  try {
    const response = await fetch(`${upstream}/v1/${route}`, { method: req.method, signal: controller.signal,
      headers: { Authorization: authorization, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body });
    const text = await response.text();
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
    res.end(text);
  } catch (error) {
    send(res, controller.signal.aborted ? 504 : 502, { error: { code: controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE' } }, { 'Content-Type': 'application/json' });
  } finally { clearTimeout(timer); }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${host}:${port}`).pathname;
  if (pathname.startsWith('/proxy/')) return proxy(req, res, pathname);
  const file = allowedFiles.get(pathname);
  if (!file || req.method !== 'GET') return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  try { send(res, 200, await fs.readFile(path.join(root, file[0])), { 'Content-Type': file[1] }); }
  catch { send(res, 500, 'Server error', { 'Content-Type': 'text/plain; charset=utf-8' }); }
});

server.listen(port, host, () => console.log(`Art Cost Desk: http://${host}:${port}/`));
