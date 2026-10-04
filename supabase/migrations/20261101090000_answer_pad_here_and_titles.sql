-- =============================================================================
-- Answer Pad v4: who is here, the class title, stale sessions, empty rounds
-- =============================================================================
--
-- 1. "Here" (pad_joined_ids) is now everyone on the class list who was in the
--    Teams meeting during the round (the bot's participant events) or opened the
--    pad. Founder decision 2026-10-04: a student in the meeting who never answers
--    counts as not attempted and ranks last, the same as one who opened the pad
--    and stayed quiet. Without the bot it is exactly the old rule.
-- 2. A session has a title: the teacher's own name for it, else the class on the
--    timetable, else the Teams meeting's title, else the classroom.
-- 3. A live session left over from another meeting (more than 3 hours old, or
--    from an earlier day in India) is ended when the teacher starts a class,
--    instead of standing in the way with a conflict screen.
-- 4. Rounds with no questions are left out of the class's rounds.
-- 5. pad_touch_app_presence says when a student opened the pad for the first
--    time in a round, so the join route can tell the teacher's console at once.
-- =============================================================================


alter table pad_sessions add column if not exists title text;
alter table pad_sessions add column if not exists meeting_title text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pad_sessions_title_check') then
    alter table pad_sessions add constraint pad_sessions_title_check
      check ((title is null or char_length(title) between 1 and 120)
             and (meeting_title is null or char_length(meeting_title) between 1 and 200));
  end if;
end $$;

comment on column pad_sessions.title is 'Answer Pad: the name the teacher gave the class in the console. Wins over every other title.';
comment on column pad_sessions.meeting_title is 'Answer Pad: the Teams meeting''s subject, from TeamsJS getMeetingDetails, when the meeting is not on the timetable.';


-- -----------------------------------------------------------------------------
-- Who is here
-- -----------------------------------------------------------------------------

-- Class-list students who opened the pad in this round, or were in the round's
-- Teams meeting while the round ran. Staff never. Presence rows are never
-- deleted, so this only grows.
create or replace function pad_joined_ids(p_session uuid, p_roster uuid[]) returns uuid[]
language sql stable set search_path = public, pg_temp as $$
  with s as (
    select id, meeting_id, created_at, coalesce(ended_at, now()) as until from pad_sessions where id = p_session
  ),
  here as (
    select ap.student_id
    from pad_app_presence ap
    where ap.session_id = p_session
    union
    select mp.student_id
    from s
    join pad_meeting_presence mp on mp.meeting_id = s.meeting_id
    where s.meeting_id is not null
      and mp.joined_at <= s.until
      and coalesce(mp.left_at, 'infinity'::timestamptz) >= s.created_at
  )
  select coalesce(array_agg(distinct h.student_id), '{}'::uuid[])
  from here h
  where h.student_id = any (coalesce(p_roster, '{}'::uuid[]))
    and not pad_is_staff(h.student_id);
$$;

-- Which of the two told us a student is here: 'pad', 'meeting' or 'both'.
create or replace function pad_here_source(p_session uuid, p_student uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  with s as (
    select id, meeting_id, created_at, coalesce(ended_at, now()) as until from pad_sessions where id = p_session
  )
  select case
    when pad and meeting then 'both'
    when meeting then 'meeting'
    else 'pad'
  end
  from (
    select
      exists (select 1 from pad_app_presence ap where ap.session_id = p_session and ap.student_id = p_student) as pad,
      exists (
        select 1 from s
        join pad_meeting_presence mp on mp.meeting_id = s.meeting_id
        where s.meeting_id is not null and mp.student_id = p_student
          and mp.joined_at <= s.until
          and coalesce(mp.left_at, 'infinity'::timestamptz) >= s.created_at
      ) as meeting
  ) x;
$$;


-- -----------------------------------------------------------------------------
-- The class title
-- -----------------------------------------------------------------------------

create or replace function pad_session_title(p_session uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    nullif(btrim(s.title), ''),
    nullif(btrim(sc.title), ''),
    nullif(btrim(s.meeting_title), ''),
    c.name
  )
  from pad_sessions s
  left join nexus_scheduled_classes sc on sc.id = s.scheduled_class_id
  left join nexus_classrooms c on c.id = s.classroom_id
  where s.id = p_session;
$$;

-- The teacher renames the class in the console. An empty title goes back to the
-- timetable or meeting title.
create or replace function pad_rename_session(p_actor uuid, p_session uuid, p_title text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  select * into v_s from pad_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;
  if v_title is not null and char_length(v_title) > 120 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'title');
  end if;

  update pad_sessions set title = v_title where id = p_session;
  perform pad_log(p_session, null, p_actor, 'session_rename', jsonb_build_object('title', v_title));
  return jsonb_build_object('ok', true, 'title', pad_session_title(p_session));
end $$;


-- -----------------------------------------------------------------------------
-- First touch
-- -----------------------------------------------------------------------------

-- pad_touch_app_presence, returning true when this is the student's first
-- presence in the round, so the caller can hint the teacher's console. A new
-- name rather than a new return type, so the older migrations still re-run.
create or replace function pad_touch_app_presence_first(p_session uuid, p_student uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id    bigint;
  v_first boolean;
begin
  select id into v_id
  from pad_app_presence
  where session_id = p_session
    and student_id = p_student
    and last_seen_at >= now() - interval '90 seconds'
  order by last_seen_at desc
  limit 1
  for update;

  if found then
    update pad_app_presence set last_seen_at = greatest(now(), joined_at) where id = v_id;
    return false;
  end if;

  v_first := not exists (select 1 from pad_app_presence where session_id = p_session and student_id = p_student);
  insert into pad_app_presence (session_id, student_id) values (p_session, p_student);
  return v_first;
end $$;


-- As before, plus first_touch.
create or replace function pad_join_by_code(p_actor uuid, p_code text, p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s          pad_sessions;
  v_user_fails int;
  v_ip_fails   int := 0;
  v_code       text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_first      boolean;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;

  select count(*) into v_user_fails
  from pad_join_attempts
  where user_id = p_actor and not succeeded and at > now() - interval '10 minutes';

  if p_ip_hash is not null then
    select count(*) into v_ip_fails
    from pad_join_attempts
    where ip_hash = p_ip_hash and not succeeded and at > now() - interval '10 minutes';
  end if;

  if v_user_fails >= 8 or v_ip_fails >= 40 then
    insert into pad_join_attempts (user_id, ip_hash, succeeded) values (p_actor, p_ip_hash, false);
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  select * into v_s from pad_sessions where room_code = v_code and status = 'live';
  if not found then
    insert into pad_join_attempts (user_id, ip_hash, succeeded) values (p_actor, p_ip_hash, false);
    return jsonb_build_object('ok', false, 'code', 'ROOM_CODE_INVALID');
  end if;

  -- The code only says which session. Identity plus enrollment decides access.
  if not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    insert into pad_join_attempts (user_id, ip_hash, succeeded) values (p_actor, p_ip_hash, false);
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;

  insert into pad_join_attempts (user_id, ip_hash, succeeded) values (p_actor, p_ip_hash, true);
  v_first := pad_touch_app_presence_first(v_s.id, p_actor);
  return jsonb_build_object('ok', true, 'session_id', v_s.id, 'first_touch', v_first);
end $$;


create or replace function pad_join_by_meeting(p_actor uuid, p_meeting_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s     pad_sessions;
  v_first boolean;
begin
  if p_meeting_id is null or p_meeting_id = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'meeting_id');
  end if;

  select * into v_s
  from pad_sessions
  where meeting_id = p_meeting_id and status = 'live'
  order by created_at desc
  limit 1;

  if not found then
    -- The teacher has not started the pad yet. The student waits and asks again.
    return jsonb_build_object('ok', true, 'session_id', null);
  end if;
  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;

  v_first := pad_touch_app_presence_first(v_s.id, p_actor);
  return jsonb_build_object('ok', true, 'session_id', v_s.id, 'first_touch', v_first);
end $$;


-- -----------------------------------------------------------------------------
-- Sessions: stale sessions end on their own, and the meeting's title
-- -----------------------------------------------------------------------------

-- As before, plus:
--   * p_meeting_title, kept for a meeting that is not on the timetable;
--   * a live session from another meeting, or this one but too old to resume,
--     that began more than 3 hours ago or on an earlier day in India, is ended
--     ('stale') and the new one starts, with no conflict screen. Its id comes
--     back as ended_session_id, so the caller stores its results.
drop function if exists pad_start_or_resume_session(uuid, uuid, uuid, uuid, text, text, boolean);
create or replace function pad_start_or_resume_session(
  p_actor           uuid,
  p_classroom       uuid,
  p_scheduled_class uuid default null,
  p_batch           uuid default null,
  p_meeting_id      text default null,
  p_meeting_thread  text default null,
  p_end_existing    boolean default false,
  p_meeting_title   text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_live    pad_sessions;
  v_new     pad_sessions;
  v_ended   uuid;
  v_reason  text;
  v_code    text;
  v_created boolean := false;
  v_title   text := left(nullif(btrim(regexp_replace(coalesce(p_meeting_title, ''), '\s+', ' ', 'g')), ''), 200);
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
             meeting_thread_id = coalesce(meeting_thread_id, p_meeting_thread),
             meeting_title = coalesce(v_title, meeting_title)
       where id = v_live.id;
      perform pad_log(v_live.id, null, p_actor, 'session_resume', null);
      return jsonb_build_object('ok', true, 'session_id', v_live.id, 'resumed', true);
    end if;

    -- The presenter started this class's pad in a browser, and the teacher now
    -- opens the pad in the class meeting: the meeting takes the session over.
    if v_live.classroom_id = p_classroom
       and v_live.meeting_id is null
       and p_meeting_id is not null
       and v_live.created_at > now() - interval '6 hours' then
      update pad_sessions
         set meeting_id = p_meeting_id,
             meeting_thread_id = coalesce(meeting_thread_id, p_meeting_thread),
             meeting_title = coalesce(v_title, meeting_title),
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

    -- Left over from an earlier class: end it and carry on.
    if v_live.created_at <= now() - interval '3 hours'
       or (v_live.created_at at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date then
      v_reason := 'stale';
    elsif coalesce(p_end_existing, false) then
      v_reason := 'replaced';
    else
      -- Never silently reuse a session for another class, never silently replace a recent one.
      return jsonb_build_object(
        'ok', false,
        'code', 'SESSION_CONFLICT',
        'existing', jsonb_build_object(
          'session_id', v_live.id,
          'classroom_id', v_live.classroom_id,
          'classroom_name', pad_session_title(v_live.id),
          'created_at', v_live.created_at
        )
      );
    end if;

    perform pad_end_session_internal(v_live.id, p_actor, v_reason);
    v_ended := v_live.id;
  end if;

  for i in 1..30 loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into pad_sessions (
        classroom_id, scheduled_class_id, batch_id, teacher_id, meeting_id, meeting_thread_id, meeting_title,
        room_code, hint_topic, teacher_topic
      ) values (
        p_classroom, p_scheduled_class, p_batch, p_actor, p_meeting_id, p_meeting_thread, v_title,
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

  perform pad_log(v_new.id, null, p_actor, 'session_start',
                  jsonb_build_object('replaced_session_id', v_ended, 'ended_reason', v_reason));
  return jsonb_build_object('ok', true, 'session_id', v_new.id, 'resumed', false,
                            'ended_session_id', v_ended, 'ended_reason', v_reason);
end $$;


-- -----------------------------------------------------------------------------
-- Teacher snapshot: title, who opened the pad, where each student was seen
-- -----------------------------------------------------------------------------

-- The v3 snapshot stays as it is (it already reads pad_joined_ids, so its
-- counts are "here" now) under another name; this adds to it.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'pad_teacher_snapshot_base') then
    alter function pad_teacher_snapshot(uuid, uuid, uuid[]) rename to pad_teacher_snapshot_base;
  end if;
end $$;

create or replace function pad_teacher_snapshot(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out    jsonb;
  v_roster uuid[];
  v_people jsonb;
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

  return jsonb_set(
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
  );
end $$;


-- -----------------------------------------------------------------------------
-- Rounds with no questions are not rounds
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'pad_class_rounds_base') then
    alter function pad_class_rounds(uuid, uuid, uuid[], text) rename to pad_class_rounds_base;
  end if;
end $$;

-- As before, without ended rounds in which nothing was asked (an End round
-- pressed by mistake). A live round always shows.
create or replace function pad_class_rounds(p_actor uuid, p_class uuid, p_roster uuid[], p_as text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb;
begin
  v_out := pad_class_rounds_base(p_actor, p_class, p_roster, p_as);
  if not coalesce((v_out ->> 'ok')::boolean, false) then
    return v_out;
  end if;
  return jsonb_set(v_out, '{rounds}', coalesce((
    select jsonb_agg(r order by ord)
    from jsonb_array_elements(v_out -> 'rounds') with ordinality as t(r, ord)
    where exists (select 1 from pad_prompts p where p.session_id = (r ->> 'session_id')::uuid)
       or exists (select 1 from pad_sessions s where s.id = (r ->> 'session_id')::uuid and s.status = 'live')
  ), '[]'::jsonb));
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
