-- Demo desk: how a confirmed demo meets.
--   teams     : Teams meeting created on the organizer's calendar
--   own_link  : staff shared their own link (Google Meet, Zoom)
--   later     : time fixed, link not added yet
--   in_person : at the centre, no link
-- Null on rows confirmed before this column; the desk derives it from
-- graph_event_id (teams) and teams_join_url (own_link).

alter table public.demo_class_registrations
  add column if not exists meeting_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_class_registrations_meeting_kind_check'
  ) then
    alter table public.demo_class_registrations
      add constraint demo_class_registrations_meeting_kind_check
      check (meeting_kind is null or meeting_kind in ('teams', 'own_link', 'later', 'in_person'));
  end if;
end $$;
