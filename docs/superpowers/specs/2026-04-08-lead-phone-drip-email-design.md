# Lead Phone-Verification Drip Email System

**Date:** 2026-04-08
**Status:** Approved

---

## Context

42 leads have completed Google sign-in on app.neramclasses.com but did not complete phone verification. Phone verification is required to submit an application. These users showed intent (they visited, signed up) but dropped off at the phone step, possibly due to friction, distraction, or uncertainty.

Goal: Re-engage these leads via a 5-email drip sequence sent from `info@neramclasses.com`, nudging them to return and complete phone verification. The sequence stops automatically when they verify, unsubscribe, or when admin marks them as contacted in CRM.

This is an ongoing system: all future leads who drop off at the phone step are automatically enrolled in the same drip.

---

## Architecture

### Approach: Extend existing `auto_messages` + pg_cron

The codebase already has:
- `auto_messages` table with `message_type`, `channel`, `send_after`, `delivery_status`
- pg_cron + pg_net scheduling (enabled in `20260501_auto_first_touch.sql`)
- An HTTP processor endpoint that picks up due rows and dispatches them
- Resend email service fully integrated in `packages/database/src/services/email.ts`
- `email_templates` table with multilingual JSONB support
- Admin CRM showing auto_messages per user at `/api/crm/users/[id]/auto-messages/`

We extend this infrastructure to handle `channel = 'email'` for the new drip types.

---

## Database Changes

### Migration 1: Add email opt-out to users

```sql
ALTER TABLE users
  ADD COLUMN email_opt_out BOOLEAN DEFAULT FALSE,
  ADD COLUMN email_opt_out_at TIMESTAMPTZ;

CREATE INDEX idx_users_email_opt_out ON users (email_opt_out) WHERE email_opt_out = TRUE;
```

### Migration 2: Insert 5 drip email templates

Insert rows into `email_templates` with slugs:
- `lead_drip_phone_verify_1` (30 min)
- `lead_drip_phone_verify_2` (Day 2)
- `lead_drip_phone_verify_3` (Day 4)
- `lead_drip_phone_verify_4` (Day 7)
- `lead_drip_phone_verify_5` (Day 14)

Each template includes:
- Multilingual subject/body_html/body_text (en/ta as JSONB)
- Variables: `{{ name }}`, `{{ app_url }}`, `{{ unsubscribe_url }}`
- Unsubscribe footer in every email (required for compliance)

**Email 1 content (30 min):** Use exact copy provided by user (account completion assistance, WhatsApp contact, no-pressure close).
**Emails 2-5:** Progressively softer tone, social proof on Day 4, urgency on Day 7, low-pressure exit on Day 14.

From address: `Neram Classes <info@neramclasses.com>` (domain already verified in Resend).

---

## Trigger Logic

### New leads (going forward)

File: `packages/database/src/queries/auto-messages.ts`

Add function `schedulePhoneDrip(userId: string)`:

```typescript
// Inserts 5 auto_message rows for the phone drip sequence
// Called after user row is created, when user_type = 'lead' and phone_verified = false
const drip = [
  { type: 'phone_drip_1', delayMinutes: 30 },
  { type: 'phone_drip_2', delayMinutes: 60 * 24 * 2 },
  { type: 'phone_drip_3', delayMinutes: 60 * 24 * 4 },
  { type: 'phone_drip_4', delayMinutes: 60 * 24 * 7 },
  { type: 'phone_drip_5', delayMinutes: 60 * 24 * 14 },
]
```

**Where to call it:** In the app's user creation flow. Find the API route that creates the user row after Firebase sign-in (likely `apps/app/src/app/api/auth/` or a Supabase trigger). Call `schedulePhoneDrip` after insert.

### Existing 42 leads (one-time backfill)

New admin API route: `POST /api/auto-first-touch/phone-drip-backfill/route.ts`

Logic:
1. Query users where `user_type = 'lead'`, `firebase_uid IS NOT NULL`, `phone_verified = false`, `email_opt_out = false`
2. For each, check no existing `phone_drip_*` rows in `auto_messages`
3. Schedule Email 1 at `now() + 5 minutes`, Emails 2-5 spaced from that anchor
4. Stagger inserts 2 min apart (mirrors existing backfill pattern to avoid rate limits)

Mirrors: `apps/admin/src/app/api/auto-first-touch/backfill/route.ts`

---

## Email Processor (Send Logic)

File: `apps/admin/src/app/api/auto-messages/process/route.ts` (or wherever the pg_cron HTTP target lives)

Extend to handle `channel = 'email'`:

```
For each due auto_message row where channel = 'email':
  1. Load user by user_id
  2. Check stop conditions:
     - user.phone_verified = true → mark delivery_status = 'cancelled'
     - user.email_opt_out = true → mark delivery_status = 'cancelled'
     - lead_profiles.contacted_status IN ('talked', 'dead_lead', 'irrelevant') → mark 'cancelled'
  3. If not stopped:
     a. Build unsubscribe_url = signed JWT token URL (30-day expiry)
     b. Load email template by message_type slug
     c. Call sendTemplateEmail(user.email, slug, { name, app_url, unsubscribe_url })
     d. On success: delivery_status = 'sent', store resend_id in external_message_id
     e. On failure: delivery_status = 'failed', increment retry_count, store error_message
```

---

## Unsubscribe Flow

### Unsubscribe URL generation

A JWT signed with `UNSUBSCRIBE_JWT_SECRET` (new env var), encoding `{ userId, purpose: 'email_opt_out' }`, expiring in 30 days.

Format: `https://app.neramclasses.com/unsubscribe?token=<jwt>`

### Unsubscribe handler

New public API route: `apps/app/src/app/api/unsubscribe/route.ts`

```
GET /api/unsubscribe?token=<jwt>
  1. Verify and decode JWT
  2. Set users.email_opt_out = true, email_opt_out_at = now()
  3. Cancel all pending auto_messages for this user (delivery_status = 'cancelled')
  4. Redirect to /unsubscribed page (simple confirmation, no login required)
```

New page: `apps/app/src/app/unsubscribed/page.tsx` — simple "You've been unsubscribed. We respect your inbox." page with a link back to the app.

---

## Admin CRM Display

No new UI for the stop mechanism. Existing behaviour:
- Marking lead as `talked` in CRM sets `contacted_status = 'talked'` which processor checks before sending.

Small addition to lead detail view in admin:
- Query `auto_messages` for `phone_drip_*` rows for the user
- Show a status badge: "Phone drip: 2 of 5 sent" or "Phone drip: stopped (unsubscribed)" or "Phone drip: completed (verified)"
- The existing `/api/crm/users/[id]/auto-messages/` route already returns this data — just render it

---

## Stop Conditions (Summary)

| Condition | What happens |
|-----------|-------------|
| User completes phone verification | All remaining rows marked `cancelled` at process time |
| User clicks unsubscribe link | `email_opt_out = true`, all pending rows cancelled immediately |
| Admin marks `talked` / `dead_lead` / `irrelevant` | Processor skips remaining rows at send time |
| 14 days elapsed, no response | Sequence ends naturally (no more rows) |

---

## New Environment Variable

```
UNSUBSCRIBE_JWT_SECRET=<random 32-char secret>
```

Add to: `.env.example`, `.env.local`, Vercel env for `apps/app` (production + preview).

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_email_opt_out.sql` | Add email_opt_out columns to users |
| `supabase/migrations/YYYYMMDD_phone_drip_templates.sql` | Insert 5 email templates |
| `packages/database/src/types/index.ts` | Add email_opt_out fields to User type |
| `packages/database/src/queries/auto-messages.ts` | Add schedulePhoneDrip() function |
| `apps/admin/src/app/api/auto-messages/process/route.ts` | Add email channel handler |
| `apps/admin/src/app/api/auto-first-touch/phone-drip-backfill/route.ts` | New backfill endpoint |
| `apps/app/src/app/api/unsubscribe/route.ts` | New unsubscribe handler |
| `apps/app/src/app/unsubscribed/page.tsx` | New unsubscribed confirmation page |
| `apps/app/src/app/api/auth/` (user creation) | Call schedulePhoneDrip() after user insert |
| `.env.example` | Add UNSUBSCRIBE_JWT_SECRET |

---

## Verification

1. Run backfill endpoint for existing 42 leads, confirm 5 auto_message rows created per user
2. Trigger processor manually, confirm Email 1 arrives at a test email from `info@neramclasses.com`
3. Click unsubscribe link in email, confirm `email_opt_out = true` in DB, confirm remaining rows cancelled
4. Complete phone verification on a test account, confirm remaining drip rows are cancelled
5. Mark a lead as `talked` in CRM, trigger processor, confirm email is skipped
6. Register a new test account via Google, confirm 5 drip rows auto-scheduled
7. Check admin CRM lead detail — confirm drip status badge shows correctly
