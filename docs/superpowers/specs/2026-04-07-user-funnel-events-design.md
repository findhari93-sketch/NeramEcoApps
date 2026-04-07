# User Funnel Events: Auth & Onboarding Diagnostics

## Context

37 out of 149 leads in the admin panel are stuck at "New Lead" with only an email address. They completed Google authentication but never verified their phone number. Currently, there is no way to determine whether these users:
- Saw the phone verification screen and abandoned it
- Attempted phone verification and hit an error
- Had a JS crash during the flow
- Simply closed the app after Google auth

The system needs step-by-step auth and onboarding funnel tracking to diagnose where users drop off and why. This enables the admin team to take targeted action (fix UX issues, contact stuck users, etc.).

## Scope

- **User types**: All Firebase auth users (app.neramclasses.com + marketing site)
- **Funnels tracked**: Auth flow (Google auth through phone verification) + Onboarding flow (onboarding questions + application form)
- **Admin UI**: Inline status badges on leads table + detail drawer with event timeline + aggregate funnel chart

## 1. Database Schema

### `user_funnel_events` table

```sql
CREATE TABLE user_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id TEXT,                           -- device fingerprint before auth

  -- Event classification
  funnel TEXT NOT NULL,                        -- 'auth' | 'onboarding' | 'application'
  event TEXT NOT NULL,                         -- e.g., 'google_auth_started'
  status TEXT NOT NULL DEFAULT 'started',      -- 'started' | 'completed' | 'failed' | 'skipped'

  -- Error context
  error_message TEXT,
  error_code TEXT,                             -- e.g., 'auth/popup-closed-by-user'
  metadata JSONB DEFAULT '{}',                 -- flexible extra data

  -- Device context (denormalized for admin queries)
  device_session_id UUID REFERENCES user_device_sessions(id),
  device_type TEXT,                            -- 'mobile' | 'desktop' | 'tablet'
  browser TEXT,
  os TEXT,
  ip_address TEXT,

  -- Source
  source_app TEXT NOT NULL,                    -- 'app' | 'marketing'
  page_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_funnel_events_user ON user_funnel_events(user_id, created_at DESC);
CREATE INDEX idx_funnel_events_funnel ON user_funnel_events(funnel, event);
CREATE INDEX idx_funnel_events_anonymous ON user_funnel_events(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_funnel_events_created ON user_funnel_events(created_at DESC);

-- RLS
ALTER TABLE user_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events" ON user_funnel_events
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR user_id IS NULL);

CREATE POLICY "Service role full access" ON user_funnel_events
  FOR ALL USING (auth.role() = 'service_role');
```

### Aggregate view for funnel visualization

```sql
CREATE VIEW auth_funnel_summary AS
SELECT
  date_trunc('week', created_at) AS week,
  source_app,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'google_auth_started') AS auth_started,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'google_auth_completed') AS auth_completed,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'register_user_completed') AS user_registered,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'phone_screen_shown') AS phone_shown,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'phone_number_entered') AS phone_entered,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'otp_requested') AS otp_requested,
  COUNT(DISTINCT user_id) FILTER (WHERE event = 'otp_verified') AS otp_verified
FROM user_funnel_events
WHERE funnel = 'auth'
GROUP BY 1, 2;
```

## 2. Event Definitions

### Auth Funnel Events

| Event | Status | Where Logged | Description |
|-------|--------|-------------|-------------|
| `google_auth_started` | started | Client: AuthButtons.tsx | User clicks "Continue with Google" |
| `google_auth_popup_opened` | started | Client: AuthButtons.tsx | Popup window opens |
| `google_auth_completed` | completed | Client: AuthButtons.tsx | Firebase returns success |
| `google_auth_failed` | failed | Client: AuthButtons.tsx | Firebase error (popup closed, network, etc.) |
| `register_user_started` | started | Server: register-user/route.ts | API call begins |
| `register_user_completed` | completed | Server: register-user/route.ts | User created/found in Supabase |
| `register_user_failed` | failed | Server: register-user/route.ts | DB or auth error |
| `phone_screen_shown` | started | Client: PersonalInfoStep.tsx | Phone verification UI renders |
| `phone_number_entered` | started | Client: PersonalInfoStep.tsx | User types a phone number |
| `otp_requested` | started | Client: PersonalInfoStep.tsx | OTP sent via Firebase |
| `otp_request_failed` | failed | Client: PersonalInfoStep.tsx | OTP send failed |
| `otp_entered` | started | Client: PersonalInfoStep.tsx | User submits OTP |
| `otp_verified` | completed | Server: verify-phone/route.ts | Phone verified in DB |
| `otp_failed` | failed | Client: PersonalInfoStep.tsx | Wrong OTP or expired |
| `phone_already_exists` | failed | Server: verify-phone/route.ts | Phone belongs to another account |
| `phone_skipped` | skipped | Client: navigation away detection | User left without verifying |

### Onboarding Funnel Events

| Event | Status | Where Logged |
|-------|--------|-------------|
| `onboarding_started` | started | Client: Onboarding component |
| `onboarding_question_answered` | completed | Client: Per question (metadata: {question_id, step}) |
| `onboarding_completed` | completed | Client/Server: All questions done |
| `onboarding_skipped` | skipped | Client: Skip button clicked |

### Application Funnel Events

| Event | Status | Where Logged |
|-------|--------|-------------|
| `application_step_started` | started | Client: Form step opened (metadata: {step: 1..4}) |
| `application_step_completed` | completed | Client: Form step saved |
| `application_submitted` | completed | Server: Full form submitted |

## 3. Frontend Tracking Utility

### Shared utility: `packages/database/src/queries/funnel-events.ts`

```typescript
export interface FunnelEventInput {
  funnel: 'auth' | 'onboarding' | 'application';
  event: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export async function insertFunnelEvent(
  client: TypedSupabaseClient,
  data: FunnelEventInsert
): Promise<void>

export async function getFunnelEventsForUser(
  userId: string,
  client?: TypedSupabaseClient
): Promise<UserFunnelEvent[]>

export async function getAuthFunnelSummary(
  client?: TypedSupabaseClient,
  weeks?: number
): Promise<AuthFunnelSummary[]>
```

### Client-side tracker: `apps/app/src/lib/funnel-tracker.ts`

- Queues events in memory
- Flushes via `POST /api/funnel-events` every 5 seconds or on `visibilitychange`/`beforeunload`
- Uses `navigator.sendBeacon()` as fallback (same pattern as existing ErrorBoundary)
- Collects device info from existing `device-collector.ts`
- Uses device fingerprint from `device-fingerprint.ts` as `anonymous_id` before auth

### API endpoint: `apps/app/src/app/api/funnel-events/route.ts`

- Accepts batch of events
- Authenticates via Firebase ID token (optional, for pre-auth events)
- Links `anonymous_id` events to `user_id` after registration
- Rate limited: max 50 events per request

### Marketing site: `apps/marketing/src/lib/funnel-tracker.ts`

- Same tracker, different `source_app: 'marketing'`
- Only fires auth events (Google auth for cross-domain flow)

## 4. Admin UI

### 4a. Aggregate Funnel Chart (top of leads page)

Horizontal funnel visualization at the top of the leads page, similar to existing pipeline cards but for auth steps:

```
Auth Funnel (Last 7 days)
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Started  │→│ Completed│→│ Phone    │→│ OTP Sent │→│ Verified │
│   45     │  │   40     │  │   32     │  │   28     │  │   25     │
│  100%    │  │   89%    │  │   71%    │  │   62%    │  │   56%    │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
                                ↑ 18% drop here
```

- Shows conversion rate at each step
- Highlights the biggest drop-off point
- Filterable by time period (7d, 30d, all time) and source app

### 4b. Inline Badges on Leads Table

New columns added to the existing UsersTable:

| Column | Content |
|--------|---------|
| **Auth Status** | Color badge: "Google Only" (orange), "Phone Verified" (green), "Auth Failed" (red), "Partial" (yellow) |
| **Last Step** | Last funnel event reached: "OTP Requested", "Phone Screen", etc. |
| **Drop-off** | If incomplete: reason text ("Popup closed", "Wrong OTP x3", "Abandoned at phone screen") |
| **Device** | Mobile/Desktop icon + browser |

### 4c. Detail Drawer

A slide-out panel (right side, 400px wide) opened by clicking any lead row. Contains:

1. **User Header**: Name, email, created date, device/location info
2. **Auth Timeline**: Vertical timeline of all funnel events with timestamps, green checkmarks for completed, red X for failed, grey circles for not reached
3. **Drop-off Diagnosis**: Auto-generated summary based on events (e.g., "User abandoned after seeing phone screen. No phone number entered. No errors logged.")
4. **Error Log**: Any errors from `user_error_logs` for this user during the same session
5. **Actions**: "Send WhatsApp reminder", "Mark as Dead Lead", "Add Note"

### 4d. Admin API Routes

| Endpoint | Purpose |
|----------|---------|
| `GET /api/crm/funnel-events/[userId]` | Get all funnel events for a user |
| `GET /api/crm/funnel-summary` | Get aggregate funnel data for chart |
| `GET /api/crm/leads` (updated) | Include auth_status, last_step, drop_off_reason in UserJourney |

## 5. Files to Create/Modify

### New Files
- `supabase/migrations/YYYYMMDD_user_funnel_events.sql` - Table, indexes, RLS, view
- `packages/database/src/queries/funnel-events.ts` - DB queries
- `apps/app/src/lib/funnel-tracker.ts` - Client-side event tracker
- `apps/app/src/app/api/funnel-events/route.ts` - API endpoint
- `apps/marketing/src/lib/funnel-tracker.ts` - Marketing tracker (same pattern)
- `apps/admin/src/app/api/crm/funnel-events/route.ts` - Admin API for events
- `apps/admin/src/app/api/crm/funnel-summary/route.ts` - Admin API for aggregate
- `apps/admin/src/components/leads/AuthFunnelChart.tsx` - Funnel visualization
- `apps/admin/src/components/leads/LeadDiagnosticsDrawer.tsx` - Detail drawer
- `apps/admin/src/components/leads/AuthStatusBadge.tsx` - Inline badge component

### Modified Files
- `packages/database/src/types/index.ts` - Add UserFunnelEvent type, update UserJourney type
- `packages/database/src/queries/index.ts` - Export new queries
- `apps/app/src/components/AuthButtons.tsx` - Add auth event tracking calls
- `apps/app/src/app/api/auth/register-user/route.ts` - Add server-side events
- `apps/app/src/app/api/auth/verify-phone/route.ts` - Add server-side events
- `apps/app/src/app/(protected)/apply/components/PersonalInfoStep.tsx` - Add phone events
- `apps/admin/src/app/(dashboard)/leads/page.tsx` - Add funnel chart + drawer
- `apps/admin/src/app/api/crm/users/route.ts` - Include funnel data in lead queries

## 6. Verification

1. **Database**: Run migration on staging via MCP, verify table exists
2. **Event logging**: Sign in with test account on app, verify events appear in `user_funnel_events` table
3. **Simulate drop-off**: Start Google auth, complete it, navigate away from phone screen, check that `phone_skipped` event fires
4. **Admin inline badges**: Check leads table shows auth status and last step for tracked users
5. **Admin drawer**: Click a lead, verify timeline shows correct events
6. **Funnel chart**: Verify aggregate numbers match expected conversion rates
7. **Error case**: Trigger a phone verification error, verify it appears in the timeline with error details
8. **Pre-auth linking**: Verify anonymous_id events get linked to user_id after registration
9. **Marketing site**: Test cross-domain auth flow logs events with source_app = 'marketing'
