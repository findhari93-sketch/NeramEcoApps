# Aintra Answer Review and Correction Plan

A quality review of every answer Aintra gave across the 503 logged turns in
[aintra-chat-history.md](aintra-chat-history.md). The 503 turns collapse into **41 question
themes**. Each external fact the bot stated was verified against official sources (NATA / CoA,
NTA / JoSAA, TNEA, CEE Kerala, Karnataka KEA / COMEDK). Neram-internal facts (fees, timings,
demo, Nexus) cannot be web-verified, so for those the source of truth is your own admin
corrections, captured here.

## How to use this document

1. Skim the **Master table**: each theme has a verdict and a fix target.
2. Read the **Detailed corrections** only for themes marked Wrong / Needs-fix.
3. For each correction you agree with, leave it; where you disagree, edit the "Corrected answer".
4. Items tagged **CONFIRM (Neram)** need a one-word yes/no from you, I cannot verify them online.
5. When you approve, I apply: KB-bound answers go into `aintra_knowledge_base`, prompt-bound facts
   get edited into the system prompts (Phase B of the plan).

Verdict legend: ✅ Correct · ⚠️ Needs-fix (mostly right, one error) · ❌ Wrong · 🕓 Outdated ·
🔌 Unanswered (API error) · 🔒 Neram-internal (confirm with you).

---

## Top findings (the ones that matter most)

1. **❌ NATA "has no pass mark" is WRONG.** The bot repeatedly told students there is no minimum
   qualifying score. The CoA brochure sets qualifying marks: **60/200 overall, 20/80 in Part A,
   20/120 in Part B**. One answer (Session 202) got this right; most got it wrong.
2. **🕓 NATA exam fee is outdated in your prompt.** Prompt and bot say ₹1,750 / ₹1,250. Correct
   2026 fee is **₹2,000 (General/OBC), ₹1,500 (SC/ST/PwD)**, ₹4,000 for both tests.
3. **❌ Karnataka B.Arch "needs NATA, not JEE" is WRONG.** Both KEA (govt) and COMEDK (private)
   accept **either NATA or JEE Main Paper 2**.
4. **❌ KEAM eligibility % is wrong.** Bot said 45%; Kerala B.Arch needs **50% in Physics,
   Chemistry, Maths**.
5. **⚠️ Your own admin correction was the mistaken one (IITs).** An admin note said "only IIT
   Roorkee and Kharagpur offer B.Arch." Official AAT 2026 shows **three**: Roorkee, Kharagpur,
   **and IIT (BHU) Varanasi**. The bot's original "3 IITs" answer was correct. (Worth knowing
   before we promote admin corrections into the KB wholesale.)
6. **❌ "Physics + Chemistry + Maths compulsory for NATA" is WRONG.** Compulsory subjects are
   **Physics + Maths**; the third can be Chemistry, Biology, CS, etc. Minimum 45% (40% reserved).
7. **✅ Several claims you might have doubted are actually correct:** NATA Part B really is an
   adaptive test; the exam medium really is English + Hindi only; TNEA really does use the
   higher of your NATA-or-JEE score. These need no change.
8. **🔌 The bot is currently dead.** 27 turns and the 5 most recent sessions all failed with
   HTTP 429 "prepayment credits are depleted", the shared `GEMINI_API_KEY` is out of credit.
   No code fix, it needs a billing top-up. Until then Aintra answers nothing on the live site.

---

## Master table (41 themes)

| # | Theme | Turns | Verdict | Issue (1 line) | Fix target |
|---|-------|------:|---------|----------------|-----------|
| 1 | NATA qualifying / pass mark | ~9 | ❌ Wrong | Said "no minimum"; real cutoff is 60/200, 20/80, 20/120 | Prompt + KB |
| 2 | NATA eligibility (subjects/age/%) | ~10 | ⚠️ Needs-fix | "Physics+Chem+Maths compulsory" wrong; it's Physics+Maths+1 | Prompt + KB |
| 3 | NATA exam fee | (in dates) | 🕓 Outdated | ₹1,750/₹1,250 → ₹2,000/₹1,500 | Prompt + KB |
| 4 | NATA exam pattern / marks | ~30 | ✅ Correct | 200 marks, Part A 80 offline, Part B 120 online, no -ve | none |
| 5 | NATA Part B adaptive scoring | (in 4) | ✅ Correct | Adaptive CBT, marks 1/2/3, was doubted but true | none |
| 6 | NATA exam medium / language | ~9 | ⚠️ Needs-fix | Exam = English+Hindi (right); confused with Neram teaching language | KB + CONFIRM |
| 7 | NATA 2026 dates / phases / reg | ~16 | ✅ Correct | Phase 1 Apr4-Jun13, Phase 2 Aug7-8, only one phase | none |
| 8 | NATA Phase 1 vs Phase 2 purpose | ~7 | ✅ Correct | Phase1 for CAP counselling, Phase2 vacant seats | KB (admin) |
| 9 | NATA score validity / carryover | ~6 | ⚠️ Needs-fix | Sources conflict (1 yr vs 2 yr); carryover nuance | KB + verify on nata.in |
| 10 | NATA results / admit card / items | ~12 | ✅ Mostly | Items list right; jewelry per admin; results ~3-7 days | KB (admin) |
| 11 | NATA syllabus detail | ~10 | ✅ Correct | Part A/B topic breakdown accurate | none |
| 12 | NATA score → college chances | ~24 | ✅ OK | Directs to predictor; no hard errors | none |
| 13 | JEE Paper 2A pattern / marks | ~10 | ⚠️ Needs-fix | "Maths 30 Q" → 25 Q; total 400, 3.5 hrs correct | Prompt note + KB |
| 14 | IITs offering B.Arch + AAT | ~3 | ⚠️ Admin-wrong | 3 IITs (incl. BHU), AAT Jun 4 2026; admin note said 2 | KB |
| 15 | JoSAA NIT/SPA/IIIT choice filling | ~14 | ⚠️ Needs-fix | IIITs do NOT offer B.Arch; rest correct | KB |
| 16 | TNEA B.Arch merit (NATA/JEE) | ~22 | ✅ Correct | Board PCM/200 + higher of NATA-or-JEE/200 = /400 | KB |
| 17 | KEAM B.Arch (Kerala) | ~7 | ⚠️ Needs-fix | Needs 50% PCM (not 45%); rest OK | KB |
| 18 | Karnataka KCET / COMEDK B.Arch | ~3 | ❌ Wrong | Accepts NATA OR JEE Paper 2, not NATA-only | KB |
| 19 | Maharashtra / other-state counselling | ~4 | ✅ OK | OMS quota, MHT-CET colleges; reasonable | none |
| 20 | College info / cutoffs / lists | ~14 | ⚠️ Needs-fix | Anna Univ fee ₹45,200 (admin); SASTRA has no arch | KB + DB |
| 21 | NATA vs JEE which easier / colleges | ~6 | ✅ Correct | NITs/SPAs via JEE; NATA for state/private | none |
| 22 | Exam-day drawing-section help | ~8 | ✅ Correct | A3 sheet, 3D composition, perspective | none |
| 23 | Self-study without coaching | ~14 | ✅ OK | Encourages free tools; markets Nexus | KB (Nexus) |
| 24 | Course fees (Neram) | ~52 | 🔒 Confirm | 15k/25k/30k structure, consistent | CONFIRM |
| 25 | Class timings / mode | ~30 | 🔒 Confirm | 7-8:30pm online; reframe offline "inconsistency" | CONFIRM (admin) |
| 26 | Offline classes / centers | ~16 | 🔒 Confirm | Center list; Chennai = KK Nagar Puthur | CONFIRM (admin) |
| 27 | How to apply / enroll | ~16 | 🔒 Confirm | Do NOT push demo to enrollment-intent users | CONFIRM (admin) |
| 28 | Batch start / enrollment timing | ~16 | 🔒 Confirm | New batch every Monday; auto study-tracking | CONFIRM (admin) |
| 29 | Demo class booking | ~9 | 🔒 Confirm | Paused till Sept, year-long only | CONFIRM (admin) |
| 30 | Scholarship | ~11 | 🔒 Confirm | Docs + 3-5 day review | CONFIRM |
| 31 | Program details / duration | ~20 | 🔒 Confirm | Crash 3mo / 1yr / 2yr; software courses | CONFIRM |
| 32 | Payment / EMI / installments | ~7 | 🔒 Confirm | Installment totals, not monthly | CONFIRM |
| 33 | Free tools / app.neramclasses.com | ~22 | 🔒 Confirm | Tool list; steer to Nexus for enrolled | CONFIRM (admin) |
| 34 | Nexus premium app | ~12 | 🔒 Confirm | Enrolled-only, 10k+ Q bank | CONFIRM (admin) |
| 35 | Teaching language (Neram) | ~9 | 🔒 Confirm | English + Tamil/Hindi/Malayalam/Kannada | CONFIRM (admin) |
| 36 | Success rate / track record | ~10 | 🔒 Confirm | Fix "87 marks" → 187 NATA / 100%ile JEE 2024 | CONFIRM (admin) |
| 37 | Founders / internal team | 2 | 🔒 Confirm | Decline competitor probing; IIT/NIT grads | CONFIRM (admin) |
| 38 | Bot identity ("who are you") | ~7 | 🔒 Confirm | "Aintra, India's first NATA/JEE2 assistant" | CONFIRM (admin) |
| 39 | Teaching methodology / classes | ~20 | 🔒 Confirm | Group Teams classes, mocks, doubts | CONFIRM |
| 40 | Account / data deletion, support | ~7 | ✅ OK | Routes to human; compliance-safe | none |
| 41 | Errored, no response | 27 | 🔌 API | All 429 credit-depletion + a few config errors | Billing + config |

---

## Detailed corrections, EXTERNAL facts (web-verified)

### 1. NATA qualifying / pass mark ❌ → Prompt + KB
- **Bot said (most turns):** "NATA has no minimum qualifying score / no pass mark."
- **Verified:** NATA 2026 qualifying marks per CoA brochure: **60 out of 200 overall, 20 out of 80
  in Part A, 20 out of 120 in Part B.** Source: collegedekho.com/exam/nata/exam-pattern (citing
  CoA brochure), nata.in brochure.
- **Corrected answer:** "NATA does have qualifying marks. To qualify you need at least 60 out of
  200 overall, with a minimum of 20 out of 80 in Part A (Drawing) and 20 out of 120 in Part B.
  Qualifying makes you eligible for B.Arch admission, but the actual cutoff to GET a seat in a
  good college is much higher and depends on counselling competition."
- **Action:** Fix the line in the general prompt that says "No minimum qualifying score" and add a KB entry.

### 2. NATA eligibility (subjects / age / %) ⚠️ → Prompt + KB
- **Bot said (inconsistent):** sometimes "Physics + Chemistry + Maths compulsory"; sometimes
  "Physics + Maths only."
- **Verified:** 10+2 with **Physics and Mathematics compulsory, plus one more subject**
  (Chemistry, Biology, Computer Science, etc.); OR a 10+3 Diploma with Mathematics. Minimum
  **45% aggregate** (40% for SC/ST/OBC-NCL/PwD). **No upper age limit.** Appearing 10+2 students
  are eligible. Source: careers360 NATA eligibility, pw.live NATA eligibility.
- **Corrected answer:** "To be eligible for NATA / B.Arch you need 10+2 with Physics and
  Mathematics as compulsory subjects, plus one more subject (Chemistry, Biology, Computer Science
  or similar), with at least 45% aggregate (40% for SC/ST/OBC-NCL/PwD). A 10+3 diploma with
  Mathematics also qualifies. There is no upper age limit, and students currently in 12th can
  appear (the score is used for admission in the year you pass 12th)."
- **Action:** Replace the eligibility line in the prompt; add KB entry.

### 3. NATA exam fee 🕓 → Prompt + KB
- **Bot / prompt said:** ₹1,750 General, ₹1,250 SC/ST/EWS/PwD.
- **Verified:** **₹2,000 for one test (General/OBC), ₹1,500 (SC/ST/PwD); ₹4,000 for both tests.**
  Non-refundable. Source: pw.live NATA application form, toprankers NATA application form.
  (Note: one aggregator quoted ₹10,000, that appears incorrect; ₹2,000 is consistent across
  multiple sources and matches historical NATA fees.)
- **Corrected answer:** "The NATA 2026 application fee is ₹2,000 for one test (General/OBC) and
  ₹1,500 for SC/ST/PwD. Appearing for both tests in Phase 1 costs ₹4,000. The fee is paid online
  and is non-refundable. (This is the exam fee paid to the Council of Architecture, separate from
  Neram's coaching fee.)"
- **Action:** Update the NATA fee line in the general prompt and NATA prompt; add KB entry.

### 6. NATA exam medium / language ⚠️ → KB + CONFIRM
- **Bot said (inconsistent):** sometimes correctly "exam is English and Hindi only"; in other
  turns it confused this with the language Neram teaches in.
- **Verified (exam):** NATA 2026 question paper is in **English and Hindi only**, candidate can
  switch between them; **no regional languages.** Source: pw.live, shiksha NATA.
- **CONFIRM (Neram teaching):** Your admin correction (Session 148) says Neram TEACHES in
  "English and local languages like Tamil, Hindi, Malayalam, Kannada." So two different facts:
  the EXAM is English/Hindi; Neram's CLASSES are multilingual.
- **Corrected answer:** "The NATA exam itself is conducted only in English and Hindi (you can
  switch between them in the test), there is no Tamil/Telugu/regional-language question paper.
  Neram's coaching classes, however, are taught in English along with local languages like
  Tamil, Hindi, Malayalam and Kannada, so you can learn comfortably even if your medium is
  regional."
- **Action:** KB entry that separates "exam language" from "teaching language." Confirm the
  teaching-language list is current.

### 9. NATA score validity / carryover ⚠️ → KB + verify on nata.in
- **Bot said:** NATA 2025 score valid for 2026-27 if not admitted in 2025-26; taking a 2026
  attempt changes things; best-of-attempts considered.
- **Verified:** Sources conflict, some say the score is valid for the **2026-27 session only**,
  others say **two academic years**. The multi-attempt "best score / consolidated scorecard"
  logic is real but the exact carryover rule is not cleanly documented on secondary sites.
  Source: silica.co.in NATA guide, shiksha NATA (conflicting).
- **Corrected answer (safe version):** "A NATA score is used for admissions in the same admission
  cycle, and if you take multiple attempts your best score is considered. Carryover of an older
  score (for example, using a 2025 score for 2026-27 admission) is subject to CoA's
  consolidated-scorecard rules, which can change year to year. Please confirm the exact validity
  for your case on the official brochure at nata.in before relying on it."
- **Action:** KB entry with the cautious wording; I recommend you confirm the precise 2025→2026
  carryover rule from the brochure so we can state it definitively.

### 13. JEE Main Paper 2A pattern ⚠️ → KB (+ small prompt note)
- **Bot said:** Maths 30 questions (20 MCQ + 10 numerical, attempt 5); Aptitude 50; Drawing 2.
- **Verified:** Paper 2A (B.Arch) = **400 marks, 3.5 hours**. **Mathematics 25 questions (100
  marks), Aptitude 50 questions (200 marks), Drawing 2 questions (100 marks).** Negative marking
  **-1** for wrong answers in Maths and Aptitude (MCQ and numerical); none in Drawing. Drawing is
  offline; Maths + Aptitude are online CBT. Source: testbook JEE pattern, collegedekho JEE pattern,
  vedantu JEE marking scheme.
- **Corrected answer:** "JEE Main Paper 2A (B.Arch) is 400 marks over 3.5 hours: Mathematics (25
  questions, 100 marks), Aptitude (50 questions, 200 marks) and Drawing (2 questions, 100 marks).
  Maths and Aptitude are online with -1 negative marking for wrong answers; Drawing is on paper
  with no negative marking."
- **Action:** KB entry; minor note in prompt if JEE pattern is hardcoded anywhere.

### 14. IITs offering B.Arch + AAT ⚠️ (your admin note was wrong) → KB
- **Bot said (original):** IIT Roorkee, IIT Kharagpur, IIT (BHU) Varanasi, via JEE Advanced + AAT.
- **Admin correction said:** "only IIT Roorkee and IIT Kharagpur."
- **Verified:** **Three IITs** offer B.Arch, Roorkee, Kharagpur, **and IIT (BHU) Varanasi**, all
  via JEE Advanced + the **AAT (Architecture Aptitude Test), held June 4, 2026**, registered
  through jeeadv.ac.in. Source: careers360 (AAT 2026 / IIT B.Arch), news.careers360 JEE AAT 2026.
- **Corrected answer:** "Three IITs offer B.Arch: IIT Roorkee, IIT Kharagpur and IIT (BHU)
  Varanasi. To get in you must qualify JEE Advanced and then clear the AAT (Architecture Aptitude
  Test), which is held shortly after JEE Advanced results (AAT 2026 was on June 4). AAT is a
  pass/fail aptitude test registered via jeeadv.ac.in. No other IITs offer architecture."
- **Action:** KB entry. **Heads-up:** do not promote the "only 2 IITs" admin correction into the
  KB, it is factually wrong.

### 15. JoSAA NIT / SPA / IIIT choice filling ⚠️ → KB
- **Bot said:** B.Arch via JoSAA at NITs, SPAs, "and some IIITs."
- **Verified:** B.Arch through JoSAA (~600 seats) is at **10 NITs, IIEST Shibpur, 3 SPAs (Delhi,
  Bhopal, Vijayawada)** via JEE Main Paper 2, plus the **3 IITs** via JEE Advanced + AAT.
  **IIITs do not offer B.Arch.** Counselling runs ~6 rounds late June to July. Source: pw.live
  JoSAA seat matrix, collegedekho JoSAA architecture cutoff.
- **Corrected answer:** "Through JoSAA, B.Arch seats are at the NITs, IIEST Shibpur, and the three
  SPAs (Delhi, Bhopal, Vijayawada), all via JEE Main Paper 2 rank, plus three IITs (Roorkee,
  Kharagpur, BHU) via JEE Advanced + AAT. IIITs do not offer B.Arch. Use josaa.nic.in for the
  seat matrix and previous years' opening/closing ranks for your category."
- **Action:** KB entry; remove the "some IIITs" claim.

### 16. TNEA B.Arch merit ✅ (confirm, then KB) → KB
- **Bot said:** merit /400 = board marks /200 + higher of NATA-or-JEE Paper 2 /200; TNEA picks
  the higher of the two.
- **Verified:** Correct. TNEA B.Arch merit is out of **400 = Class 12 board marks (Physics,
  Chemistry, Maths) normalised to 200 + NATA or JEE Paper 2 normalised to 200**; if you have
  **both, the higher is used.** Portal barch.tneaonline.org. Source: TNEA B.Arch information
  brochure (static.tneaonline.org), careermantrana NATA/JEE B.Arch guide.
- **Corrected answer:** "For TNEA B.Arch (Tamil Nadu) your merit is out of 400: your Class 12
  Physics, Chemistry and Maths marks scaled to 200, plus your NATA or JEE Main Paper 2 score
  scaled to 200. If you have both NATA and JEE Paper 2, TNEA uses whichever is higher. You do not
  need a separate 'raw' score, the portal normalises your exam score for you. Register at
  barch.tneaonline.org."
- **Action:** KB entry (this directly answers the errored Session 3 question about JEE percentile
  with no raw score).

### 17. KEAM B.Arch (Kerala) ⚠️ → KB
- **Bot said:** NATA + 12th, 50:50; eligibility 45%; application around Jan 5-31, NATA upload Feb 7.
- **Verified:** Needs a qualified **NATA** score. Academic eligibility is **50% aggregate in
  Physics, Chemistry and Maths** (or 10+3 diploma with Maths, 50%), higher than NATA's own 45%.
  Merit is **50:50 (NATA + Plus Two PCM marks)**. 2026 application last date extended to
  **Feb 6, 2026**, via cee.kerala.gov.in. Source: cee.kerala.gov.in notification, careers360
  KEAM B.Arch, tkmsa.ac.in.
- **Corrected answer:** "For B.Arch in Kerala (through CEE Kerala / KEAM) you must qualify NATA.
  Academic eligibility is a pass in 10+2 with at least 50% aggregate in Physics, Chemistry and
  Maths (or a 10+3 diploma with Maths at 50%). Your rank is a 50:50 combination of your NATA score
  and your Plus Two PCM marks. Apply at cee.kerala.gov.in. Kerala uses NATA, not JEE Paper 2, for
  this route."
- **Action:** KB entry; note the 50% (not 45%) Kerala requirement.

### 18. Karnataka KCET / COMEDK B.Arch ❌ → KB
- **Bot said:** "A valid NATA score is mandatory for B.Arch via both KCET and COMEDK; JEE Paper 2
  not typically used by KEA."
- **Verified:** Neither KEA nor COMEDK conducts a separate architecture entrance. Candidates must
  qualify **either NATA (CoA) or JEE Main Paper 2 (NTA)**. COMEDK 2026 explicitly accepts **NATA
  and JEE Paper 2**. Source: shiksha COMEDK B.Arch counselling, careers360 KCET B.Arch admission.
- **Corrected answer:** "For B.Arch in Karnataka, KEA handles government-quota seats and COMEDK
  handles private seats, neither conducts its own architecture exam. You qualify with either a
  NATA score or a JEE Main Paper 2 score (both are accepted). So JEE Paper 2 is not limited to
  NITs, it works for Karnataka B.Arch too."
- **Action:** KB entry; correct the NATA-only claim.

### 20. College info / cutoffs / lists ⚠️ → KB + DB
- **Verified / corrected facts:**
  - **SASTRA University has no B.Arch / architecture program** (the bot hedged; admin Session 125
    confirmed "no"). Verifiable, so state it plainly.
  - **Anna University SAP B.Arch fee** is approximately **₹45,200/year** per your admin (Session
    166), not the ₹33,000 the bot quoted earlier.
- **Action:** KB entries for SASTRA and Anna University fee; longer term these belong in the
  `colleges` DB table that the chat tools read from.

---

## Detailed corrections, NERAM-INTERNAL facts (need your CONFIRM)

These are your own facts. I have written the canonical answer from your admin corrections; please
confirm each is current. (Y/N or edit.)

| Theme | Canonical answer to lock in (from your admin corrections) | Confirm? |
|-------|-----------------------------------------------------------|:--------:|
| 35 Teaching language | Classes are in English plus Tamil, Hindi, Malayalam and Kannada. | ☐ |
| 36 Track record | Best results: 187 in NATA and 100 percentile in JEE Paper 2 (2024), 99.98 percentile in JEE 2026. (Stop saying "100% track record of 87 marks", it reads wrong.) | ☐ |
| 27/29 Demo class | Demo classes are paused until September and only for the year-long program. For anyone asking to enroll, give the application form directly, do NOT push them to a demo. | ☐ |
| 28 Batch start | A new batch starts every Monday; an automated study-tracking system ensures every student covers every topic regardless of join date, so join date is not a worry. Enroll early for more prep time. | ☐ |
| 34/33 Nexus | Nexus by Neram is the premium app for enrolled students (10,000+ question bank, live + recorded classes, progress tracking), not on Play Store / App Store. Steer self-learning queries here, not just app.neramclasses.com. | ☐ |
| 25 Online vs offline | Both online and offline (and hybrid) programs are fully consistent. Offline can feel inconsistent only because of student travel time and schedules, not the program itself. | ☐ |
| 38 Bot identity | "I am Aintra, India's first smart assistant built only for NATA and JEE Paper 2 queries, developed by the Neram Classes research lab." | ☐ |
| 37 Founders | "Neram was founded by a group of IIT/NIT graduates. We do not share details about our internal team." (Decline competitor-style probing.) | ☐ |
| 26 Chennai center | Chennai center location: KK Nagar, Puthur, near Mavukattu signal. | ☐ |
| 24 Course fees | Crash (3 mo) ₹15,000; 1-Year ₹30,000 installments / ₹25,000 single; 2-Year ₹35,000 installments / ₹30,000 single. | ☐ |
| 10 Exam-day jewelry | Per last year's student feedback, light jewelry is allowed in the NATA exam. | ☐ |
| login Enrolled-student login | Ask enrolled students with login problems to connect with the team's account / staff for help. | ☐ |

---

## The error backlog (Theme 41) 🔌

27 turns returned nothing. Breakdown:
- **Majority, HTTP 429 "prepayment credits are depleted"** (`GEMINI_API_KEY` out of credit). This
  is the live-site outage. Fix = top up the Gemini billing / rotate to a funded key.
- A few config errors worth a code check:
  - `HTTP 400 "Built-in tools (google_search) and Function Calling cannot be combined"` , a
    request mixed Google Search grounding with our function-calling tools. If we ever enable
    search grounding, it must not be sent alongside the college tools.
  - `HTTP 400 "API Key not found"` and `HTTP 404` deprecated 2.0 models , stale key / model id
    in one path.
- Several of these errored turns still received good admin corrections (Sessions 169, 173, 174),
  those answers are folded into the themes above.

---

## Sources (official-first)

- NATA / CoA: nata.in (brochure), coa.gov.in; pattern + qualifying via collegedekho.com/exam/nata,
  pw.live NATA; eligibility via careers360 NATA; fee via pw.live / toprankers NATA application form.
- JEE Main Paper 2A: testbook.com/jee-main/exam-pattern, collegedekho JEE pattern, vedantu marking.
- AAT / IIT B.Arch / JoSAA: jeeadv.ac.in, news.careers360 JEE AAT 2026, pw.live JoSAA seat matrix,
  collegedekho JoSAA architecture cutoff.
- TNEA B.Arch: barch.tneaonline.org, static.tneaonline.org B.Arch brochure, careermantrana guide.
- KEAM: cee.kerala.gov.in notification, careers360 KEAM B.Arch.
- Karnataka: shiksha COMEDK B.Arch counselling, careers360 KCET B.Arch admission.

> Forward-looking 2026 facts (exact dates, validity, fee) can still change, the safe ones are
> marked; please confirm the NATA score-carryover rule and the Neram-internal table before we
> push anything into the live bot.
