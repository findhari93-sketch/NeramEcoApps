# Google Ads mutations: scopes, operations, risk, approval, rollback

The spec (§30) requires this before any write to Google Ads. The code is `apps/admin/src/lib/marketing-ai/actions.ts`, the upload is `ads/conversions.ts`, and the tests are `actions.test.ts` and `ads/conversions.test.ts`.

## Access

- **OAuth scope:** `https://www.googleapis.com/auth/adwords`. This is the only scope the Google Ads API has, so it is full read and write. The token belongs to one Google user and is stored only in Vercel env (`GOOGLE_ADS_REFRESH_TOKEN`), server side.
- **Access:** since 2026-09-09 it comes from the Google Cloud project of the OAuth client (Explorer access is enough). `developer-token` is sent only if set, because Google now ignores it. `login-customer-id` is sent only when signing in through a manager account.
- **Kill switches, from strongest to weakest:**
  1. Unset `MARKETING_AI_ALLOW_MUTATIONS`. Every write becomes `validateOnly` and nothing changes.
  2. Agent Settings > "Stop all automatic changes". No automatic writes; approved ones still work.
  3. Set a category back to "Ask me".

## The only writes that exist

| Change | REST call | Request | Risk | Undo |
|---|---|---|---|---|
| Add campaign negative keyword | `customers/{id}/campaignCriteria:mutate` | `create { campaign, negative: true, keyword { text, matchType: EXACT or PHRASE } }` | Low. Can block good traffic if the phrase is too broad; the rules refuse a phrase contained in any converting search or bid keyword | `remove` the created criterion |
| Pause keyword | `customers/{id}/adGroupCriteria:mutate` | `update { resourceName, status: PAUSED }`, mask `status` | Medium. Loses that keyword's traffic | `update status: ENABLED` |
| Change daily budget | `customers/{id}/campaignBudgets:mutate` | `update { resourceName, amountMicros }`, mask `amount_micros` | Raise: medium (spend rises), at most 20% a step and never past the monthly cap. Cut: low (to hold the cap), any size, never below ₹50 a day | `update amountMicros` back to the old value |
| Add keyword | `customers/{id}/adGroupCriteria:mutate` | `create { adGroup, status ENABLED, keyword { text, matchType EXACT or PHRASE } }` | Medium. More traffic on a search that already converts; spend stays under the cap | `remove` the created criterion |
| New ad | `customers/{id}/adGroupAds:mutate` | `create { adGroup, status ENABLED, ad { finalUrls (https neramclasses.com only), responsiveSearchAd { 3 to 15 headlines of 30, 2 to 4 descriptions of 90 } } }`. Refused if the group already has 3 enabled RSAs | Medium. New copy is shown to people; Google reviews it first | `update status: PAUSED` (kept for history) |
| Pause ad | `customers/{id}/adGroupAds:mutate` | `update { resourceName, status: PAUSED }`. Never the only enabled ad | Medium | `update status: ENABLED` |
| Keyword bid | `customers/{id}/adGroupCriteria:mutate` | `update { resourceName, cpcBidMicros }`, `updateMask: cpc_bid_micros`. Only when the campaign is Manual CPC (checked live) and the live bid still equals the one the recommendation saw. Whole paise, at most the increase guardrail either way, never below ₹5, never above the max CPC ceiling (default ₹60, hard ceiling ₹200), never a lower bid on a protected keyword | Low for a cut, medium for a raise | `update cpcBidMicros` back to the old bid |
| Offline conversion | `customers/{id}:uploadClickConversions` | gclid, wbraid or gbraid when known; `userIdentifiers` with SHA-256 of the E.164 phone and of the normalised email; conversion action; IST time; value in INR for paid; `orderId` | Low. Changes what bidding learns, not what runs. Duplicates are prevented by `orderId` and the `ads_conversion_uploads` unique key. Staff and test accounts are never sent | Conversion adjustments (manual; not automated) |

**Never, in code, whatever the settings:** remove a campaign, ad group or ad; change a bid strategy; enable anything that is paused (except an undo); change a shared budget; raise a budget by more than the guardrail (default 20%, hard ceiling 30%); set a daily budget below ₹50; add a broad match negative or keyword; pause the last enabled keyword or ad of an ad group; create an ad that points anywhere but https neramclasses.com; create an ad that names a competitor or a past exam year; pause, cut the bid of, or block with a negative a protected keyword or Neram's own name; change keyword bids on a campaign that is not Manual CPC.

## Every write, in order

1. **Approval.** The recommendation must be `approved` (by an admin, or by autopilot for a category an admin switched to automatic). `checkHardBlocks` refuses anything outside the table above.
2. **Drift check.** Read the live entity. Stop if the keyword is gone, the budget changed by more than 1%, the budget is shared, or the campaign is no longer enabled. If the change already exists (the keyword is already paused, the negative is already there), record a no-op.
3. **Dry run.** The same request with `validateOnly: true`. If Google rejects it, the action fails and the recommendation stays approved.
4. **Real write**, only when `MARKETING_AI_ALLOW_MUTATIONS=true` (or on the mock account).
5. **Record.** The `marketing_ai_actions` row gets the request, both responses and the revert payload. The recommendation becomes `executed` only after Google confirms; on any error it becomes `failed`. Audit rows are written before and after (`marketing_ai_audit_log`).
6. **Measure.** Seven days later, compare the campaign's CPA for the week before and the week after. If an automatic change made CPA 30% or more worse, that category goes back to approval and an alert is raised.

## Autopilot limits

- Autonomy level 2 or higher and the kill switch off.
- Safe categories (blocking off-scope searches, budget cuts, pausing wasteful keywords, keyword bid cuts) are automatic from day one. A budget or bid cut is only automatic if it really lowers the budget or bid.
- Never automatic, whatever the category's mode: a finding based on last season's conversions (evidence marked proxy), and the tidying rules R19 (case duplicates) and R20 (past exam year).
- Every other category needs an admin to switch it to automatic, and it must have earned it first: 15 decisions by people, 90% or more approved. Autopilot's own approvals do not count.
- Negatives also need AI confidence at or above the threshold (default 0.85, never below 0.7) and an intent on the block list (job seeker, other exam, other course). Searches for free NATA material are not on it.
- At most 10 automatic changes a day by default (hard ceiling 25).
- Each change appears in the morning email with an Undo.
