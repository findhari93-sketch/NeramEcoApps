/**
 * Submit the 8 Demo Class v2 WhatsApp templates to Meta for approval.
 *
 * Reads the bodies straight from DEMO_WA_TEMPLATES in
 * packages/database/src/services/whatsapp.ts, so what Meta approves is exactly
 * what the admin cron sends. Credentials come from apps/admin/.env.local
 * (WHATSAPP_ACCESS_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID). Needs Node 22.6+ (it
 * loads the .ts file with Node's built-in type stripping).
 *
 *   node scripts/submit-demo-whatsapp-templates.mjs          # check only, sends nothing
 *   node scripts/submit-demo-whatsapp-templates.mjs --go     # submit to Meta
 *   node scripts/submit-demo-whatsapp-templates.mjs --go --only=apply_draft_demo   # just one
 *
 * Also carries APPLY_WA_TEMPLATES (the unfinished-application demo nudge),
 * submitted as MARKETING because it offers something rather than reporting.
 *
 * Re-running is safe: a template that already exists comes back as an error
 * for that name and the rest continue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const go = process.argv.includes('--go');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) || null;

const { DEMO_WA_TEMPLATES, APPLY_WA_TEMPLATES } = await import(
  pathToFileURL(path.join(root, 'packages/database/src/services/whatsapp.ts')).href
);

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, 'apps/admin/.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')];
    }),
);
const token = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || env.WHATSAPP_BUSINESS_ACCOUNT_ID;
if (go && (!token || !waba)) {
  console.error('Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID in apps/admin/.env.local first.');
  process.exit(1);
}

// Sample values Meta reviewers see. Realistic, no real student data.
const EXAMPLE = {
  recipientName: 'Priya',
  studentName: 'Priya',
  ref: 'DEMO-4K7Q',
  preference: 'Tue, 14 Oct, Evening (6 PM to 8:30 PM)',
  when: 'Tue, 14 Oct at 6:30 PM',
  time: '6:30 PM',
  hostName: 'Hari',
  reason: 'the teacher has an exam duty that evening',
  token: 'k3J9xQ2mLp7Rt4Vw8Yz1Ab5C',
  surveyUrl: 'https://neramclasses.com/survey/demo',
};
const BUTTON_LABEL = {
  confirmed: 'Open my demo',
  rescheduled: 'Open my demo',
  reminder_day: 'Join the demo',
  reminder_soon: 'Join the demo',
};

const TEMPLATES = [
  ...Object.entries(DEMO_WA_TEMPLATES).map(([kind, t]) => [kind, t, 'UTILITY']),
  ...Object.entries(APPLY_WA_TEMPLATES).map(([kind, t]) => [kind, { ...t, button: false }, 'MARKETING']),
].filter(([, t]) => !only || t.name === only);
if (only && !TEMPLATES.length) throw new Error(`No template named ${only}`);

let failed = 0;
for (const [kind, t, category] of TEMPLATES) {
  const vars = (t.body.match(/\{\{\d+\}\}/g) || []).length;
  if (vars !== t.params.length) throw new Error(`${kind}: body has ${vars} variables but ${t.params.length} params`);
  // Meta rejects a body that starts or ends with a variable (trailing punctuation does not count as text).
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}[\s.,!?:;)]*$/.test(t.body)) throw new Error(`${kind}: body starts or ends with a variable`);

  const components = [{ type: 'BODY', text: t.body, example: { body_text: [t.params.map((p) => EXAMPLE[p])] } }];
  if (t.button) {
    components.push({
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: BUTTON_LABEL[kind],
          url: 'https://neramclasses.com/d/{{1}}',
          example: [`https://neramclasses.com/d/${EXAMPLE.token}`],
        },
      ],
    });
  }

  if (!go) {
    console.log(`ok  ${t.name} (${category}, ${vars} variables${t.button ? `, button "${BUTTON_LABEL[kind]}"` : ''})`);
    continue;
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: t.name, language: 'en', category, components }),
  });
  const j = await res.json();
  if (j.error) {
    failed++;
    console.log(`ERR ${t.name}: ${j.error.error_user_msg || j.error.message}`);
  } else {
    console.log(`${j.status.padEnd(8)} ${t.name} (${j.category})`);
  }
}

if (!go) console.log('\nChecked only. Run again with --go to submit to Meta.');
else console.log(`\nDone${failed ? `, ${failed} failed` : ''}. Status: https://business.facebook.com/wa/manage/message-templates`);
