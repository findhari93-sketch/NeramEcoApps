# Neram Ecosystem --- Unified User, Learner Lifecycle, Analytics & Feedback Architecture

**Document:** Product & Technical Architecture Specification\
**Version:** 1.0\
**Date:** 2026-09-25\
**Status:** Proposed --- implementation baseline\
**Applications:** Marketing App, Nexus Admin App, AiArchitect Tools App,
Student App / future ecosystem apps

------------------------------------------------------------------------

## 1. Purpose

This document defines the recommended architecture for managing users
across the Neram ecosystem.

The goal is to move from a simple `users` table into a unified
**Identity + Learner Lifecycle + Enrollment + Entitlements + CRM +
Analytics + Feedback & Outcomes** platform.

The architecture is designed around the actual Neram business model:

-   Users may discover Neram through the marketing website.
-   Users may register through Google, phone, or other supported
    authentication methods.
-   Users may use AiArchitect tools without becoming students.
-   Users may submit an application or enroll directly.
-   Students receive broader product access based on
    enrollment/entitlements.
-   The same preparation program can support students preparing for
    multiple exams.
-   NATA/JEE should be captured as learner information, but should
    **not** be the primary user segmentation when there is no difference
    in teaching, pricing, or access.
-   After completing their preparation journey, users may become alumni,
    dormant users, or eventually deactivated users.
-   Feedback and learner outcomes should feed both product improvement
    and authentic public content.
-   Analytics should identify product/UX problems such as signup and
    phone-verification abandonment.

------------------------------------------------------------------------

# 2. Core Product Principle

> **Do not organize users primarily around exams. Organize users around
> their relationship and lifecycle with Neram.**

The primary model is:

``` text
User
  |
  +-- Identity
  |
  +-- Learner Profile
  |
  +-- Learner Lifecycle
  |
  +-- Preparation Goal
  |
  +-- Target Exams
  |
  +-- Enrollment
  |
  +-- Entitlements
  |
  +-- CRM / Communication
  |
  +-- Product Activity
  |
  +-- Feedback & Outcomes
  |
  +-- Audit History
```

Exam information such as NATA/JEE is meaningful context, but should not
automatically create separate products, enrollments, fees, or user
categories.

------------------------------------------------------------------------

# 3. Ecosystem Architecture

The Neram ecosystem should operate around one canonical user identity.

``` text
                         NERAM ECOSYSTEM
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
       Marketing App      AiArchitect App    Student App
              |                |                |
              +----------------+----------------+
                               |
                               v
                    +----------------------+
                    |  Identity / User     |
                    |  Platform            |
                    +----------+-----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
      Learner              Enrollment            Analytics
      Profile              & Access              & Events
          |                    |                    |
          +--------------------+--------------------+
                               |
                    +----------+----------+
                    |                     |
                    v                     v
                   CRM            Feedback & Outcomes
                    |                     |
                    +----------+----------+
                               |
                               v
                         Nexus Admin
```

Nexus Admin should consume the same underlying domain model rather than
maintaining an independent user interpretation.

------------------------------------------------------------------------

# 4. Application Responsibilities

## 4.1 Marketing App

Primary responsibilities:

-   SEO/AEO content
-   Landing pages
-   Course/program discovery
-   Tool discovery
-   User registration
-   Lead capture
-   Acquisition attribution
-   Anonymous visitor tracking
-   Feedback/review entry points
-   Public learner stories
-   Public review pages

The marketing app should not own the canonical user identity.

------------------------------------------------------------------------

## 4.2 AiArchitect Tools App

AiArchitect is the product/app containing useful architecture-exam
tools.

Examples:

-   NATA Calculator
-   College Predictor
-   Exam-related tools
-   Future preparation utilities
-   Other architecture-related calculators/tools

Responsibilities:

-   Authenticate users using the shared identity
-   Track product usage
-   Track tool-level events
-   Support anonymous-to-known user conversion
-   Provide appropriate access based on entitlements
-   Collect product feedback
-   Contribute activity events to the central analytics model

------------------------------------------------------------------------

## 4.3 Nexus Admin App

Nexus is the operational/admin interface.

Responsibilities:

-   User 360°
-   Identity management
-   Learner profile management
-   Lifecycle management
-   Enrollment management
-   Entitlements/access management
-   CRM
-   Communication history
-   Analytics
-   Feedback moderation
-   Learner outcomes
-   Deactivation workflows
-   Audit logs
-   Data-quality management

------------------------------------------------------------------------

# 5. User Lifecycle

Do not use a single overloaded `status` field.

Use multiple dimensions.

## 5.1 Account Status

``` text
ACTIVE
SUSPENDED
DEACTIVATION_PENDING
DEACTIVATED
DELETED
```

## 5.2 Learner Lifecycle

``` text
PROSPECT
LEAD
APPLICANT
ENROLLED
ACTIVE_STUDENT
EXAM_COMPLETED
ALUMNI
DORMANT
```

Not every user must pass through every state.

Example:

``` text
Google Signup
    |
    v
Registered User
    |
    v
No meaningful activity
    |
    v
Dormant
```

Another:

``` text
Marketing Visitor
    |
    v
Lead
    |
    v
Demo
    |
    v
Enrollment
    |
    v
Active Student
    |
    v
Exam Completed
    |
    v
Alumni
```

------------------------------------------------------------------------

# 6. Engagement State

Keep engagement separate from lifecycle.

Suggested values:

``` text
NEW
ENGAGED
LOW_ENGAGEMENT
INACTIVE
DORMANT
```

A user can therefore be:

``` text
Lifecycle: ACTIVE_STUDENT
Engagement: LOW_ENGAGEMENT
Account: ACTIVE
```

This is much more useful than trying to represent everything with one
status.

------------------------------------------------------------------------

# 7. CRM Stage

CRM should also be independent.

Suggested values:

``` text
NEW_LEAD
CONTACTED
RESPONDED
COUNSELLING
DEMO_SCHEDULED
DEMO_COMPLETED
INTERESTED
PAYMENT_PENDING
CONVERTED
NOT_INTERESTED
LOST
```

Example:

``` text
Lifecycle: LEAD
Engagement: HIGH
CRM Stage: DEMO_COMPLETED
```

------------------------------------------------------------------------

# 8. Learner Profile

A learner profile can contain:

``` text
user_id
name
class / academic_level
school / institution (where appropriate)
location
preparation_goal
target_year
profile_completion
```

Important:

Do not force information that the user has not provided.

Use:

``` text
UNKNOWN
NOT_PROVIDED
```

rather than guessing.

------------------------------------------------------------------------

# 9. Target Exams

NATA/JEE should be represented as **Target Exams**, not as the primary
product or enrollment category.

Example:

``` text
Target Exams:
- NATA
- JEE
```

A student preparing for both should still have:

``` text
One User
One Preparation Program
One Enrollment
```

unless the commercial/business model changes in the future.

The exam information can be used for:

-   Personalization
-   Relevant content
-   Exam reminders
-   Analytics
-   Product recommendations
-   Communication
-   Understanding learner intent

It should not automatically determine:

-   Pricing
-   Enrollment count
-   Teaching team
-   Access tier
-   Separate student identity

------------------------------------------------------------------------

# 10. Preparation Goal

Represent the learner's overall goal separately from target exams.

Example:

``` text
Preparation Goal:
Architecture Entrance Preparation
```

This better reflects the current business model:

``` text
Student
   |
   v
Architecture Entrance Preparation
   |
   +-- NATA
   +-- JEE
```

------------------------------------------------------------------------

# 11. Identity Architecture

A canonical `users` record should represent the person/account.

Authentication methods should be represented separately.

Recommended conceptual model:

``` text
users
-----
id
display_name
account_status
created_at
updated_at
last_meaningful_activity_at

user_identities
---------------
id
user_id
provider
provider_user_id
email
phone
email_verified
phone_verified
created_at
last_used_at
```

Supported providers may include:

``` text
Google
Phone
Email
Future providers
```

Multiple identities should be able to map to the same canonical user.

Example:

``` text
USER #123
   |
   +-- Google identity
   +-- Phone identity
   +-- Email identity
```

------------------------------------------------------------------------

# 12. Duplicate User Handling

The system should detect potential duplicate identities.

Examples:

``` text
Google: hari@example.com
Phone: +91XXXXXXXXXX
Email: hari@example.com
```

These should not automatically become three unrelated users.

Recommended duplicate states:

``` text
NO_DUPLICATE
POSSIBLE_DUPLICATE
CONFIRMED_DUPLICATE
MERGED
```

Do not silently merge uncertain users.

Admin should have a controlled merge workflow.

------------------------------------------------------------------------

# 13. Enrollment Architecture

Enrollment should be **program-centric**, not exam-centric.

Conceptual model:

``` text
user
  |
  v
enrollment
  |
  v
preparation_program
```

Example:

``` text
Enrollment
-----------------------------
Program: Architecture Preparation
Status: ACTIVE
Start Date: 2026-06-01
End Date: 2027-05-31
Fee: configured by program
```

A student can have multiple enrollments over time without duplicating
their identity.

------------------------------------------------------------------------

# 14. Entitlements / Access Control

Do not implement student access using a simple:

``` text
is_student = true
```

Instead use entitlements.

Conceptual model:

``` text
user_entitlements
-----------------
id
user_id
resource
access_level
valid_from
valid_until
source
```

Examples:

``` text
AiArchitect
    FULL_ACCESS

NATA Calculator
    FULL_ACCESS

College Predictor
    FULL_ACCESS

Student Dashboard
    FULL_ACCESS
```

A prospect might have:

``` text
AiArchitect
    BASIC_ACCESS
```

This makes future access models easier to implement.

------------------------------------------------------------------------

# 15. Anonymous User Architecture

Anonymous visitors should receive an anonymous identifier.

Example:

``` text
anonymous_id = anon_xxxxx
```

Before signup:

``` text
Anonymous Visitor
    |
    +-- Viewed NATA page
    +-- Used Calculator
    +-- Viewed College Predictor
```

After signup:

``` text
anonymous_id
      |
      v
user_id
```

This allows the system to understand the journey before registration.

------------------------------------------------------------------------

# 16. Analytics Event Architecture

Create a common event model across all apps.

Conceptual structure:

``` text
analytics_events
----------------
id
user_id
anonymous_id
app_id
session_id
event_name
event_timestamp
page
route
device
metadata
```

Every application should use a consistent event naming convention.

Example:

``` text
auth_signup_started
auth_google_success
auth_phone_prompt_viewed
auth_phone_entered
auth_otp_sent
auth_otp_verified
profile_started
profile_completed
tool_opened
tool_completed
course_viewed
application_started
application_completed
demo_requested
enrollment_completed
feedback_submitted
review_submitted
```

------------------------------------------------------------------------

# 17. Authentication Funnel

A critical first analytics journey:

``` text
Signup Started
      |
      v
Google Authentication
      |
      v
Account Created
      |
      v
Phone Prompt
      |
      v
Phone Entered
      |
      v
OTP Sent
      |
      v
OTP Verified
      |
      v
Profile Completed
```

Measure every transition.

The purpose is to distinguish:

``` text
User chose not to continue
```

from:

``` text
UX / technical failure
```

------------------------------------------------------------------------

# 18. Meaningful Activity

Do not determine dormancy only from login.

Create:

``` text
last_meaningful_activity_at
```

Meaningful activity may include:

``` text
Login
Tool usage
Course activity
Application activity
Payment
Communication response
Profile update
Exam preparation activity
```

The exact definition should be configurable.

------------------------------------------------------------------------

# 19. Dormancy and Deactivation

Recommended lifecycle:

``` text
ACTIVE
   |
   v
DORMANT
   |
   v
DEACTIVATION_PENDING
   |
   v
DEACTIVATED
```

Example configurable policy:

``` text
No meaningful activity
        |
        v
Dormancy threshold
        |
        v
Notification
        |
        v
Grace period
        |
        v
Deactivation
```

Do not hard-code business/legal retention periods into the frontend.

Before deactivation, check:

-   Active enrollment
-   Upcoming exam
-   Pending application
-   Active payment process
-   Active support case
-   Recent meaningful activity
-   Other configured exceptions

------------------------------------------------------------------------

# 20. Deactivated Does Not Mean Deleted

Deactivation should generally mean:

``` text
Access revoked
Account marked deactivated
Sessions/tokens revoked
Historical records retained according to policy
```

Deletion/erasure should be a separate process governed by the applicable
retention and privacy requirements.

------------------------------------------------------------------------

# 21. User 360° Admin Experience

The user detail screen should answer:

> Who is this person, what are they preparing for, what have they done,
> what access do they have, where are they in their journey, and what
> should we do next?

Recommended sections:

``` text
Overview
Activity
Journey
Enrollment
Access
CRM
Communication
Feedback
Audit
```

Example:

``` text
Hari Kumar
------------------------------------------------
ACTIVE STUDENT

Preparation:
Architecture Entrance Preparation

Target Exams:
NATA + JEE

Target Year:
2027

Engagement:
HIGH

Program:
Active

Last Active:
12 minutes ago
```

------------------------------------------------------------------------

# 22. User Activity Timeline

Display a chronological timeline.

Example:

``` text
25 Sep 2026
Used NATA Calculator

24 Sep 2026
Viewed College Predictor

24 Sep 2026
Completed preparation guide

23 Sep 2026
Signed in with Google

23 Sep 2026
Started application

22 Sep 2026
Visited course page
```

This should combine events from the ecosystem where appropriate.

------------------------------------------------------------------------

# 23. Profile Completeness

Track data quality separately.

Example:

``` text
Profile completeness: 70%

✓ Name
✓ Email
✓ Class
✗ Phone
✓ Target exam
✗ Target year
```

Admin action:

``` text
Complete Profile
```

Do not enrich unknown identities through inappropriate or hidden data
collection.

User-provided first-party information should be the preferred source of
truth.

------------------------------------------------------------------------

# 24. CRM / Follow-up

Store:

``` text
crm_lead
-----------
user_id
stage
owner
created_at
updated_at

crm_interaction
---------------
user_id
type
channel
summary
created_at

crm_task
--------
user_id
owner
task
due_at
status
```

Example:

``` text
Stage:
DEMO_COMPLETED

Owner:
Counsellor

Last Contact:
24 Sep 2026

Next Follow-up:
26 Sep 2026
```

------------------------------------------------------------------------

# 25. Engagement Signals

Create an internal engagement model based on meaningful product
interactions.

Examples of signals:

``` text
Signup
Profile completion
Tool usage
Calculator completion
College Predictor usage
Course page interaction
Application started
Application completed
Demo request
Enrollment
Communication response
```

Avoid treating this as a guaranteed purchase prediction.

Call it:

``` text
Engagement
```

rather than making unsupported assumptions about purchase intent.

------------------------------------------------------------------------

# 26. Next Best Action

The admin can eventually surface operational recommendations.

Example:

``` text
USER SIGNAL

Registered 2 days ago.
Used NATA Calculator 4 times.
Viewed preparation program.
No contact recorded.

Suggested action:
Contact learner
```

Another:

``` text
USER SIGNAL

Application completed.
Payment not completed.

Suggested action:
Follow up on payment
```

Another:

``` text
USER SIGNAL

Target exam approaching.
No meaningful activity recently.

Suggested action:
Review learner status
```

These recommendations should be transparent and based on observable
signals.

------------------------------------------------------------------------

# 27. Feedback & Outcomes System

Create a dedicated Feedback & Outcomes module.

The purpose is to collect:

1.  Product feedback
2.  Class feedback
3.  Learner outcomes
4.  Public reviews
5.  Learner stories

The system should not be designed only as an SEO review collector.

------------------------------------------------------------------------

# 28. Feedback Journey

Recommended flow:

``` text
Learner reaches meaningful milestone
             |
             v
Outcome / Feedback Request
             |
       +-----+-----+
       |           |
       v           v
Private Feedback  Public Review
       |           |
       v           v
Product Insight  Moderation
                   |
                   v
             Learner Story
                   |
                   v
              Website SEO/AEO
```

------------------------------------------------------------------------

# 29. Feedback Triggers

Do not rely only on inactivity.

Possible triggers:

``` text
Course completed
Exam attempted
Exam result available
College admission outcome
Tool journey completed
Long-term product usage
Student exits learning journey
Enrollment ends
Alumni transition
```

------------------------------------------------------------------------

# 30. Feedback Data

Conceptual structure:

``` text
feedback
--------
id
user_id
enrollment_id
rating
feedback_text
feedback_type
source
created_at
```

Possible feedback types:

``` text
CLASS
PRODUCT
TOOL
APP
SUPPORT
OVERALL
```

------------------------------------------------------------------------

# 31. Private vs Public Feedback

These must be separate.

## Private feedback

Used for:

-   Product improvement
-   UX research
-   Internal analysis
-   Feature prioritization

Example:

``` text
What did you find confusing?
What should we improve?
What feature would you like?
```

## Public review

Used for:

-   Public learner experience
-   Testimonials
-   Learner stories
-   Appropriate marketing content

Users should have a clear choice about publication.

------------------------------------------------------------------------

# 32. Review Moderation

Recommended states:

``` text
PRIVATE
PENDING_MODERATION
APPROVED
PUBLISHED
REJECTED
WITHDRAWN
```

Store publication consent and the display identity the user agreed to
use.

Do not automatically publish every submitted review.

Honest lower ratings should remain valid internal feedback.

------------------------------------------------------------------------

# 33. Learner Outcomes

Collect outcome information separately from reviews.

Example:

``` text
learner_outcomes
----------------
id
user_id
exam
exam_year
outcome_type
college
verification_status
created_at
```

Possible outcome types:

``` text
EXAM_COMPLETED
COLLEGE_ADMISSION
COURSE_COMPLETED
GOAL_ACHIEVED
DID_NOT_CONTINUE
OTHER
```

This makes it possible to distinguish:

``` text
"I liked the app"
```

from:

``` text
"I used the app and later achieved my target"
```

Do not claim causation unless it is actually supported.

------------------------------------------------------------------------

# 34. Learner Stories

Create a public content model based on approved feedback/outcomes.

Example:

``` text
learner_story
-------------
id
user_id
title
story
exam
exam_year
location
outcome
display_name
publication_status
consent_id
published_at
```

Example public presentation:

``` text
★★★★★

"I started preparing for NATA..."

Priya
NATA 2026
Chennai

Used:
- AiArchitect
- NATA Calculator
- College Predictor

Outcome:
B.Arch admission
```

------------------------------------------------------------------------

# 35. SEO/AEO Content Architecture

Do not create one huge `/reviews` page only.

Recommended structure:

``` text
/reviews
/reviews/nata
/reviews/jee
/reviews/tools
/reviews/classes
/learner-stories
```

Location pages should only be created where there is genuine useful
content.

Example:

``` text
/reviews/nata/chennai
/reviews/nata/coimbatore
```

Do not generate hundreds of thin location pages solely for search-engine
targeting.

Each page should provide real value:

-   Relevant learner experiences
-   Relevant location context
-   Useful preparation information
-   Authentic outcomes where available
-   Clear attribution
-   Updated content

------------------------------------------------------------------------

# 36. Google Business Profiles vs First-Party Reviews

The two systems serve different purposes.

## External reputation channels

Useful for:

-   Local discovery
-   Independent reputation
-   Search visibility
-   User trust

## Neram-owned review/content system

Useful for:

-   Learner stories
-   Product feedback
-   Outcome data
-   Search content
-   AEO-friendly informational pages
-   Product improvement

Do not assume that first-party reviews automatically generate Google
star snippets or other rich search features. Search-engine eligibility
depends on current search/structured-data rules.

------------------------------------------------------------------------

# 37. Review Content Must Remain Authentic

Never design the system around:

``` text
Get only 5-star reviews
```

Instead:

``` text
Request honest feedback
       |
       v
Capture rating
       |
       v
Capture detailed experience
       |
       v
Optional public consent
```

Internal product teams should actively learn from lower ratings.

------------------------------------------------------------------------

# 38. Student / Minor Considerations

Because the ecosystem can be used by school-age learners:

-   Minimize collection of unnecessary personal data.
-   Clearly communicate why information is collected.
-   Treat public publication of learner stories carefully.
-   Capture appropriate consent for publishing personal information,
    photographs, names, outcomes, or testimonials.
-   Avoid unnecessary third-party identity enrichment.
-   Establish retention and deletion rules appropriate to the applicable
    legal/privacy requirements.
-   Do not expose sensitive learner information publicly.

The public website should only expose the minimum information necessary
for an approved learner story.

------------------------------------------------------------------------

# 39. Analytics Tooling Strategy

Use first-party product analytics as the canonical event source.

Behavioral analytics/recording tools can be supplemental.

Important:

-   Do not make a third-party session-recording tool the source of
    truth.
-   Validate privacy and age-related requirements before deploying
    behavioral recording.
-   Keep product events in your own analytics architecture.
-   Ensure event names and schemas are consistent across all apps.

------------------------------------------------------------------------

# 40. Recommended Database Domains

A future schema can be organized conceptually into these domains.

``` text
IDENTITY
--------
users
user_identities
user_profiles

LEARNER
-------
learner_goals
user_exam_interests

ENROLLMENT
----------
programs
courses
batches
enrollments

ACCESS
------
user_entitlements
roles
permissions

CRM
---
crm_leads
crm_interactions
crm_tasks

ANALYTICS
---------
analytics_events
analytics_sessions
analytics_funnels

COMMUNICATION
-------------
communication_preferences
communication_log

FEEDBACK
--------
feedback
feedback_topics
review_publication
learner_outcomes
learner_stories

LIFECYCLE
---------
user_lifecycle_events
deactivation_requests

GOVERNANCE
----------
consents
audit_logs
```

------------------------------------------------------------------------

# 41. Do Not Overuse JSONB

JSONB is useful for:

-   Flexible form responses
-   External payloads
-   Rarely queried metadata
-   Historical snapshots

But frequently filtered business attributes should become first-class
fields or normalized entities.

Examples:

``` text
account_status
lifecycle_stage
last_meaningful_activity_at
phone_verified
email_verified
target_year
engagement_state
```

should not be hidden deep inside large JSON structures if they are
frequently queried.

------------------------------------------------------------------------

# 42. API / Domain Layer

Do not make the React applications directly responsible for complex
business rules.

Recommended:

``` text
Marketing App
      |
AiArchitect App
      |
Student App
      |
Nexus Admin
      |
      v
API / Domain Layer
      |
      v
Supabase / Database
```

Examples of domain operations:

``` text
resolveIdentity()
mergeUsers()
updateLearnerProfile()
recordEvent()
calculateEngagement()
updateLifecycle()
createEnrollment()
grantEntitlement()
requestFeedback()
publishReview()
deactivateUser()
reactivateUser()
```

Business rules should live in the appropriate backend/domain layer
rather than being duplicated across React applications.

------------------------------------------------------------------------

# 43. Recommended Nexus Navigation

``` text
Dashboard

Users
  ├── All Users
  ├── Prospects
  ├── Leads
  ├── Students
  ├── Alumni
  ├── Dormant
  └── Deactivation Queue

CRM
  ├── Pipeline
  ├── Follow-ups
  ├── Conversations
  └── Tasks

Enrollment
  ├── Applications
  ├── Students
  ├── Programs
  └── Batches

Feedback & Outcomes
  ├── All Feedback
  ├── Reviews
  ├── Learner Stories
  ├── Outcomes
  └── Pending Moderation

Analytics
  ├── Acquisition
  ├── Signup Funnel
  ├── Activation
  ├── Engagement
  └── Retention

Settings
  ├── Lifecycle Rules
  ├── Communication
  ├── Roles & Permissions
  └── Audit Logs
```

------------------------------------------------------------------------

# 44. User Management Table

Recommended columns:

``` text
User
Identity
Lifecycle
Preparation
Target Exams
Engagement
Last Active
Enrollment
Access
Data Quality
Action
```

Example:

``` text
Hari
Google + Phone
Active Student
Architecture Preparation
NATA + JEE
High
12 min ago
Active
Full
92%
View
```

Avoid showing every database field in the table.

The table should optimize for administrative decisions.

------------------------------------------------------------------------

# 45. User Filters

Recommended filters:

``` text
Lifecycle
Account Status
Engagement
CRM Stage
Preparation Goal
Target Exam
Target Year
Enrollment
Access
Profile Completeness
Last Active
Signup Source
Application Status
Feedback Status
```

Exam should be a filter, not the primary navigation.

------------------------------------------------------------------------

# 46. User 360° Example

``` text
------------------------------------------------------------
Hari Kumar                         ● ACTIVE STUDENT
NATA + JEE • 2027
------------------------------------------------------------

[Message] [Assign] [Edit] [More]

Overview | Activity | Journey | Enrollment | Access | CRM
         | Feedback | Audit

ACCOUNT
Google ✓
Phone ✓
Email ✓
Created: 23 Sep 2026

LEARNER
Class: 12th
Preparation: Architecture Entrance
Target Exams: NATA + JEE
Target Year: 2027

ENGAGEMENT
High
Last active: 12 minutes ago
Tools used: 7
Sessions: 18

ENROLLMENT
Architecture Preparation
Active

NEXT ACTION
Demo completed; enrollment not completed.

[Schedule Follow-up]
------------------------------------------------------------
```

------------------------------------------------------------------------

# 47. Feedback & Outcome Admin Dashboard

Recommended cards:

``` text
Total Responses
2,481

Public Reviews
1,632

Private Feedback
849

Pending Moderation
34

Learner Stories
218
```

Additional analysis:

``` text
Average Rating
Rating distribution
Most mentioned topics
Most useful tools
Common complaints
Common feature requests
Outcome distribution
```

Do not use ratings as the only measure of product quality.

------------------------------------------------------------------------

# 48. Product Feedback Intelligence

Feedback should be categorized.

Possible topics:

``` text
UI / UX
Performance
Content
Teaching
Tools
Calculator
College Predictor
Mock Tests
Communication
Support
Pricing
Application Process
Authentication
Other
```

This allows Nexus to answer:

``` text
What are students struggling with?

What do they value?

Which tool receives the most positive feedback?

Which part of signup causes complaints?

What should product/design prioritize?
```

------------------------------------------------------------------------

# 49. Lifecycle → Feedback → Content Flywheel

The intended product flywheel is:

``` text
                 NEW USER
                    |
                    v
              Uses Neram
                    |
                    v
          Tools / Classes / Content
                    |
                    v
             Learner Outcome
                    |
                    v
          Feedback & Experience
                    |
          +---------+---------+
          |                   |
          v                   v
   Product Insight       Public Review
          |                   |
          v                   v
    Improve Product      Learner Story
                              |
                              v
                         SEO / AEO
                              |
                              v
                         New Users
```

This is the long-term strategic reason for building the feedback system.

------------------------------------------------------------------------

# 50. Implementation Phases

Do not implement the entire architecture at once.

## Phase 1 --- Identity Foundation

Implement:

``` text
users
user_identities
canonical user ID
account status
identity verification
duplicate detection
last meaningful activity
```

Fix Google/phone/email identity problems first.

------------------------------------------------------------------------

## Phase 2 --- Learner Model

Implement:

``` text
user_profiles
preparation_goal
target_exams
target_year
profile_completion
enrollments
programs
entitlements
```

Keep NATA/JEE informational rather than making them separate products.

------------------------------------------------------------------------

## Phase 3 --- Analytics Foundation

Implement:

``` text
anonymous_id
user_id
session_id
analytics_events
standard event taxonomy
signup funnel
phone verification funnel
tool usage events
```

Start with the highest-value journeys.

------------------------------------------------------------------------

## Phase 4 --- Nexus User 360°

Build:

``` text
Users table
User detail
Activity timeline
Identity section
Learner section
Enrollment
Access
CRM
```

------------------------------------------------------------------------

## Phase 5 --- CRM

Implement:

``` text
Lead stage
Owner
Interaction history
Follow-up
Demo
Conversion
Notes
```

------------------------------------------------------------------------

## Phase 6 --- Feedback & Outcomes

Implement:

``` text
Feedback
Ratings
Private feedback
Public review consent
Moderation
Learner outcomes
Learner stories
```

------------------------------------------------------------------------

## Phase 7 --- Lifecycle Automation

Implement:

``` text
Dormancy detection
Deactivation eligibility
Notification
Grace period
Deactivation
Reactivation
Alumni transition
```

------------------------------------------------------------------------

## Phase 8 --- SEO/AEO Content Layer

Build:

``` text
/reviews
/learner-stories
/reviews/nata
/reviews/jee
/reviews/tools
/reviews/classes
```

Add location pages only where useful and supported by genuine content.

------------------------------------------------------------------------

# 51. Initial Event Taxonomy

Start small.

## Authentication

``` text
auth_signup_started
auth_google_success
auth_phone_prompt_viewed
auth_phone_entered
auth_otp_sent
auth_otp_verified
auth_failed
auth_logout
```

## Profile

``` text
profile_started
profile_completed
profile_updated
```

## Marketing

``` text
landing_page_viewed
course_page_viewed
tool_page_viewed
demo_requested
```

## AiArchitect

``` text
tool_opened
tool_started
tool_completed
tool_error
```

## Enrollment

``` text
application_started
application_completed
payment_started
payment_completed
enrollment_completed
```

## Feedback

``` text
feedback_requested
feedback_started
feedback_submitted
review_consent_given
review_submitted
review_published
```

------------------------------------------------------------------------

# 52. Event Naming Rules

Use:

``` text
object_action
```

or:

``` text
domain_object_action
```

Examples:

``` text
tool_opened
tool_completed
application_started
application_completed
feedback_submitted
```

Avoid inconsistent names such as:

``` text
clickedTool
toolClick
Tool_Opened
opened_the_tool
```

Choose one convention and enforce it across every application.

------------------------------------------------------------------------

# 53. Audit Logging

Every important admin mutation should generate an audit event.

Example:

``` text
Admin:
Haribabu

Action:
Changed CRM Stage

Before:
NEW_LEAD

After:
DEMO_COMPLETED

Timestamp:
25 Sep 2026 19:10
```

Track:

``` text
actor
action
entity
entity_id
before
after
timestamp
source
```

Do not store unnecessary sensitive information in logs.

------------------------------------------------------------------------

# 54. Success Metrics

The new architecture should eventually allow the business to measure:

## Acquisition

``` text
Visitors
Registrations
Signup conversion
Source
Landing page
```

## Activation

``` text
Profile completion
First tool usage
First meaningful action
```

## Engagement

``` text
Sessions
Tool usage
Returning users
Meaningful activity
```

## Conversion

``` text
Lead
Demo
Application
Enrollment
Payment
```

## Learning Journey

``` text
Course completion
Exam attempt
Outcome
College admission
```

## Product Quality

``` text
Feedback
Ratings
Issues
Feature requests
```

## Retention

``` text
Active
Dormant
Alumni
Deactivation
Reactivation
```

------------------------------------------------------------------------

# 55. Key Product Principles

1.  **One person = one canonical user identity.**
2.  Authentication methods belong to the identity, not separate users.
3.  Do not make NATA/JEE the primary user segmentation.
4.  Treat target exams as learner context.
5.  Enrollment should represent the preparation program.
6.  Access should be controlled through entitlements.
7.  Separate account status, lifecycle, engagement, and CRM stage.
8.  Anonymous activity should be supported.
9.  Link anonymous activity to the user after identification where
    appropriate.
10. Track meaningful activity rather than login alone.
11. Deactivation is not deletion.
12. Build first-party analytics as the source of truth.
13. Use behavioral analytics tools only as supplementary tooling after
    privacy/age review.
14. Separate private feedback from public reviews.
15. Public reviews require appropriate consent and moderation.
16. Learner outcomes should be captured separately from opinions.
17. Use authentic learner stories as content, not fabricated marketing
    claims.
18. Do not build SEO around thin location pages.
19. Keep business rules out of React UI code.
20. Optimize Nexus around decisions and next actions, not database
    fields.

------------------------------------------------------------------------

# 56. Final Architecture

``` text
                           NERAM ECOSYSTEM
                                  |
       +--------------------------+--------------------------+
       |                          |                          |
       v                          v                          v
 Marketing App             AiArchitect App             Student App
       |                          |                          |
       +--------------------------+--------------------------+
                                  |
                                  v
                         IDENTITY PLATFORM
                                  |
                     +------------+------------+
                     |            |            |
                     v            v            v
                  Learner      Enrollment   Analytics
                   Model         & Access     Events
                     |            |            |
                     +------------+------------+
                                  |
                +-----------------+-----------------+
                |                                   |
                v                                   v
               CRM                         Feedback & Outcomes
                |                                   |
                +-----------------+-----------------+
                                  |
                                  v
                            Nexus Admin
                                  |
              +-------------------+-------------------+
              |                   |                   |
              v                   v                   v
          Operations          Analytics          Content
                                                    |
                                                    v
                                               SEO / AEO
```

------------------------------------------------------------------------

# 57. Immediate Next Implementation Decision

The first implementation milestone should **not** be the visual redesign
of the Users table.

Start with the underlying contract:

``` text
1. Canonical user ID
2. Identity model
3. Lifecycle model
4. Learner profile model
5. Enrollment model
6. Entitlement model
7. Analytics event contract
8. Feedback/outcome model
```

Then build the Nexus UI on top of those contracts.

This prevents the admin UI from becoming another temporary
representation of the current database.

------------------------------------------------------------------------

# 58. Definition of Done for Version 1

Version 1 should be considered successful when an admin can:

``` text
✓ Find any user
✓ Understand how they registered
✓ See verified/unverified identities
✓ See learner profile
✓ See target exams without treating them as separate products
✓ See lifecycle stage
✓ See engagement state
✓ See enrollment
✓ See access/entitlements
✓ See recent meaningful activity
✓ See CRM status
✓ See feedback
✓ See outcome
✓ See whether a public review was consented to
✓ See audit history
✓ Identify incomplete profiles
✓ Identify duplicate accounts
✓ Identify signup/OTP funnel failures
✓ Identify dormant users
✓ Identify users approaching deactivation
```

The long-term goal is:

> **Open any user in Nexus and understand who they are, where they are
> in their Neram journey, what they have done, what they have access to,
> what happened to them, and what action the team should take next.**
