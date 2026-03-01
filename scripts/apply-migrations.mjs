/**
 * Apply Supabase migrations via Management API
 * Uses the Supabase Management API to execute SQL directly
 */

import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
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
    console.log(`✅ Success (non-JSON response)`);
    return true;
  }
}

async function applyMigrations() {
  const migrationsDir = resolve(__dirname, '../supabase/migrations');

  // Get all migration files, sorted by name
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files:`);
  files.forEach(f => console.log(`  - ${f}`));

  // Check which migrations have already been applied
  console.log('\n📋 Checking applied migrations...');
  const checkSQL = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
    ) as migrations_table_exists;
  `;

  const checkResponse = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: checkSQL }),
  });

  const checkText = await checkResponse.text();
  let appliedMigrations = new Set();

  if (checkResponse.ok) {
    try {
      const checkData = JSON.parse(checkText);
      if (checkData && checkData[0]?.migrations_table_exists) {
        const listSQL = `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`;
        const listResponse = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: listSQL }),
        });
        const listText = await listResponse.text();
        if (listResponse.ok) {
          const listData = JSON.parse(listText);
          if (Array.isArray(listData)) {
            listData.forEach(row => appliedMigrations.add(row.version));
            console.log(`Already applied: ${appliedMigrations.size} migrations`);
            appliedMigrations.forEach(v => console.log(`  ✓ ${v}`));
          }
        }
      }
    } catch (e) {
      console.log('Could not parse migrations check response');
    }
  }

  // Apply each migration
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const file of files) {
    const version = file.replace('.sql', '');

    if (appliedMigrations.has(version)) {
      console.log(`\n⏭️  Skipping (already applied): ${file}`);
      skipCount++;
      continue;
    }

    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf-8');

    const success = await executeSQL(sql, file);

    if (success) {
      successCount++;
      // Record migration as applied
      const recordSQL = `
        INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
        VALUES ('${version}', '${file}', ARRAY['${sql.replace(/'/g, "''").substring(0, 100)}...'])
        ON CONFLICT (version) DO NOTHING;
      `;
      await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: recordSQL }),
      });
    } else {
      failCount++;
    }

    // Small delay between migrations
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Applied: ${successCount}`);
  console.log(`  ⏭️  Skipped: ${skipCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
}

applyMigrations().catch(console.error);
