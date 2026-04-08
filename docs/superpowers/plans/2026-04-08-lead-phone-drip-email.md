# Lead Phone-Verification Drip Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a 5-email drip sequence from info@neramclasses.com to leads who registered via Google but never completed phone verification, automatically stopping when they verify, unsubscribe, or are contacted by the team.

**Architecture:** Extend the existing `auto_messages` pg_cron infrastructure (already in production) with 5 new `phone_drip_1..5` message types on the `email` channel. A `schedulePhoneDrip()` function inserts all 5 rows at registration; the existing cron processor at `/api/cron/auto-first-touch` is extended to handle the new types with stop-condition checks. Unsubscribe uses a signed HMAC token resolved in apps/app.

**Tech Stack:** Supabase (existing), Resend (existing), Node.js crypto (built-in, no new deps), Next.js App Router (existing), TypeScript

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260408_email_opt_out.sql` | CREATE — adds email_opt_out columns to users |
| `packages/database/src/types/index.ts` | MODIFY — extend User interface + AutoMessageType |
| `packages/database/src/utils/unsubscribe-token.ts` | CREATE — HMAC sign/verify for unsubscribe tokens |
| `packages/database/src/services/email.ts` | MODIFY — add sendPhoneDripEmail() with 5 inline templates |
| `packages/database/src/queries/auto-messages.ts` | MODIFY — add schedulePhoneDrip() + cancelPendingPhoneDrip() |
| `packages/database/src/index.ts` | MODIFY — export new functions |
| `apps/app/src/app/api/auth/register-user/route.ts` | MODIFY — call schedulePhoneDrip after new user creation |
| `apps/admin/src/app/api/cron/auto-first-touch/route.ts` | MODIFY — handle phone_drip_* in email branch |
| `apps/app/src/app/api/unsubscribe/route.ts` | CREATE — verify token, set opt-out, cancel rows |
| `apps/app/src/app/unsubscribed/page.tsx` | CREATE — confirmation page |
| `apps/admin/src/app/api/auto-first-touch/phone-drip-backfill/route.ts` | CREATE — one-time backfill for 42 existing leads |
| `.env.example` | MODIFY — add UNSUBSCRIBE_JWT_SECRET |

---

## Task 1: Database Migration — Add email_opt_out to users

**Files:**
- Create: `supabase/migrations/20260408_email_opt_out.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260408_email_opt_out.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_opt_out
  ON users (email_opt_out)
  WHERE email_opt_out = TRUE;

COMMENT ON COLUMN users.email_opt_out IS 'TRUE when user has unsubscribed from marketing/drip emails';
COMMENT ON COLUMN users.email_opt_out_at IS 'Timestamp when the user unsubscribed';
```

- [ ] **Step 2: Apply to staging**

Use MCP tool `mcp__supabase-staging__apply_migration` with:
- name: `email_opt_out`
- query: (paste the SQL above)

- [ ] **Step 3: Verify on staging**

Use `mcp__supabase-staging__execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('email_opt_out', 'email_opt_out_at');
```
Expected: 2 rows returned.

- [ ] **Step 4: Apply to production**

Use MCP tool `mcp__supabase-prod__apply_migration` with the same SQL.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260408_email_opt_out.sql
git commit -m "feat(db): add email_opt_out columns to users table"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `packages/database/src/types/index.ts`

- [ ] **Step 1: Extend AutoMessageType union**

Find the line (around line 6794):
```typescript
export type AutoMessageType = 'first_touch' | 'follow_up_3d' | 'follow_up_7d' | 'nurture';
```

Replace with:
```typescript
export type AutoMessageType =
  | 'first_touch'
  | 'follow_up_3d'
  | 'follow_up_7d'
  | 'nurture'
  | 'phone_drip_1'
  | 'phone_drip_2'
  | 'phone_drip_3'
  | 'phone_drip_4'
  | 'phone_drip_5';
```

- [ ] **Step 2: Add email_opt_out fields to User interface**

Find the `User` interface (around line 93) and add the two new fields after `phone_verified`:
```typescript
  phone_verified: boolean;
  email_opt_out: boolean;
  email_opt_out_at: string | null;
  preferred_language: string;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm type-check
```
Expected: No errors in packages/database.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(types): add phone_drip message types and email_opt_out to User"
```

---

## Task 3: Unsubscribe Token Utility

**Files:**
- Create: `packages/database/src/utils/unsubscribe-token.ts`

No external dependencies — uses Node.js built-in `crypto`.

- [ ] **Step 1: Create the utility file**

```typescript
// packages/database/src/utils/unsubscribe-token.ts

import { createHmac } from 'crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_JWT_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * Create a signed unsubscribe token for a user.
 * Token is valid for 30 days.
 */
export function createUnsubscribeToken(userId: string): string {
  const exp = Date.now() + THIRTY_DAYS_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  const data = JSON.stringify({ userId, exp, sig });
  return Buffer.from(data).toString('base64url');
}

/**
 * Verify an unsubscribe token.
 * Returns the userId if valid, null if invalid or expired.
 */
export function verifyUnsubscribeToken(token: string): { userId: string } | null {
  try {
    const data = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const { userId, exp, sig } = data;

    if (!userId || !exp || !sig) return null;
    if (Date.now() > exp) return null;

    const payload = `${userId}.${exp}`;
    const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');

    if (sig !== expected) return null;
    return { userId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Export from packages/database index**

Find `packages/database/src/index.ts` and add near the other utility exports:
```typescript
export { createUnsubscribeToken, verifyUnsubscribeToken } from './utils/unsubscribe-token';
```

- [ ] **Step 3: Add env var to .env.example**

Find `.env.example` and add:
```
UNSUBSCRIBE_JWT_SECRET=your-random-32-char-secret-here
```

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/utils/unsubscribe-token.ts packages/database/src/index.ts .env.example
git commit -m "feat(database): add HMAC unsubscribe token utility"
```

---

## Task 4: Add sendPhoneDripEmail to Email Service

**Files:**
- Modify: `packages/database/src/services/email.ts`

- [ ] **Step 1: Add sendPhoneDripEmail function**

Add this function before the `export default` at the bottom of `packages/database/src/services/email.ts`:

```typescript
/**
 * Send a phone-verification drip email.
 * 5 templates: phone_drip_1 (30min) through phone_drip_5 (Day 14).
 * Sent from info@neramclasses.com with an unsubscribe link.
 */
export async function sendPhoneDripEmail(
  email: string,
  messageType: string,
  data: { userName: string; unsubscribeUrl: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const name = data.userName || 'there';
  const unsubUrl = data.unsubscribeUrl;
  const appUrl = 'https://app.neramclasses.com';

  const unsubscribeFooter = `
    <div style="text-align:center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 30px;">
      <p>Neram Classes, Chennai, Tamil Nadu</p>
      <p>neramclasses.com</p>
      <p><a href="${unsubUrl}" style="color: #999;">Unsubscribe from these emails</a></p>
    </div>
  `;

  const wrapHtml = (content: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
        .header { background: #1565C0; color: white; padding: 24px 30px; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #1565C0; color: white !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        p { margin: 0 0 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Neram Classes</h1></div>
        <div class="content">${content}</div>
        ${unsubscribeFooter}
      </div>
    </body>
    </html>
  `;

  const templates: Record<string, { subject: string; html: string }> = {
    phone_drip_1: {
      subject: `Hi ${name}, your Neram Classes registration is not complete`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>This is a quick note from the Neram Classes team.</p>
        <p>We noticed your account registration was not fully completed, specifically the phone verification step. This is usually a quick process, and we can help if you faced any difficulty.</p>
        <p>If you are still interested in NATA 2026 or JEE Paper 2 B.Arch preparation, feel free to reach out and we will get you sorted.</p>
        <a href="${appUrl}" class="button">Complete Registration</a>
        <p>You can also reach us directly:<br>
        +91-91761-37043 (Call or WhatsApp)</p>
        <p>No action needed if you have already moved on. We just wanted to make sure you did not face any barriers on our end.</p>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_2: {
      subject: `${name}, quick question`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Just checking in. Phone verification on Neram Classes takes about 30 seconds. Once done, you can explore our NATA and JEE B.Arch prep tools.</p>
        <p>If you hit any trouble yesterday, reply to this email and we will help you through it.</p>
        <a href="${appUrl}" class="button">Verify Phone Now</a>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_3: {
      subject: `NATA 2026 students are already preparing`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Students who started their NATA preparation early consistently score higher. Our 2025 batch had students crack NATA with scores above 120 within 3 months of joining.</p>
        <p>Your account is set up. The only thing left is phone verification, which takes under a minute.</p>
        <a href="${appUrl}" class="button">Complete Setup</a>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_4: {
      subject: `New batch is filling up, ${name}`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>Our upcoming NATA 2026 and JEE Paper 2 B.Arch batch is accepting registrations now. Seats are limited.</p>
        <p>To check eligibility and apply, you need to first complete phone verification on your account.</p>
        <a href="${appUrl}" class="button">Secure Your Spot</a>
        <p>Call or WhatsApp: +91-91761-37043</p>
        <p>Regards,<br>Neram Classes Team</p>
      `),
    },
    phone_drip_5: {
      subject: `Last message from us, ${name}`,
      html: wrapHtml(`
        <p>Hi ${name},</p>
        <p>We will not keep following up after this. If NATA or JEE B.Arch preparation is not on your radar right now, that is completely fine.</p>
        <p>When you are ready, we are at neramclasses.com or +91-91761-37043.</p>
        <p>Wishing you all the best,<br>Neram Classes Team</p>
      `),
    },
  };

  const template = templates[messageType];
  if (!template) {
    return { success: false, error: `Unknown phone drip template: ${messageType}` };
  }

  const result = await sendEmail({
    from: 'Neram Classes <info@neramclasses.com>',
    to: email,
    subject: template.subject,
    html: template.html,
    replyTo: 'info@neramclasses.com',
  });

  return { ...result, messageId: undefined };
}
```

- [ ] **Step 2: Add to export default at the bottom of email.ts**

Find the existing `export default` block and add `sendPhoneDripEmail`:
```typescript
export default {
  sendEmail,
  sendTemplateEmail,
  notifyAdmin,
  sendFirstTouchEmail,
  sendPhoneDripEmail,
};
```

- [ ] **Step 3: Export from packages/database index**

In `packages/database/src/index.ts`, add `sendPhoneDripEmail` to the email service exports:
```typescript
export { sendPhoneDripEmail } from './services/email';
```
(Or find where `sendFirstTouchEmail` is exported and add `sendPhoneDripEmail` alongside it.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/services/email.ts packages/database/src/index.ts
git commit -m "feat(email): add sendPhoneDripEmail with 5 drip templates"
```

---

## Task 5: Add schedulePhoneDrip and cancelPendingPhoneDrip to auto-messages queries

**Files:**
- Modify: `packages/database/src/queries/auto-messages.ts`

- [ ] **Step 1: Add schedulePhoneDrip function**

Add after the `getLeadsWithoutFirstTouch` function at the bottom of `packages/database/src/queries/auto-messages.ts`:

```typescript
/**
 * Schedule the 5-email phone verification drip sequence for a new lead.
 * Called after user registration when phone_verified = false.
 * Uses ON CONFLICT DO NOTHING — safe to call multiple times.
 */
export async function schedulePhoneDrip(
  userId: string,
  meta: { userName: string | null; email: string | null },
  client?: TypedSupabaseClient,
  anchorMs?: number  // optional: override anchor time (default: now). Use Date.now() - 25*60*1000 for backfill to send Email 1 in 5 min.
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const drip: Array<{ type: string; delayMinutes: number }> = [
    { type: 'phone_drip_1', delayMinutes: 30 },
    { type: 'phone_drip_2', delayMinutes: 60 * 24 * 2 },
    { type: 'phone_drip_3', delayMinutes: 60 * 24 * 4 },
    { type: 'phone_drip_4', delayMinutes: 60 * 24 * 7 },
    { type: 'phone_drip_5', delayMinutes: 60 * 24 * 14 },
  ];

  const now = anchorMs ?? Date.now();

  for (const step of drip) {
    const sendAfter = new Date(now + step.delayMinutes * 60 * 1000).toISOString();
    try {
      await createAutoMessage({
        user_id: userId,
        message_type: step.type as any,
        channel: 'email',
        template_name: step.type,
        send_after: sendAfter,
        metadata: {
          user_name: meta.userName,
          email: meta.email,
          source: 'registration',
        },
      }, supabase);
    } catch (err: any) {
      // Skip duplicate (unique constraint on user_id, message_type, channel)
      if (err?.code !== '23505') {
        console.error(`Failed to schedule ${step.type} for user ${userId}:`, err);
      }
    }
  }
}

/**
 * Cancel all pending phone_drip_* messages for a user.
 * Called when user unsubscribes.
 */
export async function cancelPendingPhoneDrip(
  userId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const { error } = await supabase
    .from('auto_messages')
    .update({ delivery_status: 'failed', error_message: 'unsubscribed' })
    .eq('user_id', userId)
    .eq('delivery_status', 'pending')
    .like('message_type', 'phone_drip_%');

  if (error) throw error;
}
```

- [ ] **Step 2: Export from packages/database index**

In `packages/database/src/index.ts`, add alongside the other auto-messages exports:
```typescript
export { schedulePhoneDrip, cancelPendingPhoneDrip } from './queries/auto-messages';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/queries/auto-messages.ts packages/database/src/index.ts
git commit -m "feat(database): add schedulePhoneDrip and cancelPendingPhoneDrip functions"
```

---

## Task 6: Hook schedulePhoneDrip into User Registration

**Files:**
- Modify: `apps/app/src/app/api/auth/register-user/route.ts`

- [ ] **Step 1: Read the current register-user route**

Read the file to find where new user creation happens and where `createAutoMessage` is currently called (around the `isNewUser` check).

- [ ] **Step 2: Import schedulePhoneDrip**

Find the existing import line:
```typescript
import { getOrCreateUserFromFirebase, updateUser, getUserByFirebaseUid, getSupabaseAdminClient, computeAccountTier, createAutoMessage, insertFunnelEvent, linkAnonymousEvents } from '@neram/database';
```

Add `schedulePhoneDrip` to the import:
```typescript
import { getOrCreateUserFromFirebase, updateUser, getUserByFirebaseUid, getSupabaseAdminClient, computeAccountTier, createAutoMessage, schedulePhoneDrip, insertFunnelEvent, linkAnonymousEvents } from '@neram/database';
```

- [ ] **Step 3: Call schedulePhoneDrip after new user creation**

Find the section after `getOrCreateUserFromFirebase` where `isNewUser` is checked (or where the first_touch `createAutoMessage` is called). Add the `schedulePhoneDrip` call:

```typescript
// After user is confirmed as new and user.user_type === 'lead' and !user.phone_verified
if (isNewUser && user.user_type === 'lead' && !user.phone_verified) {
  // schedulePhoneDrip is async but non-blocking — fire and forget, don't fail registration
  schedulePhoneDrip(user.id, {
    userName: user.name,
    email: user.email,
  }, adminClient).catch((err) => {
    console.error('schedulePhoneDrip failed (non-blocking):', err);
  });
}
```

Note: The exact location depends on where `isNewUser` is set. Read the file in Step 1 to find the right spot. It should be after the user row exists in the DB.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/app/api/auth/register-user/route.ts
git commit -m "feat(app): schedule phone drip emails on new lead registration"
```

---

## Task 7: Extend Cron Processor for phone_drip Emails

**Files:**
- Modify: `apps/admin/src/app/api/cron/auto-first-touch/route.ts`

The current email branch (lines 111-133) only handles `first_touch`. We extend it for `phone_drip_*`.

- [ ] **Step 1: Import new functions**

Find the existing import:
```typescript
import {
  getSupabaseAdminClient,
  getPendingAutoMessages,
  getFailedAutoMessages,
  updateAutoMessageResult,
  sendFirstTouchQuickQuestion,
  sendFirstTouchResultsVideo,
  sendFirstTouchEnglishIntro,
  sendFirstTouchEmail,
  isWhatsAppConfigured,
  dispatchNotification,
} from '@neram/database';
```

Add `sendPhoneDripEmail` and `createUnsubscribeToken`:
```typescript
import {
  getSupabaseAdminClient,
  getPendingAutoMessages,
  getFailedAutoMessages,
  updateAutoMessageResult,
  sendFirstTouchQuickQuestion,
  sendFirstTouchResultsVideo,
  sendFirstTouchEnglishIntro,
  sendFirstTouchEmail,
  sendPhoneDripEmail,
  createUnsubscribeToken,
  isWhatsAppConfigured,
  dispatchNotification,
} from '@neram/database';
```

- [ ] **Step 2: Replace the email channel block**

Find the existing email channel block (lines 111-133):
```typescript
        } else {
          // Email channel
          const email = (msg.metadata as any)?.email || msg.user_email;

          if (!email) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'No email address available',
            }, supabase);
            failed++;
            continue;
          }

          if (!settings.email_enabled) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'Email first-touch disabled',
            }, supabase);
            failed++;
            continue;
          }

          result = await sendFirstTouchEmail(email, { userName });
        }
```

Replace with:
```typescript
        } else {
          // Email channel
          const email = (msg.metadata as any)?.email || msg.user_email;

          if (!email) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'No email address available',
            }, supabase);
            failed++;
            continue;
          }

          if (!settings.email_enabled) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'Email first-touch disabled',
            }, supabase);
            failed++;
            continue;
          }

          if (msg.message_type.startsWith('phone_drip_')) {
            // Check stop conditions for drip emails
            const { data: userRow } = await (supabase as any)
              .from('users')
              .select('phone_verified, email_opt_out')
              .eq('id', msg.user_id)
              .single();

            if (userRow?.phone_verified) {
              await updateAutoMessageResult(msg.id, {
                success: false,
                error: 'phone_verified: drip cancelled',
              }, supabase);
              // Also mark remaining drip rows as failed
              await (supabase as any)
                .from('auto_messages')
                .update({ delivery_status: 'failed', error_message: 'phone_verified' })
                .eq('user_id', msg.user_id)
                .eq('delivery_status', 'pending')
                .like('message_type', 'phone_drip_%');
              continue;
            }

            if (userRow?.email_opt_out) {
              await updateAutoMessageResult(msg.id, {
                success: false,
                error: 'email_opt_out: drip cancelled',
              }, supabase);
              continue;
            }

            // Check contacted_status
            const { data: leadRow } = await (supabase as any)
              .from('lead_profiles')
              .select('contacted_status')
              .eq('user_id', msg.user_id)
              .maybeSingle();

            const STOP_STATUSES = ['talked', 'dead_lead', 'irrelevant'];
            if (leadRow && STOP_STATUSES.includes(leadRow.contacted_status)) {
              await updateAutoMessageResult(msg.id, {
                success: false,
                error: `contacted_status=${leadRow.contacted_status}: drip cancelled`,
              }, supabase);
              continue;
            }

            const unsubscribeUrl = `https://app.neramclasses.com/unsubscribe?token=${createUnsubscribeToken(msg.user_id)}`;
            result = await sendPhoneDripEmail(email, msg.message_type, {
              userName,
              unsubscribeUrl,
            });
          } else {
            result = await sendFirstTouchEmail(email, { userName });
          }
        }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/cron/auto-first-touch/route.ts
git commit -m "feat(cron): handle phone_drip_* emails with stop conditions"
```

---

## Task 8: Unsubscribe API Route in apps/app

**Files:**
- Create: `apps/app/src/app/api/unsubscribe/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/app/src/app/api/unsubscribe/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken, getSupabaseAdminClient, cancelPendingPhoneDrip } from '@neram/database';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/unsubscribed?error=missing_token', req.url));
  }

  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return NextResponse.redirect(new URL('/unsubscribed?error=invalid_token', req.url));
  }

  try {
    const supabase = getSupabaseAdminClient();

    await supabase
      .from('users')
      .update({
        email_opt_out: true,
        email_opt_out_at: new Date().toISOString(),
      })
      .eq('id', payload.userId);

    await cancelPendingPhoneDrip(payload.userId, supabase);

    return NextResponse.redirect(new URL('/unsubscribed', req.url));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return NextResponse.redirect(new URL('/unsubscribed?error=server_error', req.url));
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/api/unsubscribe/route.ts
git commit -m "feat(app): add unsubscribe API route"
```

---

## Task 9: Unsubscribed Confirmation Page

**Files:**
- Create: `apps/app/src/app/unsubscribed/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// apps/app/src/app/unsubscribed/page.tsx

export default function UnsubscribedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      background: '#f5f5f5',
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: '#fff',
        borderRadius: '12px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10003;</div>
        <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#333', margin: '0 0 12px' }}>
          You have been unsubscribed
        </h1>
        <p style={{ color: '#666', fontSize: '15px', lineHeight: '1.6', margin: '0 0 28px' }}>
          We respect your inbox. You will not receive further emails from Neram Classes about registration reminders.
        </p>
        <p style={{ color: '#999', fontSize: '13px', margin: '0 0 24px' }}>
          If you change your mind, you can always visit us at neramclasses.com.
        </p>
        <a
          href="https://app.neramclasses.com"
          style={{
            display: 'inline-block',
            background: '#1565C0',
            color: '#fff',
            padding: '12px 28px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: '500',
          }}
        >
          Go to Neram Classes
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/app/unsubscribed/page.tsx
git commit -m "feat(app): add unsubscribed confirmation page"
```

---

## Task 10: Phone Drip Backfill Endpoint (for existing 42 leads)

**Files:**
- Create: `apps/admin/src/app/api/auto-first-touch/phone-drip-backfill/route.ts`

- [ ] **Step 1: Create the backfill route**

```typescript
// apps/admin/src/app/api/auto-first-touch/phone-drip-backfill/route.ts
// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/auto-first-touch/phone-drip-backfill
 *
 * One-time backfill: schedules phone drip emails for all existing leads who:
 * - user_type = 'lead'
 * - firebase_uid IS NOT NULL (signed in via app)
 * - phone_verified = false
 * - email_opt_out = false
 * - email IS NOT NULL
 * - No existing phone_drip_1 row in auto_messages
 *
 * Safe to call multiple times (createAutoMessage uses ON CONFLICT DO NOTHING).
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, schedulePhoneDrip } from '@neram/database';

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();

    // Get leads who need drip
    const { data: leads, error: leadsError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('user_type', 'lead')
      .eq('phone_verified', false)
      .eq('email_opt_out', false)
      .not('firebase_uid', 'is', null)
      .not('email', 'is', null);

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No eligible leads found', scheduled: 0 });
    }

    // Filter out leads that already have phone_drip_1 scheduled
    const { data: existing } = await supabase
      .from('auto_messages')
      .select('user_id')
      .eq('message_type', 'phone_drip_1')
      .eq('channel', 'email');

    const existingIds = new Set((existing ?? []).map((r: any) => r.user_id));
    const eligibleLeads = leads.filter((l: any) => !existingIds.has(l.id));

    if (eligibleLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All eligible leads already have drip scheduled',
        scheduled: 0,
        total_leads: leads.length,
      });
    }

    let scheduled = 0;
    const errors: string[] = [];

    for (const lead of eligibleLeads) {
      try {
        await schedulePhoneDrip(lead.id, {
          userName: lead.name,
          email: lead.email,
        }, supabase);
        scheduled++;
      } catch (err: any) {
        errors.push(`${lead.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      total_eligible: eligibleLeads.length,
      scheduled,
      errors: errors.length > 0 ? errors : undefined,
      note: 'Email 1 sends in 5 minutes for all leads. Subsequent emails follow the drip schedule.',
    });

  } catch (error: any) {
    console.error('Phone drip backfill error:', error);
    return NextResponse.json(
      { error: 'Failed to backfill phone drip' },
      { status: 500 }
    );
  }
}
```

Wait — `schedulePhoneDrip` sets Email 1 to `now() + 30 minutes`. For the backfill, we want Email 1 to go out sooner (5 minutes). Update `schedulePhoneDrip` to accept an optional `firstEmailDelayMinutes` parameter, or for the backfill, directly call `createAutoMessage` with adjusted timing.

Actually, simpler: modify `schedulePhoneDrip` in Task 5 to accept an optional `anchorMs` parameter:

```typescript
export async function schedulePhoneDrip(
  userId: string,
  meta: { userName: string | null; email: string | null },
  client?: TypedSupabaseClient,
  anchorMs?: number  // optional: override start time (default: now)
): Promise<void> {
  const now = anchorMs ?? Date.now();
  // rest unchanged
```

Then in the backfill endpoint use:
```typescript
await schedulePhoneDrip(lead.id, { userName: lead.name, email: lead.email }, supabase, Date.now() - (25 * 60 * 1000));
// Anchor 25 min ago so Email 1 sends in 5 min (30 - 25 = 5 min from now)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 3: Add UNSUBSCRIBE_JWT_SECRET to env files**

Generate a random secret (run once in terminal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output value to:
- `apps/app/.env.local` — `UNSUBSCRIBE_JWT_SECRET=<generated>`
- `apps/admin/.env.local` — `UNSUBSCRIBE_JWT_SECRET=<same value>`

Add to Vercel for both apps (run from inside each app directory):
```bash
# For apps/app
cd apps/app && echo "<value>" | vercel env add UNSUBSCRIBE_JWT_SECRET production
cd apps/app && echo "<value>" | vercel env add UNSUBSCRIBE_JWT_SECRET preview

# For apps/admin
cd apps/admin && echo "<value>" | vercel env add UNSUBSCRIBE_JWT_SECRET production
cd apps/admin && echo "<value>" | vercel env add UNSUBSCRIBE_JWT_SECRET preview
```

Both apps must use the **same secret value** (admin signs tokens, app verifies them).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/auto-first-touch/phone-drip-backfill/route.ts
git commit -m "feat(admin): add phone drip backfill endpoint for existing leads"
```

---

## Task 11: Admin CRM Drip Status Badge

**Files:**
- Modify: find the lead detail component in `apps/admin/src/app/(protected)/` (search for the component that shows auto_messages for a user — it calls `/api/crm/users/[id]/auto-messages/`)

- [ ] **Step 1: Find the lead detail component**

```bash
grep -r "auto-messages" apps/admin/src/app --include="*.tsx" -l
```

Open the file that renders auto_messages in the lead detail view.

- [ ] **Step 2: Add drip status computation**

In the component that fetches auto_messages for a user, add this logic after the data loads:

```typescript
// Compute phone drip status from auto_messages array
function getPhoneDripStatus(messages: AutoMessage[]): string {
  const dripMessages = messages.filter(m => m.message_type.startsWith('phone_drip_'));
  if (dripMessages.length === 0) return 'not_enrolled';

  const unsubscribed = dripMessages.some(m => m.error_message === 'unsubscribed');
  if (unsubscribed) return 'unsubscribed';

  const verified = dripMessages.some(m => m.error_message?.includes('phone_verified'));
  if (verified) return 'completed_verified';

  const sentCount = dripMessages.filter(m => m.delivery_status === 'sent').length;
  const pendingCount = dripMessages.filter(m => m.delivery_status === 'pending').length;
  if (pendingCount === 0 && sentCount > 0) return 'completed';
  return `active_${sentCount}_of_5`;
}
```

- [ ] **Step 3: Render the badge**

Add a chip/badge next to the auto_messages section heading:

```tsx
const dripStatus = getPhoneDripStatus(autoMessages);

const dripLabel: Record<string, string> = {
  not_enrolled: 'No drip',
  unsubscribed: 'Unsubscribed',
  completed_verified: 'Verified (stopped)',
  completed: 'Drip complete',
};

const label = dripStatus.startsWith('active_')
  ? `Drip: ${dripStatus.replace('active_', '').replace('_of_5', '')} / 5 sent`
  : dripLabel[dripStatus] ?? dripStatus;

// Render as a small MUI Chip next to the section title:
<Chip label={label} size="small" sx={{ ml: 1 }} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/(protected)/
git commit -m "feat(admin): show phone drip status badge in lead detail view"
```

---

## Task 12: Verification Checklist (Run After All Tasks)

Run these after all tasks complete. Do NOT claim done until each check passes.

- [ ] **Check 1: Staging migration applied**

```sql
-- via mcp__supabase-staging__execute_sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'email_opt_out';
```
Expected: 1 row.

- [ ] **Check 2: TypeScript clean**

```bash
pnpm type-check
```
Expected: 0 errors.

- [ ] **Check 3: Backfill endpoint smoke test**

```bash
curl -X POST https://staging-admin.neramclasses.com/api/auto-first-touch/phone-drip-backfill \
  -H "Content-Type: application/json"
```
Expected: `{ "success": true, "scheduled": N }` where N > 0.

- [ ] **Check 4: auto_messages rows created**

```sql
-- via mcp__supabase-staging__execute_sql
SELECT message_type, COUNT(*)
FROM auto_messages
WHERE message_type LIKE 'phone_drip_%'
GROUP BY message_type
ORDER BY message_type;
```
Expected: 5 rows (phone_drip_1 through phone_drip_5) with equal counts.

- [ ] **Check 5: Cron sends Email 1**

Wait for cron to fire (or trigger manually):
```bash
curl https://staging-admin.neramclasses.com/api/cron/auto-first-touch \
  -H "Authorization: Bearer $CRON_SECRET"
```
Check a test account's inbox for email from `info@neramclasses.com`.

- [ ] **Check 6: Unsubscribe flow works**

Click the unsubscribe link in the test email. Verify:
- Redirected to `/unsubscribed` page
- `users.email_opt_out = true` in DB
- Remaining `phone_drip_*` rows have `delivery_status = 'failed'`

- [ ] **Check 7: Phone verification stops drip**

Complete phone verification on a test account that has pending drip rows. Trigger cron. Verify:
- Cron marks `delivery_status = 'failed'` with `error: 'phone_verified: drip cancelled'`
- No email sent

- [ ] **Check 8: New registration triggers drip**

Register a new test account via Google sign-in on staging app. Check:
```sql
SELECT message_type, send_after, delivery_status
FROM auto_messages
WHERE user_id = '<new_user_id>'
  AND message_type LIKE 'phone_drip_%'
ORDER BY send_after;
```
Expected: 5 rows scheduled at 30min, 2d, 4d, 7d, 14d.

- [ ] **Check 9: Final commit + deploy**

```bash
pnpm deploy:staging
```
Then verify all 4 checks above on the real staging URLs.
