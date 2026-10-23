-- Demo desk: "Not now, try later" and "Joined another class".
--
-- Try later parks a request with a try-again date (next_contact_at, 10 am IST)
-- and the family's reason. On that date the staff member who parked it gets the
-- existing call-back reminder, and the Admin demo-messages cron emails the family
-- once (later_nudged_at marks that it ran, sent or not).
-- Joined another class closes a request but keeps the family findable for a
-- future self-study offer.

alter table public.demo_class_registrations
  drop constraint if exists demo_class_registrations_last_call_outcome_check;

alter table public.demo_class_registrations
  add constraint demo_class_registrations_last_call_outcome_check
  check (last_call_outcome = any (array['interested', 'no_answer', 'call_back', 'not_interested', 'later', 'joined_elsewhere']));

alter table public.demo_class_registrations
  add column if not exists later_reason text,
  add column if not exists later_nudged_at timestamptz;

comment on column public.demo_class_registrations.later_reason is
  'Try later: why the family asked us to wait. The try-again date is next_contact_at.';
comment on column public.demo_class_registrations.later_nudged_at is
  'Try later: when the try-again date was acted on (family email sent, or skipped with no address). Null until then.';

-- The cron looks for parked requests that are due and not yet acted on.
create index if not exists demo_class_registrations_later_due_idx
  on public.demo_class_registrations (next_contact_at)
  where last_call_outcome = 'later' and later_nudged_at is null;
