import { downloadBlob } from './util'

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  // BOM כדי שאקסל יזהה עברית
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, fileName)
}
