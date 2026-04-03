# NATA Recalled Papers — Nexus Question Bank Module

## Context & Background

This document captures the complete planning context for building the **NATA Recalled Papers** module within the Neram Nexus classroom PWA (`nexus.neramclasses.com`). Unlike the JEE Paper 2 question bank (which uses officially published papers), NATA papers are **not officially released** by the Council of Architecture. This module handles **student-recalled exam questions** collected after each NATA session.

### Why This Exists

- NATA is a weekly rolling exam with multiple sessions per year
- Council of Architecture does NOT publish past papers
- Students recall questions post-exam via OneNote pages (and in future via Nexus recall feature)
- Some questions repeat across sessions (confirmed by cross-referencing multiple students)
- This is a key differentiator for Neram Classes — no other coaching provides this

### Existing Neram Ecosystem Context

- **Monorepo**: Turborepo with 4 Next.js apps on Vercel
- **Backend**: Supabase with RLS, Cloudflare Workers for API key protection
- **Auth**: Microsoft Entra ID (students/teachers), phone OTP/Google (parents)
- **UI Framework**: Fluent UI v9 exclusively, CSS Modules
- **Target**: 95% mobile users — mobile-first is critical
- **Nexus already has**: A recall submission feature for 2025 (students submit recalled questions through the app)
- **JEE Question Bank**: Already built with structured JSON schema for officially published papers (2005–2024)

---

## Data Quality Tiers

The recalled data falls into **3 distinct quality levels** based on source analysis:

### Tier 1 — Verified (Hari's own session recall)

- **Source**: Hari (founder) wrote questions directly from exam hall
- **Quality**: Full question text, recreated figure diagrams, options where applicable
- **Data available**: 4 categorized OneNote pages — Math (6 Qs), English (6 actual + 18 model Qs from same session), Logical Reasoning (11 Qs), GK/Visual (11 Qs)
- **Images**: Recreated in OneNote (not original exam images, but close representation)
- **Session**: NATA 2025 — March 21, 2025 (Hari's session) and March 13, 2025 (GK/English/Logical dates)
- **Status**: Practice-ready — can be used in test engine

### Tier 2 — Recalled (Student submissions with detail)

- **Source**: Students like Vedanth, Rithika Senthil, Kanisha, Tammana who provided detailed question text
- **Quality**: Some questions are word-perfect (e.g., family/generation word problems, cuboid volume with full solution), some have answers in brackets (e.g., "teak wood"), some have MCQ options, some are category counts ("Volume 2 ques")
- **Data available**: Multiple students across sessions — Vedanth (~25 Qs), Rithika (13 Qs with solutions), Kanisha (8 Part B + 3 Part A drawing Qs), Tammana (15 Qs + Part A drawing prompts screenshot)
- **Images**: Students sometimes paste reference images, hand-draw figures (Kanisha's star-of-David), or screenshot actual paper headers (Tammana)
- **Sessions**: April 9 (Vedanth), April 19 (Tammana), April 21 (Rithika), April 25 (Kanisha)
- **Status**: Partially practice-ready — detailed questions can be promoted to Tier 1 after teacher validation

### Tier 3 — Topic Signal (Student submissions with minimal detail)

- **Source**: Students like Anagha/Avinasha who listed topics/question descriptions
- **Quality**: Mostly topic labels ("AP GP", "Profit and Loss") with occasional detail ("A big star shape made out of triangles, and we have to count primary colour triangles adjacent to another")
- **Data available**: Anagha/Avinasha combined page — ~25 topic signals between 2 students for same session
- **Images**: None
- **Session**: NATA 2025 — April 9, 2025 (same session as Vedanth)
- **Status**: NOT practice-ready — but extremely valuable for Topic Intelligence Map

---

## Architecture: 3-Part System

### Part A — Paper Browser (Entry Point)

**Organization**: By Year → Sessions nested inside

```
NATA 2025
├── Session: March 13, 2025
│   ├── Contributors: Hari (Verified)
│   ├── Questions: 28 (11 GK + 11 Logical + 6 English)
│   └── Topic Radar: [Triangle Counting, Visual Counting, Spatial Reasoning, ...]
├── Session: March 21, 2025
│   ├── Contributors: Hari (Verified)
│   ├── Questions: 24 (6 Math + 18 English model Qs)
│   └── Topic Radar: [Geometry, Percentages, Grammar, ...]
├── Session: April 9, 2025
│   ├── Contributors: Vedanth (Recalled), Anagha (Topic), Avinasha (Topic)
│   ├── Questions: ~50 (mixed quality)
│   ├── 🔗 3+ overlapping Qs across contributors
│   └── Topic Radar: [Monument ID, Colour Theory, Family Relations, ...]
├── Session: April 11, 2025
│   ├── Contributors: Niranjan (Topic)
│   ├── Questions: 13 (mostly topic signals)
│   ├── ⚡ Weightage insight: 70% from geometry/patterns/monuments
│   └── Topic Radar: [Inscribed Shapes, Image Sequence, Shape Counting, ...]
├── Session: April 19, 2025
│   ├── Contributors: Tammana (Recalled)
│   ├── Questions: 3 Part A + 15 Part B
│   ├── 📄 Has actual paper header screenshot!
│   └── Topic Radar: [Number Theory, Visual Counting, Direction Sense, ...]
├── Session: April 21, 2025
│   ├── Contributors: Rithika Senthil (Recalled — HIGH QUALITY)
│   ├── Questions: 13 Part B (with solutions!)
│   └── Topic Radar: [Cube Coloring, Inscribed Shapes, Colour Theory, ...]
├── Session: April 25, 2025
│   ├── Contributors: Kanisha (Recalled — handwritten)
│   ├── Questions: 3 Part A + 8 Part B + 1 (metro — from Hari note)
│   └── Topic Radar: [Mirror Image, Direction Sense, Architecture Terms, ...]
└── ... more sessions (12 students remaining)
```

**UI Elements per Session Card**:
- Session date
- Contributor count + names
- Question count by tier (Verified / Recalled / Topic Only)
- Topic Radar (visual summary — top topics with frequency)
- "Overlapping Questions" badge if same question confirmed across multiple contributors

### Part B — Question Bank (Per Session)

Three visual treatments based on tier:

| Tier | Visual Treatment | Interaction |
|------|-----------------|-------------|
| **Verified** (green badge) | Full question card with text, options, figure, solution | Can practice in test mode, view solution |
| **Recalled** (amber badge) | Question card with available text, missing parts marked | View only, can report/improve |
| **Topic Signal** (grey badge) | Compact topic tag with description | Links to Topic Intelligence study material |

**Question Card Fields** (superset — not all fields populated for every tier):
- Question text (may be partial for Tier 2)
- Question type: MCQ / MSQ / Numerical / Drawing / Image-based
- Options (a/b/c/d) — only for some Tier 1 and Tier 2
- Correct answer (if known)
- Figure/Image — may be original, recreated, or reference image
- Solution/Explanation (only Tier 1, teacher-provided)
- Contributor name
- Confidence tier badge
- Topic tags (extracted knowledge nodes)
- Answer recalled by student (for Tier 2, may not be verified)

**Important UX considerations**:
- Questions WITHOUT images but that NEED images should clearly show "This question included a figure/image in the exam" placeholder
- Some Tier 2 questions include the answer in the question text itself (e.g., "Shirdi is in which state" with implied answer Maharashtra). These should be parsed and structured.
- Questions should be filterable by: topic, question type, tier, contributor
- Mobile-first: cards should be swipeable, compact

### Part C — Topic Intelligence Map (Study Material Layer)

This is the **killer differentiator**. Every question and topic signal feeds into a taxonomy of "knowledge nodes."

**How it works**:
1. Extract topic tags from ALL tiers of data
2. Cross-reference across sessions and contributors to build frequency weights
3. Present as a tappable topic map per session AND across all sessions

**Topic Node Structure**:
```
Topic: Monument Identification
├── Frequency: Appears in 3/4 sessions
├── Sub-topics extracted:
│   ├── Gwalior Fort (Vedanth, April 9)
│   ├── Hampi Temple (Vedanth, April 9)
│   ├── Kashi Vishwanath Temple (Avinasha, April 9)
│   ├── Sanchi Stupa (Anagha, April 9)
│   ├── Matri Mandir (Vedanth, April 9)
│   └── Japanese-style Building (Vedanth, April 9)
├── Study Material: [In-app content — initially empty, populated over time]
└── Related Questions: [links to actual questions mentioning this topic]
```

**Tappable topic links** → Open in-app Study Material section within Nexus (NOT Google Search). Initially empty shells that Hari/teachers populate over time. This becomes a growing knowledge base.

**Cross-session topic insights** (the network effect):
- "Colour Theory appeared in 3 out of 4 sessions — HIGH PRIORITY"
- "Blood Relations appeared in 2 out of 4 sessions — MEDIUM PRIORITY"
- "Counting/Visual puzzles (animals, fish, objects) appeared in EVERY session — CRITICAL"

---

## Confirmed Cross-Session Question Overlaps

From analyzing the 6 uploaded PDFs, these questions/topics appear across multiple sessions:

| Topic/Question Pattern | Hari (Mar 13/21) | Vedanth (Apr 9) | Anagha/Avinasha (Apr 9) |
|----------------------|:-:|:-:|:-:|
| Count triangles/rhombuses in figure | ✅ Logical Q1, Q2 | ✅ "isosceles triangles with primary colours" | ✅ "big star shape, count primary colour triangles" |
| Count objects in image (animals/fish/chairs) | ✅ GK Q1, Q5 | ✅ "Find no.of animals", "Find no.of chairs, light fixtures" | ✅ "lighting fixtures in room" |
| Blood relation / Family problems | — | ✅ 2 detailed family problems (3-gen + 4-gen) | ✅ "Blood relation for family" |
| Rotated form identification | ✅ GK Q7 | ✅ "correct rotated form" (with same arrow image!) | — |
| Colour theory | — | ✅ "Colour theory – 2 ques" | ✅ "colour schemes and colour wheel" |
| Clock problems | ✅ GK Q11 "Clock 4:30 angle" | — | ✅ "Clock in mirror" |
| Monument identification | — | ✅ Gwalior Fort, Hampi, Japanese building, Matri Mandir | ✅ Kashi Vishwanath, Sanchi Stupa |
| Spot differences / Pattern matching | ✅ GK Q3, Q9, Q10 | — | ✅ "Identifying shadow's shape" |
| Subject-verb agreement (English) | ✅ English Q4 | ✅ "english questions" | ✅ "adverbs and subject-verb-agreement" |
| Area/Volume of modified shapes | — | ✅ "Area of complex figure with parallelograms" | ✅ "TSA of modified figure", "Area of 2D and 3D shapes" |
| Unfolding/Hidden edges | ✅ GK Q6 | ✅ "Which image shows hidden edges" | — |

---

## Raw Data Inventory — All Questions Extracted

### Hari's Session — Math (March 21, 2025) — 6 Questions

| # | Question Text | Type | Options | Has Image | Answer | Topics |
|---|---|---|---|---|---|---|
| 1 | Two equilateral triangles, each of side 20 cm, are placed adjacent to each other. Additional lines AB, AC, and AD are drawn in the composition. What is the maximum number of right-angled triangles that can be identified? | Numerical | — | Yes (triangle diagram with working) | — | Geometry, Triangles, Counting |
| 2 | In two similar triangles, the sides of the first triangle are 6 cm, 8 cm, and 10 cm. If the longest side of the second triangle is 20 cm, what is the length of the shortest side? | Numerical | — | No | 12 cm | Similar Triangles, Ratios |
| 3 | A designer increases the price of a product by 20% and then offers a 10% discount. What is the net percentage increase in the price? | Numerical | — | No | 8% | Percentages, Profit & Loss |
| 4 | In a class, the average mark of all students is 60%. If the average mark of 25 students is 65%, what is the average mark of the remaining 15 students? | Numerical | — | No | ~51.67% | Averages, Statistics |
| 5 | The radius of a circular garden increases by 20%. By what percentage does the area of the garden increase? | Numerical | — | No | 44% | Area, Circles, Percentages |
| 6 | How many prime numbers between 51 and 501 are divisible by 3? | Numerical | — | No | 1 (only 3, but 3 is not in range, so 0? trick question) | Prime Numbers, Divisibility |

### Hari's Session — English (March 13, 2025) — 6 Actual + 18 Model Questions

**Actual Exam Questions (6):**

| # | Question Text | Type | Options | Answer | Topics |
|---|---|---|---|---|---|
| 1 | Choose the correct question tag for "The cake was too sweet." | MCQ | a) wasn't it? b) isn't it? c) was it? d) doesn't it? | a) wasn't it? | Question Tags |
| 2 | What is the meaning of the phrase "flying colors"? | MCQ | a) With great success b) In a hurry c) Without preparation d) With difficulty | a) With great success | Idioms & Phrases |
| 3 | Which of the following sentences is grammatically correct? | MCQ | a) She doesn't like ice cream b) She does like ice cream c) She didn't like ice cream d) She don't like ice cream | a) She doesn't like ice cream | Grammar, Sentence Correction |
| 4 | Identify the option with the correct subject-verb agreement | MCQ | a) The teacher and the students was... b) Neither of the answers is correct c) The group of boys are... d) Each of the players were... | b) Neither of the answers is correct | Subject-Verb Agreement |
| 5 | Among the following, which word is NOT a suitable adjective for a meal? | MCQ | a) Digestible b) Mouth-watering c) Tasty d) Rough | d) Rough | Adjectives, Vocabulary |
| 6 | "Tabu was a remarkable poet..." Find the number of nouns in that paragraph. | Numerical | — | Count exercise | Nouns, Parts of Speech |

**Model Questions Set 1 (6):** Question tags ("She went to the market"), "break the ice" meaning, grammar, subject-verb agreement, adjective for weather (NOT: Delicious), noun counting (Rani Lakshmibai paragraph)

**Model Questions Set 2 (6):** Question tags ("You have finished your homework"), "once in a blue moon" meaning, grammar, subject-verb agreement, adjective for a person (NOT: Tasty), noun counting (Dr. B.R. Ambedkar paragraph)

**Model Questions Set 3 (6):** Question tags ("She can draw very well"), "break the ice" meaning, grammar, subject-verb agreement, adjective for a building (NOT: Delicious), noun counting (Kalpana Chawla paragraph)

### Hari's Session — GK/Visual Reasoning (March 13, 2025) — 11 Questions

| # | Question Text | Type | Has Image | Topics |
|---|---|---|---|---|
| 1 | Count the number of animals present in the given image | Numerical | Yes (spot-the-difference style dog illustration) | Visual Counting, Observation |
| 2 | Identify this logo (Asian Games / Olympics / Commonwealth Games) | MCQ | Yes (logo image needed) | Logo Identification, Sports Events |
| 3 | Find the number of differences between the two given pictures | Numerical | Yes (spot-the-difference) | Visual Observation |
| 4 | How many meaningful three-letter English words from R, T, A? | Numerical | No | Word Formation, English |
| 5 | Count the total number of fish shown in the given image | Numerical | Yes (colorful fish illustration) | Visual Counting |
| 6 | Identify the correct unfolded form of the given shape | MCQ | Yes (3D shape + 4 unfolded options) | Spatial Reasoning, Nets |
| 7 | Identify the correct rotated form of the given shape | MCQ | Yes (arrow shape) | Spatial Reasoning, Rotation |
| 8 | Two wedge-shaped pieces cut from square (side 20). Find remaining area | Numerical | Yes (3D wedge visualization) | Area, Geometry, 3D Shapes |
| 9 | Identify the correct pattern of hatched pieces | MCQ | Yes (pattern needed) | Pattern Recognition |
| 10 | Find the correct composition that fits the given image | MCQ | Yes (composition needed) | Pattern Completion |
| 11 | Clock 4:30 — find the angle between shorthand and long hand | Numerical | No | Clock Angles, Geometry |

### Hari's Session — Logical Reasoning (March 13, 2025) — 11 Questions

| # | Question Text | Type | Has Image | Topics |
|---|---|---|---|---|
| 1 | How many triangles in the given diagram of multiple intersecting triangles? | Numerical | Yes (diamond/rhombus grid) | Triangle Counting, Geometry |
| 2 | How many rhombuses are present in the given diagram? | Numerical | Yes (same figure) | Rhombus Counting, Geometry |
| 3 | Select the suitable figure from options that fits into the box | MCQ | Yes (3×3 matrix pattern) | Pattern Recognition, Matrix Reasoning |
| 4 | Woman looking at painting: "son of the father of my brother" — who? | MCQ | No | Blood Relations, Logical Reasoning |
| 5 | Months in alphabetical order, first is April — what is 9th month? | MCQ | No | Alphabetical Ordering, Logic |
| 6 | Find the missing number in the given figure | Numerical | Yes (number grid) | Number Series, Mathematical Reasoning |
| 7 | — (numbering gap, likely continuation) | — | — | — |
| 8 | Days of week alphabetically, first is Friday — what is 5th day? | MCQ | No | Alphabetical Ordering, Logic |
| 9 | Three blocks arranged — correct view from direction of arrow? | MCQ | Yes (3D block arrangement) | Spatial Visualization, Orthographic Views |
| 10 | Students seated: blue, green, red, yellow repeating — color at 30th? | MCQ | No | Sequences, Patterns, Modular Arithmetic |
| 11 | Equilateral triangle ABC DEF composition — area of smallest trapezium? | Numerical | Yes (triangle composition figure) | Area, Trapezium, Geometry |

### Vedanth's Session (April 9, 2025) — ~25 Questions

**NCQ (Numerical):**
| # | Question Text | Completeness | Has Image | Topics |
|---|---|---|---|---|
| 1 | Find no. of animals [Mughal-style painting] | Full | Yes (Mughal hunting scene painting) | Visual Counting, Indian Art |
| 2 | Find no. of chairs, light fixtures [room image] | Full | Yes (modern dining room photo) | Visual Counting, Interior Design |
| 3 | Family with 3 generations... age difference between youngest daughter and mother? | Full (word-perfect) | No | Blood Relations, Family Problems, Age |
| 4 | Family with 4 generations... how many daughters? | Full (word-perfect) | No | Blood Relations, Family Problems |

**MCQ (Listed):**
| # | Question Text | Completeness | Topics |
|---|---|---|---|
| 5 | Find no. of isosceles triangles in image (with primary colours) | Topic + context | Triangle Counting, Colour Theory |
| 6 | How many primary colour triangles share at least 1 side with another triangle | Full | Geometry, Colour Theory, Adjacency |
| 7 | Gwalior Fort identification | Topic only | Monument Identification |
| 8 | Shirdi is in which state | Full (answer: Maharashtra) | General Knowledge, Geography |
| 9 | Find image showing correct rotated form → | Full | Spatial Reasoning, Rotation |
| 10 | English questions (meaning of efficacy, fill in proper word, no. of pronouns, etc) | Category only | English, Vocabulary, Grammar |
| 11 | Houses with sloped roof found in which areas (heavy rainfall areas) | Full with answer | Architecture Basics, Climate |
| 12 | Doors and windows generally made of what type of wood (teak) | Full with answer | Building Materials, Construction |
| 13 | Matri Mandir shape | Topic only | Monument Identification, Architecture |
| 14 | Which image shows the above image with its hidden edges | Full | Spatial Visualization, Hidden Lines |
| 15 | Blood relation question | Category only | Blood Relations |
| 16 | Top view, side view of object | Category only | Orthographic Projection |
| 17 | Figure related question (how will image look if lines are extended) | Partial | Spatial Reasoning, Line Extension |
| 18 | Colour theory – 2 ques | Category only | Colour Theory |
| 19 | Who was against Donald Trump in 2024 US election | Full | Current Affairs, World Politics |
| 20 | Hampi temple identification | Topic only | Monument Identification |
| 21 | Japanese style building identification | Topic only | Architecture Styles, Japanese Architecture |
| 22 | Use of pantry | Full | Architecture, Room Functions |
| 23 | Place where trading of stocks takes place (Stock exchange) | Full with answer | General Knowledge, Finance |

**Math:**
| # | Question Text | Completeness | Topics |
|---|---|---|---|
| 24 | Area — complex figure with overlapping parallelograms (2 Qs: largest parallelogram area + largest triangle area) | Partial | Area, Parallelograms, Geometry |
| 25 | Volume — 2 questions | Category only | Volume, 3D Geometry |
| 26 | Series — 1 question | Category only | Number Series |

### Anagha & Avinasha's Session (April 9, 2025) — ~25 Topic Signals

**Part B by Avinasha:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 1 | Kashi Vishwanath Temple | Topic only | Monument Identification |
| 2 | Direction of person | Topic only | Direction Sense |
| 3 | Percentage | Topic only | Percentages |
| 4 | Shapes counting, grid ratio | Topic only | Counting, Grids, Ratios |
| 5 | Problem related to train | Topic only | Time Speed Distance |
| 6 | Time and distance | Topic only | Time Speed Distance |
| 7 | Time and work related | Topic only | Time and Work |
| 8 | AP GP | Topic only | Arithmetic Progression, Geometric Progression |
| 9 | Blood relation for family | Topic only | Blood Relations |
| 10 | Clock in mirror | Topic only | Clock Problems, Mirror Images |
| 11 | Star can be written like this then what | Partial | Pattern Recognition |
| 12 | Cylinder remaining area finding when carved a portion | Partial | Surface Area, 3D Geometry |

**Part B by Anagha:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 13 | Sanchi Stupa — cycle of life and death symbol | Topic + detail | Monument Identification, Buddhism |
| 14 | Synonyms related to given words, adverbs and subject-verb-agreement | Category | English, Vocabulary, Grammar |
| 15 | Big star shape with triangles — count adjacent primary colour triangles + count rhombuses | Detailed | Geometry, Counting, Colour Theory |
| 16 | Picture of room — identify number of lighting fixtures | Detailed | Visual Counting, Interior Design |
| 17 | Principal amount, simple interest | Topic only | Simple Interest, Mathematics |
| 18 | Few full forms related to daily life | Topic only | General Knowledge, Abbreviations |
| 19 | Identifying shadow's shape for multiple objects kept together | Detailed | Spatial Reasoning, Shadows |
| 20 | Profit and Loss | Topic only | Profit and Loss |
| 21 | Dividend, divisor, quotient and remainder relation | Topic + context | Division, Number Theory |
| 22 | Many questions related to colour schemes and colour wheel | Category | Colour Theory |
| 23 | 2-3 questions related to finding TSA of modified figure (e.g., cube cut) | Detailed | Surface Area, 3D Geometry |
| 24 | Tessellations | Topic only | Tessellations, Geometry, Art |
| 25 | Area of 2D and 3D shapes (especially rhombus in 2D) | Topic + context | Area, Geometry |

---

## Topic Taxonomy (Extracted Knowledge Nodes)

### Master Topic List with Session Frequency

**HIGH PRIORITY (3+ sessions):**
- Visual Counting (animals, fish, objects, lighting) — ALL sessions
- Geometry: Triangle/Rhombus Counting — 3 sessions
- Colour Theory & Colour Wheel — 3 sessions
- Blood Relations / Family Problems — 3 sessions
- English: Subject-Verb Agreement — 3 sessions
- Spatial Reasoning (rotation, unfolding, hidden edges) — 3 sessions
- Area & Volume (2D and 3D) — 3 sessions

**MEDIUM PRIORITY (2 sessions):**
- Monument / Building Identification — 2 sessions
- Clock Problems (angles, mirror) — 2 sessions
- Percentages / Profit & Loss — 2 sessions
- Pattern Recognition / Completion — 2 sessions
- Orthographic Projection (top view, side view) — 2 sessions
- Spot the Difference / Visual Observation — 2 sessions
- English: Idioms & Phrases — 2 sessions
- English: Parts of Speech (nouns, pronouns) — 2 sessions

**APPEARED ONCE (still important):**
- Time Speed Distance / Trains — 1 session
- Time and Work — 1 session
- AP/GP (Arithmetic & Geometric Progression) — 1 session
- Simple Interest — 1 session
- Tessellations — 1 session
- Alphabetical Ordering (months, days) — 1 session
- Word Formation — 1 session
- Current Affairs (US election) — 1 session
- Architecture Basics (sloped roofs, room functions) — 1 session
- Building Materials (teak wood) — 1 session
- Logo Identification — 1 session
- Shadow Identification — 1 session
- Sequences / Modular Arithmetic — 1 session
- Number Series — 1 session
- Direction Sense — 1 session
- Abbreviations / Full Forms — 1 session

### Sub-topics for Monument Identification

(This is the type of study material depth needed per topic node)

Monuments that appeared in NATA 2025 recalls:
1. **Gwalior Fort** — Madhya Pradesh, one of India's largest hill forts
2. **Hampi Temple** — Karnataka, Vijayanagara Empire, UNESCO World Heritage
3. **Kashi Vishwanath Temple** — Varanasi, Uttar Pradesh, Jyotirlinga
4. **Sanchi Stupa** — Madhya Pradesh, Buddhist monument, UNESCO, Ashoka
5. **Matri Mandir** — Auroville, Tamil Nadu, spherical meditation chamber
6. **Japanese-style Building** — likely Pagoda or Shinto shrine architecture

---

## Confidence Rating System

Three-level system applied to every question:

| Level | Label | Badge Color | Criteria | Can Practice? |
|-------|-------|-------------|----------|---------------|
| 1 | **Verified** | Green | Full question text + options + answer confirmed by teacher (Hari) | Yes — test engine |
| 2 | **Recalled** | Amber | Question text clear enough to understand, but may lack options/verified answer | View only (can be promoted to Verified after teacher review) |
| 3 | **Topic Only** | Grey | Only topic/description available, no usable question | No — links to study material |

### Promotion Flow
- Tier 3 → Tier 2: When a teacher reconstructs a plausible question from the topic signal
- Tier 2 → Tier 1: When a teacher validates/corrects the question text, adds options, confirms answer

---

## Supabase Schema Design (Proposed)

> **NOTE**: This needs to be aligned with the existing JEE question bank schema. Get the JEE JSON schema before finalizing.

### Core Tables

```sql
-- Exam papers (both JEE and NATA)
CREATE TABLE exam_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('JEE_PAPER2', 'NATA')),
  year INTEGER NOT NULL,
  session_date DATE, -- NULL for JEE (single paper), populated for NATA sessions
  session_label TEXT, -- e.g., "Session 1 - March 13", auto-generated
  paper_source TEXT NOT NULL CHECK (paper_source IN ('official', 'recalled')),
  total_questions INTEGER,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contributors (students who recalled questions)
CREATE TABLE paper_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES exam_papers(id),
  contributor_name TEXT NOT NULL,
  contributor_role TEXT CHECK (contributor_role IN ('teacher', 'student')),
  contributor_student_id UUID REFERENCES students(id), -- NULL if external
  contribution_date DATE,
  notes TEXT, -- e.g., "Wrote from exam hall"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions (unified for JEE and NATA)
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES exam_papers(id),
  contributor_id UUID REFERENCES paper_contributors(id),
  
  -- Question content
  question_number INTEGER, -- original number in source, may have gaps
  question_text TEXT, -- full text, may be partial for Tier 2/3
  question_text_hindi TEXT, -- bilingual support (JEE has this)
  question_type TEXT CHECK (question_type IN ('MCQ', 'MSQ', 'Numerical', 'Drawing', 'Image_Based')),
  
  -- Options (for MCQ/MSQ)
  options JSONB, -- [{key: "a", text: "...", text_hindi: "..."}, ...]
  correct_answer TEXT, -- "a" or "42" or description
  answer_source TEXT CHECK (answer_source IN ('official', 'teacher_verified', 'student_recalled', 'unverified')),
  
  -- Solution
  explanation_brief TEXT,
  explanation_detailed TEXT,
  solution_video_url TEXT,
  
  -- Images/Figures
  has_figure BOOLEAN DEFAULT FALSE,
  figure_description TEXT, -- "Triangle diagram with points A,B,C,D"
  figure_url TEXT, -- Supabase storage URL
  figure_type TEXT CHECK (figure_type IN ('original', 'recreated', 'reference', 'placeholder')),
  
  -- Drawing-specific fields (Part A)
  drawing_marks INTEGER, -- 25 or 30
  drawing_prompt_hindi TEXT, -- bilingual prompt
  design_principle_tested TEXT, -- "Emphasis", "Dynamism", "Composition"
  colour_constraint TEXT, -- "maximum 4 colours", "analogous only", "black and white"
  objects_to_include TEXT[], -- ["2 street lights", "2 garden lights", "8 flood lamps"]
  
  -- Confidence & Classification
  confidence_tier INTEGER CHECK (confidence_tier IN (1, 2, 3)),
  -- 1=Verified, 2=Recalled, 3=Topic Only
  
  section TEXT, -- "Math", "English", "Logical", "GK", "Architecture", "Drawing"
  
  -- Topic Intelligence
  topic_tags TEXT[], -- ["Geometry", "Triangle Counting"]
  topic_nodes UUID[], -- references to topic_nodes table
  
  -- Metadata
  is_duplicate BOOLEAN DEFAULT FALSE, -- same question seen in another session
  duplicate_of UUID REFERENCES questions(id),
  nta_question_id TEXT, -- for JEE official papers
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topic Intelligence nodes
CREATE TABLE topic_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- "Monument Identification"
  parent_id UUID REFERENCES topic_nodes(id), -- for hierarchy
  slug TEXT UNIQUE NOT NULL, -- "monument-identification"
  description TEXT,
  exam_types TEXT[], -- ['NATA', 'JEE_PAPER2'] — shared between exams
  
  -- Study Material (in-app)
  study_content_md TEXT, -- Markdown content, initially empty
  study_video_urls TEXT[], -- YouTube embed URLs
  study_resources JSONB, -- [{title, url, type}]
  
  -- Frequency intelligence
  session_count INTEGER DEFAULT 0, -- how many sessions this appeared in
  question_count INTEGER DEFAULT 0, -- total questions tagged with this
  priority TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction: questions ↔ topic_nodes (many-to-many)
CREATE TABLE question_topic_map (
  question_id UUID REFERENCES questions(id),
  topic_node_id UUID REFERENCES topic_nodes(id),
  PRIMARY KEY (question_id, topic_node_id)
);

-- Sub-topics (e.g., specific monuments under "Monument Identification")
CREATE TABLE topic_sub_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_node_id UUID REFERENCES topic_nodes(id),
  name TEXT NOT NULL, -- "Gwalior Fort"
  description TEXT, -- "Madhya Pradesh, one of India's largest hill forts"
  source_sessions TEXT[], -- ["April 9, 2025"]
  source_contributors TEXT[], -- ["Vedanth"]
  study_content_md TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key RLS Policies

```sql
-- Students can view published papers and questions
-- Teachers can view all + edit
-- Admin (Hari) can do everything
-- Parents get read-only access through student's profile
```

### Storage Buckets

```
nata-recalled-figures/
├── {paper_id}/
│   ├── {question_id}_original.png   -- from OneNote export
│   ├── {question_id}_recreated.svg  -- teacher-recreated
│   └── {question_id}_reference.jpg  -- student-pasted reference
```

---

## UI Wireframe Specifications

### Mobile-First Layout (95% users)

**Screen 1: Paper Browser**
```
┌─────────────────────────┐
│ ← Question Bank         │
├─────────────────────────┤
│ [JEE Paper 2] [NATA]   │ ← Tab toggle
├─────────────────────────┤
│ NATA 2025          ▼    │ ← Year dropdown
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ March 13, 2025      │ │
│ │ 👤 Hari (Verified)  │ │
│ │ 34 Qs │ 🟢17 🟡8 ⚪9│ │ ← tier counts
│ │ Topics: Colour      │ │
│ │ Theory, Geometry...  │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ April 9, 2025       │ │
│ │ 👤 Vedanth, Anagha, │ │
│ │   Avinasha           │ │
│ │ 50 Qs │ 🟢4 🟡12 ⚪34│ │
│ │ 🔗 3 overlapping Qs │ │ ← cross-contributor matches
│ │ Topics: Monuments,   │ │
│ │ Blood Relations...   │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

**Screen 2: Session Detail → Questions**
```
┌─────────────────────────┐
│ ← April 9, 2025        │
├─────────────────────────┤
│ [All] [Verified] [Recalled] [Topics] │ ← filter chips
│ [Math] [English] [Logic] [GK] [Arch] │ ← section filter
├─────────────────────────┤
│ 📊 Topic Radar          │ ← expandable
│ Monument ID ████████ 6  │
│ Colour Theory █████ 4   │
│ Blood Relations ███ 2   │
│ ...                     │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 🟢 VERIFIED  MCQ    │ │
│ │ Find no. of animals │ │
│ │ in the given image   │ │
│ │ [🖼️ Mughal painting] │ │
│ │ 📌 Visual Counting,  │ │
│ │    Indian Art         │ │
│ │ 👤 Vedanth           │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🟡 RECALLED  MCQ    │ │
│ │ Gwalior Fort         │ │
│ │ identification       │ │
│ │ ⚠️ Partial recall    │ │
│ │ 📌 Monument ID       │ │
│ │ 👤 Vedanth           │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ ⚪ TOPIC SIGNAL      │ │
│ │ AP GP                │ │
│ │ 📌 Arithmetic &      │ │
│ │    Geometric          │ │
│ │    Progression        │ │
│ │ 👤 Avinasha          │ │
│ │ [📖 Study Material →]│ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

**Screen 3: Topic Intelligence (Study Material)**
```
┌─────────────────────────┐
│ ← Monument Identification│
├─────────────────────────┤
│ 🔥 HIGH PRIORITY         │
│ Appeared in 2/4 sessions │
├─────────────────────────┤
│ Monuments Asked:         │
│ ┌─────────────────────┐ │
│ │ 🏛️ Gwalior Fort      │ │
│ │ MP, largest hill fort│ │
│ │ Session: Apr 9       │ │
│ │ [📖 Read More]       │ │ ← opens in-app content
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🏛️ Hampi Temple      │ │
│ │ Karnataka, UNESCO    │ │
│ │ Session: Apr 9       │ │
│ │ [📖 Read More]       │ │
│ └─────────────────────┘ │
│ ... more monuments       │
├─────────────────────────┤
│ Study Material           │
│ [Content area - initially│
│  empty, teacher adds     │
│  over time]              │
├─────────────────────────┤
│ Related Questions (3)    │
│ → Gwalior Fort ID (🟡)  │
│ → Hampi Temple ID (🟡)  │
│ → Kashi Vishwanath (⚪)  │
└─────────────────────────┘
```

### Desktop/Laptop Layout

Same content but with a **2-panel layout**:
- Left panel: Paper browser / session list (persistent)
- Right panel: Question list / question detail / topic intelligence

---

## Implementation Phases

### Phase 1: Schema + Data Ingestion (Backend)
- [ ] Align with existing JEE question bank schema
- [ ] Create Supabase tables (exam_papers, questions, topic_nodes, etc.)
- [ ] Set up storage bucket for figures
- [ ] Build admin panel module for bulk question import
- [ ] Import Hari's 34 questions as Tier 1 (Verified)
- [ ] Import Vedanth's questions as Tier 2 (Recalled)
- [ ] Import Anagha/Avinasha's data as Tier 3 (Topic Only)

### Phase 2: Paper Browser + Question Cards (Frontend — Nexus)
- [ ] NATA tab in existing Question Bank section
- [ ] Year → Session hierarchy navigation
- [ ] Session cards with contributor info + tier counts
- [ ] Question cards with 3-tier visual treatment
- [ ] Section/topic filter chips
- [ ] Mobile-first responsive layout

### Phase 3: Topic Intelligence Map
- [ ] Topic taxonomy seeding (from extracted nodes above)
- [ ] Topic Radar visualization per session
- [ ] Cross-session frequency analysis
- [ ] Tappable topic → Study Material page (empty shell initially)
- [ ] Sub-topic listings with source attribution

### Phase 4: Study Material Content
- [ ] Admin panel: Topic content editor (Markdown)
- [ ] Admin panel: Video URL attachment
- [ ] Monument sub-topics with descriptions
- [ ] Gradually populate content for high-priority topics

### Phase 5: Integration with Existing Systems
- [ ] Connect Nexus recall feature → auto-creates Tier 3 entries
- [ ] Teacher review/promotion workflow (Tier 3 → 2 → 1)
- [ ] Test engine integration for Tier 1 questions
- [ ] Cross-reference with JEE question bank shared topics

---

## NATA 2025 Exam Structure (CONFIRMED from Tammana's Paper Header)

From the actual question paper screenshot (Tammana, TN97 center — Saveetha College of Architecture & Design):

| Detail | Value |
|--------|-------|
| **Exam Name** | National Aptitude Test in Architecture (2025) |
| **Center Code** | TN97 (Saveetha College of Architecture & Design) |
| **Total Marks** | 80 (Part A) + Part B marks (TBD) |
| **Time Allowed** | 90 Minutes |
| **Language** | Bilingual — English + Hindi |
| **Part A (Drawing)** | 3 questions: A1 (25 marks), A2 (25 marks), A3 (30 marks) |
| **Part B (Aptitude + GK + English + Math)** | MCQ / Numerical / Image-based questions |

### Part A — Drawing Section (Confirmed Questions from Multiple Sessions)

**Tammana's Session (April 19, 2025):**
- A1 (25 marks): Use 2D profiles of 1 doll, 3 cars, 2 soft toys and 2 balls to create an interesting composition. (Intersection & overlapping of profiles allowed). Use only analogous colors.
- A2 (25 marks): Draw an interesting composition in black and white with 3 footballs, 4 cricket balls and a cricket cap.
- A3 (30 marks): Using the pieces given in the set, compose a 3D sculptural form depicting DYNAMISM.

**Kanisha's Session (April 25, 2025):**
- A1 (25 marks): Create a poster — Film Festival (maximum 4 colours)
- A2 (25 marks): 3D composition — 2 street lights, 2 garden lights, 8 flood lamps with shad and shadow
- A3 (30 marks): Object — 3D model: 2 circles, 2 triangles, 2 parallelograms, 2 hexagons, 4 trapeziums (2 thick, 2 thin) — Show Emphasis

**Maheshwar's Session (April 25, 2025 — TN95: Papni School of Architecture):**
- A1 (25 marks): Create a circular logo to be printed on water bottles for the CORPORATE WELLNESS CHALLENGE. Incorporate a maximum of four colours.
- A2 (25 marks): Make an interesting black and white 3D composition showing shade and shadow using 1 desk lamp, 3 pedestal lamps, 2 oil lamps, and 2 candles.
- A3 (30 marks): Using the pieces given in the set, compose a 3D sculptural form depicting **EMPHASIS**.

**Cheralathan's friends (session date TBD):**
- Drawing/fashion question: Fashion designs based on dress code
- Drawing: Composition of basketball, sneakers, and hoodies as theme for sports jersey
- 3D: Wave model 3D
- 3D: 9 cylinders — asymmetry

> **CRITICAL DISCOVERY — A3 is SAME across centers on same date!**
> Kanisha (April 25) A3 = "Show Emphasis" and Maheshwar (April 25, different center TN95) A3 = "depicting EMPHASIS". 
> A1 and A2 differ between centers, but A3 (the 30-mark question) appears to be standardized.
> Similarly, Tammana (April 19) A3 = "depicting DYNAMISM" — different date, different principle.
> **Pattern**: A3 is a national-level standardized question testing a specific design principle (Emphasis, Dynamism, etc.) while A1 and A2 vary by center.

**Confirmed Part A Question Patterns:**
| Slot | Marks | Pattern | Varies By |
|------|-------|---------|-----------|
| A1 | 25 | 2D composition / Logo / Poster (colour-constrained) | Center |
| A2 | 25 | 3D composition with shade & shadow (objects given) | Center |
| A3 | 30 | 3D sculptural form depicting [DESIGN PRINCIPLE] | Date only (same across centers) |

**Design Principles tested in A3 so far**: Dynamism (Apr 19), Emphasis (Apr 25)

### Niranjan's Weightage Insight (April 11, 2025)

"Point no. 1,2,6,8 and 11 mentioned above are asked for 70% in the Aptitude" — mapping to:
- Ratios (inscribed shapes) — ~70%
- Angle finding — ~70%
- Image sequence (find next) — ~70%
- Shape counting (triangles/squares) — ~70%
- History of Indian monuments — ~70%

**This means geometry, pattern recognition, and monument identification make up ~70% of Part B.**

---

## Open Questions (Need Resolution Before Implementation)

1. **JEE JSON schema alignment** — Need the existing schema to ensure compatibility
2. **Image storage strategy** — How are JEE question images currently stored? Same approach for NATA?
3. ~~**NATA exam total question count**~~ — **PARTIALLY ANSWERED**: Part A = 3 drawing Qs (80 marks, 90 min). Part B question count still unclear — ranges from 15-50+ across student recalls, suggesting either different session lengths or incomplete recall.
4. ~~**Drawing questions**~~ — **ANSWERED**: Drawing prompts ARE being recalled (Tammana + Kanisha). Should be stored as a separate question type with the prompt text, marks, and design principles being tested.
5. **Duplicate detection** — When a question appears across sessions, should it show once (with "seen in 3 sessions" badge) or separately per session?
6. **Student privacy** — Should contributor names be visible to all students, or only to admin/teachers?
7. **Part A vs Part B separation** — Should drawing prompts be in the same question bank or a separate "Drawing Prompts" section?

---

## File References

All source PDFs are in Neram Classes SharePoint OneNote:
- `haribabu_neramclasses_com` SharePoint → OneNote
- Pages: Math (Mar 21), English (Mar 13), Logical (Mar 13), GK (Mar 13), Vedanth (Apr 9), Anagha/Avinasha (Apr 9), Rithika Senthil (Apr 21), Tammana (Apr 19/21), Niranjan (Apr 11), Kanisha (Apr 25 — handwritten scan)
- 10 student contributions processed so far out of 20 total

---

## NEW: Additional Student Data (Batch 2)

### Kanisha's Session (April 25, 2025) — Handwritten, 1st Attempt — 3 Part A + 8 Part B

**Part A (Drawing — 80 marks total):**

| # | Prompt | Marks | Design Principle Tested |
|---|---|---|---|
| A1 | Create a poster — Film Festival (maximum 4 colours) | 25 | Poster Design, Colour Limitation |
| A2 | 3D composition — 2 street lights, 2 garden lights, 8 flood lamps with shade and shadow | 25 | 3D Composition, Light & Shadow |
| A3 | Object — 3D model: 2 circles, 2 triangles, 2 parallelograms, 2 hexagons, 4 trapeziums (2 thick, 2 thin) — Show Emphasis | 30 | 3D Modeling, Emphasis, Geometric Composition |

**Part B (Aptitude):**

| # | Question Text | Completeness | Has Image | Answer | Topics |
|---|---|---|---|---|---|
| 1 | Mirror image — clock showing 8:50 | Full | Yes (implied) | — | Mirror Image, Clocks |
| 2 | 5 people facing north direction, who is in the extreme left? | Full | No | — | Direction Sense, Seating Arrangement |
| 3 | Image was given, count the no. of women | Full | Yes (implied) | — | Visual Counting |
| 4 | A triangle having 3cm, 4cm and 5cm is a? | Full | No | Right angled triangle | Triangle Classification, Pythagorean |
| 5 | [Star-of-David figure drawn] — no. of isosceles triangles? | Full | Yes (hand-drawn) | — | Triangle Counting, Geometry |
| 6 | A circle is inscribed in a square of sides 10cm each, what is the area of the circle? | Full | No | 25π cm² | Circle Area, Inscribed Shapes |
| 7 | What is the top portion of any column called? | Full | No | Capital | Architecture Terminology, Column Orders |
| 8 | An orange was cut into half, how many no. of lines can be seen? (Image given) | Full | Yes (implied) | — | Visual Reasoning, Cross-sections |
| — | (From Hari's note) Question about the first underground metro | Topic only | No | Kolkata Metro | Current Affairs, Infrastructure |

### Tammana's Session (April 19, 2025) — 3 Part A + 15 Part B

**Part A (Drawing — from actual paper screenshot):**

| # | Prompt (English) | Prompt (Hindi) | Marks |
|---|---|---|---|
| A1 | Use 2D profiles of 1 doll, 3 cars, 2 soft toys and 2 balls to create an interesting composition. (Intersection & overlapping of profiles allowed). Use only analogous colors. | एक दिलचस्प संरचना बनाने के लिए 1 डॉल, 3 कारें, 2 सॉफ्ट टॉयज और 2 गेंदों के 2D प्रोफाइल का उपयोग करें | 25 |
| A2 | Draw an interesting composition in black and white with 3 footballs, 4 cricket balls and a cricket cap. | 3 फुटबॉल, 4 क्रिकेट बॉल और एक क्रिकेट कैप से ब्लैक एंड व्हाइट में एक मनोरंजक संरचना बनाएं | 25 |
| A3 | Using the pieces given in the set, compose a 3D sculptural form depicting DYNAMISM. | सेट में दिए गए टुकड़ों का उपयोग करके, गतिशीलता को दर्शाता एक 3D मूर्तिकला रूप तैयार करें | 30 |

**Part B (Aptitude):**

| # | Question Text | Completeness | Topics |
|---|---|---|---|
| 1 | The sum of the factors of 20 | Full | Number Theory, Factors |
| 2 | The sum of the factors of 60 | Full | Number Theory, Factors |
| 3 | They gave a pic of some fishes and asked how many fishes | Full (image-dependent) | Visual Counting |
| 4 | How many triangles in the picture (3 questions) | Category + count | Triangle Counting |
| 5 | They gave "not to overtake" symbol and asked what this pic is representing | Full | Sign Recognition, Traffic Signs |
| 6 | 3 questions related to family generation and how many cousins | Category + count | Blood Relations, Family Problems |
| 7 | Sum of numbers between 1-100 which are multiples of both 8 and 12 | Full | LCM, Number Theory, Arithmetic |
| 8 | (numbering gap in original) | — | — |
| 9 | A man goes north then moves right side then rotates 90°, takes U-turn and walks — which side is he facing? | Partial (student's own words) | Direction Sense |
| 10 | They gave a symbol of Bird (🕊) — what does this represent? | Full | Symbol Recognition, Peace |
| 11 | Question related to Kashi Vishwanath temple — architectural designing | Topic + context | Monument Identification, Architecture |
| 12 | Identify the consonant in the given word | Full | English, Phonetics |
| 13 | 3 questions related to synonyms of the word | Category + count | English, Vocabulary, Synonyms |
| 14 | 2 sums related to percentage calculation | Category + count | Percentages |
| 15 | A sum based on 2D structure | Topic only | 2D Geometry |

### Rithika Senthil's Session (April 21, 2025) — 13 Part B Questions (HIGH QUALITY — includes solutions)

| # | Question Text | Type | Options | Answer | Topics |
|---|---|---|---|---|---|
| 1 | The month April would be among the first when months arranged alphabetically — what is the 9th month? | MCQ | — | November | Alphabetical Ordering, Logic |
| 2 | When a square is inscribed in a circle of radius 7cm, what is the area of the square? | Numerical | — | 98 cm² | Inscribed Shapes, Area, Geometry |
| 3 | In a 3×3 cube, ratio of 3-side-color face to 2-side-color face? | Numerical | — | 8:12 = 2:3 | Cube Coloring, Ratios, 3D Geometry |
| 4 | In a 4×4 cube, ratio of 3-side-color face to 2-side-color face? | Numerical | — | 8:24 = 1:3 | Cube Coloring, Ratios, 3D Geometry |
| 5 | Count triangles in fig where 25% filled with primary and 75% with secondary colors | Numerical | — | — | Triangle Counting, Colour Theory |
| 6 | Count the no. of isosceles triangles in the given image | Numerical | — | — | Triangle Counting, Geometry |
| 7 | Count the no. of triangles in the given image (image 1) | Numerical | — | — | Triangle Counting |
| 8 | Choose the complementary color | MCQ | A) White/blue B) Black/Yellow C) Red/Orange D) Red/Green | D) Red and Green | Colour Theory, Complementary Colors |
| 9 | Volume of cuboid is 10 ft³. If dimensions doubled (2l×2b×2h), new volume? | Numerical | — | 80 ft³ (full solution provided by student) | Volume, Scaling, 3D Geometry |
| 10 | Distance travelled by earth around sun at 30 km/s? | Numerical | — | ~946.7 million km (full solution provided) | Speed-Distance-Time, Science |
| 11 | Where is this style mostly seen? (Image 2) | MCQ | A) Rajasthan B) Gujarat C) West Bengal D) ? | — | Architecture Styles, Regional |
| 12 | Architect / Nobel prize winner of 2024? | MCQ | — | — | Current Affairs, Architecture Awards |
| 13 | What is the basic shape of Matri Mandir, Pondicherry? | MCQ | A) Lotus B) Cylinder C) Spherical D) ? | C) Spherical | Monument Identification, Matri Mandir |

### Niranjan's Session (April 11, 2025) — 13 Topic Signals + Weightage Insight

| # | Description | Completeness | Topics |
|---|---|---|---|
| 1 | Ratios of square and rectangle inscribed in a shape | Topic + context | Inscribed Shapes, Ratios |
| 2 | Find unknown angle using known angle | Topic only | Angles, Geometry |
| 3 | Some probability concepts | Topic only | Probability |
| 4 | Set language — state board 11th std concepts of transverse, symmetric etc. | Topic + context | Set Theory, Logic |
| 5 | Image with 4 boys and 3 girls shown twice — find total girls (ans=6) | Full with answer | Visual Counting, Trick Questions |
| 6 | Four images given — find the 5th image that appears next | Full (pattern type) | Image Sequence, Pattern Recognition |
| 7 | Pattern with triangles and squares — find number of squares | Full (pattern type) | Shape Counting |
| 8 | Pattern of square/triangle — find number of shapes | Full (pattern type) | Shape Counting |
| 9 | Logical question (finding relation between camera man and girl) | Partial with example | Blood Relations, Logical Reasoning |
| 10 | Current affairs — HRIDAY (asked in both JEE and NATA!) | Topic + cross-exam flag | Current Affairs, Government Schemes |
| 11 | History of Indian monuments | Topic only | Monument Identification |
| 12 | Some more maths concepts | Category only | Mathematics |
| 13 | Some general knowledge questions | Category only | General Knowledge |

**Niranjan's Weightage Note**: Points 1, 2, 6, 8, and 11 account for ~70% of Part B Aptitude. This maps to: **Inscribed shape ratios, Angle problems, Image sequences, Shape counting, and Monument history.**

---

## UPDATED: Cross-Session Question Overlaps (All 8 Sessions)

### Sessions Covered

| Session Date | Contributors | Quality |
|---|---|---|
| March 13, 2025 | Hari | Tier 1 (Verified) |
| March 21, 2025 | Hari | Tier 1 (Verified) |
| April 9, 2025 | Vedanth, Anagha, Avinasha | Tier 2 + Tier 3 |
| April 11, 2025 | Niranjan | Tier 3 (Topic signals) |
| April 19, 2025 | Tammana | Tier 2 |
| April 21, 2025 | Rithika Senthil | Tier 2 (high quality) |
| April 25, 2025 | Kanisha | Tier 2 (handwritten) |

### Master Overlap Matrix

| Topic/Question Pattern | Mar 13 (Hari) | Mar 21 (Hari) | Apr 9 (Ved/Ana/Avi) | Apr 11 (Nir) | Apr 19 (Tam) | Apr 21 (Rit) | Apr 25 (Kan) | Frequency |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Triangle/Shape Counting** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **6/7** |
| **Visual Counting (animals/fish/objects/people)** | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | **5/7** |
| **Monument Identification** | — | — | ✅ | ✅ | ✅ | — | — | **3/7** |
| **Blood Relations / Family** | — | — | ✅ | ✅ | ✅ | — | — | **3/7** |
| **Colour Theory (complementary/wheel)** | — | — | ✅ | — | — | ✅ | — | **2/7** |
| **Matri Mandir** | — | — | ✅ | — | — | ✅ | — | **2/7** |
| **Inscribed Shapes (circle↔square)** | — | — | — | ✅ | — | ✅ | ✅ | **3/7** |
| **Clock/Mirror Problems** | ✅ | — | — | — | — | — | ✅ | **2/7** |
| **Direction Sense** | — | — | — | — | ✅ | — | ✅ | **2/7** |
| **Kashi Vishwanath Temple** | — | — | ✅ | — | ✅ | — | — | **2/7** |
| **Alphabetical Ordering (months/days)** | ✅ | — | — | — | — | ✅ | — | **2/7** |
| **Cube Coloring/Ratios** | — | — | — | — | — | ✅ | — | **1/7** |
| **Percentages / Profit & Loss** | — | ✅ | ✅ | — | ✅ | — | — | **3/7** |
| **Architecture Terminology** | — | — | ✅ | — | — | — | ✅ | **2/7** |
| **English (SVA/Synonyms/Tags)** | ✅ | — | ✅ | — | ✅ | — | — | **3/7** |
| **Volume / 3D Geometry** | — | — | ✅ | — | — | ✅ | — | **2/7** |
| **Image Sequence (find next)** | — | — | — | ✅ | — | — | — | **1/7** |
| **Sign/Symbol Recognition** | — | — | — | — | ✅ | — | — | **1/7** |
| **Current Affairs** | — | — | ✅ | ✅ | — | ✅ | ✅ | **4/7** |
| **Spatial Reasoning (rotation/unfolding)** | ✅ | — | ✅ | — | — | — | — | **2/7** |
| **Number Theory (factors, LCM)** | — | — | — | — | ✅ | — | — | **1/7** |
| **Drawing: 2D Composition** | — | — | — | — | ✅ | — | ✅ | **2/7** (Part A) |
| **Drawing: 3D Composition** | — | — | — | — | ✅ | — | ✅ | **2/7** (Part A) |
| **Drawing: Design Principles** | — | — | — | — | ✅ | — | ✅ | **2/7** (Part A) |

### Critical Priority Topics (appears in 4+ sessions)

1. **Triangle/Shape Counting** — 6/7 sessions — HIGHEST PRIORITY
2. **Visual Counting** — 5/7 sessions
3. **Current Affairs** — 4/7 sessions

### High Priority Topics (appears in 3 sessions)

4. **Monument Identification** — 3/7
5. **Blood Relations / Family** — 3/7
6. **Inscribed Shapes** — 3/7
7. **Percentages / Profit & Loss** — 3/7
8. **English (SVA/Synonyms)** — 3/7

---

## UPDATED: Topic Taxonomy — Master List with Frequency

### By Priority (based on cross-session analysis)

**CRITICAL (4+ sessions):**
- Triangle / Shape Counting (triangles, rhombuses, squares in complex figures) — 6/7
- Visual Counting (animals, fish, people, objects in images) — 5/7
- Current Affairs (US election, Nobel prize, HRIDAY scheme, first underground metro) — 4/7

**HIGH (3 sessions):**
- Monument Identification (Gwalior Fort, Hampi, Kashi Vishwanath, Sanchi Stupa, Matri Mandir, Japanese architecture) — 3/7
- Blood Relations / Family Generation Problems — 3/7
- Inscribed Shapes (circle in square, square in circle, ratios) — 3/7
- Percentages / Profit & Loss — 3/7
- English: Subject-Verb Agreement, Synonyms, Question Tags — 3/7

**MEDIUM (2 sessions):**
- Colour Theory (complementary, analogous, primary/secondary, colour wheel) — 2/7
- Matri Mandir (specific monument, appears independently of general monument ID) — 2/7
- Clock / Mirror Image Problems — 2/7
- Direction Sense — 2/7
- Alphabetical Ordering (months, days) — 2/7
- Architecture Terminology (column capital, pantry, sloped roofs) — 2/7
- Volume / 3D Geometry (cuboid scaling, cube coloring) — 2/7
- Spatial Reasoning (rotation, unfolding, hidden edges) — 2/7
- Drawing: 2D Composition (Part A) — 2/7
- Drawing: 3D Composition with shading (Part A) — 2/7
- Drawing: Design Principles (emphasis, dynamism) — 2/7

**LOW (1 session, still worth noting):**
- Cube Coloring / Rubik's style ratio problems — 1/7
- Image Sequence (find 5th image) — 1/7
- Sign/Symbol Recognition (traffic signs, peace symbol) — 1/7
- Number Theory (sum of factors, LCM) — 1/7
- Set Theory (transverse, symmetric) — 1/7
- Probability — 1/7
- Speed-Distance-Time (earth orbit) — 1/7
- Cross-section Visualization (orange cut in half) — 1/7
- Tessellations — 1/7
- AP/GP — 1/7
- Simple Interest — 1/7

---

## Data Summary Statistics

| Metric | Value |
|--------|-------|
| Total sessions covered | 9 (Mar 13, Mar 21, Apr 9, Apr 11, Apr 19, Apr 21, Apr 25, May 3, + Cheralathan TBD) |
| Total contributors | 12 (Hari, Vedanth, Anagha, Avinasha, Niranjan, Tammana, Rithika, Kanisha, Maheshwar, Hamsa, Cheralathan's friends, + Cheralathan) |
| Total questions/signals catalogued | ~205 |
| Tier 1 (Verified) questions | ~34 (Hari's) |
| Tier 2 (Recalled) questions | ~85 |
| Tier 3 (Topic Only) signals | ~85 |
| Part A (Drawing) prompts | 12 (from 4 sessions + Cheralathan) |
| Unique topics identified | 40+ |
| Cross-session overlapping topics | 25+ confirmed |
| Remaining students to process | ~8 out of 20 |
| Actual paper header screenshots | 2 (Tammana TN97, Maheshwar TN95) |

---

## NEW: Additional Student Data (Batch 3)

### Maheshwar's Session (April 25, 2025 — TN95: Papni School of Architecture) — Part A Only (from paper screenshot)

Paper header confirms:
- Center: TN95 — Papni School of Architecture
- Exam ID: QAO8HU8A-251524859
- Candidate ID: 251524859
- Appointment ID: TN95-202518531
- Date: 25 Apr 2025, 02:03:39 PM
- Total Marks: 80 (Part A only)
- Time Allowed: 90 Minutes

Part A questions captured (see Drawing Section above for details). No Part B data from this contributor.

### Hamsa's Session (May 3, 2025) — 16 Part B Topic Signals

Nicely organized by section (History / Aptitude / Maths):

**History:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 1 | Nobel Prize 2024 → Peace | Topic + answer hint | Current Affairs, Nobel Prize |
| 2 | Gol Gumbaz | Topic only | Monument Identification |
| 3 | Lok Sabha members seats | Topic only | General Knowledge, Civics |
| 4 | In picture how many light fixtures there | Full | Visual Counting, Interior |
| 5 | Picture → (Nepal, India, Bhutan, Chinese) — identify country flag/map | Partial | General Knowledge, Geography, Flags |

**Aptitude:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 6 | Triangle counting | Topic only | Triangle Counting |
| 7 | Pairing the word [similar] (e.g., Pen:Write :: Book:Read) | Full with example | Analogies, Verbal Reasoning |
| 8 | Shapes sides number? | Topic only | Geometry, Polygons |
| 9 | Alphabets → A E F J [series] | Full | Letter Series, Pattern Recognition |
| 10 | Architecture terminologies – WC (Water Closet) | Full with answer | Architecture Terminology |
| 11 | Mirror Images | Topic only | Mirror Image, Spatial Reasoning |

**Maths:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 12 | Profit & loss problem | Topic only | Profit and Loss |
| 13 | Equilateral triangle problem | Topic only | Geometry, Equilateral Triangle |
| 14 | Marks (solved & not solved) problem | Topic + context | Arithmetic, Problem Solving |
| 15 | Map [direction] problem | Topic only | Direction Sense, Maps |
| 16 | Ratio and Proportion | Topic only | Ratio and Proportion |

### Cheralathan's Friends (Session date TBD) — 13 Questions/Signals

| # | Description | Completeness | Topics |
|---|---|---|---|
| 1 | Fashion designs based on dress code | Topic (Part A?) | Fashion Design, Poster/Drawing |
| 2 | Draw composition of basketball, sneakers and hoodies as theme for sports jersey | Full (Part A?) | Drawing, Sports Theme, Composition |
| 3 | Wave model 3D | Topic (Part A?) | 3D Modeling |
| 4 | 9 cylinders — asymmetry | Topic (Part A?) | 3D Modeling, Asymmetry |
| 5 | 4 questions based on surface area | Category + count | Surface Area, 3D Geometry |
| 6 | Find triangles in image (complex images) | Full | Triangle Counting |
| 7 | Big Ben is a ______ | Full (fill-in) | Monument Identification, World Architecture |
| 8 | King Ashoka is famous for his ideology in _________ | Full (fill-in) | History, Indian History, Buddhism |
| 9 | Water image (mirror/reflection in water) | Topic only | Water Reflection, Mirror Image |
| 10 | Week question (days ordering) | Topic only | Alphabetical Ordering, Days |
| 11 | Grammar (adjective) | Topic only | English, Grammar, Adjectives |
| 12 | 4-line paragraph given — find grammatical mistakes and spelling mistakes count | Full | English, Proofreading, Error Detection |
| 13 | How many axes of symmetry does a scalene triangle have? | Full | Geometry, Symmetry |

---

## UPDATED: Cross-Session Overlap Matrix (All 9 Sessions)

### Sessions Covered

| Session Date | Contributors | Quality |
|---|---|---|
| March 13, 2025 | Hari | Tier 1 (Verified) |
| March 21, 2025 | Hari | Tier 1 (Verified) |
| April 9, 2025 | Vedanth, Anagha, Avinasha | Tier 2 + Tier 3 |
| April 11, 2025 | Niranjan | Tier 3 (Topic signals) |
| April 19, 2025 | Tammana | Tier 2 |
| April 21, 2025 | Rithika Senthil | Tier 2 (high quality) |
| April 25, 2025 | Kanisha, Maheshwar | Tier 2 (+ paper screenshot) |
| May 3, 2025 | Hamsa | Tier 3 |
| TBD | Cheralathan's friends | Tier 2 + Tier 3 |

### Updated Priority Topics (by session frequency)

**CRITICAL (5+ sessions):**
- Triangle / Shape Counting — **8/9 sessions** (every session except Mar 21)
- Visual Counting (animals/fish/people/light fixtures) — **6/9 sessions**
- Current Affairs (Nobel Prize, elections, HRIDAY, metro, Lok Sabha) — **5/9 sessions**
- Monument Identification — **5/9 sessions** (Gwalior, Hampi, Kashi Vishwanath, Sanchi, Matri Mandir, Gol Gumbaz, Big Ben)

**HIGH (3-4 sessions):**
- Blood Relations / Family — 4/9
- Inscribed Shapes / Ratios — 4/9
- Percentages / Profit & Loss — 4/9
- Mirror / Water Image — 4/9 (NEW — upgraded from 2)
- English Grammar (SVA, adjectives, error detection) — 4/9
- Direction Sense — 3/9
- Architecture Terminology (column capital, WC, pantry) — 3/9
- Colour Theory (complementary, analogous, primary/secondary) — 3/9

**MEDIUM (2 sessions):**
- Matri Mandir (specific monument) — 2/9
- Clock Problems — 2/9
- Alphabetical Ordering — 2/9
- Volume / 3D Geometry — 2/9
- Spatial Reasoning (rotation, unfolding) — 2/9
- Analogies / Word Pairing — 2/9
- Symmetry (axes of symmetry) — 2/9
- Letter/Number Series — 2/9

**New topics from Batch 3:**
- Analogies (Pen:Write :: Book:Read) — Hamsa
- Polygon sides — Hamsa
- Proofreading / Error Detection in paragraphs — Cheralathan
- World Architecture (Big Ben) — Cheralathan
- Indian History (King Ashoka / Buddhism) — Cheralathan
- Flags / Country Identification — Hamsa
- Lok Sabha / Civics — Hamsa
- Fashion Design — Cheralathan (Part A?)
- Asymmetry as design principle — Cheralathan (Part A?)

### Monuments Master List (Updated)

Indian monuments recalled across all sessions:
1. Gwalior Fort — Madhya Pradesh (Vedanth, Apr 9)
2. Hampi Temple — Karnataka, UNESCO (Vedanth, Apr 9)
3. Kashi Vishwanath Temple — Varanasi (Avinasha Apr 9, Tammana Apr 19)
4. Sanchi Stupa — Madhya Pradesh, Buddhist (Anagha Apr 9, Niranjan2 May 3)
5. Matri Mandir — Auroville/Pondicherry, Spherical (Vedanth Apr 9, Rithika Apr 21)
6. Gol Gumbaz — Bijapur, Karnataka, largest dome (Hamsa, May 3)
7. Japanese-style Building — Pagoda/Shrine (Vedanth, Apr 9)
8. **Buddhist image identification** — (Niranjan2, May 3) — NEW
9. **Garden identification** — (Niranjan2, May 3) — NEW
10. **Monument from Uttarakhand** — (Niranjan2, May 3) — NEW

World monuments:
11. Big Ben — London, Clock Tower (Cheralathan)
12. **Prehistoric monument in England** — likely Stonehenge (Niranjan2, May 3) — NEW

---

## NEW: Additional Student Data (Batch 4)

### Thowfiq's Session (May 4, 2025) — ~35 Questions (VERY HIGH QUALITY — MCQ options, images, cross-references)

**Aptitude:**
| # | Question Text | Type | Options | Answer | Topics |
|---|---|---|---|---|---|
| 1 | How many seats in Lok Sabha parliament? | MCQ | A) 1000 B) 888 C) 543 D) 625 | C) 543 | General Knowledge, Civics |
| 2 | Find the correct Olympic logo (colours changed in options) | MCQ | Image-based options | — | Logo Identification, Olympics |
| 3 | Double storey building related question — double height, double span, two store | Full | — | — | Architecture Terminology |
| 4 | Main goal of ergonomics? | MCQ | A) low cost B) comfort C) within time D) durability | B) comfort | Architecture, Ergonomics |
| 5 | Nobel Peace Prize 2024 | MCQ | A) Malala Yousafzai B) Nihon Hidankyo C) Denis Mukwege D) other | B) Nihon Hidankyo | Current Affairs, Nobel Prize |
| 6 | Identify what airline logo is this [image: geometric star pattern] | MCQ | A) Vistara B) Air India C) IndiGo D) Emirates | — | Logo Identification, Brands |
| 7 | Hospital plus symbol logo — what does it represent? [image: Indian Red Cross Society] | MCQ | — | Hospitality sector (debatable) | Logo Identification, Symbols |
| 8 | Blood relations — Vimal is son of Vidya, Rithu is daughter of Magash... who is Adithi for Vimal? | Full (complex) | — | — | Blood Relations |
| 9 | Find the design style of a composition | MCQ | A) Art Deco B) Minimalism | — | Design Styles, Art History |
| 10 | Number of symmetry lines in composition | Numerical | — | — | Symmetry, Geometry |

**Math/English:**
| # | Question Text | Type | Options | Topics |
|---|---|---|---|---|
| 11 | Percentage: if P is 40% of Q, what is 15% of P? | Numerical | — | Percentages |
| 12 | Clock — 10:10 mirror | Numerical | — | Clock, Mirror Image |
| 13 | Average — 1 question | Topic only | — | Averages |
| 14 | Meaningful words with R, T, A | Numerical | — | Word Formation (SAME AS HARI'S Q!) |
| 15 | Find the correct sentence | MCQ | — | English, Grammar |
| 16 | Complete the sentence with most powerful word | MCQ | — | English, Vocabulary |
| 17 | Find odd one: boil, heat, burning, sweat | MCQ | — | Odd One Out, Vocabulary |

**Counting & Geometry:**
| # | Question Text | Type | Has Image | Topics |
|---|---|---|---|---|
| 18 | Counting triangles with secondary colours | Numerical | Yes (implied) | Triangle Counting, Colour Theory |
| 19 | Count number of triangles in image | MCQ | Yes (recreated complex triangle figure!) | A) 28 B) 24 C) 34 D) 26 | Triangle Counting |
| 20 | How many triangles subdivided by segments (counting tricks) | Numerical | — | Triangle Counting |
| 21 | Another counting tricks question (same type) | Numerical | — | Triangle Counting |
| 22 | Same as Hari sir's question paper (Q9) | — | — | **CROSS-REFERENCE TO HARI** |
| 23 | RAT meaningful — same as Hari sir's question paper | — | — | **CROSS-REFERENCE TO HARI** |
| 24 | Sum of angles of polygon is 1620°, how many sides? | Numerical | — | Polygons, Angle Sum |
| 25 | Analogy: Statue:Sculpture :: Poem:? | MCQ | — | Poet | Analogies |
| 26 | Calculate area which is of primary colour (composition image) | Numerical | Yes (recreated coloured composition + clock working) | Area, Colour Theory |

**Architecture & Visual:**
| # | Question Text | Type | Options | Topics |
|---|---|---|---|---|
| 27 | Why does the tree look closer to viewer? [perspective street scene image] | MCQ | A) Perspective B) Proportion | Perspective, Visual Arts |
| 28 | Which option is NOT related to windows/doors? | MCQ | A) Hinges B) Handle C) Lock D) Matt | Architecture Terminology |

**More questions (page 3):**
| # | Question Text | Type | Topics |
|---|---|---|---|
| 29 | Banquet hall — hallway related to English | Full | English, Vocabulary |
| 30 | Direction: person travels 30km east, turns right 30km, clockwise 90° 60km, turns right to start — distance? | Full (complex) | Direction Sense, Distance |
| 31 | In CHILDREN arranged alphabetically — first vowel before consonant? | Full | Alphabetical Ordering, English |
| 32 | Missing number: 1, 3, 9, ?, 81 | Full | 27 | Number Series (powers of 3) |
| 33 | Cone: slant height 13cm, radius 5cm — find surface area | Full | Surface Area, Cone |
| 34 | Cube vs sphere scaled — which has higher volume? | Full | Volume Comparison, 3D Geometry |
| 35 | Ratio: PQR in ratio 5:6:7, PQ combined age 56 — find age of R | Full | Ratio, Age Problems |

**Handwritten notes visible**: Sciography, Anthropometry, Aesthetics (likely answer options for an architecture theory question)

**Thowfiq's key cross-references**: Explicitly notes Q22 and Q23 are "same as Hari sir's question paper" — confirming questions repeat even across sessions 6+ weeks apart (March 13 → May 4).

### "NATA 25" Mi Notes (Unknown student, session date TBD) — Part A + 8 Part B

**Part A (Drawing):**
| # | Prompt | Topics |
|---|---|---|
| A1 | Create a 2D composition using 9 Trapezoids within the given Triangle and use any three colours to fill them | 2D Composition, Colour, Trapezoids |
| A2 | Draw a white and black 3D drawing of 1 pineapple and 2 oranges with texture, light and shadow | 3D Drawing, Still Life, Texture |
| A3 | With the given kit make a model of a spiral tower | 3D Modeling, Spiral, Tower |

**Part B (Aptitude):**
| # | Question Text | Type | Answer | Topics |
|---|---|---|---|---|
| 1 | Shopkeeper sells ₹25,000 product at ₹30,000, gives 5% discount — profit percentage? | Numerical | — | Profit & Loss, Discount, Percentages |
| 2 | 45 red, 55 black, 100 white balls — probability of picking red? (in %) | Numerical | 22.5% | Probability |
| 3 | How many numbers up to 100 are multiples of both 8 and 9? | Numerical | 1 (only 72) | LCM, Number Theory |
| 4 | Clock at 4:30 — angle between hour and minute hand? | Numerical | 45° | Clock Angles |
| 5 | Which brand invented "Vision Pro" in 2024? | MCQ | Apple | Current Affairs, Technology |
| 6 | Which is known as the spice state of India? | MCQ | Andhra Pradesh (debatable — Kerala commonly known) | General Knowledge, Geography |
| 7 | List the odd one by the position they hold: Indira Gandhi, Saddam Hussein, Droupadi Murmu | MCQ | Saddam Hussein (not a head of state of India) or contextual | Odd One Out, General Knowledge |

### Niranjan's 2nd Attempt (May 3, 2025) — 20+ Topic Signals + META INSIGHTS

**Maths Aptitude:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 1 | Finding unknown angle | Topic only | Angles, Geometry |
| 2 | Finding area with perimeter | Topic only | Area, Perimeter |
| 3 | Finding false statement from given geometry | Topic only | Geometry, True/False |

**Critical meta-insight from Niranjan (2 attempts):**
> "NO MATHS QUESTIONS WERE ASKED FROM CALENDAR, CLOCK, PROBABILITY, AVERAGE, PROFIT AND LOSS."
> "IN BOTH MY ATTEMPTS I GOT MATHS CONCEPTS OF FINDING UNKNOWN ANGLE, AREA, RATIO OF SHAPES INSCRIBED IN ONE SHAPE, ETC... (MORE GEOMETRY & TRIGONOMETRY)."
> "EXAM DIFFICULTY LEVEL WAS CHALLENGING BUT DRAWING IS PRETTY SIMPLE."

This confirms: **Geometry & Trigonometry dominate maths**, while Calendar/Clock/Probability are NOT guaranteed.

**Colour Theory (new type!):**
- Finding how much one colour wheel with primary colour should rotate to superimpose on another wheel

**English:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 4 | CAPTIVE — synonym | Full | English, Synonyms |
| 5 | DURABLE — antonym | Full | English, Antonyms |
| 6 | Odd one out: Vision, Retina, Pupil, Cornea | Full | Odd One Out (all eye-related) |
| 7 | Odd one out: Dairy, Apiary, Aviary, Venetian Blind | Full | Odd One Out (places for animals vs not) |

**History / GK / Current Affairs:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 8 | Buddhist image identification | Topic + context | Monument ID, Buddhism |
| 9 | Garden identification | Topic only | Architecture, Landscape |
| 10 | Who was against Donald Trump in 2024? | Full | Current Affairs (REPEAT — 3rd time!) |
| 11 | CII full form | Full | General Knowledge, Abbreviations |
| 12 | Monument from Uttarakhand | Topic only | Monument ID |
| 13 | Prehistoric monument in England | Topic only | World Architecture (likely Stonehenge) |

**Aptitude:**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 14 | Finding no. of triangles and squares — very complex (formulae can't be used) | Topic + difficulty note | Shape Counting |
| 15 | Finding suitable upcoming image from 4 given (complex) | Topic + difficulty note | Image Sequence |
| 16 | Finding edges, ratio of edges and surface | Topic only | Geometry, 3D |
| 17 | Blood relation + 4 questions based on read paragraph and find topic | Category + count | Blood Relations, Reading Comprehension |

**Numerical Value Questions (no options):**
| # | Description | Completeness | Topics |
|---|---|---|---|
| 18 | Two persons travel — find how many lefts one person took | Partial | Direction Sense |
| 19 | No. of triangles in complex pattern | Topic only | Triangle Counting |

---

## FINAL UPDATED: Priority Topics (All 11 Sessions / ~15 Contributors)

### Sessions Now Covered

| Session Date | Contributors | Quality |
|---|---|---|
| March 13, 2025 | Hari | Tier 1 |
| March 21, 2025 | Hari | Tier 1 |
| April 9, 2025 | Vedanth, Anagha, Avinasha | Tier 2+3 |
| April 11, 2025 | Niranjan (1st attempt) | Tier 3 |
| April 19, 2025 | Tammana | Tier 2 |
| April 21, 2025 | Rithika Senthil | Tier 2 |
| April 25, 2025 | Kanisha, Maheshwar | Tier 2 |
| May 3, 2025 | Hamsa, Niranjan (2nd attempt) | Tier 3 |
| May 4, 2025 | Thowfiq | Tier 2 (HIGH quality) |
| TBD | "NATA 25" Mi Notes student | Tier 2 |
| TBD | Cheralathan's friends | Tier 2+3 |

### Master Priority Ranking

**CRITICAL (appears in 7+ sessions — study these FIRST):**
- **Triangle / Shape Counting** — 10/11 sessions — UNIVERSAL
- **Current Affairs** — 7/11 (Nobel Prize 2024 alone: 3 sessions; Trump election: 3 sessions; Vision Pro, HRIDAY, Lok Sabha, CII, metro)
- **Monument / Building Identification** — 7/11
- **Blood Relations / Family Problems** — 6/11

**HIGH (appears in 4-6 sessions):**
- Visual Counting (animals/fish/people/objects) — 6/11
- Percentages / Profit & Loss — 6/11
- English: Synonyms/Antonyms/Grammar — 6/11
- Mirror / Clock / Water Image — 5/11
- Direction Sense — 5/11
- Colour Theory — 5/11 (complementary, analogous, colour wheel rotation — NEW type from Niranjan2)
- Inscribed Shapes / Ratios — 5/11
- Architecture Terminology — 5/11 (ergonomics, column orders, windows/doors, WC, double height)
- Analogies / Odd One Out — 5/11
- Logo / Symbol Identification — 4/11 (Olympics, airlines, Red Cross, traffic signs)

**MEDIUM (appears in 2-3 sessions):**
- Alphabetical Ordering (months, days, words) — 3/11
- Volume / 3D Geometry / Surface Area — 3/11
- Number Series — 3/11
- Polygon angle sums — 2/11
- Cube Coloring — 2/11
- Perspective / Visual Arts theory — 2/11
- Design Styles (Art Deco, Minimalism) — 2/11
- Probability — 2/11
- Word Formation (R,T,A) — 2/11 (confirmed repeat: Hari Mar 13 → Thowfiq May 4!)
- Reading Comprehension / Paragraph questions — 2/11

### Monuments Master List (Final Update)

Indian monuments:
1. Gwalior Fort — Madhya Pradesh (Vedanth Apr 9)
2. Hampi Temple — Karnataka, UNESCO (Vedanth Apr 9)
3. Kashi Vishwanath Temple — Varanasi (Avinasha Apr 9, Tammana Apr 19)
4. Sanchi Stupa — Buddhist, Madhya Pradesh (Anagha Apr 9, Niranjan2 May 3)
5. Matri Mandir — Auroville/Pondicherry, Spherical (Vedanth Apr 9, Rithika Apr 21)
6. Gol Gumbaz — Bijapur, Karnataka (Hamsa May 3)
7. Japanese-style Building (Vedanth Apr 9)
8. Buddhist image identification (Niranjan2 May 3)
9. Garden identification (Niranjan2 May 3)
10. **Monument from Uttarakhand** (Niranjan2 May 3) — NEW

World monuments:
11. Big Ben — London (Cheralathan)
12. **Prehistoric monument in England** — likely Stonehenge (Niranjan2 May 3) — NEW

---

## Data Summary Statistics (Final)

| Metric | Value |
|--------|-------|
| Total sessions covered | 11 (incl. 2 TBD dates) |
| Total contributors | ~15 (Hari, Vedanth, Anagha, Avinasha, Niranjan ×2, Tammana, Rithika, Kanisha, Maheshwar, Hamsa, Thowfiq, "NATA 25" student, Cheralathan's friends) |
| Total questions/signals catalogued | **~260** |
| Tier 1 (Verified) questions | ~34 (Hari's) |
| Tier 2 (Recalled) questions | ~120 |
| Tier 3 (Topic Only) signals | ~105 |
| Part A (Drawing) prompts | 15 (from 5 sessions) |
| Unique topics identified | **45+** |
| Cross-session overlapping topics | **30+ confirmed** |
| Confirmed exact question repeats | 3+ (RAT word, Q9 from Hari, Matri Mandir, Trump election, Nobel Prize) |
| Remaining students to process | ~5 out of 20 |
| Actual paper header screenshots | 2 (Tammana TN97, Maheshwar TN95) |

## File References

All source PDFs are in Neram Classes SharePoint OneNote:
- `haribabu_neramclasses_com` SharePoint → OneNote
- Pages: Math (Mar 21), English (Mar 13), Logical (Mar 13), GK (Mar 13), Vedanth (Apr 9), Anagha/Avinasha (Apr 9), Rithika Senthil (Apr 21), Tammana (Apr 19/21), Niranjan (Apr 11), Niranjan2 (May 3), Kanisha (Apr 25), Hamsa (May 3), Thowfiq (May 4), "NATA 25" Mi Notes, Cheralathan's friends
- ~15 student contributions processed so far out of 20 total
- Actual paper header screenshots: Tammana (TN97 Saveetha), Maheshwar (TN95 Papni)
