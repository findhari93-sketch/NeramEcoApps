/**
 * COA Institutions Seed Script
 * Reads CSV, transforms data, outputs SQL INSERT statements
 * Usage: node scripts/seed-coa.mjs > scripts/seed-coa.sql
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '..', 'docs', 'COA_Approved_Institutions_UG.csv');

const STATE_MAP = {
  'ANDHRA PRADESH': 'Andhra Pradesh',
  'ASSAM': 'Assam',
  'BIHAR': 'Bihar',
  'CHHATTISGARH': 'Chhattisgarh',
  'CHANDIGARH': 'Chandigarh',
  'DELHI': 'Delhi',
  'GOA': 'Goa',
  'GUJARAT': 'Gujarat',
  'HARYANA': 'Haryana',
  'HIMACHAL PRADESH': 'Himachal Pradesh',
  'JHARKHAND': 'Jharkhand',
  'JAMMU & KASHMIR': 'Jammu & Kashmir',
  'KARNATAKA': 'Karnataka',
  'KERALA': 'Kerala',
  'MAHARASHTRA': 'Maharashtra',
  'MEGHALAYA': 'Meghalaya',
  'MADHYA PRADESH': 'Madhya Pradesh',
  'MIZORAM': 'Mizoram',
  'ODISHA': 'Odisha',
  'PUNJAB': 'Punjab',
  'Puducherry': 'Puducherry',
  'RAJASTHAN': 'Rajasthan',
  'TAMIL NADU': 'Tamil Nadu',
  'TELANGANA': 'Telangana',
  'Uttarakhand': 'Uttarakhand',
  'UTTAR PRADESH': 'Uttar Pradesh',
  'WEST BENGAL': 'West Bengal',
  'UAE': 'UAE',
  'MIZORAM': 'Mizoram',
};

function normalizeState(s) {
  const trimmed = (s || '').trim();
  return STATE_MAP[trimmed] || trimmed;
}

function parseAddress(address) {
  // Format: "..., CITY,Pin code-XXXXXX ,STATE"
  const pinMatch = address.match(/,Pin code-(\d+)\s*,(.+)$/i);
  let city = '';
  let state = '';
  let pincode = '';

  if (pinMatch) {
    pincode = pinMatch[1].trim();
    state = normalizeState(pinMatch[2].trim());
    // City is the part just before ",Pin code-"
    const beforePin = address.substring(0, address.indexOf(',Pin code-'));
    const parts = beforePin.split(',');
    city = parts[parts.length - 1].trim();
  }
  return { city, state, pincode };
}

function computeApprovalStatus(period) {
  if (!period) return { status: 'unknown', valid: false };
  if (period.includes('2025-2026')) return { status: 'active', valid: true };
  if (period.includes('2024-2025')) return { status: 'expiring', valid: false };
  return { status: 'unknown', valid: false };
}

function esc(val) {
  if (val === null || val === undefined || val === '' || val === '-' || val === ',' || val === '0' || val === ',-') return 'NULL';
  return `'${String(val).replace(/'/g, "''").trim()}'`;
}

function parseCSV(content) {
  // Remove BOM if present
  const text = content.replace(/^\uFEFF/, '').replace(/^ï»¿/, '');
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));

  const rows = [];
  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Handle quoted fields with embedded commas/newlines
    const fields = [];
    let field = '';
    let inQuotes = false;

    // Join multiple lines if needed for quoted fields
    let currentLine = line;
    while (true) {
      for (let c = 0; c < currentLine.length; c++) {
        const ch = currentLine[c];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          fields.push(field.trim());
          field = '';
        } else {
          field += ch;
        }
      }
      if (!inQuotes) break;
      // Need to grab next line
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

const content = readFileSync(csvPath, 'utf-8');
const rows = parseCSV(content);

process.stdout.write(`-- COA Institutions Seed Data (${rows.length} rows)\n`);
process.stdout.write(`INSERT INTO coa_institutions (\n`);
process.stdout.write(`  institution_code, name, head_of_dept, address, city, state, pincode,\n`);
process.stdout.write(`  affiliating_university, course_name, commenced_year, current_intake,\n`);
process.stdout.write(`  approval_period_raw, approval_status, valid_for_2025_26,\n`);
process.stdout.write(`  phone, fax, email, mobile, website\n`);
process.stdout.write(`) VALUES\n`);

const values = rows.map((row, idx) => {
  const code = row['Institution Code'] || '';
  const name = (row['Institution Name'] || '').replace(/\n/g, ' ');
  const headOfDept = row['Contact Person'] || '';
  const address = (row['Address'] || '').replace(/\n/g, ' ');
  const { city, state, pincode } = parseAddress(address);
  const affUniv = row['Affiliating University'] || '';
  const courseName = row['Course Name'] || 'Bachelor of Architecture';
  const commencedYear = parseInt(row['Course Commencement Year']) || null;
  const intake = parseInt(row['Intake']) || null;
  const approvalPeriod = row['Approval Period'] || '';
  const { status, valid } = computeApprovalStatus(approvalPeriod);
  const phone = row['Tel'] || '';
  const fax = row['Fax'] || '';
  const email = row['Email'] || '';
  const mobile = row['Mobile'] || '';
  const website = row['Website'] || '';

  return `  (${esc(code)}, ${esc(name)}, ${esc(headOfDept)}, ${esc(address)}, ${esc(city)}, ${esc(state)}, ${esc(pincode)},\n   ${esc(affUniv)}, ${esc(courseName)}, ${commencedYear || 'NULL'}, ${intake || 'NULL'},\n   ${esc(approvalPeriod)}, '${status}', ${valid},\n   ${esc(phone)}, ${esc(fax)}, ${esc(email)}, ${esc(mobile)}, ${esc(website)})`;
});

process.stdout.write(values.join(',\n') + '\n');
process.stdout.write(`ON CONFLICT (institution_code) DO UPDATE SET\n`);
process.stdout.write(`  name = EXCLUDED.name,\n`);
process.stdout.write(`  approval_period_raw = EXCLUDED.approval_period_raw,\n`);
process.stdout.write(`  approval_status = EXCLUDED.approval_status,\n`);
process.stdout.write(`  valid_for_2025_26 = EXCLUDED.valid_for_2025_26,\n`);
process.stdout.write(`  current_intake = EXCLUDED.current_intake,\n`);
process.stdout.write(`  updated_at = now();\n\n`);
process.stdout.write(`REFRESH MATERIALIZED VIEW coa_state_stats;\n`);

process.stderr.write(`Processed ${rows.length} rows\n`);
