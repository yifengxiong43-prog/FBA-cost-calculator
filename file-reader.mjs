export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILE_TEXT_MAX = 24000;
export const FILE_ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.txt,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

const EXTENSIONS = new Map([
  ['.pdf', 'pdf'],
  ['.docx', 'docx'],
  ['.xlsx', 'xlsx'],
  ['.xls', 'xlsx'],
  ['.csv', 'text'],
  ['.txt', 'text']
]);

function extensionOf(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || '';
}

function fileKind(file) {
  return EXTENSIONS.get(extensionOf(file.name)) ||
    (file.type === 'application/pdf' ? 'pdf' : file.type.includes('word') ? 'docx' : file.type.includes('sheet') || file.type.includes('excel') ? 'xlsx' : file.type.startsWith('text/') ? 'text' : '');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function truncateFileText(text, limit = FILE_TEXT_MAX) {
  const normalized = normalizeText(text);
  return normalized.length > limit ? `${normalized.slice(0, limit)}\n[文件内容已截断，剩余内容未发送]` : normalized;
}

export async function readProductFile(file, adapters = globalThis.__artCostDeskFileReaders || {}) {
  if (!file || typeof file !== 'object') throw new Error('请选择一个文件。');
  if (!file.name) throw new Error('文件名称无法读取，请重新选择。');
  if (file.size > FILE_MAX_BYTES) throw new Error('文件不能超过 10 MB。');
  const kind = fileKind(file);
  if (!kind) throw new Error('暂不支持此文件格式，请上传 PDF、Word、Excel、CSV 或 TXT。');
  let text;
  if (kind === 'text') {
    text = await file.text();
  } else if (typeof adapters[kind] === 'function') {
    text = await adapters[kind](file);
  } else {
    throw new Error('文件解析组件尚未加载，请刷新页面后重试。');
  }
  const content = truncateFileText(text);
  if (!content) throw new Error('文件中没有可读取的文字或表格内容。');
  return { fileName: file.name, kind, text: content, characters: content.length };
}

export function setFileReaders(adapters) {
  globalThis.__artCostDeskFileReaders = adapters;
}
