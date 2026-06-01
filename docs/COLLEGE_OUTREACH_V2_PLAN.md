# College Outreach v2 — Implementation Plan

> Drop-in context file for Claude Code. Scope: rework the `/college-outreach` feature in `apps/admin` to (1) convert more colleges, (2) scale from Tamil Nadu to all-India, and (3) clean up the college dataset (dedupe, deactivate defunct entries, backfill missing emails).
>
> This supersedes the single `first_touch_v1` template and the legacy 2-year-old email.

---

## 0. Decisions to confirm before building

These are the only open items. Defaults are filled in; change them in one place and they propagate through the templates.

| Item | Default used in this spec | Why it matters |
|---|---|---|
| **Active student count** | `1,000+ active students` | The app template says 2,000+, the founder pitch says 1,000+, the old email says "10,000+ guided". Pick ONE active number and use it everywhere. "Guided since 2015" can be a separate cumulative number if substantiable. |
| **AIR 1 / topper year** | `AIR 1 in JEE B.Arch` (year TBC) | Memory says 2024, old email says 2025. Confirm the year before it goes in any email. |
| **GA4 "students/visitors" number** | left as `[GA4_MONTHLY_USERS]` placeholder | Search Console measures search clicks, NOT site visitors. If you want to claim "X students used the platform", pull it from GA4 and label it as such. Do not reuse the GSC click number for this. |
| **"Microsoft for Startups backed"** | included, flagged | Only keep if you can substantiate it if a college asks. |

### Locked numbers (from Google Search Console, last 3 months — verified screenshot)

Use these verbatim. Do not inflate. They are strong on their own and you must be able to defend them live on a call.

- **315,000** search impressions
- **5,400** clicks (visits from Google search)
- **Average position 7.2** (i.e. first page of Google)
- **Growing month over month** (clear upward trend Mar→May)
- Top college-intent queries on the platform: `nata college predictor`, `nata rank predictor`, `nata 2026 question paper`

> The query list is the single most persuasive proof for a college: it shows the people searching are in *college-decision mode*. Surface it.

---

## 1. The new funnel (replaces the all-in-one email)

One ask per stage. Money is never mentioned before a verbal/written yes.

| Stage | Template key | Audience (by `contact_status`) | The single ask | Money? |
|---|---|---|---|---|
| 1. First touch | `first_touch_v2` | `never_contacted` with email | "Is your free page accurate?" | No |
| 2. Content gather | `content_request_v1` | `replied` / `claimed` | "Send brochure + photos + placements" | No |
| 3. Partnership pitch | `partnership_pitch_v1` | `engaged` (warm, wants more reach) | "Here is the reach + tiers, shall we talk?" | Tiers named, no payment details |
| 4. Payment | `payment_details_v1` | post-call verbal yes | Bank details + invoice note | Yes |
| 5. Onboarding | `onboarding_v1` | `partner` | "Your page is live, here is your login" | No |

### `contact_status` lifecycle (extend existing enum)
```
never_contacted -> emailed_v1 -> replied -> engaged -> claimed -> partner
                                     \-> bounced
                                     \-> opted_out
```
Add **`partner`** (paid/active partnership) to the existing enum.

### Sequencing guardrail (enforce in send API)
A template may only be sent if the college's `contact_status` is in its allowed set. Block (with override) otherwise. This stops staff from sending the pitch before first-touch, or payment details before a yes.

---

## 2. Data hygiene tasks

Current state: 186 colleges, **only 32 have an email**, all Tamil Nadu, some duplicates / defunct entries.

### 2a. Soft-delete, do not hard-delete
`college_outreach_log` and the leads tables FK to `college_id`. Hard-deleting orphans those records. Add a status column instead.

```sql
-- migration: 20260601_college_status.sql
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','duplicate','defunct','unverified')),
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES colleges(id),
  ADD COLUMN IF NOT EXISTS email_source TEXT,        -- 'official_site' | 'manual' | 'directory' | null
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- only 'active' colleges are public + emailable
CREATE INDEX IF NOT EXISTS idx_colleges_status ON colleges(status);
```

Public site and outreach list must filter `WHERE status = 'active'`.

### 2b. Duplicate detection (review, then mark — do NOT auto-delete)
```sql
-- candidates: same city + very similar normalized name
SELECT a.id, a.name, b.id AS dupe_id, b.name AS dupe_name, a.city
FROM colleges a
JOIN colleges b
  ON a.city = b.city
 AND a.id < b.id
 AND similarity(
       lower(regexp_replace(a.name,'[^a-z0-9]','','gi')),
       lower(regexp_replace(b.name,'[^a-z0-9]','','gi'))
     ) > 0.6   -- needs pg_trgm extension
ORDER BY a.city, a.name;
```
Workflow: query -> human eyeballs the list -> set the weaker row `status='duplicate'`, `duplicate_of = <surviving id>`. Re-point any existing leads/log rows to the survivor first.

### 2c. Defunct / non-functional colleges
No reliable signal exists in the data for "not functional", so this stays a manual review action. Provide a UI "Deactivate" action that sets `status='defunct'` + `deactivated_reason`. Suggested review trigger: `completeness < 40` AND `email IS NULL` -> surface for manual check (don't auto-deactivate).

### 2d. Missing-email backfill (the real blocker: 154/186 have no email)
- Add a **"Needs email" filter** (`email IS NULL AND status='active'`) to the outreach page.
- Add an inline **"Add email"** action per row that writes `email` + `email_source`.
- Tamil/staff researches official sites + COA directory to fill these. This is the top priority — outreach to 32 colleges is not "all-India".

### 2e. All-India expansion
Schema already has `state` / `state_slug`, so no model change. Ingestion only. Source the master list from COA-approved B.Arch institutions + JoSAA/CSAB participating colleges. Load with `status='unverified'` until basic fields + email are checked, then promote to `active`.

---

## 3. Compliance requirements (build these as product constraints)

These are not optional polish — they protect the platform.

1. **Leads must be consent-based opt-in, never bulk database access.** A college receives a lead only when a student taps "I'm interested, contact me" on that college's page. Never expose or hand over the raw student database. Many NATA aspirants are 16–18 (minors under the DPDP Act), so bulk marketing access to their data is a hard no. The existing admin-approval gate on leads is correct — keep it. Remove any "access to our student database" language from all copy.
2. **College payments are a service fee, not a donation.** Do not issue trust/donation receipts for partnership payments. Invoice them as a commercial service (profile + leads + visibility). Scholarships for low-income students can be funded *from the profit*, tracked separately. (Confirm exact structure with a CA — this spec just enforces that the email/invoice copy calls it a service fee.)
3. **No "automatic recommendation / endorsement" language.** The old email's "endorsement by Neram Classes" reads as pay-for-placement. Replace with neutral framing: a free listing for everyone, with earned visibility (completeness, student interest) plus optional promoted placement that is clearly labelled.

---

## 4. Templates (extend `lib/college-outreach/templates.ts`)

Extend the union and add three render functions. **All copy is em-dash-free** to pass the existing `ensureNoEmDashes` linter, and uses no `{{ }}` tokens in final output.

```ts
export type OutreachTemplateVariant =
  | 'first_touch_v2'
  | 'content_request_v1'
  | 'partnership_pitch_v1'
  | 'payment_details_v1'
  | 'onboarding_v1';
```

> Keep `first_touch_v1` exported but mark it `@deprecated` so old log rows still render.

### 4a. `first_touch_v2` — ONE ask: verify the free page

**Subject variants**
1. `[College] now has a page on Neram College Hub, is the info correct?`
2. `Students are researching [College] on our platform, quick check`
3. `We built a free profile for [College], please review it`

**Body**
```
Dear [College] Admissions Team,

I am Haribabu Manoharan, founder of Neram Classes and a B.Arch graduate of NIT Trichy.

We run a free B.Arch college discovery platform where architecture aspirants
research and compare colleges before admission. [College] is one of the colleges
students can find there, and we have already built a dedicated page for you:

[college page URL]

We populated it from publicly available information, so a few details may be
approximate. Before we feature [College] more prominently to students researching
the 2026 cycle, could you take a quick look and tell us one thing: is the basic
information accurate?

That is the only ask in this email. The page is free, it carries a permanent
backlink to your official website, and there is nothing for you to set up to begin.

If you would like to manage the page yourself, edit details, see how many students
viewed it, and receive enquiries directly from interested students, just reply and
we will set up a dedicated login for you.

Looking forward to hearing from you.

Warm regards,
Haribabu Manoharan
Founder, Neram Classes
info@neramclasses.com | neramclasses.com/colleges
```
Removed vs old: the 6-item checklist, the fee, the ranking-threat line, the "why this matters" wall. One yes/no question = high reply rate.

### 4b. `content_request_v1` — sent only after they reply/claim

The 6-item checklist lives here now, because the college has shown interest.
```
Dear [College] Admissions Team,

Thank you for getting back to us. To present [College] at its best to the students
researching the 2026 cycle, could you share any of the following when convenient:

1. Confirm the fee structure, seat intake, and NAAC grade are accurate.
2. Your latest brochure (we will make it downloadable on your page).
3. Three to five campus photos (studios, workshops, hostels).
4. Recent placement highlights, if available.
5. A short note from one or two current students.
6. Recent TNEA / counselling cutoff details, if you have them.

Even two or three of these make a noticeable difference to how students engage
with your page. Send whatever is easy, and we will handle the formatting.

Warm regards,
Haribabu Manoharan
Founder, Neram Classes
```

### 4c. `partnership_pitch_v1` — the proof + tiers (warm colleges only)

This is where the real numbers and tiers go. **Attach the raw Search Console screenshot.** No payment details here.
```
Dear [College] Admissions Team,

Thank you for engaging with your page on Neram College Hub. Here is a snapshot of
the reach behind it.

Over the last three months, neramclasses.com appeared in Google search results
315,000 times and drew 5,400 visits from students searching for NATA, B.Arch, and
architecture-college information. We rank on the first page of Google (average
position 7.2) for these queries, and traffic is growing month over month. Among the
top searches on our platform are "nata college predictor" and "nata rank predictor",
students who are actively deciding where to apply.

(Search Console screenshot attached.)

Every college has a free listing. Colleges that want stronger reach during the
admission window can opt into a partnership, which adds:

- Priority placement in your region's college results
- Direct, opt-in student enquiries routed to your admissions team
- A feature in our "Top architecture colleges in Tamil Nadu" guide (SEO + AEO,
  so you also surface in ChatGPT and Gemini answers)
- Free participation in #AskSeniors, our annual event where aspirants meet current
  students, with a slot to present your college

If this is useful, I would be glad to walk your team through it on a short call.
What time suits you this week?

Warm regards,
Haribabu Manoharan
Founder, Neram Classes
```
> Define the actual tier names/benefits (Free / Silver / Gold / Platinum) in a `TIERS` config and render the relevant block. Keep #AskSeniors prominent — it is the one benefit pure-SEO competitors cannot copy.

### 4d. `payment_details_v1` — only after a verbal yes on the call
Bank details + clear statement that an invoice will be issued for the **service fee** (not a donation). Reference the agreed tier and term.

### 4e. `onboarding_v1` — partnership live
Confirms the page is live/upgraded, sends the dashboard login, shows work already done. Sets `contact_status='partner'`.

---

## 5. UI changes on `/college-outreach`

- **Status column + filter**: active / duplicate / defunct / unverified.
- **Row actions**: add **Deactivate** (status + reason) and **Merge into** (set `duplicate_of`, re-point leads/log).
- **"Needs email" filter** + inline **Add email** action (writes `email_source`).
- **Template picker** now lists the 5 templates; the picker disables templates not allowed for the row's `contact_status` (with an override checkbox).
- **Stats panel**: add counts for `Needs email`, `Active`, `Partner`.
- Outreach list query: default to `status='active'`.

---

## 6. Build order

1. Migration `20260601_college_status.sql` (Section 2a).
2. Filter public site + outreach list to `status='active'`.
3. Email-backfill UI (2d) — unblocks real outreach volume.
4. Dedupe review query + Merge/Deactivate actions (2b, 2c).
5. New templates (Section 4) + extend the type union + status guardrail (Section 1).
6. Template picker + status filter UI (Section 5).
7. All-India ingestion as `unverified` (2e).

---

## 7. What was removed from the old email and why

| Old element | Action | Reason |
|---|---|---|
| ₹75,000 "sponsorship fund" stated in first email | Move to stage 4, reframe as service fee | Premature money kills replies; donation-labelling is a tax risk |
| "10,000+ aspirants", "44,513 views in 28 days" | Replace with locked GSC numbers | Inflated/inconsistent; fails a live check |
| "Endorsement / automatic recommendation" | Remove | Reads as pay-for-placement |
| "Access to our student database for marketing" | Remove; use opt-in leads | DPDP / minor-data risk |
| 5 benefits + event + ask in one email | Split across 4 staged emails | One ask per stage converts far better |
