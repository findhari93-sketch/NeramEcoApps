-- Demo desk: whose account a demo row is linked to.
-- Sometimes the parent signed up (or is the only account we have) while the
-- student is the one taking the demo. 'parent' means users(user_id) is the
-- parent's account; name/phone on the row are still the student's details.
-- The same fact is also kept on the account itself in users.metadata.account_holder.

alter table public.demo_class_registrations
  add column if not exists account_holder text not null default 'student';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_class_registrations_account_holder_check'
  ) then
    alter table public.demo_class_registrations
      add constraint demo_class_registrations_account_holder_check
      check (account_holder in ('student', 'parent'));
  end if;
end $$;
