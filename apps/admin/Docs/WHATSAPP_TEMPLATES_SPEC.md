# CLAUDE.md — WhatsApp Templates (admin.neramclasses.com)

## Overview

A WhatsApp message templates module inside `admin.neramclasses.com` where any Neram staff member can browse, copy, and send pre-written enquiry response messages via WhatsApp. Templates support placeholder variables (student name, fee amount, etc.) that staff fill in before copying/sending.

This is a critical lead conversion tool — the faster and more consistently staff respond to enquiries, the higher the conversion rate.

## Context

- **Monorepo**: Turborepo with Next.js apps
- **Admin app**: `apps/admin` → deployed at admin.neramclasses.com
- **Auth**: Microsoft Entra ID (all admin/staff users already authenticated)
- **Backend**: Supabase (project ref: zdnypksjqnhtiblwdaic)
- **UI framework**: Microsoft Fluent UI v9 (consistent with Nexus ecosystem)
- **Deployment**: Vercel
- **Primary device**: Android phones (staff will use this on mobile 90% of the time)

## User Flow

### Staff perspective (view & send)

1. Staff logs into admin.neramclasses.com
2. Navigates to "WhatsApp Templates" from sidebar/nav
3. Sees templates organized by category tabs (e.g., "First Enquiry", "Follow-up", "Fee Discussion", "Objection Handling")
4. Taps a template card → expands to show full message preview
5. Fills in placeholder fields (student name, class, exam type) via inline input fields above the message preview
6. Message preview updates live as they type in placeholders
7. Two action buttons:
   - **Copy** — copies the filled message to clipboard with a toast confirmation
   - **Send via WhatsApp** — opens `https://wa.me/?text={encodedMessage}` which launches WhatsApp with the message pre-filled. Staff then selects the contact and sends.
8. If staff hasn't filled a required placeholder, show a gentle warning before copy/send (don't block — they might want to fill it manually in WhatsApp)

### Admin perspective (create & manage)

1. Any authenticated staff can create/edit/delete templates
2. "Add Template" button opens a form/dialog:
   - Template title (required) — e.g., "First Enquiry — Parent"
   - Category (required) — select from existing or create new
   - Message body (required) — multiline textarea with placeholder syntax: `{{student_name}}`, `{{class}}`, `{{exam}}`, `{{fee}}`, `{{installment_fee}}`
   - Sort order (optional) — number for ordering within category (default: 0, sorted ascending)
3. Templates are shared across all staff — no per-user templates
4. Soft delete (archive) rather than hard delete so templates can be recovered
5. Edit history not needed for v1

## Data Model (Supabase)

### Tables

```sql
-- Template categories
create table public.wa_template_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default categories
insert into public.wa_template_categories (name, slug, sort_order) values
  ('First Enquiry', 'first-enquiry', 1),
  ('Follow-up', 'follow-up', 2),
  ('Fee Discussion', 'fee-discussion', 3),
  ('Objection Handling', 'objection-handling', 4),
  ('General', 'general', 5);

-- Templates
create table public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.wa_template_categories(id) on delete restrict,
  title text not null,
  body text not null,
  placeholders text[] not null default '{}',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_wa_templates_category on public.wa_templates(category_id) where is_archived = false;
create index idx_wa_template_categories_sort on public.wa_template_categories(sort_order);
```

### Row Level Security

```sql
-- All authenticated users can read
alter table public.wa_template_categories enable row level security;
alter table public.wa_templates enable row level security;

create policy "Authenticated users can read categories"
  on public.wa_template_categories for select
  to authenticated using (true);

create policy "Authenticated users can manage categories"
  on public.wa_template_categories for all
  to authenticated using (true) with check (true);

create policy "Authenticated users can read templates"
  on public.wa_templates for select
  to authenticated using (true);

create policy "Authenticated users can manage templates"
  on public.wa_templates for all
  to authenticated using (true) with check (true);
```

### Notes on `placeholders` column

The `placeholders` array is auto-extracted from the message body when saving. The backend/client parses `{{placeholder_name}}` patterns from the body text and stores them as `['student_name', 'class', 'exam']` etc. This avoids manual placeholder definition and keeps the source of truth in the message body.

### Predefined placeholders with display labels

```
{{student_name}}    → "Student Name"
{{class}}           → "Class (11th/12th/Dropper)"
{{exam}}            → "Exam (NATA/JEE/Both)"
{{fee}}             → "Fee Amount"
{{installment_fee}} → "Installment Amount"
{{program}}         → "Program (1-year/2-year)"
{{batch}}           → "Batch"
{{parent_name}}     → "Parent Name"
{{date}}            → "Date"
```

Staff can also use custom placeholders — any `{{anything}}` pattern will be detected and shown as an input field with the key as label (underscores replaced with spaces, title-cased).

## UI Components

### Page: `/whatsapp-templates`

**Layout (mobile-first)**:
- Top: Page title "WhatsApp Templates" + "Add Template" button (top right)
- Below: Horizontal scrollable tab bar for categories (Fluent UI `TabList`)
- Below: Vertical list of template cards for the selected category
- Cards sorted by `sort_order` ascending, then `created_at` descending

**Template Card (collapsed)**:
- Title (bold)
- First line of message body as preview (truncated, muted color)
- Placeholder count badge (e.g., "3 fields to fill")
- Tap to expand

**Template Card (expanded)**:
- Title
- Placeholder input fields — one per detected `{{placeholder}}`, shown as compact Fluent `Input` components in a horizontal wrap layout
- Message preview — the full body with placeholders replaced by filled values (or highlighted in gold if unfilled)
- Action row:
  - Copy button (📋 icon + "Copy")
  - WhatsApp send button (green, WhatsApp icon + "Send via WhatsApp")
  - Edit button (✏️ icon, subtle)
  - Archive button (🗑️ icon, subtle, with confirmation)

**Add/Edit Template Dialog**:
- Fluent UI `Dialog` (full screen on mobile)
- Fields: Title, Category (dropdown), Message body (textarea with monospace font), Sort order
- Live preview panel below the textarea showing rendered message
- Save / Cancel buttons
- On save: extract placeholders from body, upsert to Supabase

### Component tree

```
/app/whatsapp-templates/page.tsx
  └─ WhatsAppTemplatesPage
      ├─ PageHeader (title + add button)
      ├─ CategoryTabs (Fluent TabList, horizontal scroll)
      ├─ TemplateList
      │   └─ TemplateCard (× n)
      │       ├─ CardHeader (title, preview, badge)
      │       ├─ PlaceholderInputs (shown on expand)
      │       ├─ MessagePreview (shown on expand)
      │       └─ ActionRow (copy, send, edit, archive)
      └─ TemplateFormDialog (add/edit modal)

/lib/whatsapp-templates/
  ├─ types.ts          — TypeScript interfaces
  ├─ queries.ts        — Supabase queries (CRUD)
  ├─ placeholders.ts   — parse/replace placeholder logic
  └─ whatsapp.ts       — wa.me URL builder
```

## Key Implementation Details

### Placeholder parsing

```typescript
// placeholders.ts

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

export function extractPlaceholders(body: string): string[] {
  const matches = [...body.matchAll(PLACEHOLDER_REGEX)];
  return [...new Set(matches.map(m => m[1]))];
}

export function replacePlaceholders(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(PLACEHOLDER_REGEX, (match, key) => {
    return values[key]?.trim() || match;
  });
}

export function placeholderToLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
```

### WhatsApp deep link

```typescript
// whatsapp.ts

export function buildWhatsAppLink(message: string, phone?: string): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    // Remove non-digits, ensure country code
    const cleaned = phone.replace(/\D/g, '');
    return `https://wa.me/${cleaned}?text=${encoded}`;
  }
  // No phone = opens WhatsApp contact picker with pre-filled message
  return `https://wa.me/?text=${encoded}`;
}
```

### Copy to clipboard

```typescript
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    // Show Fluent UI Toast: "Copied to clipboard!"
  } catch {
    // Fallback for older browsers / WebView
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
```

### Unfilled placeholder warning

Before copy or send, check if any `{{...}}` patterns remain in the rendered message. If so, show a Fluent `MessageBar` warning: "Some fields are not filled in. The message will contain placeholder text." — but don't block the action. Staff may prefer to fill those manually in WhatsApp.

## Seed Data

Pre-populate the database with the templates from the Enquiry Conversion Kit. Here are the initial templates to seed:

### Category: First Enquiry

**Template 1: "First Enquiry — Parent"**
```
Hi! Thank you for reaching out to Neram Classes.

I'm Hari, the founder. I'm a B.Arch graduate from NIT Trichy and I personally train every student here.

A quick snapshot of what we do:
• Our student scored AIR 1 in JEE B.Arch 2024
• We consistently produce 99.9 percentile results
• Complete coaching for Mathematics, Drawing & Aptitude

What makes us different is that we've built a full digital learning platform (app.neramclasses.com) specifically for architecture entrance preparation — with practice question banks, tools, and a parent tracking portal. No other NATA/JEE coaching in India has this.

Could I know {{student_name}}'s current class and which exam they're targeting? I'd be happy to walk you through how the program works — takes just 5 minutes on a call.
```

**Template 2: "First Enquiry — Student"**
```
Hi! Welcome to Neram Classes.

I'm Hari — NIT Trichy B.Arch graduate, and I'll be your trainer. Our 2024 batch produced AIR 1 in JEE B.Arch, and we've been consistently hitting 99.9 percentile every year.

We cover Maths, Drawing & Aptitude end-to-end, and you'll also get access to our own learning app with a question bank, drawing tools, and progress tracking that no other coaching offers.

Which exam are you targeting — NATA, JEE, or both? And which class are you in currently? I can explain the right program for you.
```

### Category: Follow-up

**Template 3: "Follow-up — No Response (24-48 hrs)"**
```
Hi {{student_name}}, just following up on your enquiry about NATA/JEE coaching.

I thought you might find this useful — you can explore some of our free architecture entrance tools here: app.neramclasses.com

It has an exam center locator, college approval checker, and more. Built by us specifically for architecture aspirants.

Whenever you're ready to discuss, I'm here. No rush at all.
```

**Template 4: "Follow-up — After Call (Program Details)"**
```
Hi {{parent_name}}, great speaking with you!

As discussed, here's a summary of the {{program}} program for {{student_name}}:

• Complete NATA + JEE B.Arch preparation
• Mathematics, Drawing & Aptitude — taught by me personally
• Access to our learning app with question banks & practice tools
• Parent portal to track your child's progress
• Regular mock tests and performance reviews

Fee: ₹{{fee}} for the year (single payment)
Or ₹{{installment_fee}} + ₹{{installment_fee}} in two installments

Classes are already running, so {{student_name}} can join anytime and we'll help them catch up.

Let me know if you have any questions!
```

### Category: Fee Discussion

**Template 5: "Fee Justification — Value Positioning"**
```
I completely understand — fees are an important factor.

Here's what I'd like you to consider: at ₹{{fee}}/year, we're actually among the most affordable year-long programs for NATA/JEE B.Arch in India.

But beyond the fee, here's what {{student_name}} gets that no other institute offers:
• Training from an NIT Trichy B.Arch graduate (not just any tutor)
• Our own learning app with practice question banks
• A parent portal where you can track progress anytime
• Proven results — AIR 1 in 2024, 99.9 percentile consistently

Most institutes only give you live classes and a WhatsApp group. We've built an entire digital ecosystem for your child's preparation.

I'd be happy to show you a quick walkthrough of the app so you can see the difference firsthand.
```

### Category: Objection Handling

**Template 6: "Objection — Other Institutes More Established"**
```
That's a fair point — some institutes have been around longer.

But I'd ask you to look at two things: results and infrastructure.

Our 2024 batch produced the AIR 1 rank holder in JEE B.Arch. That's not just good — that's the best result in the country. And we do this consistently.

On infrastructure — we're the only NATA/JEE coaching in India that has built its own learning platform. {{student_name}} gets app-based practice, and you as a parent get visibility into their progress. Older institutes are still running on WhatsApp groups and PDF materials.

I'd love to give you a 5-minute demo of how it works. Would that be helpful?
```

**Template 7: "Objection — Still Exploring Options"**
```
Absolutely, take your time — this is an important decision.

In the meanwhile, {{student_name}} can start exploring our free tools at app.neramclasses.com — there's a question bank with previous year JEE questions, a college approval checker, exam center locator, and more. No login needed.

This way they can get a feel for how we approach preparation. And whenever you're ready to discuss further, I'm just a message away.
```

### Category: General

**Template 8: "Quick Intro — For Referrals"**
```
Hi {{parent_name}}! I'm Hari from Neram Classes — {{student_name}}'s friend/family suggested you reach out to us for NATA/JEE B.Arch coaching.

Quick intro: I'm an NIT Trichy B.Arch graduate and I personally train every student. Our student scored AIR 1 in JEE B.Arch 2024.

Would you like to know more about our program? I can share details or set up a quick call — whatever works best for you.
```

**Template 9: "Enrollment Confirmation"**
```
Welcome to Neram Classes, {{student_name}}! 🎉

We're excited to have you on board. Here's what happens next:

1. You'll be added to our classroom batch
2. You'll receive access to our learning app: app.neramclasses.com
3. Your parent will get Nexus portal access for progress tracking
4. Class schedule and materials will be shared shortly

If you have any questions at all, just message here. Looking forward to working with you!
```

## Mobile UX Priorities

Since staff will use this on Android phones 90% of the time:

1. **Touch targets**: All buttons minimum 44px height, generous tap areas
2. **Category tabs**: Horizontal scroll with momentum, active tab always visible
3. **Card expand/collapse**: Smooth animation, expanded card scrolls into view
4. **Placeholder inputs**: Large enough to type comfortably, auto-focus first field on expand
5. **Copy toast**: Prominent, centered, auto-dismiss after 2 seconds
6. **WhatsApp button**: Green (#25D366), prominent, full width on mobile — this is the primary action
7. **Offline resilience**: Cache templates in localStorage on first load so the page works even with flaky internet (Supabase query on mount → cache → serve from cache on subsequent loads, refresh in background)

## Implementation Phases

### Phase 1 (Ship this first)
- Supabase tables + RLS + seed data
- `/whatsapp-templates` page with category tabs
- Template cards with expand/collapse
- Placeholder input + live preview
- Copy to clipboard
- WhatsApp deep link (`wa.me`)
- Responsive mobile-first layout

### Phase 2 (Later)
- Add/edit template form dialog
- Archive (soft delete) functionality
- Drag-and-drop reorder within categories
- Category management (add/rename/reorder)
- Template usage analytics (track which templates get copied/sent most)
- "Recently used" section at top

### Phase 3 (Much later)
- Template versioning / edit history
- Scheduled follow-up reminders (staff gets a notification to follow up after X hours)
- Integration with a CRM / lead tracker if one is built
- Template suggestions based on conversation stage

## File Structure

```
apps/admin/
  app/
    whatsapp-templates/
      page.tsx                    — main page component
      components/
        CategoryTabs.tsx          — horizontal tab bar
        TemplateList.tsx          — filtered list of cards
        TemplateCard.tsx          — expandable card with preview + actions
        PlaceholderInputs.tsx     — dynamic input fields
        MessagePreview.tsx        — rendered message with highlights
        TemplateFormDialog.tsx    — add/edit form (Phase 2)
        ActionRow.tsx             — copy + whatsapp + edit buttons
  lib/
    whatsapp-templates/
      types.ts                   — WaTemplate, WaCategory interfaces
      queries.ts                 — Supabase CRUD functions
      placeholders.ts            — regex parse, replace, label utils
      whatsapp.ts                — wa.me URL builder
      cache.ts                   — localStorage cache layer
```

## TypeScript Interfaces

```typescript
// types.ts

export interface WaCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WaTemplate {
  id: string;
  category_id: string;
  title: string;
  body: string;
  placeholders: string[];
  sort_order: number;
  is_archived: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  // joined
  category?: WaCategory;
}

export interface PlaceholderValues {
  [key: string]: string;
}
```

## Edge Cases to Handle

1. **Empty placeholders on send**: Warn but don't block. Staff might fill the name directly in WhatsApp.
2. **Very long messages**: WhatsApp has a ~65,536 character limit for `wa.me` URLs. Show a warning if the rendered message exceeds 2000 characters (practical limit for readability).
3. **Special characters in messages**: The `encodeURIComponent` in the wa.me URL builder handles this, but test with: emojis, ₹ symbol, bullet points (•), em dashes (—), and Tamil characters if any.
4. **wa.me on desktop**: On desktop browsers, `wa.me` opens WhatsApp Web. This is fine — it still works.
5. **No templates in a category**: Show an empty state with "No templates in this category yet" + "Add Template" button.
6. **Concurrent edits**: Last-write-wins is fine for v1. Templates are rarely edited simultaneously.
7. **Category with no slug**: Auto-generate slug from name using `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`.

## Testing Checklist

- [ ] All seed templates render correctly with placeholder highlighting
- [ ] Placeholder inputs appear for each `{{...}}` in the message
- [ ] Live preview updates as user types in placeholder fields
- [ ] Copy button copies the rendered message (not the template with `{{}}` syntax)
- [ ] WhatsApp link opens correctly on Android with pre-filled message
- [ ] WhatsApp link works on desktop (opens WhatsApp Web)
- [ ] ₹ symbol, bullet points, and em dashes survive the copy and wa.me encoding
- [ ] Category tabs scroll horizontally on mobile
- [ ] Page loads fast on slow 3G (templates cached after first load)
- [ ] Unfilled placeholder warning appears but doesn't block send
- [ ] Template CRUD works (Phase 2)
- [ ] RLS allows all authenticated users to read and write
