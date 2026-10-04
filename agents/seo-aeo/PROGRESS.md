# City SEO + AEO plan: progress

Plan: `~/.claude/plans/neram-seo-aeo-city-plan-this-plan-is-magical-tarjan.md` (approved 2026-10-03). Audit: `AUDIT_REPORT_2026-10.md`.

## Done (2026-10-03, uncommitted, not deployed)

- A1 Legacy redirects fixed and tested (`redirects.test.ts`).
- A3 One fact source (`PROOF_POINTS`) and the claims guardrail test.
- A4 Doubled "| Neram Classes" titles.
- B1 to B4 One page per classroom city: visit section, centre schema, `/contact/*` and Tambaram area guide 301s, "classroom" only on centre pages, duplicate GeoNames places merged.
- B5 (part) Non-English copies of the Chennai area guides 301 to English; their claims fixed.
- B6 (part) Tambaram hand content moved from the retired area guide.
- C1 to C3 Gate: reviewed content only, similarity check (60%), JEE city pages only with a classroom. `LOCATION_READINESS.md` from staging data.
- D1 Last updated and sources. D2 City videos (data-gated). D3 City reviews (data-gated). D4 WhatsApp in the sticky bar.
- E1 to E4 WhatsApp builder and tracking, first and last touch with AI channel on every lead, parent fields on the demo form, visit booking admin email.
- E5 Admin "Leads by channel" (`/leads/channels`); conversion to paid is not in it yet.
- F1 Organization schema site-wide, bot names in robots. F2 llms.txt centre links.
- F3 Docs: NAP_MASTER, CITATION_TARGETS, GBP_POST_PLAN, REVIEW_REQUEST_FLOW, QA_ANSWER_DRAFTS, OUTREACH_TARGETS, AI_PROMPT_SET.
- Verified: marketing + admin unit tests 678 passed; coaching-locations E2E 15/15 (marketing-chrome, 375px); marketing and admin tsc clean.
- Migrations 20261029090000 and 20261029090100 applied to STAGING only.

## Done (2026-10-03, round 2: physical-centre pages, uncommitted)

- Classroom city pages answer "NATA coaching centre in {city}":
  - the title and H1 say "Coaching Centre" with the locality, and the meta description leads with the street and landmark;
  - the hero has the address and a real hero photo;
  - a new "Our {city} centre" section has the reviewed About text, the opening year, facilities, "Students travel here from" (towns within 120 km, linked) and a gallery;
  - the visit card has a lazy Google Maps embed and an optional "Rated 4.7 on Google" line.
- Google signals:
  - `max-image-preview: large` on indexed location pages (it was dropped);
  - the hero photo as og:image;
  - photos, foundingDate and areaServed in the centre schema; primaryImageOfPage;
  - image sitemap `/sitemaps/centre-images/sitemap.xml`;
  - 4 or more centre photos count as a strong gate fact.
- Admin > Centres (`/centres`): a checklist per centre and an editor for photos (sharp renditions, EXIF stripped, a 1000px minimum), address, hours, About plus the reviewer tick, the Google profile, the Place ID review link and the rating. Saving purges the marketing `centers` tag.
- `google_business` channel (`utm_medium=gbp`) in attribution and in Leads by channel.
- Migration 20261031090000 (centre page fields plus the `centre-photos` bucket) applied to STAGING only.
- Off-page steps: `TN_CENTRE_PLAYBOOK.md`.

## Pending

- B5 Move the Chennai area guides (Anna Nagar, Adyar, Ashok Nagar, T Nagar, Velachery) onto the city template, or fold them into the Chennai page.
- G Tamil and Kannada pages, once reviewers are ready.
- Rerun `READINESS=1 npx vitest run apps/marketing/src/lib/seo/location-readiness.report.test.ts` against production data before deploy.

## DATA_NEEDED from the founder

| Item | Why | Where it goes |
|---|---|---|
| Kanchipuram street address | No LocalBusiness schema and no street on the page until it exists | Admin, centres (`offline_centers.address`) |
| Fix shared Google profile links: both Pudukkottai rows share one; Kanchipuram has Tambaram's | Shared links are hidden from the pages and schema | `offline_centers.google_business_url` |
| Google profiles for Bangalore HQ and Tiruppur | No profile linked | same |
| Real opening hours for all 10 centres | Every row has the same template hours (Mon to Fri 9 to 6, Sat 9 to 2), now shown on the pages | `offline_centers.operating_hours` |
| Centre photos, at least 4 per centre (outside with signboard, classroom, students drawing, results board) | Hero photo, gallery, og:image, image sitemap, gate fact | Admin > Centres |
| About text per centre, plus the reviewer tick | "Our {city} centre" section | Admin > Centres |
| Opening year per centre, the same on Google (Madurai profile says 15+ years, site says 10+) | "Teaching here since", foundingDate | Admin > Centres and the Google profile |
| Google Place ID per centre | Review link for staff | Admin > Centres |
| REVALIDATE_SECRET set in both the admin and marketing Vercel projects | Centre edits show within a minute | Vercel env |
| Kannada staff WhatsApp number | Kannada chats route to it | `KANNADA_WHATSAPP` in `apps/marketing/src/lib/whatsapp.ts` |
| Confirm the 9 legacy testimonials (Admin, Testimonials, "Confirm as genuine") and add the city | City pages show only moderated, published reviews | `testimonials` |
| City-tagged class clips and reviews | City pages and the video sitemap show them | `social_proofs.city_slug` |
| Staff review of the ~70 flagged facts | Reviewed content counts as a strong fact; set `reviewed: true` per entry | `location-content-review.md`, `data/geo/content/*.ts` |
| Hand facts for Pudukkottai and Kanchipuram (Tambaram drafted from the old area guide, unreviewed) | Local content for the centre pages | `data/geo/content/cities.ts` |
| Search Console clicks for `/contact/*`, `/coaching/nata-coaching-chennai/tambaram`, `/nata-coaching-in-chennai` | Before the consolidation 301s ship | GSC |
| Bing Webmaster Tools access | Submit the sitemap index | Bing |
| Reviewers for Tamil and Kannada | Phase G | |
