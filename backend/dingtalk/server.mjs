import http from 'node:http';
import fs from 'node:fs';
import { URL, pathToFileURL } from 'node:url';
import { calculateCanadaFba, calculateUsFba, getUsFeeSeason } from '../../fba-calculator.mjs';
import { calculateSeaFreight } from '../../sea-freight.mjs';
import { calculateGermanyNonFba, calculateUsNonFba } from '../../non-fba.mjs';
import { recognizeProduct } from '../../product-recognition.mjs';
import { DWClient } from 'dingtalk-stream-sdk-nodejs';

export const REQUIRED_FIELDS = ['length', 'width', 'height', 'weight', 'price', 'feeDate'];
export const FIELD_LABELS = {
  productName: '产品名称', length: '包装长', width: '包装宽', height: '包装高',
  weight: '包装重量', price: '售价（USD）', feeDate: 'FBA配送日期'
};

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_STATE_TTL_MS = 30 * 60 * 1000;
const DINGTALK_WEBHOOK_HOSTS = new Set(['oapi.dingtalk.com', 'api.dingtalk.com', 'api-dd.dingtalk.com']);

function finitePositive(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0;
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateProduct(input) {
  if (!input || typeof input !== 'object') throw new TypeError('请求必须是 JSON 对象。');
  const values = {
    productName: typeof input.productName === 'string' ? input.productName.trim().slice(0, 60) : '',
    length: Number(input.length), width: Number(input.width), height: Number(input.height),
    weight: Number(input.weight), price: Number(input.price), feeDate: input.feeDate
  };
  if (!REQUIRED_FIELDS.every(field => field !== 'feeDate' ? finitePositive(values[field]) : validIsoDate(values[field]))) {
    throw new TypeError('请提供有效的包装长、宽、高（mm）、重量（g）、售价（USD）和 FBA 配送日期（YYYY-MM-DD）。');
  }
  return values;
}

function safeCalculate(fn) {
  try { return fn(); } catch (error) { return { status: 'error', total: null, reason: error.message }; }
}

export function calculateProduct(input) {
  const product = validateProduct(input);
  const dimensionsMm = [product.length, product.width, product.height];
  const season = getUsFeeSeason(product.feeDate);
  const usFba = safeCalculate(() => calculateUsFba({ dimensionsMm, weightG: product.weight, priceUsd: product.price, date: product.feeDate }));
  const canadaFba = safeCalculate(() => calculateCanadaFba({ dimensionsMm, weightG: product.weight, date: product.feeDate }));
  const sea = Object.fromEntries(['US', 'DE', 'GB', 'CA'].map(country => [country,
    safeCalculate(() => calculateSeaFreight({ country, date: product.feeDate, dimensionsMm }))]));
  const usTail = safeCalculate(() => calculateUsNonFba({ weightG: product.weight, dimensionsMm }));
  const deTail = safeCalculate(() => calculateGermanyNonFba({ billedWeightG: product.weight }));
  return {
    product,
    season,
    countries: {
      US: { fba: usFba, air: { status: 'missing_rate', total: null, reason: '空运头程费率待补充。' }, sea: sea.US, nonFbaTail: usTail },
      DE: { fba: { status: 'missing_rate', total: null, reason: '德国 FBA 费率待补充。' }, air: { status: 'missing_rate', total: null, reason: '空运头程费率待补充。' }, sea: sea.DE, nonFbaTail: deTail },
      GB: { fba: { status: 'missing_rate', total: null, reason: '英国 FBA 费率待补充。' }, air: { status: 'missing_rate', total: null, reason: '空运头程费率待补充。' }, sea: sea.GB },
      CA: { fba: canadaFba, air: { status: 'missing_rate', total: null, reason: '空运头程费率待补充。' }, sea: sea.CA }
    }
  };
}

function parseDateText(text) {
  const match = text.match(/(?<!\d)(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|号)?(?!\d)/);
  if (!match) return '';
  const value = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return validIsoDate(value) ? value : '';
}

function parseNumber(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

export function fallbackRecognize(text) {
  const result = { values: {}, fields: {}, notes: [] };
  const dimensions = text.match(/(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)(?:\s*(mm|cm|m|in))?/i);
  if (dimensions) {
    const factor = { mm: 1, cm: 10, m: 1000, in: 25.4 }[(dimensions[4] || 'mm').toLowerCase()] || 1;
    ['length', 'width', 'height'].forEach((key, index) => { result.values[key] = Math.round(Number(dimensions[index + 1]) * factor * 100) / 100; result.fields[key] = { status: 'recognized', evidence: dimensions[0] }; });
  }
  const namedDimensions = [
    ['length', /(?:长|length)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in)?/i],
    ['width', /(?:宽|width)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in)?/i],
    ['height', /(?:高|height)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in)?/i]
  ];
  for (const [key, pattern] of namedDimensions) {
    if (result.values[key] !== undefined) continue;
    const match = text.match(pattern);
    if (match) { const factor = { mm: 1, cm: 10, m: 1000, in: 25.4 }[(match[2] || 'mm').toLowerCase()] || 1; result.values[key] = Math.round(Number(match[1]) * factor * 100) / 100; result.fields[key] = { status: 'recognized', evidence: match[0] }; }
  }
  const weight = text.match(/(?:重量|重|weight)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(kg|g|克|千克|lb|磅|oz|盎司)?/i) || text.match(/(\d+(?:\.\d+)?)\s*(kg|g|克|千克|lb|磅|oz|盎司)\b/i);
  if (weight) {
    const unit = (weight[2] || 'g').toLowerCase();
    const factor = { g: 1, 克: 1, kg: 1000, 千克: 1000, lb: 453.59237, 磅: 453.59237, oz: 28.349523125, 盎司: 28.349523125 }[unit] || 1;
    result.values.weight = Math.round(Number(weight[1]) * factor * 100) / 100; result.fields.weight = { status: 'recognized', evidence: weight[0] };
  }
  const price = text.match(/(?:售价|价格|零售价|price)\s*[:：=]?\s*[$￥¥]?\s*(\d+(?:\.\d+)?)\s*(美元|美金|USD|\$)?/i) || text.match(/\$(\d+(?:\.\d+)?)/);
  if (price) { result.values.price = Number(price[1]); result.fields.price = { status: 'recognized', evidence: price[0] }; }
  const date = parseDateText(text);
  if (date) { result.values.feeDate = date; result.fields.feeDate = { status: 'recognized', evidence: date }; }
  const name = text.match(/(?:这是|产品(?:名称)?[:：])\s*([^，,。；;\n]+)/);
  if (name) {
    const productName = name[1].trim().replace(/^(?:一套|一组|一个|一种)\s*/, '');
    result.values.productName = productName.slice(0, 60);
    result.fields.productName = { status: 'recognized', evidence: name[0] };
  }
  for (const key of ['productName', ...REQUIRED_FIELDS]) {
    if (result.values[key] === undefined) result.fields[key] = { status: 'missing', evidence: '' };
  }
  return result;
}

function mergeRecognized(previous, extracted) {
  const merged = { ...(previous || {}) };
  for (const key of Object.keys(extracted.values || {})) {
    const value = extracted.values[key];
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  }
  return merged;
}

export function missingFields(fields) {
  return REQUIRED_FIELDS.filter(field => !finitePositive(fields[field]) && (field !== 'feeDate' || !validIsoDate(fields[field])));
}

function formatMoney(item) {
  if (!item || item.status !== 'ok' || !Number.isFinite(item.total)) return '待补充';
  return `${item.total.toFixed(2)} ${item.currency || 'USD'}`;
}

export function formatCalculationReply(result) {
  const { product, season, countries } = result;
  const lines = [
    `已识别：${product.productName || '未提供产品名称'}`,
    `包装：${product.length}×${product.width}×${product.height} mm；重量：${product.weight} g；售价：${product.price.toFixed(2)} USD`,
    `FBA配送日期：${product.feeDate}（${season?.season || '未知季节'}）`,
    '', '四国费用（空运费率待补充）：'
  ];
  const row = (name, data, includeTail = true) => {
    const parts = [`${name}：FBA ${formatMoney(data.fba)}`, `海运 ${formatMoney(data.sea)}`];
    if (data.air) parts.splice(1, 0, `空运 ${formatMoney(data.air)}`);
    if (includeTail && data.nonFbaTail) parts.push(`非FBA尾程 ${formatMoney(data.nonFbaTail)}`);
    return parts.join('；');
  };
  lines.push(row('美国', countries.US));
  lines.push(row('德国', countries.DE));
  lines.push(row('英国', countries.GB, false));
  lines.push(row('加拿大', countries.CA, false));
  lines.push('', '如需重新计算，直接发送新的参数即可。');
  return lines.join('\n').slice(0, MAX_MESSAGE_LENGTH);
}

export function getMessageContent(payload) {
  const text = payload?.text;
  if (typeof text === 'string') return text.trim();
  if (text && typeof text.content === 'string') return text.content.trim();
  return '';
}

export function parseSdkPayload(data) {
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  if (typeof data !== 'string') return data && typeof data === 'object' ? data : null;
  try { return JSON.parse(data); } catch { return null; }
}

export function validateDingTalkWebhook(webhook) {
  let url;
  try { url = new URL(String(webhook)); } catch { throw new Error('钉钉回复地址无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !DINGTALK_WEBHOOK_HOSTS.has(url.hostname)) throw new Error('钉钉回复地址不是受信任的官方地址。');
  return url.href;
}

export async function sendDingTalkText(webhook, content, fetchImpl = fetch) {
  const url = validateDingTalkWebhook(webhook);
  if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error('钉钉回复内容为空或过长。');
  const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content } }) });
  if (!response.ok) throw new Error(`钉钉回复失败（HTTP ${response.status}）。`);
  return response;
}

function cleanExpired(state, ttl) {
  const now = Date.now();
  for (const [key, value] of state) if (now - value.updatedAt > ttl) state.delete(key);
}

export function createConversationHandler({ state = new Map(), config = {}, send = sendDingTalkText, recognize = recognizeIncoming, calculate = calculateProduct } = {}) {
  const ttl = Number(config.stateTtlMs) || DEFAULT_STATE_TTL_MS;
  return async payload => {
    cleanExpired(state, ttl);
    const text = getMessageContent(payload);
    const conversationId = String(payload?.conversationId || payload?.senderStaffId || '').trim();
    if (!conversationId || !text) return { handled: false };
    const current = state.get(conversationId)?.fields || {};
    const extracted = await recognize(text, config);
    const fields = mergeRecognized(current, extracted);
    state.set(conversationId, { fields, updatedAt: Date.now() });
    const missing = missingFields(fields);
    if (missing.length) {
      const missingText = missing.map(field => FIELD_LABELS[field]).join('、');
      const reply = `还缺少：${missingText}。请继续补充，例如：配送日期2027年2月10日，重量800g。`;
      await send(payload?.sessionWebhook, reply);
      return { handled: true, complete: false, fields, missing, reply };
    }
    const result = calculate(fields);
    const reply = formatCalculationReply(result);
    await send(payload?.sessionWebhook, reply);
    return { handled: true, complete: true, fields, result, reply };
  };
}

export async function recognizeIncoming(text, config = {}) {
  if (config.providerEndpoint && config.providerModel && config.providerApiKey) {
    try {
      const result = await recognizeProduct({ endpoint: config.providerEndpoint, model: config.providerModel, apiKey: config.providerApiKey, text });
      return result;
    } catch (error) {
      const fallback = fallbackRecognize(text);
      fallback.notes.push(`模型识别暂不可用，已使用基础文字识别：${error.message}`);
      return fallback;
    }
  }
  return fallbackRecognize(text);
}

function readRequestBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    request.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('PAYLOAD_TOO_LARGE')); request.destroy(); return; } chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function jsonResponse(response, body, status = 200) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(text);
}

export function createHttpServer({ config = {}, calculate = calculateProduct } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') return jsonResponse(response, { status: 'ok', service: 'art-cost-desk-dingtalk' });
      if (request.method === 'POST' && url.pathname === '/api/calculate') {
        const expected = config.calculateApiToken?.trim();
        if (expected && request.headers.authorization !== `Bearer ${expected}`) return jsonResponse(response, { error: { code: 'UNAUTHORIZED' } }, 401);
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return jsonResponse(response, { error: { code: 'JSON_REQUIRED' } }, 415);
        const body = JSON.parse(await readRequestBody(request));
        return jsonResponse(response, calculate(body));
      }
      return jsonResponse(response, { error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : error instanceof TypeError || error instanceof SyntaxError ? 400 : 500;
      return jsonResponse(response, { error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', message: error.message } }, status);
    }
  });
}

export function startDingTalk(config = {}) {
  if (!config.dingTalkClientId || !config.dingTalkClientSecret) throw new Error('缺少 DINGTALK_CLIENT_ID 或 DINGTALK_CLIENT_SECRET。');
  const client = new DWClient({ clientId: config.dingTalkClientId, clientSecret: config.dingTalkClientSecret });
  const handle = createConversationHandler({ config });
  client.registerCallbackListener('/v1.0/im/bot/messages/get', async response => {
    try { await handle(parseSdkPayload(response.data)); } catch (error) { console.error(`DingTalk message handling failed: ${error.message}`); }
  });
  void client.connect().catch(error => console.error(`DingTalk Stream connection failed: ${error.message}`));
  return client;
}

function envConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 8788,
    calculateApiToken: env.CALCULATE_API_TOKEN || '',
    dingTalkClientId: env.DINGTALK_CLIENT_ID || '',
    dingTalkClientSecret: env.DINGTALK_CLIENT_SECRET || '',
    providerEndpoint: env.PROVIDER_API_ENDPOINT || '',
    providerApiKey: env.PROVIDER_API_KEY || '',
    providerModel: env.PROVIDER_MODEL || 'gpt-5.5',
    stateTtlMs: Number(env.STATE_TTL_MS) || DEFAULT_STATE_TTL_MS
  };
}

function loadDotEnv() {
  try {
    const content = fs.readFileSync(new URL('.env', import.meta.url), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotEnv();
  const config = envConfig();
  const server = createHttpServer({ config });
  server.listen(config.port, () => console.log(`Cost API listening on http://127.0.0.1:${config.port}`));
  if (config.dingTalkClientId && config.dingTalkClientSecret) startDingTalk(config);
  else console.log('DingTalk Stream disabled: set DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET to enable it.');
}
