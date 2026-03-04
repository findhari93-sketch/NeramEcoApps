# NATA 2026 — Complete Implementation Plan

## Project Overview

Build a comprehensive NATA 2026 information ecosystem across the Neram Classes platform consisting of:

- **Marketing App** (`neramclasses.com`) — SEO/AEO-optimized hub + spoke pages
- **Admin App** (`admin.neramclasses.com`) — Content management for dynamic data
- **Tools App** (`app.neramclasses.com`) — Interactive tools for students

**Tech Stack:** Next.js, TypeScript, Firebase, Material UI

**Primary Data Source:** NATA 2025 Brochure (V1.2) — to be updated when NATA 2026 brochure releases. Structure remains largely similar year to year.

---

## Architecture Overview

```
neramclasses.com/nata-2026 (Hub Page — Marketing App)
├── /nata-2026/how-to-apply
├── /nata-2026/eligibility
├── /nata-2026/syllabus
├── /nata-2026/exam-centers
├── /nata-2026/fee-structure
├── /nata-2026/exam-pattern
├── /nata-2026/photo-signature-requirements
├── /nata-2026/important-dates
├── /nata-2026/scoring-and-results
├── /nata-2026/dos-and-donts
├── /nata-2026/cutoff-calculator
└── [AI Chatbot embedded on hub page — NOT in tools app]

app.neramclasses.com (Tools App)
│
├── PUBLIC PAGES (No auth, SEO landing pages for each tool)
│   ├── /nata/exam-centers          ← public SEO page with tool preview + CTA
│   ├── /nata/cutoff-calculator     ← public SEO page with tool preview + CTA
│   ├── /nata/college-predictor     ← public SEO page with tool preview + CTA
│   ├── /nata/question-bank         ← public SEO page with tool preview + CTA
│   ├── /nata/seat-matrix           ← public SEO page (coming soon)
│   ├── /nata/college-reviews       ← public SEO page (coming soon)
│   ├── /nata/eligibility-checker   ← public SEO page with tool preview + CTA
│   ├── /nata/cost-calculator       ← public SEO page with tool preview + CTA
│   └── /nata/image-crop-resize     ← public SEO page with tool preview + CTA
│
├── AUTHENTICATED TOOL PAGES (Full tool behind login — same component, full features)
│   ├── /app/nata/exam-centers          ← full tool (existing)
│   ├── /app/nata/cutoff-calculator     ← full tool (existing)
│   ├── /app/nata/college-predictor     ← full tool (existing)
│   ├── /app/nata/question-bank         ← full tool (existing)
│   ├── /app/nata/seat-matrix           ← full tool (coming soon)
│   ├── /app/nata/college-reviews       ← full tool (coming soon)
│   ├── /app/nata/eligibility-checker   ← full tool (coming soon → build now)
│   ├── /app/nata/cost-calculator       ← full tool (coming soon → build now)
│   └── /app/nata/image-crop-resize     ← new tool
│
└── SIDEBAR: Compact admin-style (match admin.neramclasses.com)

admin.neramclasses.com (Admin Panel)
├── /nata/exam-centers (CRUD for centers)
├── /nata/brochure-versions (PDF upload + version management)
├── /nata/promotional-banners (ad management)
├── /nata/faq (FAQ CRUD)
└── /nata/announcements (announcement bar management)
```

### Key Architecture Decisions

1. **AI Chatbot lives on the marketing hub page** (`neramclasses.com/nata-2026`), NOT on the tools app. It's a brochure-based info assistant that helps visitors — it belongs where the information is.

2. **Each tool has TWO versions:**
   - **Public SEO page** (no auth): Landing page with tool description, limited preview/demo, SEO content, and CTA to sign up or login for full access. This captures search traffic like "NATA cutoff calculator", "NATA exam centers list", etc.
   - **Authenticated full tool** (behind login): The complete interactive tool with all features, saved history, personalized data.

3. **Tools app UI matches admin app** — compact interface with smaller font sizes, tighter spacing, admin-style sidebar. See "UI Consistency" section below.

### Existing Tools Status (from screenshot)

| Tool | Status | Action |
|---|---|---|
| Exam Centers | ✅ Active | Add public SEO page |
| Cutoff Calculator | ✅ Active | Add public SEO page |
| College Predictor | ✅ Active | Add public SEO page |
| Question Bank | ✅ Active | Add public SEO page |
| Seat Matrix | 🔜 Coming Soon | Add public SEO page (coming soon) |
| College Reviews | 🔜 Coming Soon | Add public SEO page (coming soon) |
| Eligibility Checker | 🔜 Coming Soon | **Build tool** + add public SEO page |
| Cost Calculator | 🔜 Coming Soon | **Build tool** + add public SEO page |
| Image Crop & Resize | 🆕 New | **Build tool** + add public SEO page |

---

## PART 1: MARKETING APP (`neramclasses.com`)

### 1.1 Hub Page — `/nata-2026`

**Purpose:** Central landing page linking to all spoke pages and tools. Captures SEO traffic for "NATA 2026" broad queries.

**SEO Meta:**
- Title: `NATA 2026 — Complete Exam Guide, Dates, Syllabus, Eligibility & Free Tools | Neram Classes`
- Description: `Everything about NATA 2026 exam — eligibility, syllabus, exam pattern, fee structure, exam centers, how to apply, cutoff calculator & free preparation tools. India's first AI-enabled NATA learning platform.`
- H1: `NATA 2026 — Complete Exam Guide`
- Canonical: `https://neramclasses.com/nata-2026`

**AEO Strategy:**
- First 2-3 lines should directly answer "What is NATA 2026?" in plain language
- Add FAQ schema markup with top 5-8 most searched questions
- Use structured data: `WebPage`, `FAQPage`, `BreadcrumbList`

**Page Sections (in order):**

#### Section 1: Announcement Bar (Admin-controlled)
- Top sticky bar for urgent notices (e.g., "Registration closing in 3 days!")
- Fields from admin: `text`, `link`, `bgColor`, `isVisible`, `startDate`, `endDate`
- Auto-hides after `endDate`

#### Section 2: Hero Section
- H1: "NATA 2026 — Complete Exam Guide"
- Subtitle: "Everything you need to know about the National Aptitude Test in Architecture"
- Quick stats strip: `Total Marks: 200 | Duration: 3 Hours | Attempts: Up to 3 | Mode: Offline + Online`
- CTA buttons: "Check Eligibility" → tools app, "How to Apply" → spoke page

#### Section 3: Promotional Banner (Admin-controlled)
- "First AI-Enabled NATA Learning Platform — Join Neram Classes"
- Fields from admin: `image`, `heading`, `subtext`, `ctaText`, `ctaLink`, `isVisible`

#### Section 4: Quick Navigation Cards
- Grid of cards linking to all 11 spoke pages
- Each card: Icon + Title + 1-line description + arrow
- Cards: Exam Pattern, Eligibility, Syllabus, How to Apply, Fee Structure, Exam Centers, Important Dates, Photo & Signature, Scoring & Results, Do's & Don'ts, Cutoff Calculator

#### Section 5: What is NATA?
- 3-4 lines plain language explanation
- Key points: Conducted by Council of Architecture since 2006, required for B.Arch admission, tests aptitude not just knowledge
- AEO-optimized: Opens with a direct answer sentence

#### Section 6: NATA 2026 at a Glance
- Visual summary table/cards:
  - Conducting Body: Council of Architecture (CoA)
  - Exam Name: National Aptitude Test in Architecture
  - Exam Level: National
  - Mode: Part A (Offline) + Part B (Online Adaptive)
  - Medium: English and Hindi
  - Total Marks: 200 (Part A: 80 + Part B: 120)
  - Duration: 3 Hours (90 min each part)
  - Maximum Attempts: 3 per year
  - Score Validity: 2 academic years
  - Website: www.nata.in

#### Section 7: Interactive Tools Strip
- Horizontal scroll cards linking to **public tool pages** on `app.neramclasses.com`
- Tools: Exam Centers, Cutoff Calculator, College Predictor, Eligibility Checker, Image Crop & Resize, Cost Calculator, Question Bank
- Each card: Icon + Tool Name + "Try Now →"
- Links to: `app.neramclasses.com/nata/[tool-slug]` (public SEO pages, no auth needed)
- "Coming Soon" badge on Seat Matrix, College Reviews

#### Section 8: Simplified Syllabus Preview
- Show 3-4 syllabus topics with simplified explanations as preview
- CTA: "View Full Syllabus with Sample Questions →" links to `/nata-2026/syllabus`

#### Section 9: Download Official Brochure
- Current version prominently displayed with download button
- Expandable section showing previous versions with version number and release date
- Data from admin: list of `{ version, releaseDate, pdfUrl, changelog }`
- Example:
  - V1.2 (03 Apr 2025) — Current ⬇️ Download
  - V1.1 (11 Feb 2025) ⬇️ Download
  - V1.0 (02 Feb 2025) ⬇️ Download

#### Section 10: Need Help Applying? (Form-Filling Assistance)
- "Struggling with the NATA application? Let us help!"
- Simple request form: Name, Phone, District, School Name, Category (General/SC/ST/OBC)
- On submit → Creates a request in admin dashboard
- Admin receives notification → Team contacts student → Fills form on their behalf + counselling
- Trust builder: "Free service for all students"

#### Section 11: FAQ Section (Admin-controlled)
- Expandable accordion
- FAQ schema markup for SEO
- Admin manages: `question`, `answer`, `order`, `isVisible`
- Default FAQs to pre-populate:
  - What is NATA 2026?
  - Who is eligible for NATA 2026?
  - How many times can I attempt NATA 2026?
  - What is the fee for NATA 2026?
  - Is NATA score valid for JEE B.Arch admission?
  - What is the qualifying mark for NATA 2026?
  - Can I appear for NATA if I'm in Class 11?
  - What items should I bring to the exam center?

#### Section 12: AI NATA Information Chatbot (Embedded on Hub)

**This chatbot lives on the marketing hub page, NOT on the tools app.** It's an information assistant that helps visitors get quick answers from the brochure without navigating through pages.

**UI:** Floating chat bubble (bottom-right corner) that expands into a chat panel. Available on the hub page and all spoke pages.

**Approach: RAG (Retrieval Augmented Generation)**

**Implementation Options (Free/Low-cost LLMs):**
1. **Google Gemini Free Tier** — good context window, free API
2. **Groq (Llama 3)** — fast inference, generous free tier
3. **Cloudflare Workers AI** — free tier available

**Architecture:**
```
Student asks question on hub page
    ↓
Extract relevant chunks from NATA brochure (pre-processed)
    ↓
System prompt: "You are Neram NATA Assistant. Only answer NATA-related
questions using the provided brochure content. If question is not about
NATA, politely redirect. Always mention Neram Classes for preparation help."
    ↓
LLM generates answer with brochure context
    ↓
Display answer + "Was this helpful?" feedback
    ↓
If can't answer → "Contact our team for help" CTA
```

**Pre-processing:**
- Extract brochure text, split into chunks
- Store chunks in a simple JSON file (keyword-matched or semantic)
- On each query, find top 3-5 relevant chunks and pass as context

**Restrictions:**
- Only answers NATA-related questions
- Sources from official brochure data
- Redirects to Neram Classes team for subjective/preparation questions
- Rate limit per session (e.g., 20 questions) to control costs
- No auth required — open to all visitors

**Lead Capture:** After 3 questions, show a soft prompt: "Want personalized NATA guidance? Leave your number and our team will call you."

#### Section 13: Neram Classes CTA Banner (Admin-controlled)
- Full-width promotional section
- "Prepare for NATA 2026 with India's First AI-Enabled Learning Platform"
- Highlights: AI-powered practice, Expert faculty, Personalized learning paths
- CTA: "Start Free Trial" / "Join Now"

#### Section 14: Contact & Help
- Neram Classes' own helpdesk (NOT official NATA helpdesk)
- WhatsApp button, Phone, Email
- "Our dedicated team will help you with any NATA-related queries"

---

### 1.2 Spoke Pages

Each spoke page follows this template structure:
1. Breadcrumb: Home > NATA 2026 > [Page Title]
2. H1 with AEO-friendly opening paragraph (direct answer in first 2 lines)
3. Main content
4. Related tools CTA (where applicable)
5. Internal links to other spoke pages ("Also Read:" section)
6. FAQ section specific to that page (with schema)
7. Neram Classes promotional CTA

---

#### Page 1: `/nata-2026/how-to-apply`

**SEO Meta:**
- Title: `How to Apply for NATA 2026 — Step by Step Application Guide | Neram Classes`
- Description: `Complete step-by-step guide to fill the NATA 2026 application form on nata.in. Registration, document upload, fee payment, and confirmation — everything explained simply.`
- H1: `How to Apply for NATA 2026 — Step by Step Guide`

**Schema Markup:** `HowTo` schema with steps

**Content Sections:**
1. Quick overview paragraph (AEO answer)
2. Prerequisites checklist before starting
3. Step-by-step guide with visual flow:
   - Step 1: Visit nata.in and create account
   - Step 2: Fill Personal Details
   - Step 3: Upload Documents (photo + signature)
   - Step 4: Pay Application Fee
   - Step 5: Print Confirmation Page
   - Step 6: Select Test City & Session
   - Step 7: Download Appointment Card
4. Common mistakes to avoid
5. CTA: "Need help? Request Form-Filling Assistance" → hub form
6. CTA: "Prepare your photo & signature" → Image Crop Tool on tools app
7. Page-specific FAQ

**Internal Links To:** fee-structure, photo-signature-requirements, eligibility, exam-centers

---

#### Page 2: `/nata-2026/eligibility`

**SEO Meta:**
- Title: `NATA 2026 Eligibility Criteria — Who Can Apply? | Neram Classes`
- Description: `Check if you're eligible for NATA 2026. Qualification requirements, age limit, minimum marks, subjects needed for B.Arch admission. Use our free eligibility checker tool.`
- H1: `NATA 2026 Eligibility Criteria`

**Content Sections:**
1. Direct answer: Who can appear for NATA 2026 (AEO-optimized)
2. Eligibility to APPEAR for NATA:
   - Passed or appearing in 10+1 with PCM subjects
   - Passed or appearing in 10+2 with PCM subjects
   - Passed or appearing in 10+3 Diploma with Mathematics
3. Eligibility for B.Arch ADMISSION (different from appearing):
   - 10+2 with Physics + Mathematics compulsory
   - Plus one of: Chemistry / Biology / Technical Vocational / CS / IT / Engineering Graphics / Business Studies
   - Minimum 45% aggregate
   - OR 10+3 Diploma with Math, minimum 45%
4. Important disclaimer: Qualifying NATA ≠ guaranteed admission
5. Reservation categories note
6. CTA: "Check Your Eligibility Instantly →" → Eligibility Checker on tools app
7. Page-specific FAQ

**Internal Links To:** how-to-apply, fee-structure, scoring-and-results

---

#### Page 3: `/nata-2026/syllabus`

**SEO Meta:**
- Title: `NATA 2026 Syllabus — Simplified Topics with Sample Questions | Neram Classes`
- Description: `NATA 2026 complete syllabus explained in simple language. Each topic broken down with what it really means and a sample question to try. Part A drawing + Part B MCQ/NCQ.`
- H1: `NATA 2026 Syllabus — Simplified for Students`

**Content Sections:**
1. Overview paragraph
2. **Part A — Drawing and Composition (Offline, 90 min, 80 marks)**
   - A1: Composition and Color (25 marks)
     - Official: "Creating suitable compositions for various situations and coloring them appropriately"
     - Simple: "You'll be given a theme or situation. Arrange shapes, patterns and color them to create a visually appealing composition"
     - Sample Question: [Provide a sample]
   - A2: Sketching & Composition — Black and White (25 marks)
     - Official: "Ability to draw, visualize, depict a situation involving buildings/components, people, environment, products with understanding of scale, proportions, textures, shades and shadow"
     - Simple: "Draw a scene from imagination — could be a building, street, people in an environment. Focus on getting proportions right and showing depth with shading"
     - Sample Question: [Provide a sample]
   - A3: 3D Composition (30 marks)
     - Official: "Creating interesting 3D composition for the given situation using the provided kit"
     - Simple: "You'll get a kit of materials (paper, cardboard). Build a 3D model based on the given theme. Think creativity + neatness"
     - Sample Question: [Provide a sample]

3. **Part B — MCQ & NCQ (Online Adaptive, 90 min, 120 marks)**
   - B1: 42 MCQs + B2: 8 NCQs = 50 questions
   - 108 seconds per question
   - Topics with simplified explanations + sample questions:
     - **Visual Reasoning:** Understanding 2D and 3D compositions, technical concepts
       - Simple: "Can you look at a flat drawing and imagine it in 3D? Can you rotate objects mentally?"
       - Sample Question
     - **Logical Derivation:** Decode situations, find hidden information, draw conclusions
       - Simple: "Like a detective — find patterns, hidden meanings, and logical connections in images and scenarios"
       - Sample Question
     - **GK, Architecture & Design:** General awareness of architecture, famous buildings, current design trends
       - Simple: "Do you know famous buildings? Design movements? Current architecture trends in India and world?"
       - Sample Question
     - **Language Interpretation:** English grammar, word meanings, sentence comprehension
       - Simple: "Basic English skills — understanding sentences, grammar, and word meanings"
       - Sample Question
     - **Design Sensitivity & Thinking:** Observe and analyze spaces, products, environments. Critical thinking, semantics, metaphors
       - Simple: "Can you look at a chair and explain why it's well-designed or not? Can you identify what makes a space feel comfortable?"
       - Sample Question
     - **Numerical Ability:** Basic math with creative/spatial application, geometry
       - Simple: "Math meets creativity — geometry, spatial calculations, and patterns using numbers"
       - Sample Question

4. Exam medium: English and Hindi
5. CTA: "Start Practicing with Neram Classes AI-Powered Mock Tests →"
6. Page-specific FAQ

**Internal Links To:** exam-pattern, scoring-and-results, dos-and-donts

---

#### Page 4: `/nata-2026/exam-centers`

**SEO Meta:**
- Title: `NATA 2026 Exam Centers — State-Wise City List & Center Details | Neram Classes`
- Description: `Complete list of NATA 2026 exam centers across India and Dubai. Find test centers in your city with addresses and directions. Use our center locator tool.`
- H1: `NATA 2026 Exam Centers — Find Centers Near You`

**Content Sections:**
1. Overview: Centers allocated based on city/region preference, CoA's final decision
2. State-wise expandable sections showing cities
3. For each city: Known specific center names and addresses (admin-managed, researched data)
4. Note: "Tentative list, final centers confirmed on Appointment Card"
5. CTA: "Find Your Nearest Center →" → Center Locator on tools app
6. Tamil Nadu centers highlighted prominently (local audience)
7. International center: Dubai
8. Page-specific FAQ

**Data Source:** Admin panel manages the center list. Pre-populated from brochure + research.

**Admin Data Model:**
```typescript
interface ExamCenter {
  id: string;
  state: string;
  city: string;
  centerName?: string;       // specific center name if known
  address?: string;          // full address if known
  latitude?: number;         // for map integration
  longitude?: number;        // for map integration
  isConfirmed: boolean;      // tentative vs confirmed
  year: number;              // 2026
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Internal Links To:** how-to-apply, dos-and-donts, important-dates

---

#### Page 5: `/nata-2026/fee-structure`

**SEO Meta:**
- Title: `NATA 2026 Application Fee — Category-Wise Fee Details | Neram Classes`
- Description: `NATA 2026 exam fee for General, OBC, SC, ST, EWS, PwD, Transgender & NRI candidates. Fee per attempt, total cost for multiple attempts. Use our fee calculator.`
- H1: `NATA 2026 Application Fee Structure`

**Content Sections:**
1. Fee table (static, based on brochure — not admin-controlled):

| Category | Fee per Test (₹) |
|---|---|
| General / OBC (N-CL) | 1,750 |
| SC / ST / EWS / PwD | 1,250 |
| Transgender | 1,000 |
| Outside India | 15,000 |

2. Notes:
   - Fee is non-refundable
   - Can opt for 1, 2, or 3 tests (can add more later, max 3)
   - Multiple applications with different credentials = rejected, no refund
3. Payment methods: Debit card, Credit card, Net banking via EPG
4. Total cost examples: "If General category attempts all 3 tests: ₹5,250"
5. CTA: "Calculate Your Total Fee →" → Fee Calculator on tools app
6. Page-specific FAQ

**Internal Links To:** how-to-apply, eligibility, scoring-and-results

---

#### Page 6: `/nata-2026/exam-pattern`

**SEO Meta:**
- Title: `NATA 2026 Exam Pattern — Part A & Part B Detailed Breakdown | Neram Classes`
- Description: `NATA 2026 exam pattern explained — Part A Drawing (80 marks, offline) and Part B MCQ/NCQ (120 marks, online adaptive). Total 200 marks in 3 hours.`
- H1: `NATA 2026 Exam Pattern & Marking Scheme`

**Content Sections:**
1. Quick summary visual (infographic-style):
   - Total: 200 marks, 3 hours
   - Part A: 80 marks, 90 min, Offline, 3 questions
   - Part B: 120 marks, 90 min, Online Adaptive, 50 questions
2. Part A detailed breakdown:
   - A1: Composition & Color — 25 marks (1 question)
   - A2: Sketching & Composition B&W — 25 marks (1 question)
   - A3: 3D Composition — 30 marks (1 question)
3. Part B detailed breakdown:
   - B1: 42 MCQs
   - B2: 8 NCQs (No Choice Questions — type the answer)
   - 108 seconds per question
   - Computer-based adaptive test (difficulty adjusts based on your answers)
4. Exam schedule:
   - Fridays: Afternoon only (1:30 PM – 4:30 PM)
   - Saturdays: Morning (10:00 AM – 1:00 PM) + Afternoon (1:30 PM – 4:30 PM)
5. Medium: English and Hindi
6. Negative marking: Clarify if applicable (brochure doesn't mention negative marking)
7. CTA: "View Detailed Syllabus →"
8. Page-specific FAQ

**Internal Links To:** syllabus, scoring-and-results, dos-and-donts

---

#### Page 7: `/nata-2026/photo-signature-requirements`

**SEO Meta:**
- Title: `NATA 2026 Photo & Signature Upload Requirements — Size, Format & Specs | Neram Classes`
- Description: `Exact photo and signature specifications for NATA 2026 application — dimensions, file size, format. Free crop and resize tool to get your images ready.`
- H1: `NATA 2026 Photo & Signature Upload Requirements`

**Content Sections:**
1. Quick specs table:

| Document | Min Size | Max Size | Height | Width | Format |
|---|---|---|---|---|---|
| Photograph | 4 KB | 100 KB | 4.5 cm | 3.5 cm | JPG/JPEG |
| Signature | 1 KB | 30 KB | 1.5 cm | 3.5 cm | JPG/JPEG |

2. Photo requirements:
   - Recent passport-size
   - Color photograph
   - Both ears visible
   - Front view only
   - Plain/light background recommended
3. Signature requirements:
   - On white paper
   - Black or dark blue ink
   - Clear and legible
4. Common rejection reasons (helpful for students)
5. CTA: "Crop & Resize Your Photo Now →" → Image Tool on tools app
6. CTA: "Crop & Resize Your Signature Now →" → Image Tool on tools app
7. Page-specific FAQ

**Internal Links To:** how-to-apply, dos-and-donts

---

#### Page 8: `/nata-2026/important-dates`

**SEO Meta:**
- Title: `NATA 2026 Important Dates — Registration, Exam & Result Schedule | Neram Classes`
- Description: `All important dates for NATA 2026 — registration start/end, exam dates, result declaration, appointment card download. Stay updated with the complete timeline.`
- H1: `NATA 2026 Important Dates & Schedule`

**Content Sections:**
1. Timeline visual (vertical timeline UI):
   - Registration opens
   - Registration closes
   - Exam period (March–June on Fridays & Saturdays)
   - Appointment card download
   - Result declaration
   - Score card download
2. Note: "Dates based on NATA 2025 pattern. Will be updated when official NATA 2026 dates are announced."
3. Note about multiple attempts: New appointment card needed for each subsequent test after previous result is published
4. CTA: "Get Notified When Dates Are Announced →" (email/WhatsApp capture)
5. Page-specific FAQ

**Internal Links To:** how-to-apply, exam-pattern, scoring-and-results

---

#### Page 9: `/nata-2026/scoring-and-results`

**SEO Meta:**
- Title: `NATA 2026 Scoring, Qualifying Marks & Results — Everything Explained | Neram Classes`
- Description: `NATA 2026 qualifying criteria — minimum marks for Part A, Part B, and overall. How multiple attempts work, score validity, and result checking process.`
- H1: `NATA 2026 Scoring, Results & Qualifying Marks`

**Content Sections:**
1. Qualifying criteria (clear visual):
   - Minimum 20 marks in Part A (out of 80)
   - Minimum 20 marks in Part B (out of 120)
   - Overall minimum: 60 out of 200
   - ALL THREE conditions must be met
2. Multiple attempts scoring:
   - Best score out of all attempts is taken as valid score
   - Previous year score handling (table from brochure):
     - 1 attempt in 2026 with valid 2025 score → Better of both
     - 2 attempts in 2026 with valid 2025 score → Best of three
     - 3 attempts in 2026 → Best of three 2026 scores (2025 score invalidated)
3. Score validity: Valid for 2 academic years from the year of appearing
4. Results: Published on www.nata.in
5. Record retention: Only 90 days from result declaration
6. CTA: "Check Your Cutoff →" → Cutoff Calculator on tools app
7. Page-specific FAQ

**Internal Links To:** exam-pattern, cutoff-calculator, eligibility

---

#### Page 10: `/nata-2026/dos-and-donts`

**SEO Meta:**
- Title: `NATA 2026 Exam Day Do's and Don'ts — Complete Guide | Neram Classes`
- Description: `What to bring, what not to bring, timing rules, and behavior guidelines for NATA 2026 exam day. Avoid disqualification with this complete checklist.`
- H1: `NATA 2026 Exam Day — Do's and Don'ts`

**Content Sections:**
1. What to bring:
   - Downloaded Appointment Card (printed hard copy)
   - Original Photo ID (Aadhaar/Passport/Driving License/Voter ID)
   - Pencils, erasers, sharpeners, dry colors, scale (up to 15 cm)
2. What NOT to bring:
   - Mobile phones, Bluetooth devices
   - Calculators, slide rules, log tables
   - Electronic watches with calculator
   - Blades or any instruments
   - Any textual material
3. Timing rules:
   - Arrive by 9:00 AM (Session 1) / 12:30 PM (Session 2)
   - Gates close at 10:00 AM / 1:30 PM
   - Late entry not permitted after 10:15 AM / 1:45 PM
   - Cannot leave before 1:00 PM / 4:30 PM
4. During exam:
   - Maintain silence
   - Use only provided paper/material
   - No leaving seat without permission
5. Malpractice warnings:
   - Unfair means → cancellation + up to 1 year ban
   - Impersonation → cancellation + police prosecution + 2 year ban
6. Checklist format (printable)
7. Page-specific FAQ

**Internal Links To:** how-to-apply, exam-pattern, photo-signature-requirements

---

#### Page 11: `/nata-2026/cutoff-calculator`

**SEO Meta:**
- Title: `NATA 2026 Cutoff Calculator — Check Your College Eligibility | Neram Classes`
- Description: `Enter your NATA 2026 score and find out which architecture colleges you're eligible for. Category-wise cutoffs, state-wise data, and previous year trends.`
- H1: `NATA 2026 Cutoff Calculator`

**Content Sections:**
1. Quick qualification check:
   - Enter Part A marks, Part B marks → Instantly shows if qualified
   - Shows which conditions are met/unmet
2. Embed or link to cutoff calculator tool from `app.neramclasses.com`
3. Previous year cutoff trends (if data available)
4. Category-wise cutoff differences
5. CTA: "Want a Higher Score? Join Neram Classes →"
6. Page-specific FAQ

**Internal Links To:** scoring-and-results, eligibility, exam-pattern

---

## PART 2: TOOLS APP (`app.neramclasses.com`)

### 2.0 UI Consistency — Match Admin App Compact Interface

**CRITICAL: The tools app must visually match the admin app's compact, dense interface.** This applies globally across the entire tools app, not just the sidebar.

#### Sidebar — Copy Admin App Sidebar Component

Reference the admin app's sidebar component directly. Match these properties exactly:
- **Width:** Same as admin sidebar (collapsed + expanded)
- **Font size:** Same as admin sidebar menu items
- **Icon size:** Same as admin sidebar icons
- **Menu item height/padding:** Same as admin sidebar
- **Active state styling:** Same as admin sidebar
- **Hover state:** Same as admin sidebar
- **Section grouping:** Same collapsible group style (NATA section with caret)
- **"Soon" badge styling:** Small chip/badge next to coming-soon items

**Implementation approach:**
```
// Extract the admin sidebar component and create a shared component
// OR copy the admin sidebar styles/component to the tools app

// Key files to reference from admin app:
// - admin/src/components/Sidebar.tsx (or equivalent)
// - admin/src/components/SidebarItem.tsx
// - admin/src/theme/sidebar.ts (or equivalent theme config)

// Copy these exact values:
// - fontSize for menu items
// - padding / margin for menu items
// - icon dimensions
// - sidebar width (expanded/collapsed)
// - font-weight for active/inactive states
// - color palette for active/hover/inactive
// - border-radius on active items
// - section header (like "NATA") font-size and weight
```

#### Global UI Density — Match Admin App

Apply admin-app-level compactness across ALL tools app pages:

| Property | Match Admin App Value |
|---|---|
| Base font size | Same as admin (likely 13-14px body) |
| H1 / Page titles | Same as admin page titles |
| H2 / Section titles | Same as admin section titles |
| Body text | Same as admin body text |
| Button sizes | Same as admin buttons (height, padding, font) |
| Input field height | Same as admin inputs |
| Card padding | Same as admin cards |
| Table row height | Same as admin tables |
| Spacing between sections | Same as admin |
| Border radius | Same as admin |
| Color palette | Same as admin |

**Implementation approach:**
```typescript
// Option A: Shared MUI theme
// Create a shared theme package that both admin and tools app import
// This ensures font sizes, spacing, component overrides are identical

// Option B: Copy admin theme
// Copy the admin app's MUI theme configuration to the tools app
// Key file: admin/src/theme/theme.ts (or equivalent)

// MUI component overrides to copy:
const adminCompactTheme = {
  typography: {
    fontSize: 13,             // Match admin
    h1: { fontSize: '...' },  // Match admin
    h2: { fontSize: '...' },  // Match admin
    body1: { fontSize: '...' }, // Match admin
    body2: { fontSize: '...' }, // Match admin
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { /* Match admin button sizing */ }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: { /* Match admin input sizing */ }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: { /* Match admin table cell padding */ }
      }
    },
    // ... all other MUI components
  }
};
```

**Action items for developer:**
1. Open admin app → Inspect sidebar → Note exact CSS values (font-size, padding, width, icon size, item height)
2. Open admin app → Inspect any page → Note body font-size, heading sizes, button sizes, card padding, input heights
3. Apply identical values to tools app theme
4. Visually compare side-by-side: admin app and tools app should feel like the same application

---

### 2.1 Public SEO Pages (No Authentication Required)

**Purpose:** Each tool gets a public-facing landing page that:
- Ranks on Google/AI engines for tool-specific searches (e.g., "NATA cutoff calculator", "NATA exam centers in Chennai")
- Shows a preview/demo or limited version of the tool
- Drives sign-ups with CTA: "Sign up free for full access"
- Has proper SEO meta, schema, and AEO-friendly content

**URL Pattern:** `app.neramclasses.com/nata/[tool-slug]`

**Common Template for All Public Tool Pages:**
```
1. SEO Meta (title, description, OG tags)
2. Breadcrumb: Home > NATA Tools > [Tool Name]
3. H1: [Tool Name]
4. 2-3 line AEO-friendly description answering "What is this tool?"
5. Tool Preview / Limited Demo
   - For active tools: Show a limited/preview version (e.g., cutoff calc shows result but no save)
   - For coming soon tools: Show mockup + email capture for notification
6. Features list: What the full tool offers
7. CTA: "Sign Up Free to Access Full Tool →" / "Login to Continue →"
8. Related content from marketing hub (internal links)
9. FAQ section with schema markup
10. Neram Classes promotional CTA
```

#### Public Page: `/nata/exam-centers`

**SEO Meta:**
- Title: `NATA 2026 Exam Centers — Find Test Centers in Your City | Neram Classes`
- Description: `Search NATA 2026 exam centers across India. State-wise city list with center names and addresses. Find your nearest test center.`
- Target Keywords: "nata exam centers", "nata exam center in chennai", "nata 2026 test centers list"

**Preview Content:**
- State-wise expandable list of cities (visible to all)
- Search/filter by state or city
- For specific center names/addresses → "Sign up to see full details"
- Map view teaser

#### Public Page: `/nata/cutoff-calculator`

**SEO Meta:**
- Title: `NATA 2026 Cutoff Calculator — Check If You Qualify | Neram Classes`
- Description: `Enter your NATA 2026 marks and instantly check if you qualify. Part A, Part B minimum criteria check and overall qualifying marks calculator.`
- Target Keywords: "nata cutoff calculator", "nata qualifying marks calculator", "nata 2026 cutoff"

**Preview Content:**
- Show the calculator (basic version works without login)
- Enter Part A + Part B marks → Shows qualified/not qualified
- For detailed analysis, college-wise cutoffs → "Sign up for full access"

#### Public Page: `/nata/college-predictor`

**SEO Meta:**
- Title: `NATA 2026 College Predictor — Find B.Arch Colleges for Your Score | Neram Classes`
- Description: `Predict which architecture colleges you can get into based on your NATA 2026 score. Category-wise, state-wise college predictions.`
- Target Keywords: "nata college predictor", "nata score college list", "which college for nata score"

**Preview Content:**
- Enter score → Shows 2-3 sample colleges
- Full list → "Sign up to see all matching colleges"

#### Public Page: `/nata/question-bank`

**SEO Meta:**
- Title: `NATA 2026 Question Bank — Practice Questions with Solutions | Neram Classes`
- Description: `Free NATA practice questions for Visual Reasoning, Logical Derivation, GK Architecture, Numerical Ability. Topic-wise question bank with solutions.`
- Target Keywords: "nata practice questions", "nata question bank", "nata sample questions"

**Preview Content:**
- Show 3-5 sample questions (freely accessible)
- Full question bank → "Sign up for access to 500+ questions"

#### Public Page: `/nata/eligibility-checker`

**SEO Meta:**
- Title: `NATA 2026 Eligibility Checker — Am I Eligible? | Neram Classes`
- Description: `Check your NATA 2026 eligibility instantly. Enter your education details and find out if you can appear for NATA and get B.Arch admission.`
- Target Keywords: "nata eligibility checker", "am i eligible for nata", "nata eligibility criteria check"

**Preview Content:**
- Full eligibility checker works without login (simple logic, good SEO value)
- After result → CTA to sign up for more tools

#### Public Page: `/nata/cost-calculator`

**SEO Meta:**
- Title: `NATA 2026 Cost Calculator — Total Exam Expense Breakdown | Neram Classes`
- Description: `Calculate total NATA 2026 expenses — application fee, travel, accommodation, preparation materials. Category-wise fee calculator with complete cost breakdown.`
- Target Keywords: "nata exam fee calculator", "nata 2026 total cost", "nata application fee"

**Preview Content:**
- Fee calculator works without login
- Full cost breakdown (travel, accommodation estimates) → "Sign up for detailed planner"

#### Public Page: `/nata/image-crop-resize`

**SEO Meta:**
- Title: `NATA Photo & Signature Crop Tool — Resize to Exact Specs | Neram Classes`
- Description: `Free tool to crop and resize your photo and signature for NATA 2026 application. Exact dimensions: Photo 3.5x4.5cm (4-100KB), Signature 3.5x1.5cm (1-30KB).`
- Target Keywords: "nata photo size tool", "nata signature resize", "nata application photo crop"

**Preview Content:**
- Full tool works without login (great for SEO — users will share this)
- This is a utility tool — no need to gate behind auth
- After use → CTA: "Preparing for NATA? Check out our free tools"

#### Public Page: `/nata/seat-matrix` (Coming Soon)

**SEO Meta:**
- Title: `NATA 2026 Seat Matrix — College-Wise B.Arch Seat Availability | Neram Classes`
- Description: `Complete seat matrix for B.Arch colleges accepting NATA 2026 scores. State-wise, category-wise seat availability data.`

**Preview:** Coming soon teaser + email capture

#### Public Page: `/nata/college-reviews` (Coming Soon)

**SEO Meta:**
- Title: `B.Arch College Reviews — Student Reviews of Architecture Colleges | Neram Classes`
- Description: `Real student reviews of architecture colleges in India. Campus, faculty, placement, and infrastructure ratings for B.Arch colleges.`

**Preview:** Coming soon teaser + email capture

---

### 2.2 Authenticated Tool Pages (Behind Login)

**URL Pattern:** `app.neramclasses.com/app/nata/[tool-slug]`

These are the full-featured tools accessible only after login. They use the same core components as the public pages but with additional features:
- Save/bookmark results
- History of past calculations
- Personalized recommendations
- Advanced filters
- Export/download options

The existing tools (Exam Centers, Cutoff Calculator, College Predictor, Question Bank) are already built and functional. Focus on:

1. **Building the "Coming Soon" tools:**
   - Eligibility Checker (logic defined in public page section)
   - Cost Calculator (fee + travel + accommodation estimator)
   - Image Crop & Resize (photo + signature tool — see specs below)

2. **Adding public SEO pages** for all existing + new tools

#### Tool: Image Crop & Resize (NEW — Build This)

**Features:**
- Two modes: "Photograph" and "Signature" (toggle)
- Photograph mode:
  - Crop to 3.5cm × 4.5cm aspect ratio
  - Compress to 4KB–100KB range
  - Output: JPG/JPEG
  - Guidelines overlay showing face positioning (ears visible, front view)
  - Real-time file size indicator
  - Real-time preview
- Signature mode:
  - Crop to 3.5cm × 1.5cm aspect ratio
  - Compress to 1KB–30KB range
  - Output: JPG/JPEG
  - Real-time preview
- Download button with correct filename (e.g., "nata-photo.jpg", "nata-signature.jpg")
- Show output file size + dimensions
- Warning banner if output doesn't meet specs
- **Make this tool fully functional on public page too** (no auth gate — it's a utility)

**Tech:** Use `react-image-crop` or `react-easy-crop` + `browser-image-compression`

**Important:** Handle Android camera compression issues. Test with large phone camera images (5MB+). Ensure compression doesn't degrade quality below acceptable levels.

#### Tool: Eligibility Checker (Build from "Coming Soon")

**Inputs:**
- Current education status: 10+1 / 10+2 / 10+3 Diploma / Passed 10+2 / Passed Diploma
- Subjects taken: Physics, Mathematics, Chemistry, Biology, CS, IT, etc.
- Aggregate percentage (if passed)
- Purpose: Just NATA exam | B.Arch admission

**Output:**
- Eligible to APPEAR for NATA: ✅/❌ with reason
- Eligible for B.Arch ADMISSION: ✅/❌ with reason
- Missing requirements highlighted in red
- Suggestion if not eligible

**Logic:**
```typescript
// NATA Appearance: 10+1/10+2 with subjects per 5.2, OR 10+3 Diploma with Math
// B.Arch Admission: 10+2 with Physics + Math + one of (Chem/Bio/Tech Vocational/CS/IT/
//   Informatics Practices/Engineering Graphics/Business Studies) + min 45% aggregate
//   OR 10+3 Diploma with Math + min 45%
```

#### Tool: Cost Calculator (Build from "Coming Soon")

**Inputs:**
- Category (for fee calculation)
- Number of attempts planned
- Home city/state
- Preferred exam center city
- Need accommodation? Y/N

**Output:**
- Application fee breakdown
- Estimated travel cost (if different city)
- Estimated accommodation (if needed)
- Preparation material estimate
- Total estimated cost
- Tips to reduce costs

---

## PART 3: ADMIN APP (`admin.neramclasses.com`)

### 3.1 Exam Centers Management — `/nata/exam-centers`

**UI:** Table view with search, filter by state/city

**CRUD Operations:**
- Add new center (state, city, center name, address, coordinates, isConfirmed)
- Edit center details
- Delete center
- Bulk import from CSV/Excel
- Toggle confirmed/tentative status
- Filter by state, city, year

**Firebase Collection:** `nata_exam_centers`

```typescript
interface ExamCenter {
  id: string;
  state: string;
  city: string;
  centerName: string;
  address: string;
  pinCode: string;
  latitude?: number;
  longitude?: number;
  isConfirmed: boolean;
  year: number;            // 2025, 2026, etc.
  contactPhone?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
```

**Pre-populated Data:** Load all cities from NATA 2025 brochure Appendix IV (see Appendix A of this document for the complete list).

---

### 3.2 Brochure Versions — `/nata/brochure-versions`

**UI:** List of uploaded brochures with version info

**Operations:**
- Upload new PDF version
- Set version number, release date, changelog note
- Mark as "Current" (only one can be current)
- Delete old versions
- Preview PDF

**Firebase Collection:** `nata_brochures`

```typescript
interface BrochureVersion {
  id: string;
  version: string;         // "V1.0", "V1.1", "V1.2"
  releaseDate: Timestamp;
  pdfUrl: string;          // Firebase Storage URL
  changelog: string;       // What changed in this version
  isCurrent: boolean;
  year: number;            // 2026
  uploadedBy: string;
  createdAt: Timestamp;
}
```

---

### 3.3 Promotional Banners — `/nata/promotional-banners`

**UI:** Card-based manager for ad spots on the NATA hub

**Banner Spots:**
- Hero promotional banner
- Mid-page banner (between sections)
- Bottom CTA banner
- Sidebar banner (desktop)

**Operations:**
- Upload/change banner image
- Edit heading, subtext, CTA text, CTA link
- Toggle visibility per spot
- Set start/end date for time-limited promotions
- Preview how it looks on the hub

**Firebase Collection:** `nata_banners`

```typescript
interface PromotionalBanner {
  id: string;
  spot: 'hero' | 'mid_page' | 'bottom_cta' | 'sidebar';
  heading: string;
  subtext: string;
  imageUrl?: string;
  ctaText: string;
  ctaLink: string;
  isVisible: boolean;
  startDate?: Timestamp;
  endDate?: Timestamp;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 3.4 FAQ Management — `/nata/faq`

**UI:** Sortable list with drag-and-drop reordering

**Operations:**
- Add new FAQ (question + answer)
- Edit existing FAQ
- Delete FAQ
- Reorder (drag and drop)
- Toggle visibility
- Rich text editor for answers

**Firebase Collection:** `nata_faqs`

```typescript
interface FAQ {
  id: string;
  question: string;
  answer: string;          // supports basic HTML/markdown
  order: number;
  isVisible: boolean;
  category?: string;       // optional grouping
  pageSlug?: string;       // which page this FAQ belongs to (hub, eligibility, etc.)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 3.5 Announcement Bar — `/nata/announcements`

**UI:** Simple form for the top announcement bar

**Operations:**
- Set announcement text
- Set link (optional, makes text clickable)
- Set background color
- Toggle show/hide
- Set auto-show and auto-hide dates
- Preview

**Firebase Collection:** `nata_announcements`

```typescript
interface Announcement {
  id: string;
  text: string;
  link?: string;
  bgColor: string;         // hex color
  textColor: string;       // hex color
  isVisible: boolean;
  startDate?: Timestamp;
  endDate?: Timestamp;
  priority: number;        // if multiple, show highest priority
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 3.6 Form-Filling Assistance Requests — `/nata/assistance-requests`

**UI:** Table view of incoming requests from students

**Operations:**
- View all requests (with filters: pending, contacted, completed)
- Update status: Pending → Contacted → In Progress → Completed
- Add internal notes per request
- Assign to team member
- Export to CSV

**Firebase Collection:** `nata_assistance_requests`

```typescript
interface AssistanceRequest {
  id: string;
  studentName: string;
  phone: string;
  district: string;
  schoolName: string;
  category: 'general' | 'sc' | 'st' | 'obc' | 'ews' | 'pwd' | 'transgender';
  status: 'pending' | 'contacted' | 'in_progress' | 'completed';
  assignedTo?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## PART 4: SEO & AEO STRATEGY

### 4.1 SEO Implementation

**Technical SEO:**
- All pages server-side rendered (Next.js SSR/SSG)
- Sitemap.xml including all spoke pages
- robots.txt allowing all NATA pages
- Canonical URLs on every page
- Open Graph & Twitter Card meta tags
- Mobile-first responsive design
- Core Web Vitals optimization (LCP < 2.5s, CLS < 0.1)
- Breadcrumb structured data on all pages
- Internal linking between all spoke pages

**On-Page SEO per spoke page:**
- Unique title tag (under 60 chars)
- Unique meta description (under 155 chars)
- Single H1 per page
- Logical H2/H3 hierarchy
- Target keyword in first 100 words
- Alt tags on all images
- Short, descriptive URLs

**Content SEO:**
- Target long-tail keywords per page:
  - "how to apply for nata 2026 step by step"
  - "nata 2026 eligibility criteria"
  - "nata 2026 syllabus pdf"
  - "nata 2026 exam centers in tamil nadu"
  - "nata 2026 application fee for sc st"
  - "nata 2026 exam pattern and marking scheme"
  - "nata 2026 photo size and signature size"
  - "nata 2026 important dates"
  - "nata 2026 qualifying marks"
  - "nata 2026 cutoff for top colleges"
  - "nata 2026 dos and donts"

**Local SEO:**
- Focus on Tamil Nadu related keywords
- "NATA coaching in Pudukkottai"
- "NATA coaching in Tamil Nadu"
- "NATA exam centers in Tamil Nadu"
- Google My Business optimization for Neram Classes

### 4.2 AEO (Answer Engine Optimization) Implementation

**Goal:** Get Neram Classes content picked up by AI assistants (ChatGPT, Google AI Overview, Perplexity, etc.)

**Strategy per page:**

1. **Direct Answer First:** Every page opens with a 2-3 sentence direct answer to the page's primary question before diving into details. AI engines pull from the first paragraph.

2. **FAQ Schema on Every Page:**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the NATA 2026 application fee?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "NATA 2026 fee is ₹1,750 for General/OBC, ₹1,250 for SC/ST/EWS/PwD, ₹1,000 for Transgender, and ₹15,000 for Outside India candidates per test."
      }
    }
  ]
}
```

3. **HowTo Schema** on the how-to-apply page:
```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Apply for NATA 2026",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Create Account on nata.in",
      "text": "Visit www.nata.in and register with your email..."
    }
  ]
}
```

4. **Organization Schema** on hub page:
```json
{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Neram Classes",
  "description": "India's first AI-enabled NATA learning platform",
  "url": "https://neramclasses.com"
}
```

5. **Table Markup:** Use proper HTML tables (not divs) for fee structure, exam pattern — AI engines parse tables well.

6. **Concise Q&A Pattern:** Throughout content, use the pattern:
   > **Q: How many times can I attempt NATA 2026?**
   > A: You can attempt NATA 2026 up to 3 times in one academic year. Your best score across all attempts will be considered.

7. **Freshness Signals:** Update pages when new information is available. Show "Last Updated: [date]" on each page.

8. **Source Authority:** Link to official nata.in for verification. Cite "Council of Architecture" as the source.

---

## PART 5: FIREBASE DATA STRUCTURE

### Collections Overview

```
firestore/
├── nata_exam_centers/        # Admin-managed exam centers
├── nata_brochures/           # Brochure PDF versions
├── nata_banners/             # Promotional banners
├── nata_faqs/                # FAQ entries
├── nata_announcements/       # Announcement bar content
└── nata_assistance_requests/ # Form-filling help requests from students
```

### Firebase Storage Structure

```
storage/
├── nata/
│   ├── brochures/
│   │   ├── nata-2026-v1.0.pdf
│   │   ├── nata-2026-v1.1.pdf
│   │   └── nata-2026-v1.2.pdf
│   └── banners/
│       ├── hero-banner.webp
│       ├── mid-page-banner.webp
│       └── bottom-cta-banner.webp
```

### Security Rules Outline

```
// Marketing app: Read-only access to all nata_ collections
// Admin app: Full CRUD with authenticated admin users
// Tools app: Read access to nata_exam_centers, write to nata_assistance_requests

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /nata_exam_centers/{centerId} {
      allow read: if true;
      allow write: if request.auth != null && isAdmin(request.auth.uid);
    }
    
    match /nata_brochures/{brochureId} {
      allow read: if true;
      allow write: if request.auth != null && isAdmin(request.auth.uid);
    }
    
    match /nata_banners/{bannerId} {
      allow read: if true;
      allow write: if request.auth != null && isAdmin(request.auth.uid);
    }
    
    match /nata_faqs/{faqId} {
      allow read: if true;
      allow write: if request.auth != null && isAdmin(request.auth.uid);
    }
    
    match /nata_announcements/{announcementId} {
      allow read: if true;
      allow write: if request.auth != null && isAdmin(request.auth.uid);
    }
    
    match /nata_assistance_requests/{requestId} {
      allow create: if true;  // anyone can submit
      allow read, update: if request.auth != null && isAdmin(request.auth.uid);
    }
  }
}
```

---

## APPENDIX A: Pre-Populated Exam Center Cities (from NATA 2025 Brochure)

This data should be loaded into the `nata_exam_centers` Firebase collection as seed data. Admin can then add specific center names and addresses.

### States

| State | Cities |
|---|---|
| Andhra Pradesh | Guntur, Vijayawada, Kadapa, Visakhapatnam |
| Assam | Guwahati |
| Bihar | Gaya |
| Chhattisgarh | Raipur |
| Delhi | New Delhi |
| Goa | Panaji |
| Gujarat | Ahmedabad, Anand, Rajkot, Surat, Vadodara |
| Haryana | Faridabad, Gurgaon, Jhajjar, Sonipat |
| Jammu & Kashmir | Kakrial / Katra |
| Jharkhand | Ranchi |
| Karnataka | Belgaum, Bengaluru, Bijapur, Dharwad, Kalburgi/Gulbarga, Hubali, Mangalore, Manipal, Mysuru, Tumkur |
| Kerala | Idduki, Ernakulam/Kochi, Kottayam, Kozhikode, Malappuram, Palakkad, Thiruvananthapuram/Kazhakkuttam, Thrissur |
| Madhya Pradesh | Bhopal, Gwalior, Indore |
| Maharashtra | Ahmednagar, Akola, Amravati, Aurangabad, Baramati, Kolhapur, Latur, Mumbai, Nagpur, Nashik, Navi Mumbai, Pune, Raigarh, Ramtek, Sangli, Satara, Solapur |
| Mizoram | Aizawl |
| Odisha | Bhubaneshwar, Cuttack |
| Punjab | Ludhiana, Mandi Gobindgarh, Mohali, Phagwara |
| Rajasthan | Jaipur, Tonk |
| Tamil Nadu | Chennai, Chengulput District, Coimbatore, Dindigul, Erode, Hosur, Kancheepuram, Kanya Kumari, Marthandam, Nammakal, Nagapattinam, Thanjavur, Tiruvallur, Trichy, Ooty/Nilgiris, Vellore, Villupuram, Virudhunagar |
| Telangana | Hyderabad, Secunderabad, Outer Periphery of Twin Cities |
| Uttarakhand | Dehradun |
| Uttar Pradesh | Kanpur, Ghaziabad, Greater Noida, Jhansi, Lucknow, Muzaffarnagar, Noida |
| West Bengal | Durgapur, Howrah |

### Union Territories

| UT | Cities |
|---|---|
| Puducherry | Puducherry |
| Andaman & Nicobar Islands | Port Blair |

### International

| Country | City |
|---|---|
| UAE | Dubai |

---

## APPENDIX B: Implementation Priority & Phases

### Phase 1 — Foundation (Week 1-2)
- [ ] Set up Firebase collections and security rules
- [ ] Create admin CRUD for exam centers, brochure versions, FAQs, announcements, banners
- [ ] Seed exam center data from Appendix A
- [ ] Upload NATA 2025 brochure as placeholder
- [ ] **Copy admin app sidebar component to tools app** (match exact styles)
- [ ] **Copy admin app MUI theme to tools app** (font sizes, spacing, component overrides)
- [ ] **Visually verify tools app matches admin app density** (side-by-side comparison)

### Phase 2 — Tools App Public SEO Pages (Week 2-3)
- [ ] Create public page template component (SEO meta, breadcrumb, tool preview, CTA, FAQ)
- [ ] Build public SEO page for Exam Centers `/nata/exam-centers`
- [ ] Build public SEO page for Cutoff Calculator `/nata/cutoff-calculator`
- [ ] Build public SEO page for College Predictor `/nata/college-predictor`
- [ ] Build public SEO page for Question Bank `/nata/question-bank`
- [ ] Build public SEO page for Eligibility Checker `/nata/eligibility-checker`
- [ ] Build public SEO page for Cost Calculator `/nata/cost-calculator`
- [ ] Build public SEO page for Image Crop & Resize `/nata/image-crop-resize`
- [ ] Build public SEO page (coming soon) for Seat Matrix `/nata/seat-matrix`
- [ ] Build public SEO page (coming soon) for College Reviews `/nata/college-reviews`
- [ ] Add SEO meta, schema markup, OG tags to all public pages

### Phase 3 — Build Missing Tools (Week 3-4)
- [ ] Build Eligibility Checker tool (authenticated version)
- [ ] Build Cost Calculator tool (authenticated version)
- [ ] Build Image Crop & Resize tool (works on both public + authenticated pages)
- [ ] Update tools app sidebar with admin-compact style

### Phase 4 — Marketing Hub (Week 4-5)
- [ ] Build hub page `/nata-2026` with all 14 sections
- [ ] Implement announcement bar (connected to admin)
- [ ] Implement brochure download section with version history (connected to admin)
- [ ] Implement FAQ section (connected to admin)
- [ ] Implement promotional banners (connected to admin)
- [ ] Build form-filling assistance request form
- [ ] Implement AI chatbot on hub page (floating chat bubble)
- [ ] Add SEO meta tags, schema markup, OG tags

### Phase 5 — Spoke Pages (Week 5-7)
- [ ] Build all 11 spoke pages with content
- [ ] Add FAQ schema to each page
- [ ] Add HowTo schema to how-to-apply page
- [ ] Internal linking between all pages
- [ ] Breadcrumb navigation
- [ ] "Also Read" sections
- [ ] AI chatbot available on all spoke pages

### Phase 6 — AI Chatbot (Week 7-8)
- [ ] Process brochure into chunks
- [ ] Set up free LLM API (Gemini/Groq)
- [ ] Build floating chat UI component for marketing app
- [ ] Implement RAG pipeline
- [ ] Add rate limiting (per session)
- [ ] Add lead capture prompt after 3 questions
- [ ] Test with real student questions

### Phase 7 — Polish & Launch (Week 8-9)
- [ ] Mobile responsiveness testing (both marketing + tools app)
- [ ] Core Web Vitals optimization
- [ ] Cross-browser testing
- [ ] Tools app ↔ admin app visual consistency final check
- [ ] Submit sitemap to Google Search Console (both apps)
- [ ] Verify schema markup with Google Rich Results Test
- [ ] Launch announcement on social media
- [ ] Monitor search rankings

---

## APPENDIX C: Key Reference Data (Static, from NATA 2025 Brochure)

### Fee Structure
| Category | Per Test (₹) |
|---|---|
| General / OBC (N-CL) | 1,750 |
| SC / ST / EWS / PwD | 1,250 |
| Transgender | 1,000 |
| Outside India | 15,000 |

### Exam Pattern
| Part | Mode | Duration | Questions | Marks |
|---|---|---|---|---|
| A: Drawing & Composition | Offline | 90 min | 3 | 80 |
| B: MCQ (B1) + NCQ (B2) | Online Adaptive | 90 min | 42 + 8 = 50 | 120 |
| **Total** | | **180 min** | **53** | **200** |

### Qualifying Marks
| Criteria | Minimum |
|---|---|
| Part A | 20 / 80 |
| Part B | 20 / 120 |
| Overall | 60 / 200 |

### Photo/Signature Specs
| Document | Min Size | Max Size | Height | Width | Format |
|---|---|---|---|---|---|
| Photograph | 4 KB | 100 KB | 4.5 cm | 3.5 cm | JPG/JPEG |
| Signature | 1 KB | 30 KB | 1.5 cm | 3.5 cm | JPG/JPEG |

### Exam Schedule
| Day | Sessions |
|---|---|
| Friday | Afternoon only: 1:30 PM – 4:30 PM |
| Saturday | Morning: 10:00 AM – 1:00 PM + Afternoon: 1:30 PM – 4:30 PM |

### Score Validity
- Valid for 2 academic years from the year of appearing

### Maximum Attempts
- Up to 3 per academic year

### Exam Medium
- English and Hindi

---

*Last Updated: March 2026*
*Source: NATA 2025 Information Brochure V1.2 (Council of Architecture)*
*To be updated when NATA 2026 brochure is released*
