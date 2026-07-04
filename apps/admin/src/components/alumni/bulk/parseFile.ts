/**
 * File / paste parsing for the bulk-alumni importer. CSV via papaparse, Excel via
 * SheetJS (dynamically imported so xlsx stays out of the main bundle). Returns a
 * uniform { headers, rows } shape where rows are keyed by the raw header text.
 */
import Papa from 'papaparse';

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

function cleanRows(headers: string[], rows: Record<string, unknown>[]): ParsedTable {
  const cleanHeaders = headers.map((h) => String(h ?? '').trim()).filter(Boolean);
  const cleanedRows = rows
    .map((r) => {
      const out: Record<string, string> = {};
      for (const h of cleanHeaders) out[h] = r[h] == null ? '' : String(r[h]).trim();
      return out;
    })
    .filter((r) => cleanHeaders.some((h) => r[h] !== ''));
  return { headers: cleanHeaders, rows: cleanedRows };
}

function parseCsvText(text: string): ParsedTable {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = (res.meta.fields || []).map((h) => String(h).trim());
  return cleanRows(headers, res.data as Record<string, unknown>[]);
}

async function parseExcel(file: File): Promise<ParsedTable> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  // defval:'' keeps blank cells as empty strings so every row has all columns.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const headers = json.length ? Object.keys(json[0]) : [];
  return cleanRows(headers, json);
}

/** Parse a dropped/selected file by extension. Throws on unsupported types. */
export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    return parseCsvText(text);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(file);
  }
  throw new Error('Unsupported file. Upload a .csv, .xlsx, or .xls file.');
}

/**
 * Parse pasted text. Detects TSV (spreadsheet paste) vs CSV by counting tabs in
 * the first line, then delegates to papaparse with the right delimiter.
 */
export function parsePasted(text: string): ParsedTable {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const res = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  const headers = (res.meta.fields || []).map((h) => String(h).trim());
  return cleanRows(headers, res.data as Record<string, unknown>[]);
}
