# Google Ads Conversion + Attribution Tracking: Implementation Spec

Repo: Neram Turborepo monorepo (Next.js + Supabase)
Apps in scope: `neramclasses.com` (marketing), `app.neramclasses.com` (app/tools)
Owner: Hari | Spec date: 2026-10-17

This file is written so a developer (or Claude Code) can implement it end to end. Read sections 1 to 3 first, then do tasks T1 to T9 in order. Section 6 lists acceptance criteria.

---

## 1. Account facts (from Google Ads audit, 2026-10-17)

| Item | Value |
|---|---|
| Google tag / Ads conversion ID | `AW-757750634` |
| Sign-up conversion action | "Sign-up (OTP verified)" (renamed from "Sign-up (1)"), label `G5yMCLzC95ocEOq2qekC` |
| Application conversion action | "Application Submitted", label `T2hTCJOWlYUcEOq2qekC` |
| Enhanced conversions (web) | ON, managed through Google tag |
| Enhanced conversions for leads | NOT configured yet (Ads UI task, see section 5) |
| GA4 | 2 properties linked to Ads (confirm which one is the real one, see T8) |
| Campaigns | TN Local NATA 2027 (Manual CPC), Gulf NATA & JEE Paper 2 Online 2027 (Maximize clicks) |

### Bugs found in the current implementation (fix these)

1. **Application Submitted fires on the wrong page.** Its only recorded URL is `app.neramclasses.com/tools/nata/cutoff-calculator`. It is wired to the wrong handler or a shared component. It must fire only after application form page 2 is saved successfully.
2. **Sign-up fires on several pages** (`/apply`, `/demo-class`, `/tools/nata/cutoff-calculator`). This is fine only if it fires after OTP verification **of a new user**. It must not fire on "Send OTP", and must not fire when an existing user logs in again.
3. **The tag fires on Vercel preview deployments** (`neram-marketing-*.vercel.app`, `neram-tools-*.vercel.app`), so test traffic can create fake conversions. The tag must load only on production hostnames.
4. **No attribution is stored.** `gclid`, `gbraid`, `wbraid` and UTMs are not saved with the user, so we cannot tie a fee-paying student back to a campaign or send offline conversions.
5. The legacy "Purchase (Page load thank-you)" action is a URL rule (`URL contains "apply"`). It needs no code. It is handled in the Ads UI (section 5).

---

## 2. Funnel definition (source of truth)

| # | Stage | Fires when | Where | Google Ads action | Value (INR) | GA4 event |
|---|---|---|---|---|---|---|
| 1 | `signed_up` | OTP verified **and** the user record was newly created | browser + DB | Sign-up (OTP verified) | 100 | `sign_up` (method: `phone_otp`) |
| 2 | `application_submitted` | Application form page 2 saved successfully (server returned 2xx) | browser + DB | Application Submitted | 500 | `generate_lead` |
| 3 | `demo_attended` | Counselor/admin marks demo attended | DB only | Demo Attended (offline import, phase 2) | 0 | none |
| 4 | `enrolled` | Fee payment confirmed | DB only | Enrolled (Fee Paid) (offline import, phase 2) | actual fee | none |

Rules:
- Each stage is recorded **once per user** (DB unique constraint + `transaction_id` dedupe in Google Ads).
- Browser conversions fire only **after** the server confirms success, never on button click.

---

## 3. Architecture

```
Ad click (gclid + UTMs via account URL suffix)
   │
   ▼
neramclasses.com landing ──► AttributionCapture writes cookies nr_ft / nr_lt on .neramclasses.com
   │                          (shared with app.neramclasses.com; localStorage would NOT be shared)
   ▼
Sign-up (phone OTP) ──► server verifies OTP ──► reads nr_ft / nr_lt / _gcl_aw cookies ──► upserts user_attribution
   │                                         └► inserts funnel_events(signed_up)
   ▼ (client, after success + isNewUser)
gtag conversion: Sign-up (OTP verified) + user_data.phone_number (enhanced conversions)
   │
   ▼
Application page 2 saved ──► funnel_events(application_submitted) ──► gtag conversion: Application Submitted
   │
   ▼ (later, offline)
demo_attended / enrolled in DB ──► view gads_offline_conversions ──► Google Ads Data Manager (PostgreSQL or Sheets) daily
```

---

## 4. Implementation tasks

### T0. Find and remove the existing implementation

Search the whole monorepo and list every hit before changing anything:

```bash
rg -n "AW-757750634|gtag\(|googletagmanager|send_to|G5yMCLzC95ocEOq2qekC|T2hTCJOWlYUcEOq2qekC|@next/third-parties" --glob '!node_modules'
```

- Remove every existing direct `gtag('event', 'conversion', ...)` call. They are replaced by the helpers in T4.
- Remove duplicate tag loaders. Each app must load the Google tag exactly once, via T2.
- Note in the PR which component was firing "Application Submitted" on the cutoff calculator.

### T1. Shared analytics package

Create `packages/analytics` (or add to the existing shared package if one exists), consumed by both apps.

```
packages/analytics/
  src/
    env.ts            // config + canTrack()
    attribution.ts    // cookie capture (client)
    attribution-server.ts // cookie read + parse (server)
    conversions.ts    // trackSignupVerified, trackApplicationSubmitted
    GoogleTag.tsx     // tag loader
    AttributionCapture.tsx
    index.ts
```

Environment variables (both apps, Vercel Production only):

```
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-757750634
NEXT_PUBLIC_GADS_LABEL_SIGNUP=G5yMCLzC95ocEOq2qekC
NEXT_PUBLIC_GADS_LABEL_APPLICATION=T2hTCJOWlYUcEOq2qekC
NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX        # the correct GA4 measurement ID, see T8
```

`src/env.ts`:

```ts
export const GADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? '';
export const LABEL_SIGNUP = process.env.NEXT_PUBLIC_GADS_LABEL_SIGNUP ?? '';
export const LABEL_APPLICATION = process.env.NEXT_PUBLIC_GADS_LABEL_APPLICATION ?? '';
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? '';

const PROD_HOSTS = ['neramclasses.com', 'www.neramclasses.com', 'app.neramclasses.com'];

/** Build-time gate: Vercel sets NEXT_PUBLIC_VERCEL_ENV automatically. */
export const isProdBuild = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

/** Runtime gate: only real production hostnames. */
export function canTrack(): boolean {
  if (typeof window === 'undefined') return false;
  return isProdBuild && !!GADS_ID && PROD_HOSTS.includes(window.location.hostname);
}
```

### T2. Google tag loader (production only)

`src/GoogleTag.tsx`:

```tsx
'use client';
import Script from 'next/script';
import { GADS_ID, GA4_ID, isProdBuild } from './env';

export function GoogleTag() {
  if (!isProdBuild || !GADS_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        var h = location.hostname;
        if (['neramclasses.com','www.neramclasses.com','app.neramclasses.com'].indexOf(h) !== -1) {
          gtag('consent', 'default', {
            ad_storage: 'granted', ad_user_data: 'granted',
            ad_personalization: 'granted', analytics_storage: 'granted'
          });
          gtag('js', new Date());
          gtag('config', '${GADS_ID}', { allow_enhanced_conversions: true });
          ${GA4_ID ? `gtag('config', '${GA4_ID}');` : ''}
        }
      `}</Script>
    </>
  );
}
```

Mount `<GoogleTag />` and `<AttributionCapture />` once in the root `app/layout.tsx` of **both** apps.

Notes:
- The hostname check inside the inline script is a second guard, in case a preview build is ever promoted with the wrong env.
- The Google tag sets the `_gcl_aw` cookie automatically (conversion linker). Default cookie domain is the root domain, so it is shared across `neramclasses.com` and `app.neramclasses.com`. Do not override `cookie_domain`.
- In Google Ads > Data manager > Google tag > Settings, confirm the enhanced conversions method is **Code** (we pass `user_data` ourselves).

### T3. Attribution capture (client)

`src/attribution.ts`:

```ts
export const ATTR_KEYS = [
  'gclid', 'gbraid', 'wbraid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'matchtype', 'device',
] as const;
type AttrKey = (typeof ATTR_KEYS)[number];

export type Touch = Partial<Record<AttrKey, string>> & {
  landing_path: string;
  referrer: string;
  ts: string; // ISO
};

export const FT_COOKIE = 'nr_ft'; // first touch, never overwritten
export const LT_COOKIE = 'nr_lt'; // last non-direct touch
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days = Google Ads click window

function cookieDomain(): string {
  return location.hostname.endsWith('neramclasses.com') ? ';domain=.neramclasses.com' : '';
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${MAX_AGE};SameSite=Lax;Secure${cookieDomain()}`;
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function isExternalReferrer(): boolean {
  if (!document.referrer) return false;
  try {
    return !new URL(document.referrer).hostname.endsWith('neramclasses.com');
  } catch {
    return false;
  }
}

export function captureAttribution() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const touch: Touch = {
    landing_path: location.pathname,
    referrer: document.referrer.slice(0, 300),
    ts: new Date().toISOString(),
  };
  let hasParams = false;
  for (const k of ATTR_KEYS) {
    const v = params.get(k);
    if (v) { touch[k] = v.slice(0, 200); hasParams = true; }
  }

  const json = JSON.stringify(touch);
  const isNewSource = hasParams || isExternalReferrer();

  if (!readCookie(FT_COOKIE)) writeCookie(FT_COOKIE, json); // first visit ever (even direct)
  if (isNewSource) writeCookie(LT_COOKIE, json);             // internal navigation never overwrites
}
```

`src/AttributionCapture.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution } from './attribution';

export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => { captureAttribution(); }, [pathname]);
  return null;
}
```

**Important:** check every redirect and middleware in both apps (`next.config.*` redirects, `middleware.ts`, Cloudflare page rules, links from marketing site to `app.`). They must **preserve the query string**, otherwise `gclid` and UTMs are lost before capture. The capture runs on the marketing site too, so cookies are set before any cross-subdomain hop.

### T4. Conversion helpers (client)

`src/conversions.ts`:

```ts
import { canTrack, GADS_ID, LABEL_SIGNUP, LABEL_APPLICATION } from './env';

type Gtag = (...args: unknown[]) => void;
declare global { interface Window { gtag?: Gtag; dataLayer?: unknown[] } }

/** Normalise to E.164. OTP numbers should already be E.164; this is a safety net. */
export function toE164(phone: string, defaultCc = '+91'): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return defaultCc + cleaned;
  return '+' + cleaned;
}

function fireOnce(key: string, fn: () => void) {
  const k = `nr_conv_${key}`;
  try {
    if (localStorage.getItem(k)) return;
    fn();
    localStorage.setItem(k, '1');
  } catch {
    fn(); // storage blocked: transaction_id still dedupes on Google's side
  }
}

function setUserData(phone?: string, email?: string) {
  const userData: Record<string, string> = {};
  if (phone) userData.phone_number = toE164(phone);
  if (email) userData.email = email.trim().toLowerCase();
  if (Object.keys(userData).length) window.gtag!('set', 'user_data', userData);
}

/** Call ONLY after server confirms OTP verified AND user was newly created. */
export function trackSignupVerified(p: { userId: string; phone: string; email?: string }) {
  if (!canTrack() || !window.gtag) return;
  fireOnce(`signup_${p.userId}`, () => {
    setUserData(p.phone, p.email);
    window.gtag!('event', 'conversion', {
      send_to: `${GADS_ID}/${LABEL_SIGNUP}`,
      value: 100,
      currency: 'INR',
      transaction_id: `signup_${p.userId}`,
    });
    window.gtag!('event', 'sign_up', { method: 'phone_otp' });
  });
}

/** Call ONLY after application page 2 is saved (server 2xx). */
export function trackApplicationSubmitted(p: {
  userId: string; applicationId: string; phone: string; email?: string;
}) {
  if (!canTrack() || !window.gtag) return;
  fireOnce(`app_${p.applicationId}`, () => {
    setUserData(p.phone, p.email);
    window.gtag!('event', 'conversion', {
      send_to: `${GADS_ID}/${LABEL_APPLICATION}`,
      value: 500,
      currency: 'INR',
      transaction_id: `app_${p.applicationId}`,
    });
    window.gtag!('event', 'generate_lead', { value: 500, currency: 'INR' });
  });
}
```

### T5. Wire the helpers into the flows

1. **OTP verify handler** (shared auth component used on `/apply`, `/demo-class`, tools pages):
   - The server verify endpoint must return `{ userId, isNewUser, phone }`.
   - On success: `if (res.isNewUser) trackSignupVerified({ userId, phone })`.
   - Nothing fires on "Send OTP", on OTP failure, or on returning-user login.
2. **Application form page 2 submit handler:**
   - After the save request returns 2xx: `trackApplicationSubmitted({ userId, applicationId, phone, email })`.
   - Remove whatever currently fires "Application Submitted" on `/tools/nata/cutoff-calculator`.

### T6. Database (Supabase migration)

Adjust the `user_id` foreign key to the actual users/profiles table used by Neram (`auth.users` assumed below).

```sql
-- 2026xxxx_marketing_attribution.sql

create table if not exists public.user_attribution (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  gclid          text,
  gbraid         text,
  wbraid         text,
  ft_source      text, ft_medium text, ft_campaign text, ft_term text, ft_content text,
  ft_landing_path text, ft_referrer text, ft_at timestamptz,
  lt_source      text, lt_medium text, lt_campaign text, lt_term text, lt_content text,
  lt_matchtype   text, lt_device text,
  lt_landing_path text, lt_referrer text, lt_at timestamptz,
  signup_app     text,          -- 'marketing' | 'app'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.funnel_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  stage       text not null check (stage in ('signed_up','application_submitted','demo_attended','enrolled')),
  value_inr   numeric(12,2),
  occurred_at timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb,
  unique (user_id, stage)
);

create index if not exists funnel_events_stage_time_idx on public.funnel_events (stage, occurred_at);
create index if not exists user_attribution_gclid_idx on public.user_attribution (gclid) where gclid is not null;

-- Written only by the server with the service role. No client policies on purpose.
alter table public.user_attribution enable row level security;
alter table public.funnel_events    enable row level security;
```

### T7. Persist attribution on the server at sign-up

In the OTP verify route handler / server action (runs on `app.neramclasses.com` or `neramclasses.com`; both receive the `.neramclasses.com` cookies):

`src/attribution-server.ts`:

```ts
import { cookies } from 'next/headers';
import type { Touch } from './attribution';

function parse(v?: string): Touch | null {
  if (!v) return null;
  try { return JSON.parse(decodeURIComponent(v)); } catch { return null; }
}

/** _gcl_aw format: GCL.<timestamp>.<gclid> */
function gclidFromCookie(v?: string): string | null {
  if (!v) return null;
  const parts = v.split('.');
  return parts.length >= 3 ? parts.slice(2).join('.') : null;
}

export async function readAttribution() {
  const c = await cookies();
  const ft = parse(c.get('nr_ft')?.value);
  const lt = parse(c.get('nr_lt')?.value) ?? ft;
  return {
    ft, lt,
    gclid: lt?.gclid ?? ft?.gclid ?? gclidFromCookie(c.get('_gcl_aw')?.value),
    gbraid: lt?.gbraid ?? ft?.gbraid ?? null,
    wbraid: lt?.wbraid ?? ft?.wbraid ?? null,
  };
}
```

In the verify handler, when `isNewUser` is true:

```ts
const a = await readAttribution();
await supabaseAdmin.from('user_attribution').upsert({
  user_id: userId,
  gclid: a.gclid, gbraid: a.gbraid, wbraid: a.wbraid,
  ft_source: a.ft?.utm_source, ft_medium: a.ft?.utm_medium, ft_campaign: a.ft?.utm_campaign,
  ft_term: a.ft?.utm_term, ft_content: a.ft?.utm_content,
  ft_landing_path: a.ft?.landing_path, ft_referrer: a.ft?.referrer, ft_at: a.ft?.ts,
  lt_source: a.lt?.utm_source, lt_medium: a.lt?.utm_medium, lt_campaign: a.lt?.utm_campaign,
  lt_term: a.lt?.utm_term, lt_content: a.lt?.utm_content,
  lt_matchtype: a.lt?.matchtype, lt_device: a.lt?.device,
  lt_landing_path: a.lt?.landing_path, lt_referrer: a.lt?.referrer, lt_at: a.lt?.ts,
  signup_app: process.env.NEXT_PUBLIC_APP_NAME ?? null,
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id' });

await supabaseAdmin.from('funnel_events')
  .upsert({ user_id: userId, stage: 'signed_up' }, { onConflict: 'user_id,stage', ignoreDuplicates: true });
```

Also insert `funnel_events` rows:
- `application_submitted` in the application page 2 save handler (`value_inr: 500`).
- `demo_attended` when the admin app marks a demo attended.
- `enrolled` when fee payment is confirmed (`value_inr` = actual fee paid).

Admin app (`admin.neramclasses.com`): add the "Mark demo attended" action and make sure fee confirmation writes `enrolled`.

### T8. GA4

- Find which of the 2 linked GA4 properties is the live one. Keep one property, with web streams for `neramclasses.com` and `app.neramclasses.com` (or one stream). Put its ID in `NEXT_PUBLIC_GA4_ID`.
- In GA4, mark `sign_up` and `generate_lead` as key events.
- **Do not** import GA4 key events into Google Ads as Primary. The Ads tag already counts these, and importing would double count.
- In GA4 Admin > Data streams > Configure tag settings > List unwanted referrals, add `neramclasses.com` so the subdomain hop does not start a new session.

### T9. Offline conversions (phase 2, after T1 to T8 are live)

Prerequisites in Google Ads (Hari): create 2 conversion actions with source **Import > CRM / files / other data sources**:
- `Demo Attended` (Secondary to start, value 0)
- `Enrolled (Fee Paid)` (Primary, use per-conversion value)

Then turn on **Enhanced conversions for leads** (matches by hashed phone even when gclid is missing).

Create the export view (requires `pgcrypto`, which Supabase installs in the `extensions` schema). Replace `public.profiles.phone` with the real phone column (E.164).

```sql
create or replace view public.gads_offline_conversions as
select
  ua.gclid                                                     as google_click_id,
  case fe.stage
    when 'demo_attended' then 'Demo Attended'
    when 'enrolled'      then 'Enrolled (Fee Paid)'
  end                                                          as conversion_name,
  to_char(fe.occurred_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') || '+0530'
                                                               as conversion_time,
  coalesce(fe.value_inr, 0)                                    as conversion_value,
  'INR'                                                        as conversion_currency,
  encode(extensions.digest(p.phone, 'sha256'), 'hex')          as hashed_phone_number,
  fe.stage || '_' || fe.user_id                                as order_id
from public.funnel_events fe
join public.profiles p            on p.id = fe.user_id
left join public.user_attribution ua on ua.user_id = fe.user_id
where fe.stage in ('demo_attended', 'enrolled')
  and fe.occurred_at > now() - interval '90 days'
  and (ua.gclid is not null or p.phone is not null);
```

Upload path (pick one):
- **A. Data Manager PostgreSQL connector** (Google Ads > Tools > Data manager > PostgreSQL): connect a read-only Postgres role that can select only this view, and schedule a daily sync.
- **B. Google Sheets:** a daily cron (Vercel cron or Supabase scheduled function) writes the view to a Sheet, and Google Ads > Goals > Uploads > Schedule pulls it daily.

Notes:
- The phone is hashed as the exact E.164 string (`+919876543210`), lowercase hex SHA-256, no spaces.
- Check the time format in the upload preview the first time. Google accepts `yyyy-MM-dd HH:mm:ss+0530`.
- A conversion can only be attributed if the click was within the action's click-through window (90 days).

### T10. Reporting query (admin dashboard, optional)

```sql
select
  coalesce(ua.lt_campaign, '(direct/organic)')                      as campaign_id,
  coalesce(ua.lt_term, '-')                                          as keyword,
  count(*) filter (where fe.stage = 'signed_up')                     as signups,
  count(*) filter (where fe.stage = 'application_submitted')         as applications,
  count(*) filter (where fe.stage = 'demo_attended')                 as demos,
  count(*) filter (where fe.stage = 'enrolled')                      as enrolments,
  sum(fe.value_inr) filter (where fe.stage = 'enrolled')             as fee_revenue_inr
from public.funnel_events fe
left join public.user_attribution ua on ua.user_id = fe.user_id
where fe.occurred_at > now() - interval '30 days'
group by 1, 2
order by enrolments desc, applications desc, signups desc;
```

`utm_campaign` holds the Google Ads campaign ID (from the URL suffix). Map IDs to names in the admin UI:
- TN Local NATA 2027
- Gulf NATA & JEE Paper 2 Online 2027

---

## 5. Google Ads UI checklist (no code, done in the Ads account)

| # | Change | Status |
|---|---|---|
| 1 | Rename "Sign-up (1)" to "Sign-up (OTP verified)" | DONE 2026-10-17 |
| 2 | Sign-up (OTP verified): default value ₹100 (code also sends 100) | DONE |
| 3 | Application Submitted: fixed value ₹500 for every conversion (code also sends 500) | DONE |
| 4 | Rename "Purchase (Page load neramclasses.com/thank-you)" to "Apply page view", category Page view, keep Secondary | DONE |
| 5 | Remove "Phone call leads", "Contacts" and "Leads from messages" from account-default goals (Goals > Summary > each goal > Edit) | DONE |
| 6 | Conversion settings > Enhanced conversions for leads > Turn on, method Google tag | DONE |
| 7 | Admin > Account settings > Auto-tagging: confirm ON | DONE |
| 8 | Admin > Account settings > Tracking > Final URL suffix: `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={adgroupid}&matchtype={matchtype}&device={device}` | DONE |
| 9 | Data manager > Google tag > Configure domains: do **not** accept the `*.vercel.app` suggestions | DONE |
| 10 | Data manager > link Search Console for neramclasses.com | DONE |
| 10b | The "Purchase" goal shows "Misconfigured" because it has no action in it. Harmless; fixed in phase 2 (T9) when "Enrolled (Fee Paid)" is added to that goal | PHASE 2 |
| 11 | After T1 to T7 are live for 30 days and a campaign has 15+ conversions/month, switch it to Maximize conversions | LATER |

---

## 6. QA and acceptance criteria

QA steps (production, after deploy):

1. Open `https://neramclasses.com/?gclid=TEST_GCLID_123&utm_source=google&utm_medium=cpc&utm_campaign=999`.
   - DevTools > Application > Cookies: `nr_ft` and `nr_lt` exist with domain `.neramclasses.com` and contain the values.
2. Navigate internally to another page. `nr_lt` must not change.
3. Go to `app.neramclasses.com`. The same cookies are visible there.
4. Sign up with a new phone number using Google Tag Assistant (tagassistant.google.com) connected:
   - Exactly one `conversion` hit to `AW-757750634/G5yMCLzC95ocEOq2qekC` with value 100, INR and `transaction_id`.
   - `user_data` is set (Tag Assistant shows enhanced conversion data present).
   - A `user_attribution` row exists with `gclid = TEST_GCLID_123`, plus a `funnel_events` `signed_up` row.
5. Log out and log in again with the same number. **No** conversion fires.
6. Complete application page 2. Exactly one hit to `.../T2hTCJOWlYUcEOq2qekC` with value 500. Reload the success page: no second hit.
7. Open `/tools/nata/cutoff-calculator` and use it. **No** conversion fires.
8. Open any `*.vercel.app` preview. The `gtag/js` script does not load (Network tab).
9. Delete the test rows from `user_attribution` and `funnel_events` afterwards.

Acceptance criteria:

- [ ] One Google tag load per app, production hostnames only
- [ ] `gclid`, `gbraid`, `wbraid` and UTMs persisted for every new user
- [ ] Sign-up conversion fires once, only for new OTP-verified users
- [ ] Application conversion fires once, only after page 2 is saved
- [ ] No conversion on the cutoff calculator or on returning logins
- [ ] `funnel_events` records all 4 stages; admin can mark demo attended
- [ ] Redirects and middleware preserve query strings
- [ ] Google Ads Diagnostics shows both actions "Recording conversions" with enhanced conversions coverage within 72 hours
