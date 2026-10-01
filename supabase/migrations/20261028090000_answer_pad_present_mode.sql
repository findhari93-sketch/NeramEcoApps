-- =============================================================================
-- Answer Pad: present a question bank paper to the class. Follow-up to
-- 20261024090000_answer_pad_rounds_results.sql.
--
-- The teacher shares one "Present to class" screen in the Teams meeting and
-- drives the class from it: Start opens the pad on the question shown, with
-- its paper number, a Close, a Reveal from the question bank's own key, Next.
--
--   1. A prompt may point at the question bank question it asks
--      (qb_question_id). Students' pads show that question's text, picture
--      and options, built by pad_qb_view, which never carries the answer.
--   2. A prompt may have a time limit. Answers stop at closes_at (plus two
--      seconds for a tap already on its way); the first snapshot read after
--      that closes the question (pad_expire_due), and the presenter closes it
--      too. Nothing reveals on its own: the teacher still presses Reveal.
--   3. The teacher can add time to an open question, or to the newest one
--      closed, which opens it again (pad_set_timer).
--   4. The question bank's key is saved at ASK as suggested_keys (teacher only)
--      and used by Reveal when the teacher has not chosen a key. Choosing a key
--      or Poll still wins.
--   5. A browser session (the presenter, no meeting) is taken over by the class
--      meeting when the teacher opens the pad there, so students in the meeting
--      find it with no room code.
--
-- Every statement can run twice, as a re-applied deploy would.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------

alter table pad_prompts add column if not exists qb_question_id uuid references nexus_qb_questions(id) on delete set null;
alter table pad_prompts add column if not exists time_limit_s int;
alter table pad_prompts add column if not exists closes_at timestamptz;
alter table pad_prompts add column if not exists suggested_keys text[];

alter table pad_prompts drop constraint if exists pad_prompts_time_limit_check;
alter table pad_prompts add constraint pad_prompts_time_limit_check
  check (time_limit_s is null or time_limit_s between 5 and 3600);
alter table pad_prompts drop constraint if exists pad_prompts_closes_at_check;
alter table pad_prompts add constraint pad_prompts_closes_at_check
  check (closes_at is null or closes_at > opened_at);
alter table pad_prompts drop constraint if exists pad_prompts_suggested_keys_check;
alter table pad_prompts add constraint pad_prompts_suggested_keys_check
  check (suggested_keys is null or cardinality(suggested_keys) between 1 and 50);

create index if not exists pad_prompts_qb_question
  on pad_prompts (qb_question_id) where qb_question_id is not null;

comment on column pad_prompts.qb_question_id is
  'The question bank question this prompt asks, when asked from Present to class. Students see its content through pad_qb_view.';
comment on column pad_prompts.time_limit_s is
  'The time the teacher gave for this question, in seconds. Null for no timer.';
comment on column pad_prompts.closes_at is
  'When answers stop. Answers are taken for 2 seconds more (a tap on its way); pad_expire_due then closes the prompt.';
comment on column pad_prompts.suggested_keys is
  'The question bank''s answer, normalised, saved at ASK. Teacher only; Reveal uses it when no key was chosen.';


-- -----------------------------------------------------------------------------
-- Guard
-- -----------------------------------------------------------------------------

-- As before, plus the timer columns and the question bank key. The question
-- bank link never changes, except to null when that question is deleted (the
-- foreign key's own update, which carries no transition flag).
create or replace function pad_guard_prompt() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_flag text := coalesce(current_setting('pad.transition', true), '');
begin
  if tg_op = 'INSERT' then
    if v_flag <> 'ask' then
      raise exception 'pad_prompts rows are created only by pad_ask()';
    end if;
    return new;
  end if;

  if new.qb_question_id is distinct from old.qb_question_id and new.qb_question_id is not null then
    raise exception 'a prompt''s question bank link is set only by pad_ask()';
  end if;

  -- The timestamps are guarded too: they define each prompt's open window, and
  -- participation is judged against that window.
  if (new.state is distinct from old.state
      or new.correct_keys is distinct from old.correct_keys
      or new.ungraded is distinct from old.ungraded
      or new.session_id is distinct from old.session_id
      or new.sequence is distinct from old.sequence
      or new.answer_type is distinct from old.answer_type
      or new.option_count is distinct from old.option_count
      or new.opened_at is distinct from old.opened_at
      or new.closed_at is distinct from old.closed_at
      or new.revealed_at is distinct from old.revealed_at
      or new.closes_at is distinct from old.closes_at
      or new.time_limit_s is distinct from old.time_limit_s
      or new.suggested_keys is distinct from old.suggested_keys)
     and v_flag not in ('close', 'reopen', 'set_key', 'reveal', 'end', 'timer') then
    raise exception 'prompt state and grading change only through the teacher transition functions';
  end if;
  return new;
end $$;


-- -----------------------------------------------------------------------------
-- A question bank question as students may see it
-- -----------------------------------------------------------------------------

-- Built field by field, never from the whole row: the row and its options carry
-- the answer (correct_answer, an option's is_correct, the option ids the key
-- names). The solution is added only once the question is revealed.
create or replace function pad_qb_view(p_qb uuid, p_revealed boolean default false) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'format', q.question_format,
    'text', q.question_text,
    'image_url', q.question_image_url,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('text', o.value ->> 'text', 'image_url', o.value ->> 'image_url') order by o.ordinality)
      from jsonb_array_elements(case when jsonb_typeof(q.options) = 'array' then q.options else '[]'::jsonb end)
           with ordinality as o(value, ordinality)
    ), '[]'::jsonb),
    'solution', case when coalesce(p_revealed, false)
                     then jsonb_build_object('explanation', q.explanation_brief, 'image_url', q.solution_image_url)
                     else null end
  )
  from nexus_qb_questions q
  where q.id = p_qb;
$$;


-- -----------------------------------------------------------------------------
-- Teacher: ASK with a question bank question and a time limit
-- -----------------------------------------------------------------------------

drop function if exists pad_ask(uuid, uuid, text, int, text, text, text, text[], uuid);

-- As before, plus:
--   p_qb_question     the question bank question shown on the presenter
--   p_time_limit      seconds until answers stop (5 to 3600), null for none
--   p_suggested_keys  the question bank's answer, checked like a key; Reveal
--                     uses it when the teacher has not chosen one
create or replace function pad_ask(
  p_actor          uuid,
  p_session        uuid,
  p_answer_type    text   default 'mcq',
  p_option_count   int    default 4,
  p_label          text   default null,
  p_text           text   default null,
  p_image_url      text   default null,
  p_option_texts   text[] default null,
  p_close_prompt   uuid   default null,
  p_qb_question    uuid   default null,
  p_time_limit     int    default null,
  p_suggested_keys text[] default null
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
  v_keys    text[];
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
                              'label', v_open.label, 'closes_at', v_open.closes_at);
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
  if p_time_limit is not null and p_time_limit not between 5 and 3600 then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'time_limit'));
  end if;
  if p_qb_question is not null and not exists (select 1 from nexus_qb_questions q where q.id = p_qb_question) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'qb_question'));
  end if;

  v_options := case when p_answer_type = 'mcq' then pad_clean_option_texts(p_option_texts) else null end;
  if not pad_valid_option_texts(v_options, p_answer_type, p_option_count) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'options'));
  end if;

  -- The suggested answer is held to the same rules as a key the teacher picks.
  if p_suggested_keys is not null and cardinality(p_suggested_keys) > 0 then
    if cardinality(p_suggested_keys) > 50
       or exists (
         select 1 from unnest(p_suggested_keys) k
         where pad_normalize(p_answer_type, k) is null
            or (p_answer_type = 'mcq' and ascii(pad_normalize(p_answer_type, k)) - 64 > p_option_count)
       ) then
      return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'suggested_keys'));
    end if;
    select array_agg(distinct pad_normalize(p_answer_type, k) order by pad_normalize(p_answer_type, k))
      into v_keys
    from unnest(p_suggested_keys) k;
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
  insert into pad_prompts (session_id, sequence, answer_type, option_count, label, question_text, image_url, option_texts,
                           qb_question_id, time_limit_s, closes_at, suggested_keys)
  values (p_session, v_seq, p_answer_type, case when p_answer_type = 'mcq' then p_option_count else null end,
          v_label, v_text, v_image, v_options,
          p_qb_question, p_time_limit,
          case when p_time_limit is not null then now() + make_interval(secs => p_time_limit) else null end,
          v_keys)
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'ask',
                  jsonb_build_object('sequence', v_seq, 'answer_type', p_answer_type, 'option_count', v_p.option_count,
                                     'label', v_label, 'has_text', v_text is not null,
                                     'has_image', v_image is not null, 'has_options', v_options is not null,
                                     'qb_question_id', p_qb_question, 'time_limit', p_time_limit,
                                     'has_suggested_key', v_keys is not null));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id,
                            'state', v_p.state, 'version', v_p.version, 'sequence', v_seq, 'label', v_label,
                            'closes_at', v_p.closes_at, 'closed_prompt_id', v_closed);
end $$;


-- -----------------------------------------------------------------------------
-- Students: no answer after time is up
-- -----------------------------------------------------------------------------

-- As before, plus the time limit. An answer is taken until closes_at and for 2
-- seconds after it, since a tap made at 0:01 is still on its way. This never
-- closes the prompt itself: it holds a shared lock, and two submits upgrading
-- theirs at once would deadlock. The next snapshot read closes it.
create or replace function pad_submit(p_actor uuid, p_prompt uuid, p_raw text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p       pad_prompts;
  v_s       pad_sessions;
  v_r       pad_responses;
  v_old     pad_responses;
  v_norm    text;
  v_time_up boolean;
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
  v_time_up := v_p.state = 'open' and v_p.closes_at is not null and now() > v_p.closes_at + interval '2 seconds';

  if v_s.status <> 'live' or v_p.state <> 'open' or v_time_up then
    -- A retry of an answer that landed before Close is still a success: the
    -- student's pad must not say "too late" about an answer that counted.
    if v_old.id is not null and v_old.norm_answer = v_norm then
      return jsonb_build_object('ok', true, 'status', 'unchanged', 'answer', v_old.norm_answer,
                                'raw_answer', v_old.raw_answer, 'responded_at', v_old.responded_at);
    end if;
    -- A change that arrives after Close is refused, and says what stands.
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit',
                      case when v_s.status <> 'live' then 'SESSION_NOT_LIVE' else 'PROMPT_NOT_OPEN' end,
                      jsonb_build_object('state', case when v_time_up then 'closed' else v_p.state end)
                      || case when v_time_up then jsonb_build_object('time_up', true) else '{}'::jsonb end
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


-- -----------------------------------------------------------------------------
-- Time up: close the question
-- -----------------------------------------------------------------------------

-- Closes the session's open question once its time and the 2 second grace have
-- passed. Called first by both snapshots, so whoever reads next (a student's
-- pad, the console, the presenter) closes it; safe to run any number of times.
-- closed_at is when time ran out, not when someone happened to read.
create or replace function pad_expire_due(p_session uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare
  v_p      pad_prompts;
  v_closed boolean := false;
begin
  perform set_config('pad.transition', 'close', true);
  for v_p in
    update pad_prompts
       set state = 'closed',
           closed_at = least(now(), closes_at + interval '2 seconds'),
           version = version + 1
     where session_id = p_session
       and state = 'open'
       and closes_at is not null
       and closes_at + interval '2 seconds' < now()
    returning *
  loop
    perform pad_log(v_p.session_id, v_p.id, null, 'close',
                    jsonb_build_object('auto', 'time_up',
                                       'answered', (select count(*) from pad_responses r where r.prompt_id = v_p.id)));
    v_closed := true;
  end loop;
  perform set_config('pad.transition', '', true);
  return v_closed;
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: more time
-- -----------------------------------------------------------------------------

-- p_add seconds more on the open question (from now if its time is already up,
-- or as a new timer if it had none), or p_clear to stop the timer. On the
-- newest question when it is closed, more time opens it again first, as
-- Reopen does: "+15s" after time ran out gives the class 15 more seconds.
create or replace function pad_set_timer(p_actor uuid, p_prompt uuid, p_add int default null, p_clear boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid      uuid;
  v_p        pad_prompts;
  v_s        pad_sessions;
  v_reopened boolean := false;
begin
  select session_id into v_sid from pad_prompts where id = p_prompt;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  -- The session row first, as pad_ask and pad_reopen take it.
  select * into v_s from pad_sessions where id = v_sid for update;
  select * into v_p from pad_prompts where id = p_prompt for update;

  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_timer', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_timer', 'SESSION_NOT_LIVE');
  end if;
  if not coalesce(p_clear, false) and (p_add is null or p_add not between 1 and 600) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_timer', 'INVALID_INPUT', jsonb_build_object('field', 'add'));
  end if;

  if v_p.state = 'closed' and not coalesce(p_clear, false) then
    if exists (select 1 from pad_prompts o where o.session_id = v_p.session_id and o.sequence > v_p.sequence) then
      return pad_reject(v_s.id, v_p.id, p_actor, 'set_timer', 'NOT_LATEST_PROMPT');
    end if;
    perform set_config('pad.transition', 'reopen', true);
    update pad_prompts
       set state = 'open', closed_at = null, closes_at = null, correct_keys = null, ungraded = false, version = version + 1
     where id = v_p.id
    returning * into v_p;
    perform pad_log(v_s.id, v_p.id, p_actor, 'reopen', jsonb_build_object('by', 'timer'));
    v_reopened := true;
  elsif v_p.state <> 'open' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_timer', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;

  perform set_config('pad.transition', 'timer', true);
  update pad_prompts
     set closes_at = case when coalesce(p_clear, false) then null
                          else greatest(coalesce(closes_at, now()), now()) + make_interval(secs => p_add) end,
         version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'set_timer',
                  jsonb_build_object('add', p_add, 'clear', coalesce(p_clear, false), 'closes_at', v_p.closes_at));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state,
                            'version', v_p.version, 'closes_at', v_p.closes_at, 'reopened', v_reopened);
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: Reopen clears the timer, Reveal uses the question bank's answer
-- -----------------------------------------------------------------------------

-- As before, plus the timer is cleared: a question reopened with its old
-- closes_at would be closed again by the next read.
create or replace function pad_reopen(p_actor uuid, p_prompt uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid;
  v_p   pad_prompts;
  v_s   pad_sessions;
begin
  select session_id into v_sid from pad_prompts where id = p_prompt;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  -- The session row first, as pad_ask takes it: a Reopen and an Ask cannot
  -- interleave into two open prompts.
  select * into v_s from pad_sessions where id = v_sid for update;
  select * into v_p from pad_prompts where id = p_prompt for update;

  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reopen', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reopen', 'SESSION_NOT_LIVE');
  end if;
  if v_p.state = 'open' then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;
  if v_p.state <> 'closed' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reopen', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;
  -- Students only ever see the newest prompt, so an older one reopened would
  -- take answers nobody can give.
  if exists (select 1 from pad_prompts o where o.session_id = v_p.session_id and o.sequence > v_p.sequence) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reopen', 'NOT_LATEST_PROMPT');
  end if;

  -- Existing answers stay locked; any grading decision already made is cleared,
  -- so no key exists while the prompt is open again.
  perform set_config('pad.transition', 'reopen', true);
  update pad_prompts
     set state = 'open', closed_at = null, closes_at = null, correct_keys = null, ungraded = false, version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'reopen', null);
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- As before, except that a question asked from the question bank with no key
-- chosen is graded with the bank's answer, which becomes its key.
create or replace function pad_reveal(p_actor uuid, p_prompt uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p        pad_prompts;
  v_s        pad_sessions;
  v_key_from text := 'teacher';
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reveal', 'NOT_SESSION_TEACHER');
  end if;
  if v_p.state = 'revealed' then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;
  if v_p.state <> 'closed' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reveal', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;
  if not v_p.ungraded and v_p.correct_keys is null and v_p.suggested_keys is null then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reveal', 'KEY_REQUIRED');
  end if;

  -- Grading and the state change commit together: nobody can ever see REVEALED
  -- without their result.
  perform set_config('pad.transition', 'reveal', true);
  if not v_p.ungraded and v_p.correct_keys is null then
    update pad_prompts set correct_keys = suggested_keys where id = v_p.id
    returning * into v_p;
    v_key_from := 'qb';
  end if;
  if not v_p.ungraded then
    update pad_responses r
       set is_correct = (r.norm_answer = any (v_p.correct_keys))
     where r.prompt_id = v_p.id;
  end if;

  update pad_prompts
     set state = 'revealed', revealed_at = now(), version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'reveal',
                  jsonb_build_object('ungraded', v_p.ungraded,
                                     'key_from', case when v_p.ungraded then null else v_key_from end,
                                     'answered', (select count(*) from pad_responses r where r.prompt_id = v_p.id),
                                     'after_class', v_s.status = 'ended'));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- -----------------------------------------------------------------------------
-- Sessions: the meeting takes over a browser session
-- -----------------------------------------------------------------------------

-- As before, plus: a live browser session (no meeting) for the same class is
-- bound to the meeting the teacher now opens the pad in, instead of a conflict.
create or replace function pad_start_or_resume_session(
  p_actor           uuid,
  p_classroom       uuid,
  p_scheduled_class uuid default null,
  p_batch           uuid default null,
  p_meeting_id      text default null,
  p_meeting_thread  text default null,
  p_end_existing    boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_live    pad_sessions;
  v_new     pad_sessions;
  v_ended   uuid;
  v_code    text;
  v_created boolean := false;
  i         int;
begin
  if p_actor is null or not pad_is_staff(p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_STAFF');
  end if;
  if not exists (select 1 from nexus_classrooms c where c.id = p_classroom) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Serialise start/resume per teacher.
  perform pg_advisory_xact_lock(hashtext('pad_session_owner:' || p_actor::text));

  select * into v_live
  from pad_sessions s
  where s.teacher_id = p_actor and s.status = 'live'
  for update;

  if found then
    if v_live.classroom_id = p_classroom
       and v_live.meeting_id is not distinct from p_meeting_id
       and v_live.created_at > now() - interval '6 hours' then
      -- Same class, same meeting, recent: resume silently.
      update pad_sessions
         set scheduled_class_id = coalesce(scheduled_class_id, p_scheduled_class),
             batch_id = coalesce(batch_id, p_batch),
             meeting_thread_id = coalesce(meeting_thread_id, p_meeting_thread)
       where id = v_live.id;
      perform pad_log(v_live.id, null, p_actor, 'session_resume', null);
      return jsonb_build_object('ok', true, 'session_id', v_live.id, 'resumed', true);
    end if;

    -- The presenter started this class's pad in a browser, and the teacher now
    -- opens the pad in the class meeting: the meeting takes the session over,
    -- so students in the meeting find it with no room code. The class link is
    -- added only when it cannot clash with a round already numbered there.
    if v_live.classroom_id = p_classroom
       and v_live.meeting_id is null
       and p_meeting_id is not null
       and v_live.created_at > now() - interval '6 hours' then
      update pad_sessions
         set meeting_id = p_meeting_id,
             meeting_thread_id = coalesce(meeting_thread_id, p_meeting_thread),
             batch_id = coalesce(batch_id, p_batch),
             scheduled_class_id = case
               when scheduled_class_id is null and p_scheduled_class is not null
                    and not exists (select 1 from pad_sessions o
                                     where o.scheduled_class_id = p_scheduled_class
                                       and o.round_no = v_live.round_no)
                 then p_scheduled_class
               else scheduled_class_id
             end
       where id = v_live.id;
      perform pad_log(v_live.id, null, p_actor, 'session_resume', jsonb_build_object('meeting_bound', true));
      return jsonb_build_object('ok', true, 'session_id', v_live.id, 'resumed', true);
    end if;

    -- Never silently reuse a session for another class, never silently replace one.
    if not coalesce(p_end_existing, false) then
      return jsonb_build_object(
        'ok', false,
        'code', 'SESSION_CONFLICT',
        'existing', jsonb_build_object(
          'session_id', v_live.id,
          'classroom_id', v_live.classroom_id,
          'classroom_name', (select c.name from nexus_classrooms c where c.id = v_live.classroom_id),
          'created_at', v_live.created_at
        )
      );
    end if;

    perform pad_end_session_internal(v_live.id, p_actor, 'replaced');
    v_ended := v_live.id;
  end if;

  for i in 1..30 loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into pad_sessions (
        classroom_id, scheduled_class_id, batch_id, teacher_id, meeting_id, meeting_thread_id,
        room_code, hint_topic, teacher_topic
      ) values (
        p_classroom, p_scheduled_class, p_batch, p_actor, p_meeting_id, p_meeting_thread,
        v_code,
        'pad-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        'padt-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
      )
      returning * into v_new;
      v_created := true;
      exit;
    exception when unique_violation then
      -- That room code is live elsewhere; draw another.
      null;
    end;
  end loop;

  if not v_created then
    raise exception 'pad: could not allocate a room code';
  end if;

  perform pad_log(v_new.id, null, p_actor, 'session_start', jsonb_build_object('replaced_session_id', v_ended));
  return jsonb_build_object('ok', true, 'session_id', v_new.id, 'resumed', false, 'ended_session_id', v_ended);
end $$;


-- -----------------------------------------------------------------------------
-- Snapshots
-- -----------------------------------------------------------------------------

-- As before, plus the question's time limit (closes_at, read against
-- server_time), the question bank question it asks (text, picture, options, no
-- answer), and auto_closed when this read closed a question whose time was up.
create or replace function pad_student_snapshot(p_actor uuid, p_session uuid, p_touch boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s  pad_sessions;
  v_p  pad_prompts;
  v_r  pad_responses;
  v_sr pad_skip_reasons;
  v_n  pad_nudges;
  v_auto boolean := false;
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

  v_auto := pad_expire_due(v_s.id);

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
      'correct_keys', case when v_p.state = 'revealed' then to_jsonb(v_p.correct_keys) else null end,
      'closes_at', v_p.closes_at,
      'time_limit_s', v_p.time_limit_s,
      'qb', case when v_p.qb_question_id is not null then pad_qb_view(v_p.qb_question_id, false) else null end
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
    'score', pad_student_score(v_s.id, p_actor),
    'auto_closed', v_auto
  );
end $$;


-- As before, plus the time limit, the question bank link and its suggested
-- answer (teacher only), the question's content with its solution once
-- revealed, each history row's question bank link and suggested answer, and
-- auto_closed.
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
  v_auto       boolean := false;
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

  v_auto := pad_expire_due(v_s.id);

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
           'qb_question_id', p.qb_question_id,
           'suggested_keys', to_jsonb(p.suggested_keys),
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
      'last_nudged_at', v_nudged_at,
      'closes_at', v_p.closes_at,
      'time_limit_s', v_p.time_limit_s,
      'qb_question_id', v_p.qb_question_id,
      'suggested_keys', to_jsonb(v_p.suggested_keys),
      'qb', case when v_p.qb_question_id is not null
                 then pad_qb_view(v_p.qb_question_id, v_p.state = 'revealed') else null end
    ) end,
    'counts', v_counts,
    'groups', coalesce(v_groups, '[]'::jsonb),
    'skips', jsonb_build_object('total', v_skip_total, 'by_reason', v_skip_by, 'approved', v_approved),
    'waiting', v_waiting,
    'history', v_history,
    'auto_closed', v_auto
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
