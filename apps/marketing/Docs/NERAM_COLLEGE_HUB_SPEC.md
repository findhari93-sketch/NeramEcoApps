# NERAM COLLEGE HUB — Complete Implementation Specification

> **Document Version:** 1.0
> **Date:** April 12, 2026
> **Platform:** neramclasses.com (Next.js, Supabase, Fluent UI v9, Vercel)
> **Admin Panel:** admin.neramclasses.com
> **Target:** B.Arch Architecture Colleges in India
> **Phase 1 Scope:** TNEA B.Arch colleges (~55-60) + JoSAA B.Arch colleges (~30-35)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [URL Structure & Routing](#3-url-structure--routing)
4. [Database Schema (Supabase)](#4-database-schema-supabase)
5. [Data Sourcing & Scraping Pipeline](#5-data-sourcing--scraping-pipeline)
6. [College Page — Template Design](#6-college-page--template-design)
7. [Premium Tier System (Free / Silver / Gold / Platinum)](#7-premium-tier-system)
8. [Listing Pages — Filters & Sorting](#8-listing-pages--filters--sorting)
9. [Comparison Tool](#9-comparison-tool)
10. [Fee Transparency Module](#10-fee-transparency-module)
11. [Admission & Cutoff Module](#11-admission--cutoff-module)
12. [Review System](#12-review-system)
13. [Comment / Q&A System](#13-comment--qa-system)
14. [Student Ambassador Program](#14-student-ambassador-program)
15. [Lead Management & Lead Window System](#15-lead-management--lead-window-system)
16. [AI Chat Agent (Aintra)](#16-ai-chat-agent-aintra)
17. [Virtual Campus Tour (360°)](#17-virtual-campus-tour-360)
18. [Admin Panel — College Hub Section](#18-admin-panel--college-hub-section)
19. [College Dashboard (Login-Based)](#19-college-dashboard-login-based)
20. [SEO & AEO Strategy](#20-seo--aeo-strategy)
21. [NATA Hub & JEE B.Arch Hub Integration](#21-nata-hub--jee-barch-hub-integration)
22. [ArchIndex — Proprietary Rating System](#22-archindex--proprietary-rating-system)
23. [Badge System](#23-badge-system)
24. [Social Media & YouTube Integration](#24-social-media--youtube-integration)
25. [Revenue Model & Pricing](#25-revenue-model--pricing)
26. [Implementation Phases & Timeline](#26-implementation-phases--timeline)
27. [Security & Privacy Considerations](#27-security--privacy-considerations)

---

## 1. Project Overview

### What Is This?

A dedicated architecture college listing portal within `neramclasses.com` — the Neram Classes marketing site. Every COA-approved B.Arch college in India gets a dedicated, SEO-optimized page. The portal operates on a freemium model where colleges can claim and upgrade their profiles for premium features, lead forwarding, and analytics.

### Why Build This?

- **SEO Dominance:** Architecture is an underserved niche. Generic platforms (Shiksha, CollegeDunia) treat B.Arch as 1% of their content. Neram can own 100% of architecture-focused search queries.
- **Lead Generation Revenue:** Tier 2/3 private colleges desperately need student inquiries. Neram can charge for qualified leads.
- **Coaching Synergy:** Neram's 1,000+ NATA coaching students are pre-qualified architecture aspirants who funnel naturally into the college hub.
- **AEO First-Mover:** AI engines (ChatGPT, Perplexity, Google AI Overview) prefer deep, niche-specific, well-structured content. Neram can become the authoritative source AI cites for architecture education queries.

### Business Model Summary

| Revenue Stream | Description | Est. Year 1 |
|---|---|---|
| Annual subscriptions | Silver/Gold/Platinum tiers | ₹18-30L |
| Per-lead charges | Beyond subscription quota | ₹5-10L |
| Virtual tour creation | Neram-produced 360° tours | ₹2-5L |
| Ambassador program content | Sponsored/featured content | ₹1-3L |
| **Total** | | **₹26-48L** |

### Key Principles

1. **One template, many pages:** Every college page uses the same Next.js dynamic route template. Data comes from Supabase. Design changes propagate to ALL colleges instantly.
2. **Public-first, no auth required:** All college pages are fully accessible without login. Authentication is only required for: posting reviews, posting comments, clicking "I'm Interested" (lead submission), and ambassador features.
3. **Admin controls everything:** Premium tier assignment, lead window activation, review moderation, content override — all controlled from admin.neramclasses.com.
4. **Mobile-first design:** 80%+ traffic will be mobile. Every component designed for 375px-width screens first, then scaled up.
5. **Extension of Neram brand:** Uses Neram's existing design system (Fluent UI v9, teal #00838F, navy #1B3A4B, gold #E8A817).

---

## 2. Architecture & Tech Stack

### Frontend (Marketing Site)

```
Framework:      Next.js (existing neramclasses.com setup)
UI Library:     Fluent UI v9 (existing)
Styling:        CSS Modules / Tailwind (match existing approach)
Hosting:        Vercel (existing)
State:          React Context + SWR for data fetching
Charts:         Recharts (lightweight, SSR-compatible)
360° Viewer:    Pannellum (open-source, JS-based)
Maps:           Google Maps Embed API (for location + Street View)
```

### Backend (Supabase)

```
Database:       Supabase PostgreSQL (existing project)
Auth:           Supabase Auth (existing for student login)
                Separate auth flow for college admin accounts
Storage:        Supabase Storage (college photos, 360° images, documents)
Edge Functions: For scraping pipeline, lead processing, notification triggers
Realtime:       For live comment/Q&A updates
```

### Admin Panel

```
Framework:      Next.js (existing admin.neramclasses.com)
College Hub:    New dedicated section within existing admin layout
```

### External Integrations

```
WhatsApp:       Meta Cloud API (existing second number setup)
Email:          Transactional emails for college admin invites, lead notifications
YouTube:        YouTube Data API v3 (embed college channel videos)
Google Maps:    Maps Embed API + Street View
Claude API:     For Aintra AI chat agent on Gold/Platinum pages
```

### Project Structure (within existing monorepo)

```
neramclasses.com/
├── src/
│   ├── app/
│   │   ├── colleges/
│   │   │   ├── page.tsx                          # /colleges — main listing
│   │   │   ├── [state]/
│   │   │   │   ├── page.tsx                      # /colleges/tamil-nadu
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx                  # /colleges/tamil-nadu/nit-trichy
│   │   │   ├── tnea/
│   │   │   │   └── page.tsx                      # /colleges/tnea
│   │   │   ├── josaa/
│   │   │   │   └── page.tsx                      # /colleges/josaa
│   │   │   ├── compare/
│   │   │   │   └── [...slugs]/
│   │   │   │       └── page.tsx                  # /colleges/compare/nit-trichy-vs-anna-university
│   │   │   └── college-dashboard/
│   │   │       ├── page.tsx                      # College admin login
│   │   │       ├── overview/page.tsx             # Dashboard home
│   │   │       ├── leads/page.tsx                # Lead management
│   │   │       ├── reviews/page.tsx              # Review management
│   │   │       ├── profile/page.tsx              # Profile editor
│   │   │       └── analytics/page.tsx            # View analytics
│   ├── components/
│   │   └── college-hub/
│   │       ├── CollegePageTemplate.tsx            # THE master template
│   │       ├── HeroSection.tsx
│   │       ├── ArchIndexRing.tsx
│   │       ├── BadgePills.tsx
│   │       ├── FeeBreakdown.tsx
│   │       ├── CutoffSparkline.tsx
│   │       ├── PlacementStats.tsx
│   │       ├── ReviewSection.tsx
│   │       ├── AmbassadorCards.tsx
│   │       ├── CommentSection.tsx
│   │       ├── InfrastructureSection.tsx
│   │       ├── VirtualTourViewer.tsx
│   │       ├── AintraChatAgent.tsx
│   │       ├── NavPills.tsx
│   │       ├── CollegeListingCard.tsx
│   │       ├── FilterSidebar.tsx
│   │       ├── ComparisonTable.tsx
│   │       ├── SimilarColleges.tsx
│   │       ├── ClaimProfileCTA.tsx
│   │       └── LeadInterestButton.tsx
│   ├── lib/
│   │   └── college-hub/
│   │       ├── types.ts                          # All TypeScript interfaces
│   │       ├── queries.ts                        # Supabase queries
│   │       ├── seo.ts                            # SEO metadata generators
│   │       ├── schema-markup.ts                  # JSON-LD structured data
│   │       └── constants.ts                      # Tier configs, filter options
│   └── hooks/
│       └── college-hub/
│           ├── useCollegeData.ts
│           ├── useLeadWindow.ts
│           └── useAmbassadors.ts

admin.neramclasses.com/
├── src/
│   ├── app/
│   │   └── college-hub/
│   │       ├── page.tsx                          # College Hub admin home
│   │       ├── colleges/
│   │       │   ├── page.tsx                      # All colleges list
│   │       │   └── [id]/
│   │       │       └── page.tsx                  # Individual college admin
│   │       ├── tiers/page.tsx                    # Tier management
│   │       ├── leads/page.tsx                    # Global lead management
│   │       ├── lead-window/page.tsx              # Lead window controls
│   │       ├── reviews/page.tsx                  # Review moderation queue
│   │       ├── comments/page.tsx                 # Comment moderation
│   │       ├── ambassadors/page.tsx              # Ambassador management
│   │       ├── college-accounts/page.tsx         # College login accounts
│   │       ├── analytics/page.tsx                # Platform-wide analytics
│   │       └── scraping/page.tsx                 # Data pipeline management
```

---

## 3. URL Structure & Routing

### Public Pages (neramclasses.com)

| URL Pattern | Page Type | Example |
|---|---|---|
| `/colleges/` | Main listing — all India | Browse all B.Arch colleges |
| `/colleges/[state]/` | State listing | `/colleges/tamil-nadu/` |
| `/colleges/[state]/[slug]/` | Individual college page | `/colleges/tamil-nadu/nit-trichy/` |
| `/colleges/tnea/` | TNEA counseling colleges | Colleges under TNEA B.Arch |
| `/colleges/josaa/` | JoSAA counseling colleges | Central/NIT/IIT/SPA colleges |
| `/colleges/[state-counseling]/` | State counseling | `/colleges/karnataka-cet/` (Phase 2) |
| `/colleges/compare/[slug1]-vs-[slug2]/` | Comparison | `/colleges/compare/nit-trichy-vs-cept-ahmedabad/` |
| `/colleges/rankings/nirf/` | NIRF ranked colleges | Sorted by NIRF rank |
| `/colleges/rankings/archindex/` | ArchIndex ranked | Neram's proprietary ranking |
| `/colleges/fees/below-5-lakhs/` | Fee-based listing | Programmatic SEO pages |
| `/nata-hub/` | NATA exam hub (pillar page) | Links to all NATA-accepting colleges |
| `/jee-barch-hub/` | JEE B.Arch hub (pillar page) | Links to all JEE-accepting colleges |

### College Dashboard (neramclasses.com/college-dashboard/)

| URL | Page | Access |
|---|---|---|
| `/college-dashboard/` | Login page | Public |
| `/college-dashboard/overview/` | Dashboard home | Authenticated college admin |
| `/college-dashboard/leads/` | Lead management | Authenticated (Silver+) |
| `/college-dashboard/reviews/` | View & respond to reviews | Authenticated |
| `/college-dashboard/profile/` | Edit college profile | Authenticated |
| `/college-dashboard/analytics/` | View analytics | Authenticated |
| `/college-dashboard/ambassadors/` | Ambassador management | Authenticated (Gold+) |

### Admin Panel (admin.neramclasses.com/college-hub/)

All admin college hub pages live under the `/college-hub/` section of the existing admin panel.

### Slug Generation Rules

- Lowercase, hyphenated: `national-institute-of-technology-tiruchirappalli`
- Short alias supported: `nit-trichy` (redirects to full slug or used as primary)
- No numeric IDs in URLs
- State slugs: `tamil-nadu`, `karnataka`, `maharashtra`, etc.
- Max 3-4 levels deep

---

## 4. Database Schema (Supabase)

### Core Tables

```sql
-- ============================================
-- COLLEGES — Master table
-- ============================================
CREATE TABLE colleges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,                    -- URL slug: "nit-trichy"
  short_name TEXT NOT NULL,                     -- "NIT Trichy"
  full_name TEXT NOT NULL,                      -- "National Institute of Technology, Tiruchirappalli"
  
  -- Location
  state TEXT NOT NULL,                          -- "Tamil Nadu"
  state_slug TEXT NOT NULL,                     -- "tamil-nadu"
  district TEXT,                                -- "Tiruchirappalli"
  city TEXT NOT NULL,                           -- "Tiruchirappalli"
  address TEXT,
  pincode TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_type TEXT,                           -- "metro", "tier2", "semi_urban", "rural"
  nearest_railway TEXT,
  nearest_airport TEXT,
  railway_distance_km DECIMAL(5, 1),
  airport_distance_km DECIMAL(5, 1),
  
  -- Basic Info
  established INTEGER,                          -- 1964
  college_type TEXT NOT NULL,                   -- "central_govt", "state_govt", "aided", "self_financing", "deemed", "private"
  affiliation TEXT,                             -- "Anna University", "Autonomous (MHRD)"
  affiliated_university TEXT,
  intake_capacity INTEGER,                      -- B.Arch seats
  
  -- Accreditation & Rankings
  coa_approved BOOLEAN DEFAULT true,
  coa_validity_till DATE,
  naac_grade TEXT,                              -- "A++", "A+", "A", "B++", etc.
  naac_valid_till DATE,
  nba_accredited BOOLEAN DEFAULT false,
  nba_valid_till DATE,
  nirf_rank INTEGER,
  nirf_score DECIMAL(5, 2),
  nirf_year INTEGER,
  arch_index_score INTEGER,                     -- Neram proprietary (0-100)
  
  -- Exam & Counseling
  accepted_exams TEXT[],                        -- ["NATA", "JEE Main Paper 2"]
  counseling_systems TEXT[],                    -- ["TNEA", "JoSAA"]
  has_management_quota BOOLEAN DEFAULT false,
  has_nri_quota BOOLEAN DEFAULT false,
  
  -- Contact
  website TEXT,
  email TEXT,
  phone TEXT,
  admissions_email TEXT,
  admissions_phone TEXT,
  
  -- Social Media
  youtube_channel_url TEXT,
  youtube_channel_id TEXT,
  instagram_handle TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  
  -- Premium Tier
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'silver', 'gold', 'platinum')),
  tier_start_date DATE,
  tier_end_date DATE,
  tier_amount DECIMAL(10, 2),                   -- Annual subscription amount
  
  -- Verification
  claimed BOOLEAN DEFAULT false,
  claimed_by UUID REFERENCES college_admins(id),
  claimed_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT false,               -- Neram team verified
  verified_at TIMESTAMPTZ,
  
  -- Media
  hero_image_url TEXT,
  logo_url TEXT,
  gallery_images TEXT[],                         -- Array of storage URLs
  
  -- Content
  about TEXT,                                    -- Rich text description
  highlights TEXT[],                             -- Key highlights array
  
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  
  -- Metadata
  data_source TEXT DEFAULT 'public',             -- "public", "college_submitted", "scraped"
  data_completeness INTEGER DEFAULT 0,           -- 0-100 percentage
  last_data_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX idx_colleges_state ON colleges(state_slug);
CREATE INDEX idx_colleges_tier ON colleges(tier);
CREATE INDEX idx_colleges_counseling ON colleges USING GIN(counseling_systems);
CREATE INDEX idx_colleges_exams ON colleges USING GIN(accepted_exams);
CREATE INDEX idx_colleges_type ON colleges(college_type);
CREATE INDEX idx_colleges_nirf ON colleges(nirf_rank);
CREATE INDEX idx_colleges_archindex ON colleges(arch_index_score DESC);
CREATE INDEX idx_colleges_slug ON colleges(slug);

-- ============================================
-- COLLEGE FEE STRUCTURE
-- ============================================
CREATE TABLE college_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,                   -- "2025-26"
  
  -- Year-wise breakdown (5 years for B.Arch)
  year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  
  -- Fee categories
  tuition DECIMAL(10, 2),
  hostel DECIMAL(10, 2),
  mess DECIMAL(10, 2),
  exam_fees DECIMAL(10, 2),
  lab_fees DECIMAL(10, 2),
  library_fees DECIMAL(10, 2),
  caution_deposit DECIMAL(10, 2),
  other_fees DECIMAL(10, 2),
  estimated_materials DECIMAL(10, 2),            -- Model-making, plotting, sheets
  estimated_field_trips DECIMAL(10, 2),
  
  -- Category breakdowns
  fee_category TEXT DEFAULT 'general',           -- "general", "obc", "sc", "st", "management", "nri"
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_source TEXT,                          -- "college_submitted", "prospectus", "student_reported", "aicte"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(college_id, academic_year, year_number, fee_category)
);

-- ============================================
-- CUTOFF DATA
-- ============================================
CREATE TABLE college_cutoffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  academic_year TEXT NOT NULL,                   -- "2025"
  counseling_system TEXT NOT NULL,               -- "TNEA", "JoSAA"
  round_number INTEGER,                         -- 1, 2, 3, etc.
  
  -- Category-wise cutoffs
  category TEXT NOT NULL,                        -- "general", "obc", "sc", "st", "ews"
  cutoff_type TEXT NOT NULL,                     -- "rank" (JoSAA) or "score" (NATA/TNEA)
  cutoff_value DECIMAL(10, 2),                   -- Rank number or score
  
  -- Seat info
  total_seats INTEGER,
  filled_seats INTEGER,
  
  source TEXT,                                   -- "tnea_official", "josaa_official", "college_website"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(college_id, academic_year, counseling_system, round_number, category)
);

-- ============================================
-- PLACEMENT DATA
-- ============================================
CREATE TABLE college_placements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  academic_year TEXT NOT NULL,                   -- "2024-25"
  
  highest_package_lpa DECIMAL(6, 2),
  average_package_lpa DECIMAL(6, 2),
  median_package_lpa DECIMAL(6, 2),
  placement_rate_percent DECIMAL(5, 2),
  students_placed INTEGER,
  total_eligible INTEGER,
  
  top_recruiters TEXT[],                          -- Array of company/firm names
  top_sectors TEXT[],                             -- "architecture_firms", "construction", "real_estate", "it"
  
  higher_studies_percent DECIMAL(5, 2),
  entrepreneurship_percent DECIMAL(5, 2),
  
  verified BOOLEAN DEFAULT false,
  source TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(college_id, academic_year)
);

-- ============================================
-- INFRASTRUCTURE
-- ============================================
CREATE TABLE college_infrastructure (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  -- Studios & Workshops (Architecture-specific)
  design_studios INTEGER,
  studio_student_ratio TEXT,                     -- "1:8"
  workshops TEXT[],                              -- ["Wood Workshop", "Metal Workshop", "3D Printing Lab"]
  software_available TEXT[],                     -- ["AutoCAD", "Revit", "Rhino", "Grasshopper"]
  has_digital_fabrication BOOLEAN DEFAULT false,
  has_model_making_lab BOOLEAN DEFAULT false,
  has_material_library BOOLEAN DEFAULT false,
  
  -- General
  has_library BOOLEAN DEFAULT true,
  library_books_count INTEGER,
  has_hostel_boys BOOLEAN,
  has_hostel_girls BOOLEAN,
  hostel_capacity INTEGER,
  hostel_type TEXT,                              -- "on_campus", "off_campus", "both"
  has_mess BOOLEAN,
  has_wifi BOOLEAN,
  has_sports BOOLEAN,
  sports_facilities TEXT[],
  
  -- Campus
  campus_area_acres DECIMAL(6, 2),
  campus_type TEXT,                              -- "urban", "suburban", "campus_town"
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FACULTY
-- ============================================
CREATE TABLE college_faculty (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  designation TEXT,                               -- "Professor", "Associate Professor", "Assistant Professor"
  specialization TEXT,
  qualification TEXT,                             -- "Ph.D.", "M.Arch"
  is_practicing_architect BOOLEAN DEFAULT false,
  profile_url TEXT,
  
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REVIEWS
-- ============================================
CREATE TABLE college_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                         -- Logged-in user (Supabase Auth)
  
  -- Ratings (1-5 scale)
  overall_rating DECIMAL(2, 1) NOT NULL,
  design_studio_rating DECIMAL(2, 1),
  faculty_rating DECIMAL(2, 1),
  campus_hostel_rating DECIMAL(2, 1),
  placement_rating DECIMAL(2, 1),
  value_for_money_rating DECIMAL(2, 1),
  infrastructure_rating DECIMAL(2, 1),
  competition_exposure_rating DECIMAL(2, 1),
  site_visit_rating DECIMAL(2, 1),
  software_access_rating DECIMAL(2, 1),
  
  -- Content
  title TEXT,
  review_text TEXT NOT NULL,
  pros TEXT,
  cons TEXT,
  
  -- Reviewer Info
  reviewer_year TEXT,                            -- "3rd Year", "Alumni 2024"
  reviewer_course TEXT DEFAULT 'B.Arch',
  
  -- Verification
  verification_level TEXT DEFAULT 'otp',         -- "otp", "email_domain", "enrollment_proof", "linkedin"
  is_verified BOOLEAN DEFAULT false,
  
  -- Moderation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_note TEXT,
  moderated_by UUID,
  moderated_at TIMESTAMPTZ,
  
  -- College Response
  college_response TEXT,
  college_responded_at TIMESTAMPTZ,
  college_responded_by UUID,
  
  -- Incentive tracking
  is_incentivized BOOLEAN DEFAULT false,
  incentive_amount DECIMAL(6, 2),
  incentive_paid BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_college ON college_reviews(college_id);
CREATE INDEX idx_reviews_status ON college_reviews(status);

-- ============================================
-- COMMENTS / Q&A
-- ============================================
CREATE TABLE college_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES college_comments(id),  -- For replies
  
  comment_text TEXT NOT NULL,
  
  -- User display info
  user_display_name TEXT,
  is_ambassador BOOLEAN DEFAULT false,
  
  -- Moderation
  status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'hidden', 'deleted')),
  deleted_by UUID,
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_college ON college_comments(college_id);

-- ============================================
-- STUDENT AMBASSADORS
-- ============================================
CREATE TABLE college_ambassadors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  -- Ambassador Info
  user_id UUID,                                  -- If registered on Neram platform
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  whatsapp_number TEXT,
  
  -- Profile
  year_of_study TEXT,                            -- "3rd Year", "4th Year"
  interest_area TEXT,                            -- "Sustainable Design", "Urban Planning"
  short_bio TEXT,
  avatar_initials TEXT,                          -- "KR" (generated from name)
  
  -- Social (optional, ambassador controls what to share)
  linkedin_url TEXT,
  instagram_handle TEXT,
  
  -- Source
  source TEXT NOT NULL,                          -- "neram_alumni", "college_provided", "self_registered"
  is_neram_student BOOLEAN DEFAULT false,
  neram_batch TEXT,                              -- "NATA 2023"
  
  -- Engagement
  opted_in BOOLEAN DEFAULT false,
  opted_in_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  response_rate_percent DECIMAL(5, 2),
  avg_response_time_hours DECIMAL(6, 2),
  total_queries_received INTEGER DEFAULT 0,
  total_queries_answered INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  
  -- Rewards
  total_earned DECIMAL(8, 2) DEFAULT 0,
  leaderboard_rank INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AMBASSADOR INTERACTIONS
-- ============================================
CREATE TABLE ambassador_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ambassador_id UUID REFERENCES college_ambassadors(id),
  college_id UUID REFERENCES colleges(id),
  
  -- Querying student
  student_user_id UUID,
  student_name TEXT,
  student_phone TEXT,
  
  -- Content
  question TEXT NOT NULL,
  answer TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent_to_ambassador', 'answered', 'expired', 'escalated_to_ai')),
  
  -- WhatsApp tracking
  whatsapp_message_id TEXT,
  sent_via TEXT DEFAULT 'whatsapp',              -- "whatsapp", "in_app", "email"
  
  -- Timing
  sent_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  
  -- If escalated to next ambassador
  escalation_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEADS — Student Interest
-- ============================================
CREATE TABLE college_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  -- Student Info (shared only during lead window)
  user_id UUID NOT NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  student_email TEXT,
  student_city TEXT,
  student_state TEXT,
  
  -- Qualification
  nata_score DECIMAL(6, 2),
  jee_rank INTEGER,
  exam_type TEXT,                                 -- "NATA", "JEE"
  exam_year TEXT,
  
  -- Interest
  interest_level TEXT DEFAULT 'saved',            -- "saved" (soft), "interested" (hard inquiry)
  
  -- Consent
  consent_given BOOLEAN DEFAULT false,
  consent_text TEXT,                              -- What the student agreed to
  consent_given_at TIMESTAMPTZ,
  
  -- College Follow-up (updated by college)
  follow_up_status TEXT DEFAULT 'new' CHECK (follow_up_status IN ('new', 'contacted', 'interested', 'applied', 'enrolled', 'rejected', 'not_reachable')),
  follow_up_notes TEXT,
  followed_up_by UUID,
  followed_up_at TIMESTAMPTZ,
  
  -- Lead Window
  lead_window_id UUID REFERENCES lead_windows(id),
  shared_with_college BOOLEAN DEFAULT false,
  shared_at TIMESTAMPTZ,
  
  -- Lead Quality
  lead_quality_score INTEGER,                    -- 1-10, auto-calculated
  is_duplicate BOOLEAN DEFAULT false,
  
  -- Revenue
  lead_charge DECIMAL(8, 2),                     -- Amount charged to college for this lead
  is_within_quota BOOLEAN DEFAULT true,          -- Within subscription quota or overage
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_college ON college_leads(college_id);
CREATE INDEX idx_leads_status ON college_leads(follow_up_status);
CREATE INDEX idx_leads_window ON college_leads(lead_window_id);

-- ============================================
-- LEAD WINDOWS
-- ============================================
CREATE TABLE lead_windows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  name TEXT NOT NULL,                            -- "TNEA 2026 Admission Cycle"
  description TEXT,
  
  -- Window Period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Scope
  applies_to_counseling TEXT[],                  -- ["TNEA"], ["JoSAA"], or NULL for all
  applies_to_tiers TEXT[],                       -- ["silver", "gold", "platinum"]
  
  -- Status
  is_active BOOLEAN DEFAULT false,               -- Master toggle
  activated_by UUID,
  activated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COLLEGE ADMIN ACCOUNTS
-- ============================================
CREATE TABLE college_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  -- Account Info
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  name TEXT NOT NULL,
  designation TEXT,                               -- "Director", "Admission Head", "IT Admin"
  
  -- Auth
  supabase_auth_id UUID UNIQUE,                  -- Links to Supabase Auth user
  
  -- Role
  role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'admission_officer', 'faculty_coordinator', 'viewer')),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  invited_by UUID,                               -- Neram admin who created the account
  invited_at TIMESTAMPTZ,
  first_login_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COLLEGE SUBSCRIPTIONS & BILLING
-- ============================================
CREATE TABLE college_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  tier TEXT NOT NULL CHECK (tier IN ('silver', 'gold', 'platinum')),
  
  -- Period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Pricing
  annual_amount DECIMAL(10, 2) NOT NULL,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  
  -- Lead Quota
  monthly_lead_quota INTEGER,                    -- 20 for Silver, 50 for Gold, NULL for Platinum
  per_lead_charge DECIMAL(8, 2),                 -- Overage rate
  
  -- Payment
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method TEXT,
  payment_reference TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'paused')),
  
  -- Renewal
  auto_renew BOOLEAN DEFAULT false,
  renewal_reminder_sent BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SOFT INTERESTS (Saved / Bookmarked — anonymous aggregate)
-- ============================================
CREATE TABLE college_saves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(college_id, user_id)
);

-- ============================================
-- COLLEGE PAGE ANALYTICS
-- ============================================
CREATE TABLE college_page_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  -- View info
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,                                  -- NULL for anonymous
  session_id TEXT,
  
  -- Source
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  
  -- Location
  viewer_city TEXT,
  viewer_state TEXT,
  viewer_country TEXT DEFAULT 'IN',
  
  -- Device
  device_type TEXT,                              -- "mobile", "desktop", "tablet"
  
  -- Engagement
  sections_viewed TEXT[],                         -- Which sections they scrolled to
  time_on_page_seconds INTEGER
);

-- Partition by month for performance
CREATE INDEX idx_views_college_date ON college_page_views(college_id, viewed_at);

-- ============================================
-- 360° VIRTUAL TOUR
-- ============================================
CREATE TABLE college_virtual_tours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                            -- "Design Studio Tour"
  
  -- Scenes (array of 360° images with hotspots)
  scenes JSONB NOT NULL,
  /*
  [
    {
      "id": "studio-1",
      "title": "Main Design Studio",
      "image_url": "https://...",
      "hotspots": [
        {
          "pitch": -5,
          "yaw": 120,
          "type": "scene",
          "target_scene": "workshop",
          "label": "Go to Workshop →"
        },
        {
          "pitch": 10,
          "yaw": -30,
          "type": "info",
          "label": "Student Work Display Area"
        }
      ]
    }
  ]
  */
  
  is_published BOOLEAN DEFAULT false,
  created_by TEXT,                               -- "neram_team", "college_uploaded"
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCRAPING PIPELINE — Data Source Tracking
-- ============================================
CREATE TABLE data_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  source_type TEXT NOT NULL,                     -- "coa", "nirf", "naac", "tnea", "josaa", "college_website", "prospectus_pdf", "student_survey", "manual"
  source_url TEXT,
  source_file_path TEXT,                         -- For stored PDFs
  
  data_fields_extracted TEXT[],                  -- Which fields came from this source
  
  last_scraped_at TIMESTAMPTZ,
  scrape_status TEXT DEFAULT 'pending',          -- "pending", "completed", "failed", "needs_review"
  
  raw_data JSONB,                                -- Raw extracted data before processing
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS) Policies

```sql
-- Public read access for all college data (no auth required)
CREATE POLICY "Public read colleges" ON colleges FOR SELECT USING (is_active = true);
CREATE POLICY "Public read fees" ON college_fees FOR SELECT USING (true);
CREATE POLICY "Public read cutoffs" ON college_cutoffs FOR SELECT USING (true);
CREATE POLICY "Public read approved reviews" ON college_reviews FOR SELECT USING (status = 'approved');
CREATE POLICY "Public read approved comments" ON college_comments FOR SELECT USING (status = 'approved');

-- Authenticated users can post reviews and comments
CREATE POLICY "Auth users post reviews" ON college_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users post comments" ON college_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- College admins can update their own college data
CREATE POLICY "College admin update" ON colleges FOR UPDATE 
  USING (id IN (SELECT college_id FROM college_admins WHERE supabase_auth_id = auth.uid()));

-- College admins can view their leads (only when shared)
CREATE POLICY "College admin view leads" ON college_leads FOR SELECT 
  USING (college_id IN (SELECT college_id FROM college_admins WHERE supabase_auth_id = auth.uid()) AND shared_with_college = true);

-- Neram admin has full access (use service role key in admin panel)
```

---

## 5. Data Sourcing & Scraping Pipeline

### Phase 1 Data Sources & Extraction Plan

#### Tier 1 — Fully Automatable (Public Databases)

| Source | Data Extracted | Method | Frequency |
|---|---|---|---|
| COA Approved List | College name, location, approval status, intake, validity | Scrape COA website or download PDF → Claude API extraction | Annually |
| NIRF Data | Rank, score, participation status | Download from NIRF website (Excel/PDF available) | Annually |
| NAAC Results | Grade, CGPA, validity | Scrape NAAC website search results | Annually |
| TNEA Database | College code, seat matrix, cutoffs (2020-2025) | **Already available in Neram's Supabase** | Each counseling cycle |
| JoSAA Data | Seat matrix, round-wise cutoffs, closing ranks | Download from JoSAA website (publicly available post-counseling) | Each counseling cycle |
| AICTE Portal | Fee structure for AICTE-affiliated colleges | API or scrape | Annually |

#### Tier 2 — Semi-Automated (College Websites)

| Data | Method |
|---|---|
| Fee structure (prospectus) | Download prospectus PDF → Claude API extraction → Structured JSON |
| Faculty list | Scrape college website faculty page → Claude API to structure |
| Infrastructure details | Scrape "About" / "Facilities" pages |
| Contact details | Scrape contact page |
| Social media handles | Search "[College Name] B.Arch YouTube/Instagram" |
| Courses offered | Scrape courses/programs page |

#### Tier 3 — Manual / Crowdsourced

| Data | Method |
|---|---|
| Realistic material costs | Google Form survey to Neram alumni at each college |
| Studio-to-student ratio | Student survey |
| Actual placement stats | Student survey + college website cross-reference |
| Hostel quality, mess food | Student reviews on platform |
| Design competition participation | Manual research + student reports |

### Scraping Pipeline Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ADMIN TRIGGER                       │
│  admin.neramclasses.com/college-hub/scraping         │
│  "Scrape All TN Colleges" / "Scrape Single College"  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTION                  │
│              scrape-college-data                     │
│                                                      │
│  1. Fetch college website HTML                       │
│  2. Download prospectus PDF if available             │
│  3. Send to Claude API for structured extraction     │
│  4. Validate extracted data against schema            │
│  5. Store raw data in data_sources table             │
│  6. Merge into college tables with conflict rules     │
│  7. Calculate data_completeness percentage            │
│  8. Log results for admin review                     │
└─────────────────────────────────────────────────────┘
```

### Claude API Extraction Prompt Template

```
You are extracting structured data from an architecture college website/prospectus.
Extract the following fields into JSON format:

{
  "full_name": "...",
  "fees": {
    "tuition_per_year": ...,
    "hostel_per_year": ...,
    ...
  },
  "faculty": [
    { "name": "...", "designation": "...", "specialization": "..." }
  ],
  "infrastructure": {
    "studios": ...,
    "workshops": [...],
    ...
  },
  "contact": { ... },
  "courses": [ ... ]
}

If a field is not available in the source, set it to null.
Do not guess or fabricate data.
```

### Data Quality Rules

1. **Never overwrite college-submitted data with scraped data** — college-verified data has highest priority.
2. **Always store source attribution** — every data field traces back to its source.
3. **Flag confidence levels** — auto-extracted data starts as "unverified", moves to "verified" when confirmed by admin or college.
4. **Completeness tracking** — each college has a `data_completeness` score (0-100%) based on how many fields are populated. This drives admin prioritization.

---

## 6. College Page — Template Design

### Master Template: `CollegePageTemplate.tsx`

This single component renders ALL college pages. It receives college data from Supabase via `getStaticProps` (SSG) or `getServerSideProps` (SSR) and conditionally renders sections based on the college's premium tier.

### Section Order (Mobile — Vertical Scroll with Floating Nav Pills)

```
┌────────────────────────────────┐
│  HEADER BAR                    │  Neram logo + "COLLEGE HUB" label
├────────────────────────────────┤
│  HERO IMAGE                   │  College photo / placeholder
│  ┌──────────────────────────┐ │
│  │  COLLEGE INFO CARD       │ │  Overlapping hero bottom
│  │  Name, Location, Badges  │ │  ArchIndex ring
│  │  Quick Stats Row         │ │  Est. | Intake | Type | Counseling
│  │  Accepted Exams (linked) │ │  → NATA Hub / JEE Hub hyperlinks
│  │  Action Buttons          │ │  Save | I'm Interested
│  └──────────────────────────┘ │
├────────────────────────────────┤
│  FLOATING NAV PILLS (sticky)  │  💰 Fees | 🎓 Admission | 💼 Placements | ...
├────────────────────────────────┤
│  💰 FEE BREAKDOWN             │  Total 5-year cost meter
│  Year-wise cards               │  Stacked color bar (tuition/hostel/mess/materials)
│  Verified badge if premium     │
├────────────────────────────────┤
│  🎓 ADMISSION & CUTOFF        │  Counseling system tag
│  Cutoff sparkline (5-year)     │  Category-wise cutoff grid
│  Eligibility criteria          │
├────────────────────────────────┤
│  💼 PLACEMENTS                 │  Highest/Avg/Median/Rate cards
│  Top recruiters chips          │
├────────────────────────────────┤
│  ⭐ STUDENT REVIEWS            │  Aggregate score + category bars
│  Individual review cards       │  Verified badges on reviews
│  "Write a Review" CTA         │  Login required
├────────────────────────────────┤
│  🤝 STUDENT AMBASSADORS       │  🔒 Locked on Free/Silver
│  Ambassador cards              │  Connect via WhatsApp button
│  "X Neram alumni here" badge  │
├────────────────────────────────┤
│  🏛️ CAMPUS & INFRASTRUCTURE   │  Studios, workshops, software
│  Hostel details               │  Virtual tour (Platinum only)
├────────────────────────────────┤
│  👨‍🏫 FACULTY                   │  Key faculty with specializations
│  "Practicing Architect" badge  │
├────────────────────────────────┤
│  💬 QUESTIONS & DISCUSSION     │  Comment thread (login to post)
│  Admin moderated              │
├────────────────────────────────┤
│  🔗 OFFICIAL CHANNELS         │  YouTube embed | Instagram | Website
├────────────────────────────────┤
│  🏫 SIMILAR COLLEGES          │  Horizontal scroll cards
├────────────────────────────────┤
│  🏛️ CLAIM THIS PROFILE        │  Only on Free tier
│  CTA for colleges             │
└────────────────────────────────┘
│  💬 AI CHAT AGENT (FAB)       │  Floating button — Gold/Platinum only
└────────────────────────────────┘
```

### Responsive Behavior

| Breakpoint | Layout |
|---|---|
| < 480px (mobile) | Single column, full-width sections, horizontal scroll for cards |
| 480-768px (tablet) | Single column, slightly wider cards |
| 768-1024px (small desktop) | Two columns: main content (65%) + sidebar (35%) |
| > 1024px (desktop) | Two columns with max-width 1200px container, sidebar has sticky quick stats + CTA |

### Desktop Sidebar Contents

- ArchIndex score ring
- Quick stats (established, intake, type)
- Action buttons (Save, I'm Interested)
- Accepted exams (linked to hubs)
- Contact info (phone, email, website)
- Download brochure button (if available)
- Social media links
- "Claim This Profile" CTA (free tier)

### Design Tokens (extending Neram brand)

```css
/* Colors — extending existing Neram palette */
--neram-teal: #00838F;
--neram-navy: #1B3A4B;
--neram-gold: #E8A817;

/* College Hub specific */
--hub-bg: #F9FAFB;
--hub-card: #FFFFFF;
--hub-border: #F0F0F0;
--hub-text-primary: #1B3A4B;
--hub-text-secondary: #4B5563;
--hub-text-muted: #6B7280;
--hub-text-light: #9CA3AF;

/* Badge colors */
--badge-official-bg: #E8F5E9;
--badge-official-text: #1B5E20;
--badge-accreditation-bg: #E3F2FD;
--badge-accreditation-text: #0D47A1;
--badge-ranking-bg: #FFF8E1;
--badge-ranking-text: #E65100;

/* Tier colors */
--tier-free: #6B7280;
--tier-silver: #94A3B8;
--tier-gold: #D4A017;
--tier-platinum: #7C3AED;

/* Rating colors */
--rating-excellent: #00838F;  (4.0+)
--rating-good: #E8A817;       (3.0-3.9)
--rating-poor: #EF5350;       (below 3.0)

/* Typography — using existing Neram font stack */
Font family: Segoe UI (Fluent UI default), system fallbacks
Heading weights: 700
Body weights: 400, 500, 600
```

---

## 7. Premium Tier System

### Tier Feature Matrix

| Feature | Free | Silver (₹30-50K/yr) | Gold (₹75K-1.5L/yr) | Platinum (₹2-5L/yr) |
|---|---|---|---|---|
| **Profile & Content** | | | | |
| Basic info (name, location, type, affiliation) | ✓ | ✓ | ✓ | ✓ |
| COA/NAAC/NIRF badges | ✓ | ✓ | ✓ | ✓ |
| Fee data (public sources) | ✓ | ✓ Verified | ✓ Verified | ✓ Verified |
| About section | Auto-generated | College-written | College-written | College-written |
| Photos | 3 max | 10 | 25 + gallery | Unlimited |
| Video embeds | ✗ | 1 YouTube | 3 videos | Unlimited |
| Virtual 360° tour | ✗ | ✗ | ✗ | ✓ |
| Custom branding (logo, header color) | ✗ | ✗ | ✗ | ✓ Subtle |
| **Badges & Visibility** | | | | |
| Verified badge | ✗ | ✓ Silver | ✓ Gold | ✓ Platinum |
| Search position | Standard | Boosted | Priority | Featured/Top |
| "Claim This Profile" CTA visible | ✓ | ✗ (claimed) | ✗ | ✗ |
| Featured on listing pages | ✗ | ✗ | ✓ Highlighted | ✓ Top + highlighted |
| **Lead System** | | | | |
| Aggregate anonymous interest count | ✓ | ✓ | ✓ | ✓ |
| Lead forwarding (during window) | ✗ | 20/month | 50/month | Unlimited |
| Per-lead charge (beyond quota) | N/A | ₹200/lead | ₹150/lead | ₹100/lead |
| Lead quality scoring | ✗ | Basic | Advanced | Advanced + filters |
| **AI & Engagement** | | | | |
| AI chat agent (Aintra) | ✗ | ✗ | ✓ | ✓ Customized |
| Student Ambassador section | ✗ | ✗ | ✓ | ✓ |
| **Analytics** | | | | |
| Page view count | ✗ | Basic | Advanced | Full + competitor benchmarking |
| Geographic distribution | ✗ | ✗ | ✓ | ✓ |
| NATA score distribution of visitors | ✗ | ✗ | ✓ | ✓ |
| **Reviews** | | | | |
| Receive reviews | ✓ | ✓ | ✓ | ✓ |
| Respond to reviews | ✗ | ✓ | ✓ | ✓ |
| **Dashboard** | | | | |
| College admin login | ✗ | ✓ | ✓ | ✓ |
| Profile editor | ✗ | ✓ | ✓ | ✓ |
| Lead management panel | ✗ | ✓ | ✓ | ✓ |
| Analytics dashboard | ✗ | Basic | Advanced | Full |
| **Content & SEO** | | | | |
| Blog/article mentions | ✗ | ✗ | 2/year | 6/year + sponsored |
| Comparison tool inclusion | ✓ | ✓ Priority | ✓ Priority | ✓ Featured |

### Tier Assignment Logic (Admin Panel)

```typescript
// Admin can change tier from admin panel
// Tier changes trigger:
// 1. Update colleges.tier
// 2. Create/update college_subscriptions record
// 3. Enable/disable features in real-time
// 4. Send notification to college admin

async function updateCollegeTier(collegeId: string, newTier: Tier, subscriptionDetails: SubscriptionInput) {
  // Update college tier
  await supabase.from('colleges').update({ 
    tier: newTier,
    tier_start_date: subscriptionDetails.startDate,
    tier_end_date: subscriptionDetails.endDate,
    tier_amount: subscriptionDetails.amount
  }).eq('id', collegeId);
  
  // Create subscription record
  await supabase.from('college_subscriptions').insert({
    college_id: collegeId,
    tier: newTier,
    start_date: subscriptionDetails.startDate,
    end_date: subscriptionDetails.endDate,
    annual_amount: subscriptionDetails.amount,
    monthly_lead_quota: TIER_LEAD_QUOTAS[newTier],
    per_lead_charge: TIER_LEAD_RATES[newTier],
    ...
  });
  
  // Notify college admin
  await sendWhatsAppNotification(collegeId, `Your Neram College Hub profile has been upgraded to ${newTier}!`);
}
```

### Graceful Downgrade on Non-Renewal

When a subscription expires and is not renewed:

| Timeline | Action |
|---|---|
| 30 days before expiry | Renewal reminder email + WhatsApp with performance data |
| 7 days before expiry | Urgent reminder with "Your profile received X views this year" |
| Day of expiry | Grace period starts (7 days) |
| Expiry + 7 days | Week 1: Remove verified badge, revert search position |
| Expiry + 14 days | Week 2: Stop lead forwarding, deactivate AI agent |
| Expiry + 21 days | Week 3: Reduce photo gallery to 3 images |
| Expiry + 28 days | Week 4: Remove analytics access, revert to Free tier |

**NEVER delete a college profile.** Free tier always remains live.

---

## 8. Listing Pages — Filters & Sorting

### Filter Categories

```typescript
interface CollegeFilters {
  // Location
  state: string[];                    // Multi-select: ["Tamil Nadu", "Karnataka"]
  district: string[];                 // Dependent on state selection
  locationType: string[];             // ["metro", "tier2", "semi_urban", "rural"]
  
  // College Type
  collegeType: string[];              // ["central_govt", "state_govt", "aided", "self_financing", "deemed"]
  
  // Counseling System
  counselingSystem: string[];         // ["TNEA", "JoSAA", "Karnataka CET", "Management Quota"]
  
  // Exams Accepted
  acceptedExam: string[];             // ["NATA", "JEE Main Paper 2"]
  
  // Fees
  feeRange: {
    min: number;
    max: number;
  };                                   // Total 5-year cost slider
  
  // Rankings
  nirfRanked: boolean;                // Has NIRF rank or not
  nirfRankRange: { min: number; max: number };
  naacGrade: string[];                // ["A++", "A+", "A", "B++", "B+", "B"]
  nbaAccredited: boolean;
  archIndexRange: { min: number; max: number };
  
  // Cutoff
  cutoffScoreRange: {
    min: number;
    max: number;
  };                                   // "Show colleges I can get into with my score"
  
  // Infrastructure
  hasHostel: boolean;
  hasDigitalFabLab: boolean;
  
  // Tier
  verifiedOnly: boolean;              // Only show claimed/verified profiles
}
```

### Sort Options

```typescript
type SortOption = 
  | 'archindex_desc'                   // ArchIndex Score (High to Low)
  | 'archindex_asc'                    // ArchIndex Score (Low to High)
  | 'nirf_rank_asc'                    // NIRF Rank (Best first)
  | 'fees_asc'                         // Fees (Low to High)
  | 'fees_desc'                        // Fees (High to Low)
  | 'review_score_desc'               // Student Rating (Highest first)
  | 'placement_desc'                   // Average Package (Highest first)
  | 'cutoff_asc'                       // Cutoff (Easiest to get in)
  | 'cutoff_desc'                      // Cutoff (Most competitive)
  | 'counseling_popularity'            // How quickly seats fill in counseling
  | 'established_asc'                  // Oldest first
  | 'review_count_desc'               // Most reviewed
  | 'location_proximity'              // Nearest (requires user location permission)
  ;
```

### Mobile Layout for Listing Page

```
┌────────────────────────────────┐
│  HEADER: "B.Arch Colleges"     │
│  Subtitle: "Tamil Nadu" / etc  │
├────────────────────────────────┤
│  🔍 Search bar                 │  Type college name
├────────────────────────────────┤
│  Filter pills (horizontal)     │  Quick toggles: TNEA | JoSAA | Govt | Private
├────────────────────────────────┤
│  Sort dropdown | Filter button │  Filter button opens bottom sheet
├────────────────────────────────┤
│  ┌──────────────────────────┐ │
│  │  COLLEGE LIST CARD       │ │
│  │  ┌─────┐ Name           │ │  Logo/placeholder + college name
│  │  │ Logo│ Location        │ │  Badges row
│  │  └─────┘ Badges          │ │  
│  │  Stats: Fee | Cutoff     │ │  Key stats inline
│  │  Rating: ⭐ 4.3 (47)     │ │  Review score
│  │  ArchIndex: 92           │ │  
│  │  [Save] [View Details →] │ │  
│  └──────────────────────────┘ │
│  ┌──────────────────────────┐ │
│  │  Next college card...    │ │
│  └──────────────────────────┘ │
└────────────────────────────────┘
```

### Desktop Layout for Listing Page

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER + BREADCRUMBS                                        │
├───────────────┬─────────────────────────────────────────────┤
│  FILTER       │  SORT BAR + RESULT COUNT                     │
│  SIDEBAR      │  ┌────────────────────────────────────────┐ │
│               │  │  College Card (wider, horizontal)      │ │
│  Location     │  │  More info visible on desktop           │ │
│  Type         │  └────────────────────────────────────────┘ │
│  Counseling   │  ┌────────────────────────────────────────┐ │
│  Fees slider  │  │  College Card                          │ │
│  Ranking      │  └────────────────────────────────────────┘ │
│  Cutoff range │                                              │
│  ...          │  PAGINATION                                  │
└───────────────┴─────────────────────────────────────────────┘
```

---

## 9. Comparison Tool

### URL Pattern

`/colleges/compare/[slug1]-vs-[slug2]/`

Supports 2-3 colleges at a time.

### Comparison Data Points

| Category | Fields Compared |
|---|---|
| Basic | Type, Established, Intake, Affiliation |
| Exams | Accepted exams, Counseling system |
| Fees | Year-wise + total 5-year cost |
| Cutoff | Latest general + category cutoffs, trend charts |
| Placements | Highest/Avg/Median package, placement rate |
| Reviews | Overall rating, category-wise ratings |
| Infrastructure | Studios, workshops, software, hostel |
| Rankings | NIRF, NAAC, ArchIndex |

### UX: Swipeable columns on mobile, side-by-side table on desktop.

### SEO: Generate comparison pages programmatically for popular college pairs.

---

## 10. Fee Transparency Module

### What Makes This Different from Competitors

Competitors show "₹1.5L per year" — we show the **realistic total cost** including hidden expenses that architecture students actually face.

### Fee Categories Displayed

| Category | Source | Notes |
|---|---|---|
| Tuition | Official / AICTE | Base academic fee |
| Hostel | Official | Room charges |
| Mess / Food | Official / Student-reported | Monthly mess charges |
| Exam Fees | Official | Semester/annual exam fees |
| Lab / Workshop Fees | Official | Materials lab, CAD lab |
| Library Fees | Official | Annual library charges |
| Caution Deposit | Official | One-time, refundable |
| Other Official Fees | Official | Development fee, sports fee, etc. |
| **Estimated Materials*** | Student-reported | Sheets, models, plotting, 3D printing |
| **Estimated Field Trips*** | Student-reported | Site visits, study tours |

*Starred items are crowdsourced from student surveys and marked as estimates.

### Visual Presentation

1. **Grand total** in large text: "₹8.2L Total Realistic 5-Year Cost"
2. **Stacked proportion bar** showing tuition vs hostel vs mess vs materials breakdown
3. **Year-wise cards** (1st through 5th year) — scrollable horizontal
4. **"Verified by College"** badge for premium colleges that confirm their data
5. **Category filter** (General / OBC / SC / ST / Management / NRI) — fee changes based on selection

---

## 11. Admission & Cutoff Module

### Data Displayed

1. **Counseling system tag** — "TNEA" or "JoSAA" with link to respective hub page
2. **Eligibility criteria** — Minimum marks, exam requirements
3. **Cutoff sparkline chart** — 5-year trend for general category
4. **Category-wise cutoff grid** — General, OBC, SC, ST, EWS for latest year
5. **Round-wise data** (if available) — For TNEA: Round 1, 2, 3 cutoffs. For JoSAA: Round 1-6
6. **Seat matrix** — Total seats, category-wise distribution
7. **Important dates** — Application deadline, counseling dates (auto-linked from NATA/JEE hubs)

### Exam Hyperlinks to Hubs

When a college page shows "Accepted Exams: NATA", the NATA text links to `/nata-hub/` — the comprehensive NATA exam preparation and information page. Similarly, "JEE Main Paper 2" links to `/jee-barch-hub/`.

This creates a powerful internal linking network:
- College page → Exam Hub → College listings accepting that exam → Individual college pages
- This circular linking boosts SEO for all connected pages.

---

## 12. Review System

### Who Can Review

- **Any logged-in user** (Supabase Auth — phone OTP or email)
- Login required, no anonymous reviews

### Verification Levels

| Level | Method | Badge Shown | Priority |
|---|---|---|---|
| Basic | Phone OTP login | "Verified User" | Normal |
| Email Domain | .edu.in / .ac.in email | "Verified Student" | Higher |
| Enrollment Proof | ID card / admission letter upload | "Verified Enrollment" | Highest |
| LinkedIn | LinkedIn education history match | "LinkedIn Verified" | High |

### Rating Categories (Architecture-Specific)

1. **Overall Rating** (1-5, required)
2. Design Studio & Workshop Facilities
3. Faculty Quality
4. Campus & Hostel
5. Placements
6. Value for Money
7. Infrastructure
8. Competition & Exhibition Exposure
9. Site Visits & Field Trips
10. Software & Technology Access

### Review Content

- Title (optional, max 100 chars)
- Review text (required, min 50 chars, max 2000 chars)
- Pros (optional, text)
- Cons (optional, text)
- Reviewer year (dropdown: "1st Year", "2nd Year", ..., "Alumni 20XX")

### Moderation Pipeline

```
Review Submitted
      │
      ▼
┌─────────────┐
│ Auto-Filter  │  Profanity check, spam detection, AI-generated content detection
│ (Immediate)  │  
└──────┬──────┘
       │
   ┌───┴───┐
   │Pass   │Fail → Auto-reject with reason
   │       │
   ▼       
┌─────────────┐
│ Manual Queue │  Admin reviews within 24-48 hours
│ (Admin Panel)│  
└──────┬──────┘
       │
   ┌───┴───────┐
   │Approve    │Reject → Notify user with reason
   │           │
   ▼           
Published on college page
       │
       ▼ (College notified)
College can respond publicly (Silver+ tier)
```

### Admin Controls

- View all pending reviews in moderation queue
- Approve / Reject / Flag reviews
- Delete published reviews (with reason logged)
- View review analytics: total reviews per college, average rating trends, flagged reviews

### Incentive System (Optional)

- ₹200 for detailed review (min 200 words + ratings in all categories)
- ₹500 for video review
- Monthly leaderboard with top reviewer prizes
- All incentivized reviews labeled: "Incentivized Review" badge
- Incentives never conditional on positive sentiment

---

## 13. Comment / Q&A System

### How It Differs from Reviews

- **Reviews** = structured ratings + detailed feedback (one per user per college)
- **Comments** = informal Q&A discussion (unlimited, threaded)

### Features

- Threaded replies (one level deep)
- Ambassador replies highlighted with badge
- Login required to post
- Admin can delete any comment (reason logged)
- Auto-moderation: profanity filter
- Latest comments shown first
- "Load more" pagination (10 comments per load)
- Comments contribute to SEO (long-tail keyword content)

---

## 14. Student Ambassador Program

### Ambassador Sources

| Source | How They Join | Expected Volume |
|---|---|---|
| Neram Alumni | Neram admin reaches out to past coaching students | 100-200 initially |
| College-Provided | College uploads CSV via dashboard → students get opt-in WhatsApp | Varies per college |
| Self-Registered | Student finds college page → clicks "Become Ambassador" | Organic growth |

### Ambassador Lifecycle

```
1. INVITATION
   ├── Neram admin sends WhatsApp invitation
   ├── OR college uploads student CSV → system sends opt-in message
   └── OR student self-registers on college page

2. OPT-IN
   └── Student replies "YES" to WhatsApp opt-in message
       └── System creates ambassador record with opted_in = true

3. PROFILE SETUP (one-time, ~15 minutes)
   ├── Name, year, interest area, short bio
   ├── Answer 10 structured questions about their college
   │   (rate studio 1-5, rate hostel 1-5, tips for freshers, etc.)
   └── Choose which social handles to share (optional)

4. ONGOING ENGAGEMENT
   ├── Receive student questions via WhatsApp
   ├── Reply in WhatsApp (auto-posted to college Q&A)
   └── Response tracked: rate, time, quality

5. SEASONAL CONTRIBUTIONS (optional, paid)
   ├── ₹200: Update fee info at academic year start
   ├── ₹500: Record 2-min phone video campus tour
   └── ₹200: Write semester reflection post

6. RECOGNITION
   ├── Quarterly leaderboard (top 10 most helpful)
   ├── Small rewards (₹500 voucher)
   ├── "Neram Student Ambassador" LinkedIn certificate
   └── Notification when a student they helped enrolls
```

### WhatsApp Integration Flow

```
Prospective Student                    Neram Platform                     Ambassador
       │                                     │                                │
       │  Clicks "Ask a Question"            │                                │
       │  on college page                     │                                │
       │  ─────────────────────────────────▶  │                                │
       │                                     │  WhatsApp via Meta Cloud API    │
       │                                     │  ─────────────────────────────▶ │
       │                                     │  "Hi Priya! A student wants     │
       │                                     │   to know about studios at      │
       │                                     │   your college. Question: ..."  │
       │                                     │                                │
       │                                     │  Ambassador replies in WhatsApp │
       │                                     │  ◀───────────────────────────── │
       │                                     │                                │
       │  Notified: "Your question has       │                                │
       │  been answered!"                     │                                │
       │  ◀─────────────────────────────────  │                                │
       │                                     │                                │
       │  Answer posted on college Q&A       │                                │
       │  section as ambassador reply         │                                │
```

### Fallback When Ambassador Doesn't Reply

| Time Elapsed | Action |
|---|---|
| 0-24 hours | Wait for ambassador response |
| 24 hours | Route to next available ambassador for same college |
| 48 hours | If no ambassador responds, Aintra AI answers from college data (factual questions only) |
| 48+ hours | Mark as "Community Question" — any user can answer |

---

## 15. Lead Management & Lead Window System

### Lead Types

| Type | Trigger | Data Shared with College | When |
|---|---|---|---|
| **Soft Interest (Save)** | Student clicks "Save College" | Nothing — anonymous aggregate only | Always |
| **Hard Inquiry (Lead)** | Student clicks "I'm Interested" + consent | Name, phone, NATA/JEE score, city | Only during active Lead Window |

### Lead Window System

The Lead Window is controlled **entirely from admin.neramclasses.com**.

```
ADMIN PANEL → College Hub → Lead Windows

┌──────────────────────────────────────────────┐
│  LEAD WINDOW: TNEA 2026 Admission Cycle      │
│                                               │
│  Start Date: June 1, 2026                     │
│  End Date: September 30, 2026                 │
│  Applies to: TNEA counseling colleges         │
│  Tiers: Silver, Gold, Platinum                │
│                                               │
│  Status: [🟢 ACTIVE]  [Deactivate]           │
└──────────────────────────────────────────────┘
│
│  LEAD WINDOW: JoSAA 2026 Admission Cycle     │
│  Start Date: June 15, 2026                    │
│  End Date: October 15, 2026                   │
│  Status: [⚪ INACTIVE]  [Activate]            │
└──────────────────────────────────────────────┘
```

### What Colleges See at Different Times

**Outside Lead Window (Oct - May):**
- Dashboard shows: Total saves (aggregate), page views, geographic distribution
- **No student contact details visible**
- Message: "Lead forwarding will activate during the next admission cycle"

**During Lead Window (Jun - Sep, controlled by admin):**
- "I'm Interested" button appears on college pages
- Leads flow into college dashboard with: Name, Phone, Email, NATA/JEE Score, City, State
- Lead status tracking: New → Contacted → Interested → Applied → Enrolled
- Quota meter: "12 of 20 leads used this month" (Silver)
- Overage notification: "You've exceeded your monthly quota. Additional leads at ₹200 each."

### Lead Protection — Preventing Coaching Poaching

1. **Never identify leads as "Neram coaching students"** — they appear as "Neram Portal users"
2. **No coaching history shared** — college never knows if the student took Neram coaching
3. **Terms of Service clause:** Colleges agree not to use lead data for coaching marketing
4. **Lead Window limits exposure** to 3-4 months per year
5. **College blacklist:** Admin can instantly cut lead access if misuse detected

### Lead Quality Scoring

```typescript
function calculateLeadQuality(lead: LeadInput): number {
  let score = 5; // Base score
  
  if (lead.nataScore && lead.nataScore > 100) score += 2;
  if (lead.phone && isValidIndianPhone(lead.phone)) score += 1;
  if (lead.email) score += 1;
  if (lead.consentGiven) score += 1;
  
  // Penalize
  if (isDuplicatePhone(lead.phone)) score -= 3;
  
  return Math.min(10, Math.max(1, score));
}
```

---

## 16. AI Chat Agent (Aintra)

### Availability

- **Gold tier:** Standard Aintra agent trained on college's data
- **Platinum tier:** Customized Aintra with college branding

### Technical Implementation

```typescript
// Aintra Chat Agent — College-specific
// Uses Claude API with college data as context

async function getAintraResponse(collegeId: string, userQuestion: string) {
  const collegeData = await fetchCollegeData(collegeId); // All data from Supabase
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are Aintra, the AI assistant for ${collegeData.fullName} on Neram Architecture Portal.
        Answer student queries about this college using ONLY the provided data.
        If you don't have the information, say "I don't have that specific data yet. 
        You can ask a Student Ambassador or check the college's official website."
        Be helpful, concise, and student-friendly.
        Never make up information.
        
        College Data:
        ${JSON.stringify(collegeData)}`,
      messages: [{ role: 'user', content: userQuestion }],
    }),
  });
  
  return response;
}
```

### UI Component

- Floating action button (bottom-right) on Gold/Platinum college pages
- Opens chat overlay with:
  - College-branded header (name + "AI Assistant")
  - Welcome message with quick-action chips ("Fees?", "Hostel?", "Placements?")
  - Input field + send button
  - Typing indicator during API call
  - "This is an AI assistant. For verified information, contact the college directly." disclaimer

---

## 17. Virtual Campus Tour (360°)

### Implementation: Pannellum (Open Source)

```bash
npm install pannellum
```

### How It Works

1. **Image capture:** 360° photos taken with Insta360 camera or phone 360° app
2. **Upload:** College admin (Platinum) or Neram team uploads 360° equirectangular images to Supabase Storage
3. **Scene creation:** Admin defines scenes (Studio, Workshop, Library, Hostel) with hotspot links between them
4. **Rendering:** Pannellum renders the 360° viewer in-browser, works on mobile

### Admin Panel Controls for Virtual Tour

- Upload 360° images
- Define scenes and link them with hotspots
- Add text labels (e.g., "Design Studio A")
- Set starting scene and initial view angle
- Preview before publishing
- Publish / unpublish toggle

### Revenue: Offer as add-on service

- Neram team visits college, captures 360° photos: ₹15-30K per college
- OR college uploads their own images (Platinum self-service)

---

## 18. Admin Panel — College Hub Section

### Location: `admin.neramclasses.com/college-hub/`

### Navigation Structure

```
College Hub (admin sidebar section)
├── Dashboard              — Overview stats, pending actions
├── Colleges               — All colleges list, search, filter
│   └── [College Detail]   — Edit individual college data
├── Tier Management        — Assign/change tiers, view subscriptions
├── Lead Windows           — Create/activate/deactivate lead windows
├── Leads                  — Global lead view across all colleges
├── Reviews                — Moderation queue (pending/flagged)
├── Comments               — Comment moderation
├── Ambassadors            — All ambassadors, activity, payments
├── College Accounts       — Create/manage college login accounts
├── Analytics              — Platform-wide analytics
├── Scraping Pipeline      — Trigger scrapes, review extracted data
└── Settings               — Global configs (lead rates, tier prices)
```

### Key Admin Workflows

#### 1. Add a New College

```
Admin → Colleges → "Add College"
  → Enter basic info (name, location, type)
  → OR select from COA master list (pre-populated)
  → System generates slug
  → College created with tier = "free"
  → Admin can trigger data scrape from college website
  → Admin reviews scraped data, approves/edits
  → College page goes live on neramclasses.com
```

#### 2. Create College Admin Account

```
Admin → College Accounts → "Create Account"
  → Select college from dropdown
  → Enter admin's name, email, phone, designation
  → Select role (super_admin, admin, admission_officer, etc.)
  → System creates Supabase Auth account
  → System sends WhatsApp invite with login credentials
  → College admin logs in at neramclasses.com/college-dashboard/
```

#### 3. Assign/Change Premium Tier

```
Admin → Tier Management → Select college
  → Choose tier (Silver/Gold/Platinum)
  → Set subscription dates (start/end)
  → Set annual amount + any discount
  → Set lead quota and per-lead rate
  → Confirm → System updates college.tier
  → Features enable/disable instantly
  → College admin notified via WhatsApp
```

#### 4. Activate Lead Window

```
Admin → Lead Windows → "Create Window"
  → Name: "TNEA 2026 Admission Cycle"
  → Start: June 1, 2026
  → End: September 30, 2026
  → Applies to: TNEA colleges (or all)
  → Tiers: Silver, Gold, Platinum
  → Save → Toggle "Activate"
  → "I'm Interested" button now appears on eligible college pages
  → Leads start flowing to college dashboards
```

#### 5. Moderate Reviews

```
Admin → Reviews → "Pending" tab
  → See review content, college, user, verification level
  → Actions: Approve / Reject / Flag
  → If rejected: Select reason (spam, fake, inappropriate, off-topic)
  → Approved reviews immediately visible on college page
  → College admin notified of new review
```

#### 6. Manage Ambassadors

```
Admin → Ambassadors
  → View all ambassadors across colleges
  → See: Name, College, Response Rate, Active Status
  → Bulk actions: Invite from Neram student database
  → Payment tracking: Who's earned what, payment status
  → Leaderboard: Top ambassadors by response quality
```

---

## 19. College Dashboard (Login-Based)

### Location: `neramclasses.com/college-dashboard/`

### Access Flow

```
1. Admin creates account (admin panel)
2. College admin receives WhatsApp/email with credentials
3. College admin visits neramclasses.com/college-dashboard/
4. Logs in with email + password (Supabase Auth)
5. First login: Guided profile completion wizard
6. Subsequent logins: Dashboard home
```

### Dashboard Modules (by Tier)

| Module | Silver | Gold | Platinum |
|---|---|---|---|
| **Overview** | Views, saves, review count | + Lead count, response metrics | + Competitor benchmarking |
| **Profile Editor** | Edit text, fees, contact, 10 photos | + 25 photos, videos, faculty | + Unlimited media, branding |
| **Lead Management** | View leads, update status, export CSV | + Lead quality scores, filters | + Advanced analytics, auto-notifications |
| **Reviews** | View reviews | + Respond to reviews | + Review analytics, sentiment trends |
| **Ambassadors** | ✗ | Manage ambassadors, upload CSV | + Ambassador performance analytics |
| **Analytics** | Basic page views | + Geographic, score distribution | + Competitor comparison, conversion funnel |
| **Virtual Tour** | ✗ | ✗ | Upload & manage 360° tours |

### Profile Completion Wizard (First Login)

```
Step 1: Verify Basic Info
  → College name, location (pre-filled from admin data)
  → Confirm or edit

Step 2: Fee Structure
  → Year-wise fee input form
  → Category selector (General/OBC/SC/ST)

Step 3: Upload Photos
  → Drag-drop photo upload
  → Label each photo (Studio, Campus, Hostel, etc.)

Step 4: Faculty Information
  → Add key faculty members

Step 5: Placement Data
  → Highest/Avg/Median package
  → Top recruiters

Step 6: Contact & Social Media
  → Admission phone/email
  → YouTube, Instagram handles

Completion Meter: Shows 0-100% like LinkedIn profile strength
```

### Role-Based Access Control

| Role | Capabilities |
|---|---|
| **Super Admin** (Director/Registrar) | Full access including billing, tier info, all settings |
| **Admin** (IT/Marketing) | Profile editing, analytics, lead management |
| **Admission Officer** | Lead management, inquiry responses, review responses |
| **Faculty Coordinator** | Faculty profiles, course information only |
| **Viewer** | Dashboard analytics, report downloads only |

---

## 20. SEO & AEO Strategy

### On-Page SEO for College Pages

#### Title Tag Pattern
```
[College Short Name]: B.Arch Admission 2026, Fees, Placements, Cutoff, Ranking
```
Example: `NIT Trichy: B.Arch Admission 2026, Fees, Placements, Cutoff, Ranking`

**Important:** Year in title tag must be auto-updated annually.

#### Meta Description Pattern
```
Explore [Full Name] B.Arch 2026 — Fees (₹X-Y total), [Counseling] cutoff [value], 
placements (avg ₹X LPA), NIRF #N. Compare, read reviews, connect with students.
```

#### JSON-LD Structured Data (per college page)

```json
{
  "@context": "https://schema.org",
  "@type": "CollegeOrUniversity",
  "name": "National Institute of Technology, Tiruchirappalli",
  "alternateName": "NIT Trichy",
  "url": "https://neramclasses.com/colleges/tamil-nadu/nit-trichy/",
  "logo": "...",
  "image": "...",
  "description": "...",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Tanjore Main Road, National Highway 67",
    "addressLocality": "Tiruchirappalli",
    "addressRegion": "Tamil Nadu",
    "postalCode": "620015",
    "addressCountry": "IN"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 10.7604,
    "longitude": 78.8145
  },
  "foundingDate": "1964",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.3",
    "reviewCount": "47",
    "bestRating": "5"
  },
  "hasCredential": [
    {
      "@type": "EducationalOccupationalCredential",
      "credentialCategory": "NAAC",
      "recognizedBy": { "@type": "Organization", "name": "NAAC" },
      "description": "A++ Grade"
    }
  ]
}
```

Plus **FAQPage** schema with 15-20 FAQs per college:
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the total fee for B.Arch at NIT Trichy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The total realistic 5-year cost for B.Arch at NIT Trichy is approximately ₹9.1 lakhs including tuition, hostel, mess, and estimated material costs."
      }
    }
  ]
}
```

### AEO (AI Engine Optimization)

1. **Extend existing llms.txt** to include college hub sitemap
2. **Allow AI crawlers** (already configured in robots.txt)
3. **Structured, scannable content** — AI models prefer well-organized data with clear headings
4. **Comprehensive FAQ sections** — AI engines directly quote FAQ answers
5. **Published methodology** for ArchIndex — transparency builds AI citation trust
6. **Regular content freshness** — update cutoff data annually, fee data annually

### Programmatic SEO Pages

Auto-generate high-value pages targeting long-tail keywords:

```
/colleges/tamil-nadu/                           → "Architecture colleges in Tamil Nadu"
/colleges/tamil-nadu/government/                → "Government B.Arch colleges in Tamil Nadu"
/colleges/tnea/                                  → "B.Arch colleges under TNEA counseling"
/colleges/fees/below-5-lakhs/                    → "B.Arch colleges under 5 lakhs total fee"
/colleges/fees/below-3-lakhs/                    → "Cheapest architecture colleges in India"
/colleges/nata-accepting/                        → "Colleges accepting NATA score"
/colleges/rankings/nirf/                         → "NIRF ranked architecture colleges"
/colleges/rankings/archindex/                    → "Best architecture colleges ranked by ArchIndex"
/colleges/[state]/[district]/                    → "Architecture colleges in [district]"
/blog/top-10-architecture-colleges-tamil-nadu/  → Blog + internal links
/blog/nata-cutoff-2026-college-wise/            → Annually updated guide
```

### Content Strategy

| Content Type | Frequency | SEO Target |
|---|---|---|
| Individual college pages | One-time + annual update | "[College Name] B.Arch" queries |
| State listing pages | Auto-generated, updated with new colleges | "Architecture colleges in [state]" |
| Counseling guide pages | Annual | "TNEA B.Arch counseling 2026" |
| Fee comparison pages | Annual | "B.Arch college fees comparison" |
| Blog: Top 10 lists | Quarterly | "Best architecture colleges in [state/India]" |
| Blog: Cutoff analysis | Post-counseling | "TNEA B.Arch cutoff 2026 analysis" |
| Blog: Hidden gems | Quarterly | "Underrated architecture colleges" |

---

## 21. NATA Hub & JEE B.Arch Hub Integration

### NATA Hub (`/nata-hub/`)

Comprehensive pillar page covering:
- What is NATA
- NATA 2026 exam dates, syllabus, pattern
- NATA preparation tips (links to Neram coaching)
- NATA score calculator
- **List of all colleges accepting NATA** — each linked to college page
- NATA cutoff trends by college
- NATA study materials (links to Neram resources)

### JEE B.Arch Hub (`/jee-barch-hub/`)

Same structure for JEE Main Paper 2 (B.Arch):
- Exam info, dates, syllabus
- **JoSAA counseling guide**
- **All colleges under JoSAA for B.Arch** — linked to college pages
- JEE B.Arch cutoff trends
- Links to Neram's JEE B.Arch question bank

### Bidirectional Linking

```
NATA Hub ←→ College Pages (NATA-accepting)
JEE Hub ←→ College Pages (JEE-accepting)
College Page ←→ Both hubs (via exam badges)
Listing Pages ←→ Individual College Pages
Blog Posts ←→ College Pages + Hubs
```

This creates a dense internal linking graph that boosts SEO authority for all pages.

---

## 22. ArchIndex — Proprietary Rating System

### Score: 0-100

### Methodology (Published Transparently)

| Factor | Weight | Source |
|---|---|---|
| Design Studio Quality | 25% | Student reviews (studio rating) + infrastructure data |
| Faculty & Practice | 20% | Faculty count, practicing architect ratio, qualifications |
| Placements & Career Outcomes | 20% | Placement rate, average package, recruiter quality |
| Infrastructure & Facilities | 15% | Workshop count, software, digital fab, library |
| Student Satisfaction | 10% | Overall review score, review count |
| Alumni Network & Recognition | 10% | Notable alumni, competition wins, external rankings |

### Calculation

```typescript
function calculateArchIndex(college: CollegeData): number {
  const studioScore = (college.reviews?.design_studio_rating || 3) / 5 * 100;
  const facultyScore = calculateFacultyScore(college.faculty);
  const placementScore = calculatePlacementScore(college.placements);
  const infraScore = calculateInfraScore(college.infrastructure);
  const satisfactionScore = (college.reviews?.overall_rating || 3) / 5 * 100;
  const alumniScore = calculateAlumniScore(college); // Based on available data
  
  return Math.round(
    studioScore * 0.25 +
    facultyScore * 0.20 +
    placementScore * 0.20 +
    infraScore * 0.15 +
    satisfactionScore * 0.10 +
    alumniScore * 0.10
  );
}
```

### Display

- ArchIndex ring on every college card and page (SVG animated ring)
- Color-coded: Green (85+), Teal (70-84), Gold (50-69), Red (<50)
- Methodology page at `/colleges/archindex-methodology/`

---

## 23. Badge System

### Official Badges (Auto-populated from data)

| Badge | Condition | Visual |
|---|---|---|
| COA Approved | `coa_approved = true` | Green pill |
| NAAC A++ / A+ / A / B++ | Based on `naac_grade` | Blue pill |
| NBA Accredited | `nba_accredited = true` | Blue pill |
| NIRF #N | Has `nirf_rank` | Orange pill |

### Neram Badges (Platform-assigned)

| Badge | Condition | Visual |
|---|---|---|
| ✓ Verified | College claimed + Neram verified | Teal checkmark |
| ✓ Silver / Gold / Platinum | Based on tier | Tier-colored badge |
| 🏆 Best Value B.Arch | High ArchIndex + Low fees (calculated) | Gold star |
| ⭐ Top Rated | Review score > 4.2 + min 20 reviews | Star badge |
| 🔥 Trending | High view growth month-over-month | Fire badge |
| 🎓 Neram Alumni Present | Has active student ambassadors from Neram | Teal badge |

---

## 24. Social Media & YouTube Integration

### YouTube

- Use YouTube Data API v3 to fetch latest 3-4 videos from college's channel
- Embed directly on college page in "Official Channels" section
- Auto-refresh weekly (Supabase cron or Edge Function)
- If no YouTube channel: show placeholder "No YouTube channel linked"

### Instagram

- Show Instagram handle as link (no embed — Instagram API is restrictive)
- Optional: Use Instagram Basic Display API for latest posts (requires college consent)

### College Website

- Direct link to official website
- "Download Brochure" button if PDF URL available

---

## 25. Revenue Model & Pricing

### Subscription Tiers

| Tier | Annual Price | Lead Quota | Per-Lead Overage | Target Colleges |
|---|---|---|---|---|
| Free | ₹0 | None | N/A | All 470+ colleges |
| Silver | ₹30,000 - ₹50,000 | 20/month | ₹200/lead | Small private colleges |
| Gold | ₹75,000 - ₹1,50,000 | 50/month | ₹150/lead | Mid-size private, aided |
| Platinum | ₹2,00,000 - ₹5,00,000 | Unlimited | ₹100/lead | Large private, deemed |

### Additional Revenue

| Service | Price | Description |
|---|---|---|
| Virtual tour creation | ₹15,000 - ₹30,000 | Neram team visits, creates 360° tour |
| Sponsored blog post | ₹5,000 - ₹15,000 | Featured article about the college |
| Featured listing | ₹10,000/month | Top position in state/national listing |
| CPS (Cost Per Student) | ₹5,000 - ₹15,000 | Commission on confirmed enrollment |

### Sales Strategy

**Phase 1 (Months 1-3):** Build all college pages with public data. Generate organic traffic through SEO.

**Phase 2 (Months 3-6):** Email/WhatsApp admission heads with traffic data: "Your college page received 342 views. Want to see who's interested?" Offer 30-day free Gold trial with 5-10 real leads.

**Phase 3 (Months 6-12):** Present ROI case studies. Offer early-adopter 25% discount. Close 30-50 paying colleges.

---

## 26. Implementation Phases & Timeline

### Phase 1 — Foundation (Weeks 1-4)

| Week | Tasks |
|---|---|
| Week 1 | Database schema creation in Supabase. URL routing setup in Next.js. Basic college page template component. |
| Week 2 | Data scraping pipeline for COA + TNEA + NIRF + NAAC. Populate all TN B.Arch colleges (~55-60). |
| Week 3 | College page template: Hero, badges, fee breakdown, cutoff sparkline, placements, infrastructure. Listing page with filters. |
| Week 4 | SEO: Schema markup, meta tags, FAQ sections, sitemap, llms.txt update. Mobile responsive testing. Deploy to Vercel. |

**Deliverable:** All TN B.Arch colleges live on neramclasses.com/colleges/ with public data, fully SEO-optimized.

### Phase 2 — Engagement Features (Weeks 5-8)

| Week | Tasks |
|---|---|
| Week 5 | Review system: submission form, moderation queue in admin panel, display on college pages. |
| Week 6 | Comment/Q&A system. "Save College" functionality. Comparison tool. |
| Week 7 | JoSAA colleges data scraping + page generation (~30-35 colleges). NATA Hub + JEE Hub pillar pages. |
| Week 8 | Admin panel: College Hub section — colleges list, individual college editor, tier management, review moderation. |

**Deliverable:** ~90 colleges live. Reviews, comments, comparison, exam hubs functional.

### Phase 3 — Monetization & College Dashboard (Weeks 9-12)

| Week | Tasks |
|---|---|
| Week 9 | Premium tier system: Feature gating logic in template. Verified badges. Search position boosting. |
| Week 10 | College admin account creation workflow. College dashboard: login, profile editor, analytics. |
| Week 11 | Lead window system. Lead management panel (admin + college dashboard). "I'm Interested" flow with consent. |
| Week 12 | Aintra AI chat agent integration (Claude API). Ambassador program: WhatsApp integration, profile setup, query routing. |

**Deliverable:** Full freemium system live. Colleges can log in, edit profiles, view leads. Revenue generation begins.

### Phase 4 — Scale & Optimize (Weeks 13-16)

| Week | Tasks |
|---|---|
| Week 13 | Virtual tour (Pannellum) integration. Photo gallery management. |
| Week 14 | Expand to remaining states (Phase 2 target: Karnataka, Maharashtra, Kerala, AP/Telangana). |
| Week 15 | Programmatic SEO pages (fee-based listings, district-wise, counseling-wise). Blog content pipeline. |
| Week 16 | Analytics dashboards (admin + college). ArchIndex calculation and display. Competitor benchmarking (Platinum). |

**Deliverable:** National coverage begins. Full feature set live. Sales outreach to colleges starts.

---

## 27. Security & Privacy Considerations

### Data Privacy (DPDPA 2023 Compliance)

1. **Student consent for lead sharing:** Clear disclosure + explicit opt-in before "I'm Interested"
2. **Ambassador opt-in:** No student listed without explicit WhatsApp consent
3. **College data:** Public data used freely. College-submitted data belongs to the college
4. **Right to deletion:** Students can delete reviews, remove saved colleges, revoke lead consent
5. **Data retention:** Leads older than 2 years auto-archived

### Authentication

- **Student users:** Supabase Auth (phone OTP / email — existing setup)
- **College admins:** Separate Supabase Auth flow with email + password (accounts created by Neram admin)
- **Neram admins:** Existing admin auth on admin.neramclasses.com

### Row Level Security

- All college data publicly readable (no auth for viewing)
- Write operations require authentication
- College admins can only access their own college's data
- Neram admin uses service role key for full access

### Rate Limiting

- Review submission: Max 1 review per user per college
- Comment submission: Max 10 comments per user per day
- Lead submission: Max 1 per user per college per lead window
- API calls (Aintra): Rate-limited per college per hour

---

## Appendix A: Related Existing Documentation

These existing spec files in the Neram codebase provide context for integration:

- `CLAUDE.md` — Claude Code context for the Neram monorepo
- `NEXUS_SPEC.md` — Nexus classroom PWA spec (student auth, Microsoft integration)
- `DRAWING_MODULE_SPEC.md` — Drawing practice module spec
- `NATA_RECALLED_PAPERS_PLAN.md` — NATA recalled papers planning
- `IMPLEMENT-TESTING-INFRA.md` — Playwright testing infrastructure

## Appendix B: Key Third-Party Libraries

| Library | Purpose | Install |
|---|---|---|
| `recharts` | Sparkline charts, placement charts | `npm install recharts` |
| `pannellum` | 360° virtual tour viewer | `npm install pannellum` |
| `react-pannellum` | React wrapper for Pannellum | `npm install react-pannellum` |
| `papaparse` | CSV parsing for college data import | `npm install papaparse` |
| `sharp` | Image optimization for college photos | Already in Next.js |

## Appendix C: Environment Variables Required

```env
# College Hub specific
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=         # For map embeds and Street View
YOUTUBE_DATA_API_KEY=                     # For fetching college YouTube videos
ANTHROPIC_API_KEY=                        # For Aintra AI chat agent (Claude API)

# Existing (already configured)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_BUSINESS_API_TOKEN=              # Meta Cloud API for ambassador notifications
```

---

*This document serves as the single source of truth for the Neram College Hub implementation. All design decisions, data models, feature specifications, and implementation priorities are captured here. Update this document as decisions evolve during development.*
