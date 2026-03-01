/**
 * Apply specific pending migrations via Supabase Management API
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ACCESS_TOKEN = 'sbp_e5079eeb22db99c56a8619959ab4c7c5640a6e0b';
const PROJECT_REF = 'zdnypksjqnhtiblwdaic';
const API_BASE = 'https://api.supabase.com';

async function executeSQL(sql, label) {
  console.log(`\n⏳ Executing: ${label}`);

  const response = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(`❌ Failed (${response.status}): ${text}`);
    return false;
  }

  try {
    const data = JSON.parse(text);
    if (data.error) {
      console.error(`❌ SQL Error: ${data.error}`);
      return false;
    }
    console.log(`✅ Success`);
    return true;
  } catch {
    console.log(`✅ Success`);
    return true;
  }
}

async function main() {
  const migrationsDir = resolve(__dirname, '../supabase/migrations');

  // Apply the specific migrations that failed
  const toApply = [
    '20260303_session_tracking_images.sql',
    '20260305_contribution_tracking.sql',
  ];

  for (const file of toApply) {
    const filePath = `${migrationsDir}/${file}`;
    const sql = readFileSync(filePath, 'utf-8');
    await executeSQL(sql, file);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Verify the key tables exist
  console.log('\n🔍 Verifying tables...');
  const verifySQL = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'question_posts', 'question_votes', 'question_improvements',
        'improvement_votes', 'question_sessions', 'user_exam_profiles',
        'user_exam_attempts', 'user_qb_stats'
      )
    ORDER BY table_name;
  `;

  const response = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: verifySQL }),
  });

  const text = await response.text();
  if (response.ok) {
    const data = JSON.parse(text);
    console.log('\nTables found:');
    if (Array.isArray(data)) {
      data.forEach(row => console.log(`  ✅ ${row.table_name}`));
    } else {
      console.log(text);
    }
  } else {
    console.error('Verification failed:', text);
  }
}

main().catch(console.error);
