-- =============================================================================
-- Answer Pad: the question's picture, "I can't answer", and the nudge.
-- Follow-up to 20261003090000_answer_pad_class_fit.sql.
--
--   1. A picture on the question. The teacher snips the question off the paper
--      (Win+Shift+S) and pastes it into the console, so a student on a phone can
--      read what the shared screen shows. Options can carry text as well, for a
--      question asked out loud. Both optional.
--   2. "I can't answer", with a reason: don't know, can't see the question,
--      need more time, a technical problem, or something else with a short note.
--      A reason never locks the student out: answering afterwards still counts,
--      and the answer wins. While the question is open the teacher sees how many
--      gave each reason, never who (the no-names-while-open rule holds).
--   3. The nudge. One press marks every student on the class list who has
--      neither answered nor given a reason. Their pad shows a polite banner; the
--      route also sends a Teams chat to those whose pad is closed. Once a minute
--      per question at most, enforced here so every server instance agrees.
--
-- Every statement can run twice, as a re-applied deploy would.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The picture and option text
-- -----------------------------------------------------------------------------

alter table pad_prompts add column if not exists image_url text;
alter table pad_prompts add column if not exists option_texts text[];

-- Option text: one entry per option (null for an option left blank), multiple
-- choice only, each up to 200 characters.
create or replace function pad_valid_option_texts(p_texts text[], p_answer_type text, p_count int) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_texts is null or (
    p_answer_type = 'mcq'
    and cardinality(p_texts) = p_count
    and not exists (select 1 from unnest(p_texts) t where t is not null and char_length(t) not between 1 and 200)
  );
$$;

-- Each entry becomes one tidy line; all blank means no option text at all.
create or replace function pad_clean_option_texts(p_texts text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select case
    when count(*) = 0 or bool_and(pad_clean_label(u.t) is null) then null
    else array_agg(pad_clean_label(u.t) order by u.ord)
  end
  from unnest(coalesce(p_texts, '{}'::text[])) with ordinality as u(t, ord);
$$;

-- Only a picture uploaded for this session: the upload route stores it under
-- pad/<session id>/ in the uploads bucket, and nothing else may be shown.
create or replace function pad_valid_image_url(p_url text, p_session uuid) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_url is null or (
    char_length(p_url) <= 1024
    and p_url ~ '^https://[^/\s]+/\S+$'
    and position(('/uploads/pad/' || p_session::text || '/') in p_url) > 0
  );
$$;

alter table pad_prompts drop constraint if exists pad_prompts_image_url_check;
alter table pad_prompts add constraint pad_prompts_image_url_check
  check (image_url is null or (char_length(image_url) <= 1024 and image_url ~ '^https://'));
alter table pad_prompts drop constraint if exists pad_prompts_option_texts_check;
alter table pad_prompts add constraint pad_prompts_option_texts_check
  check (pad_valid_option_texts(option_texts, answer_type, option_count));

comment on column pad_prompts.image_url is
  'A picture of the question (usually a snip of the paper), uploaded to uploads/pad/<session id>/. Optional.';
comment on column pad_prompts.option_texts is
  'Text for each multiple choice option, null where left blank. Optional; letters alone are the default.';


-- -----------------------------------------------------------------------------
-- 2. "I can't answer"
-- -----------------------------------------------------------------------------

create table if not exists pad_skip_reasons (
  prompt_id  uuid not null references pad_prompts(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  reason     text not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (prompt_id, student_id),
  constraint pad_skip_reasons_reason_check check (reason in ('dont_know', 'cant_see', 'need_time', 'tech_problem', 'other')),
  constraint pad_skip_reasons_note_check check (note is null or char_length(note) between 1 and 80)
);

comment on table pad_skip_reasons is
  'Answer Pad: a student''s reason for not answering an open question. Written only by pad_set_skip_reason (guard trigger).';

create or replace function pad_guard_skip_reason() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('pad.transition', true), '') <> 'skip' then
    raise exception 'pad_skip_reasons rows change only through pad_set_skip_reason()';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists pad_skip_reasons_guard on pad_skip_reasons;
create trigger pad_skip_reasons_guard before insert or update or delete on pad_skip_reasons
  for each row execute function pad_guard_skip_reason();


create or replace function pad_set_skip_reason(p_actor uuid, p_prompt uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_note text := pad_clean_label(p_note);
begin
  -- The same shared lock as pad_submit: a reason committed before CLOSE stands.
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

  -- An answer already locked is the student's word; there is nothing to explain.
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
     set reason = excluded.reason, note = excluded.note, updated_at = now();

  perform pad_log(v_s.id, v_p.id, p_actor, 'skip', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true, 'status', 'saved', 'reason', p_reason, 'note', v_note);
end $$;


-- -----------------------------------------------------------------------------
-- 3. The nudge
-- -----------------------------------------------------------------------------

create table if not exists pad_nudges (
  prompt_id  uuid not null references pad_prompts(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  nudged_at  timestamptz not null default now(),
  times      int not null default 1,
  primary key (prompt_id, student_id)
);

comment on table pad_nudges is
  'Answer Pad: students the teacher nudged on a question. Written only by pad_nudge (guard trigger).';

create or replace function pad_guard_nudge() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('pad.transition', true), '') <> 'nudge' then
    raise exception 'pad_nudges rows change only through pad_nudge()';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists pad_nudges_guard on pad_nudges;
create trigger pad_nudges_guard before insert or update or delete on pad_nudges
  for each row execute function pad_guard_nudge();


-- Marks everyone on the class list who has neither answered nor given a reason,
-- and hands back their ids split by whether their pad is open (the banner
-- reaches those) or closed (the route sends those a Teams chat). The ids never
-- leave the server: the console gets counts only.
create or replace function pad_nudge(p_actor uuid, p_prompt uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p      pad_prompts;
  v_s      pad_sessions;
  v_last   timestamptz;
  v_open   uuid[];
  v_closed uuid[];
begin
  -- Locked, so two presses at once cannot both get past the minute's limit.
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

  perform set_config('pad.transition', 'nudge', true);

  with roster as (
    select distinct x as student_id from unnest(coalesce(p_roster, '{}'::uuid[])) x where x is not null
  ),
  targets as (
    select r.student_id
    from roster r
    where pad_is_enrolled_student(r.student_id, v_s.classroom_id)
      and not exists (select 1 from pad_responses pr where pr.prompt_id = v_p.id and pr.student_id = r.student_id)
      and not exists (select 1 from pad_skip_reasons sr where sr.prompt_id = v_p.id and sr.student_id = r.student_id)
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
-- Teacher: asking with a picture, and adding one after the ASK
-- -----------------------------------------------------------------------------

-- The six-argument pad_ask from 20261003090000 goes first, so PostgREST never sees two overloads.
drop function if exists pad_ask(uuid, uuid, text, int, text, text);

create or replace function pad_ask(
  p_actor        uuid,
  p_session      uuid,
  p_answer_type  text   default 'mcq',
  p_option_count int    default 4,
  p_label        text   default null,
  p_text         text   default null,
  p_image_url    text   default null,
  p_option_texts text[] default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s       pad_sessions;
  v_p       pad_prompts;
  v_seq     int;
  v_label   text   := pad_clean_label(p_label);
  v_text    text   := pad_clean_question(p_text);
  v_image   text   := nullif(btrim(coalesce(p_image_url, '')), '');
  v_options text[];
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
  if not pad_valid_image_url(v_image, v_s.id) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'image'));
  end if;

  -- Option text belongs to multiple choice only; for any other type it is dropped.
  v_options := case when p_answer_type = 'mcq' then pad_clean_option_texts(p_option_texts) else null end;
  if not pad_valid_option_texts(v_options, p_answer_type, p_option_count) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'options'));
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
                            'state', v_p.state, 'version', v_p.version, 'sequence', v_seq, 'label', v_label);
end $$;


-- The picture, added, replaced or removed after the ASK, while the class runs.
create or replace function pad_set_picture(p_actor uuid, p_prompt uuid, p_image_url text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     pad_prompts;
  v_s     pad_sessions;
  v_image text := nullif(btrim(coalesce(p_image_url, '')), '');
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'picture', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'picture', 'SESSION_NOT_LIVE');
  end if;
  if not pad_valid_image_url(v_image, v_s.id) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'picture', 'INVALID_INPUT', jsonb_build_object('field', 'image'));
  end if;

  if v_p.image_url is not distinct from v_image then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;

  update pad_prompts set image_url = v_image, version = version + 1 where id = v_p.id returning * into v_p;
  perform pad_log(v_s.id, v_p.id, p_actor, 'picture', jsonb_build_object('has_image', v_image is not null));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- -----------------------------------------------------------------------------
-- Snapshots and reads
-- -----------------------------------------------------------------------------

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

  -- The newest prompt: the active one, or the last reveal until the next ASK.
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
      'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id)
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
    -- Once an answer is locked the reason no longer matters, and neither does a nudge.
    'my_skip', case when v_r.id is null and v_sr.prompt_id is not null
                    then jsonb_build_object('reason', v_sr.reason, 'note', v_sr.note) else null end,
    'nudged_at', case when v_r.id is null and v_sr.prompt_id is null and v_p.state = 'open' then v_n.nudged_at else null end,
    'score', pad_student_score(v_s.id, p_actor)
  );
end $$;


create or replace function pad_teacher_snapshot(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s          pad_sessions;
  v_p          pad_prompts;
  v_roster     uuid[];
  v_basis      text;
  v_bot        boolean;
  v_counts     jsonb;
  v_groups     jsonb;
  v_history    jsonb;
  v_answered   int := 0;
  v_skip_total int := 0;
  v_skip_by    jsonb := '{}'::jsonb;
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

    -- Reasons for not answering, counted: never who, even while open.
    select coalesce(sum(g.n), 0)::int, coalesce(jsonb_object_agg(g.reason, g.n), '{}'::jsonb)
      into v_skip_total, v_skip_by
    from (
      select sr.reason, count(*) as n
      from pad_skip_reasons sr
      where sr.prompt_id = v_p.id
        and sr.student_id = any (v_roster)
        and not exists (select 1 from pad_responses r where r.prompt_id = v_p.id and r.student_id = sr.student_id)
      group by sr.reason
    ) g;

    select max(n.nudged_at) into v_nudged_at from pad_nudges n where n.prompt_id = v_p.id;
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
    'skips', jsonb_build_object('total', v_skip_total, 'by_reason', v_skip_by),
    'history', v_history
  );
end $$;


-- The named rows, after CLOSE, now say why a student who did not answer said so.
create or replace function pad_participation(p_actor uuid, p_prompt uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_teacher uuid;
  v_state   text;
begin
  select s.teacher_id, p.state into v_teacher, v_state
  from pad_prompts p
  join pad_sessions s on s.id = p.session_id
  where p.id = p_prompt;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_teacher is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;
  -- While students are still answering the teacher sees a count only: no names, no answers.
  if v_state = 'open' then
    return jsonb_build_object('ok', false, 'code', 'PROMPT_OPEN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(
               to_jsonb(t)
               || jsonb_build_object('skip_reason', case when t.answer is null then sr.reason end,
                                     'skip_note', case when t.answer is null then sr.note end))
      from pad_participation_rows(p_prompt, p_roster) t
      left join pad_skip_reasons sr on sr.prompt_id = p_prompt and sr.student_id = t.student_id
    ), '[]'::jsonb)
  );
end $$;


-- The class report: each question's picture and, once answering stopped, how
-- many gave each reason for not answering.
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
      'enrolled', cardinality(v_roster)
    ),
    'prompts', v_prompts,
    'students', v_students
  );
end $$;


-- -----------------------------------------------------------------------------
-- Privileges: nothing for anon/authenticated, functions for service_role only
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['pad_skip_reasons', 'pad_nudges'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

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
