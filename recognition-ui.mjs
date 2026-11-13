import { FIELD_LABELS, normalizeEndpoint, recognizeProduct, discoverModels } from './product-recognition.mjs';
import { RELAY_ENDPOINT } from './relay-config.mjs';

export function initRecognition(form, onRecognized) {
  const $ = id => document.getElementById(id);
  const status = $('smartStatus');
  const feedback = {};
  let imageData = '', imageReading = false, controller = null, states = null;
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
    const ids = ['smartText', 'smartImage', 'uploadImageBtn', 'removeImageBtn', 'apiEndpoint', 'apiModel', 'apiKey', 'clearApiKeyBtn', 'verifyApiBtn'];
    for (const id of ids) $(id).disabled = busy;
    for (const input of form.querySelectorAll('input, button')) input.disabled = busy;
    $('recognizeBtn').disabled = busy || imageReading;
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
    $('recognizeBtn').disabled = Boolean(controller);
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
      $('sourceImage').src = data;
      $('sourceImageName').textContent = file.name || '粘贴的截图';
      $('imagePreview').hidden = false;
      status.textContent = '图片已就绪，可在文字框补充要求，再点击智能识别。';
    } catch {
      if (version === imageVersion) status.textContent = '图片无法读取，请更换一张清晰的截图。';
    } finally {
      if (version === imageVersion) {
        imageReading = false;
        $('recognizeBtn').disabled = false;
      }
    }
  }

  $('uploadImageBtn').addEventListener('click', () => $('smartImage').click());
  $('smartImage').addEventListener('change', event => selectImage(event.target.files?.[0]));
  $('smartText').addEventListener('paste', event => {
    const file = Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith('image/'));
    if (file) { event.preventDefault(); selectImage(file); }
  });
  $('removeImageBtn').addEventListener('click', () => { resetImage(); status.textContent = '已移除图片。'; });
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

  $('verifyApiBtn').addEventListener('click', async () => {
    if (controller || imageReading) return;
    controller = new AbortController();
    setBusy(true, true);
    $('apiVerificationStatus').textContent = '正在验证地址和密钥，获取可用模型…';
    $('apiModelOptions').replaceChildren();
    try {
      const models = await discoverModels({ endpoint: $('apiEndpoint').value, relayEndpoint: RELAY_ENDPOINT, apiKey: $('apiKey').value, signal: controller.signal });
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

  $('recognizeBtn').addEventListener('click', async () => {
    if (controller || imageReading) return;
      const config = { endpoint: $('apiEndpoint').value.trim(), relayEndpoint: RELAY_ENDPOINT, model: $('apiModel').value.trim(), apiKey: $('apiKey').value.trim() };
    try {
      normalizeEndpoint(config.endpoint);
      if (!config.model || !config.apiKey) throw new Error('请先填写 API Key 和支持图片理解的模型名称。');
    } catch (error) {
      $('apiSettings').open = true;
      status.textContent = error.message;
      return;
    }
    if (!$('smartText').value.trim() && !imageData) { status.textContent = '请先输入产品描述或选择一张图片。'; return; }
    controller = new AbortController();
    setBusy(true);
    status.textContent = '正在理解产品参数，请稍候…';
    try {
      const result = await recognizeProduct({ ...config, text: $('smartText').value, image: imageData, signal: controller.signal });
      if (controller.signal.aborted) return;
      states = {};
      for (const key of Object.keys(FIELD_LABELS)) {
        const field = result.fields[key];
        // Replace all fields so a new product cannot inherit old price, weight or date.
        $(key).value = result.values[key];
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
      $('apiSettings').open = false;
      status.textContent = '已填入下方参数，请检查并补齐缺项，确认后再计算。';
      onRecognized();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      config.apiKey = '';
      controller = null;
      setBusy(false);
    }
  });

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
