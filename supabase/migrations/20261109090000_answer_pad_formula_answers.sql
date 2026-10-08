-- =============================================================================
-- Answer Pad: formula answers are graded by their value
-- =============================================================================
--
-- A numerical question's answer is often a formula: 2√3, 3/4, π/2. Students
-- type it on a phone with the maths keys, the way the question bank's own
-- practice already reads it, and the pad grades it by value.
--
-- The SQL never reads a formula. The server reads it (parseMathAnswer in
-- @neram/database, the one reader the question bank grades with) and passes its
-- value as a plain decimal with 12 significant digits, so every route to a
-- value lands on the same text:
--
--   * pad_submit takes p_value: when the typed answer is not a plain number,
--     the value is what is stored and grouped (norm_answer), and raw_answer
--     keeps what the student typed, so their pad shows "2√3" back;
--   * pad_set_key takes p_key_values the same way, so a teacher can type 2√3
--     as the answer;
--   * a key sent from the question bank (pad_ask's p_suggested_keys) already
--     arrives as its value.
--
-- Grading (pad_answer_correct): an answer equal to a key is right, as before.
-- A key with seven or more decimal places is a formula's value (no one types
-- 3.4641016) and, as in the question bank, also accepts an answer within 0.005
-- of it, so 2√3 takes 3.46 and 3.464 but not 3.47. Both pad_reveal and
-- pad_set_key (a key corrected after Reveal) grade through it.
--
-- Every statement can run twice, as a re-applied deploy would.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Is this answer right
-- -----------------------------------------------------------------------------

create or replace function pad_answer_correct(p_type text, p_answer text, p_keys text[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_answer is null or p_keys is null then false
    when p_answer = any (p_keys) then true
    when p_type is distinct from 'numeric' then false
    else exists (
      select 1
      from unnest(p_keys) k
      where k ~ '\.[0-9]{7,}$'
        and abs(p_answer::numeric - k::numeric) <= 0.005
    )
  end
$$;

comment on function pad_answer_correct(text, text, text[]) is
  'True when a normalised answer matches a key. A numeric key with 7+ decimal places is a formula''s value and also accepts answers within 0.005.';


-- -----------------------------------------------------------------------------
-- Students: a formula answer is stored as its value
-- -----------------------------------------------------------------------------

drop function if exists pad_submit(uuid, uuid, text);

-- As before (20261028090000), plus p_value: the typed answer's value as a plain
-- decimal, worked out by the server. Used only for a numeric question, and only
-- when the answer as typed is not already a plain number.
create or replace function pad_submit(p_actor uuid, p_prompt uuid, p_raw text, p_value text default null) returns jsonb
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
  if v_norm is null and v_p.answer_type = 'numeric' and p_value is not null then
    v_norm := pad_normalize('numeric', p_value);
  end if;
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
-- Teacher: REVEAL grades by value
-- -----------------------------------------------------------------------------

-- As before (20261028090000), grading through pad_answer_correct.
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
       set is_correct = pad_answer_correct(v_p.answer_type, r.norm_answer, v_p.correct_keys)
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
-- Teacher: a key may be a formula
-- -----------------------------------------------------------------------------

drop function if exists pad_set_key(uuid, uuid, text[], boolean);

-- As before (20261024090000), plus p_key_values: each key's value as a plain
-- decimal, worked out by the server, in the same order as p_keys (null where a
-- key is not a formula). Used only for a numeric question, and only for a key
-- that is not already a plain number.
create or replace function pad_set_key(
  p_actor      uuid,
  p_prompt     uuid,
  p_keys       text[],
  p_ungraded   boolean default false,
  p_key_values text[]  default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_keys text[];
  v_bad  boolean;
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
    if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 50 then
      return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'INVALID_KEY');
    end if;

    with given as (
      select coalesce(pad_normalize(v_p.answer_type, u.k),
                      case when v_p.answer_type = 'numeric' then pad_normalize('numeric', u.v) end) as norm
      from unnest(p_keys, coalesce(p_key_values, '{}'::text[])) as u(k, v)
      where u.k is not null
    )
    select bool_or(norm is null or (v_p.answer_type = 'mcq' and ascii(norm) - 64 > v_p.option_count)),
           array_agg(distinct norm order by norm) filter (where norm is not null)
      into v_bad, v_keys
    from given;

    if v_bad is distinct from false or v_keys is null then
      return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'INVALID_KEY');
    end if;

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
       set is_correct = case when v_p.ungraded then null
                             else pad_answer_correct(v_p.answer_type, r.norm_answer, v_p.correct_keys) end
     where r.prompt_id = v_p.id;
  end if;

  perform pad_log(v_s.id, v_p.id, p_actor, 'set_key',
                  jsonb_build_object('keys', to_jsonb(v_keys), 'ungraded', v_p.ungraded,
                                     'after_reveal', v_p.state = 'revealed'));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
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
