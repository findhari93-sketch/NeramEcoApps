# Neram Classes - Claude Code Execution Guide

> **IMPORTANT**: Share this file with Claude Code in VS Code to execute the complete setup and implementation.

## 📋 Project Overview

**Project Name**: Neram Classes - NATA & JEE Paper 2 Coaching Platform

**Domain**: neramclasses.com (GoDaddy)

**Apps to Build**:
1. `neramclasses.com` - Marketing/SEO site (Multilingual: EN, TA, HI, KN, ML)
2. `app.neramclasses.com` - Tools App + PWA (Firebase Auth)
3. `nexus.neramclasses.com` - Student Classroom (Microsoft Auth)
4. `admin.neramclasses.com` - Admin Panel (Microsoft Auth)

**Tech Stack**:
- Framework: Next.js 14+ (App Router)
- UI: Material UI v5
- Database: Supabase (PostgreSQL)
- Auth: Firebase (Tools App) + Microsoft Entra ID (Classroom/Admin)
- Payments: Razorpay + UPI (screenshot upload)
- Email: Resend
- Deployment: Vercel
- Monorepo: Turborepo + pnpm

---

## 🔐 Credentials & Configuration

> **USER ACTION REQUIRED**: Fill in these values before sharing with Claude.

### Supabase
```
SUPABASE_PROJECT_REF=<your-project-ref>
SUPABASE_PROJECT_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Firebase (Create at https://console.firebase.google.com)
```
FIREBASE_PROJECT_ID=<your-firebase-project-id>
FIREBASE_API_KEY=<your-api-key>
FIREBASE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
```

### Microsoft Azure (Create at https://portal.azure.com)
```
AZURE_AD_TENANT_ID=<your-tenant-id>
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>
```

### Razorpay (Create at https://dashboard.razorpay.com)
```
RAZORPAY_KEY_ID=<your-key-id>
RAZORPAY_KEY_SECRET=<your-key-secret>
```

### Resend (Create at https://resend.com)
```
RESEND_API_KEY=<your-api-key>
```

### Tawk.to (Create at https://tawk.to)
```
TAWK_PROPERTY_ID=<your-property-id>
TAWK_WIDGET_ID=<your-widget-id>
```

---

## 🎯 Execution Tasks for Claude

### PHASE 1: Environment Setup

**Task 1.1: Verify and Install Dependencies**
```
Check if these CLIs are installed, if not install them:
- pnpm (npm install -g pnpm)
- vercel (npm install -g vercel)
- supabase (npm install -g supabase)
- firebase-tools (npm install -g firebase-tools)

Then run: pnpm install
```

**Task 1.2: Create Environment File**
```
Create .env.local file with all the credentials provided above.
Also create .env.local files in each app directory (apps/marketing, apps/app, apps/nexus, apps/admin) that reference the root env or have app-specific variables.
```

**Task 1.3: Link Supabase Project**
```
Run: supabase link --project-ref <SUPABASE_PROJECT_REF>
```

---

### PHASE 2: Database Setup (Supabase)

**Task 2.1: Create Database Schema**

Create and execute the following SQL migrations in order:

```sql
-- Migration 001: Enums
CREATE TYPE user_type AS ENUM ('lead', 'student', 'teacher', 'admin');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'active', 'inactive');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded');
CREATE TYPE application_source AS ENUM ('website_form', 'app', 'referral', 'manual');
CREATE TYPE course_type AS ENUM ('nata', 'jee_paper2', 'both', 'revit');
CREATE TYPE exam_type AS ENUM ('NATA', 'JEE_PAPER_2', 'BOTH');

-- Migration 002: Users table (unified identity)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  avatar_url TEXT,
  
  -- External auth identifiers
  firebase_uid TEXT UNIQUE,
  ms_oid TEXT UNIQUE,
  google_id TEXT UNIQUE,
  
  -- Status
  user_type user_type DEFAULT 'lead',
  status user_status DEFAULT 'pending',
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  
  -- Preferences
  preferred_language TEXT DEFAULT 'en',
  
  -- Metadata
  last_login_at TIMESTAMPTZ,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 003: Lead profiles (application forms)
CREATE TABLE lead_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Source tracking
  source application_source DEFAULT 'website_form',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referral_code TEXT,
  
  -- Application data
  interest_course course_type,
  qualification TEXT,
  school_college TEXT,
  city TEXT,
  state TEXT,
  
  -- Full application form data
  application_data JSONB,
  
  -- Admin review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  rejection_reason TEXT,
  
  -- Fee assignment
  assigned_fee DECIMAL(10,2),
  discount_amount DECIMAL(10,2) DEFAULT 0,
  coupon_code TEXT,
  final_fee DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 004: Courses
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  short_description TEXT,
  
  course_type course_type NOT NULL,
  duration_months INTEGER,
  total_lessons INTEGER DEFAULT 0,
  
  -- Pricing
  regular_fee DECIMAL(10,2) NOT NULL,
  discounted_fee DECIMAL(10,2),
  discount_valid_until TIMESTAMPTZ,
  
  -- Content
  syllabus TEXT,
  features TEXT[],
  
  -- SEO
  meta_title JSONB, -- {en: '', ta: '', hi: '', kn: '', ml: ''}
  meta_description JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 005: Batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  course_id UUID REFERENCES courses(id),
  
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Microsoft Teams
  ms_team_id TEXT,
  ms_team_name TEXT,
  
  -- Capacity
  capacity INTEGER DEFAULT 30,
  enrolled_count INTEGER DEFAULT 0,
  
  -- Schedule
  schedule JSONB, -- [{day: 'Monday', start_time: '10:00', end_time: '12:00'}]
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 006: Student profiles
CREATE TABLE student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Enrollment
  enrollment_date DATE DEFAULT CURRENT_DATE,
  batch_id UUID REFERENCES batches(id),
  course_id UUID REFERENCES courses(id),
  
  -- Microsoft Teams
  ms_teams_id TEXT,
  ms_teams_email TEXT,
  
  -- Payment
  payment_status payment_status DEFAULT 'pending',
  total_fee DECIMAL(10,2),
  fee_paid DECIMAL(10,2) DEFAULT 0,
  fee_due DECIMAL(10,2),
  next_payment_date DATE,
  
  -- Progress
  lessons_completed INTEGER DEFAULT 0,
  assignments_completed INTEGER DEFAULT 0,
  total_watch_time INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  
  -- Contacts
  parent_contact TEXT,
  emergency_contact TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 007: Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  student_profile_id UUID REFERENCES student_profiles(id),
  lead_profile_id UUID REFERENCES lead_profiles(id),
  
  -- Amount
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  
  -- Payment method
  payment_method TEXT, -- 'razorpay', 'upi_screenshot', 'bank_transfer'
  
  -- Razorpay
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  
  -- UPI Screenshot
  screenshot_url TEXT,
  screenshot_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  
  -- Status
  status payment_status DEFAULT 'pending',
  
  -- Receipt
  receipt_number TEXT UNIQUE,
  receipt_url TEXT,
  
  -- Details
  description TEXT,
  metadata JSONB,
  
  -- Error tracking
  failure_code TEXT,
  failure_reason TEXT,
  
  paid_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 008: Colleges (for tools)
CREATE TABLE colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Location
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT,
  pincode TEXT,
  
  -- Classification
  type TEXT, -- 'government', 'private', 'deemed'
  affiliation TEXT,
  established_year INTEGER,
  
  -- Courses
  courses_offered TEXT[],
  intake_capacity INTEGER,
  
  -- Rankings
  nirf_rank INTEGER,
  rating DECIMAL(2,1),
  
  -- Fees
  annual_fee_min DECIMAL(10,2),
  annual_fee_max DECIMAL(10,2),
  
  -- Contact
  website TEXT,
  email TEXT,
  phone TEXT,
  
  -- Content
  description TEXT,
  facilities TEXT[],
  
  -- Media
  logo_url TEXT,
  images TEXT[],
  
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 009: Cutoff data
CREATE TABLE cutoff_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID REFERENCES colleges(id) ON DELETE CASCADE,
  
  year INTEGER NOT NULL,
  exam_type exam_type NOT NULL,
  round INTEGER DEFAULT 1,
  
  -- Category cutoffs
  general_cutoff DECIMAL(5,2),
  obc_cutoff DECIMAL(5,2),
  sc_cutoff DECIMAL(5,2),
  st_cutoff DECIMAL(5,2),
  ews_cutoff DECIMAL(5,2),
  
  -- Quota cutoffs
  state_quota_cutoff DECIMAL(5,2),
  all_india_cutoff DECIMAL(5,2),
  
  -- Seats
  seats_filled INTEGER,
  total_seats INTEGER,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 010: Exam centers
CREATE TABLE exam_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  
  -- Location
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT,
  
  -- Coordinates
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  
  -- Exam types
  exam_types exam_type[],
  
  -- Details
  capacity INTEGER,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  facilities TEXT[],
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 011: Tool usage logs
CREATE TABLE tool_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  session_id TEXT,
  
  tool_name TEXT NOT NULL,
  
  input_data JSONB,
  result_data JSONB,
  
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  
  execution_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 012: Email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  subject JSONB NOT NULL, -- {en: '', ta: '', ...}
  body_html JSONB NOT NULL,
  body_text JSONB,
  
  variables TEXT[], -- Required variables
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 013: Email logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id),
  user_id UUID REFERENCES users(id),
  
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  
  resend_id TEXT,
  error_message TEXT,
  
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 014: Coupons
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  
  discount_type TEXT NOT NULL, -- 'percentage', 'fixed'
  discount_value DECIMAL(10,2) NOT NULL,
  
  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  
  -- Usage limits
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  
  -- Restrictions
  applicable_courses course_type[],
  min_amount DECIMAL(10,2),
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 015: Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_ms_oid ON users(ms_oid);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_user_type ON users(user_type);

CREATE INDEX idx_lead_profiles_user_id ON lead_profiles(user_id);
CREATE INDEX idx_lead_profiles_status ON lead_profiles(user_id) WHERE reviewed_at IS NULL;

CREATE INDEX idx_student_profiles_user_id ON student_profiles(user_id);
CREATE INDEX idx_student_profiles_batch_id ON student_profiles(batch_id);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE INDEX idx_colleges_state ON colleges(state);
CREATE INDEX idx_colleges_city ON colleges(city);

CREATE INDEX idx_cutoff_data_college_id ON cutoff_data(college_id);
CREATE INDEX idx_cutoff_data_year ON cutoff_data(year);

CREATE INDEX idx_exam_centers_state ON exam_centers(state);
CREATE INDEX idx_exam_centers_city ON exam_centers(city);

-- Migration 016: Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for tools data
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutoff_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON colleges FOR SELECT USING (is_active = true);
CREATE POLICY "Public read access" ON cutoff_data FOR SELECT USING (true);
CREATE POLICY "Public read access" ON exam_centers FOR SELECT USING (is_active = true);
CREATE POLICY "Public read access" ON courses FOR SELECT USING (is_active = true);

-- Users can read their own data
CREATE POLICY "Users read own data" ON users FOR SELECT USING (auth.uid()::text = firebase_uid OR auth.uid()::text = ms_oid);
CREATE POLICY "Users update own data" ON users FOR UPDATE USING (auth.uid()::text = firebase_uid OR auth.uid()::text = ms_oid);

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON lead_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON student_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON payments FOR ALL USING (auth.role() = 'service_role');

-- Migration 017: Functions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_lead_profiles_updated_at BEFORE UPDATE ON lead_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_student_profiles_updated_at BEFORE UPDATE ON student_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_colleges_updated_at BEFORE UPDATE ON colleges FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migration 018: Generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.receipt_number IS NULL THEN
    NEW.receipt_number = 'NRM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('receipt_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;
CREATE TRIGGER generate_receipt_number_trigger BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION generate_receipt_number();
```

**Task 2.2: Seed Initial Data**

```sql
-- Seed courses
INSERT INTO courses (name, slug, course_type, duration_months, regular_fee, discounted_fee, short_description, features, is_featured, display_order) VALUES
('NATA Preparation', 'nata-preparation', 'nata', 6, 25000, 22000, 'Complete preparation for National Aptitude Test in Architecture', ARRAY['Live online classes', 'Drawing & sketching practice', 'Mock tests with feedback', 'Study materials included', 'Doubt clearing sessions'], true, 1),
('JEE Paper 2 Preparation', 'jee-paper2-preparation', 'jee_paper2', 8, 30000, 27000, 'Focused coaching for JEE Main Paper 2 (B.Arch/B.Planning)', ARRAY['Math & aptitude coaching', 'Drawing techniques', 'Previous year solutions', 'Doubt clearing sessions', 'Weekly tests'], true, 2),
('NATA + JEE Combined', 'nata-jee-combined', 'both', 10, 45000, 40000, 'Best value package for both exams', ARRAY['All NATA features', 'All JEE Paper 2 features', 'Combined study plan', 'Maximum practice', 'Priority support'], true, 3),
('Revit Architecture', 'revit-architecture', 'revit', 2, 10000, 8000, 'Learn industry-standard BIM software', ARRAY['Hands-on projects', 'Industry workflows', 'Certificate provided', 'Portfolio building'], false, 4);

-- Seed email templates
INSERT INTO email_templates (name, slug, subject, body_html, variables) VALUES
('Application Received', 'application-received', 
  '{"en": "Application Received - Neram Classes", "ta": "விண்ணப்பம் பெறப்பட்டது - நேரம் வகுப்புகள்"}',
  '{"en": "<h1>Thank you for your application!</h1><p>Dear {{name}},</p><p>We have received your application for {{course}}. Our team will review it and get back to you within 24-48 hours.</p>", "ta": "<h1>உங்கள் விண்ணப்பத்திற்கு நன்றி!</h1><p>அன்புள்ள {{name}},</p><p>{{course}} க்கான உங்கள் விண்ணப்பத்தைப் பெற்றோம்.</p>"}',
  ARRAY['name', 'course']),
  
('Application Approved', 'application-approved',
  '{"en": "Congratulations! Your Application is Approved - Neram Classes", "ta": "வாழ்த்துக்கள்! உங்கள் விண்ணப்பம் அங்கீகரிக்கப்பட்டது"}',
  '{"en": "<h1>Your application has been approved!</h1><p>Dear {{name}},</p><p>We are pleased to inform you that your application for {{course}} has been approved.</p><p><strong>Fee Details:</strong></p><p>Course Fee: ₹{{fee}}</p><p>Discount: ₹{{discount}}</p><p>Final Amount: ₹{{final_amount}}</p><p><a href=\"{{payment_link}}\">Click here to complete payment</a></p>", "ta": "..."}',
  ARRAY['name', 'course', 'fee', 'discount', 'final_amount', 'payment_link']),

('Application Rejected', 'application-rejected',
  '{"en": "Application Update - Neram Classes", "ta": "விண்ணப்ப புதுப்பிப்பு"}',
  '{"en": "<h1>Application Update</h1><p>Dear {{name}},</p><p>We regret to inform you that your application could not be approved at this time.</p><p><strong>Reason:</strong> {{reason}}</p><p>If you have any questions, please contact us.</p>", "ta": "..."}',
  ARRAY['name', 'reason']),

('Payment Confirmed', 'payment-confirmed',
  '{"en": "Payment Confirmed - Welcome to Neram Classes!", "ta": "பணம் செலுத்தப்பட்டது - நேரம் வகுப்புகளுக்கு வரவேற்கிறோம்!"}',
  '{"en": "<h1>Welcome to Neram Classes!</h1><p>Dear {{name}},</p><p>Your payment of ₹{{amount}} has been confirmed.</p><p><strong>Receipt Number:</strong> {{receipt_number}}</p><p><strong>Course:</strong> {{course}}</p><p><strong>Batch:</strong> {{batch}}</p><p>You will receive your Microsoft Teams login credentials shortly.</p>", "ta": "..."}',
  ARRAY['name', 'amount', 'receipt_number', 'course', 'batch']);
```

**Task 2.3: Generate TypeScript Types**
```
Run: pnpm db:generate
This will update packages/database/src/types/supabase.ts with actual types from database.
```

---

### PHASE 3: Firebase Setup

**Task 3.1: Initialize Firebase**
```
Run: firebase init

Select:
- Authentication
- Hosting (if needed for any static assets)

Choose existing project or create new one.
```

**Task 3.2: Enable Authentication Methods in Firebase Console**
1. Go to Firebase Console → Authentication → Sign-in method
2. Enable:
   - Email/Password
   - Google
   - Phone

**Task 3.3: Configure Firebase in the project**
Update `.env.local` with Firebase credentials.

---

### PHASE 4: Create Apps

**Task 4.1: Create Marketing Site (apps/marketing)**

Create a Next.js app with:
- App Router
- Static Site Generation (SSG) for SEO
- Multilingual routing (/en, /ta, /hi, /kn, /ml)
- Pages:
  - Home (/)
  - About (/about)
  - Courses (/courses, /courses/[slug])
  - Tools landing pages (/tools/cutoff-calculator, /tools/college-predictor, /tools/exam-centers)
  - Blog (/blog, /blog/[slug])
  - Contact (/contact)
  - Application Form (/apply)
- Tawk.to chat widget integration
- SEO optimized with proper meta tags, structured data

**Task 4.2: Create Tools App (apps/app)**

Create a Next.js PWA with:
- App Router
- Firebase Authentication (Email/Google + Phone OTP)
- Phone verification modal (non-closable on specific tools)
- Tools:
  - NATA Cutoff Calculator
  - College Predictor
  - Exam Center Locator
- Application Form (with Google Auth quick fill)
- PWA manifest for Android installation
- Offline support for tool data

**Task 4.3: Create Admin Panel (apps/admin)**

Create a Next.js app with:
- App Router
- Microsoft Entra ID Authentication
- Dashboard with stats
- Lead Management:
  - View all applications
  - Filter by status (pending/approved/rejected)
  - Review application details
  - Set fee structure (course, base fee, coupon, discount)
  - Approve/Reject with email notification
- Payment Management:
  - View payments
  - Verify UPI screenshots
  - Confirm payments
  - Generate receipts
- Student Management:
  - View enrolled students
  - Manage batches
- Content Management:
  - Courses
  - Colleges data
  - Cutoff data
  - Exam centers
  - Blog posts
- Settings

**Task 4.4: Create Classroom App (apps/nexus)**

Create a Next.js app with:
- App Router
- Microsoft Entra ID Authentication
- Student Dashboard
- Course content
- MS Teams integration
- Payment portal
- Progress tracking

---

### PHASE 5: Application Form & Enrollment Flow

**Task 5.1: Application Form Component**

Create a multi-step form:
1. **Step 1**: Google Auth (get email) OR manual email entry
2. **Step 2**: Personal Details (name, phone, DOB, gender)
3. **Step 3**: Education (qualification, school/college, city, state)
4. **Step 4**: Course Selection
5. **Step 5**: Review & Submit

On submit:
- Create user in Supabase
- Create lead_profile
- Send confirmation email
- Redirect to app.neramclasses.com for phone verification

**Task 5.2: Admin Review Flow**

In admin panel:
1. Show pending applications
2. Click to view full details
3. Admin can:
   - View all submitted info
   - Select course
   - Set fee amount
   - Apply coupon code
   - Calculate final amount
   - Add admin notes
   - Approve or Reject

On Approve:
- Update user status
- Send approval email with payment link
- Create payment record with pending status

On Reject:
- Update user status
- Send rejection email with reason

**Task 5.3: Payment Flow**

Two options:
1. **Razorpay**: Standard checkout flow
2. **UPI Screenshot**:
   - Show UPI ID to pay
   - User uploads screenshot
   - Admin verifies in panel
   - Admin confirms payment

On payment confirmation:
- Update payment status
- Generate receipt number
- Create student_profile
- Create MS Teams account (via Graph API)
- Send welcome email with credentials

---

### PHASE 6: Deployment

**Task 6.1: Deploy to Vercel**
```
# Login to Vercel
vercel login

# Deploy each app
cd apps/marketing && vercel --prod
cd apps/app && vercel --prod
cd apps/admin && vercel --prod
cd apps/nexus && vercel --prod
```

**Task 6.2: Configure Domains in Vercel**
1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add domains:
   - neramclasses.com → marketing app
   - app.neramclasses.com → app
   - admin.neramclasses.com → admin
   - nexus.neramclasses.com → nexus

**Task 6.3: Update GoDaddy DNS**
Add CNAME records pointing to cname.vercel-dns.com

---

## 📁 File Structure to Create

```
neram-ecosystem/
├── apps/
│   ├── marketing/
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── page.tsx (Home)
│   │   │   │   ├── about/page.tsx
│   │   │   │   ├── courses/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [slug]/page.tsx
│   │   │   │   ├── tools/
│   │   │   │   │   ├── cutoff-calculator/page.tsx
│   │   │   │   │   ├── college-predictor/page.tsx
│   │   │   │   │   └── exam-centers/page.tsx
│   │   │   │   ├── apply/page.tsx
│   │   │   │   ├── blog/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [slug]/page.tsx
│   │   │   │   └── contact/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Hero.tsx
│   │   │   ├── CourseCard.tsx
│   │   │   ├── ToolCard.tsx
│   │   │   ├── TestimonialCard.tsx
│   │   │   ├── ApplicationForm.tsx
│   │   │   ├── TawkWidget.tsx
│   │   │   └── LanguageSwitcher.tsx
│   │   ├── next.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── app/
│   │   ├── app/
│   │   │   ├── (public)/
│   │   │   │   └── page.tsx (Landing)
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (protected)/
│   │   │   │   ├── layout.tsx (with phone verification check)
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── tools/
│   │   │   │   │   ├── cutoff-calculator/page.tsx
│   │   │   │   │   ├── college-predictor/page.tsx
│   │   │   │   │   └── exam-centers/page.tsx
│   │   │   │   ├── apply/page.tsx
│   │   │   │   └── profile/page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── PhoneVerificationModal.tsx
│   │   │   ├── AuthModal.tsx
│   │   │   ├── CutoffCalculator.tsx
│   │   │   ├── CollegePredictor.tsx
│   │   │   ├── ExamCenterLocator.tsx
│   │   │   └── ApplicationForm.tsx
│   │   ├── next.config.js (PWA config)
│   │   ├── manifest.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── admin/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx (sidebar)
│   │   │   │   ├── page.tsx (dashboard)
│   │   │   │   ├── leads/
│   │   │   │   │   ├── page.tsx (list)
│   │   │   │   │   └── [id]/page.tsx (detail/review)
│   │   │   │   ├── payments/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── students/page.tsx
│   │   │   │   ├── courses/page.tsx
│   │   │   │   ├── colleges/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── DashboardStats.tsx
│   │   │   ├── LeadReviewForm.tsx
│   │   │   ├── PaymentVerification.tsx
│   │   │   └── DataTable.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── nexus/
│       ├── app/
│       │   ├── (auth)/
│       │   │   └── login/page.tsx
│       │   ├── (classroom)/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx (dashboard)
│       │   │   ├── courses/page.tsx
│       │   │   ├── payments/page.tsx
│       │   │   └── profile/page.tsx
│       │   └── layout.tsx
│       ├── components/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── ui/ (already created)
│   ├── database/ (already created)
│   ├── auth/ (already created)
│   └── i18n/ (already created)
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── config.toml
│
├── .env.local
├── .env.example
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```

---

## 🚨 Important Notes for Claude

1. **Always use the shared packages** (@neram/ui, @neram/database, @neram/auth, @neram/i18n)

2. **Mobile-first design** - Most users are on Android mobile devices

3. **Phone verification is critical** - Non-closable modal on tools that require it

4. **Application form flow**:
   - Marketing site → Quick apply with Google Auth
   - Redirects to app.neramclasses.com
   - Complete registration + phone verification
   - Admin reviews and approves

5. **Payment verification**:
   - Support both Razorpay and UPI screenshot
   - Admin must verify screenshots manually
   - Generate proper receipts

6. **SEO is important** for marketing site:
   - Proper meta tags in all languages
   - Structured data (JSON-LD)
   - Sitemap
   - hreflang tags

7. **Use Material UI** with the theme from @neram/ui

8. **All API routes** should use Supabase service role for admin operations

---

## ✅ Execution Checklist

- [ ] Phase 1: Environment Setup
  - [ ] Install CLIs
  - [ ] Create .env.local
  - [ ] Link Supabase

- [ ] Phase 2: Database
  - [ ] Run migrations
  - [ ] Seed data
  - [ ] Generate types

- [ ] Phase 3: Firebase
  - [ ] Initialize
  - [ ] Enable auth methods
  - [ ] Configure in project

- [ ] Phase 4: Create Apps
  - [ ] Marketing site
  - [ ] Tools app (PWA)
  - [ ] Admin panel
  - [ ] Classroom app

- [ ] Phase 5: Core Features
  - [ ] Application form
  - [ ] Admin review flow
  - [ ] Payment flow
  - [ ] Email notifications

- [ ] Phase 6: Deployment
  - [ ] Deploy to Vercel
  - [ ] Configure domains
  - [ ] Update DNS

---

## 🆘 If You Need Help

Ask Claude to:
1. "Show me how to implement [specific feature]"
2. "Debug this error: [error message]"
3. "Create the [component name] component"
4. "Set up [service name] integration"

**Start by asking**: "Let's begin with Phase 1. Check and install all required CLIs."
