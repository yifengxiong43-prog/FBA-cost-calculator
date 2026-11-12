import { FIELD_LABELS, normalizeEndpoint, recognizeProduct } from './product-recognition.mjs';

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

  function setBusy(busy) {
    const ids = ['smartText', 'smartImage', 'uploadImageBtn', 'removeImageBtn', 'apiEndpoint', 'apiModel', 'apiKey', 'clearApiKeyBtn'];
    for (const id of ids) $(id).disabled = busy;
    for (const input of form.querySelectorAll('input, button')) input.disabled = busy;
    $('recognizeBtn').disabled = busy || imageReading;
    $('recognizeBtn').textContent = busy ? '识别中…' : '智能识别';
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

  function updateConfigStatus() {
    $('apiConfigStatus').textContent = ['apiEndpoint', 'apiModel', 'apiKey'].every(id => $(id).value.trim()) ? '已填写，待识别验证' : '尚未填写完整';
  }
  for (const id of ['apiEndpoint', 'apiModel', 'apiKey']) $(id).addEventListener('input', updateConfigStatus);
  $('clearApiKeyBtn').addEventListener('click', () => { $('apiKey').value = ''; updateConfigStatus(); });

  $('recognizeBtn').addEventListener('click', async () => {
    if (controller || imageReading) return;
    const config = { endpoint: $('apiEndpoint').value.trim(), model: $('apiModel').value.trim(), apiKey: $('apiKey').value.trim() };
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
  // No storage or URL parameters contain the key; clear it when leaving the document.
  window.addEventListener('pagehide', () => { $('apiKey').value = ''; controller?.abort(); });
}
