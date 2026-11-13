import { FIELD_LABELS, normalizeEndpoint, recognizeProduct, discoverModels } from './product-recognition.mjs?v=20261113-date';
import { RELAY_ENDPOINT, RELAY_CONFIG_ENDPOINT } from './relay-config.mjs';
import { readProductFile } from './file-reader.mjs';

export function initRecognition(form, onRecognized) {
  const $ = id => document.getElementById(id);
  const status = $('smartStatus');
  const feedback = {};
  let imageData = '', imageReading = false, fileText = '', fileName = '', fileReading = false, controller = null, states = null, managedRelay = false;
  window.__artCostDeskManagedRelay = false;
  let imageVersion = 0;
  for (const key of Object.keys(FIELD_LABELS)) {
    const note = document.createElement('small');
    note.id = `${key}Feedback`;
    note.className = 'field-feedback';
    note.hidden = true;
    $(key).closest('.field').querySelector('label').append(note);
    $(key).setAttribute('aria-describedby', note.id);
    feedback[key] = note;
  }

  function updateSummary() {
    if (!states) return;
    const counts = { recognized: 0, missing: 0, uncertain: 0, edited: 0 };
    for (const key of Object.keys(FIELD_LABELS)) counts[states[key]]++;
    $('recognitionSummary').hidden = false;
    $('recognitionSummary').textContent = `已识别 ${counts.recognized} 项 · 未提供 ${counts.missing} 项 · 待确认 ${counts.uncertain} 项${counts.edited ? ` · 手动填写 ${counts.edited} 项` : ''}`;
  }

  function setBusy(busy, verifying = false) {
    const ids = ['smartText', 'smartImage', 'smartFile', 'uploadImageBtn', 'uploadFileBtn', 'assistantUploadBtn', 'assistantFileUploadBtn', 'removeImageBtn', 'removeFileBtn', 'apiEndpoint', 'apiModel', 'apiKey', 'clearApiKeyBtn', 'verifyApiBtn'];
    for (const id of ids) {
      const element = $(id);
      if (element) element.disabled = busy;
    }
    for (const input of form.querySelectorAll('input, button')) input.disabled = busy;
    $('recognizeBtn').disabled = busy || imageReading || fileReading;
    $('recognizeBtn').textContent = busy && !verifying ? '识别中…' : '智能识别';
    $('verifyApiBtn').textContent = verifying ? '正在验证…' : '验证连接并获取模型';
    $('cancelRecognitionBtn').textContent = verifying ? '取消验证' : '取消识别';
    $('cancelRecognitionBtn').hidden = !busy;
    $('smartText').setAttribute('aria-busy', String(busy));
  }

  function resetImage() {
    imageVersion++;
    imageData = '';
    imageReading = false;
    $('sourceImage').removeAttribute('src');
    $('smartImage').value = '';
    $('imagePreview').hidden = true;
    $('recognizeBtn').disabled = Boolean(controller) || fileReading;
    window.__artCostDeskImageData = '';
  }

  function resetFile() {
    fileText = '';
    fileName = '';
    fileReading = false;
    $('smartFile').value = '';
    $('filePreview').hidden = true;
    $('sourceFileName').textContent = '';
    window.__artCostDeskFileText = '';
    window.__artCostDeskFileName = '';
  }

  async function selectImage(file) {
    if (!file || controller) return;
    resetImage();
    const version = imageVersion;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = '请使用 10 MB 以内的 PNG、JPG 或 WebP 图片。';
      return;
    }
    imageReading = true;
    $('recognizeBtn').disabled = true;
    status.textContent = '正在读取图片…';
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsDataURL(file);
      });
      const decoded = new Image();
      decoded.src = data;
      await decoded.decode();
      if (version !== imageVersion) return;
      imageData = data;
      window.__artCostDeskImageData = data;
      $('sourceImage').src = data;
      $('sourceImageName').textContent = file.name || '粘贴的截图';
      $('imagePreview').hidden = false;
      status.textContent = '图片已添加，可补充识别要求';
    } catch {
      if (version === imageVersion) status.textContent = '图片无法读取，请更换一张清晰的截图。';
    } finally {
      if (version === imageVersion) {
        imageReading = false;
        $('recognizeBtn').disabled = fileReading;
      }
    }
  }

  async function selectFile(file) {
    if (!file || controller) return;
    resetFile();
    fileReading = true;
    $('recognizeBtn').disabled = true;
    status.textContent = '正在读取文件…';
    try {
      const result = await readProductFile(file);
      fileText = result.text;
      fileName = result.fileName;
      window.__artCostDeskFileText = fileText;
      window.__artCostDeskFileName = fileName;
      $('sourceFileName').textContent = `${fileName} · 已读取 ${result.characters.toLocaleString()} 字`;
      $('filePreview').hidden = false;
      status.textContent = '文件已就绪，可与文字和图片一起识别。';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      fileReading = false;
      $('recognizeBtn').disabled = Boolean(controller) || imageReading;
    }
  }

  $('uploadImageBtn').addEventListener('click', () => $('smartImage').click());
  $('smartImage').addEventListener('change', event => selectImage(event.target.files?.[0]));
  $('uploadFileBtn').addEventListener('click', () => $('smartFile').click());
  $('smartFile').addEventListener('change', event => selectFile(event.target.files?.[0]));
  // The chat header is rendered by React after this module initializes; delegate these clicks from the document.
  document.addEventListener('click', event => {
    if (event.target.closest('#assistantUploadBtn')) $('uploadImageBtn').click();
    if (event.target.closest('#assistantFileUploadBtn')) $('uploadFileBtn').click();
  });
  $('smartText').addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.files || []);
    const image = files.find(file => file.type.startsWith('image/'));
    const attachment = files.find(file => !file.type.startsWith('image/'));
    if (image || attachment) {
      event.preventDefault();
      if (image) selectImage(image);
      if (attachment) selectFile(attachment);
    }
  });
  $('removeImageBtn').addEventListener('click', () => { resetImage(); status.textContent = '已移除图片。'; });
  $('removeFileBtn').addEventListener('click', () => { resetFile(); status.textContent = '已移除文件。'; });
  $('cancelRecognitionBtn').addEventListener('click', () => controller?.abort());

  const storageKey = 'art-cost-desk-api-config';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (typeof saved?.endpoint === 'string') $('apiEndpoint').value = saved.endpoint;
    if (typeof saved?.model === 'string') $('apiModel').value = saved.model;
  } catch { /* Keep the defaults if storage is unavailable or damaged. */ }
  let storedApiKey = '';
  try { storedApiKey = localStorage.getItem('art-cost-desk-api-key') || ''; } catch { /* Key remains empty. */ }
  if (storedApiKey) $('apiKey').value = storedApiKey;
  function saveConfig() {
    try {
      // Explicit allowlist: never persist the API key.
      localStorage.setItem(storageKey, JSON.stringify({ endpoint: $('apiEndpoint').value.trim(), model: $('apiModel').value.trim(), relayEndpoint: RELAY_ENDPOINT }));
      $('apiStorageStatus').textContent = '地址和模型已保存在当前浏览器；密钥仅本次使用。接口需允许跨域访问。';
    } catch {
      $('apiStorageStatus').textContent = '浏览器禁止保存设置，刷新后需重新填写；密钥仅本次使用。';
    }
  }
  function updateConfigStatus(clearModels = false) {
    if (managedRelay) {
      $('apiConfigStatus').textContent = '服务器已配置';
      $('apiVerificationStatus').textContent = '';
      if (clearModels) $('apiModelOptions').replaceChildren();
      return;
    }
    $('apiConfigStatus').textContent = $('apiKey').value.trim() ? '待验证连接' : '请填入 Key 后验证';
    $('apiVerificationStatus').textContent = '';
    if (clearModels) $('apiModelOptions').replaceChildren();
  }
  for (const id of ['apiEndpoint', 'apiModel', 'apiKey']) $(id).addEventListener('input', () => {
    updateConfigStatus(id !== 'apiModel');
    if (id !== 'apiKey') saveConfig();
    else { try { localStorage.setItem('art-cost-desk-api-key', $('apiKey').value); } catch { /* Continue for this page. */ } }
  });
  $('clearApiKeyBtn').addEventListener('click', () => { $('apiKey').value = ''; try { localStorage.removeItem('art-cost-desk-api-key'); } catch { /* Continue for this page. */ } updateConfigStatus(true); });
  updateConfigStatus();
  saveConfig();

  const relayReady = (async () => {
    try {
      const response = await fetch(RELAY_CONFIG_ENDPOINT, { credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const config = await response.json();
      if (config?.managed !== true) return;
      let managedModel = typeof config.model === 'string' ? config.model.trim() : '';
      if (!managedModel && $('apiModel').value.trim()) managedModel = $('apiModel').value.trim();
      if (!managedModel) {
        const models = await discoverModels({ endpoint: $('apiEndpoint').value, relayEndpoint: RELAY_ENDPOINT, apiKey: '', managedRelay: true });
        managedModel = models[0] || '';
      }
      if (!managedModel) return;
      managedRelay = true;
      window.__artCostDeskManagedRelay = true;
      $('apiModel').value = managedModel;
      $('apiSettings').hidden = true;
      $('managedApiStatus').hidden = false;
      $('apiConfigStatus').textContent = '服务器已配置';
      $('apiStorageStatus').textContent = 'API Key 仅保存在服务器，不会发送到浏览器。';
    } catch {
      // Fall back to the manual provider settings when the managed relay is unavailable.
    }
  })();

  $('verifyApiBtn').addEventListener('click', async () => {
    if (controller || imageReading) return;
    controller = new AbortController();
    setBusy(true, true);
    $('apiVerificationStatus').textContent = '正在验证地址和密钥，获取可用模型…';
    $('apiModelOptions').replaceChildren();
    try {
      const models = await discoverModels({ endpoint: $('apiEndpoint').value, relayEndpoint: RELAY_ENDPOINT, apiKey: $('apiKey').value, managedRelay, signal: controller.signal });
      if (controller.signal.aborted) return;
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model;
        $('apiModelOptions').append(option);
      }
      if (!models.includes($('apiModel').value)) $('apiModel').value = models[0];
      saveConfig();
      $('apiConfigStatus').textContent = `连接成功 · ${models.length} 个模型`;
      $('apiVerificationStatus').textContent = `已获取 ${models.length} 个模型，当前选择 ${$('apiModel').value}。可点击模型框改选；图片理解和 JSON 输出能力需通过实际识别确认。`;
    } catch (error) {
      $('apiConfigStatus').textContent = '验证未通过';
      $('apiVerificationStatus').textContent = error.message;
    } finally {
      controller = null;
      setBusy(false);
    }
  });

  async function runRecognition({ text = $('smartText').value, image = imageData, fileText: providedFileText = fileText, fileName: providedFileName = fileName, preserveExisting = false, signal } = {}) {
    if (controller || imageReading || fileReading) return;
    await relayReady;
    const config = { endpoint: $('apiEndpoint').value.trim(), relayEndpoint: RELAY_ENDPOINT, model: $('apiModel').value.trim(), apiKey: managedRelay ? '' : $('apiKey').value.trim(), managedRelay };
    try {
      normalizeEndpoint(config.endpoint);
      if (!config.model || (!managedRelay && !config.apiKey)) throw new Error('请先填写 API Key 和支持图片理解的模型名称。');
    } catch (error) {
      $('apiSettings').open = true;
      const dialog = $('apiDialog');
      if (dialog && !dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      status.textContent = error.message;
      return;
    }
    if (!text.trim() && !image && !providedFileText.trim()) throw new Error('请先输入产品描述、选择图片或选择文件。');
    controller = new AbortController();
    signal?.addEventListener('abort', () => controller?.abort(), { once: true });
    setBusy(true);
    status.textContent = '正在理解产品参数，请稍候…';
    try {
      const result = await recognizeProduct({ ...config, text, image, fileText: providedFileText, fileName: providedFileName, signal: controller.signal });
      if (controller.signal.aborted) return;
      states = {};
      for (const key of Object.keys(FIELD_LABELS)) {
        const field = result.fields[key];
        // Full recognition clears absent fields; assistant edits preserve existing values.
        if (!preserveExisting || field.status === 'recognized') $(key).value = result.values[key];
        states[key] = field.status;
        feedback[key].hidden = false;
        feedback[key].dataset.state = field.status;
        feedback[key].textContent = field.status === 'recognized' ? '已识别'
          : field.status === 'missing' ? '未提供'
            : `待确认：${field.note || field.evidence || '请根据原始材料手动填写。'}`;
        const container = $(key).closest('.field');
        (field.status === 'uncertain' ? container : container.querySelector('label')).append(feedback[key]);
        feedback[key].title = field.evidence;
      }
      $('recognitionNotes').replaceChildren();
      for (const note of result.notes) {
        const item = document.createElement('li');
        item.textContent = note;
        $('recognitionNotes').append(item);
      }
      $('recognitionNotes').hidden = result.notes.length === 0;
      updateSummary();
      $('apiConfigStatus').textContent = '连接成功';
      $('apiSettings').open = true;
      status.textContent = '已填入下方参数，请检查并补齐缺项，确认后再计算。';
      onRecognized();
      return result;
    } catch (error) {
      if (signal?.aborted) throw new Error('已取消识别。');
      status.textContent = error.message;
      throw error;
    } finally {
      config.apiKey = '';
      controller = null;
      setBusy(false);
    }
  }

  $('recognizeBtn').addEventListener('click', async () => {
    try {
      await runRecognition();
    } catch {
      // The inline status contains the actionable error.
    }
  });

  window.__artCostDeskRecognize = options => runRecognition(options);

  form.addEventListener('input', event => {
    const key = event.target.id;
    if (!states || !feedback[key]) return;
    states[key] = event.target.value.trim() ? 'edited' : 'missing';
    feedback[key].dataset.state = states[key];
    feedback[key].textContent = states[key] === 'edited' ? '手动填写' : '未填写';
    $(key).closest('.field').querySelector('label').append(feedback[key]);
    feedback[key].title = '';
    updateSummary();
  });
  form.addEventListener('reset', () => {
    states = null;
    for (const note of Object.values(feedback)) note.hidden = true;
    $('recognitionSummary').hidden = true;
    $('recognitionNotes').hidden = true;
    status.textContent = '';
  });
  // The user opted in to browser persistence. The key stays local to this browser and is never sent to our code repository.
  window.addEventListener('pagehide', () => { controller?.abort(); });
}
