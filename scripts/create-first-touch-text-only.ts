/**
 * Create text-only versions of the 3 first_touch templates on the destination WABA.
 *
 * Why: the originals on the Test WABA have VIDEO headers, which Meta's API
 * cannot clone (you must re-upload the video file). To unblock the cron quickly,
 * we create text-only versions with the SAME names so the existing send code
 * works without modification. You can later upgrade each template to add a
 * video header via WhatsApp Manager → Edit template → re-submit for approval.
 *
 * Usage:
 *   WHATSAPP_ACCESS_TOKEN="EAA..." \
 *   WHATSAPP_DEST_WABA_ID="1246354014369613" \
 *   npx tsx scripts/create-first-touch-text-only.ts
 *
 * The body text + footer + buttons mirror the originals captured from the
 * Test WABA on 2026-04-19 via scripts/print-template-bodies.ts.
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_DEST_WABA_ID;

if (!TOKEN || !WABA) {
  console.error('Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_DEST_WABA_ID');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v21.0';

interface Component {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT';
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
}

interface TemplateSpec {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: Component[];
}

const templates: TemplateSpec[] = [
  {
    name: 'first_touch_quick_question',
    language: 'en',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: "Hi {{1}} 👋 This is Architect from Neram Classes.\n\nThanks for checking out our aiArchitek STudy App, hope you like it!\n\nQuick question: are you preparing for NATA 2026, JEE Paper 2, or both? Happy to point you to the right resources based on where you are 🙂",
        example: { body_text: [['Rahul']] },
      },
      { type: 'FOOTER', text: 'neramclasses.com' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Watch Class Sample Record' }],
      },
    ],
  },
  {
    name: 'first_touch_results_video',
    language: 'en',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: "Hi {{1}} 👋 This is Architect Tamil from Neram Classes.\n\nSaw you signed up on our app, welcome! Here's a quick look at what our students pulled off this year 👇",
        example: { body_text: [['Rahul']] },
      },
      { type: 'FOOTER', text: 'neramclasses.com' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: 'Free Class recording' }],
      },
    ],
  },
  {
    name: 'first_touch_english_intro',
    language: 'en',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: "Hi {{1}} 👋 This is Architect Tamilselvan from neramClasses.com.\n\nThanks for signing up on our app! We've built something unique for NATA/JEE B.Arch students , an AI-powered study assistant and a fully online classroom designed for architecture entrance prep.\n\nHere's a quick look at how it works 👇",
        example: { body_text: [['Rahul']] },
      },
      { type: 'FOOTER', text: 'neramclasses.com' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Watch Live Class', url: 'https://youtu.be/qa41cw5u5e8' },
        ],
      },
    ],
  },
];

async function createTemplate(spec: TemplateSpec): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${API}/${WABA}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(spec),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function main() {
  console.log(`\n=== Create text-only first_touch templates on WABA ${WABA} ===\n`);

  for (const spec of templates) {
    const label = `${spec.name} [${spec.language}, ${spec.category}]`;
    console.log(`Creating ${label}...`);
    const { ok, data } = await createTemplate(spec);
    if (ok) {
      console.log(`  ✓ id=${data?.id} status=${data?.status}`);
    } else {
      const code = data?.error?.code;
      const msg = data?.error?.message ?? JSON.stringify(data);
      if (code === 'TEMPLATE_NAME_EXISTS' || msg?.includes('already exists')) {
        console.log(`  - already exists, skipping`);
      } else {
        console.log(`  ✗ ${msg}`);
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone. Wait a few minutes for Meta to review (text-only templates approve fast).');
  console.log('Check status: https://business.facebook.com/wa/manage/message-templates (Neram Classes WABA).');
  console.log('\nLater, to add video headers back: Meta UI → edit each template → upload video → resubmit.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
