import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as mammoth from 'mammoth/mammoth.browser.js';
import * as XLSX from 'xlsx';
import { setFileReaders } from '../file-reader.mjs';

async function readPdf(file) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str || '').join(' '));
  }
  return pages.map((page, index) => `第 ${index + 1} 页\n${page}`).join('\n\n');
}

async function readDocx(file) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function readWorkbook(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    return `工作表：${name}\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
  }).join('\n\n');
}

setFileReaders({ pdf: readPdf, docx: readDocx, xlsx: readWorkbook });
