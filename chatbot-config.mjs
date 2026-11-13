export const CHAT_SYSTEM_PROMPT = `你是 ART COST DESK 的跨境成本助手。你可以帮助用户整理产品包装参数、解释 FBA 费用结果、指出还缺哪些资料，也可以根据用户在聊天中提供的明确参数更新下方产品表单。
回答要简洁、具体、友好。不要编造费率、汇率或物流价格；没有资料时明确说“待补充”。当系统提示“已更新表单”时，告诉用户改了哪些字段，并提醒先核对再点击“确认参数并计算 FBA”。`;

export function looksLikeProductInput(text, hasImage = false) {
  if (hasImage) return true;
  return /(\d{4}年?\s*\d{1,2}月\s*\d{1,2}日?|\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|kg|千克|g|克|lb|磅|美元|美金|usd|\$)|包装|长宽高|重量|售价|价格|配送|上架|尺寸)/i.test(text || '');
}

export function recognizedFieldKeys(fields = {}) {
  return Object.keys(fields).filter(key => fields[key]?.status === 'recognized');
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

export function createChatRequest({ endpoint, model, apiKey, relayEndpoint, messages }) {
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
      messages: [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...toChatMessages(messages)],
      max_tokens: 800,
      temperature: 0.4,
      stream: false
    }
  };
}
