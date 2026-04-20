/**
 * Register a WhatsApp Cloud API phone number on a WABA.
 *
 * Does three things in one run:
 *   1. Lists every phone number attached to the WABA (with their IDs + status)
 *   2. Registers the phone number you specify (or the first non-test number)
 *      with Cloud API, using the PIN you provide
 *   3. Prints exactly which Vercel env vars to update
 *
 * Prerequisite — generate a System User token (one-time, never expires):
 *   1. https://business.facebook.com → Settings → Users → System users
 *   2. Add → name "WhatsApp API" → role Admin → Create
 *   3. Click the user → Add Assets → WhatsApp accounts → tick "Neram Classes"
 *      → permission "Full control / Manage" → Save
 *   4. Click "Generate new token" → app: "Neram Classes Notifications"
 *      → expiration: Never → permissions: tick whatsapp_business_management
 *      AND whatsapp_business_messaging → Generate → COPY THE TOKEN
 *
 * Usage (from project root):
 *   WHATSAPP_ACCESS_TOKEN="EAA..." \
 *   WHATSAPP_WABA_ID="1246354014369613" \
 *   WHATSAPP_REGISTRATION_PIN="638174" \
 *   pnpm tsx scripts/register-whatsapp-number.ts
 *
 * Optional: pass WHATSAPP_PHONE_NUMBER_ID to register a specific number
 *   (otherwise registers the first non-test number found on the WABA).
 *
 * The PIN is YOUR CHOICE (any 6 digits). Write it down — you'll need it
 * if you ever re-register the same number, and Meta will ask for it during
 * two-step verification challenges.
 */

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_WABA_ID;
const PIN = process.env.WHATSAPP_REGISTRATION_PIN;
const TARGET_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // optional override

if (!TOKEN || !WABA || !PIN) {
  console.error('\nMissing required env vars. Set:');
  console.error('  WHATSAPP_ACCESS_TOKEN     (System User token from Business Settings)');
  console.error('  WHATSAPP_WABA_ID          (e.g. 1246354014369613)');
  console.error('  WHATSAPP_REGISTRATION_PIN (any 6 digits you choose)');
  console.error('\nOptional:');
  console.error('  WHATSAPP_PHONE_NUMBER_ID  (if multiple numbers on WABA, pick one)');
  process.exit(1);
}

if (!/^\d{6}$/.test(PIN)) {
  console.error('PIN must be exactly 6 digits');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v21.0';

interface PhoneNumber {
  id: string;
  verified_name?: string;
  display_phone_number?: string;
  code_verification_status?: string;
  quality_rating?: string;
  status?: string;
}

async function main() {
  console.log('\n=== WhatsApp Cloud API Phone Number Registration ===\n');
  console.log(`WABA: ${WABA}`);
  console.log(`PIN:  ${PIN} (write this down)\n`);

  // 1. List numbers
  console.log(`Step 1: Listing phone numbers on WABA ${WABA}...`);
  const listRes = await fetch(`${API}/${WABA}/phone_numbers`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const listData: any = await listRes.json();

  if (!listRes.ok) {
    console.error('\n✗ List failed. Response:');
    console.error(JSON.stringify(listData, null, 2));
    if (listData?.error?.code === 100) {
      console.error('\nLikely cause: the access token does not have access to this WABA.');
      console.error('Make sure the System User has the WABA assigned with Full control.');
    }
    process.exit(1);
  }

  const numbers: PhoneNumber[] = listData.data ?? [];
  console.log(`Found ${numbers.length} phone number(s):\n`);
  for (const n of numbers) {
    console.log(`  - ${n.display_phone_number ?? '(unknown)'}  id=${n.id}  status=${n.code_verification_status ?? 'unknown'}  quality=${n.quality_rating ?? 'n/a'}`);
  }

  if (numbers.length === 0) {
    console.error('\n✗ No phone numbers on this WABA. Add one in WhatsApp Manager first.');
    process.exit(1);
  }

  // 2. Pick target
  let target: PhoneNumber;
  if (TARGET_PHONE_ID) {
    const found = numbers.find(n => n.id === TARGET_PHONE_ID);
    if (!found) {
      console.error(`\n✗ WHATSAPP_PHONE_NUMBER_ID=${TARGET_PHONE_ID} not found in the list above`);
      process.exit(1);
    }
    target = found;
  } else if (numbers.length === 1) {
    target = numbers[0];
  } else {
    console.error('\n✗ Multiple phone numbers on the WABA. Set WHATSAPP_PHONE_NUMBER_ID to the one you want to register (use one of the IDs listed above).');
    process.exit(1);
  }

  console.log(`\nStep 2: Registering ${target.display_phone_number} (id=${target.id})...`);

  // 3. Register
  const regRes = await fetch(`${API}/${target.id}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: PIN }),
  });
  const regData: any = await regRes.json();

  console.log('\nResponse:');
  console.log(JSON.stringify(regData, null, 2));

  if (regRes.ok && regData?.success === true) {
    console.log('\n✓ Registered successfully!\n');
    console.log('=== Next steps ===\n');
    console.log('1. Update Vercel env vars in EACH app (admin, app, marketing, nexus):');
    console.log(`     WHATSAPP_PHONE_NUMBER_ID=${target.id}`);
    console.log(`     WHATSAPP_ACCESS_TOKEN=<your System User token>`);
    console.log('   Use:  vercel env add WHATSAPP_PHONE_NUMBER_ID production');
    console.log('         vercel env add WHATSAPP_PHONE_NUMBER_ID preview');
    console.log('         (and same for WHATSAPP_ACCESS_TOKEN)\n');
    console.log('2. Recreate templates on this WABA in WhatsApp Manager → Manage templates:');
    console.log('     - first_touch_quick_question');
    console.log('     - first_touch_results_video');
    console.log('     - first_touch_english_intro\n');
    console.log('3. After templates are approved, redeploy and run:');
    console.log('     pnpm tsx scripts/retry-failed-whatsapp.ts --execute');
    console.log('   to resend the 4 stranded leads (Padala + 3 others).');
  } else {
    console.error('\n✗ Registration failed.');
    if (regData?.error?.code === 133010) {
      console.error('Number is already registered. You may need to deregister first or just use the existing setup.');
    } else if (regData?.error?.code === 133008) {
      console.error('Two-step verification PIN mismatch. The number was previously registered with a different PIN.');
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
