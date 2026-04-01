# Neram Classes — Lead Conversion Pipeline

## Complete System Spec: Tools App → WhatsApp Nurture → Enrolled Student

**Version:** 1.0  
**Date:** April 2026  
**Author:** Hari / Neram Classes  
**Scope:** Admin panel module + WhatsApp message templates + conversion workflow

---

## 1. The Problem

Users register on **app.neramclasses.com** (tools app) to use free tools — Rank Predictor, Cutoff Calculator, College Predictor, NATA Exam Center Locator, COA Approval Checker. The admin panel captures their registration (name, phone, class, city) but currently has no structured way to:

- Differentiate tool-only users from coaching-interested leads
- Initiate first contact without being pushy
- Track where each lead is in the conversion journey
- Systematically nurture leads toward enrollment
- Measure conversion rates from tools → enrolled students

**Key insight:** Every tools app user is a self-qualified lead — they're actively researching B.Arch admissions. The conversion gap is not awareness; it's trust and timing.

---

## 2. Pipeline Overview

```
┌─────────────────────────────────────────────────────────┐
│  STAGE 1: ACQUISITION                                   │
│  User registers on app.neramclasses.com                 │
│  Admin panel auto-creates lead record (status: NEW)     │
└──────────────────────┬──────────────────────────────────┘
                       │ Within 24 hrs
                       ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 2: FIRST TOUCH                                   │
│  WhatsApp message: warm intro + attention video          │
│  Goal: start a conversation, not sell                   │
│  Status changes: NEW → CONTACTED                        │
└──────────────────────┬──────────────────────────────────┘
                       │ Based on reply
                       ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 3: QUALIFY                                       │
│  Ask: which exam? when? tried drawing practice?          │
│  Segment: HOT / WARM / COLD                             │
│  Status changes: CONTACTED → QUALIFIED                  │
└──────────────────────┬──────────────────────────────────┘
                       │ 3-14 days
                       ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 4: NURTURE                                       │
│  Value drops: free tips, past papers, demo class invite  │
│  Build trust through consistent value                   │
│  Status changes: QUALIFIED → NURTURING                  │
└──────────────────────┬──────────────────────────────────┘
                       │ When ready
                       ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 5: CONVERT                                       │
│  Enrollment offer + batch details + Razorpay link        │
│  Status changes: NURTURING → CONVERTED / LOST           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  ENROLLED IN    │
              │  NEXUS          │
              └─────────────────┘
```

---

## 3. WhatsApp Message Templates

### 3.1 Design Principles

1. **Personal, not automated** — Messages should feel like they come from a real person (Tamil or Hari), not a bot
2. **Value first, pitch never** — Every message gives something useful; the coaching offer emerges naturally
3. **Question-ended** — Every first message ends with a question to prompt a reply
4. **Bilingual ready** — Templates in English; Tamil versions to be adapted from these
5. **Media-first** — Send videos/images as WhatsApp media attachments (auto-play), not YouTube links (require click-through)

### 3.2 Stage 2: First Touch Messages

**The critical first message.** This is the most important message in the entire funnel. It must:
- Feel personal (reference the specific tool they used)
- Provide social proof (video of student results)
- End with a qualifying question

---

#### Template FT-1: Generic First Touch (when tool used is unknown)

**When to send:** Within 24 hours of registration  
**Send as:** Text + Video attachment  
**Video:** Student result highlight reel / testimonial Short

```
Hi [Name] 👋

This is [Tamil/Hari] from Neram Classes. Welcome to our NATA/JEE tools app — hope you're finding it useful!

Here's a quick look at what our students achieved this year 👇

[ATTACH: Student results video — download from YouTube and send as media]

Quick question — are you preparing for NATA 2026, JEE Paper 2, or both?
```

**Why this works:**
- "Welcome" acknowledges their action (registration)
- Video auto-plays in WhatsApp (higher engagement than YouTube link)
- Results video = social proof without bragging
- Qualifying question segments them immediately

---

#### Template FT-2: Tool-Specific First Touch (Rank Predictor user)

```
Hi [Name] 👋

This is [Tamil/Hari] from Neram Classes. I saw you tried our NATA Rank Predictor — great that you're planning ahead!

Fun fact: last year, 3 of our students scored above 160 in NATA. Here's a quick clip 👇

[ATTACH: Result/testimonial video]

Which exam are you targeting — NATA, JEE Paper 2, or both?
```

---

#### Template FT-3: Tool-Specific First Touch (Cutoff Calculator user)

```
Hi [Name] 👋

This is [Tamil/Hari] from Neram Classes. Hope our Cutoff Calculator helped you figure out your college options!

Many students we work with started exactly where you are — researching scores and colleges. Here's what happened next for some of them 👇

[ATTACH: Result/testimonial video]

Are you in 11th or 12th right now? And which state are you looking at for admissions?
```

---

#### Template FT-4: Tool-Specific First Touch (College Predictor user)

```
Hi [Name] 👋

This is [Tamil/Hari] from Neram Classes. Looks like you're exploring B.Arch colleges — that's exciting! 

The college you get depends a lot on your NATA/JEE score. Our students consistently crack top colleges — here's a quick look 👇

[ATTACH: Result/college placement video]

Which colleges are on your wish list? NIT Trichy, Anna University SAP, or something else?
```

---

#### Template FT-5: Tool-Specific First Touch (Exam Center Locator user)

```
Hi [Name] 👋

This is [Tamil/Hari] from Neram Classes. I see you checked NATA exam centers — looks like you're getting serious about the exam! 💪

Here's what our coaching looks like and the kind of results students get 👇

[ATTACH: Class experience / results video]

Have you started preparing yet, or still figuring out the plan?
```

---

### 3.3 Stage 3: Follow-up Messages (Based on Reply)

#### Template Q-1: They said "NATA only"

```
Great choice! NATA is a fantastic path — most state government colleges accept NATA scores.

Two things that make the biggest difference in NATA:
1. Drawing practice (50% weightage!)
2. Timed aptitude solving

Are you practicing drawing regularly right now? Or mostly focusing on the aptitude/math side?
```

---

#### Template Q-2: They said "JEE Paper 2"

```
JEE Paper 2 is a smart target — that opens doors to NITs and IITs! 🎯

One thing most students don't realize: JEE Paper 2 is very different from Paper 1. There's no Physics or Chemistry — it's Math + Drawing + Aptitude.

One of our students got AIR 1 in JEE B.Arch. Happy to share what worked for them if you're interested!

Are you in 12th now, or preparing for next year?
```

---

#### Template Q-3: They said "Both NATA and JEE"

```
That's the ideal approach! 🙌 NATA and JEE B.Arch have ~70% syllabus overlap, so preparing for both simultaneously is very efficient.

At Neram, we design our classes to cover both exams together. Most of our top scorers write both.

What's your current preparation status — self-study, another coaching, or just getting started?
```

---

#### Template Q-4: They said "Just exploring" / No clear intent

```
No worries at all! Architecture is a beautiful career path — take your time exploring. 😊

If it helps, I can share some useful resources:
- Free NATA drawing practice sheets
- JEE Paper 2 previous year papers
- A guide on how NATA/JEE scoring works

Would any of these be useful? Just say the word!
```

**Note:** Don't push. Add them to the COLD segment. They may convert 2-6 months later.

---

#### Template Q-5: No Reply After 3 Days

```
Hi [Name] 👋 

Just sharing a quick drawing tip that helps many of our students — thought you might find it useful too 👇

[ATTACH: Drawing tip video or 2D composition technique Short]

No pressure at all — just here if you need any help with NATA/JEE prep! 🙂
```

---

### 3.4 Stage 4: Nurture Messages (Value Drops)

These are sent over 1-3 weeks to WARM and HOT leads. Space them 3-4 days apart.

#### Template N-1: Free Drawing Tip

```
Hey [Name]! Here's a quick 2D composition technique that comes up in almost every NATA exam 👇

[ATTACH: Drawing technique video / time-lapse of a composition]

Try this in your practice and let me know how it goes! Our students practice 2-3 compositions daily during peak prep.
```

---

#### Template N-2: Past Paper Walkthrough

```
[Name], thought you'd find this useful — here's a walkthrough of a recent JEE Paper 2 aptitude question that most students get wrong 👇

[ATTACH: Past paper solution video]

We have 500+ practice questions like this in our question bank. Let me know if you want access to a sample set!
```

---

#### Template N-3: Demo Class Invite

```
Hi [Name]! 🎓

We're running a free demo class this [Saturday/specific date] on Microsoft Teams. Topic: "[Perspective Drawing Basics / NATA Aptitude Shortcuts / 2D Composition Masterclass]"

It's a live class with our faculty — you can ask questions, try exercises, and see how our coaching works.

Interested? I'll share the Teams link!
```

**This is the highest-converting message in the sequence.** A free demo class lets them experience the teaching quality without commitment.

---

#### Template N-4: Result Proof / Social Proof

```
[Name], just wanted to share — here are some recent results from our students:

🏆 AIR 1 in JEE B.Arch 2025
📊 15+ students scored 150+ in NATA
🎓 Students placed in NIT Trichy, Anna University SAP, SPA Delhi

[ATTACH: Results compilation image or video]

These students started exactly where you are right now. Happy to chat about how we can help you get there too!
```

---

#### Template N-5: Exam Deadline Urgency (Seasonal)

```
Hi [Name]! Quick heads up — NATA 2026 registration deadline is approaching: [specific date].

Have you registered yet? If you need help with the application process, our team can walk you through it — it can be confusing the first time!

Also, our [course name] batch starts [date]. Early joiners get more practice time before the first NATA attempt.
```

---

### 3.5 Stage 5: Conversion Messages

Only sent to HOT leads who have engaged, attended demo, or explicitly asked about courses.

#### Template C-1: Enrollment Offer

```
Hi [Name]! Based on our conversations, I think our [NATA + JEE Combined / NATA Crash Course / Year-long Program] would be perfect for you.

Here's what you get:
✅ Live online classes on Microsoft Teams (recordings available)
✅ 500+ practice questions with video solutions
✅ Weekly drawing assignments with personal feedback
✅ Dedicated doubt-clearing sessions
✅ Access to Neram Nexus app for progress tracking

Current batch starts: [date]
Seats remaining: [number]

Want me to share the course details and fee structure?
```

---

#### Template C-2: Payment Follow-up (After they've agreed)

```
Great! Here are the details:

📋 Course: [Course Name]
📅 Batch starts: [Date]
💰 Fee: ₹[Amount]
📱 Classes on: Microsoft Teams (works on phone + laptop)

Pay here 👇
[Razorpay Payment Link]

Once payment is done, I'll onboard you to our Nexus classroom app within 24 hours!

Any questions before you proceed?
```

---

#### Template C-3: Gentle Close (For hesitant leads)

```
Hi [Name], no rush at all! I understand this is an important decision. 

A few things that might help you decide:
- We offer flexible payment (EMI available)
- You can attend 2 trial classes before committing
- Our classes don't interfere with school — we schedule around your convenience

Take your time. I'm here whenever you're ready to chat! 🙂
```

---

## 4. Admin Panel — Lead Pipeline Module

### 4.1 Module Location

**URL:** admin.neramclasses.com/leads  
**Auth:** Microsoft Entra ID (existing admin auth)  
**Access:** Admin and designated staff (Tamil, Hari)

### 4.2 Data Model

#### Lead Record Schema

```typescript
interface Lead {
  // Auto-populated from tools app registration
  id: string;                    // UUID
  name: string;
  phone: string;                 // Primary identifier
  email?: string;
  city?: string;
  state?: string;
  current_class?: string;        // 10th, 11th, 12th, Gap Year
  registration_source: string;   // Which tool: 'rank-predictor' | 'cutoff-calculator' | 'college-predictor' | 'exam-center-locator' | 'coa-checker' | 'direct'
  registered_at: Date;
  
  // Pipeline tracking (manually updated by staff)
  status: LeadStatus;
  temperature: LeadTemperature;
  exam_target?: ExamTarget;
  
  // Contact tracking
  first_contacted_at?: Date;
  last_contacted_at?: Date;
  next_followup_date?: Date;
  total_messages_sent: number;
  total_replies_received: number;
  
  // Conversion
  demo_class_attended: boolean;
  demo_class_date?: Date;
  enrolled: boolean;
  enrolled_at?: Date;
  enrolled_course?: string;
  lost_reason?: string;          // 'price' | 'chose-competitor' | 'self-study' | 'not-interested' | 'no-response' | 'other'
  
  // Notes
  notes: LeadNote[];
  
  // Metadata
  assigned_to: string;           // Staff member handling this lead
  created_at: Date;
  updated_at: Date;
}

enum LeadStatus {
  NEW = 'new',                   // Just registered, not contacted
  CONTACTED = 'contacted',       // First message sent
  QUALIFIED = 'qualified',       // Know their exam target & intent
  NURTURING = 'nurturing',       // Receiving value content
  DEMO_SCHEDULED = 'demo_scheduled', // Demo class confirmed
  OFFER_SENT = 'offer_sent',    // Enrollment offer shared
  CONVERTED = 'converted',       // Enrolled!
  LOST = 'lost',                 // Did not convert
  DORMANT = 'dormant'            // No response after 30+ days
}

enum LeadTemperature {
  HOT = 'hot',       // Actively looking to enroll, responding quickly
  WARM = 'warm',     // Interested but not ready, needs nurturing
  COLD = 'cold',     // Just exploring, minimal engagement
  UNKNOWN = 'unknown' // Not yet qualified
}

enum ExamTarget {
  NATA = 'nata',
  JEE_PAPER2 = 'jee_paper2',
  BOTH = 'both',
  UNDECIDED = 'undecided'
}

interface LeadNote {
  id: string;
  text: string;
  created_by: string;
  created_at: Date;
}
```

### 4.3 Database Table (Supabase)

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  city TEXT,
  state TEXT,
  current_class TEXT CHECK (current_class IN ('10th', '11th', '12th', 'gap_year', 'other')),
  registration_source TEXT NOT NULL DEFAULT 'direct',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Pipeline
  status TEXT NOT NULL DEFAULT 'new' 
    CHECK (status IN ('new','contacted','qualified','nurturing','demo_scheduled','offer_sent','converted','lost','dormant')),
  temperature TEXT NOT NULL DEFAULT 'unknown'
    CHECK (temperature IN ('hot','warm','cold','unknown')),
  exam_target TEXT 
    CHECK (exam_target IN ('nata','jee_paper2','both','undecided')),
  
  -- Contact tracking
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  next_followup_date DATE,
  total_messages_sent INT DEFAULT 0,
  total_replies_received INT DEFAULT 0,
  
  -- Conversion
  demo_class_attended BOOLEAN DEFAULT FALSE,
  demo_class_date DATE,
  enrolled BOOLEAN DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ,
  enrolled_course TEXT,
  lost_reason TEXT 
    CHECK (lost_reason IN ('price','chose_competitor','self_study','not_interested','no_response','other')),
  
  -- Assignment
  assigned_to TEXT NOT NULL DEFAULT 'tamil',
  notes JSONB DEFAULT '[]'::JSONB,
  
  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_temperature ON leads(temperature);
CREATE INDEX idx_leads_next_followup ON leads(next_followup_date);
CREATE INDEX idx_leads_registered_at ON leads(registered_at DESC);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);

-- Auto-update timestamp
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policy (admin only)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
```

### 4.4 Auto-Lead Creation

When a user registers on app.neramclasses.com, automatically create a lead record:

```typescript
// In tools app registration flow (app.neramclasses.com)
// After successful auth/signup:

async function createLeadFromRegistration(user: AppUser, toolUsed: string) {
  const { data, error } = await supabase
    .from('leads')
    .upsert({
      phone: user.phone,
      name: user.displayName || user.phone,
      email: user.email,
      city: user.city,           // If collected during registration
      registration_source: toolUsed,
      status: 'new',
      temperature: 'unknown',
      assigned_to: 'tamil',      // Default assignment
    }, {
      onConflict: 'phone',       // Don't create duplicate if phone exists
      ignoreDuplicates: true
    });
}
```

### 4.5 UI Views

#### 4.5.1 Dashboard View (admin.neramclasses.com/leads)

**Top: Pipeline Summary Cards**

| NEW | CONTACTED | QUALIFIED | NURTURING | DEMO SCHEDULED | OFFER SENT | CONVERTED | LOST |
|-----|-----------|-----------|-----------|----------------|------------|-----------|------|
| 23  | 15        | 8         | 12        | 3              | 2          | 45        | 18   |

Each card is clickable → filters the table below.

**Middle: Today's Actions**

A priority queue showing:
1. **Overdue follow-ups** (next_followup_date < today) — red highlight
2. **New leads to contact** (status = 'new', registered in last 48 hrs) — blue highlight
3. **Upcoming follow-ups** (next_followup_date = today) — amber highlight

**Bottom: Leads Table (AG Grid)**

Columns:
| Column | Width | Notes |
|--------|-------|-------|
| Name | 150px | Clickable → opens lead detail |
| Phone | 120px | Click to open WhatsApp |
| City | 100px | |
| Class | 60px | 10/11/12/Gap |
| Source | 120px | Which tool they used |
| Status | 120px | Colored badge |
| Temp | 80px | 🔥 / 🟡 / 🔵 |
| Exam | 80px | NATA/JEE/Both |
| Last Contact | 100px | Relative time ("2d ago") |
| Next Follow-up | 100px | Date, red if overdue |
| Assigned | 80px | Tamil/Hari |
| Actions | 120px | WhatsApp / Edit / Note |

**Filters:**
- Status dropdown (multi-select)
- Temperature filter
- Date range (registered between)
- Source filter (which tool)
- Assigned to filter
- "Needs follow-up today" toggle
- "New in last 24h" toggle

**Sorting:** Default by next_followup_date ASC (most urgent first), then by registered_at DESC.

#### 4.5.2 Lead Detail View (Slide-over panel or modal)

**Header:** Name, phone (WhatsApp link), city, class, registration source, registered date

**Status Controls:**
- Status dropdown (change status)
- Temperature selector (🔥 Hot / 🟡 Warm / 🔵 Cold)
- Exam target selector
- Next follow-up date picker
- Assigned to dropdown

**Timeline:** Chronological log of all interactions
```
Apr 1, 2026 — Lead created (source: Rank Predictor)
Apr 2, 2026 — [Tamil] First touch message sent (Template FT-2)
Apr 2, 2026 — [Tamil] Status: NEW → CONTACTED
Apr 3, 2026 — [Tamil] Note: "Replied, interested in NATA. In 12th. Chennai."
Apr 3, 2026 — [Tamil] Status: CONTACTED → QUALIFIED, Temp: WARM, Exam: NATA
Apr 6, 2026 — [Tamil] Sent drawing tip video (Template N-1)
Apr 8, 2026 — [Tamil] Note: "Asked about class timings and fees"
Apr 8, 2026 — [Tamil] Temp: WARM → HOT
...
```

**Quick Actions:**
- "Send WhatsApp" → Opens wa.me link with pre-filled template
- "Add Note" → Text input
- "Schedule Follow-up" → Date picker
- "Mark as Lost" → Requires selecting a reason

#### 4.5.3 Analytics View

**Conversion Funnel:**
- Registration → First Contact: X% (target: 100% within 24h)
- First Contact → Reply: X% (benchmark: 30-40%)
- Reply → Qualified: X% (benchmark: 80%)
- Qualified → Demo Attended: X%
- Demo → Enrolled: X% (benchmark: 40-60%)
- Overall: Registration → Enrolled: X%

**By Source:**
| Source | Leads | Contacted | Qualified | Enrolled | Conv% |
|--------|-------|-----------|-----------|----------|-------|
| Rank Predictor | 45 | 42 | 28 | 8 | 17.8% |
| Cutoff Calculator | 32 | 30 | 18 | 5 | 15.6% |
| College Predictor | 28 | 25 | 15 | 6 | 21.4% |
| Exam Center Locator | 15 | 14 | 10 | 4 | 26.7% |
| Direct | 12 | 10 | 5 | 2 | 16.7% |

**Time-based:**
- Average days from registration → enrollment
- Average messages before conversion
- Best day/time for first contact (based on reply rates)

**Lost Lead Analysis:**
- Reasons pie chart (price, competitor, self-study, no response, etc.)

### 4.6 Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Frontend | React + MUI v5 | Consistent with existing admin panel |
| Table | AG Grid Community | Existing dependency |
| Backend | Supabase | Existing backend for Neram ecosystem |
| Auth | Microsoft Entra ID | Existing admin auth |
| WhatsApp Integration | wa.me deep links (Phase 1) | Meta Cloud API (Phase 2 — auto-send) |
| Real-time | Supabase Realtime | Live updates when new leads come in |

### 4.7 WhatsApp Integration Phases

**Phase 1 (MVP — build now):**
- "Send WhatsApp" button opens `wa.me/[phone]?text=[encoded template]`
- Staff manually sends the message from their WhatsApp
- Staff manually updates lead status and notes in admin panel
- Template library accessible in the admin panel for copy-paste

**Phase 2 (Meta Cloud API — build later):**
- Approved WhatsApp Business templates sent via API
- Auto-send first touch message on new registration
- Message delivery/read status tracked in admin
- Reply detection (via webhook) auto-updates lead record
- Broadcast lists for nurture sequences

### 4.8 Automation Rules (Phase 2)

```
RULE 1: Auto-assign
  WHEN: New lead created
  THEN: Assign to Tamil (default), notify via admin panel

RULE 2: Auto-first-touch
  WHEN: Lead status = NEW for > 2 hours
  THEN: Send Template FT-1 via WhatsApp API
  AND: Set status → CONTACTED

RULE 3: No-reply nudge
  WHEN: Lead status = CONTACTED AND last_contacted > 3 days AND replies = 0
  THEN: Send Template Q-5 (drawing tip nudge)

RULE 4: Dormant detection
  WHEN: Lead has no reply for 30+ days
  THEN: Set status → DORMANT

RULE 5: Follow-up reminder
  WHEN: next_followup_date = today
  THEN: Show in "Today's Actions" queue with high priority

RULE 6: Hot lead alert
  WHEN: Lead temperature changed to HOT
  THEN: Push notification to assigned staff
```

---

## 5. Video Strategy

### 5.1 Video Types Needed

| Video Type | Purpose | When to Send | Format |
|-----------|---------|-------------|--------|
| **Result Highlights** | Social proof — scores, AIR ranks | First Touch (Day 1) | YouTube Short → download → WhatsApp media |
| **Student Testimonial** | Trust building — real student talking | First Touch (alternate) | YouTube Short → download → WhatsApp media |
| **Drawing Tip** | Value — teach something useful | Nurture (Day 3-7) | YouTube Short → download → WhatsApp media |
| **Class Experience** | Show what coaching looks like | Nurture (Day 7-10) | YouTube Short → download → WhatsApp media |
| **Past Paper Walkthrough** | Expertise proof — solve a hard question | Nurture (Day 10-14) | YouTube Short → download → WhatsApp media |
| **Faculty Intro** | Personal connection with teachers | Nurture or Pre-demo | YouTube Short → download → WhatsApp media |

### 5.2 Why Download & Send (Not Share Link)

- **Auto-play:** WhatsApp media auto-plays in chat; YouTube links require click-through + app switch
- **Higher watch rate:** 3-5x more views when video plays inline vs link
- **No distractions:** YouTube opens → algorithm suggests other videos → student gets lost
- **Works offline:** Downloaded media cached on student's phone
- **Feels personal:** A shared video feels like a personal recommendation; a link feels like marketing

### 5.3 Video Content Calendar

Maintain a rotating library of 10-15 Shorts on the Neram YouTube channel. Download and keep local copies ready on Tamil's phone for quick sharing. Categories:

- 3-4 result/testimonial videos (refresh each exam cycle)
- 3-4 drawing technique videos (evergreen)
- 2-3 class experience videos (refresh quarterly)
- 2-3 past paper walkthrough videos (evergreen)

---

## 6. Implementation Roadmap

### Week 1-2: MVP

- [ ] Create `leads` table in Supabase
- [ ] Build auto-lead-creation trigger in tools app registration flow
- [ ] Build leads dashboard page in admin panel (table + status cards)
- [ ] Build lead detail slide-over with status controls and notes
- [ ] Add "Open WhatsApp" buttons with pre-filled templates
- [ ] Create template library page in admin panel
- [ ] Download top 5 YouTube Shorts for Tamil's WhatsApp ready-to-send library

### Week 3-4: Enhance

- [ ] Add analytics view (funnel + source breakdown)
- [ ] Add "Today's Actions" priority queue
- [ ] Add follow-up date reminders
- [ ] Add bulk status update (select multiple leads)
- [ ] Add CSV export for reporting

### Month 2: Automation (Phase 2)

- [ ] Set up Meta Cloud API WhatsApp Business
- [ ] Create and get approved WhatsApp message templates
- [ ] Build auto-first-touch on registration
- [ ] Build no-reply nudge automation
- [ ] Add message delivery/read tracking
- [ ] Build dormant detection

### Month 3: Optimization

- [ ] A/B test different first-touch templates
- [ ] Analyze conversion by source to optimize tool pages
- [ ] Build referral tracking (student refers friend)
- [ ] Integration with Razorpay for payment-status tracking
- [ ] Auto-onboard converted leads to Nexus

---

## 7. Success Metrics

| Metric | Current | Target (3 months) | Target (6 months) |
|--------|---------|-------------------|-------------------|
| First contact within 24h | ~30% | 90% | 100% (automated) |
| Reply rate to first touch | Unknown | 35% | 45% |
| Tools user → Enrolled | Unknown | 10% | 15% |
| Avg days to conversion | Unknown | 14 days | 10 days |
| Demo class attendance | N/A | 40% of qualified | 60% of qualified |

---

## 8. Important Notes

1. **Never cold call.** WhatsApp first, always. Calls only after engagement.
2. **Tamil's phone = the relationship channel.** Use a dedicated WhatsApp Business number for Neram, not personal.
3. **Respect timing.** Don't message after 8 PM or before 9 AM. Best times: 10-11 AM, 4-6 PM.
4. **Parents are decision-makers.** For 11th/12th students, the parent often pays. Some messages should be designed for parents.
5. **Seasonal peaks matter.** Lead volume spikes around: NATA registration opens, JEE dates announced, board exam results, counselling dates. Increase nurture frequency during these windows.
6. **One person per lead.** Don't have both Tamil and Hari messaging the same lead. Assign and stick.
7. **Track everything.** The data from this pipeline will tell you which tools generate the best leads, which messages get the most replies, and where leads drop off. This is gold for optimizing spend and effort.
