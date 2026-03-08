/**
 * COA Seed via Supabase REST API (PostgREST UPSERT)
 * Usage: node scripts/seed-coa-rest.mjs [staging|prod]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '..', 'docs', 'COA_Approved_Institutions_UG.csv');

const ENV = process.argv[2] || 'staging';

const CONFIGS = {
  staging: {
    url: 'https://db-staging.neramclasses.com',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhneGphdnJzcnZwaWhxcnBlemRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjQ1ODAxMywiZXhwIjoyMDcyMDM0MDEzfQ.MIkaZs1OcWheSleFmX_KB3UlZycIEAd0nlQWZB5jSWA',
    ref: 'hgxjavrsrvpihqrpezdh',
  },
  prod: {
    url: 'https://db.neramclasses.com',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkbnlwa3NqcW5odGlibHdkYWljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE1MDE5OCwiZXhwIjoyMDgxNzI2MTk4fQ.Ud6nd2pIDLxwmR0JoV_f2wZ3YMLD-9NFPkqc9btQnFs',
    ref: 'zdnypksjqnhtiblwdaic',
  },
};

const STATE_MAP = {
  'ANDHRA PRADESH': 'Andhra Pradesh', 'ASSAM': 'Assam', 'BIHAR': 'Bihar',
  'CHHATTISGARH': 'Chhattisgarh', 'CHANDIGARH': 'Chandigarh', 'DELHI': 'Delhi',
  'GOA': 'Goa', 'GUJARAT': 'Gujarat', 'HARYANA': 'Haryana',
  'HIMACHAL PRADESH': 'Himachal Pradesh', 'JHARKHAND': 'Jharkhand',
  'JAMMU & KASHMIR': 'Jammu & Kashmir', 'KARNATAKA': 'Karnataka', 'KERALA': 'Kerala',
  'MAHARASHTRA': 'Maharashtra', 'MEGHALAYA': 'Meghalaya', 'MADHYA PRADESH': 'Madhya Pradesh',
  'MIZORAM': 'Mizoram', 'ODISHA': 'Odisha', 'PUNJAB': 'Punjab',
  'Puducherry': 'Puducherry', 'RAJASTHAN': 'Rajasthan', 'TAMIL NADU': 'Tamil Nadu',
  'TELANGANA': 'Telangana', 'Uttarakhand': 'Uttarakhand', 'UTTAR PRADESH': 'Uttar Pradesh',
  'WEST BENGAL': 'West Bengal', 'UAE': 'UAE',
};

function normalizeState(s) {
  const trimmed = (s || '').trim();
  return STATE_MAP[trimmed] || trimmed;
}

function parseAddress(address) {
  const pinMatch = address.match(/,Pin code-(\d+)\s*,(.+)$/i);
  if (!pinMatch) return { city: '', state: '', pincode: '' };
  const pincode = pinMatch[1].trim();
  const state = normalizeState(pinMatch[2].trim());
  const beforePin = address.substring(0, address.indexOf(',Pin code-'));
  const parts = beforePin.split(',');
  const city = parts[parts.length - 1].trim();
  return { city, state, pincode };
}

function computeApprovalStatus(period) {
  if (!period) return { status: 'unknown', valid: false };
  if (period.includes('2025-2026')) return { status: 'active', valid: true };
  if (period.includes('2024-2025')) return { status: 'expiring', valid: false };
  return { status: 'unknown', valid: false };
}

function nullify(val) {
  if (!val || val === '-' || val === ',' || val === '0' || val === ',-') return null;
  return String(val).trim() || null;
}

function parseCSV(content) {
  const text = content.replace(/^\uFEFF/, '').replace(/^ï»¿/, '');
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  const rows = [];
  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const fields = [];
    let field = '';
    let inQuotes = false;
    let currentLine = line;
    while (true) {
      for (let c = 0; c < currentLine.length; c++) {
        const ch = currentLine[c];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { fields.push(field.trim()); field = ''; }
        else { field += ch; }
      }
      if (!inQuotes) break;
      i++;
      if (i >= lines.length) break;
      field += ' ';
      currentLine = lines[i];
    }
    fields.push(field.trim());
    if (fields.length >= 16) {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = fields[idx] || ''; });
      rows.push(obj);
    }
    i++;
  }
  return rows;
}

async function upsertBatch(url, key, rows) {
  const res = await fetch(`${url}/rest/v1/coa_institutions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
}

async function refreshView(url, key) {
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key },
  });
  // Best effort - use Management API for refresh
}

const cfg = CONFIGS[ENV];
if (!cfg) { console.error('Usage: node seed-coa-rest.mjs [staging|prod]'); process.exit(1); }

// For prod, read key from env
if (ENV === 'prod' && !cfg.key) {
  try {
    const envContent = readFileSync(join(__dirname, '..', 'apps', 'admin', '.env.production.local'), 'utf-8');
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
    if (match) cfg.key = match[1].trim();
  } catch { /* no file */ }
  if (!cfg.key) {
    console.error('Production service role key not found. Set SUPABASE_SERVICE_ROLE_KEY env var.');
    process.exit(1);
  }
}

const content = readFileSync(csvPath, 'utf-8');
const rows = parseCSV(content);
console.log(`Parsed ${rows.length} rows from CSV`);

const records = rows.map(row => {
  const address = (row['Address'] || '').replace(/\n/g, ' ');
  const { city, state, pincode } = parseAddress(address);
  const approvalPeriod = row['Approval Period'] || '';
  const { status, valid } = computeApprovalStatus(approvalPeriod);
  return {
    institution_code: row['Institution Code'],
    name: (row['Institution Name'] || '').replace(/\n/g, ' ').trim(),
    head_of_dept: nullify(row['Contact Person']),
    address: nullify(address),
    city: city || 'Unknown',
    state: state || 'Unknown',
    pincode: nullify(pincode),
    affiliating_university: nullify(row['Affiliating University']),
    course_name: row['Course Name'] || 'Bachelor of Architecture',
    commenced_year: parseInt(row['Course Commencement Year']) || null,
    current_intake: parseInt(row['Intake']) || null,
    approval_period_raw: approvalPeriod,
    approval_status: status,
    valid_for_2025_26: valid,
    phone: nullify(row['Tel']),
    fax: nullify(row['Fax']),
    email: nullify(row['Email']),
    mobile: nullify(row['Mobile']),
    website: nullify(row['Website']),
  };
}).filter(r => r.institution_code);

console.log(`Inserting ${records.length} records to ${ENV}...`);

const BATCH_SIZE = 50;
let inserted = 0;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  try {
    await upsertBatch(cfg.url, cfg.key, batch);
    inserted += batch.length;
    process.stdout.write(`\rProgress: ${inserted}/${records.length}`);
  } catch (err) {
    console.error(`\nBatch ${Math.ceil(i / BATCH_SIZE) + 1} failed:`, err.message);
    process.exit(1);
  }
}

console.log(`\nDone! Inserted/updated ${inserted} rows on ${ENV}`);
console.log('Note: Run REFRESH MATERIALIZED VIEW coa_state_stats; via Supabase dashboard');
