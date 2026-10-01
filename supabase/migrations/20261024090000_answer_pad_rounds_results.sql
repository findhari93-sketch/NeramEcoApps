-- =============================================================================
-- Answer Pad: rounds, who joined, answers that can change, excused reasons and
-- round results. Follow-up to 20261003090100_answer_pad_picture_reasons_nudge.sql.
--
-- From the class of 2026-09-30 (18 questions, 22 students in the pad, 39 on the
-- class list):
--   1. The live count is out of who JOINED this round (opened the pad), not the
--      class list. It only grows: a student who drops stays counted.
--   2. The session teacher sees names while a question is open: who has not
--      answered yet, with their reason. Students and the meeting screen never do.
--   3. A student may change their answer until the question closes.
--   4. The teacher may accept a reason ("excused"): the question then counts
--      neither for nor against that student.
--   5. The nudge reaches only students who joined, never the whole class list.
--   6. "Close Q.31 and ask Q.32" in one call, safe against a double tap.
--   7. A session is a ROUND: numbered per class, several per meeting, and the
--      next round keeps the room code so no student has to join again.
--   8. Round results (computed on read, so a late answer key updates them), a
--      publish step, what each student may see, and the rounds of a class.
--   9. The answer to a question already revealed can still be corrected; the
--      answers are regraded.
--
-- Every statement can run twice, as a re-applied deploy would.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------

alter table pad_sessions add column if not exists round_no int;
alter table pad_sessions add column if not exists results_published_at timestamptz;
alter table pad_sessions add column if not exists results_published_by uuid references users(id) on delete set null;
alter table pad_sessions add column if not exists results_notified_at timestamptz;

comment on column pad_sessions.round_no is
  'Answer Pad: this round''s number within its class (or meeting): Round 1, Round 2. Set by trigger.';
comment on column pad_sessions.results_published_at is
  'When the teacher published this round''s results to students. Null while unpublished.';
comment on column pad_sessions.results_notified_at is
  'When each student was sent their own result by Teams chat. Set once, so a republish never messages twice.';

alter table pad_responses add column if not exists change_count int not null default 0;
comment on column pad_responses.change_count is
  'How many times the student changed this answer while the question was open.';

alter table pad_skip_reasons add column if not exists approval text;
alter table pad_skip_reasons add column if not exists decided_by uuid references users(id) on delete set null;
alter table pad_skip_reasons add column if not exists decided_at timestamptz;
alter table pad_skip_reasons drop constraint if exists pad_skip_reasons_approval_check;
alter table pad_skip_reasons add constraint pad_skip_reasons_approval_check
  check (approval is null or approval in ('approved', 'rejected'));
comment on column pad_skip_reasons.approval is
  'The teacher''s decision on the reason: approved (the student is excused for this question), rejected, or null (not decided).';

-- Each student's result for each round, stored once the round ends and kept up
-- to date by pad_store_round_results (on end, publish, and a late key or
-- accepted reason). Linked to the class, so attendance and class insights can
-- read how active each student was without recomputing a round.
create table if not exists pad_round_results (
  session_id         uuid not null references pad_sessions(id) on delete cascade,
  student_id         uuid not null references users(id) on delete cascade,
  scheduled_class_id uuid references nexus_scheduled_classes(id) on delete set null,
  classroom_id       uuid not null,
  round_no           int,
  on_roster          boolean not null default true,
  questions          int not null default 0,  -- graded, revealed, present for, not excused
  attempted          int not null default 0,
  not_attempted      int not null default 0,
  correct            int not null default 0,
  wrong              int not null default 0,
  excused            int not null default 0,
  away               int not null default 0,
  answered           int not null default 0,  -- every answered question, polls included
  present_for        int not null default 0,
  score_pct          int,
  accuracy_pct       int,
  participation_pct  int,
  label              text,
  not_active         boolean not null default false,
  rank               int,
  ranked_of          int not null default 0,
  computed_at        timestamptz not null default now(),
  primary key (session_id, student_id),
  constraint pad_round_results_label_check check (label is null or label in ('strong', 'good', 'needs_practice'))
);
create index if not exists pad_round_results_class_idx on pad_round_results (scheduled_class_id);
create index if not exists pad_round_results_student_idx on pad_round_results (student_id);
alter table pad_round_results enable row level security;
revoke all on table pad_round_results from anon, authenticated;

comment on table pad_round_results is
  'Answer Pad: each student''s stored result per round (attempted, right, rank of those who joined), linked to the class.';


-- -----------------------------------------------------------------------------
-- Round numbers
-- -----------------------------------------------------------------------------

-- Rounds are counted per class when the session knows its class, else per
-- meeting thread, else per meeting, else the session stands alone.
create or replace function pad_round_key(p_class uuid, p_thread text, p_meeting text, p_id uuid) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce('c:' || p_class::text, 't:' || p_thread, 'm:' || p_meeting, 's:' || p_id::text);
$$;

create or replace function pad_assign_round_no() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.round_no is null then
    select coalesce(max(s.round_no), 0) + 1 into new.round_no
    from pad_sessions s
    where pad_round_key(s.scheduled_class_id, s.meeting_thread_id, s.meeting_id, s.id)
        = pad_round_key(new.scheduled_class_id, new.meeting_thread_id, new.meeting_id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists pad_sessions_round_no on pad_sessions;
create trigger pad_sessions_round_no before insert on pad_sessions
  for each row execute function pad_assign_round_no();

-- Existing sessions, numbered in the order they started.
with numbered as (
  select s.id,
         row_number() over (
           partition by pad_round_key(s.scheduled_class_id, s.meeting_thread_id, s.meeting_id, s.id)
           order by s.created_at, s.id
         ) as n
  from pad_sessions s
)
update pad_sessions s
   set round_no = numbered.n
  from numbered
 where numbered.id = s.id and s.round_no is null;

-- One Round 2 per class. A clash on a concurrent start is a unique violation,
-- which pad_start_or_resume_session already retries (the trigger then counts again).
create unique index if not exists pad_sessions_class_round
  on pad_sessions (scheduled_class_id, round_no) where scheduled_class_id is not null;
create index if not exists pad_responses_student on pad_responses (student_id);
create index if not exists pad_skip_reasons_student on pad_skip_reasons (student_id);
create index if not exists pad_nudges_student on pad_nudges (student_id);


-- -----------------------------------------------------------------------------
-- Guards
-- -----------------------------------------------------------------------------

-- An answer may now change while its question is open, through pad_submit only,
-- and never its owner, its question or its grade.
create or replace function pad_guard_response() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_flag text := coalesce(current_setting('pad.transition', true), '');
begin
  if tg_op = 'INSERT' then
    if v_flag <> 'submit' then
      raise exception 'pad_responses rows are created only by pad_submit()';
    end if;
    return new;
  end if;

  if new.prompt_id is distinct from old.prompt_id or new.student_id is distinct from old.student_id then
    raise exception 'a response never moves to another prompt or student';
  end if;

  if v_flag = 'submit' then
    if new.is_correct is distinct from old.is_correct then
      raise exception 'is_correct is written only by pad_reveal() and pad_set_key()';
    end if;
    return new;
  end if;

  if v_flag <> 'reveal'
     or new.raw_answer is distinct from old.raw_answer
     or new.norm_answer is distinct from old.norm_answer
     or new.responded_at is distinct from old.responded_at
     or new.change_count is distinct from old.change_count then
    raise exception 'responses change only through pad_submit() while open; is_correct only through grading';
  end if;
  return new;
end $$;

-- The teacher's decision on a reason is the 'excuse' transition.
create or replace function pad_guard_skip_reason() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('pad.transition', true), '') not in ('skip', 'excuse') then
    raise exception 'pad_skip_reasons rows change only through pad_set_skip_reason() and pad_excuse()';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;


-- -----------------------------------------------------------------------------
-- Who joined
-- -----------------------------------------------------------------------------

-- Class-list students who opened the pad in this round at any moment, staff
-- never. Presence rows are never deleted, so this only grows.
create or replace function pad_joined_ids(p_session uuid, p_roster uuid[]) returns uuid[]
language sql stable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct ap.student_id), '{}'::uuid[])
  from pad_app_presence ap
  where ap.session_id = p_session
    and ap.student_id = any (coalesce(p_roster, '{}'::uuid[]))
    and not pad_is_staff(ap.student_id);
$$;


-- -----------------------------------------------------------------------------
-- Participation and score: excused
-- -----------------------------------------------------------------------------

-- As before, plus 'excused': no answer, and the teacher accepted the reason.
-- Excused wins over silent and absent, so it never counts against the student.
create or replace function pad_participation_rows(p_prompt uuid, p_roster uuid[])
returns table (
  student_id        uuid,
  on_roster         boolean,
  participation     text,   -- answered | excused | silent | absent
  result            text,   -- correct | incorrect | ungraded | null (did not answer)
  answer            text,
  joined_mid_prompt boolean
)
language sql stable set search_path = public, pg_temp as $$
  with p as (
    select pp.id, pp.state, pp.ungraded, pp.opened_at, pp.closed_at,
           s.id as sid, s.meeting_id, s.scheduled_class_id
    from pad_prompts pp
    join pad_sessions s on s.id = pp.session_id
    where pp.id = p_prompt
  ),
  roster as (
    select distinct x as sid_student from unnest(coalesce(p_roster, '{}'::uuid[])) x where x is not null
  ),
  people as (
    select r.sid_student as person, true as listed from roster r
    union all
    select pr.student_id, false
    from pad_responses pr
    where pr.prompt_id = p_prompt
      and not exists (select 1 from roster r where r.sid_student = pr.student_id)
  )
  select
    pe.person,
    pe.listed,
    case
      when r.id is not null then 'answered'
      when sr.approval = 'approved' then 'excused'
      when pad_was_present(p.sid, p.meeting_id, p.scheduled_class_id, pe.person, p.opened_at, coalesce(p.closed_at, now()))
        then 'silent'
      else 'absent'
    end,
    case
      when r.id is null then null
      when p.state <> 'revealed' or p.ungraded then 'ungraded'
      when r.is_correct then 'correct'
      else 'incorrect'
    end,
    r.norm_answer,
    coalesce(fs.first_seen > p.opened_at and fs.first_seen <= coalesce(p.closed_at, now()), false)
  from p
  cross join people pe
  cross join lateral (
    select pad_first_seen(p.sid, p.meeting_id, p.scheduled_class_id, pe.person) as first_seen
  ) fs
  left join pad_responses r on r.prompt_id = p.id and r.student_id = pe.person
  left join pad_skip_reasons sr on sr.prompt_id = p.id and sr.student_id = pe.person;
$$;


-- As before, plus 'excused', which like 'absent' is left out of total_graded.
create or replace function pad_student_score(p_session uuid, p_student uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with graded as (
    select p.id as pid, p.opened_at, p.closed_at, s.id as sid, s.meeting_id, s.scheduled_class_id,
           r.id as rid, r.is_correct
    from pad_prompts p
    join pad_sessions s on s.id = p.session_id
    left join pad_responses r on r.prompt_id = p.id and r.student_id = p_student
    where p.session_id = p_session and p.state = 'revealed' and not p.ungraded
  ),
  classified as (
    select case
      when rid is not null and is_correct then 'correct'
      when rid is not null then 'wrong'
      when exists (select 1 from pad_skip_reasons sr
                   where sr.prompt_id = pid and sr.student_id = p_student and sr.approval = 'approved') then 'excused'
      when pad_was_present(sid, meeting_id, scheduled_class_id, p_student, opened_at, closed_at) then 'skipped'
      else 'absent'
    end as c
    from graded
  )
  select jsonb_build_object(
    'correct',      count(*) filter (where c = 'correct'),
    'wrong',        count(*) filter (where c = 'wrong'),
    'skipped',      count(*) filter (where c = 'skipped'),
    'excused',      count(*) filter (where c = 'excused'),
    'absent',       count(*) filter (where c = 'absent'),
    'total_graded', count(*) filter (where c in ('correct', 'wrong', 'skipped'))
  )
  from classified;
$$;


-- -----------------------------------------------------------------------------
-- Students: change an answer until the question closes
-- -----------------------------------------------------------------------------

create or replace function pad_submit(p_actor uuid, p_prompt uuid, p_raw text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_r    pad_responses;
  v_old  pad_responses;
  v_norm text;
begin
  -- A shared lock against CLOSE's exclusive one: an answer committed before the
  -- Close stands, one arriving after it is refused. Commit order decides.
  select * into v_p from pad_prompts where id = p_prompt for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;

  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'NOT_ENROLLED');
  end if;

  v_norm := pad_normalize(v_p.answer_type, p_raw);
  select * into v_old from pad_responses where prompt_id = v_p.id and student_id = p_actor for update;

  if v_s.status <> 'live' or v_p.state <> 'open' then
    -- A retry of an answer that landed before Close is still a success: the
    -- student's pad must not say "too late" about an answer that counted.
    if v_old.id is not null and v_old.norm_answer = v_norm then
      return jsonb_build_object('ok', true, 'status', 'unchanged', 'answer', v_old.norm_answer,
                                'raw_answer', v_old.raw_answer, 'responded_at', v_old.responded_at);
    end if;
    -- A change that arrives after Close is refused, and says what stands.
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit',
                      case when v_s.status <> 'live' then 'SESSION_NOT_LIVE' else 'PROMPT_NOT_OPEN' end,
                      jsonb_build_object('state', v_p.state)
                      || case when v_old.id is not null then jsonb_build_object('answer', v_old.norm_answer) else '{}'::jsonb end);
  end if;

  if v_norm is null or (v_p.answer_type = 'mcq' and ascii(v_norm) - 64 > v_p.option_count) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'INVALID_ANSWER');
  end if;

  if v_old.id is not null and v_old.norm_answer = v_norm then
    -- A retry, or the same tap from a second device.
    perform pad_touch_app_presence(v_s.id, p_actor);
    return jsonb_build_object('ok', true, 'status', 'unchanged', 'answer', v_old.norm_answer,
                              'raw_answer', v_old.raw_answer, 'responded_at', v_old.responded_at);
  end if;

  perform set_config('pad.transition', 'submit', true);
  insert into pad_responses (prompt_id, student_id, raw_answer, norm_answer)
  values (v_p.id, p_actor, left(btrim(p_raw), 200), v_norm)
  on conflict (prompt_id, student_id) do update
     set raw_answer = excluded.raw_answer,
         norm_answer = excluded.norm_answer,
         responded_at = now(),
         change_count = pad_responses.change_count + 1
  returning * into v_r;

  perform pad_touch_app_presence(v_s.id, p_actor);
  if v_old.id is not null then
    perform pad_log(v_s.id, v_p.id, p_actor, 'change_answer', jsonb_build_object('times', v_r.change_count));
  end if;
  return jsonb_build_object('ok', true, 'status', case when v_old.id is null then 'accepted' else 'changed' end,
                            'answer', v_r.norm_answer, 'raw_answer', v_r.raw_answer, 'responded_at', v_r.responded_at);
end $$;


-- A changed reason is a new reason: the teacher's earlier decision no longer applies.
create or replace function pad_set_skip_reason(p_actor uuid, p_prompt uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_note text := pad_clean_label(p_note);
begin
  select * into v_p from pad_prompts where id = p_prompt for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;

  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'skip', 'NOT_ENROLLED');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'skip', 'SESSION_NOT_LIVE');
  end if;
  if v_p.state <> 'open' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'skip', 'PROMPT_NOT_OPEN', jsonb_build_object('state', v_p.state));
  end if;

  if exists (select 1 from pad_responses r where r.prompt_id = v_p.id and r.student_id = p_actor) then
    return jsonb_build_object('ok', true, 'status', 'answered');
  end if;

  perform set_config('pad.transition', 'skip', true);

  if p_reason is null then
    delete from pad_skip_reasons where prompt_id = v_p.id and student_id = p_actor;
    perform pad_log(v_s.id, v_p.id, p_actor, 'skip', jsonb_build_object('reason', null));
    return jsonb_build_object('ok', true, 'status', 'cleared');
  end if;

  if p_reason not in ('dont_know', 'cant_see', 'need_time', 'tech_problem', 'other') then
    return pad_reject(v_s.id, v_p.id, p_actor, 'skip', 'INVALID_INPUT', jsonb_build_object('field', 'reason'));
  end if;
  if v_note is not null and char_length(v_note) > 80 then
    return pad_reject(v_s.id, v_p.id, p_actor, 'skip', 'INVALID_INPUT', jsonb_build_object('field', 'note'));
  end if;

  insert into pad_skip_reasons (prompt_id, student_id, reason, note)
  values (v_p.id, p_actor, p_reason, v_note)
  on conflict (prompt_id, student_id) do update
     set reason = excluded.reason,
         note = excluded.note,
         updated_at = now(),
         approval = case when pad_skip_reasons.reason = excluded.reason
                          and pad_skip_reasons.note is not distinct from excluded.note
                         then pad_skip_reasons.approval end,
         decided_by = case when pad_skip_reasons.reason = excluded.reason
                            and pad_skip_reasons.note is not distinct from excluded.note
                           then pad_skip_reasons.decided_by end,
         decided_at = case when pad_skip_reasons.reason = excluded.reason
                            and pad_skip_reasons.note is not distinct from excluded.note
                           then pad_skip_reasons.decided_at end;

  -- Giving a reason is being in the pad: it counts the student as joined.
  perform pad_touch_app_presence(v_s.id, p_actor);
  perform pad_log(v_s.id, v_p.id, p_actor, 'skip', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true, 'status', 'saved', 'reason', p_reason, 'note', v_note);
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: accept (or turn down) reasons
-- -----------------------------------------------------------------------------

-- p_students names the students; or leave it null and name p_reason to decide
-- every reason of that kind at once. p_approve: true accepts, false turns down,
-- null clears the decision. Works while open, after close, and after the round.
create or replace function pad_excuse(
  p_actor    uuid,
  p_prompt   uuid,
  p_students uuid[]  default null,
  p_reason   text    default null,
  p_approve  boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p pad_prompts;
  v_s pad_sessions;
  v_n int;
begin
  select * into v_p from pad_prompts where id = p_prompt;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'excuse', 'NOT_SESSION_TEACHER');
  end if;
  if p_students is null and p_reason is null then
    return pad_reject(v_s.id, v_p.id, p_actor, 'excuse', 'INVALID_INPUT', jsonb_build_object('field', 'students'));
  end if;
  if p_students is not null and cardinality(p_students) > 500 then
    return pad_reject(v_s.id, v_p.id, p_actor, 'excuse', 'INVALID_INPUT', jsonb_build_object('field', 'students'));
  end if;

  perform set_config('pad.transition', 'excuse', true);
  update pad_skip_reasons sr
     set approval = case when p_approve is null then null when p_approve then 'approved' else 'rejected' end,
         decided_by = case when p_approve is null then null else p_actor end,
         decided_at = case when p_approve is null then null else now() end
   where sr.prompt_id = v_p.id
     and (p_students is null or sr.student_id = any (p_students))
     and (p_reason is null or sr.reason = p_reason)
     and sr.approval is distinct from case when p_approve is null then null when p_approve then 'approved' else 'rejected' end;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform pad_log(v_s.id, v_p.id, p_actor, 'excuse',
                    jsonb_build_object('approve', p_approve, 'count', v_n, 'reason', p_reason));
  end if;
  return jsonb_build_object('ok', true, 'changed', v_n > 0, 'count', v_n);
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: close the open question and ask the next in one call
-- -----------------------------------------------------------------------------

drop function if exists pad_ask(uuid, uuid, text, int, text, text, text, text[]);

-- p_close_prompt names the open question to close first. Naming it (rather
-- than "whatever is open") keeps a double tap safe: the second call finds the
-- NEW question open, which is not the one named, and simply returns it.
create or replace function pad_ask(
  p_actor        uuid,
  p_session      uuid,
  p_answer_type  text   default 'mcq',
  p_option_count int    default 4,
  p_label        text   default null,
  p_text         text   default null,
  p_image_url    text   default null,
  p_option_texts text[] default null,
  p_close_prompt uuid   default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s       pad_sessions;
  v_p       pad_prompts;
  v_open    pad_prompts;
  v_seq     int;
  v_label   text   := pad_clean_label(p_label);
  v_text    text   := pad_clean_question(p_text);
  v_image   text   := nullif(btrim(coalesce(p_image_url, '')), '');
  v_options text[];
  v_closed  uuid;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'SESSION_NOT_LIVE');
  end if;

  select * into v_open
  from pad_prompts
  where session_id = p_session and state = 'open'
  for update;

  -- A repeated ASK, or a double-tapped close-and-ask, returns the question open.
  if v_open.id is not null and (p_close_prompt is null or v_open.id <> p_close_prompt) then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_open.id,
                              'state', v_open.state, 'version', v_open.version, 'sequence', v_open.sequence,
                              'label', v_open.label);
  end if;

  -- Everything is checked before anything is closed: a refusal returns
  -- normally and would otherwise commit the close without the new question.
  if p_answer_type is null or p_answer_type not in ('mcq', 'numeric', 'text', 'yesno') then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'answer_type'));
  end if;
  if p_answer_type = 'mcq' and (p_option_count is null or p_option_count not between 2 and 6) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'option_count'));
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'label'));
  end if;
  if v_text is not null and char_length(v_text) > 500 then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'text'));
  end if;
  if not pad_valid_image_url(v_image, v_s.id) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'image'));
  end if;

  v_options := case when p_answer_type = 'mcq' then pad_clean_option_texts(p_option_texts) else null end;
  if not pad_valid_option_texts(v_options, p_answer_type, p_option_count) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'options'));
  end if;

  if v_open.id is not null then
    perform set_config('pad.transition', 'close', true);
    update pad_prompts
       set state = 'closed', closed_at = now(), version = version + 1
     where id = v_open.id;
    perform pad_log(v_s.id, v_open.id, p_actor, 'close',
                    jsonb_build_object('answered', (select count(*) from pad_responses r where r.prompt_id = v_open.id),
                                       'then_ask', true));
    v_closed := v_open.id;
  end if;

  select coalesce(max(sequence), 0) + 1 into v_seq from pad_prompts where session_id = p_session;

  perform set_config('pad.transition', 'ask', true);
  insert into pad_prompts (session_id, sequence, answer_type, option_count, label, question_text, image_url, option_texts)
  values (p_session, v_seq, p_answer_type, case when p_answer_type = 'mcq' then p_option_count else null end,
          v_label, v_text, v_image, v_options)
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'ask',
                  jsonb_build_object('sequence', v_seq, 'answer_type', p_answer_type, 'option_count', v_p.option_count,
                                     'label', v_label, 'has_text', v_text is not null,
                                     'has_image', v_image is not null, 'has_options', v_options is not null));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id,
                            'state', v_p.state, 'version', v_p.version, 'sequence', v_seq, 'label', v_label,
                            'closed_prompt_id', v_closed);
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: the answer can be corrected after Reveal
-- -----------------------------------------------------------------------------

-- As before for a closed question. A revealed one now takes a new key too, and
-- its answers are regraded in the same transaction.
create or replace function pad_set_key(p_actor uuid, p_prompt uuid, p_keys text[], p_ungraded boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_keys text[];
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'NOT_SESSION_TEACHER');
  end if;
  if v_p.state not in ('closed', 'revealed') then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;

  if coalesce(p_ungraded, false) then
    if v_p.ungraded then
      return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
    end if;
    v_keys := null;
  else
    if p_keys is null
       or cardinality(p_keys) = 0
       or cardinality(p_keys) > 50
       or exists (
         select 1 from unnest(p_keys) k
         where pad_normalize(v_p.answer_type, k) is null
            or (v_p.answer_type = 'mcq' and ascii(pad_normalize(v_p.answer_type, k)) - 64 > v_p.option_count)
       ) then
      return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'INVALID_KEY');
    end if;

    select array_agg(distinct pad_normalize(v_p.answer_type, k) order by pad_normalize(v_p.answer_type, k))
      into v_keys
    from unnest(p_keys) k;

    if not v_p.ungraded and v_p.correct_keys is not distinct from v_keys then
      return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
    end if;
  end if;

  perform set_config('pad.transition', 'set_key', true);
  update pad_prompts
     set correct_keys = v_keys, ungraded = coalesce(p_ungraded, false), version = version + 1
   where id = v_p.id
  returning * into v_p;

  if v_p.state = 'revealed' then
    perform set_config('pad.transition', 'reveal', true);
    update pad_responses r
       set is_correct = case when v_p.ungraded then null else (r.norm_answer = any (v_p.correct_keys)) end
     where r.prompt_id = v_p.id;
  end if;

  perform pad_log(v_s.id, v_p.id, p_actor, 'set_key',
                  jsonb_build_object('keys', to_jsonb(v_keys), 'ungraded', v_p.ungraded,
                                     'after_reveal', v_p.state = 'revealed'));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- -----------------------------------------------------------------------------
-- The nudge reaches only students who joined
-- -----------------------------------------------------------------------------

create or replace function pad_nudge(p_actor uuid, p_prompt uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p      pad_prompts;
  v_s      pad_sessions;
  v_last   timestamptz;
  v_joined uuid[];
  v_open   uuid[];
  v_closed uuid[];
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'nudge', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'nudge', 'SESSION_NOT_LIVE');
  end if;
  if v_p.state <> 'open' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'nudge', 'PROMPT_NOT_OPEN', jsonb_build_object('state', v_p.state));
  end if;

  select max(n.nudged_at) into v_last from pad_nudges n where n.prompt_id = v_p.id;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
                              'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int));
  end if;

  v_joined := pad_joined_ids(v_s.id, p_roster);

  perform set_config('pad.transition', 'nudge', true);

  -- Only students who joined this round: a student never in the class is not
  -- chased from inside it.
  with targets as (
    select j as student_id
    from unnest(v_joined) j
    where pad_is_enrolled_student(j, v_s.classroom_id)
      and not exists (select 1 from pad_responses pr where pr.prompt_id = v_p.id and pr.student_id = j)
      and not exists (select 1 from pad_skip_reasons sr where sr.prompt_id = v_p.id and sr.student_id = j)
  ),
  marked as (
    insert into pad_nudges (prompt_id, student_id)
    select v_p.id, t.student_id from targets t
    on conflict (prompt_id, student_id) do update
       set nudged_at = now(), times = pad_nudges.times + 1
    returning student_id
  )
  select coalesce(array_agg(m.student_id) filter (where m.pad_open), '{}'::uuid[]),
         coalesce(array_agg(m.student_id) filter (where not m.pad_open), '{}'::uuid[])
    into v_open, v_closed
  from (
    select mk.student_id,
           exists (
             select 1 from pad_app_presence ap
             where ap.session_id = v_s.id
               and ap.student_id = mk.student_id
               and ap.last_seen_at >= now() - interval '90 seconds'
           ) as pad_open
    from marked mk
  ) m;

  perform pad_log(v_s.id, v_p.id, p_actor, 'nudge',
                  jsonb_build_object('pad_open', cardinality(v_open), 'pad_closed', cardinality(v_closed)));
  return jsonb_build_object('ok', true, 'pad_open', to_jsonb(v_open), 'pad_closed', to_jsonb(v_closed));
end $$;


-- -----------------------------------------------------------------------------
-- Rounds: the next round in the same meeting
-- -----------------------------------------------------------------------------

-- Ends this round (with the same unrevealed check as pad_end_session) and opens
-- the next with the same class, section, meeting and room code, so students
-- carry on without joining again. On an already ended round it just starts the
-- next one. Returns the new session.
create or replace function pad_next_round(p_actor uuid, p_session uuid, p_confirm_unrevealed boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_live  pad_sessions;
  v_new   pad_sessions;
  v_first pad_prompts;
  v_count int;
  v_code  text;
  i       int;
begin
  perform pg_advisory_xact_lock(hashtext('pad_session_owner:' || coalesce(p_actor::text, '')));

  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, null, p_actor, 'next_round', 'NOT_SESSION_TEACHER');
  end if;

  if v_s.status = 'live' then
    select count(*) into v_count from pad_prompts where session_id = p_session and state in ('open', 'closed');
    if v_count > 0 and not coalesce(p_confirm_unrevealed, false) then
      select * into v_first from pad_prompts
      where session_id = p_session and state in ('open', 'closed')
      order by sequence limit 1;
      return jsonb_build_object('ok', false, 'code', 'UNREVEALED_PROMPT',
                                'sequence', v_first.sequence, 'label', v_first.label, 'count', v_count);
    end if;
    perform pad_end_session_internal(p_session, p_actor, 'next_round');
  else
    -- Already ended: a second press, or Start next round from the results.
    select * into v_live from pad_sessions s where s.teacher_id = p_actor and s.status = 'live';
    if found then
      if pad_round_key(v_live.scheduled_class_id, v_live.meeting_thread_id, v_live.meeting_id, v_live.id)
         = pad_round_key(v_s.scheduled_class_id, v_s.meeting_thread_id, v_s.meeting_id, v_s.id) then
        return jsonb_build_object('ok', true, 'changed', false, 'session_id', v_live.id, 'round_no', v_live.round_no);
      end if;
      return jsonb_build_object('ok', false, 'code', 'SESSION_CONFLICT',
                                'existing', jsonb_build_object('session_id', v_live.id, 'classroom_id', v_live.classroom_id));
    end if;
  end if;

  -- The room code is free again once the old round has ended; keep it so a
  -- student with the code on screen joins the new round. Another live session
  -- may have taken it in the meantime, in which case draw a new one.
  v_code := v_s.room_code;
  for i in 1..30 loop
    begin
      insert into pad_sessions (
        classroom_id, scheduled_class_id, batch_id, teacher_id, meeting_id, meeting_thread_id,
        room_code, hint_topic, teacher_topic
      ) values (
        v_s.classroom_id, v_s.scheduled_class_id, v_s.batch_id, p_actor, v_s.meeting_id, v_s.meeting_thread_id,
        v_code,
        'pad-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        'padt-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
      )
      returning * into v_new;
      exit;
    exception when unique_violation then
      v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    end;
  end loop;

  if v_new.id is null then
    raise exception 'pad: could not start the next round';
  end if;

  perform pad_log(v_new.id, null, p_actor, 'session_start',
                  jsonb_build_object('previous_session_id', v_s.id, 'round_no', v_new.round_no));
  return jsonb_build_object('ok', true, 'changed', true, 'session_id', v_new.id, 'round_no', v_new.round_no,
                            'room_code', v_new.room_code, 'ended_session_id', v_s.id);
end $$;


-- The live round that follows p_session in the same class or meeting, if any.
create or replace function pad_next_session_id(p_session uuid) returns uuid
language sql stable set search_path = public, pg_temp as $$
  select n.id
  from pad_sessions s
  join pad_sessions n
    on n.status = 'live'
   and n.created_at > s.created_at
   and n.classroom_id = s.classroom_id
   and pad_round_key(n.scheduled_class_id, n.meeting_thread_id, n.meeting_id, n.id)
     = pad_round_key(s.scheduled_class_id, s.meeting_thread_id, s.meeting_id, s.id)
  where s.id = p_session
  order by n.created_at desc
  limit 1;
$$;


-- -----------------------------------------------------------------------------
-- Round results
-- -----------------------------------------------------------------------------

-- One row per student who joined the round (or answered in it), computed each
-- time so a late answer key or an accepted reason updates everything.
--   counted     graded, revealed questions they were present for and not excused
--   score_pct   correct out of counted
--   present_for questions (not open) they were present for and not excused
--   answered    of those, how many they answered
--   attempted   graded questions answered (correct + wrong)
--   away        graded, revealed questions asked while they were not in the pad
--   accuracy_pct correct out of attempted
--   not_active  answered fewer than half of present_for
--   rank        among everyone who joined: most correct, then score, then
--               answered at least once; ties share a rank
--   ranked_of   how many joined (the rank is out of this)
create or replace function pad_round_rows(p_session uuid, p_roster uuid[]) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with people as (
    select distinct x as person
    from (
      select unnest(pad_joined_ids(p_session, p_roster)) as x
      union
      select r.student_id
      from pad_responses r
      join pad_prompts p on p.id = r.prompt_id
      where p.session_id = p_session
    ) u
    where not pad_is_staff(x)
  ),
  people_arr as (
    select coalesce(array_agg(person), '{}'::uuid[]) as ids from people
  ),
  cells as (
    select p.state, p.ungraded, pr.*
    from pad_prompts p
    cross join people_arr pa
    cross join lateral pad_participation_rows(p.id, pa.ids) pr
    where p.session_id = p_session and p.state <> 'open'
  ),
  per as (
    select
      pe.person as student_id,
      (select u.name from users u where u.id = pe.person) as name,
      pe.person = any (coalesce(p_roster, '{}'::uuid[])) as on_roster,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.result = 'correct')::int as correct,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.result = 'incorrect')::int as wrong,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.participation = 'silent')::int as no_answer,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.participation = 'absent')::int as away,
      count(*) filter (where c.participation = 'excused')::int as excused,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.participation in ('answered', 'silent'))::int as counted,
      count(*) filter (where c.participation = 'answered')::int as answered,
      count(*) filter (where c.participation in ('answered', 'silent'))::int as present_for
    from people pe
    left join cells c on c.student_id = pe.person
    group by pe.person
  ),
  scored as (
    select per.*,
           correct + wrong as attempted,
           case when counted > 0 then round(100.0 * correct / counted)::int end as score_pct,
           case when correct + wrong > 0 then round(100.0 * correct / (correct + wrong))::int end as accuracy_pct,
           case when present_for > 0 then round(100.0 * answered / present_for)::int end as participation_pct
    from per
  ),
  labelled as (
    select scored.*,
           case
             when score_pct is null then null
             when score_pct >= 75 then 'strong'
             when score_pct >= 50 then 'good'
             else 'needs_practice'
           end as label,
           present_for > 0 and answered * 2 < present_for as not_active
    from scored
  ),
  ranked as (
    select labelled.*,
           rank() over (order by correct desc, score_pct desc nulls last, (answered > 0) desc)::int as rank,
           (count(*) over ())::int as ranked_of
    from labelled
  )
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.rank nulls last, ranked.name, ranked.student_id), '[]'::jsonb)
  from ranked;
$$;


-- The class-level tiles for a round, from its rows.
create or replace function pad_round_class(p_session uuid, p_rows jsonb, p_roster uuid[]) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questions',    (select count(*) from pad_prompts p where p.session_id = p_session and p.state <> 'open'),
    'graded',       (select count(*) from pad_prompts p where p.session_id = p_session and p.state = 'revealed' and not p.ungraded),
    'polls',        (select count(*) from pad_prompts p where p.session_id = p_session and p.state = 'revealed' and p.ungraded),
    'pending_keys', (select count(*) from pad_prompts p where p.session_id = p_session and p.state in ('open', 'closed')),
    'joined',       jsonb_array_length(p_rows),
    'took_part',    (select count(*) from jsonb_array_elements(p_rows) r where (r ->> 'answered')::int > 0),
    'enrolled',     cardinality(coalesce(p_roster, '{}'::uuid[])),
    'average_score', (select round(avg((r ->> 'score_pct')::numeric))::int
                      from jsonb_array_elements(p_rows) r where r ->> 'score_pct' is not null),
    'average_participation', (select round(avg((r ->> 'participation_pct')::numeric))::int
                              from jsonb_array_elements(p_rows) r where r ->> 'participation_pct' is not null)
  );
$$;


-- The top of the round: at most five names, only students with a correct answer.
create or replace function pad_round_top(p_rows jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', t.r -> 'student_id',
           'name', t.r -> 'name',
           'rank', t.r -> 'rank',
           'correct', t.r -> 'correct',
           'counted', t.r -> 'counted'
         ) order by t.ord), '[]'::jsonb)
  from (
    select r, ord
    from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
    where (r ->> 'rank') is not null and (r ->> 'rank')::int <= 5 and (r ->> 'correct')::int > 0
    order by ord
    limit 5
  ) t;
$$;


create or replace function pad_changed_since_publish(p_session uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1
    from pad_sessions s
    join pad_events e on e.session_id = s.id
    where s.id = p_session
      and s.results_published_at is not null
      and e.at > s.results_published_at
      and e.action in ('set_key', 'reveal', 'excuse')
  );
$$;


-- The teacher's view of a round's results: everyone, ranked.
create or replace function pad_session_results(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s    pad_sessions;
  v_rows jsonb;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;

  v_rows := pad_round_rows(v_s.id, p_roster);
  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'round_no', v_s.round_no,
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id),
      'scheduled_class_id', v_s.scheduled_class_id,
      'created_at', v_s.created_at,
      'ended_at', v_s.ended_at,
      'results_published_at', v_s.results_published_at,
      'changed_since_publish', pad_changed_since_publish(v_s.id)
    ),
    'class', pad_round_class(v_s.id, v_rows, p_roster),
    'top', pad_round_top(v_rows),
    'students', v_rows
  );
end $$;


-- Publish (or with p_publish false, withdraw) a round's results. Only an ended
-- round: results of a round still running would change under the students.
-- Hands back who should get their result by chat, once per round ever.
create or replace function pad_publish_results(p_actor uuid, p_session uuid, p_roster uuid[], p_publish boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s      pad_sessions;
  v_notify jsonb := '[]'::jsonb;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, null, p_actor, 'publish', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'ended' then
    return pad_reject(v_s.id, null, p_actor, 'publish', 'INVALID_TRANSITION', jsonb_build_object('state', v_s.status));
  end if;

  if not coalesce(p_publish, true) then
    if v_s.results_published_at is null then
      return jsonb_build_object('ok', true, 'changed', false, 'published_at', null, 'notify', '[]'::jsonb);
    end if;
    update pad_sessions set results_published_at = null, results_published_by = null where id = v_s.id;
    perform pad_log(v_s.id, null, p_actor, 'unpublish', null);
    return jsonb_build_object('ok', true, 'changed', true, 'published_at', null, 'notify', '[]'::jsonb);
  end if;

  if v_s.results_published_at is null then
    update pad_sessions set results_published_at = now(), results_published_by = p_actor
     where id = v_s.id
    returning * into v_s;
    perform pad_log(v_s.id, null, p_actor, 'publish', null);
  else
    -- Republishing after a late change: the new time marks what students now see.
    update pad_sessions set results_published_at = now(), results_published_by = p_actor
     where id = v_s.id
    returning * into v_s;
    perform pad_log(v_s.id, null, p_actor, 'publish', jsonb_build_object('again', true));
  end if;

  if v_s.results_notified_at is null then
    select coalesce(jsonb_agg(r -> 'student_id'), '[]'::jsonb) into v_notify
    from jsonb_array_elements(pad_round_rows(v_s.id, p_roster)) r;
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'published_at', v_s.results_published_at, 'notify', v_notify);
end $$;


create or replace function pad_mark_results_notified(p_actor uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s pad_sessions;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.results_notified_at is not null then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update pad_sessions set results_notified_at = now() where id = v_s.id;
  return jsonb_build_object('ok', true, 'changed', true);
end $$;


-- Writes (or rewrites) the stored results of an ended round. Safe to run again:
-- the round's rows are replaced in one go.
create or replace function pad_store_round_results(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_count int;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'ended' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION', 'state', v_s.status);
  end if;

  delete from pad_round_results where session_id = v_s.id;

  insert into pad_round_results (
    session_id, student_id, scheduled_class_id, classroom_id, round_no, on_roster,
    questions, attempted, not_attempted, correct, wrong, excused, away, answered, present_for,
    score_pct, accuracy_pct, participation_pct, label, not_active, rank, ranked_of, computed_at
  )
  select v_s.id, (r ->> 'student_id')::uuid, v_s.scheduled_class_id, v_s.classroom_id, v_s.round_no,
         coalesce((r ->> 'on_roster')::boolean, false),
         (r ->> 'counted')::int, (r ->> 'attempted')::int, (r ->> 'no_answer')::int,
         (r ->> 'correct')::int, (r ->> 'wrong')::int, (r ->> 'excused')::int, (r ->> 'away')::int,
         (r ->> 'answered')::int, (r ->> 'present_for')::int,
         (r ->> 'score_pct')::int, (r ->> 'accuracy_pct')::int, (r ->> 'participation_pct')::int,
         r ->> 'label', coalesce((r ->> 'not_active')::boolean, false),
         (r ->> 'rank')::int, (r ->> 'ranked_of')::int, now()
  from jsonb_array_elements(pad_round_rows(v_s.id, p_roster)) r;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'stored', v_count);
end $$;


-- One student's answer to each question of a round, for the folded list under
-- their result. Only their own answers, and the key only once it is revealed.
create or replace function pad_student_questions(p_session uuid, p_student uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'prompt_id', p.id,
           'sequence', p.sequence,
           'label', p.label,
           'answer_type', p.answer_type,
           'your_answer', pr.answer,
           'correct_keys', case when p.state = 'revealed' and not p.ungraded then to_jsonb(p.correct_keys) end,
           'result', case
             when p.state <> 'revealed' then 'pending'
             when p.ungraded then 'poll'
             when pr.participation = 'excused' then 'excused'
             when pr.participation = 'absent' then 'away'
             when pr.participation = 'silent' then 'not_attempted'
             when pr.result = 'correct' then 'right'
             else 'wrong'
           end
         ) order by p.sequence), '[]'::jsonb)
  from pad_prompts p
  cross join lateral pad_participation_rows(p.id, array[p_student]) pr
  where p.session_id = p_session and p.state <> 'open' and pr.student_id = p_student;
$$;


-- What one student sees of a round: their own row, the top five, and the class
-- average. Nothing until the teacher publishes.
create or replace function pad_student_results(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s    pad_sessions;
  v_rows jsonb;
  v_me   jsonb;
  v_cls  jsonb;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;

  if v_s.results_published_at is null then
    return jsonb_build_object('ok', true, 'published', false, 'status', v_s.status, 'round_no', v_s.round_no);
  end if;

  v_rows := pad_round_rows(v_s.id, p_roster);
  select r into v_me from jsonb_array_elements(v_rows) r where (r ->> 'student_id')::uuid = p_actor;
  v_cls := pad_round_class(v_s.id, v_rows, p_roster);

  return jsonb_build_object(
    'ok', true,
    'published', true,
    'status', v_s.status,
    'round_no', v_s.round_no,
    'published_at', v_s.results_published_at,
    -- Their own row with their own rank (out of everyone who joined). Never
    -- anyone else's score beyond the top five.
    'me', case when v_me is null then null
               else (v_me - 'on_roster')
                    || jsonb_build_object('in_top', coalesce((v_me ->> 'rank')::int <= 5 and (v_me ->> 'correct')::int > 0, false))
          end,
    'top', pad_round_top(v_rows),
    'questions', pad_student_questions(v_s.id, p_actor),
    'class', jsonb_build_object(
      'questions', v_cls -> 'questions',
      'graded', v_cls -> 'graded',
      'joined', v_cls -> 'joined',
      'took_part', v_cls -> 'took_part',
      'average_score', v_cls -> 'average_score'
    )
  );
end $$;


-- The rounds of one class. p_as 'teacher' (a staff member; the route checks
-- they teach the classroom): every round with its tiles. p_as 'student' (an
-- enrolled student): published rounds only, with their own row.
create or replace function pad_class_rounds(p_actor uuid, p_class uuid, p_roster uuid[], p_as text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_classroom uuid;
  v_out       jsonb := '[]'::jsonb;
  v_s         pad_sessions;
  v_rows      jsonb;
  v_me        jsonb;
begin
  select c.classroom_id into v_classroom from nexus_scheduled_classes c where c.id = p_class;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_as = 'teacher' then
    if p_actor is null or not pad_is_staff(p_actor) then
      return jsonb_build_object('ok', false, 'code', 'NOT_STAFF');
    end if;
  elsif p_as = 'student' then
    if p_actor is null or not exists (
      select 1 from pad_sessions s
      where s.scheduled_class_id = p_class and pad_is_enrolled_student(p_actor, s.classroom_id)
    ) and not pad_is_enrolled_student(p_actor, v_classroom) then
      return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'as');
  end if;

  for v_s in
    select * from pad_sessions s
    where s.scheduled_class_id = p_class
      and (p_as = 'teacher' or s.results_published_at is not null)
    order by s.round_no, s.created_at
  loop
    v_rows := pad_round_rows(v_s.id, p_roster);
    if p_as = 'teacher' then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'session_id', v_s.id,
        'round_no', v_s.round_no,
        'status', v_s.status,
        'created_at', v_s.created_at,
        'ended_at', v_s.ended_at,
        'results_published_at', v_s.results_published_at,
        'class', pad_round_class(v_s.id, v_rows, p_roster),
        'top', pad_round_top(v_rows)
      ));
    else
      select r into v_me from jsonb_array_elements(v_rows) r where (r ->> 'student_id')::uuid = p_actor;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'session_id', v_s.id,
        'round_no', v_s.round_no,
        'results_published_at', v_s.results_published_at,
        'me', case when v_me is null then null
                   else (v_me - 'on_roster')
                        || jsonb_build_object('in_top', coalesce((v_me ->> 'rank')::int <= 5 and (v_me ->> 'correct')::int > 0, false))
              end,
        'top', pad_round_top(v_rows),
        'class', (select jsonb_build_object('questions', c -> 'questions', 'graded', c -> 'graded',
                                            'took_part', c -> 'took_part', 'average_score', c -> 'average_score')
                  from (select pad_round_class(v_s.id, v_rows, p_roster) as c) x)
      ));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rounds', v_out);
end $$;


-- -----------------------------------------------------------------------------
-- Snapshots and reads
-- -----------------------------------------------------------------------------

-- As before, plus the round number, whether results are out, the round that
-- follows (so a pad moves on by itself), and the teacher's decision on a reason.
create or replace function pad_student_snapshot(p_actor uuid, p_session uuid, p_touch boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s  pad_sessions;
  v_p  pad_prompts;
  v_r  pad_responses;
  v_sr pad_skip_reasons;
  v_n  pad_nudges;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;

  if coalesce(p_touch, false) and v_s.status = 'live' then
    perform pad_touch_app_presence(v_s.id, p_actor);
  end if;

  select * into v_p from pad_prompts where session_id = p_session order by sequence desc limit 1;
  if v_p.id is not null then
    select * into v_r from pad_responses where prompt_id = v_p.id and student_id = p_actor;
    select * into v_sr from pad_skip_reasons where prompt_id = v_p.id and student_id = p_actor;
    select * into v_n from pad_nudges where prompt_id = v_p.id and student_id = p_actor;
  end if;

  return jsonb_build_object(
    'ok', true,
    'role', 'student',
    'server_time', now(),
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'hint_topic', v_s.hint_topic,
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id),
      'round_no', v_s.round_no,
      'results_published_at', v_s.results_published_at,
      'next_session_id', case when v_s.status = 'ended' then pad_next_session_id(v_s.id) end
    ),
    'prompt', case when v_p.id is null then null else jsonb_build_object(
      'id', v_p.id,
      'sequence', v_p.sequence,
      'label', v_p.label,
      'question_text', v_p.question_text,
      'image_url', v_p.image_url,
      'option_texts', to_jsonb(v_p.option_texts),
      'answer_type', v_p.answer_type,
      'option_count', v_p.option_count,
      'state', v_p.state,
      'version', v_p.version,
      'ungraded', case when v_p.state = 'revealed' then v_p.ungraded else null end,
      'correct_keys', case when v_p.state = 'revealed' then to_jsonb(v_p.correct_keys) else null end
    ) end,
    'my_response', case when v_r.id is null then null else jsonb_build_object(
      'answer', v_r.norm_answer,
      'raw_answer', v_r.raw_answer,
      'responded_at', v_r.responded_at,
      'change_count', v_r.change_count,
      'is_correct', case when v_p.state = 'revealed' then v_r.is_correct else null end
    ) end,
    'my_skip', case when v_r.id is null and v_sr.prompt_id is not null
                    then jsonb_build_object('reason', v_sr.reason, 'note', v_sr.note, 'approval', v_sr.approval) else null end,
    'nudged_at', case when v_r.id is null and v_sr.prompt_id is null and v_p.state = 'open' then v_n.nudged_at else null end,
    'score', pad_student_score(v_s.id, p_actor)
  );
end $$;


-- As before, plus:
--   counts.joined / answered_joined / excused: the live "14 of 22 answered"
--   waiting: while the newest question is open or closed, every student who
--            joined and has not answered, by name, with any reason and the
--            teacher's decision on it (the session teacher only; no other
--            snapshot carries a name)
--   people:  who joined, and who on the class list has not opened the pad
--   session.round_no and whether results are published
create or replace function pad_teacher_snapshot(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s          pad_sessions;
  v_p          pad_prompts;
  v_roster     uuid[];
  v_joined     uuid[];
  v_basis      text;
  v_bot        boolean;
  v_counts     jsonb;
  v_groups     jsonb;
  v_history    jsonb;
  v_waiting    jsonb := '[]'::jsonb;
  v_answered   int := 0;
  v_skip_total int := 0;
  v_skip_by    jsonb := '{}'::jsonb;
  v_approved   int := 0;
  v_nudged_at  timestamptz;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_roster
  from unnest(coalesce(p_roster, '{}'::uuid[])) x
  where x is not null and not pad_is_staff(x);

  v_joined := pad_joined_ids(v_s.id, v_roster);

  v_basis := case
    when (v_s.meeting_id is not null and exists (
            select 1 from pad_meeting_presence mp
            where mp.meeting_id = v_s.meeting_id and mp.joined_at >= v_s.created_at - interval '12 hours'))
      or (v_s.scheduled_class_id is not null and exists (
            select 1 from nexus_attendance a
            where a.scheduled_class_id = v_s.scheduled_class_id
              and jsonb_typeof(a.attendance_intervals) = 'array'
              and jsonb_array_length(a.attendance_intervals) > 0))
      then 'meeting'
    else 'app'
  end;

  v_bot := v_s.meeting_id is not null
    and exists (select 1 from pad_bot_conversations c where c.meeting_id = v_s.meeting_id);

  select * into v_p from pad_prompts where session_id = p_session order by sequence desc limit 1;

  if v_p.id is not null then
    select count(*) into v_answered from pad_responses r where r.prompt_id = v_p.id;

    select jsonb_build_object(
      'enrolled',            count(*) filter (where on_roster),
      'answered',            count(*) filter (where on_roster and participation = 'answered'),
      'silent',              count(*) filter (where on_roster and participation = 'silent'),
      'absent',              count(*) filter (where on_roster and participation = 'absent'),
      'excused',             count(*) filter (where on_roster and participation = 'excused'),
      'correct',             count(*) filter (where on_roster and result = 'correct'),
      'incorrect',           count(*) filter (where on_roster and result = 'incorrect'),
      'answered_off_roster', count(*) filter (where not on_roster),
      'joined',              cardinality(v_joined),
      'answered_joined',     count(*) filter (where student_id = any (v_joined) and participation = 'answered'),
      'excused_joined',      count(*) filter (where student_id = any (v_joined) and participation = 'excused')
    ) into v_counts
    from pad_participation_rows(v_p.id, v_roster);

    if v_p.state <> 'open' then
      select coalesce(jsonb_agg(jsonb_build_object('value', g.norm_answer, 'count', g.n) order by g.n desc, g.norm_answer), '[]'::jsonb)
        into v_groups
      from (
        select r.norm_answer, count(*) as n
        from pad_responses r
        where r.prompt_id = v_p.id
        group by r.norm_answer
      ) g;
    end if;

    select coalesce(sum(g.n), 0)::int, coalesce(jsonb_object_agg(g.reason, g.n), '{}'::jsonb), coalesce(sum(g.approved), 0)::int
      into v_skip_total, v_skip_by, v_approved
    from (
      select sr.reason, count(*) as n, count(*) filter (where sr.approval = 'approved') as approved
      from pad_skip_reasons sr
      where sr.prompt_id = v_p.id
        and sr.student_id = any (v_roster)
        and not exists (select 1 from pad_responses r where r.prompt_id = v_p.id and r.student_id = sr.student_id)
      group by sr.reason
    ) g;

    select max(n.nudged_at) into v_nudged_at from pad_nudges n where n.prompt_id = v_p.id;

    if v_p.state in ('open', 'closed') then
      select coalesce(jsonb_agg(jsonb_build_object(
               'student_id', j,
               'name', (select u.name from users u where u.id = j),
               'reason', sr.reason,
               'note', sr.note,
               'approval', sr.approval,
               'nudged_at', n.nudged_at,
               'pad_open', exists (
                 select 1 from pad_app_presence ap
                 where ap.session_id = v_s.id and ap.student_id = j
                   and ap.last_seen_at >= now() - interval '90 seconds')
             ) order by (select u.name from users u where u.id = j), j), '[]'::jsonb)
        into v_waiting
      from unnest(v_joined) j
      left join pad_skip_reasons sr on sr.prompt_id = v_p.id and sr.student_id = j
      left join pad_nudges n on n.prompt_id = v_p.id and n.student_id = j
      where not exists (select 1 from pad_responses r where r.prompt_id = v_p.id and r.student_id = j);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'sequence', p.sequence,
           'label', p.label,
           'answer_type', p.answer_type,
           'option_count', p.option_count,
           'state', p.state,
           'ungraded', p.ungraded,
           'correct_keys', to_jsonb(p.correct_keys),
           'opened_at', p.opened_at,
           'answered', (select count(*) from pad_responses r where r.prompt_id = p.id),
           'correct', (select count(*) from pad_responses r where r.prompt_id = p.id and r.is_correct)
         ) order by p.sequence), '[]'::jsonb)
    into v_history
  from pad_prompts p
  where p.session_id = v_s.id;

  return jsonb_build_object(
    'ok', true,
    'role', 'teacher',
    'server_time', now(),
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'room_code', v_s.room_code,
      'hint_topic', v_s.hint_topic,
      'teacher_topic', v_s.teacher_topic,
      'classroom_id', v_s.classroom_id,
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id),
      'scheduled_class_id', v_s.scheduled_class_id,
      'batch_id', v_s.batch_id,
      'meeting_id', v_s.meeting_id,
      'created_at', v_s.created_at,
      'ended_at', v_s.ended_at,
      'presence_basis', v_basis,
      'bot_in_meeting', v_bot,
      'round_no', v_s.round_no,
      'results_published_at', v_s.results_published_at
    ),
    'readiness', jsonb_build_object(
      'enrolled', cardinality(v_roster),
      'joined', cardinality(v_joined),
      'connected', (
        select count(distinct ap.student_id)
        from pad_app_presence ap
        where ap.session_id = v_s.id
          and ap.student_id = any (v_roster)
          and ap.last_seen_at >= now() - interval '90 seconds'
      ),
      'in_meeting', (
        select count(distinct mp.student_id)
        from pad_meeting_presence mp
        where v_s.meeting_id is not null
          and mp.meeting_id = v_s.meeting_id
          and mp.student_id = any (v_roster)
          and mp.left_at is null
          and mp.joined_at > now() - interval '12 hours'
      )
    ),
    'people', jsonb_build_object(
      'joined', (select coalesce(jsonb_agg(jsonb_build_object('student_id', x, 'name', (select u.name from users u where u.id = x))
                                           order by (select u.name from users u where u.id = x), x), '[]'::jsonb)
                 from unnest(v_joined) x),
      'not_joined', (select coalesce(jsonb_agg(jsonb_build_object('student_id', x, 'name', (select u.name from users u where u.id = x))
                                               order by (select u.name from users u where u.id = x), x), '[]'::jsonb)
                     from unnest(v_roster) x where not (x = any (v_joined)))
    ),
    'prompt', case when v_p.id is null then null else jsonb_build_object(
      'id', v_p.id,
      'sequence', v_p.sequence,
      'answer_type', v_p.answer_type,
      'option_count', v_p.option_count,
      'state', v_p.state,
      'version', v_p.version,
      'correct_keys', to_jsonb(v_p.correct_keys),
      'ungraded', v_p.ungraded,
      'label', v_p.label,
      'question_text', v_p.question_text,
      'image_url', v_p.image_url,
      'option_texts', to_jsonb(v_p.option_texts),
      'opened_at', v_p.opened_at,
      'closed_at', v_p.closed_at,
      'revealed_at', v_p.revealed_at,
      'answered_count', v_answered,
      'last_nudged_at', v_nudged_at
    ) end,
    'counts', v_counts,
    'groups', coalesce(v_groups, '[]'::jsonb),
    'skips', jsonb_build_object('total', v_skip_total, 'by_reason', v_skip_by, 'approved', v_approved),
    'waiting', v_waiting,
    'history', v_history
  );
end $$;


-- Named rows for one question, for the session teacher only, now also while it
-- is open (the teacher's own screen; students and the meeting screen never get
-- names). Each row says why a student who did not answer said so, whether the
-- teacher accepted it, and whether they were nudged.
create or replace function pad_participation(p_actor uuid, p_prompt uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_teacher uuid;
begin
  select s.teacher_id into v_teacher
  from pad_prompts p
  join pad_sessions s on s.id = p.session_id
  where p.id = p_prompt;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_teacher is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(
               to_jsonb(t)
               || jsonb_build_object('skip_reason', case when t.answer is null then sr.reason end,
                                     'skip_note', case when t.answer is null then sr.note end,
                                     'skip_approval', case when t.answer is null then sr.approval end,
                                     'nudged', n.prompt_id is not null))
      from pad_participation_rows(p_prompt, p_roster) t
      left join pad_skip_reasons sr on sr.prompt_id = p_prompt and sr.student_id = t.student_id
      left join pad_nudges n on n.prompt_id = p_prompt and n.student_id = t.student_id
      where not pad_is_staff(t.student_id)
    ), '[]'::jsonb)
  );
end $$;


-- The class report: as before, plus the round number and publish state, and
-- each student's excused count.
create or replace function pad_session_report(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s        pad_sessions;
  v_roster   uuid[];
  v_people   uuid[];
  v_prompts  jsonb;
  v_students jsonb;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_roster
  from unnest(coalesce(p_roster, '{}'::uuid[])) x
  where x is not null and not pad_is_staff(x);

  select coalesce(array_agg(distinct u.x), '{}'::uuid[]) into v_people
  from (
    select unnest(v_roster) as x
    union
    select r.student_id
    from pad_responses r
    join pad_prompts p on p.id = r.prompt_id
    where p.session_id = p_session
  ) u;

  with cells as (
    select p.state, p.ungraded, pr.*
    from pad_prompts p
    cross join lateral pad_participation_rows(p.id, v_people) pr
    where p.session_id = p_session and p.state <> 'open'
  )
  select coalesce(jsonb_agg(to_jsonb(s) order by s.name, s.student_id), '[]'::jsonb) into v_students
  from (
    select
      pe.person as student_id,
      (select u.name from users u where u.id = pe.person) as name,
      pe.person = any (v_roster) as on_roster,
      count(*) filter (where c.participation = 'answered') as answered,
      count(*) filter (where c.participation = 'silent') as silent,
      count(*) filter (where c.participation = 'absent') as absent,
      count(*) filter (where c.participation = 'excused') as excused,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.result = 'correct') as correct,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.result = 'incorrect') as wrong,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.participation = 'silent') as skipped,
      count(*) filter (where c.state = 'revealed' and not c.ungraded and c.participation in ('answered', 'silent')) as total_graded
    from unnest(v_people) as pe(person)
    left join cells c on c.student_id = pe.person
    group by pe.person
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'sequence', p.sequence,
           'label', p.label,
           'question_text', p.question_text,
           'image_url', p.image_url,
           'answer_type', p.answer_type,
           'option_count', p.option_count,
           'state', p.state,
           'ungraded', p.ungraded,
           'correct_keys', to_jsonb(p.correct_keys),
           'opened_at', p.opened_at,
           'closed_at', p.closed_at,
           'revealed_at', p.revealed_at,
           'counts', case when p.state = 'open' then null else (
             select jsonb_build_object(
               'enrolled',  count(*) filter (where on_roster),
               'answered',  count(*) filter (where on_roster and participation = 'answered'),
               'silent',    count(*) filter (where on_roster and participation = 'silent'),
               'absent',    count(*) filter (where on_roster and participation = 'absent'),
               'excused',   count(*) filter (where on_roster and participation = 'excused'),
               'correct',   count(*) filter (where on_roster and result = 'correct'),
               'incorrect', count(*) filter (where on_roster and result = 'incorrect'),
               'answered_off_roster', count(*) filter (where not on_roster)
             )
             from pad_participation_rows(p.id, v_roster)
           ) end,
           'groups', case when p.state = 'open' then null else (
             select coalesce(jsonb_agg(jsonb_build_object('value', g.norm_answer, 'count', g.n) order by g.n desc, g.norm_answer), '[]'::jsonb)
             from (
               select r.norm_answer, count(*) as n
               from pad_responses r
               where r.prompt_id = p.id
               group by r.norm_answer
             ) g
           ) end,
           'skips', case when p.state = 'open' then null else (
             select coalesce(jsonb_object_agg(g.reason, g.n), '{}'::jsonb)
             from (
               select sr.reason, count(*) as n
               from pad_skip_reasons sr
               where sr.prompt_id = p.id
                 and not exists (select 1 from pad_responses r where r.prompt_id = p.id and r.student_id = sr.student_id)
               group by sr.reason
             ) g
           ) end
         ) order by p.sequence), '[]'::jsonb)
    into v_prompts
  from pad_prompts p
  where p.session_id = p_session;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'classroom_id', v_s.classroom_id,
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id),
      'scheduled_class_id', v_s.scheduled_class_id,
      'created_at', v_s.created_at,
      'ended_at', v_s.ended_at,
      'enrolled', cardinality(v_roster),
      'round_no', v_s.round_no,
      'results_published_at', v_s.results_published_at,
      'changed_since_publish', pad_changed_since_publish(v_s.id)
    ),
    'prompts', v_prompts,
    'students', v_students
  );
end $$;


-- -----------------------------------------------------------------------------
-- Privileges: functions for service_role only
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pad\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
