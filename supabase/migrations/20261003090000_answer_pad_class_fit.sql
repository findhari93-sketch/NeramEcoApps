-- =============================================================================
-- Answer Pad: fit a real class. Follow-up to 20260911090100_answer_pad.sql.
--
-- What the first live class asked for:
--
--   1. The teacher's own reference for a question. The paper says Q.38 while the
--      pad counted "Question 1", so students could not tell which question they
--      were answering. pad_prompts.label (until now a note added after Reveal)
--      can be set when the question is asked, and students see it.
--   2. The question itself, typed or dictated with Windows voice typing, when
--      the teacher asks one out loud. Optional: letters alone stay the default.
--   3. Deciding the answer later. The teacher often checks the answer after
--      seeing how the class answered, sometimes after the class. An earlier
--      question may now stay closed while the next one runs, and its key can be
--      set and revealed after the session has ended. Scores are computed from
--      the prompts every time (pad_student_score), so a late reveal updates every
--      score and the class report with nothing else to do.
--
-- Every statement can run twice, as a re-applied deploy would.
-- =============================================================================

alter table pad_prompts add column if not exists question_text text;

alter table pad_prompts drop constraint if exists pad_prompts_question_text_check;
alter table pad_prompts add constraint pad_prompts_question_text_check
  check (question_text is null or char_length(question_text) between 1 and 500);

comment on column pad_prompts.label is
  'The teacher''s reference for the question, e.g. 38 for Q.38 on the paper. Set at ASK or any time later.';
comment on column pad_prompts.question_text is
  'The question as the teacher typed or dictated it. Optional; most questions are on the shared screen.';
comment on table pad_prompts is
  'Answer Pad: one ASK press, with the teacher''s optional reference and question text. State and keys change only through pad_* transition functions (guard trigger).';

-- One OPEN prompt per session. Closed prompts may pile up: each is a question
-- whose answer the teacher decides later. A double-tapped ASK is still safe:
-- pad_ask locks the session row and hands back the prompt already open.
drop index if exists pad_prompts_one_active;
create unique index if not exists pad_prompts_one_open
  on pad_prompts (session_id) where state = 'open';


-- -----------------------------------------------------------------------------
-- Text helpers
-- -----------------------------------------------------------------------------

-- A reference is one line: runs of whitespace become one space.
create or replace function pad_clean_label(p_value text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$$;

-- A question keeps its line breaks; spaces and tabs collapse, blank lines do not pile up.
create or replace function pad_clean_question(p_value text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(
    btrim(regexp_replace(regexp_replace(coalesce(p_value, ''), '[ \t]+', ' ', 'g'), '\n\s*\n\s*\n+', E'\n\n', 'g')),
    ''
  );
$$;


-- -----------------------------------------------------------------------------
-- Teacher: prompt transitions
-- -----------------------------------------------------------------------------

-- The old four-argument pad_ask goes first, so PostgREST never sees two overloads.
drop function if exists pad_ask(uuid, uuid, text, int);

create or replace function pad_ask(
  p_actor        uuid,
  p_session      uuid,
  p_answer_type  text default 'mcq',
  p_option_count int  default 4,
  p_label        text default null,
  p_text         text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_p     pad_prompts;
  v_seq   int;
  v_label text := pad_clean_label(p_label);
  v_text  text := pad_clean_question(p_text);
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

  -- A repeated ASK returns the prompt already open. An earlier CLOSED prompt no
  -- longer blocks the next question: its answer is decided later.
  select * into v_p
  from pad_prompts
  where session_id = p_session and state = 'open'
  for update;

  if found then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id,
                              'state', v_p.state, 'version', v_p.version, 'sequence', v_p.sequence,
                              'label', v_p.label);
  end if;

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

  select coalesce(max(sequence), 0) + 1 into v_seq from pad_prompts where session_id = p_session;

  perform set_config('pad.transition', 'ask', true);
  insert into pad_prompts (session_id, sequence, answer_type, option_count, label, question_text)
  values (p_session, v_seq, p_answer_type, case when p_answer_type = 'mcq' then p_option_count else null end,
          v_label, v_text)
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'ask',
                  jsonb_build_object('sequence', v_seq, 'answer_type', p_answer_type, 'option_count', v_p.option_count,
                                     'label', v_label, 'has_text', v_text is not null));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id,
                            'state', v_p.state, 'version', v_p.version, 'sequence', v_seq, 'label', v_label);
end $$;


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
     set state = 'open', closed_at = null, correct_keys = null, ungraded = false, version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'reopen', null);
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- Unchanged except that an ended session no longer refuses: the teacher sets the
-- answer to a question left for later from the class report.
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
  if v_p.state <> 'closed' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;

  if coalesce(p_ungraded, false) then
    if v_p.ungraded then
      return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
    end if;
    perform set_config('pad.transition', 'set_key', true);
    update pad_prompts
       set ungraded = true, correct_keys = null, version = version + 1
     where id = v_p.id
    returning * into v_p;
    perform pad_log(v_s.id, v_p.id, p_actor, 'set_key', jsonb_build_object('ungraded', true));
    return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;

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

  perform set_config('pad.transition', 'set_key', true);
  update pad_prompts
     set correct_keys = v_keys, ungraded = false, version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'set_key', jsonb_build_object('keys', to_jsonb(v_keys)));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- Unchanged except that an ended session no longer refuses (see pad_set_key).
create or replace function pad_reveal(p_actor uuid, p_prompt uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p pad_prompts;
  v_s pad_sessions;
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
  if not v_p.ungraded and v_p.correct_keys is null then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reveal', 'KEY_REQUIRED');
  end if;

  -- Grading and the state change commit together: nobody can ever see REVEALED
  -- without their result.
  perform set_config('pad.transition', 'reveal', true);
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
                                     'answered', (select count(*) from pad_responses r where r.prompt_id = v_p.id),
                                     'after_class', v_s.status = 'ended'));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- The reference and the question text, edited after the ASK (a typo, or the
-- number typed after the question was already open). Any state, as pad_set_label.
create or replace function pad_set_details(p_actor uuid, p_prompt uuid, p_label text, p_text text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     pad_prompts;
  v_s     pad_sessions;
  v_label text := pad_clean_label(p_label);
  v_text  text := pad_clean_question(p_text);
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'details', 'NOT_SESSION_TEACHER');
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'label');
  end if;
  if v_text is not null and char_length(v_text) > 500 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'text');
  end if;

  if v_p.label is not distinct from v_label and v_p.question_text is not distinct from v_text then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;

  update pad_prompts
     set label = v_label, question_text = v_text, version = version + 1
   where id = v_p.id
  returning * into v_p;
  perform pad_log(v_s.id, v_p.id, p_actor, 'details', jsonb_build_object('label', v_label, 'has_text', v_text is not null));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- Ending with questions still unanswered is normal now, so the confirmation
-- names how many and the first of them, and after the end they stay settable.
create or replace function pad_end_session(p_actor uuid, p_session uuid, p_confirm_unrevealed boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_first pad_prompts;
  v_count int;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, null, p_actor, 'end', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status = 'ended' then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  select count(*) into v_count
  from pad_prompts
  where session_id = p_session and state in ('open', 'closed');

  if v_count > 0 and not coalesce(p_confirm_unrevealed, false) then
    select * into v_first
    from pad_prompts
    where session_id = p_session and state in ('open', 'closed')
    order by sequence
    limit 1;
    return jsonb_build_object('ok', false, 'code', 'UNREVEALED_PROMPT',
                              'sequence', v_first.sequence, 'label', v_first.label, 'count', v_count);
  end if;

  perform pad_end_session_internal(p_session, p_actor, 'teacher');
  return jsonb_build_object('ok', true, 'changed', true);
end $$;


-- -----------------------------------------------------------------------------
-- Snapshots and reads: the reference and the question text reach every screen
-- -----------------------------------------------------------------------------

create or replace function pad_student_snapshot(p_actor uuid, p_session uuid, p_touch boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s pad_sessions;
  v_p pad_prompts;
  v_r pad_responses;
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

  -- The newest prompt: the active one, or the last reveal until the next ASK.
  select * into v_p from pad_prompts where session_id = p_session order by sequence desc limit 1;
  if v_p.id is not null then
    select * into v_r from pad_responses where prompt_id = v_p.id and student_id = p_actor;
  end if;

  return jsonb_build_object(
    'ok', true,
    'role', 'student',
    'server_time', now(),
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'hint_topic', v_s.hint_topic,
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id)
    ),
    'prompt', case when v_p.id is null then null else jsonb_build_object(
      'id', v_p.id,
      'sequence', v_p.sequence,
      'label', v_p.label,
      'question_text', v_p.question_text,
      'answer_type', v_p.answer_type,
      'option_count', v_p.option_count,
      'state', v_p.state,
      'version', v_p.version,
      -- Nothing about grading reaches a student before Reveal.
      'ungraded', case when v_p.state = 'revealed' then v_p.ungraded else null end,
      'correct_keys', case when v_p.state = 'revealed' then to_jsonb(v_p.correct_keys) else null end
    ) end,
    'my_response', case when v_r.id is null then null else jsonb_build_object(
      'answer', v_r.norm_answer,
      'raw_answer', v_r.raw_answer,
      'responded_at', v_r.responded_at,
      'is_correct', case when v_p.state = 'revealed' then v_r.is_correct else null end
    ) end,
    'score', pad_student_score(v_s.id, p_actor)
  );
end $$;


create or replace function pad_teacher_snapshot(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s        pad_sessions;
  v_p        pad_prompts;
  v_roster   uuid[];
  v_basis    text;
  v_bot      boolean;
  v_counts   jsonb;
  v_groups   jsonb;
  v_history  jsonb;
  v_answered int := 0;
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
  where x is not null;

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
      'correct',             count(*) filter (where on_roster and result = 'correct'),
      'incorrect',           count(*) filter (where on_roster and result = 'incorrect'),
      'answered_off_roster', count(*) filter (where not on_roster)
    ) into v_counts
    from pad_participation_rows(v_p.id, v_roster);

    -- Distribution only once answering has stopped: while OPEN the teacher sees a count.
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
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'sequence', p.sequence,
           'label', p.label,
           'answer_type', p.answer_type,
           'option_count', p.option_count,
           'state', p.state,
           'ungraded', p.ungraded,
           -- A question left for later may already have a key picked; the chip's picker shows it.
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
      'bot_in_meeting', v_bot
    ),
    'readiness', jsonb_build_object(
      'enrolled', cardinality(v_roster),
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
      'opened_at', v_p.opened_at,
      'closed_at', v_p.closed_at,
      'revealed_at', v_p.revealed_at,
      'answered_count', v_answered
    ) end,
    'counts', v_counts,
    'groups', coalesce(v_groups, '[]'::jsonb),
    'history', v_history
  );
end $$;


-- The class report gains each prompt's question text and, once answering has
-- stopped, its answer counts: the key picker for a question left for later.
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
  where x is not null;

  -- Everyone with a report row: the roster, plus anyone who answered in this
  -- session without being on it (a dormant student). Judging them over every
  -- prompt keeps their row equal to the running score on their own pad.
  select coalesce(array_agg(distinct u.x), '{}'::uuid[]) into v_people
  from (
    select unnest(v_roster) as x
    union
    select r.student_id
    from pad_responses r
    join pad_prompts p on p.id = r.prompt_id
    where p.session_id = p_session
  ) u;

  -- A prompt still OPEN is left out: while students answer, the teacher sees a count only.
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
      'enrolled', cardinality(v_roster)
    ),
    'prompts', v_prompts,
    'students', v_students
  );
end $$;


-- -----------------------------------------------------------------------------
-- Privileges: functions for service_role only, as in the base migration
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
