-- Demo follow-up history (spec 2026-10-24): each attempt says how staff reached
-- the family (a call or a WhatsApp message), what it was about, the message we
-- sent and the reply we got, so the next person sees the whole story.
alter table public.callback_attempts
  add column if not exists channel text not null default 'call',
  add column if not exists topic text,
  add column if not exists message_sent text,
  add column if not exists reply text;

alter table public.callback_attempts
  drop constraint if exists callback_attempts_channel_check;
alter table public.callback_attempts
  add constraint callback_attempts_channel_check check (channel in ('call', 'whatsapp'));

alter table public.callback_attempts
  drop constraint if exists callback_attempts_topic_check;
alter table public.callback_attempts
  add constraint callback_attempts_topic_check
  check (topic is null or topic in ('fees', 'timing', 'parents', 'family', 'preparation', 'checking_in'));

alter table public.callback_attempts
  drop constraint if exists callback_attempts_text_length_check;
alter table public.callback_attempts
  add constraint callback_attempts_text_length_check
  check (coalesce(length(message_sent), 0) <= 2000 and coalesce(length(reply), 0) <= 2000);
