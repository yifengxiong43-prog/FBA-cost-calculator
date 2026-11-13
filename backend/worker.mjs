// Fixed upstream: this service cannot proxy arbitrary URLs or use a shared API key.
const UPSTREAM = 'https://sub.geekper.com';
const MAX_REQUEST = 15 * 1024 * 1024;
const MAX_RESPONSE = 4 * 1024 * 1024;

async function readLimited(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function handleRequest(request, env = {}, fetchImpl = fetch) {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN || 'https://yifengxiong43-prog.github.io';
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (origin === allowed) headers['Access-Control-Allow-Origin'] = allowed;
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const fail = (code, status) => reply({ error: { code } }, status);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return reply({ status: 'ok', service: 'art-cost-desk-relay' });
  if (origin !== allowed) return fail('ORIGIN_NOT_ALLOWED', 403);
  if (url.search || !['/v1/models', '/v1/chat/completions'].includes(url.pathname)) return fail('NOT_FOUND', 404);
  const method = url.pathname === '/v1/models' ? 'GET' : 'POST';
  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== method || requestedHeaders.some(v => !['authorization', 'content-type', 'accept'].includes(v))) return fail('PREFLIGHT_REJECTED', 403);
    return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': method, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept', 'Access-Control-Max-Age': '600' } });
  }
  if (request.method !== method) return fail('METHOD_NOT_ALLOWED', 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [\x21-\x7e]{1,4096}$/.test(authorization)) return fail('KEY_REQUIRED', 401);
  let body;
  if (method === 'POST') {
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return fail('JSON_REQUIRED', 415);
    if (Number(request.headers.get('Content-Length')) > MAX_REQUEST) return fail('PAYLOAD_TOO_LARGE', 413);
    try {
      body = JSON.parse(await readLimited(request.body, MAX_REQUEST));
      if (!body || typeof body.model !== 'string' || !body.model.trim() || body.model.length > 200 ||
        !Array.isArray(body.messages) || body.messages.length !== 2 || body.stream !== false ||
        body.response_format?.type !== 'json_object' || body.max_tokens !== 3000) return fail('INVALID_REQUEST', 400);
      // Only forward fields used by the product extractor, never client URLs/headers/tools.
      body = JSON.stringify({ model: body.model, messages: body.messages, stream: false,
        response_format: { type: 'json_object' }, max_tokens: 3000 });
    } catch (error) { return fail(error.message === 'too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON', error.message === 'too_large' ? 413 : 400); }
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, method === 'GET' ? 15000 : 55000);
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const upstream = await fetchImpl(`${UPSTREAM}${url.pathname}`, { method, body, signal: controller.signal,
      redirect: 'error', headers: { Authorization: authorization, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) } });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return fail('UPSTREAM_ERROR', upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
    }
    if (upstream.headers.get('Content-Type')?.includes('text/html')) { await upstream.body?.cancel(); return fail('UPSTREAM_NOT_JSON', 502); }
    const data = JSON.parse(await readLimited(upstream.body, MAX_RESPONSE));
    return reply(data);
  } catch {
    return fail(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}

export default { fetch: handleRequest };
