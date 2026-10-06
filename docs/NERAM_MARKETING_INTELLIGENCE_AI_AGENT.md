# Neram Marketing Intelligence AI Agent — Implementation Specification

## 1. Purpose

Build a production-ready **Marketing Intelligence AI Agent** inside the existing Neram monorepo.

The agent will help the Neram team manage and optimize marketing activities, initially focusing on:

- Google Ads
- Google Analytics 4 (GA4)
- Google Search Console (GSC)
- Website/landing-page analysis
- SEO/AEO insights
- AI-generated recommendations
- Human approval and controlled execution

This is **not a Nexus feature**.

### Product boundaries

- **Nexus** = student/learning application. It manages student learning, learning insights, classes, AI tutoring, and student access.
- **Admin App** = central administrative/control application for managing the Neram ecosystem.
- **Marketing Intelligence AI** = backend intelligence/automation service that is managed from the Admin App.
- **Marketing Website** = public-facing acquisition/marketing website.
- **AI Tools App** = separate AI utility/tooling application already present in the monorepo.

The new service must respect these boundaries.

---

# 2. Target Architecture

```text
NERAM MONOREPO
│
├── apps/
│   ├── nexus/                    # Student learning application
│   ├── admin/                    # Central administration/control app
│   ├── marketing/                # Marketing/public website
│   └── ai-tools/                 # Existing AI tools application
│
├── services/
│   └── marketing-intelligence/   # NEW backend AI service
│
├── packages/
│   ├── database/
│   ├── google-ads/
│   ├── analytics/
│   ├── search-console/
│   ├── ai/
│   └── shared/
│
└── docs/
    └── marketing-intelligence/
```

If the monorepo uses different names/locations, **inspect the existing repository first and adapt to its conventions rather than renaming existing applications.**

Do not duplicate existing infrastructure unnecessarily.

---

# 3. Core Principle

The system should follow:

```text
DATA
  ↓
RULES / DETERMINISTIC ANALYSIS
  ↓
AI REASONING
  ↓
INSIGHT
  ↓
RECOMMENDATION
  ↓
HUMAN APPROVAL
  ↓
ACTION
  ↓
MEASUREMENT
  ↓
LEARNING / HISTORY
```

The AI must not blindly make changes to advertising campaigns.

Start with an **approval-first architecture**.

---

# 4. Initial Scope

## Phase 1 — Read-only intelligence

Implement:

1. Google Ads connection
2. Google Ads reporting
3. Campaign performance analysis
4. Ad-group analysis
5. Keyword analysis
6. Search-term analysis
7. Negative-keyword opportunities
8. Budget/spend analysis
9. Conversion analysis
10. CPA/CPL analysis
11. GA4 integration
12. Search Console integration
13. AI-generated insights
14. AI-generated recommendations
15. Recommendation history
16. Admin App dashboard/API integration
17. Audit logging

### Phase 1 must NOT automatically modify Google Ads.

---

# 5. Phase 2 — Approval-based execution

Allow the Admin user to approve individual recommendations.

Examples:

```text
Pause keyword
Add negative keyword
Change keyword status
Change campaign budget
Change campaign status
Create ad asset
Update ad asset
```

Every mutation must:

1. Be represented as an explicit action.
2. Show the proposed change.
3. Show the reason.
4. Show relevant supporting metrics.
5. Require authorization.
6. Be logged.
7. Record the Google Ads response.
8. Be reversible where practical.

---

# 6. Phase 3 — Controlled automation

Introduce configurable autonomy levels.

```text
LEVEL 0
Read-only analysis

LEVEL 1
Recommendations only

LEVEL 2
Auto-execute low-risk actions

LEVEL 3
Auto-optimize approved action categories

LEVEL 4
Highly autonomous marketing optimization
```

Default to:

```text
LEVEL 1
```

Do not enable autonomous mutations by default.

---

# 7. Service Responsibilities

Create:

```text
services/marketing-intelligence/
```

Suggested structure:

```text
marketing-intelligence/
│
├── src/
│   ├── agents/
│   │   ├── ads-agent/
│   │   ├── seo-agent/
│   │   ├── aeo-agent/
│   │   └── content-agent/
│   │
│   ├── integrations/
│   │   ├── google-ads/
│   │   ├── google-analytics/
│   │   ├── search-console/
│   │   └── website/
│   │
│   ├── ai/
│   │   ├── providers/
│   │   ├── prompts/
│   │   └── orchestration/
│   │
│   ├── rules/
│   ├── workflows/
│   ├── recommendations/
│   ├── approvals/
│   ├── audit/
│   ├── jobs/
│   ├── api/
│   └── config/
│
├── tests/
├── README.md
└── package.json
```

Adapt this to the existing monorepo framework and conventions.

---

# 8. AI Provider Architecture

Do not hard-code the entire application to one AI provider.

Create an abstraction:

```text
AIProvider
├── GeminiProvider
├── OpenAIProvider
└── ClaudeProvider
```

Example conceptual interface:

```ts
interface AIProvider {
  generateText(input: AIRequest): Promise<AIResponse>;
  analyze(input: AIAnalysisRequest): Promise<AIAnalysisResponse>;
}
```

The actual implementation must follow the existing repository's TypeScript and dependency conventions.

The service should be able to change providers without rewriting business logic.

---

# 9. Deterministic Rules vs AI

Do NOT use an LLM for simple calculations.

Use deterministic code for:

- CTR calculation
- CPC calculation
- CPA calculation
- conversion rate
- spend thresholds
- budget thresholds
- percentage changes
- anomaly detection thresholds
- date comparisons
- campaign aggregation

Use AI for:

- interpreting search intent
- classifying search terms
- explaining performance
- identifying strategic opportunities
- generating recommendations
- generating ad-copy suggestions
- generating landing-page recommendations
- summarizing complex findings

Example:

```text
RULE:
CPA > target CPA × 2
AND
conversions = 0
AND
spend > threshold

→ Generate recommendation

AI:
Explain why the traffic may be poor quality.
Classify the search intent.
Suggest whether the term should become a negative keyword.
```

---

# 10. Google Ads Integration

Use the official Google Ads API.

Do not automate the Google Ads website through browser clicking when an API operation is available.

Required capabilities:

### Read

- Customer/account information
- Campaigns
- Ad groups
- Ads/assets
- Keywords
- Search terms
- Metrics
- Conversions
- Budgets
- Bidding strategy
- Geographic performance where available
- Device performance where available

### Write — Phase 2+

- Pause/enable entities
- Add negative keywords
- Modify approved campaign settings
- Modify approved budgets
- Create/update approved assets where supported

All write operations must go through an explicit action/approval layer.

---

# 11. Google Ads Authentication

Credentials must remain server-side.

Never expose:

```text
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_ADS_REFRESH_TOKEN
AI_API_KEYS
```

to a browser application.

Never place them in:

```text
REACT_APP_*
NEXT_PUBLIC_*
```

or commit them to Git.

Use environment variables locally and a secure production secret manager in deployment.

OAuth tokens must be encrypted/protected appropriately.

---

# 12. Suggested Environment Variables

Use names consistent with the existing project.

Conceptually:

```env
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=

GOOGLE_CLOUD_PROJECT_ID=

GOOGLE_ANALYTICS_PROPERTY_ID=
GOOGLE_SEARCH_CONSOLE_SITE_URL=

GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

MARKETING_AI_AUTONOMY_LEVEL=1
```

Do not create secrets if an existing secure configuration mechanism already exists.

---

# 13. Database Design

Use the existing Supabase/database infrastructure.

Do not create a second database unless there is a strong technical reason.

Suggested tables:

```text
marketing_ai_accounts
marketing_ai_runs
marketing_ai_tasks
marketing_ai_recommendations
marketing_ai_actions
marketing_ai_approvals
marketing_ai_insights
marketing_ai_logs
google_ads_accounts
google_ads_campaign_snapshots
```

Potential recommendation fields:

```text
id
type
source
entity_type
entity_id
title
description
reason
priority
risk_level
estimated_impact
status
proposed_change
supporting_metrics
created_at
approved_at
approved_by
executed_at
execution_result
```

Use JSON/JSONB only where the structure genuinely needs flexibility.

Use relational columns for fields frequently filtered/sorted.

---

# 14. Recommendation Lifecycle

Every recommendation should have an explicit lifecycle.

```text
DETECTED
   ↓
ANALYZING
   ↓
RECOMMENDED
   ↓
PENDING_APPROVAL
   ↓
APPROVED / REJECTED
   ↓
EXECUTING
   ↓
EXECUTED / FAILED
   ↓
MEASURED
```

Do not silently mutate records.

Maintain an audit trail.

---

# 15. Admin App Integration

The Admin App is the primary management/control interface.

Add a section similar to:

```text
Admin
│
├── Dashboard
├── Users
├── Students
├── Admissions
├── Courses
├── Payments
├── App Management
│
└── Marketing Intelligence
    ├── Overview
    ├── Google Ads
    ├── Campaigns
    ├── Keywords
    ├── Search Terms
    ├── Recommendations
    ├── Approvals
    ├── AI Reports
    ├── SEO
    ├── AEO
    ├── Settings
    └── Audit Log
```

Do not move marketing functionality into Nexus.

---

# 16. Admin Dashboard

The first dashboard should answer:

### Account health

```text
Spend
Conversions
Cost / conversion
Conversion rate
CTR
CPC
Conversion value
ROAS where applicable
```

### AI findings

```text
Critical
High
Medium
Low
```

### Recommendations

```text
Pending approval
Approved
Executed
Rejected
Failed
```

### Trend

Compare:

```text
Last 7 days
Previous 7 days
Last 30 days
Previous 30 days
```

---

# 17. Recommendation Example

Example output:

```text
HIGH PRIORITY

Recommendation:
Add "free nata coaching" as a negative keyword.

Reason:
The search term has generated:
₹1,240 spend
0 conversions
17 clicks

AI assessment:
The query indicates low commercial intent and is not aligned
with the paid-admission objective.

Suggested action:
Add as phrase-match negative keyword.

Risk:
LOW

[View evidence] [Approve] [Reject]
```

The AI must provide evidence from actual retrieved data.

Do not allow unsupported claims.

---

# 18. Marketing Funnel

The long-term objective is NOT simply to optimize clicks.

Model:

```text
Search
  ↓
Ad
  ↓
Landing Page
  ↓
Lead
  ↓
Application
  ↓
Payment
  ↓
Student
```

Where possible, connect:

```text
Google Ads
+
GA4
+
Search Console
+
Website
+
Supabase
+
Admissions
+
Payments
```

This allows optimization toward:

```text
Qualified lead
```

and eventually:

```text
Paid admission
```

rather than only:

```text
Click
```

---

# 19. SEO/AEO Expansion

The architecture must allow future agents:

```text
SEO Agent
AEO Agent
Content Agent
```

### SEO Agent

Potential responsibilities:

- Keyword opportunities
- Search Console analysis
- Ranking trends
- Technical SEO checks
- Internal linking opportunities
- Content gaps
- Competitor/topic analysis

### AEO Agent

Potential responsibilities:

- Question discovery
- Answer-oriented content
- FAQ opportunities
- Entity/topic coverage
- Structured data recommendations
- Search-answer visibility analysis

### Content Agent

Potential responsibilities:

- Landing pages
- Blog/article briefs
- FAQs
- Ad copy
- SEO titles/descriptions
- Content refresh recommendations

Do not implement all of these in Phase 1.

Create extensible interfaces now.

---

# 20. Scheduling

The service should support scheduled jobs.

Examples:

```text
Daily:
Fetch and analyze Google Ads

Daily:
Fetch Search Console data

Daily:
Fetch GA4 data

Daily:
Generate marketing intelligence report

On demand:
Run account audit

On demand:
Run campaign analysis

On demand:
Analyze search terms
```

Use the existing scheduling infrastructure if present.

If deploying on Google Cloud, Cloud Scheduler + Cloud Run is a suitable production pattern.

Do not create a permanent polling loop unless required.

---

# 21. API Design

Create backend APIs for the Admin App.

Conceptual endpoints:

```text
GET  /api/marketing-ai/overview

GET  /api/marketing-ai/campaigns

GET  /api/marketing-ai/search-terms

GET  /api/marketing-ai/keywords

GET  /api/marketing-ai/recommendations

GET  /api/marketing-ai/recommendations/:id

POST /api/marketing-ai/recommendations/:id/approve

POST /api/marketing-ai/recommendations/:id/reject

POST /api/marketing-ai/recommendations/:id/execute

POST /api/marketing-ai/audit

POST /api/marketing-ai/runs

GET  /api/marketing-ai/runs/:id

GET  /api/marketing-ai/audit-log
```

Adapt endpoint naming to the existing Admin/API conventions.

---

# 22. Authorization

Use the existing authentication/authorization architecture.

Only authorized Admin users should be able to:

- View marketing data
- Approve recommendations
- Execute changes
- Modify autonomy level
- Connect/disconnect advertising accounts
- Change AI provider settings

High-risk actions should require an appropriate elevated role.

Do not invent a second authentication system if the Admin App already has one.

---

# 23. Audit Logging

Every important event must be recorded.

Example:

```text
WHO:
Admin user

WHEN:
2026-10-06 10:30

ACTION:
Approved negative keyword recommendation

ENTITY:
Google Ads campaign X

BEFORE:
Keyword active

AFTER:
Negative keyword added

REASON:
AI recommendation

AI RUN:
run_123

RESULT:
Success
```

This is essential for enterprise-grade operation.

---

# 24. Safety Rules

The agent must:

1. Never expose credentials.
2. Never execute an unapproved mutation in Level 1.
3. Never fabricate metrics.
4. Never claim an action succeeded without API confirmation.
5. Never delete campaigns automatically.
6. Never make large budget changes automatically by default.
7. Always preserve an audit record.
8. Prefer reversible operations.
9. Surface uncertainty.
10. Clearly distinguish observed data from AI interpretation.

---

# 25. Observability

Record:

```text
AI run ID
Provider
Model
Prompt/version identifier
Input data references
Token usage where available
Latency
Result
Recommendation ID
Action ID
Errors
```

Do not log secrets, access tokens, or sensitive credentials.

---

# 26. Local Development

The entire system must first work locally.

Expected development flow:

```text
Developer machine
      │
      ├── Admin App
      │
      ├── Marketing Intelligence service
      │
      └── Supabase
              │
              ├── Google Ads API
              ├── GA4
              └── Search Console
```

Use mocked/test data where real API access is unavailable.

Provide:

```text
npm run dev
npm run test
npm run lint
npm run typecheck
```

or the monorepo's existing equivalent commands.

Do not introduce conflicting package managers or scripts.

---

# 27. Production Deployment

The preferred target for the backend is:

```text
Google Cloud Run
```

Architecture:

```text
Admin App
    ↓
Marketing Intelligence API
    ↓
Cloud Run
    ↓
Supabase
    ↓
Google APIs
```

Scheduled jobs:

```text
Cloud Scheduler
       ↓
Cloud Run
       ↓
Marketing Intelligence workflow
```

Use secure secret storage.

The exact deployment mechanism must follow the existing DevOps setup if one already exists.

---

# 28. Testing Strategy

Implement tests at multiple levels.

### Unit tests

Test:

- Metric calculations
- Rule engine
- Recommendation scoring
- Risk classification
- Data transformations

### Integration tests

Test:

- Google Ads API adapters
- GA4 adapter
- Search Console adapter
- Supabase persistence
- AI provider adapters

### Mutation safety tests

Before allowing write access:

- Verify approval is required.
- Verify authorization.
- Verify correct entity.
- Verify audit record.
- Verify failure handling.

### End-to-end

Test:

```text
Data retrieval
→ Analysis
→ Recommendation
→ Admin approval
→ Google Ads action
→ Audit log
```

Use mocked APIs for CI.

---

# 29. Implementation Order

Claude should implement in this order.

## Step 1

Inspect the entire monorepo.

Identify:

- package manager
- workspace system
- apps
- services
- shared packages
- authentication
- Supabase setup
- environment configuration
- API architecture
- deployment setup
- existing AI integrations

**Do not modify anything yet.**

Produce a short architecture assessment.

## Step 2

Create:

```text
services/marketing-intelligence
```

using existing conventions.

## Step 3

Create shared AI provider abstraction.

## Step 4

Create Google Ads read-only integration.

## Step 5

Create data normalization layer.

## Step 6

Create deterministic metrics/rules engine.

## Step 7

Create AI analysis layer.

## Step 8

Create recommendation database schema.

## Step 9

Create recommendation lifecycle.

## Step 10

Create Admin App API integration.

## Step 11

Create Admin UI for:

```text
Marketing Intelligence
→ Overview
→ Recommendations
→ Google Ads
```

## Step 12

Add audit logging.

## Step 13

Add scheduled analysis.

## Step 14

Add GA4.

## Step 15

Add Search Console.

## Step 16

Only after the read-only system is stable:

```text
Google Ads write operations
```

## Step 17

Implement approval-based execution.

## Step 18

Add controlled autonomy levels.

---

# 30. Claude Code Instructions

When implementing this specification:

### First

Inspect the repository.

Do not assume:

- app names
- folder names
- package manager
- authentication
- database structure
- deployment provider
- environment variable naming
- API conventions

### Second

Produce an implementation plan based on the actual repository.

### Third

Implement incrementally.

### Fourth

After every major step:

```text
typecheck
lint
tests
build
```

using the repository's existing commands.

### Fifth

Do not make unrelated refactors.

### Sixth

Do not break Nexus.

### Seventh

Do not move Nexus functionality into Admin.

### Eighth

Do not duplicate existing shared services.

### Ninth

Prefer existing packages/utilities.

### Tenth

Before implementing any Google Ads mutation, stop and document:

- required OAuth scopes
- API operations
- risk
- approval mechanism
- rollback strategy

---

# 31. Definition of Done — Phase 1

Phase 1 is complete when:

- [ ] Marketing Intelligence service exists in the monorepo.
- [ ] It can authenticate with Google Ads.
- [ ] It can retrieve account data.
- [ ] It can retrieve campaign data.
- [ ] It can retrieve keyword data.
- [ ] It can retrieve search-term data.
- [ ] Metrics are calculated deterministically.
- [ ] AI can analyze retrieved data.
- [ ] Recommendations are persisted.
- [ ] Recommendations have lifecycle states.
- [ ] Admin App can display recommendations.
- [ ] Admin users can view supporting evidence.
- [ ] No Google Ads mutations occur.
- [ ] Audit logging works.
- [ ] Tests pass.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Existing Nexus functionality remains unaffected.

---

# 32. Important Product Principle

The end goal is not:

> "Build a chatbot for Google Ads."

The end goal is:

> **Build a Marketing Intelligence system that continuously understands Neram's acquisition funnel, identifies opportunities, explains them, recommends actions, and eventually executes approved actions safely.**

Start small.

Build:

```text
Google Ads
    ↓
Data
    ↓
Analysis
    ↓
AI Insight
    ↓
Recommendation
    ↓
Admin Approval
```

Then expand toward:

```text
Google Ads
+
GA4
+
Search Console
+
SEO
+
AEO
+
Website
+
Admissions
+
Payments
    ↓
Neram Marketing Intelligence
```

---

# 33. Non-Goals

Do NOT initially:

- Rewrite Nexus.
- Rewrite the Admin App.
- Build a new authentication system.
- Build a second database.
- Build browser automation for Google Ads.
- Automatically change campaigns.
- Build every SEO/AEO agent immediately.
- Introduce unnecessary microservices.
- Introduce Kubernetes.
- Over-engineer the first version.

The first production milestone should be a **read-only, evidence-based marketing intelligence system with Admin-controlled recommendations**.
