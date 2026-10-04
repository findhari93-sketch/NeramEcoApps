# Tamil Nadu centre playbook: winning "NATA coaching centre in {city}"

Written 2026-10-03, after a search for "best nata coaching center in madurai":

| Where | First | Neram |
|---|---|---|
| Map pack | I-ARCH, 4.8 from 296 reviews | Second, 4.7 from 37 reviews |
| Organic results | I-ARCH's centre page, with a classroom photo as its thumbnail | Not near the top |

Two different systems decide this search:

| Where | Decided by | Who fixes it |
|---|---|---|
| Map pack (the 3 pins) | The Google Business Profile: how many reviews, how recent they are, how complete the profile is, distance to the searcher | Centre staff and the founder, sections 1 to 5 below |
| Organic results (the blue links) | The centre page: address and landmark in the text, real photos, the map, schema, one page per centre | Already built (Admin > Centres feeds it). Staff fill the data |

Do not copy I-ARCH's profile name ("I-Arch - Nata Coaching Centres in Madurai"). Adding keywords to a business name breaks Google's rules and can get the profile suspended.

## 0. Before anything: the site must be live

The production marketing deploy of the location build failed on 2026-10-01 (Node 20), so none of the centre page work is on neramclasses.com yet. Follow the deploy steps in `AUDIT_REPORT_2026-10.md`. Until then, Madurai has two pages competing for the same search (`/contact/nata-coaching-center-in-madurai` and the city page).

## 1. Fill each centre in Admin > Centres (staff, one afternoon per centre)

Admin > Centres shows a checklist per centre. Work down it:

1. **Photos, at least 4**, taken on a phone at the centre (send the original file, not a WhatsApp copy):
   - the outside of the building with the Neram signboard readable;
   - the classroom, empty or in use;
   - students drawing, with backs or hands rather than faces unless the student agreed;
   - the results or toppers board.
   For each, write what it shows and name the place, for example "Students drawing in the Vasanth Nagar classroom, Madurai". Pick the best one as the main photo; Google is most likely to use it as the result thumbnail.
2. **Street address, pincode and landmark**, exactly as on the Google profile.
3. **Real opening hours.** Every centre still shows the same placeholder hours.
4. **About this centre**: 2 to 4 short paragraphs of plain facts. Where it is and how to reach it, which batches run there and when, who teaches, what a day looks like. No "best" or "No.1". A second person then ticks the reviewer box.
5. **Year the centre opened.** Use the same year on Google. The Madurai profile says "15+ years in business" while the site says 10+ years, so fix whichever one is wrong.
6. **Google profile link and Place ID.** The Place ID turns on the "Copy Google review link" button.
7. **Rating and review count from Google, with today's date.** The page shows "Rated 4.7 on Google by 37 students (checked ...)" for 90 days, then hides it until someone checks again.

Saving purges the page cache, so the page updates within a minute once `REVALIDATE_SECRET` is set in both Vercel projects.

## 2. Reviews: the biggest gap (centre staff, every week)

Neram has 37 reviews against I-ARCH's 296. Reviews count more than anything else in the map pack.

- Target: 8 to 10 new reviews a month per centre, spread out over time rather than in bursts.
- Ask every student and parent the same way, at 3 moments:
  1. after the demo class;
  2. at the end of the first month;
  3. on results day.
- Send the link from Admin > Centres > "Copy Google review link" on WhatsApp. The message template is in `REVIEW_REQUEST_FLOW.md` (English and Tamil).
- Put a QR code to the same link on the classroom wall and the front desk.
- Never offer anything for a review (discounts, gifts, marks), never write reviews for students, and never ask only the happy ones. All three break Google's rules, and Google removes reviews in bulk when it detects them.
- Reply to every review within 2 days. Thank the student by first name, mention the centre and the city in a natural way, and answer complaints calmly and specifically.

## 3. Google Business Profile, per centre (founder or centre lead)

- **Primary category:** Coaching center. Add Educational institution only if it fits.
- **Services:** NATA coaching, JEE Paper 2 (B.Arch) coaching, NATA drawing classes, NATA crash course.
- **Description**, 750 characters: what is taught, the area and landmark, the towns students come from, and batch types. No phone numbers or URLs in the text.
- **Website link:** the centre's city page, tagged so its leads show in Admin > Leads by channel as "Google Maps (business profile)":
  `https://neramclasses.com/coaching/nata-coaching/nata-coaching-centers-in-madurai?utm_source=google&utm_medium=gbp&utm_campaign=madurai`
  The page's canonical tag drops the query, so this costs nothing in SEO.
- **Photos:** upload the same real photos as in Admin > Centres, then add 2 or 3 new ones a month (a class in progress, a results day, a drawing workshop).
- **Posts:** one a week, following `GBP_POST_PLAN.md`.
- **Q&A:** seed the 5 questions parents actually ask (fees, batch timings, Tamil medium, online option, demo class) and answer them from the profile.
- **Hours:** the same as in Admin > Centres, plus holiday hours before festivals.

## 4. One set of facts everywhere (NAP)

Name, address and phone must match character for character on the Google profile, the site (Admin > Centres), Justdial, Sulekha and Facebook. The master list is `NAP_MASTER.md`. Known problems on 2026-10-03:

- Both Pudukkottai centres point to one Google profile link. Each needs its own.
- Kanchipuram carries Tambaram's profile link and has no street address.
- Bangalore HQ and Tiruppur have no profile linked.

The site hides a profile link that two centres share, until the data is fixed.

## 5. Justdial and other directories

Justdial list pages hold 2 of the top results for this search. For each Tamil Nadu centre:

- Claim or create the Justdial listing with the same name, address and phone, the same photos, and the website link.
- Ask a few students to review on Justdial as well. It feeds the "Top NATA coaching in Madurai" list pages.
- Then do Sulekha, and the remaining entries in `CITATION_TARGETS.md`.

## 6. Check progress (monthly)

- Search "nata coaching centre in {city}" and "nata coaching {city}" for the 8 centre cities, logged out, on a phone in or near each city if possible. Note the map pack position, the organic position and whether a photo thumbnail shows. Log the results in `AI_PROMPT_SET.md`.
- Search Console: impressions and clicks for each centre page. Use URL Inspection to confirm Google picked up the photos (the "Page resources" list and the rendered HTML show them).
- Admin > Leads by channel: leads from "Google Maps (business profile)" and from Google search, per city page.
- Admin > Centres: every centre's checklist should be complete.

Expect the organic change 2 to 6 weeks after deploy and photos, and the map pack to move only as reviews build up.
