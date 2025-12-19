# Neram Classes Ecosystem

A comprehensive monorepo for Neram Classes - NATA & JEE Paper 2 Coaching Platform.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NERAM CLASSES ECOSYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ neramclasses.com│  │     app.        │  │    nexus.       │              │
│  │                 │  │ neramclasses.com│  │ neramclasses.com│              │
│  │  Marketing/SEO  │  │                 │  │                 │              │
│  │  Multilingual   │  │   Tools App     │  │   Classroom     │              │
│  │  Tawk.to Chat   │  │   PWA (Android) │  │   MS Teams      │              │
│  │                 │  │                 │  │                 │              │
│  │  • Tool Pages   │  │  • Cutoff Calc  │  │  • Lessons      │              │
│  │  • Application  │  │  • College Pred │  │  • Assignments  │              │
│  │  • Blog         │  │  • Exam Centers │  │  • Payments     │              │
│  │  • Courses      │  │  • Application  │  │  • Progress     │              │
│  │                 │  │  • Phone Auth   │  │                 │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           │ No Auth            │ Firebase           │ Microsoft              │
│           │ (Public)           │ (Email/Phone)      │ (Entra ID)             │
│           │                    │                    │                        │
│  ┌────────┴────────────────────┴────────────────────┴────────┐              │
│  │                     SUPABASE BACKEND                       │              │
│  │  • Users (unified identity)  • Courses  • Payments        │              │
│  │  • Lead Profiles             • Batches  • Analytics       │              │
│  │  • Student Profiles          • Tools Data (Colleges, etc.)│              │
│  └────────────────────────────────────────────────────────────┘              │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │    admin.       │                                                        │
│  │ neramclasses.com│  ← Microsoft Auth (Entra ID)                          │
│  │                 │                                                        │
│  │   Admin Panel   │  • Manage Leads/Students                               │
│  │                 │  • Approve/Reject Applications                         │
│  │                 │  • Fee Structure Management                             │
│  │                 │  • Payment Verification                                 │
│  │                 │  • Content Management                                   │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📁 Repository Structure

```
neram-ecosystem/
├── apps/
│   ├── marketing/          # neramclasses.com (Astro/Next.js SSG)
│   ├── app/                # app.neramclasses.com (Next.js PWA)
│   ├── nexus/              # nexus.neramclasses.com (Next.js)
│   └── admin/              # admin.neramclasses.com (Next.js)
│
├── packages/
│   ├── ui/                 # Shared UI components & MUI theme
│   ├── database/           # Supabase client & types
│   ├── auth/               # Firebase & Microsoft auth
│   ├── i18n/               # Internationalization (5 languages)
│   └── config/             # Shared configurations
│
├── supabase/               # Database migrations & edge functions
├── docs/                   # Documentation
├── turbo.json              # Turborepo configuration
└── package.json            # Root package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18.17+ 
- pnpm 8+
- Supabase CLI
- Firebase CLI
- Vercel CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/neram-ecosystem.git
cd neram-ecosystem

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local

# Start development
pnpm dev
```

### CLI Commands

```bash
# Development
pnpm dev                    # Start all apps
pnpm dev:marketing          # Start marketing site only
pnpm dev:app                # Start tools app only
pnpm dev:nexus              # Start classroom only
pnpm dev:admin              # Start admin panel only

# Build
pnpm build                  # Build all apps
pnpm build:marketing        # Build marketing site

# Database
pnpm db:generate            # Generate TypeScript types from Supabase
pnpm db:push                # Push schema changes to Supabase
pnpm db:studio              # Open Supabase Studio

# Deployment
pnpm vercel:deploy          # Deploy to Vercel (preview)
pnpm vercel:deploy:prod     # Deploy to Vercel (production)

# Firebase
pnpm firebase:deploy        # Deploy Firebase config
```

## 🔐 Authentication Flow

### Marketing Site (neramclasses.com)
- **Public**: No authentication required
- Tool landing pages are crawlable by Google for SEO
- Application form collects user data

### Tools App (app.neramclasses.com)
- **Primary Auth**: Email + Username (Firebase)
- **Social Auth**: Google Sign-In
- **Phone Verification**: Non-closable popup on specific tools
- PWA for Android mobile users

### Classroom (nexus.neramclasses.com)
- **Microsoft Entra ID** only
- For paid, enrolled students
- Integrated with MS Teams

### Admin Panel (admin.neramclasses.com)
- **Microsoft Entra ID** only
- Role-based access control

## 📱 Application Form & Enrollment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION & ENROLLMENT FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

  USER                          ADMIN                           SYSTEM
   │                              │                                │
   │ 1. Visits neramclasses.com   │                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   │ 2. Fills Application Form    │                                │
   │    (Google Auth + Name)      │                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   │ 3. Redirected to             │                                │
   │    app.neramclasses.com      │                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   │ 4. Complete Email Auth       │                                │
   │    + Phone Verification      │                                │
   │ ────────────────────────────>│                                │
   │                              │ 5. Admin Notification          │
   │                              │ <─────────────────────────────│
   │                              │                                │
   │                              │ 6. Reviews Application         │
   │                              │    (View all details)          │
   │                              │ ────────────────────────────>  │
   │                              │                                │
   │                              │ 7. Set Fee Structure           │
   │                              │    • Course: NATA/JEE/Both     │
   │                              │    • Base Fee                  │
   │                              │    • Coupon Code (optional)    │
   │                              │    • Discount                  │
   │                              │ ────────────────────────────>  │
   │                              │                                │
   ├──────────────────────────────┼────────────────────────────────┤
   │                              │ APPROVE                REJECT  │
   ├──────────────────────────────┼────────────────────────────────┤
   │                              │                                │
   │ 8a. Approval Email           │                                │
   │     (with payment details)   │                                │
   │ <────────────────────────────│                                │
   │                              │ 8b. Rejection Email            │
   │                              │     (with reason)              │
   │                              │ ──────────────────────────────>│
   │                              │                                │
   │ 9. Pays Fee                  │                                │
   │    Option A: Razorpay        │                                │
   │    Option B: UPI (screenshot)│                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   │ [If Direct Payment]          │                                │
   │ 10. Uploads Payment Screenshot                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   │                              │ 11. Verify Payment             │
   │                              │     Screenshot                 │
   │                              │ ────────────────────────────>  │
   │                              │                                │
   │ 12. Confirmation Email       │                                │
   │     • Thank you message      │                                │
   │     • Fee Receipt PDF        │                                │
   │     • MS Teams credentials   │                                │
   │     • Next steps             │                                │
   │ <────────────────────────────│                                │
   │                              │                                │
   │ 13. Access Nexus Classroom   │                                │
   │     (MS Auth)                │                                │
   │ ────────────────────────────>│                                │
   │                              │                                │
   └──────────────────────────────┴────────────────────────────────┘
```

## 💰 Fee Structure & Courses

| Course | Regular Fee | Discounted Fee | Duration |
|--------|-------------|----------------|----------|
| NATA Preparation | ₹25,000 | ₹22,000 | 6 months |
| JEE Paper 2 | ₹30,000 | ₹27,000 | 8 months |
| Combined (NATA + JEE) | ₹45,000 | ₹40,000 | 10 months |
| Revit (Add-on) | ₹10,000 | ₹8,000 | 2 months |

## 🌐 Multilingual Support

The marketing site supports 5 languages:

| Language | Code | Status |
|----------|------|--------|
| English | `en` | Primary |
| Tamil | `ta` | Full support |
| Hindi | `hi` | Full support |
| Kannada | `kn` | Full support |
| Malayalam | `ml` | Full support |

SEO is prioritized for each language with proper hreflang tags and localized content.

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: Material UI v5
- **Styling**: Emotion CSS-in-JS
- **State**: Zustand / React Query
- **Forms**: React Hook Form + Zod

### Backend
- **Database**: Supabase (PostgreSQL)
- **Auth**: Firebase (Tools App) + Microsoft Entra ID (Classroom/Admin)
- **Payments**: Razorpay
- **Email**: Resend
- **Chat**: Tawk.to

### DevOps
- **Monorepo**: Turborepo
- **Package Manager**: pnpm
- **Deployment**: Vercel
- **CI/CD**: GitHub Actions

## 📊 Database Schema

See [packages/database/src/types/index.ts](packages/database/src/types/index.ts) for complete schema documentation.

### Core Tables
- `users` - Unified user identity
- `lead_profiles` - Application form submissions
- `student_profiles` - Enrolled students
- `courses` - Course catalog
- `batches` - Student cohorts
- `payments` - Payment records

### Tools Data
- `colleges` - College information
- `cutoff_data` - Admission cutoffs
- `exam_centers` - Exam center locations
- `tool_usage_logs` - Analytics

## 📧 Email Templates

| Template | Trigger | Content |
|----------|---------|---------|
| `application_received` | Form submission | Confirmation + next steps |
| `application_approved` | Admin approves | Payment link + details |
| `application_rejected` | Admin rejects | Reason + reapply info |
| `payment_confirmed` | Payment verified | Receipt + MS Teams creds |
| `welcome_student` | First login | Onboarding guide |

## 🔧 Environment Variables

See [.env.example](.env.example) for all required environment variables.

## 📱 Mobile Support (PWA)

The Tools App (app.neramclasses.com) is a Progressive Web App that can be:
- Installed on Android devices
- Used offline for cached data
- Push notifications ready

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

Proprietary - Neram Classes. All rights reserved.

---

## 🗓️ Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [x] Monorepo setup with Turborepo
- [x] Shared UI package with MUI theme
- [x] Database package with Supabase types
- [x] Auth package (Firebase + Microsoft)
- [ ] i18n package setup

### Phase 2: Marketing Site (Weeks 3-4)
- [ ] Astro/Next.js SSG setup
- [ ] Multilingual routing
- [ ] Tool landing pages (SEO)
- [ ] Application form
- [ ] Tawk.to integration
- [ ] Course pages

### Phase 3: Tools App (Weeks 5-7)
- [ ] Next.js PWA setup
- [ ] Firebase Email/Google auth
- [ ] Phone verification modal
- [ ] Cutoff Calculator tool
- [ ] College Predictor tool
- [ ] Exam Center Locator
- [ ] Application form integration

### Phase 4: Admin Panel (Weeks 8-10)
- [ ] Microsoft auth setup
- [ ] Lead management dashboard
- [ ] Application review workflow
- [ ] Fee structure configuration
- [ ] Payment screenshot verification
- [ ] Email notification triggers
- [ ] Analytics dashboard

### Phase 5: Classroom (Weeks 11-13)
- [ ] Microsoft auth + Teams integration
- [ ] Student dashboard
- [ ] Course content delivery
- [ ] Payment gateway (Razorpay)
- [ ] Progress tracking

### Phase 6: Polish & Launch (Weeks 14-16)
- [ ] Testing & QA
- [ ] Performance optimization
- [ ] SEO audit
- [ ] Documentation
- [ ] Production deployment

---

Built with ❤️ for architecture students in India.
