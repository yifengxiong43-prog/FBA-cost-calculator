import { readReportSnapshot, snapshotFingerprint, buildReportSnapshot } from '../report-data.mjs';
import { createHistoryDatabase, createHistoryStore } from '../history-store.mjs';
import { exportExcel, exportPdf, configurePdfFont } from '../report-export.mjs';
import simheiFont from '../assets/SimHei-subset.ttf';

const historyStore = createHistoryStore(createHistoryDatabase());
configurePdfFont(simheiFont);
window.__artCostDeskReports = { readReportSnapshot, snapshotFingerprint, buildReportSnapshot, exportExcel, exportPdf, historyStore };
