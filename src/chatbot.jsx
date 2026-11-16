import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AuiIf,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime
} from '@assistant-ui/react';
import { RELAY_ENDPOINT } from '../relay-config.mjs';
import { answerCostQuestion, buildChatContext, createChatRequest, getStoredChatConfig, looksLikeCalculationRequest, looksLikeProductInput, missingFormFieldKeys, recognizedFieldKeys } from '../chatbot-config.mjs';

const apiConfig = () => getStoredChatConfig(window.localStorage, {
  endpoint: document.querySelector('#apiEndpoint')?.value,
  model: document.querySelector('#apiModel')?.value
});

const missingLabels = { length: '包装长', width: '包装宽', height: '包装高', weight: '包装重量', price: '售价', feeDate: 'FBA配送日期' };

function currentFormValues() {
  return Object.fromEntries(['productName', 'length', 'width', 'height', 'weight', 'price', 'feeDate'].map(key => [key, document.querySelector(`#${key}`)?.value || '']));
}

function missingReply(missing) {
  return missing.length
    ? `还缺少${missingLabels[missing[0]]}，请先补充这一项。`
    : '参数已完整识别，请在确认卡中核对后点击“确认计算”。';
}

const countryResultFields = {
  美国: { currency: 'USD', rateKey: 'USD', fields: [['FBA 费用', 'usFbaValue'], ['空运头程', null], ['海运头程', 'usSeaValue'], ['非 FBA 尾程', 'usTailValue']] },
  德国: { currency: 'EUR', rateKey: 'EUR', fields: [['FBA 费用', 'deFbaValue'], ['空运头程', null], ['海运头程', 'deSeaValue'], ['非 FBA 尾程', 'deTailValue']] },
  英国: { currency: 'GBP', rateKey: 'GBP', fields: [['FBA 费用', 'gbFbaValue'], ['空运头程', null], ['海运头程', 'gbSeaValue']] },
  加拿大: { currency: 'CAD', rateKey: 'CAD', fields: [['FBA 费用', 'caFbaValue'], ['空运头程', null], ['海运头程', 'caSeaValue']] }
};

function displayedAmount(id) {
  if (!id) return { display: '待补充', amount: null };
  const element = document.querySelector(`#${id}`);
  const display = element?.textContent?.trim() || '';
  if (!display || /待计算|待补充|—/.test(display)) return { display, amount: null };
  const match = display.replace(/,/g, '').match(/(?:<\s*)?(\d+(?:\.\d+)?)/);
  return { display, amount: match ? Number(match[1]) : null };
}

function readPageSnapshot() {
  const rateValue = id => {
    const value = Number(document.querySelector(`#${id}`)?.textContent);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const rates = { USD: 1, EUR: rateValue('fxEUR'), GBP: rateValue('fxGBP'), CAD: rateValue('fxCAD') };
  const countries = Object.entries(countryResultFields).map(([name, definition]) => {
    const components = definition.fields.map(([label, id]) => {
      const result = displayedAmount(id);
      return { label, display: result.display, amount: result.amount, currency: definition.currency };
    });
    const complete = components.every(component => Number.isFinite(component.amount));
    const numericComponents = components.filter(component => Number.isFinite(component.amount));
    const total = numericComponents.length ? numericComponents.reduce((sum, component) => sum + component.amount, 0) : null;
    const rate = rates[definition.rateKey];
    return {
      name, currency: definition.currency, total, totalUsd: total !== null && rate ? total / rate : null,
      complete, components
    };
  });
  return { form: currentFormValues(), rates, countries };
}

function formSummaryReply(values) {
  const labels = { productName: '产品名称', length: '包装长', width: '包装宽', height: '包装高', weight: '包装重量', price: '售价', feeDate: 'FBA配送日期' };
  const missing = missingFormFieldKeys(values);
  const entries = Object.entries(labels).map(([key, label]) => `${label}：${values[key] || '待补充'}`);
  return `${entries.join('；')}。${missing.length ? `还缺少：${missing.map(key => labels[key]).join('、')}。` : '必填参数已完整。'}`;
}

const CONFIRM_PREFIX = '__ART_COST_CONFIRM__';

function confirmationMessage(changed) {
  const values = currentFormValues();
  return `${CONFIRM_PREFIX}${JSON.stringify({
    values,
    changed,
    missing: missingFormFieldKeys(values)
  })}`;
}

function parseConfirmation(text) {
  if (!text.startsWith(CONFIRM_PREFIX)) return null;
  try { return JSON.parse(text.slice(CONFIRM_PREFIX.length)); } catch { return null; }
}

const chatModel = {
  async run({ messages, abortSignal }) {
    const latestText = [...messages].reverse().find(message => message?.role === 'user')?.content
      ?.filter(part => part?.type === 'text').map(part => part.text).join('\n').trim() || '';
    const image = window.__artCostDeskImageData || '';
    const fileText = window.__artCostDeskFileText || '';
    const fileName = window.__artCostDeskFileName || '';
    const missingBefore = missingFormFieldKeys(currentFormValues());
    const snapshot = readPageSnapshot();
    if (/还缺(?:少)?什么|缺什么|需要补充|补充什么/.test(latestText)) {
      return { content: [{ type: 'text', text: missingReply(missingBefore) }] };
    }
    if (/当前(?:表单|参数)|现在(?:的)?参数|目前填写/.test(latestText)) {
      return { content: [{ type: 'text', text: formSummaryReply(snapshot.form) }] };
    }
    const localCostAnswer = answerCostQuestion(latestText, snapshot);
    if (localCostAnswer) return { content: [{ type: 'text', text: localCostAnswer }] };
    if (looksLikeCalculationRequest(latestText)) {
      if (missingBefore.length) return { content: [{ type: 'text', text: missingReply(missingBefore) }] };
      if (typeof window.__artCostDeskCalculate === 'function') {
        window.__artCostDeskCalculate();
        return { content: [{ type: 'text', text: '参数已完整，已开始计算。请查看右侧四国费用结果。' }] };
      }
      return { content: [{ type: 'text', text: '参数已完整，请点击下方“确认参数并计算费用”。' }] };
    }
    if (looksLikeProductInput(latestText, Boolean(image) || Boolean(fileText)) && typeof window.__artCostDeskRecognize === 'function') {
      try {
        const result = await window.__artCostDeskRecognize({ text: latestText, image, fileText, fileName, preserveExisting: true, signal: abortSignal });
        const changed = recognizedFieldKeys(result?.fields);
        if (changed.length) {
          window.__artCostDeskImageData = '';
          window.__artCostDeskFileText = '';
          window.__artCostDeskFileName = '';
          return { content: [{ type: 'text', text: confirmationMessage(changed) }] };
        }
      } catch (error) {
        if (abortSignal.aborted) throw error;
      }
    }
    const config = apiConfig();
    if (!config.apiKey && !window.__artCostDeskManagedRelay) throw new Error('请先在“API 设置”中填写 API Key 并验证连接。');
    const request = createChatRequest({ ...config, relayEndpoint: RELAY_ENDPOINT, messages, context: buildChatContext(snapshot) });
    const response = await fetch(request.url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: abortSignal,
      headers: request.headers,
      body: JSON.stringify(request.body)
    });
    if (!response.ok) {
      const reasons = { 401: 'API Key 无效或已过期。', 403: '密钥没有访问权限。', 404: '接口地址或模型名称不正确。', 429: '请求过于频繁或额度不足。' };
      throw new Error(`聊天请求失败（${response.status}）：${reasons[response.status] || '服务暂时不可用。'}`);
    }
    const body = await response.json();
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回文字回答，请检查模型配置。');
    return { content: [{ type: 'text', text }] };
  }
};

function UserMessage() {
  return <MessagePrimitive.Root className="assistant-message-row assistant-message-user"><div className="assistant-bubble"><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

function ConfirmationCard({ data }) {
  const [state, setState] = useState('pending');
  const labels = { productName: '产品名称', length: '包装长 (mm)', width: '包装宽 (mm)', height: '包装高 (mm)', weight: '包装重量 (g)', price: '售价 (USD)', feeDate: 'FBA配送日期' };
  const missingLabels = { length: '包装长', width: '包装宽', height: '包装高', weight: '包装重量', price: '售价', feeDate: 'FBA配送日期' };
  const confirm = () => {
    if (data.missing?.length) return;
    window.__artCostDeskCalculate?.();
    setState('confirmed');
  };
  const continueEditing = () => document.querySelector('.assistant-input')?.focus();
  return <div className="assistant-confirm-card" style={{ width: '100%', padding: 8, border: '1px solid #cbd7e4', borderRadius: 8, background: '#fff' }}>
    <strong style={{ display: 'block', marginBottom: 5 }}>请确认识别结果</strong>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3px 10px', fontSize: 11 }}>
      {Object.entries(labels).map(([key, label]) => <span key={key} style={{ color: data.values?.[key] ? '#334155' : '#a16207' }}>{label}：{data.values?.[key] || '待补充'}</span>)}
    </div>
    {data.missing?.length ? <p style={{ margin: '6px 0 0', color: '#a16207', fontSize: 10 }}>还缺少：{data.missing.map(key => missingLabels[key]).join('、')}</p> : null}
    <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
      <button type="button" onClick={confirm} disabled={Boolean(data.missing?.length) || state === 'confirmed'} style={{ minHeight: 26, padding: '0 9px', border: 0, borderRadius: 6, background: data.missing?.length ? '#cbd5e1' : '#237a58', color: '#fff', fontSize: 10, cursor: data.missing?.length ? 'not-allowed' : 'pointer' }}>{state === 'confirmed' ? '已开始计算' : '确认计算'}</button>
      <button type="button" onClick={continueEditing} style={{ minHeight: 26, padding: '0 9px', border: '1px solid #cbd7e4', borderRadius: 6, background: '#fff', color: '#334155', fontSize: 10, cursor: 'pointer' }}>继续修改</button>
    </div>
  </div>;
}

function AssistantMessage() {
  const text = useAuiState(state => state.message.content
    ?.filter(part => part?.type === 'text')
    .map(part => part.text)
    .join('') || '');
  const confirmation = parseConfirmation(text);
  return <MessagePrimitive.Root className="assistant-message-row assistant-message-agent"><div className="assistant-bubble">{confirmation ? <ConfirmationCard data={confirmation} /> : <MessagePrimitive.Parts />}</div></MessagePrimitive.Root>;
}

function ChatThread() {
  const runtime = useLocalRuntime(chatModel, { maxSteps: 1 });
  const attachmentTray = useRef(null);
  useLayoutEffect(() => {
    const tray = attachmentTray.current;
    for (const id of ['imagePreview', 'filePreview', 'smartStatus']) {
      const node = document.getElementById(id);
      if (node) tray.appendChild(node);
    }
  }, []);
  const triggerUpload = id => document.querySelector(`#${id}`)?.click();
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="assistant-thread">
      <ThreadPrimitive.Viewport className="assistant-viewport">
        <AuiIf condition={state => state.thread.isEmpty}>
          <div className="assistant-welcome"><strong>一个入口处理识别和问答</strong><span>直接输入产品参数，或询问费用怎么计算、还缺哪些资料</span></div>
        </AuiIf>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <ThreadPrimitive.ViewportFooter className="assistant-footer">
          <ComposerPrimitive.Root className="assistant-composer">
            <div className="assistant-attachment-tray" ref={attachmentTray} />
            <ComposerPrimitive.Input rows={1} placeholder="例如：这个产品还缺哪些信息？" className="assistant-input" />
            <button className="assistant-attachment" type="button" aria-label="选择图片" title="选择图片" onClick={() => triggerUpload('uploadImageBtn')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4.5 3 3 2-2L19 17" /></svg>
            </button>
            <button className="assistant-attachment" type="button" aria-label="选择文件" title="选择文件" onClick={() => triggerUpload('uploadFileBtn')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
            </button>
            <ComposerPrimitive.Send className="assistant-send" aria-label="发送消息">发送</ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}

class ChatErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <p className="assistant-error">聊天组件加载失败，请刷新页面或检查本地依赖。</p>;
    return this.props.children;
  }
}

const root = document.querySelector('#assistantChatRoot');
if (root) createRoot(root).render(<ChatErrorBoundary><ChatThread /></ChatErrorBoundary>);
