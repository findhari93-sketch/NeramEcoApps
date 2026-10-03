# Neram Ecosystem — Enrollment, Tools & Application UX Architecture

## 1. Purpose

This document is the implementation specification for the agreed future-state Neram ecosystem.

The objective is to:

1. Simplify the Neram Classes application/enrollment experience.
2. Remove the mandatory admin-approval bottleneck from the normal enrollment journey.
3. Allow eligible students to complete enrollment and payment self-service.
4. Automatically provision the student's Neram/Microsoft learning access after verified payment.
5. Introduce Nera as an optional conversational/voice application assistant.
6. Support document-assisted autofill without forcing document upload.
7. Keep Neram Nexus focused on enrolled students.
8. Build Neram Tools as a separate public/self-service product with free and premium access.
9. Create a dedicated Tools Admin application for content, subscriptions, entitlements and analytics.
10. Share a common Neram identity across products without forcing Tools-only users into Microsoft/Teams infrastructure.

---

# 2. Final Product Architecture

Neram should be treated as an ecosystem with clearly separated product responsibilities.

```text
                         NERAM ECOSYSTEM

                    ┌───────────────────┐
                    │   NERAM ACCOUNT   │
                    │ Shared Identity   │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
        NERAM TOOLS     NERAM CLASSES      MARKETING
        Self-service     Teacher-led       Discovery
              │               │
              │               ▼
              │           Enrollment
              │               │
              │        ┌──────┴──────┐
              │        ▼             ▼
              │      NEXUS        MICROSOFT
              │                    TEAMS
              │
              └── Premium access can be
                  included for class students
```

## Product boundaries

### Neram Marketing

Purpose:
- SEO/AEO discovery
- Course discovery
- Exam information
- Trust building
- Conversion into either Tools or Classes

### Neram Tools

Purpose:
- Public exam preparation
- Free tools
- Premium question bank
- Previous-year papers
- Solutions
- Mock tests
- Study materials
- AI study features
- Independent/self-service preparation

### Neram Classes

Purpose:
- Teacher-led structured coaching
- Course enrollment
- Standardized course pricing
- Admission/enrollment
- Payment
- Student onboarding

### Neram Nexus

Purpose:
- Enrolled-student learning environment
- Classes
- Assignments
- Progress
- Resources
- Student services
- Microsoft Teams integration

### Microsoft / Teams

Purpose:
- Organizational/student Microsoft identity
- Teams access
- Course collaboration
- Other Microsoft services required by enrolled students

### Nexus Admin

Purpose:
- Class/student operations
- Teachers
- Courses
- Enrollments
- Exceptions
- Microsoft/Teams operations
- Admissions support where required

### Tools Admin

Purpose:
- Tools content
- Question bank
- PYQs
- Solutions
- Mock tests
- Products
- Plans
- Subscriptions
- Entitlements
- Coupons/discounts
- Tools analytics
- Tools user management

---

# 3. Core UX Principle

The system should optimize for:

> **"The student always knows what to do next and why Neram is asking for it."**

Do not optimize only for form completion.

Use this sequence:

**Eliminate → Automate → Simplify → Verify → Complete**

---

# 4. Two Separate Conversion Journeys

## A. Neram Classes enrollment

The user intent is:

> "I want to join a Neram course."

Flow:

```text
Course discovery
    ↓
Course details
    ↓
Start enrollment
    ↓
Identify user
    ↓
Autofill / Nera / Document / Manual
    ↓
Course selection
    ↓
Review
    ↓
Standard fee
    ↓
Payment
    ↓
Payment verification
    ↓
Enrollment created
    ↓
Automatic provisioning
    ↓
Microsoft account
    ↓
Nexus + Teams
    ↓
Student onboarding
    ↓
Start learning
```

There should be no mandatory admin approval in the normal path.

---

## B. Neram Tools subscription

The user intent is:

> "I want study materials/tools to prepare independently."

Flow:

```text
Search / SEO / Social / Referral
    ↓
Neram Tools
    ↓
Free content/tools
    ↓
Free account
    ↓
Use Tools
    ↓
Premium feature
    ↓
Subscription
    ↓
Payment
    ↓
Tools entitlement
    ↓
Premium access
```

Tools-only users do NOT need:
- Microsoft account
- Microsoft Teams
- Nexus enrollment
- Teacher/admin admission approval

---

# 5. Application Form — Final UX Direction

## Application should mean "Class Enrollment"

The application should not contain:
- Tools subscription selection
- Microsoft account setup
- Teams setup
- General product registration complexity
- Unnecessary marketing content

The application is specifically for students joining a Neram course.

---

# 6. Existing User vs New User

## Existing Neram user

If the user already has:
- Google identity
- phone
- name
- email
- profile information

then the application should recognize the existing Neram account.

Example:

> **Welcome back, Arun 👋**
>
> We already have some of your details.
> You can review or edit them before continuing.

Prefill known information.

Do not ask the user to repeatedly:
- log in
- enter email
- verify the same phone
- re-enter name

---

## New user

A new user should not be forced to understand account creation before starting.

Provide:

### Start your application

**Option 1 — Talk to Nera**
> Tell Nera about yourself and she can fill the form for you.

**Option 2 — Upload a document**
> Use a supported document to autofill available details.

**Option 3 — Fill manually**
> Enter your details yourself.

Existing users can additionally see:

> Already have a Neram account? Sign in.

---

# 7. Nera Application Assistant

Nera should be more than a chatbot.

Nera should become an:

> **Application Copilot**

## Voice interaction

Users can say something like:

> "My name is Arun Kumar. My father's name is Rajendran Kumar. I am from Madurai. My date of birth is 12 March 2007. My phone number is 9876543210."

Nera extracts structured fields.

Example:

```json
{
  "full_name": "Arun Kumar",
  "father_name": "Rajendran Kumar",
  "date_of_birth": "2007-03-12",
  "phone": "9876543210",
  "city": "Madurai",
  "state": "Tamil Nadu"
}
```

Then show:

> **I understood these details**

and allow the user to:
- review
- edit
- confirm

Never silently submit extracted information.

---

## Voice discoverability

Do not hide the capability behind a generic chat icon.

Use:

> **🎙 Talk to Nera**
>
> Speak naturally. Nera will fill the form for you.

Button:

> **Start speaking**

After activation:

> **Listening…**

The normal manual form remains available.

Users who do not want AI/voice can close the assistant and continue manually.

---

# 8. Document-Assisted Autofill

Document upload is optional.

Recommended UI:

> **Save time with automatic fill**
>
> Upload a supported document and we'll try to fill your details automatically.
>
> **Optional**

Buttons:

- `Upload & autofill`
- `Enter details manually`

## Important privacy requirement

Never claim:

> "Your document will not be stored."

unless the technical implementation guarantees that.

Use wording that exactly matches the real architecture.

If temporary server processing is used:

> **Privacy**
>
> Your document is temporarily processed to extract the information you requested. It is not added to your application documents unless you choose to save it.

If true local processing is implemented:

> **Private processing**
>
> Your document is processed on your device and isn't uploaded or stored.

## OCR flow

```text
Upload
   ↓
Validate
   ↓
Temporary processing
   ↓
OCR
   ↓
Extract structured data
   ↓
Normalize/validate
   ↓
Show extracted data
   ↓
User confirms
   ↓
Save confirmed application data
   ↓
Delete temporary document
```

Do not immediately write raw OCR output into the permanent student record.

---

# 9. Father Name Is Required Business Data

Father's name should remain in the application.

Reason:
- Students can have identical names.
- Neram uses student name + father's name for identification.
- Microsoft Teams naming/identification uses this context.
- It helps staff differentiate students.

Recommended UI:

> **Student name**
>
> Enter the student's full name as it should appear on Neram records.

> **Father's name**
>
> Used to distinguish students with similar names and for student records.

Do not make the father-name field disappear just to shorten the form.

---

# 10. Student ID Must Be the Stable Identifier

Do not use:

```text
student_name + father_name
```

as the actual primary identifier.

Use immutable IDs:

```text
user_id
application_id
student_id
enrollment_id
```

Human-readable naming can be generated from these.

Example:

```text
Student ID: NC26-001284
Student: Arun Kumar
Father: Rajendran Kumar
```

The Student ID becomes the stable reference across:
- Supabase
- Nexus
- Microsoft
- Teams
- payments
- enrollment
- support
- analytics

---

# 11. PIN/Location UX

Keep the existing PIN-based workflow.

The student should be able to edit the PIN.

Example:

```text
PIN code *
[ 622001 ]

✓ Pudukkottai, Tamil Nadu

City
Pudukkottai

State
Tamil Nadu

Country
India
```

PIN lookup should populate:
- city
- state
- country where supported

Allow editing when necessary.

## Location detection

Do not make browser location detection the primary mechanism.

Keep it as an optional secondary action:

> Use my current location

If it fails:

> **We couldn't access your location.**
>
> You can enter your PIN code instead.

---

# 12. Application Step Structure

Use three or four simple conceptual steps.

Recommended:

```text
1. About you
2. Your course
3. Review
4. Payment
```

The UI should not expose internal database terminology.

Avoid:
- Admin details
- Application metadata
- Internal processing states

---

# 13. Visual Design Direction for Application

The current form is too visually heavy.

Application mode should use a dedicated application shell.

Example:

```text
┌─────────────────────────────────────────────────┐
│ Neram Classes                         Need help? │
├─────────────────────────────────────────────────┤
│                                                 │
│ About you                              1 of 3  │
│ ●────────────○────────────○                      │
│                                                 │
│ Tell us about yourself                          │
│                                                 │
│ [ Talk to Nera ]                                │
│                                                 │
│ or                                              │
│                                                 │
│ [ Upload & autofill ]                           │
│                                                 │
│ or                                              │
│                                                 │
│ [ Enter details manually ]                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

Reduce:
- oversized hero
- excessive card padding
- marketing sections
- footer content
- persistent assistant footprint
- unrelated navigation

The application should feel like a focused task.

---

# 14. Header/Footer Separation

Do not remove SEO content from the public marketing website.

Instead create two shells.

## Marketing shell

Contains:
- full header
- navigation
- SEO/AEO content
- footer
- resources
- course marketing

## Application shell

Contains:
- Neram branding
- application progress
- help/Nera
- save/exit if supported

The transactional application does not need a large SEO footer.

---

# 15. Course Pricing and Enrollment

The normal enrollment path should use standardized pricing.

Example structure:

```text
Course
NATA 1 Year

Duration
12 months

Standard fee
₹XX,XXX

Discount
₹X,XXX

Payable
₹XX,XXX
```

The exact final prices must be managed from configuration/admin rather than hard-coded into UI code.

---

# 16. Discounts

Discounts should be an exception, not a reason to block every student.

Normal path:

```text
Standard fee
    ↓
Review
    ↓
Pay
    ↓
Enroll
```

Discount path:

```text
Standard fee
    ↓
Request discount / enter eligible code
    ↓
Discount validation/review if required
    ↓
Updated offer
    ↓
Pay
```

Support:
- predefined coupon codes
- referral discounts
- campaign discounts
- eligible student discounts
- manual exception handling where necessary

Do not require admin review for every enrollment simply because some users may request discounts.

---

# 17. Payment Trust UX

Before payment, show a clear enrollment summary.

Example:

# Your enrollment

**NATA 2026 — 1 Year Program**

- Duration
- Mode
- Classes
- Included resources
- Student access
- Microsoft Teams
- Nexus access

Then:

### Fee

| Item | Amount |
|---|---:|
| Course fee | ₹XX,XXX |
| Discount | -₹X,XXX |
| **Payable** | **₹XX,XXX** |

Then:

> **What happens after payment?**

- Enrollment is confirmed after payment verification.
- Student account provisioning starts automatically.
- Microsoft account is created where required.
- Nexus access is created.
- Teams access is provisioned.
- Onboarding instructions are shown.

Button:

> **Pay & Enroll — ₹XX,XXX**

---

# 18. Payment Must Trigger Enrollment

The normal flow should change from:

```text
Application
    ↓
Admin approval
    ↓
Payment
    ↓
Manual enrollment
```

to:

```text
Application
    ↓
Course + fee review
    ↓
Payment
    ↓
Trusted payment verification
    ↓
Enrollment
    ↓
Automatic provisioning
```

Human support remains available but is not a mandatory dependency.

---

# 19. Razorpay Integration

Never rely only on frontend payment success.

Use:

```text
Student
   ↓
Razorpay
   ↓
Webhook
   ↓
Backend verification
   ↓
Payment captured
   ↓
Enrollment created
```

Persist relationships such as:

```text
user_id
application_id
enrollment_id
course_id
fee_plan_id
amount
discount
razorpay_order_id
razorpay_payment_id
payment_status
```

Validate webhook authenticity and payment state on the backend.

---

# 20. Enrollment Provisioning

After verified payment:

```text
PAYMENT_CAPTURED
       ↓
ENROLLMENT_CREATED
       ↓
IDENTITY_PROVISIONING
       ↓
MICROSOFT_ACCOUNT_CREATED
       ↓
LICENSE_ASSIGNED
       ↓
TEAMS_ACCESS_PROVISIONING
       ↓
NEXUS_ACCESS_CREATED
       ↓
ONBOARDING_READY
       ↓
ENROLLED
```

The backend should treat each stage as a reliable state.

Store:

```text
status
attempt_count
last_attempt_at
last_error
completed_at
```

Support retries.

Admin should handle exceptions rather than manually executing every step.

---

# 21. Microsoft Account Provisioning

For enrolled students only.

Conceptual flow:

```text
Verified payment
    ↓
Create Microsoft/Entra identity
    ↓
Assign required license
    ↓
Add to appropriate Team
    ↓
Create/activate Nexus access
```

Use Microsoft Graph and the correct tenant permissions/licensing.

Do not expose permanent passwords in the application database.

Prefer a secure first-login/activation flow where possible.

If a temporary password is required, force a password change at first sign-in.

---

# 22. Post-Payment Onboarding

Immediately after payment:

# 🎉 You're enrolled!

> Welcome to Neram Classes.

Show:

### Enrollment

**NATA 2026 — 1 Year**

### Student ID

`NC26-001284`

### Account setup

```text
✓ Payment confirmed
✓ Student enrollment created
✓ Neram account ready
● Microsoft account setup
○ Teams access
○ Nexus access
```

If provisioning is asynchronous, do not block the student on a loading screen.

The student should be able to leave and return to the onboarding page.

---

# 23. Student Onboarding Screen

After provisioning:

# You're all set 🎓

### Your accounts

| Service | Status |
|---|---|
| Neram Nexus | Ready |
| Microsoft Account | Ready |
| Teams | Ready |
| Course access | Ready |

Buttons:

- `Open Nexus`
- `Open Microsoft Teams`
- `View onboarding`

Show:
- Student ID
- course
- start date
- class schedule when available
- support contact
- first steps

The goal is to eliminate questions such as:
- "What is my ID?"
- "Where is my password?"
- "Where is my Teams class?"
- "Where do I start?"

---

# 24. Nexus Admin Becomes Exception Management

The admin experience should evolve from:

> "Admin manually moves every student through the system."

to:

> "The system processes normal students automatically; admin handles exceptions."

Example:

| Student | Payment | Microsoft | Teams | Nexus | Status |
|---|---|---|---|---|---|
| Arun | ✓ | ✓ | ✓ | ✓ | Complete |
| Priya | ✓ | ✓ | ⚠ | ✓ | Retry Teams |
| Karthik | ✓ | ✕ | — | ✓ | Account error |

This is the desired operating model.

---

# 25. Neram Tools — Separate Public Product

Neram Tools should be a standalone product for anyone preparing for the exam.

It should not be treated as "Nexus for non-students."

Positioning:

> **Neram Tools — Prepare smarter for your exam.**

Possible capabilities:
- Question bank
- Previous-year papers
- Detailed solutions
- Topic practice
- Mock tests
- Study materials
- Calculators
- AI explanations
- Study planner
- Progress tracking
- Drawing/other relevant tools

---

# 26. Tools Users Do NOT Need Microsoft Accounts

Tools-only users should use Neram identity/authentication.

Do not create:
- Microsoft account
- Teams membership
- Nexus enrollment

for a user who only purchases Tools.

Conceptually:

```text
Tools user
   ↓
Neram Account
   ↓
Tools Subscription
   ↓
Tools Entitlements
   ↓
Premium access
```

---

# 27. Shared Identity

There should be one common Neram identity where possible.

```text
NERAM ACCOUNT
     │
     ├── Tools
     │     └── Subscription
     │
     └── Classes
           └── Enrollment
                 ├── Nexus
                 └── Microsoft/Teams
```

Important distinction:

> **Identity ≠ Subscription ≠ Enrollment ≠ Microsoft Account**

A user can have a Neram account without being enrolled in classes.

---

# 28. Tools Subscription Model

Do not hard-code a single `isPremium` flag.

Use plans and entitlements.

Example:

```text
subscription
    plan_id
    user_id
    status
    starts_at
    expires_at
    payment_id
```

Entitlements:

```text
PYQ
SOLUTIONS
QUESTION_BANK
MOCK_TESTS
AI_EXPLANATIONS
STUDY_MATERIALS
```

Possible future plans:

```text
FREE
STUDY_PREMIUM
EXAM_PASS
CLASS_STUDENT
```

Exact pricing should be validated commercially.

---

# 29. Class Students and Tools Premium

A class enrollment can automatically grant Tools entitlements.

Example:

```text
Tools-only user:
    Tools Premium ✓
    Nexus ✕
    Teams ✕

Class student:
    Tools Premium ✓
    Nexus ✓
    Teams ✓
    Microsoft ✓
```

The class student's Tools access should come from the enrollment entitlement rather than requiring another purchase.

---

# 30. Tools Admin

Create a dedicated Tools Admin application.

Recommended modules:

```text
Dashboard
Users
Questions
Question Bank
Previous Year Papers
Solutions
Mock Tests
Study Materials
Products
Plans
Subscriptions
Entitlements
Coupons
Payments
Analytics
Settings
```

---

# 31. Tools Content Management

Question model should support fields such as:

```text
question_id
exam
year
subject
topic
subtopic
question_text
options
correct_answer
solution
difficulty
tags
content_status
access_level
published_at
```

Support:

```text
Draft
Review
Published
Archived
```

---

# 32. Do Not Hard-Code Premium Access in Content

Avoid:

```text
question.isPremium = true
```

as the only authorization mechanism.

Prefer:

```text
Content
   ↓
Access Rule
   ↓
Entitlement / Plan
```

This allows future packages without rewriting content logic.

---

# 33. Tools Revenue Funnel

The intended funnel is:

```text
SEO / Search / Social
        ↓
Free Tools
        ↓
Free Account
        ↓
Use content
        ↓
Premium feature
        ↓
Tools subscription
        ↓
Trust
        ↓
Optional Classes conversion
```

This is important because a user may not initially trust Neram enough to purchase a full coaching program.

A lower-cost Tools product lets the student experience Neram first.

---

# 34. Tools → Classes Cross-Sell

Inside Tools:

> **Want teacher-led preparation?**
>
> Explore Neram's structured coaching programs.

`Explore Classes`

Inside Classes:

> **Your Tools Premium access is included with your enrollment.**

`Open Neram Tools`

The products should complement one another.

---

# 35. Marketing Architecture

Public marketing should support both journeys.

Example navigation:

```text
Courses
Exam Hub
Tools
Counselling
About
```

Tools should be discoverable through SEO/AEO.

Potential public pages:

```text
/tools/nata-question-bank
/tools/nata-previous-year-papers
/tools/nata-maths-questions
/tools/nata-drawing-questions
/tools/nata-solutions
/tools/nata-syllabus
/tools/nata-calculator
```

Public pages can provide free value and convert users into Tools users.

---

# 36. Application Recovery Path

If a user starts Class enrollment but decides they are not ready:

> **Not ready for coaching?**

> Start with Neram Tools and prepare independently.

`Explore Neram Tools →`

This prevents the application flow from ending in a dead end.

---

# 37. Tools Recovery/Upsell Path

If a Tools user repeatedly uses premium preparation content:

> **Want structured guidance from teachers?**

`Explore Neram Classes →`

This creates the reverse funnel.

---

# 38. Suggested Monorepo Structure

Conceptually:

```text
apps/
  marketing/
  nexus/
  tools/
  nexus-admin/
  tools-admin/

packages/
  ui/
  auth/
  database/
  payments/
  content/
  entitlements/
  analytics/
  ai/
  microsoft/
```

The exact names can follow the existing monorepo conventions.

---

# 39. Shared Services

Prefer reusable services/modules for:

### Auth
Common Neram identity.

### Database
Shared models where appropriate.

### Payments
Razorpay integration.

### Entitlements
Central access-control logic.

### AI
Nera/AI functionality.

### Analytics
Cross-product events.

### Microsoft
Only used by enrolled-class workflows.

Do not force Microsoft dependencies into Tools.

---

# 40. Recommended Data Model

Conceptual entities:

```text
users
profiles

applications
enrollments

courses
course_plans
fee_plans

payments
discounts
coupons

subscriptions
subscription_plans

entitlements
entitlement_sources

questions
question_options
solutions
papers
paper_questions
study_materials
mock_tests

microsoft_identities
team_memberships

onboarding_tasks
provisioning_events
```

Avoid putting every business concept into the `users` table.

---

# 41. State Models

## Application

```text
DRAFT
SUBMITTED
READY_FOR_PAYMENT
PAYMENT_PENDING
CONVERTED_TO_ENROLLMENT
ABANDONED
CANCELLED
```

If there is no admin approval in the normal path, do not create an artificial `WAITING_FOR_ADMIN_APPROVAL` state.

---

## Enrollment

```text
PENDING_PAYMENT
PAYMENT_CONFIRMED
PROVISIONING
ACTIVE
SUSPENDED
CANCELLED
```

---

## Provisioning

```text
PENDING
IN_PROGRESS
COMPLETED
FAILED
RETRYING
```

---

## Subscription

```text
TRIAL
ACTIVE
PAST_DUE
CANCELLED
EXPIRED
REFUNDED
```

---

# 42. Analytics Events

Track the entire funnel.

## Application

```text
application_started
autofill_selected
voice_started
voice_completed
document_upload_started
document_processed
manual_entry_started
course_selected
application_reviewed
payment_started
payment_completed
```

## Enrollment

```text
enrollment_created
microsoft_provisioning_started
microsoft_account_created
license_assigned
teams_provisioning_started
teams_provisioning_completed
nexus_access_created
onboarding_started
onboarding_completed
```

## Tools

```text
tools_landing_viewed
question_viewed
premium_locked_content_viewed
subscription_started
subscription_checkout_started
subscription_payment_completed
subscription_cancelled
premium_feature_used
class_cta_clicked
```

---

# 43. Key Product Metrics

## Classes

Track:

- Application start rate
- Application completion rate
- Payment initiation rate
- Payment completion rate
- Enrollment completion rate
- Provisioning failure rate
- Onboarding completion rate
- Time from payment to active student

Primary goal:

> Reduce the percentage of students who submit information but never become enrolled.

---

## Tools

Track:

- SEO traffic
- Free account conversion
- Free → premium conversion
- Subscription retention
- Premium content engagement
- Question completion
- Mock-test completion
- AI usage
- Tools → Classes conversion

---

# 44. UX Writing Principles

Use direct, reassuring language.

Prefer:

> **Complete your application in about 2–3 minutes.**

over:

> Fill in your details to apply for our courses. It only takes a few minutes.

Prefer:

> **About you**

over:

> Personal Information

Prefer:

> **Talk to Nera**

over:

> AI Assistant

Prefer:

> **We found these details. Please check them before continuing.**

over:

> AI successfully extracted your information.

Prefer:

> **Pay & Enroll**

over:

> Submit Application

when payment actually completes enrollment.

---

# 45. Trust Principles

Never use trust-building claims that the system cannot guarantee.

For example, do not promise:

> "Your document will never be stored."

unless technically enforced.

Do not imply:

> "No additional fees."

unless this is genuinely true.

Instead show:
- exact course
- exact duration
- exact fee
- included services
- payment recipient
- refund/cancellation policy
- support route
- what happens after payment

Trust should come from transparency, not persuasion.

---

# 46. Security Principles

For document uploads:

- Validate file type.
- Validate actual file content.
- Limit file size.
- Use safe/random filenames.
- Scan files where appropriate.
- Do not expose uploaded documents publicly.
- Avoid logging document contents.
- Use temporary storage where possible.
- Delete temporary files after processing.
- Restrict access.
- Audit access where required.

For payments:

- Verify on backend.
- Validate webhook signatures.
- Do not trust frontend-only payment status.

For Microsoft:

- Use least-privilege permissions.
- Do not store unnecessary credentials.
- Use secure activation/first-login mechanisms.
- Keep Microsoft provisioning separate from Tools.

---

# 47. Implementation Priority

## Phase 1 — Fix Classes Enrollment

1. Separate application shell from marketing shell.
2. Remove unnecessary visual bulk.
3. Keep Father Name.
4. Keep editable PIN.
5. Improve existing-user autofill.
6. Separate login from application intent.
7. Implement Nera voice entry point.
8. Implement application review.
9. Standardize fee presentation.
10. Implement self-service payment.
11. Connect verified payment to enrollment.
12. Build provisioning state machine.
13. Automate Microsoft/Nexus/Teams provisioning.
14. Build post-payment onboarding.

---

## Phase 2 — Tools Foundation

1. Create Tools Admin.
2. Create Tools user authentication.
3. Create question/content models.
4. Create content management.
5. Create product/plan models.
6. Create subscription model.
7. Create entitlement model.
8. Integrate payment.
9. Protect premium content.
10. Build subscription/account screens.

---

## Phase 3 — Tools Premium MVP

Start with:

- Previous-year papers
- Question bank
- Solutions
- Topic practice
- Basic mock tests

Do not attempt every feature initially.

Validate willingness to pay.

---

## Phase 4 — Advanced Tools

Add:

- AI explanations
- Personalized practice
- Progress analytics
- Study planner
- Voice interaction
- Advanced mock tests
- Adaptive recommendations

---

## Phase 5 — Cross-Product Ecosystem

Connect:

```text
Tools Premium
    ↕
Neram Account
    ↕
Class Enrollment
    ↕
Nexus
    ↕
Microsoft
```

Grant appropriate Tools entitlements automatically to active class students.

---

# 48. Final Decisions

## Decision 1
**Application remains exclusively for Neram Classes enrollment.**

## Decision 2
**Tools subscription is not part of the Class application form.**

## Decision 3
**Neram Tools becomes a separate public/self-service product.**

## Decision 4
**Tools users do not receive Microsoft accounts or Teams access.**

## Decision 5
**Neram Account is the shared identity layer.**

## Decision 6
**Nexus remains the enrolled-student learning platform.**

## Decision 7
**Microsoft provisioning happens only after verified Class enrollment/payment.**

## Decision 8
**Normal Class enrollment does not require manual admin approval.**

## Decision 9
**Admin becomes an exception-management layer rather than a mandatory workflow step.**

## Decision 10
**Standardized pricing is shown before payment.**

## Decision 11
**Discounts are handled as explicit exceptions/coupons rather than blocking every enrollment.**

## Decision 12
**Nera supports optional conversational and voice-based form filling.**

## Decision 13
**Document autofill is optional and must have accurate privacy messaging.**

## Decision 14
**Extracted data must be user-reviewed before being committed.**

## Decision 15
**PIN lookup remains and should continue auto-filling location data while allowing user edits.**

## Decision 16
**Tools uses subscriptions + entitlements rather than a simple `isPremium` flag.**

## Decision 17
**Class students can receive Tools Premium through enrollment-based entitlements.**

## Decision 18
**Tools gets its own Admin application.**

## Decision 19
**Marketing remains SEO/AEO focused; transactional application UI remains focused and minimal.**

## Decision 20
**The system should optimize for a complete student journey, not merely form completion.**

---

# 49. Target End State

The final student experience should look like this:

```text
                         NERAM

                           │
              ┌────────────┴────────────┐
              │                         │
        I want to prepare          I want coaching
              │                         │
              ▼                         ▼
        NERAM TOOLS               NERAM CLASSES
              │                         │
        Free / Premium              Apply
              │                         │
        Subscription               Autofill
              │                  Nera / Document
              │                    / Manual
              │                         │
              │                    Choose course
              │                         │
              │                    Review + fee
              │                         │
              │                       Pay
              │                         │
              │                   Auto enrollment
              │                         │
              │                 Microsoft provisioning
              │                         │
              │                    Nexus + Teams
              │                         │
              └──────────┬──────────────┘
                         │
                   NERAM ACCOUNT
                         │
                    Shared identity
```

The strategic goal is:

> **Tools scales the Neram brand and revenue beyond the physical/class capacity of the coaching business, while Nexus remains the premium enrolled-student environment.**

The architecture should allow a student to move naturally from:

**Free → Tools Premium → Classes → Nexus**

without creating duplicate identities or rebuilding their profile.

---

# 50. Definition of Done

The redesign is considered successful when:

### Class enrollment

- A new student can complete enrollment without admin approval.
- Existing users are automatically recognized and their information is reused.
- Nera can collect information through voice.
- Users can still manually fill the form.
- Document autofill is optional.
- Father Name remains available for student differentiation.
- PIN lookup remains editable.
- Student sees exact course and fee before payment.
- Payment is verified server-side.
- Successful payment creates enrollment.
- Microsoft account provisioning starts automatically.
- Nexus access is created automatically.
- Teams access is provisioned automatically.
- Student receives a dedicated onboarding experience.
- Admin handles exceptions rather than normal provisioning.

### Tools

- A public user can create a Neram account.
- A user can use free Tools without being a class student.
- A user can subscribe to premium Tools.
- Premium content is protected through entitlements.
- Tools users do not require Microsoft accounts.
- Class students can receive Tools Premium automatically.
- Tools Admin can manage content.
- Tools Admin can manage plans/subscriptions.
- Tools Admin can manage entitlements.
- Tools Admin can monitor failures and revenue.
- Tools can cross-sell Classes without forcing enrollment.

---

# 51. Guiding Principle for Future Features

Before adding any new feature, ask:

1. **Which product owns this feature?**
2. **Is it identity, content, entitlement, enrollment, or learning?**
3. **Does the user actually need to see this step?**
4. **Can the system automate it?**
5. **Does it create a dependency on admin?**
6. **Does it require Microsoft infrastructure?**
7. **Can a Tools-only user use it without becoming a student?**
8. **Can a Class student receive it automatically through an entitlement?**
9. **Does the user understand why we are asking for the information?**
10. **Can the user always see what happens next?**

The default architectural direction should be:

> **Automate the normal path. Isolate exceptions. Keep products focused. Share identity. Control access through entitlements.**
