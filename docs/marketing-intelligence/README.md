# Marketing Intelligence: the Google Ads agent

An agent in the admin app that runs Neram's Google Ads day to day. Every morning it reads the account, finds waste and opportunities, explains them, makes the safe changes by itself, and asks an admin about the rest.

**Neram's conversion is an OTP-verified sign-up**: a person who signs in to the app and verifies their phone. The team then converts them by calling and with demo classes. The agent reports these sign-ups to Google, so Google bids for people who verify a phone, and judges every keyword, search and ad by them.

Spec: [../NERAM_MARKETING_INTELLIGENCE_AI_AGENT.md](../NERAM_MARKETING_INTELLIGENCE_AI_AGENT.md). Mutation safety: [MUTATIONS.md](MUTATIONS.md).

## How it works

```
06:00 IST       ingest       Google Ads API (35 days: campaigns, ad groups, keywords, search terms,
                             ads, devices, hours, cities, plus today's state of campaigns, ad
                             groups, keywords and ads: bids, first-page bids, Quality Score,
                             approval) -> ads_entity_daily
06:30 IST       analyze      rules (code) + AI (Gemini via @neram/ai) -> marketing_ai_recommendations
                             -> measure changes made 7+ days ago -> autopilot -> morning email
every 6 hours   conversions  OTP-verified sign-ups (+ demo bookings, paid fees) -> Google Ads
Mon 07:30 IST   weekly       AI report: last week vs the week before, what changed, 3 next steps
any time        admin        approve / reject / apply / undo in Admin > Marketing Intelligence
```

- **Numbers come from code, never from the AI.** `metrics.ts` and `rules.ts` decide what deserves attention. The AI classifies search intent, explains findings and drafts ad copy. `ai/validate.ts` drops any AI text that quotes a number not in the data.
- **Fitted to the real account** (snapshot of 2026-10-06, apps/admin/Docs/neram-google-ads-account-context.md, kept out of this public repo because it holds spend and bids): one Tamil Nadu Search campaign at ₹180 a day on **Manual CPC**, so keyword bids are the main lever, and the prepaid balance ran out in June. What the API cannot tell the agent (facts ads may claim, competitors, protected keywords, landing pages, target area) is the **Account profile** in Agent Settings.
- **Safe changes are automatic from day one**: blocking off-scope searches (NEET, jobs, other courses; the AI must be at least 85% sure), cutting budgets to hold the monthly cap, pausing keywords that waste money, and lowering the bid of a keyword that wastes money. Searches for free NATA material are never blocked: the free app is how most sign-ups happen. Each is in the morning email with Undo. Anything that spends more or changes what people see (budget raises, new keywords, new ads, pausing ads) waits for an admin, until that category has earned automatic mode (15 human decisions, 90% approved).
- **Sign-ups go back to Google.** The app's own Google tag fired on account creation, before the phone was verified, and often not at all. Now every OTP-verified sign-up is uploaded with the ad click id kept on `users.first_touch`, plus the SHA-256 of the phone and email (Google's "enhanced conversions for leads"), so sign-ups whose click id was lost are still credited.
- **No judging on thin data.** Rules that judge by sign-ups (wasted searches, keyword pauses, bid changes, new keywords, ad pauses, hours, areas, budget raises) only use data from the day "Phone verified" became the primary conversion (Agent Settings), and wait for 21 days of it.
- **Last season as advice only.** Until then, suggestions that wait for an admin (new keywords, bid raises) may use last season's history (the old Sign-up goal, from "Use last season's history from", default 2026-01-01). They are labelled "based on last season's conversions", and autopilot never acts on them. Load the history once with "Load history since 1 Jan" on the Overview.
- **No ads, no judging.** An enabled campaign with no impressions for 3 days raises a critical alert (R0) and a red banner on the Overview, and the rules stop judging it until it serves again.

### Rules

| Rule | What it finds | Becomes |
|---|---|---|
| R0 | Enabled campaign with no impressions for 3 days (usually the prepaid balance) | Critical alert and Overview banner; other rules skip the campaign |
| R1 | Search term spent 2x target CPA, no conversions | Negative keyword (or an insight, if the AI says the search is relevant) |
| R2 | Search term the AI labels job seeker, other exam or other course | Negative keyword (phrase if safe, else exact) |
| R3 | Keyword spent 3x target CPA on 30+ clicks, no conversions | Pause keyword |
| R4 | Campaign limited by budget and beating target CPA | Budget raise, at most 20% a step, never past the monthly cap |
| R5 | CPA up 40%+ week on week | Insight |
| R6 | Clicks continue but conversions stopped for 3 days | Critical alert (tracking broken?) |
| R7 | Enabled campaign showed no ads yesterday | Critical alert (billing? policy?) |
| R8 | Ad group CTR under half the account median, or a POOR ad | A new AI-written responsive search ad beside the current ones (approval) |
| R9 | A device costing 2x the campaign CPA | Bid adjustment advice (applied by hand) |
| R10 | Daily budgets allow more than the monthly cap | Budget cuts, in proportion |
| R11 | Month on track to pass the cap, or cap used up | Alert (critical when used up) |
| R12 | Season starts next month or has started, but budgets allow under half the season cap | Insight, with last season's spend and cost per conversion |
| R13 | A search that brought sign-ups at or under target and is not a keyword yet | New exact match keyword (approval) |
| R14 | An ad rarely clicked with no sign-ups while another ad in its group converts | Pause the ad (approval; never the last ad) |
| R15 | Times of day or days of the week that spend without sign-ups | Ad schedule advice: lower bids under Manual CPC, or leave the times out (applied by hand) |
| R16 | Cities that spend twice the target with no sign-ups | Location exclusion advice (applied by hand) |
| R17 | Manual CPC keyword: wastes money, or converts well but sits below the first-page bid or rarely shows | Bid cut (automatic, at most 20%, never below ₹5) or bid raise (approval, at most 20%, never above the ₹60 ceiling, never chasing a first-page bid above it) |
| R18 | Enabled ad group in a serving campaign with no impressions for 14 days | Alert naming the likely cause (ad not approved, default bid too low, no keywords) |
| R19 | The same keyword twice in one ad group in different capitals | Pause the copy with the shorter record (always approval) |
| R20 | Enabled keywords and ads that name a past exam year (2026 when NATA 2027 is next) | The 2027 keyword, and a copy of the ad with the year changed (always approval) |
| R21 | A keyword naming a place outside the target area ("Bangalore" in a Tamil Nadu campaign) | Insight |

A negative is never proposed if it would block a search that converted, a keyword Neram bids on, a protected keyword or Neram's own name. A protected keyword is never paused or given a lower bid. No ad, AI-written or not, may name a competitor or a past exam year (claims such as "AIR 1 in 2024" or "since 2009" are fine).

## Code map

| Path | What |
|---|---|
| `apps/admin/src/lib/marketing-ai/` | Everything: `ads/` (REST client, GAQL, mock, conversions), `rules.ts`, `metrics.ts`, `ai/`, `recommendations.ts` (lifecycle), `actions.ts` (mutations), `autopilot.ts`, `pipeline.ts`, `digest.ts` |
| `apps/admin/src/app/api/marketing-ai/` | Admin API (admins only, via `guard.ts`) |
| `apps/admin/src/app/api/cron/marketing-ai/` | The three nightly jobs (`CRON_SECRET`, fails closed) |
| `apps/admin/src/app/(dashboard)/marketing-ai/` | Overview, Recommendations, Campaigns, Settings, Audit log |
| `supabase/migrations/20261107090000_marketing_ai_core.sql` | Settings, daily data, runs, recommendations, actions, audit log |
| `supabase/migrations/20261107090100_ads_conversion_uploads.sql` | Offline conversion upload log |
| `packages/ai/src/features.ts` | `admin.ads-analyst` (standard tier, 60 calls a day, no free key) |
| `scripts/google-ads-auth.ts` | Mints the refresh token |

The spec suggested a separate `services/marketing-intelligence` on Cloud Run. It lives in the admin app instead: same auth, same database, Vercel crons, no new server. `lib/marketing-ai/` has no admin-specific imports outside `guard.ts` and `store.ts`, so it can move out later if it needs to.

## Budget: off-season minimum, admission season

Spend is held to a **monthly cap** that changes with the season:

| | Months (default) | Monthly cap (default) | About per day, all campaigns |
|---|---|---|---|
| Off-season | Jul to Feb | ₹7,000 | ₹230 |
| Admission season | Mar, Apr, May, Jun | ₹40,000 | ₹1,315 |

Change both, and the season months, in Agent Settings. Google may spend up to 30.4 times a campaign's daily budget in a calendar month, so the agent keeps the daily budgets adding up to no more than cap / 30.4:

- **R10** proposes cuts, in proportion and with a ₹50 a day floor, whenever the daily budgets allow more than the cap. On 1 July the cap drops and the cuts are proposed that morning.
- **R11** warns when the month is on track to pass the cap (from day 5), and raises a critical alert if the cap is used up. The agent cannot pause campaigns, so pausing is up to you.
- **R12** reminds you on the first mornings of the season if the budgets allow less than half the season cap.
- **R4** proposes raises only for a campaign that is limited by budget and beats the target CPA, never past the cap, and at most 20% a step.

A cut can be any size (it never costs money). A raise is limited to 20% per change, with a hard ceiling of 30%.

## Setup (once)

Not needed to build or try the agent: until this is done it runs on a sample account (`GOOGLE_ADS_MODE=mock`), which is safe everywhere. It is needed before the agent can read or change the real account.

Google changed the process on 9 September 2026. There are no more developer tokens, and you do not need a manager (MCC) account. Access belongs to a Google Cloud project.

1. **Cloud project.** In the Google Cloud console, create a project (or use an existing Neram one) and enable the **Google Ads API**.
2. **Access level.** On that project's Google Ads API page, sign up and apply for **Explorer access**. It can read and change real accounts, up to 2,880 operations a day; the agent uses a few dozen. Basic access (15,000 a day, needs brand verification) is only worth it if Explorer ever runs short. Do not use the old API Center in Google Ads.
3. **OAuth client.** In the same project: APIs & Services > OAuth consent screen (publish it to Production, otherwise refresh tokens expire after 7 days), then Credentials > Create OAuth client > **Desktop app**.
4. **Refresh token.** Put `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET` in `apps/admin/.env.local`, then run `cd scripts && npx tsx google-ads-auth.ts --write-env ../apps/admin/.env.local` and sign in as a Google user who has access to the Neram Classrooms ad account. It writes the refresh token (and the account id, if there is only one) into that file without printing it, and lists the ad accounts it can reach.
5. **Conversion actions.** In Google Ads:
   - Goals > Settings: turn on **Enhanced conversions for leads**, choose "Google Ads API", accept the customer data terms.
   - Goals > Conversions > New conversion action > Import > "CRM, files or other data sources" > "Track conversions from clicks". Create **Phone verified (Neram app)**: category Sign-up, Count **One**, 90-day window, **Primary**. Its id (`ctId=` in the URL) is `GOOGLE_ADS_CONV_ACTION_PHONE`.
   - Optional, both **Secondary**: **Demo booked** (`_DEMO`) and **Admission paid** ("use different values", INR, `_PAID`).
   - Then set every older conversion action (website signup, calls, purchase, credit signup) to **Secondary**, so Google bids only for verified sign-ups.
   - Note the date, and enter it in Agent Settings as "Phone verified conversion live since".
6. **Purchase action.** Set the old website "Purchase" action to **Secondary**. The thank-you page no longer fires it, because that page confirms an application, not a payment.
7. **Env vars**, on the **admin** Vercel project only, production and preview. Run `cd apps/admin && vercel env add <KEY> production` and the same with `preview`:

| Key | Production | Preview / staging |
|---|---|---|
| `GOOGLE_ADS_MODE` | `live` | `mock` (or `live` for read-only testing) |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` | set | set if live |
| `GOOGLE_ADS_CUSTOMER_ID` | set | set if live |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | only if you sign in through a manager account | same |
| `GOOGLE_ADS_CONV_ACTION_PHONE` (and optionally `_DEMO`, `_PAID`) | set | set if live (uploads stay dry runs there) |
| `MARKETING_AI_ALLOW_MUTATIONS` | `true` | **never set** |
| `MARKETING_AI_DIGEST_TO` | admin emails | empty |

`GOOGLE_ADS_DEVELOPER_TOKEN` is no longer needed; Google ignores it. None of these are `NEXT_PUBLIC_*`, and none go in `turbo.json`.

8. **Settings.** In Admin > Marketing Intelligence > Agent Settings, check the caps, the season months and the target cost per conversion.

**When to do it:** before the season, ideally by January, so the agent has a few off-season weeks of real data and your approvals before March. Off-season it still pays for itself: at ₹7,000 a month, blocking a few junk searches (NEET, jobs, free coaching) frees a real share of the budget.

## Going live, safely

1. Live data, no changes: set `GOOGLE_ADS_MODE=live` without `MARKETING_AI_ALLOW_MUTATIONS`. Run an audit and check the Overview totals against the Google Ads UI for the same dates.
2. Conversions dry run: the upload runs validate-only and records `validated`. Check Admin > Overview, "Sign-ups sent to Google". Staging never uploads for real: its users are test accounts.
3. Turn on `MARKETING_AI_ALLOW_MUTATIONS=true` on production only. From the next morning the safe categories act by themselves. At ₹180 a day the campaign already fits the ₹7,000 off-season cap, so no budget cut is expected; until the OTP conversion has 21 days, nothing is cut or paused for performance either. Watch the morning email; every change has Undo.
4. Approve or reject the rest. When a category shows "Earned" in Settings, an admin may switch it to Automatic.

## Runbook

| Symptom | Cause and fix |
|---|---|
| Overview banner "Google Ads is not connected" | A credential env var is missing in live mode |
| Run fails with `invalid_grant` | Refresh token revoked or expired: re-run `scripts/google-ads-auth.ts` |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | The Cloud project has only test access. Apply for Explorer access on its Google Ads API page |
| Recommendations have no AI text | AI budget reached (`AiBlockedError`) or Gemini failing. Rules still work. See Admin > AI controls |
| Apply says "budget changed since" | Someone edited it in Google Ads. The agent re-evaluates tonight |
| A category went back to "Ask me" | An automatic change made CPA 30%+ worse a week later. See the alert recommendation and the audit log |
| Red banner "Ads are not showing" | An enabled campaign had no impressions for 3 days. Usually the prepaid balance: Google Ads > Billing > Add funds. To see the banner on the sample account, set `GOOGLE_ADS_MOCK_SCENARIO=not_serving` |
| Apply says "bid changed since" | Someone edited the keyword bid in Google Ads. The agent re-evaluates tonight |
| Stop everything now | Agent Settings > "Stop all automatic changes" |

## Not built yet

- GA4 (no GA4 tag on the site yet) and Search Console ingest. The SEO, AEO and content agents can plug into the same recommendations pipeline.
- Ad schedule, location and device changes from the app. They are advice; apply them in Google Ads by hand.
- Creating campaigns, including the competitor campaign in the account context file (section 10.7). The agent never creates or restructures campaigns; that stays a person's job.
- Reading the campaign's location targeting. R21 uses the Account profile's area and outside places instead.
- `gbraid` on `lead_profiles` (the application form). It is captured on the cookie and `users.first_touch`, which is what the sign-up upload uses.
- A sidebar badge for pending recommendations. It needs a change to the `admin_badge_counts` SQL function. The Overview button shows the count.
