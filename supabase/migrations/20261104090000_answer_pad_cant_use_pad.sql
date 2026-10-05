-- =============================================================================
-- Answer Pad: a teacher marks a student who cannot use the pad
-- =============================================================================
--
-- A student in the meeting whose pad will not open has no way to say so, and
-- reads as "not answered" on every question, last in the rank. The teacher can
-- ask them aloud and mark them "Can't use the pad" for the rest of the class:
--
--   * pad_session_excusals holds the mark, one row per student per round;
--   * every question that is open or closed but not yet revealed gets an
--     approved skip reason 'pad_problem' for them, and so does every question
--     asked after the mark (a trigger on pad_prompts). The existing "excused"
--     rules then apply everywhere unchanged: out of the "of N", not attempted
--     never, rank never lowered;
--   * an answer the student does manage to send still counts: answered wins
--     over excused, as it always has;
--   * Undo removes the mark and the 'pad_problem' rows on unrevealed questions.
--     Revealed questions keep what they showed.
--
-- 'pad_problem' is the teacher's reason, never one a student picks.
-- =============================================================================

alter table pad_skip_reasons drop constraint if exists pad_skip_reasons_reason_check;
alter table pad_skip_reasons add constraint pad_skip_reasons_reason_check
  check (reason in ('dont_know', 'cant_see', 'need_time', 'tech_problem', 'other', 'pad_problem'));

create table if not exists pad_session_excusals (
  session_id uuid not null references pad_sessions(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  reason     text not null default 'pad_problem',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, student_id),
  constraint pad_session_excusals_reason_check check (reason in ('pad_problem'))
);
comment on table pad_session_excusals is
  'Students the teacher marked as unable to use the Answer Pad for the rest of a round. Each question then excuses them.';

alter table pad_session_excusals enable row level security;
revoke all on table pad_session_excusals from public, anon, authenticated;
grant all on table pad_session_excusals to service_role;


-- -----------------------------------------------------------------------------
-- Excuse marked students on one question
-- -----------------------------------------------------------------------------

-- Approved 'pad_problem' rows on p_prompt for p_students. A reason the student
-- gave themselves is kept and approved. Restores pad.transition afterwards, so
-- a caller in the middle of its own transition (pad_ask) carries on as it was.
create or replace function pad_excuse_pad_problem(p_prompt uuid, p_students uuid[], p_actor uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev text := coalesce(current_setting('pad.transition', true), '');
  v_n    int;
begin
  if p_students is null or cardinality(p_students) = 0 then
    return 0;
  end if;
  perform set_config('pad.transition', 'excuse', true);
  insert into pad_skip_reasons (prompt_id, student_id, reason, approval, decided_by, decided_at)
  select p_prompt, s, 'pad_problem', 'approved', p_actor, now()
  from unnest(p_students) s
  on conflict (prompt_id, student_id) do update
     set approval = 'approved', decided_by = excluded.decided_by, decided_at = excluded.decided_at
   where pad_skip_reasons.approval is distinct from 'approved';
  get diagnostics v_n = row_count;
  perform set_config('pad.transition', v_prev, true);
  return v_n;
end $$;


-- Each new question excuses the students already marked in its round.
create or replace function pad_apply_session_excusals() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_students uuid[];
  v_teacher  uuid;
begin
  select array_agg(e.student_id) into v_students
  from pad_session_excusals e
  where e.session_id = new.session_id;
  if v_students is null then
    return new;
  end if;
  select teacher_id into v_teacher from pad_sessions where id = new.session_id;
  perform pad_excuse_pad_problem(new.id, v_students, v_teacher);
  return new;
end $$;

drop trigger if exists pad_prompts_apply_excusals on pad_prompts;
create trigger pad_prompts_apply_excusals
  after insert on pad_prompts
  for each row execute function pad_apply_session_excusals();


-- -----------------------------------------------------------------------------
-- Teacher: mark or unmark
-- -----------------------------------------------------------------------------

create or replace function pad_mark_cant_use_pad(p_actor uuid, p_session uuid, p_student uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s    pad_sessions;
  v_prev text;
  v_n    int := 0;
  v_p    record;
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, null, p_actor, 'cant_use_pad', 'NOT_SESSION_TEACHER');
  end if;
  if p_student is null or p_on is null or pad_is_staff(p_student) then
    return pad_reject(v_s.id, null, p_actor, 'cant_use_pad', 'INVALID_INPUT', jsonb_build_object('field', 'student'));
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, null, p_actor, 'cant_use_pad', 'SESSION_NOT_LIVE');
  end if;

  if p_on then
    insert into pad_session_excusals (session_id, student_id, created_by)
    values (v_s.id, p_student, p_actor)
    on conflict (session_id, student_id) do nothing;
    for v_p in select id from pad_prompts where session_id = v_s.id and state <> 'revealed' loop
      v_n := v_n + pad_excuse_pad_problem(v_p.id, array[p_student], p_actor);
    end loop;
  else
    delete from pad_session_excusals where session_id = v_s.id and student_id = p_student;
    v_prev := coalesce(current_setting('pad.transition', true), '');
    perform set_config('pad.transition', 'excuse', true);
    delete from pad_skip_reasons sr
     using pad_prompts p
     where sr.prompt_id = p.id
       and p.session_id = v_s.id
       and p.state <> 'revealed'
       and sr.student_id = p_student
       and sr.reason = 'pad_problem';
    get diagnostics v_n = row_count;
    perform set_config('pad.transition', v_prev, true);
  end if;

  perform pad_log(v_s.id, null, p_actor, 'cant_use_pad', jsonb_build_object('student', p_student, 'on', p_on, 'questions', v_n));
  return jsonb_build_object('ok', true, 'on', p_on, 'questions', v_n);
end $$;


-- -----------------------------------------------------------------------------
-- The teacher snapshot: who is marked
-- -----------------------------------------------------------------------------

-- As in 20261101090000 (title, opened, where each student is here from), plus
-- people.cant_use_pad: the students marked in this round.
create or replace function pad_teacher_snapshot(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out    jsonb;
  v_roster uuid[];
  v_people jsonb;
  v_marked jsonb;
begin
  v_out := pad_teacher_snapshot_base(p_actor, p_session, p_roster);
  if not coalesce((v_out ->> 'ok')::boolean, false) then
    return v_out;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_roster
  from unnest(coalesce(p_roster, '{}'::uuid[])) x
  where x is not null and not pad_is_staff(x);

  select coalesce(jsonb_agg(p || jsonb_build_object('source', pad_here_source(p_session, (p ->> 'student_id')::uuid))
                            order by ord), '[]'::jsonb)
    into v_people
  from jsonb_array_elements(coalesce(v_out #> '{people,joined}', '[]'::jsonb)) with ordinality as t(p, ord);

  select coalesce(jsonb_agg(jsonb_build_object('student_id', e.student_id, 'name', u.name) order by u.name, e.student_id), '[]'::jsonb)
    into v_marked
  from pad_session_excusals e
  join users u on u.id = e.student_id
  where e.session_id = p_session;

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_out, '{session,title}', to_jsonb(pad_session_title(p_session))),
        '{readiness,opened}',
        to_jsonb((
          select count(distinct ap.student_id)
          from pad_app_presence ap
          where ap.session_id = p_session and ap.student_id = any (v_roster)
        ))
      ),
      '{people,joined}', v_people
    ),
    '{people,cant_use_pad}', v_marked
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
