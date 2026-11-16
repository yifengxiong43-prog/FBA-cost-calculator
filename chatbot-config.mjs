export const CHAT_SYSTEM_PROMPT = `你是 ART COST DESK 的跨境成本助手。你可以帮助用户整理产品包装参数、解释 FBA 费用结果、指出还缺哪些资料，也可以根据用户在聊天中提供的明确参数更新下方产品表单。
回答要简洁、具体、友好。不要编造费率、汇率或物流价格；没有资料时明确说“待补充”。当前网页参数和费用结果会附在系统消息中，涉及金额时只能引用其中已经显示的真实结果；如果结果是“待计算”或“待补充”，必须明确说明，不能自行估算。`;

export const REQUIRED_FORM_FIELDS = ['length', 'width', 'height', 'weight', 'price', 'feeDate'];

export function looksLikeProductInput(text, hasImage = false) {
  if (hasImage) return true;
  return /(\d{4}年?\s*\d{1,2}月\s*\d{1,2}[日号]?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|kg|千克|g|克|lb|磅|美元|美金|usd|\$)|包装|长宽高|重量|售价|价格|配送|上架|尺寸)/i.test(text || '');
}

export function recognizedFieldKeys(fields = {}) {
  return Object.keys(fields).filter(key => fields[key]?.status === 'recognized');
}

export function buildChatContext({ form = {}, countries = [], rates = {} } = {}) {
  return JSON.stringify({
    form: Object.fromEntries(Object.entries(form).map(([key, value]) => [key, String(value ?? '')])),
    rates: Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : null])),
    countries: countries.map(country => ({
      name: String(country.name || ''),
      currency: String(country.currency || ''),
      total: Number.isFinite(Number(country.total)) ? Number(country.total) : null,
      totalUsd: Number.isFinite(Number(country.totalUsd)) ? Number(country.totalUsd) : null,
      complete: Boolean(country.complete),
      components: Array.isArray(country.components) ? country.components.map(component => ({
        label: String(component.label || ''),
        display: String(component.display || ''),
        amount: Number.isFinite(Number(component.amount)) ? Number(component.amount) : null,
        currency: String(component.currency || country.currency || '')
      })) : []
    }))
  });
}

export function compareCountryCosts(countries = []) {
  return countries
    .filter(country => Number.isFinite(Number(country.totalUsd)))
    .map(country => ({ ...country, totalUsd: Number(country.totalUsd) }))
    .sort((a, b) => a.totalUsd - b.totalUsd);
}

export function answerCostQuestion(text, snapshot = {}) {
  const query = String(text || '');
  if (!/(哪个国家|哪国|最便宜|便宜|更贵|为什么.*(?:贵|高)|费用.*(?:贵|高)|成本.*(?:贵|高))/.test(query)) return '';
  const ranked = compareCountryCosts(snapshot.countries);
  if (!ranked.length) return '右侧还没有可引用的实际计算金额，请先补齐参数并点击“确认计算”。';
  const incomplete = ranked.some(country => !country.complete);
  const note = incomplete ? '当前有项目仍显示“待补充”或“待计算”，以下只比较右侧已经显示的实际金额。' : '';
  const countryNames = ['美国', '德国', '英国', '加拿大'];
  const target = countryNames.find(name => query.includes(name));
  if (target) {
    const selected = ranked.find(country => country.name === target);
    if (!selected) return `${target}目前没有可引用的实际计算金额，请先完成计算。`;
    const cheaper = ranked.filter(country => country.name !== target && country.totalUsd < selected.totalUsd);
    const higher = ranked.filter(country => country.name !== target && country.totalUsd > selected.totalUsd);
    if (/更贵|为什么.*(?:贵|高)|费用.*(?:贵|高)|成本.*(?:贵|高)/.test(query)) {
      const largest = [...(selected.components || [])].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0];
      const reason = largest?.display ? `当前已显示项目中，${largest.label}（${largest.display}）占比最高。` : '目前没有足够的分项金额可以解释差异。';
      return `${target}当前可引用金额折算为 ${selected.totalUsd.toFixed(2)} USD。${reason}${note ? ` ${note}` : ''}`;
    }
    return cheaper.length
      ? `${target}当前不是最低：${cheaper[0].name}更低（按页面已显示金额折算）。${note ? ` ${note}` : ''}`
      : `${target}当前是已显示结果中最低的国家。${higher.length ? ` 其余国家均不低于它。` : ''}${note ? ` ${note}` : ''}`;
  }
  const lowest = ranked[0];
  return `按右侧已显示的实际金额折算，当前最低的是${lowest.name}（${lowest.totalUsd.toFixed(2)} USD）。${note}`.trim();
}

export function missingFormFieldKeys(values = {}) {
  return REQUIRED_FORM_FIELDS.filter(key => {
    if (key === 'feeDate') return !/^\d{4}-\d{2}-\d{2}$/.test(String(values[key] || '').trim());
    const number = Number(values[key]);
    return !Number.isFinite(number) || number <= 0;
  });
}

export function firstMissingFormFieldKey(values = {}) {
  return missingFormFieldKeys(values)[0] || '';
}

export function looksLikeCalculationRequest(text) {
  return /(?:帮我|请|开始|确认|直接)?(?:计算|算一下|算算|算吧).*(?:费用|成本|FBA|运费)?|(?:开始|确认)(?:计算|测算)|按这个算/.test(String(text || ''));
}

export function textFromMessage(message) {
  return (message?.content || [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

export function toChatMessages(messages) {
  return messages
    .filter(message => message?.role === 'user' || message?.role === 'assistant')
    .map(message => ({ role: message.role, content: textFromMessage(message) }))
    .filter(message => message.content);
}

export function getStoredChatConfig(storage, dom = {}) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem('art-cost-desk-api-config') || '{}');
  } catch {
    saved = {};
  }
  const endpoint = String(dom.endpoint || saved.endpoint || '').trim();
  const model = String(dom.model || saved.model || '').trim();
  const apiKey = String(storage?.getItem('art-cost-desk-api-key') || '').trim();
  return { endpoint, model, apiKey };
}

export function createChatRequest({ endpoint, model, apiKey, relayEndpoint, messages, context = '' }) {
  if (!model) throw new Error('请先在“API 设置”中验证并选择模型。');
  if (!apiKey && !relayEndpoint) throw new Error('请先在“API 设置”中填写 API Key。');
  return {
    url: `${String(relayEndpoint || endpoint).replace(/\/$/, '')}/v1/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: {
      model,
      messages: [{ role: 'system', content: context ? `${CHAT_SYSTEM_PROMPT}\n\n当前网页上下文（只读，金额以网页为准）：\n${context}` : CHAT_SYSTEM_PROMPT }, ...toChatMessages(messages)],
      max_tokens: 800,
      temperature: 0.4,
      stream: false
    }
  };
}
