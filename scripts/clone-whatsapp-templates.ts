/**
 * Clone all WhatsApp message templates from a SOURCE WABA to a DESTINATION WABA.
 *
 * Use case: you've created a new production WABA and want to migrate the templates
 * from the Test WABA (or any other WABA) without recreating each one by hand.
 *
 * What it does:
 *   1. Fetches every APPROVED template on the source WABA (name, language,
 *      category, components — header/body/footer/buttons)
 *   2. For each template, POSTs to the destination WABA's templates endpoint
 *   3. Skips templates that already exist on the destination (idempotent — safe to re-run)
 *   4. Skips media-header templates (IMAGE/VIDEO/DOCUMENT) and prints them so you
 *      can recreate manually (Meta requires a fresh media upload for those)
 *   5. Prints per-template success/failure
 *
 * Usage (from project root):
 *   WHATSAPP_ACCESS_TOKEN="EAA..." \
 *   WHATSAPP_SOURCE_WABA_ID="881023561405137" \
 *   WHATSAPP_DEST_WABA_ID="1246354014369613" \
 *   npx tsx scripts/clone-whatsapp-templates.ts
 *
 *   # dry-run (preview, no writes):
 *   WHATSAPP_DRY_RUN=1 ... npx tsx scripts/clone-whatsapp-templates.ts
 *
 * After running:
 *   - Text templates: Meta approves in minutes
 *   - Media-header templates (listed at end): manually create in WhatsApp Manager,
 *     uploading the media file each time. Hours-to-1-day approval.
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const SOURCE_WABA = process.env.WHATSAPP_SOURCE_WABA_ID;
const DEST_WABA = process.env.WHATSAPP_DEST_WABA_ID;
const DRY_RUN = process.env.WHATSAPP_DRY_RUN === '1';

if (!TOKEN || !SOURCE_WABA || !DEST_WABA) {
  console.error('\nMissing required env vars:');
  console.error('  WHATSAPP_ACCESS_TOKEN     System User token (needs whatsapp_business_management on BOTH WABAs)');
  console.error('  WHATSAPP_SOURCE_WABA_ID   WABA to copy from (e.g. 881023561405137 = Test)');
  console.error('  WHATSAPP_DEST_WABA_ID     WABA to copy to (e.g. 1246354014369613 = Neram Classes prod)');
  console.error('Optional:');
  console.error('  WHATSAPP_DRY_RUN=1        preview without creating templates');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v21.0';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: Record<string, unknown>;
  buttons?: unknown[];
}

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: TemplateComponent[];
}

async function listTemplates(wabaId: string): Promise<Template[]> {
  const all: Template[] = [];
  let url: string | null = `${API}/${wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(`List failed for ${wabaId}: ${JSON.stringify(data)}`);
    }
    all.push(...(data.data ?? []));
    url = data?.paging?.next ?? null;
  }
  return all;
}

async function createTemplate(
  wabaId: string,
  template: { name: string; language: string; category: string; components: TemplateComponent[] }
): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${API}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(template),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

function hasMediaHeader(t: Template): boolean {
  return t.components.some(
    c => c.type === 'HEADER' && c.format && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)
  );
}

async function main() {
  console.log('\n=== Clone WhatsApp message templates ===');
  console.log(`Source WABA: ${SOURCE_WABA}`);
  console.log(`Dest WABA:   ${DEST_WABA}`);
  console.log(`Mode:        ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE'}\n`);

  console.log('Listing source templates...');
  const sourceTemplates = await listTemplates(SOURCE_WABA);
  const approved = sourceTemplates.filter(t => t.status === 'APPROVED');
  console.log(`  ${sourceTemplates.length} total, ${approved.length} APPROVED\n`);

  console.log('Listing destination templates (to skip duplicates)...');
  const destTemplates = await listTemplates(DEST_WABA);
  const destKeys = new Set(destTemplates.map(t => `${t.name}:${t.language}`));
  console.log(`  ${destTemplates.length} already on destination\n`);

  const created: string[] = [];
  const skippedDup: string[] = [];
  const skippedMedia: Array<{ name: string; language: string; reason: string }> = [];
  const failed: Array<{ name: string; language: string; reason: string }> = [];

  for (const t of approved) {
    const key = `${t.name}:${t.language}`;
    const label = `${t.name} [${t.language}, ${t.category}]`;

    if (destKeys.has(key)) {
      console.log(`  SKIP (already exists): ${label}`);
      skippedDup.push(label);
      continue;
    }

    if (hasMediaHeader(t)) {
      console.log(`  SKIP (media header, recreate manually): ${label}`);
      skippedMedia.push({ name: t.name, language: t.language, reason: 'media header (IMAGE/VIDEO/DOCUMENT) requires fresh upload' });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${label}`);
      created.push(label);
      continue;
    }

    const { ok, data } = await createTemplate(DEST_WABA, {
      name: t.name,
      language: t.language,
      category: t.category,
      components: t.components,
    });

    if (ok) {
      console.log(`  CREATED: ${label}  (id=${data?.id ?? '?'}, status=${data?.status ?? '?'})`);
      created.push(label);
    } else {
      const msg = data?.error?.message ?? JSON.stringify(data);
      console.log(`  FAIL: ${label}  → ${msg}`);
      failed.push({ name: t.name, language: t.language, reason: msg });
    }

    // gentle rate-limit cushion
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== Summary ===');
  console.log(`Created:        ${created.length}`);
  console.log(`Skipped (dup):  ${skippedDup.length}`);
  console.log(`Skipped (media): ${skippedMedia.length}`);
  console.log(`Failed:         ${failed.length}`);

  if (skippedMedia.length > 0) {
    console.log('\n--- Recreate these manually in WhatsApp Manager (media headers) ---');
    for (const t of skippedMedia) {
      console.log(`  - ${t.name} [${t.language}]  ${t.reason}`);
    }
    console.log('\n  Steps for each:');
    console.log('    1. https://business.facebook.com/wa/manage/message-templates → switch to Neram Classes WABA');
    console.log('    2. Create template → use the EXACT same name and language as listed above');
    console.log('    3. Re-upload the original media file (video/image)');
    console.log('    4. Copy body text from Test WABA template editor (open it side-by-side)');
    console.log('    5. Submit for review');
  }

  if (failed.length > 0) {
    console.log('\n--- Failed templates ---');
    for (const f of failed) {
      console.log(`  - ${f.name} [${f.language}]: ${f.reason}`);
    }
    process.exit(1);
  }

  console.log('\nNext: wait for Meta to approve created templates (usually a few minutes for text-only).');
  console.log('Check status: https://business.facebook.com/wa/manage/message-templates (switch to Neram Classes)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
