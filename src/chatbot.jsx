import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AuiIf,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime
} from '@assistant-ui/react';
import { RELAY_ENDPOINT } from '../relay-config.mjs';
import { FIELD_LABELS } from '../product-recognition.mjs';
import { createChatRequest, getStoredChatConfig, looksLikeProductInput, recognizedFieldKeys } from '../chatbot-config.mjs';

const apiConfig = () => getStoredChatConfig(window.localStorage, {
  endpoint: document.querySelector('#apiEndpoint')?.value,
  model: document.querySelector('#apiModel')?.value
});

const chatModel = {
  async run({ messages, abortSignal }) {
    const latestText = [...messages].reverse().find(message => message?.role === 'user')?.content
      ?.filter(part => part?.type === 'text').map(part => part.text).join('\n').trim() || '';
    const image = window.__artCostDeskImageData || '';
    const fileText = window.__artCostDeskFileText || '';
    const fileName = window.__artCostDeskFileName || '';
    if (looksLikeProductInput(latestText, Boolean(image) || Boolean(fileText)) && typeof window.__artCostDeskRecognize === 'function') {
      try {
        const result = await window.__artCostDeskRecognize({ text: latestText, image, fileText, fileName, preserveExisting: true, signal: abortSignal });
        const changed = recognizedFieldKeys(result?.fields);
        if (changed.length) {
          window.__artCostDeskImageData = '';
          window.__artCostDeskFileText = '';
          window.__artCostDeskFileName = '';
          const labels = changed.map(key => FIELD_LABELS[key]).join('、');
          return { content: [{ type: 'text', text: `已根据你的消息更新：${labels}。请检查下方表单，确认无误后再点击“确认参数并计算 FBA”。` }] };
        }
      } catch (error) {
        if (abortSignal.aborted) throw error;
      }
    }
    const config = apiConfig();
    if (!config.apiKey && !window.__artCostDeskManagedRelay) throw new Error('请先在“API 设置”中填写 API Key 并验证连接。');
    const request = createChatRequest({ ...config, relayEndpoint: RELAY_ENDPOINT, messages });
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

function AssistantMessage() {
  return <MessagePrimitive.Root className="assistant-message-row assistant-message-agent"><div className="assistant-bubble"><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
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
