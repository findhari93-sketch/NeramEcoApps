/**
 * Print full template definitions (header / body / footer / buttons / variables)
 * for the templates that the clone script couldn't auto-migrate (media headers).
 *
 * Use this as a copy-paste reference when manually recreating media-header
 * templates in WhatsApp Manager on the destination WABA.
 *
 * Usage:
 *   WHATSAPP_ACCESS_TOKEN="EAA..." \
 *   WHATSAPP_SOURCE_WABA_ID="881023561405137" \
 *   npx tsx scripts/print-template-bodies.ts
 *
 * Optional: filter to specific names
 *   WHATSAPP_TEMPLATE_NAMES="first_touch_quick_question,first_touch_results_video,first_touch_english_intro"
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const SOURCE_WABA = process.env.WHATSAPP_SOURCE_WABA_ID;
const FILTER = process.env.WHATSAPP_TEMPLATE_NAMES;

if (!TOKEN || !SOURCE_WABA) {
  console.error('Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_SOURCE_WABA_ID');
  process.exit(1);
}

const filterNames = FILTER ? new Set(FILTER.split(',').map(s => s.trim())) : null;

async function main() {
  const all: any[] = [];
  let url: string | null = `https://graph.facebook.com/v21.0/${SOURCE_WABA}/message_templates?fields=id,name,language,category,status,components&limit=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data: any = await res.json();
    if (!res.ok) {
      console.error('List failed:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
    all.push(...(data.data ?? []));
    url = data?.paging?.next ?? null;
  }

  const filtered = filterNames
    ? all.filter((t: any) => filterNames.has(t.name))
    : all.filter((t: any) =>
        (t.components ?? []).some(
          (c: any) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)
        )
      );

  if (filtered.length === 0) {
    console.log('No matching templates found.');
    return;
  }

  console.log(`\n=== ${filtered.length} template(s) ===\n`);

  for (const t of filtered) {
    console.log('═'.repeat(70));
    console.log(`Template:  ${t.name}`);
    console.log(`Language:  ${t.language}`);
    console.log(`Category:  ${t.category}`);
    console.log(`Status:    ${t.status}`);
    console.log('─'.repeat(70));

    for (const c of t.components ?? []) {
      switch (c.type) {
        case 'HEADER':
          console.log(`HEADER  (${c.format})`);
          if (c.text) console.log(`  text: ${c.text}`);
          if (c.example) console.log(`  example: ${JSON.stringify(c.example)}`);
          if (c.format === 'VIDEO') console.log(`  ⚠  Re-upload the same video file when recreating`);
          if (c.format === 'IMAGE') console.log(`  ⚠  Re-upload the same image file when recreating`);
          if (c.format === 'DOCUMENT') console.log(`  ⚠  Re-upload the same document file when recreating`);
          break;
        case 'BODY':
          console.log(`BODY`);
          console.log(`  ${(c.text ?? '').split('\n').join('\n  ')}`);
          if (c.example) console.log(`  example: ${JSON.stringify(c.example)}`);
          break;
        case 'FOOTER':
          console.log(`FOOTER`);
          console.log(`  ${c.text ?? ''}`);
          break;
        case 'BUTTONS':
          console.log(`BUTTONS`);
          for (const b of c.buttons ?? []) {
            console.log(`  - ${JSON.stringify(b)}`);
          }
          break;
        default:
          console.log(`${c.type}`);
          console.log(`  ${JSON.stringify(c)}`);
      }
    }
    console.log();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
