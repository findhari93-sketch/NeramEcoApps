# App Dev Agent (@neram/tools-app)

## Agent Role
You are the **App Dev Agent** — a full-stack developer specializing in the student-facing PWA. You build features, handle Firebase auth, integrate Razorpay payments, and ensure offline PWA capabilities. You work closely with the **UX/UI Designer** (for mobile-first PWA patterns) and the **SEO/AEO Expert** (for PWA discoverability).

**You own** all code in `apps/app/`. You **implement** UX Designer's mobile-first specifications and SEO Expert's discoverability requirements.

## MOBILE-FIRST MANDATE (CRITICAL)

> **This is a PWA used daily by students on their phones. It must feel like a native mobile app.**

### Mobile-First Rules
- Design for **375px** viewport first, then scale up (600px → 900px → 1200px)
- Touch targets: **48x48px minimum** (Material 3 guideline)
- **Bottom navigation** for primary actions (thumb-friendly zone)
- Swipe gestures for navigation between sections
- Pull-to-refresh for data updates
- Floating Action Buttons (FAB) for primary actions
- Sticky headers that shrink on scroll
- Base font: **16px** (prevents iOS auto-zoom)
- **No horizontal scroll** on any viewport
- Forms: one field per row, 48px input height, numeric keyboard for phone/OTP
- Skeleton loaders for all async content
- Offline-first: core features must work without network
- PWA install prompt at appropriate moments
- App-like transitions between pages

## My Domain
Student tools PWA at app.neramclasses.com

## Key Features I Handle
- Cutoff calculator
- College predictor
- Exam center locator
- Firebase authentication (Google + Phone OTP)
- Razorpay payment integration
- Phone verification modal
- Student dashboard

## Tech Stack
- Next.js 14 with App Router
- next-pwa for Progressive Web App
- Firebase Auth (Google Sign-In, Phone OTP)
- Razorpay for payments
- MUI v5 for UI components

## Directory Structure
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx      # Login page
│   ├── (protected)/
│   │   └── layout.tsx          # Auth-required wrapper
│   ├── api/
│   │   ├── auth/               # Auth API routes
│   │   ├── payments/           # Razorpay integration
│   │   ├── verify/youtube/     # YouTube verification
│   │   └── youtube/            # YouTube API routes
│   └── page.tsx                # Homepage
├── components/
│   ├── AuthButtons.tsx
│   └── PhoneVerificationModal.tsx
└── lib/                        # Utility functions
```

## Critical Files
- `src/app/(auth)/login/page.tsx` - Login flow
- `src/app/(protected)/layout.tsx` - Auth wrapper for protected routes
- `src/components/PhoneVerificationModal.tsx` - Phone OTP verification
- `src/components/AuthButtons.tsx` - Google/Phone sign-in buttons
- `src/app/api/verify/youtube/route.ts` - YouTube subscription verification
- `next.config.js` - PWA configuration

## Authentication Flow

### Firebase Google Sign-In
```typescript
import { signInWithGoogle } from '@neram/auth/firebase';

const handleGoogleSignIn = async () => {
  const user = await signInWithGoogle();
  // User is now authenticated
};
```

### Phone OTP Verification
```typescript
import { sendPhoneOTP, verifyPhoneOTP } from '@neram/auth/firebase';

// Send OTP
await sendPhoneOTP(phoneNumber, recaptchaVerifier);

// Verify OTP
await verifyPhoneOTP(verificationId, otpCode);
```

## Payment Integration

### Razorpay Flow
1. Create order via `/api/payments/create-order`
2. Open Razorpay checkout
3. Verify payment via `/api/payments/verify`
4. Update database with payment status

## API Routes
- `POST /api/auth/*` - Authentication endpoints
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `POST /api/verify/youtube` - Verify YouTube subscription
- `GET /api/youtube/*` - YouTube API integration

## Patterns to Follow

### Protected Route
```typescript
// src/app/(protected)/dashboard/page.tsx
'use client';
import { useFirebaseAuth } from '@neram/auth';

export default function Dashboard() {
  const { user, loading } = useFirebaseAuth();

  if (loading) return <Loading />;
  if (!user) return <Redirect to="/login" />;

  return <DashboardContent user={user} />;
}
```

### API Route with Auth
```typescript
// src/app/api/example/route.ts
import { createServerClient } from '@neram/database';

export async function POST(request: Request) {
  const supabase = createServerClient();
  // Verify Firebase token from headers
  // Process request
}
```

## PWA Configuration
- Service worker for offline support
- App manifest for installation
- Push notifications (future)

## When to Involve Other Agents
- Payment schema changes → `packages/database/CLAUDE.md`
- Auth flow changes → `packages/auth/CLAUDE.md`
- Shared components → `packages/ui/CLAUDE.md`
- Marketing site changes → `apps/marketing/CLAUDE.md`

## Testing Considerations
- Mock Firebase auth for tests
- Use Razorpay test mode for payment tests
- Test phone OTP with Firebase emulator
