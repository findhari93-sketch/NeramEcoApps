-- College Outreach: unsubscribe + suppression list (CAN-SPAM / Gmail bulk-sender compliance)
--
-- Adds:
--   1. email_suppression_list  - addresses that have unsubscribed or hard-bounced.
--      The college-outreach send route hard-blocks any send to an address here.
--   2. colleges.unsubscribe_token - opaque per-college token used to build the
--      one-click unsubscribe link in every outreach email.
--   3. colleges.unsubscribed_at - set when a college uses the unsubscribe link.
--
-- Idempotent: safe to re-run (GitHub Actions `supabase db push` may re-apply).

create table if not exists public.email_suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  college_id uuid references public.colleges(id) on delete set null,
  reason text not null default 'unsubscribe', -- unsubscribe | bounce | complaint | manual
  source text,                                -- one_click | link | mailto | manual | import
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness so an address is suppressed once regardless of casing.
create unique index if not exists email_suppression_email_lower_key
  on public.email_suppression_list (lower(email));

-- Holds contact emails, so keep it service-role only (RLS on, no policies).
alter table public.email_suppression_list enable row level security;

-- Per-college opaque token for unsubscribe links. The volatile default backfills
-- every existing row with a distinct uuid during the column add.
alter table public.colleges
  add column if not exists unsubscribe_token uuid default gen_random_uuid();

create unique index if not exists colleges_unsubscribe_token_key
  on public.colleges (unsubscribe_token);

alter table public.colleges
  add column if not exists unsubscribed_at timestamptz;
