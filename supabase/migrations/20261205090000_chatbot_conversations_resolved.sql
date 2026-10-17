-- Aintra Inbox: staff can mark a question resolved without writing an answer.
--
-- A resolved question leaves the Review queue (and the sidebar badge) the same
-- way a saved correction does. Used for questions that got no answer while AI
-- credits were out: the person has left, so there is nothing to answer, but the
-- item should stop counting. "Resolve all credits ran out" sets it in bulk.

alter table public.chatbot_conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists resolved_by_name text;

-- The badge count reads open queue items from the last 30 days.
create index if not exists idx_chatbot_conversations_open_queue
  on public.chatbot_conversations (created_at desc)
  where admin_correction is null and resolved_at is null;
