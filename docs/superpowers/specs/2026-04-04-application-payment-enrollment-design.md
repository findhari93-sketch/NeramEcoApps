# Application → Payment → Enrollment — Design Spec

> **Date:** 2026-04-04 | **Scope:** Full pipeline from student application to enrollment
> **Apps:** marketing, admin, app | **Status:** Approved

---

## Context

Students apply for Neram Classes via the marketing site application form. After admin approval, they must pay fees before being enrolled. The application form and admin approval UI exist, but the post-approval flow (notification → payment → auto-enrollment → onboarding) has never been tested end-to-end. Several pieces are disconnected or missing.

This spec covers: building the public payment page, wiring notifications correctly, adding Teams webhook support, verifying the auto-enrollment logic, and writing E2E tests for the complete flow.

---

## Scope

### In scope
- Public payment page in marketing app (`/pay?app=NERAM-XXXX`)
- Payment link correction in notification dispatcher
- `payer_name` and `payer_relationship` fields in payments table
- Teams Incoming Webhook as 6th notification channel
- WhatsApp template content guide (for Meta Business Manager setup)
- Admin payment detail view enhancement
- Verification/fixes to auto-enrollment logic in payment verify API
- E2E test suite for the full flow (Playwright, real Razorpay test mode)

### Out of scope
- WhatsApp template approval in Meta (manual step, spec provides content)
- Microsoft account creation automation (admin does this manually)
- Batch auto-assignment (remains manual)
- Installment #2 reminder/collection flow
- Direct enrollment link flow (already working separately)

---

## End-to-End Flow

```
STUDENT/PARENT                     ADMIN                          SYSTEM
─────────────────────────────────────────────────────────────────────────

1. Student fills application        
   form (marketing app)             
   → submits                        
                                                          → lead_profiles created
                                                            status: 'submitted'
                                                          → Notifications: Telegram,
                                                            Email, Admin in-app,
                                                            Teams webhook

                                    2. Admin reviews in CRM
                                       → selects fee structure
                                       → approves
                                                          → lead status: 'approved'
                                                          → Notifications to student:
                                                            WhatsApp, Email with
                                                            payment link

3. Anyone with link opens           
   /pay?app=NERAM-1234              
   → sees fee summary               
   → enters payer info              
   → pays via Razorpay              
                                                          → payment verified
                                                          → lead status: 'enrolled'
                                                          → student_profile created
                                                          → Notifications:
                                                            Admin: Telegram, Teams,
                                                              in-app, Email
                                                            Student: WhatsApp, Email,
                                                              in-app

4. Student logs into                
   app.neramclasses.com             
   → onboarding starts              
   → WhatsApp group join            
   → installs Teams + Authenticator 
   → waits for credentials          

                                    5. Admin creates MS account
                                       → shares credentials
                                       (existing direct enrollment flow)
                                                          → WhatsApp + Email to student

6. Student receives credentials     
   → completes onboarding           
   → accesses Nexus classroom       
```

---

## 1. Public Payment Page

### Route
`/apps/marketing/src/app/[locale]/pay/page.tsx`

**URL:** `neramclasses.com/pay?app=NERAM-1234`

### Behavior
1. Page receives `app` query parameter (application number)
2. Fetches lead profile by application number via new API endpoint
3. Validates:
   - Application exists
   - Status is `approved` (not draft, rejected, enrolled, etc.)
   - Payment deadline hasn't passed (show warning if close, block if expired)
   - No completed payment already exists
4. Displays read-only summary:
   - Student first name (no last name, phone, email — minimal PII)
   - Course name (mapped from `interest_course`)
   - Fee breakdown: base fee, discount, final fee
   - Payment options: full payment amount (with discount incentive) and/or installment amounts
   - Payment deadline
   - Coupon code field (if admin generated one)
5. Payer information section:
   - Payer name (text input, required)
   - Relationship to student: Self / Parent / Guardian / Sibling / Other (radio buttons)
6. "Pay Now" button opens Razorpay checkout (reuses existing `PaymentDialog` logic)
7. On success: shows receipt page with download option
   - If relationship = "Self": show "Start Onboarding" button → `app.neramclasses.com`
   - Otherwise: show "Share with student — they can start onboarding at app.neramclasses.com"

### API Endpoint
`GET /api/payment/details?app=NERAM-1234`

- Fetches lead profile by `application_number`
- Returns only: student first name, course, fee breakdown, payment options, deadline, coupon
- No authentication required
- Validates status is `approved`
- Returns 404 if not found, 400 if wrong status

### Security
- Application number is the bearer token (only people with the notification link have it)
- Minimal PII exposed (first name + course only)
- Status validation prevents double payment
- Rate limiting on the details endpoint (prevent enumeration)

---

## 2. Notification Payment Link Update

### Current
`notifyApplicationApproved()` in `packages/database/src/services/notifications.ts` generates:
```
${NEXT_PUBLIC_APP_URL}/payment/${leadProfileId}
```

### Change to
```
${NEXT_PUBLIC_MARKETING_URL}/pay?app=${applicationNumber}
```

### Files affected
- `packages/database/src/services/notifications.ts` — `notifyApplicationApproved()` function
- `packages/database/src/services/email.ts` — `application-approved` email template (payment CTA button URL)

### Environment variable
Add `NEXT_PUBLIC_MARKETING_URL` to the notification service context. Fallback: `https://neramclasses.com` for production, `https://staging.neramclasses.com` for staging.

---

## 3. Payments Table: Payer Fields

### Migration
```sql
ALTER TABLE payments ADD COLUMN payer_name TEXT;
ALTER TABLE payments ADD COLUMN payer_relationship TEXT
  CHECK (payer_relationship IN ('self', 'parent', 'guardian', 'sibling', 'other'));
```

### Type update
Add `payer_name` and `payer_relationship` to the Payment type in `packages/database/src/types/index.ts`.

### Usage
- Set during payment creation in `POST /api/payment/create-order`
- Displayed in admin CRM payment detail view
- Included in payment notification metadata

---

## 4. Teams Incoming Webhook

### New service
`packages/database/src/services/teams-webhook.ts`

### Implementation
- Sends Adaptive Cards via POST to webhook URL
- Card format: title, summary text, key-value facts table, action button to admin panel
- 10-second timeout (same as Telegram)
- Graceful failure if `TEAMS_WEBHOOK_URL` not configured

### Adaptive Card structure
```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "version": "1.4",
      "body": [
        { "type": "TextBlock", "text": "Payment Received", "weight": "Bolder", "size": "Medium" },
        { "type": "FactSet", "facts": [
          { "title": "Student", "value": "John Doe" },
          { "title": "Amount", "value": "Rs. 25,000" },
          { "title": "Method", "value": "UPI" }
        ]}
      ],
      "actions": [
        { "type": "Action.OpenUrl", "title": "View in Admin", "url": "https://admin.neramclasses.com/crm/users/..." }
      ]
    }
  }]
}
```

### Events (same as Telegram — admin-facing)
| Event | Card Title |
|-------|-----------|
| `new_application` | New Application Received |
| `payment_received` | Payment Received |
| `application_approved` | Application Approved |
| `new_callback` | Callback Requested |
| `scholarship_submitted` | Scholarship Docs Submitted |
| `refund_requested` | Refund Requested |

### Dispatcher integration
Add `teams` as 6th concurrent channel in `dispatchNotification()`:
```typescript
const [telegram, email, admin, whatsapp, userNotification, teams] = 
  await Promise.allSettled([...existing, sendTeamsWebhook(event)]);
```

### Environment variable
```
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
```

---

## 5. WhatsApp Template Guide

Templates must be created in Meta Business Manager before WhatsApp notifications work. Below is the exact content to submit.

### Template 1: `application_submitted` (UTILITY)
**Language:** English (en_US)
**Header:** None
**Body:**
```
Hi {{1}}, your application {{2}} for {{3}} has been received successfully.

We'll review your application within 2 business days. You'll receive a notification once it's approved.

If you have questions, reply to this message.
```
**Parameters:** {{1}} = student name, {{2}} = application number, {{3}} = course name
**Footer:** Neram Classes
**Buttons:** None

### Template 2: `application_approved` (UTILITY)
**Language:** English (en_US)
**Header:** None
**Body:**
```
Hi {{1}}, great news! Your application {{2}} has been approved.

Course fee: Rs. {{3}}
Pay now to secure your seat.
```
**Parameters:** {{1}} = student name, {{2}} = application number, {{3}} = final fee
**Footer:** Neram Classes
**Buttons:** CTA → "Pay Now" → URL: `https://neramclasses.com/pay?app={{1}}` (dynamic parameter = application number)

### Template 3: `payment_confirmed` (UTILITY)
**Language:** English (en_US)
**Header:** None
**Body:**
```
Hi {{1}}, your payment of Rs. {{2}} has been received!

Receipt: {{3}}
Course: {{4}}

Welcome to Neram Classes! Start your onboarding at app.neramclasses.com to set up your account.
```
**Parameters:** {{1}} = student name, {{2}} = amount, {{3}} = receipt number, {{4}} = course name
**Footer:** Neram Classes
**Buttons:** CTA → "Start Onboarding" → URL: `https://app.neramclasses.com`

### Template 4: `credentials_shared` (UTILITY)
**Language:** English (en_US)
**Header:** None
**Body:**
```
Hi {{1}}, your Neram Classes account is ready!

Your login email: {{2}}

Check your email for the password. Next steps:
1. Install Microsoft Teams
2. Install Microsoft Authenticator
3. Sign in with your credentials

Need help? Reply to this message.
```
**Parameters:** {{1}} = student name, {{2}} = MS email
**Footer:** Neram Classes
**Buttons:** None

---

## 6. Admin Payment Detail Enhancement

### Current state
Admin CRM `ApplicationSection` shows: payment status, amount, scheme. Limited detail.

### Enhancement
Add a "Payment Details" expandable section in the CRM user detail page showing:

**For paid students:**
- Transaction ID (Razorpay payment ID)
- Payment method: UPI / Card / Netbanking / Wallet
- Method details: card last 4 + network, VPA (UPI), bank name
- Payer: name + relationship to student
- Receipt number
- Amount paid
- Razorpay fee + tax
- Payment date/time
- Payment scheme: Full / Installment #1

**For installment students:**
- Installment #1: amount, paid date, receipt
- Installment #2: amount due, due date, days remaining, reminder status
- Total paid vs total fee progress bar

**Payment timeline:**
- Order created → Payment initiated → Payment verified → Receipt generated
- Timestamps for each step

### Files affected
- `apps/admin/src/components/crm/ApplicationSection.tsx` — add payment detail section
- May need new query: `getPaymentDetails(leadProfileId)` joining payments + payment_installments

---

## 7. Auto-Enrollment Verification & Fixes

### Current logic (in `/apps/marketing/src/app/api/payment/verify/route.ts`)
The verify API already:
1. Verifies Razorpay signature
2. Updates payment status to `paid`
3. Updates lead status to `enrolled` (full) or `partial_payment` (installment #1)
4. Creates `student_profile` on full payment
5. Creates installment #2 record on first installment
6. Fires notifications

### What needs verification/fixing
1. **Student profile creation completeness**: Currently only sets `user_id`, `payment_status`, `enrollment_date`. Should also set:
   - `course_id` (from lead profile's `selected_course_id`)
   - `total_fee` (from lead profile's `final_fee`)
   - `fee_paid` (payment amount)
   - `fee_due` (remaining balance, 0 for full payment)
2. **Payer fields**: Pass `payer_name` and `payer_relationship` from the payment page through to the create-order and verify APIs
3. **Razorpay enrichment**: Fetch payment details from Razorpay API after verification to capture:
   - `razorpay_method`, `razorpay_bank`, `razorpay_card_last4`, `razorpay_card_network`, `razorpay_vpa`
   - `razorpay_fee`, `razorpay_tax`
4. **Installment student profile**: Currently no student profile is created for partial payment. Verify this is correct — student should still get onboarding access after installment #1. Consider creating student profile on first installment too, with `payment_status: 'pending'` and `fee_due` set.
5. **Error handling**: Ensure notification failures don't cause payment verification to fail (already non-blocking, but verify)
6. **Receipt number**: Verify the auto-generated receipt number trigger works correctly

### Decision: Student profile on installment #1
Create student profile on installment #1 as well, so the student can start onboarding immediately:
- `payment_status: 'pending'` (still owes installment #2)
- `fee_paid: installment_1_amount`
- `fee_due: installment_2_amount`
- Lead status: `partial_payment`

This matches the direct enrollment flow where students get onboarding access before full payment.

---

## 8. E2E Test Suite

### Test file
`tests/e2e/application-to-enrollment.spec.ts`

### Test infrastructure
- **Razorpay**: Real test mode widget interaction (card: `4111 1111 1111 1111`)
- **WhatsApp**: Log verification only (templates pending Meta approval)
- **Telegram/Email**: Intercept API calls, verify payload correctness
- **Auth**: Existing test credentials from `tests/utils/credentials.ts`
- **Cleanup**: `afterAll` removes test records

### Group 1: Application Submission
```
test('student can complete 4-step application form')
  - Fill personal info (test data)
  - Complete phone OTP (test phone number)
  - Fill academic details
  - Select course
  - Review and submit
  - Verify thank-you page with application number
  - Verify lead_profiles.status = 'submitted' in DB

test('application submission triggers admin notifications')
  - Intercept Telegram API call, verify payload
  - Verify admin_notifications record created
```

### Group 2: Admin Approval
```
test('admin can approve application with fee structure')
  - Login as test teacher account
  - Navigate to CRM
  - Find test application
  - Open approval dialog
  - Select fee structure, configure payment options
  - Approve
  - Verify lead_profiles.status = 'approved'
  - Verify fee fields populated

test('approval triggers student notifications')
  - Intercept email API call, verify payment link is correct
  - Verify WhatsApp send attempted (log check)
  - Verify user_notifications record created
```

### Group 3: Payment (Public Page)
```
test('payment page loads with correct fee details')
  - Open /pay?app=NERAM-XXXX (no auth)
  - Verify student name, course, fee displayed
  - Verify payment options match what admin set

test('payment page blocks wrong status')
  - Try /pay?app=NERAM-XXXX for non-approved application
  - Verify error message shown

test('anyone can complete payment via Razorpay')
  - Fill payer name + relationship (Parent)
  - Click Pay Now
  - Fill Razorpay test card in iframe (4111 1111 1111 1111)
  - Complete payment
  - Verify receipt page shown with receipt number
  - Verify in DB: payment.status = 'paid'
  - Verify lead_profiles.status = 'enrolled'
  - Verify student_profiles record created

test('payment triggers all notifications')
  - Intercept Telegram API, verify payment message
  - Intercept Teams webhook, verify Adaptive Card
  - Verify admin_notifications record
  - Verify user_notifications record
```

### Group 4: Post-Payment
```
test('enrolled student can access onboarding')
  - Login to app.neramclasses.com as test student
  - Verify onboarding flow is accessible
  - Verify onboarding steps render (WhatsApp, Teams, Authenticator, credentials)

test('admin sees payment details in CRM')
  - Login as admin
  - Navigate to enrolled student
  - Verify payment details section shows: amount, method, payer, receipt
```

### Group 5: Mobile & Edge Cases
```
test('mobile: payment page has no horizontal overflow')
test('mobile: touch targets >= 48px on payment page')
test('payment page shows error for invalid application number')
test('payment page shows already-paid message for enrolled student')
test('installment payment sets partial_payment status and creates installment #2')
```

### Test data management
- Use `test-data-factory.ts` to seed a test lead profile with known data
- Or create application via UI in Group 1 and carry the application number through
- Cleanup: delete test lead_profile, payments, student_profile, notifications in `afterAll`

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/marketing/src/app/[locale]/pay/page.tsx` | Public payment page (server component + metadata) |
| 2 | `apps/marketing/src/components/pay/PaymentPage.tsx` | Payment page client component |
| 3 | `apps/marketing/src/app/api/payment/details/route.ts` | Public API: fetch lead fee details by app number |
| 4 | `packages/database/src/services/teams-webhook.ts` | Teams Incoming Webhook service |
| 5 | `tests/e2e/application-to-enrollment.spec.ts` | Full E2E test suite |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 6 | `packages/database/src/services/notifications.ts` | Add Teams as 6th channel, fix payment link URL |
| 7 | `packages/database/src/services/email.ts` | Update payment link in application-approved template |
| 8 | `packages/database/src/types/index.ts` | Add payer_name, payer_relationship to Payment type |
| 9 | `apps/marketing/src/app/api/payment/create-order/route.ts` | Accept + store payer fields |
| 10 | `apps/marketing/src/app/api/payment/verify/route.ts` | Fix student profile fields, add payer fields, Razorpay enrichment, create profile on installment #1 |
| 11 | `apps/admin/src/components/crm/ApplicationSection.tsx` | Add payment detail section |

## Database Migration

| # | Migration | Changes |
|---|-----------|---------|
| 12 | `supabase/migrations/YYYYMMDD_payment_payer_fields.sql` | Add payer_name, payer_relationship to payments |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Razorpay test card interaction flaky in Playwright | Retry logic + screenshot on failure for debugging |
| WhatsApp templates not approved → silent failures | Graceful logging, test verifies log output not actual delivery |
| Application number enumeration | Rate limit the `/api/payment/details` endpoint |
| Double payment race condition | Check payment status before creating order, DB constraint on unique paid payment per lead |
| Teams webhook URL rotated | Env var, easy to update without code change |
| Notification failures block payment | Already non-blocking (Promise.allSettled), verify in tests |

---

## Verification Plan

1. **Migration**: Apply payer fields to staging via Supabase MCP
2. **Payment page**: Load `/pay?app=NERAM-XXXX` for an approved application, verify fee display
3. **Payment flow**: Complete a test payment, verify receipt, verify DB records (payment, lead, student_profile)
4. **Notifications**: Check Telegram group, admin bell, email inbox after each event
5. **Teams webhook**: Verify Adaptive Card appears in configured Teams channel
6. **Onboarding**: Login as test student after payment, verify onboarding accessible
7. **Admin view**: Check payment details in CRM for the test student
8. **E2E tests**: Run full suite, all tests pass
9. **Mobile**: Test payment page at 375px viewport, no overflow, touch targets OK
