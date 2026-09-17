-- =============================================================================
-- Nexus Answer Pad: private live answers during Teams classes
-- =============================================================================
-- Spec: Downloads/Teams_Quiz/TEAMS_LIVE_QUIZ_PLAN.v3-sidepanel.md, with the
-- scoring rules from v3.1 section 11. The question never enters the app: a
-- prompt is an anonymous slot, answered on the pad while the question is spoken
-- or shown on the shared screen.
--
-- Security model. Nexus has no Supabase Auth, so this differs from the spec:
--   * Browsers never read or write these tables. Every call goes through the
--     /api/pad/* routes, which verify the caller's Microsoft or Teams token and
--     pass the resolved users.id to these functions as p_actor.
--   * RLS is on with no policies, and anon/authenticated hold no privileges on
--     any pad_* table or function, so the anon key shipped to browsers reaches
--     nothing here through PostgREST, tables or RPC.
--   * Functions are SECURITY DEFINER with a fixed search_path, executable by
--     service_role only, and check session ownership or enrollment themselves.
--   * Guard triggers refuse any prompt insert, state, key or grade change, and
--     any response insert or update, that does not come from the matching
--     function, even for a caller holding the service key.
--
-- Business-rule refusals return {"ok": false, "code": "..."} rather than
-- raising, so the refusal can be written to pad_events in the same
-- transaction. apps/nexus/src/lib/pad/rpc.ts maps each code to an HTTP status.
--
-- Presence has three sources, never merged and never stored as a verdict:
--   pad_app_presence      the student's pad is open (heartbeat, session scoped)
--   pad_meeting_presence  Teams bot participant join/leave (meeting scoped)
--   nexus_attendance      the post-meeting Teams attendance report, already
--                         synced by lib/attendance-sync.ts (read, not copied)
-- Participation is derived at read time, so a later attendance sync corrects a
-- session's history on its own.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists pad_sessions (
  id                 uuid primary key default gen_random_uuid(),
  classroom_id       uuid not null references nexus_classrooms(id) on delete cascade,
  scheduled_class_id uuid references nexus_scheduled_classes(id) on delete set null,
  batch_id           uuid references nexus_batches(id) on delete set null,
  teacher_id         uuid not null references users(id) on delete cascade,
  meeting_id         text,          -- TeamsJS meeting.id; null for a browser session
  meeting_thread_id  text,          -- 19:...@thread.* when known
  room_code          text not null, -- 6 digits; binds a signed-in student to the session, authenticates nothing
  hint_topic         text not null, -- random Realtime topic, handed only to enrolled students
  teacher_topic      text not null, -- random Realtime topic, handed only to the session teacher
  status             text not null default 'live',
  created_at         timestamptz not null default now(),
  ended_at           timestamptz,
  constraint pad_sessions_status_check check (status in ('live', 'ended')),
  constraint pad_sessions_room_code_check check (room_code ~ '^[0-9]{6}$'),
  constraint pad_sessions_ended_at_check check ((status = 'ended') = (ended_at is not null))
);

-- Session recovery: at most one live session per teacher, so reopening the
-- console resumes it instead of silently creating another.
create unique index if not exists pad_sessions_one_live_per_teacher
  on pad_sessions (teacher_id) where status = 'live';
-- A code only has to be unique while its session is live.
create unique index if not exists pad_sessions_live_room_code
  on pad_sessions (room_code) where status = 'live';
create index if not exists pad_sessions_meeting
  on pad_sessions (meeting_id, created_at desc) where meeting_id is not null;
create index if not exists pad_sessions_classroom
  on pad_sessions (classroom_id, created_at desc);
-- Meeting series memory: the newest session on a chat thread names its classroom.
create index if not exists pad_sessions_thread
  on pad_sessions (meeting_thread_id, created_at desc) where meeting_thread_id is not null;

comment on table pad_sessions is
  'Answer Pad: one live class session. Written only by pad_* functions; see migration 20260911090100.';


create table if not exists pad_prompts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references pad_sessions(id) on delete cascade,
  sequence     int not null,                   -- Q1, Q2... assigned by pad_ask()
  answer_type  text not null default 'mcq',    -- mcq|numeric|text|yesno
  option_count int,                            -- mcq only, 2..6
  state        text not null default 'open',   -- open|closed|revealed
  correct_keys text[],                         -- null until the teacher sets it; sorted, normalised
  ungraded     boolean not null default false, -- Poll / Don't grade
  label        text,                           -- optional note added after Reveal
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  revealed_at  timestamptz,
  version      int not null default 1,         -- +1 on every change a client renders
  constraint pad_prompts_answer_type_check check (answer_type in ('mcq', 'numeric', 'text', 'yesno')),
  constraint pad_prompts_option_count_check check (
    (answer_type = 'mcq' and option_count between 2 and 6)
    or (answer_type <> 'mcq' and option_count is null)
  ),
  constraint pad_prompts_state_check check (state in ('open', 'closed', 'revealed')),
  -- The correct answer does not exist while a prompt is OPEN, including after a Reopen.
  constraint pad_prompts_no_key_while_open check (state <> 'open' or (correct_keys is null and not ungraded)),
  -- Reveal needs a grading decision: a key, or Poll / Don't grade.
  constraint pad_prompts_reveal_needs_decision check (state <> 'revealed' or ungraded or correct_keys is not null),
  constraint pad_prompts_key_xor_ungraded check (not (ungraded and correct_keys is not null)),
  constraint pad_prompts_keys_nonempty check (correct_keys is null or cardinality(correct_keys) between 1 and 50),
  constraint pad_prompts_label_check check (label is null or char_length(label) between 1 and 80),
  constraint pad_prompts_closed_at_check check (state = 'open' or closed_at is not null),
  constraint pad_prompts_revealed_at_check check ((state = 'revealed') = (revealed_at is not null)),
  constraint pad_prompts_session_sequence_key unique (session_id, sequence)
);

-- One active (open or closed) prompt per session: a double-tapped ASK can never
-- create two prompts.
create unique index if not exists pad_prompts_one_active
  on pad_prompts (session_id) where state in ('open', 'closed');

comment on table pad_prompts is
  'Answer Pad: one ASK press. No question text is stored. State and keys change only through pad_* transition functions (guard trigger).';


create table if not exists pad_responses (
  id           uuid primary key default gen_random_uuid(),
  prompt_id    uuid not null references pad_prompts(id) on delete cascade,
  student_id   uuid not null references users(id) on delete cascade,
  raw_answer   text not null,
  norm_answer  text not null,  -- pad_normalize(answer_type, raw_answer); what grading and grouping compare
  is_correct   boolean,        -- written only by pad_reveal()
  responded_at timestamptz not null default now(),
  constraint pad_responses_raw_answer_check check (char_length(raw_answer) between 1 and 200),
  -- One answer per student per prompt; the first answer wins.
  constraint pad_responses_prompt_student_key unique (prompt_id, student_id)
);

comment on table pad_responses is
  'Answer Pad: one immutable answer per student per prompt. Inserted only by pad_submit(); is_correct written only by pad_reveal().';


create table if not exists pad_app_presence (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references pad_sessions(id) on delete cascade,
  student_id   uuid not null references users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint pad_app_presence_seen_check check (last_seen_at >= joined_at)
);
create index if not exists pad_app_presence_lookup
  on pad_app_presence (session_id, student_id, last_seen_at desc);

comment on table pad_app_presence is
  'Answer Pad: intervals during which a student had the pad open. Interval end = last_seen_at + 90 s. Several rows per student are normal.';


create table if not exists pad_meeting_presence (
  id         bigint generated always as identity primary key,
  meeting_id text not null,
  student_id uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null,
  left_at    timestamptz,
  constraint pad_meeting_presence_left_check check (left_at is null or left_at >= joined_at)
);
create index if not exists pad_meeting_presence_lookup
  on pad_meeting_presence (meeting_id, student_id, joined_at desc);

comment on table pad_meeting_presence is
  'Answer Pad: Teams participant join/leave intervals from the bot. An interval with no leave counts for at most 12 hours.';


create table if not exists pad_events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references pad_sessions(id) on delete cascade,
  prompt_id  uuid references pad_prompts(id) on delete cascade,
  actor_id   uuid references users(id) on delete set null,
  action     text not null,
  detail     jsonb,
  at         timestamptz not null default now()
);
create index if not exists pad_events_session on pad_events (session_id, at);

comment on table pad_events is
  'Answer Pad: append-only log written inside pad_* functions. Measures the four-interaction KPI and explains pilot failures.';


create table if not exists pad_join_attempts (
  id        bigint generated always as identity primary key,
  user_id   uuid references users(id) on delete cascade,
  ip_hash   text,
  succeeded boolean not null,
  at        timestamptz not null default now()
);
create index if not exists pad_join_attempts_user on pad_join_attempts (user_id, at desc);
create index if not exists pad_join_attempts_ip on pad_join_attempts (ip_hash, at desc);

comment on table pad_join_attempts is
  'Answer Pad: room-code entry attempts. Database backed because an in-process limiter does nothing on Vercel.';


create table if not exists pad_bot_conversations (
  conversation_id text primary key,
  service_url     text not null,
  tenant_id       text,
  meeting_id      text,
  team_id         text,
  channel_id      text,
  installed_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pad_bot_conversations_meeting on pad_bot_conversations (meeting_id);

comment on table pad_bot_conversations is
  'Answer Pad: Teams conversations the bot is installed in, so it can post in-meeting notifications.';


create table if not exists pad_teams_users (
  user_id       uuid primary key references users(id) on delete cascade,
  teams_user_id text not null, -- the 29: id targeted in-meeting notifications address
  updated_at    timestamptz not null default now()
);

comment on table pad_teams_users is
  'Answer Pad: Teams 29: user ids learned from bot activities, for targeted in-meeting notifications.';


-- -----------------------------------------------------------------------------
-- Guard triggers
-- -----------------------------------------------------------------------------
-- The transition functions set a transaction-local flag after their checks.
-- Anything else touching these rows (a route bug, a script holding the service
-- key) is refused by the database itself.

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
      or new.revealed_at is distinct from old.revealed_at)
     and v_flag not in ('close', 'reopen', 'set_key', 'reveal', 'end') then
    raise exception 'prompt state and grading change only through the teacher transition functions';
  end if;
  return new;
end $$;

drop trigger if exists pad_prompts_guard on pad_prompts;
create trigger pad_prompts_guard before insert or update on pad_prompts
  for each row execute function pad_guard_prompt();


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

  if v_flag <> 'reveal'
     or new.prompt_id is distinct from old.prompt_id
     or new.student_id is distinct from old.student_id
     or new.raw_answer is distinct from old.raw_answer
     or new.norm_answer is distinct from old.norm_answer
     or new.responded_at is distinct from old.responded_at then
    raise exception 'responses are immutable; is_correct is written only by pad_reveal()';
  end if;
  return new;
end $$;

drop trigger if exists pad_responses_guard on pad_responses;
create trigger pad_responses_guard before insert or update on pad_responses
  for each row execute function pad_guard_response();


-- -----------------------------------------------------------------------------
-- Helpers (not callable by any client role; see grants at the end)
-- -----------------------------------------------------------------------------

create or replace function pad_try_timestamptz(p_value text) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
begin
  -- ISO 8601 only. A bare cast also accepts words such as 'now' or 'tomorrow'.
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end $$;


-- The single definition of answer normalisation. Grading compares its output,
-- grouping groups by it, and answer keys must already be in this form.
-- Returns null for an answer that is not valid for the type.
create or replace function pad_normalize(p_type text, p_raw text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v     text;
  v_neg boolean := false;
  v_int text;
  v_frac text;
begin
  if p_raw is null then
    return null;
  end if;
  v := btrim(regexp_replace(p_raw, '\s+', ' ', 'g'));
  if v = '' then
    return null;
  end if;

  if p_type = 'mcq' then
    v := upper(v);
    return case when v ~ '^[A-F]$' then v else null end;

  elsif p_type = 'yesno' then
    v := lower(v);
    return case
      when v in ('y', 'yes') then 'yes'
      when v in ('n', 'no') then 'no'
      else null
    end;

  elsif p_type = 'numeric' then
    v := replace(replace(v, ',', ''), ' ', '');
    if char_length(v) > 30 or v !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then
      return null;
    end if;
    if left(v, 1) in ('+', '-') then
      v_neg := left(v, 1) = '-';
      v := substr(v, 2);
    end if;
    if position('.' in v) > 0 then
      v_int := split_part(v, '.', 1);
      v_frac := rtrim(split_part(v, '.', 2), '0');
    else
      v_int := v;
      v_frac := '';
    end if;
    v_int := ltrim(v_int, '0');
    if v_int = '' then
      v_int := '0';
    end if;
    v := v_int || case when v_frac <> '' then '.' || v_frac else '' end;
    if v = '0' then
      v_neg := false;
    end if;
    return case when v_neg then '-' || v else v end;

  elsif p_type = 'text' then
    v := btrim(regexp_replace(lower(v), '[.!?]+$', ''));
    return case when v = '' or char_length(v) > 100 then null else v end;
  end if;

  return null;
end $$;


create or replace function pad_is_staff(p_user uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  -- A floor, not the authority: the API resolves the tier with resolveStaffRole
  -- and assertSessionAccess before calling in. This only stops a student id
  -- from ever owning a session, whatever the route does.
  select exists (
    select 1 from users u
    where u.id = p_user
      and (u.staff_role in ('admin', 'manager', 'teacher') or u.user_type::text in ('teacher', 'admin'))
  );
$$;


-- ACCESS, deliberately not the monitoring roster: a dormant student may still
-- answer. The denominator comes from loadClassroomRoster() as p_roster.
create or replace function pad_is_enrolled_student(p_user uuid, p_classroom uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from nexus_enrollments e
    where e.user_id = p_user
      and e.classroom_id = p_classroom
      and e.role = 'student'
      and coalesce(e.is_active, false)
  );
$$;


create or replace function pad_log(p_session uuid, p_prompt uuid, p_actor uuid, p_action text, p_detail jsonb default null)
returns void
language sql set search_path = public, pg_temp as $$
  insert into pad_events (session_id, prompt_id, actor_id, action, detail)
  values (p_session, p_prompt, p_actor, p_action, p_detail);
$$;


-- Log a refused call and build its result. p_session and p_prompt must be ids
-- that exist (or null), since the event row references them.
create or replace function pad_reject(
  p_session uuid, p_prompt uuid, p_actor uuid, p_action text, p_code text, p_detail jsonb default null
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  if p_session is not null then
    perform pad_log(p_session, p_prompt, p_actor, p_action || '_rejected',
                    jsonb_build_object('code', p_code) || coalesce(p_detail, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', p_code) || coalesce(p_detail, '{}'::jsonb);
end $$;


create or replace function pad_touch_app_presence(p_session uuid, p_student uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id bigint;
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
  else
    insert into pad_app_presence (session_id, student_id) values (p_session, p_student);
  end if;
end $$;


-- Was this student present at any moment of [p_from, p_to]? Any one source is
-- enough. EXISTS collapses any number of rows to one answer, which is why a
-- reconnecting student can never be counted twice.
create or replace function pad_was_present(
  p_session uuid, p_meeting text, p_class uuid, p_student uuid, p_from timestamptz, p_to timestamptz
) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select
    exists (
      select 1 from pad_app_presence ap
      where ap.session_id = p_session
        and ap.student_id = p_student
        and ap.joined_at <= p_to
        and ap.last_seen_at + interval '90 seconds' >= p_from
    )
    or (p_meeting is not null and exists (
      select 1 from pad_meeting_presence mp
      where mp.meeting_id = p_meeting
        and mp.student_id = p_student
        and mp.joined_at <= p_to
        and coalesce(mp.left_at, mp.joined_at + interval '12 hours') >= p_from
    ))
    or (p_class is not null and exists (
      select 1
      from nexus_attendance a
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(a.attendance_intervals) = 'array' then a.attendance_intervals else '[]'::jsonb end
      ) iv
      where a.scheduled_class_id = p_class
        and a.student_id = p_student
        and pad_try_timestamptz(iv ->> 'joinDateTime') <= p_to
        -- A missing or unreadable leave time counts for at most 12 hours, as a bot interval does.
        and coalesce(pad_try_timestamptz(iv ->> 'leaveDateTime'),
                     pad_try_timestamptz(iv ->> 'joinDateTime') + interval '12 hours') >= p_from
    ));
$$;


create or replace function pad_first_seen(p_session uuid, p_meeting text, p_class uuid, p_student uuid)
returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select min(t) from (
    select min(ap.joined_at) as t
    from pad_app_presence ap
    where ap.session_id = p_session and ap.student_id = p_student
    union all
    select min(mp.joined_at)
    from pad_meeting_presence mp
    where p_meeting is not null
      and mp.meeting_id = p_meeting
      and mp.student_id = p_student
      and mp.joined_at >= (select s.created_at - interval '12 hours' from pad_sessions s where s.id = p_session)
    union all
    select min(pad_try_timestamptz(iv ->> 'joinDateTime'))
    from nexus_attendance a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(a.attendance_intervals) = 'array' then a.attendance_intervals else '[]'::jsonb end
    ) iv
    where p_class is not null and a.scheduled_class_id = p_class and a.student_id = p_student
  ) x;
$$;


-- Exactly one row per student for one prompt: every roster id once, plus anyone
-- who answered but is not on the roster (a dormant student, say), flagged.
create or replace function pad_participation_rows(p_prompt uuid, p_roster uuid[])
returns table (
  student_id        uuid,
  on_roster         boolean,
  participation     text,   -- answered | silent | absent
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
    -- Arrived while this prompt was open: first seen inside its window. Someone
    -- first seen after it closed was absent for it, not late.
    coalesce(fs.first_seen > p.opened_at and fs.first_seen <= coalesce(p.closed_at, now()), false)
  from p
  cross join people pe
  cross join lateral (
    select pad_first_seen(p.sid, p.meeting_id, p.scheduled_class_id, pe.person) as first_seen
  ) fs
  left join pad_responses r on r.prompt_id = p.id and r.student_id = pe.person;
$$;


-- v3.1 section 11 scoring for one student in one session.
--   Only revealed, graded prompts count.
--   skipped = present during the prompt and did not answer.
--   absent never counts against the student.
--   total_graded = correct + wrong + skipped.
create or replace function pad_student_score(p_session uuid, p_student uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with graded as (
    select p.opened_at, p.closed_at, s.id as sid, s.meeting_id, s.scheduled_class_id,
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
      when pad_was_present(sid, meeting_id, scheduled_class_id, p_student, opened_at, closed_at) then 'skipped'
      else 'absent'
    end as c
    from graded
  )
  select jsonb_build_object(
    'correct',      count(*) filter (where c = 'correct'),
    'wrong',        count(*) filter (where c = 'wrong'),
    'skipped',      count(*) filter (where c = 'skipped'),
    'absent',       count(*) filter (where c = 'absent'),
    'total_graded', count(*) filter (where c <> 'absent')
  )
  from classified;
$$;


create or replace function pad_end_session_internal(p_session uuid, p_actor uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform set_config('pad.transition', 'end', true);
  update pad_prompts
     set state = 'closed', closed_at = now(), version = version + 1
   where session_id = p_session and state = 'open';
  update pad_sessions
     set status = 'ended', ended_at = now()
   where id = p_session and status = 'live';
  perform pad_log(p_session, null, p_actor, 'session_end', jsonb_build_object('reason', p_reason));
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: sessions
-- -----------------------------------------------------------------------------

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


create or replace function pad_end_session(p_actor uuid, p_session uuid, p_confirm_unrevealed boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s   pad_sessions;
  v_seq int;
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

  select sequence into v_seq
  from pad_prompts
  where session_id = p_session and state in ('open', 'closed')
  limit 1;

  if v_seq is not null and not coalesce(p_confirm_unrevealed, false) then
    return jsonb_build_object('ok', false, 'code', 'UNREVEALED_PROMPT', 'sequence', v_seq);
  end if;

  perform pad_end_session_internal(p_session, p_actor, 'teacher');
  return jsonb_build_object('ok', true, 'changed', true);
end $$;


-- A meeting that matches no scheduled class (a Meet now, or a series Nexus did
-- not create) is bound to a classroom once, when the teacher picks it. Every
-- later session on the same chat thread starts there, whoever teaches it.
-- Staff only, because the answer names a classroom.
create or replace function pad_recall_meeting_binding(p_actor uuid, p_thread text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s pad_sessions;
begin
  if p_actor is null or not pad_is_staff(p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_STAFF');
  end if;
  if p_thread is null or p_thread = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'thread');
  end if;

  select * into v_s
  from pad_sessions
  where meeting_thread_id = p_thread
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'binding', null);
  end if;
  return jsonb_build_object('ok', true, 'binding', jsonb_build_object(
    'classroom_id', v_s.classroom_id,
    'batch_id', v_s.batch_id,
    'classroom_name', (select c.name from nexus_classrooms c where c.id = v_s.classroom_id),
    'last_session_at', v_s.created_at
  ));
end $$;


-- -----------------------------------------------------------------------------
-- Teacher: prompt transitions
-- -----------------------------------------------------------------------------

create or replace function pad_ask(p_actor uuid, p_session uuid, p_answer_type text default 'mcq', p_option_count int default 4)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s   pad_sessions;
  v_p   pad_prompts;
  v_seq int;
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

  select * into v_p
  from pad_prompts
  where session_id = p_session and state in ('open', 'closed')
  for update;

  if found then
    if v_p.state = 'open' then
      -- A repeated ASK returns the prompt already open.
      return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id,
                                'state', v_p.state, 'version', v_p.version, 'sequence', v_p.sequence);
    end if;
    return pad_reject(v_s.id, v_p.id, p_actor, 'ask', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;

  if p_answer_type is null or p_answer_type not in ('mcq', 'numeric', 'text', 'yesno') then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'answer_type'));
  end if;
  if p_answer_type = 'mcq' and (p_option_count is null or p_option_count not between 2 and 6) then
    return pad_reject(v_s.id, null, p_actor, 'ask', 'INVALID_INPUT', jsonb_build_object('field', 'option_count'));
  end if;

  select coalesce(max(sequence), 0) + 1 into v_seq from pad_prompts where session_id = p_session;

  perform set_config('pad.transition', 'ask', true);
  insert into pad_prompts (session_id, sequence, answer_type, option_count)
  values (p_session, v_seq, p_answer_type, case when p_answer_type = 'mcq' then p_option_count else null end)
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'ask',
                  jsonb_build_object('sequence', v_seq, 'answer_type', p_answer_type, 'option_count', v_p.option_count));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id,
                            'state', v_p.state, 'version', v_p.version, 'sequence', v_seq);
end $$;


create or replace function pad_close(p_actor uuid, p_prompt uuid) returns jsonb
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
    return pad_reject(v_s.id, v_p.id, p_actor, 'close', 'NOT_SESSION_TEACHER');
  end if;
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'close', 'SESSION_NOT_LIVE');
  end if;
  if v_p.state = 'closed' then
    return jsonb_build_object('ok', true, 'changed', false, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
  end if;
  if v_p.state <> 'open' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'close', 'INVALID_TRANSITION', jsonb_build_object('state', v_p.state));
  end if;

  perform set_config('pad.transition', 'close', true);
  update pad_prompts
     set state = 'closed', closed_at = now(), version = version + 1
   where id = v_p.id
  returning * into v_p;

  perform pad_log(v_s.id, v_p.id, p_actor, 'close',
                  jsonb_build_object('answered', (select count(*) from pad_responses r where r.prompt_id = v_p.id)));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


create or replace function pad_reopen(p_actor uuid, p_prompt uuid) returns jsonb
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
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'set_key', 'SESSION_NOT_LIVE');
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
  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'reveal', 'SESSION_NOT_LIVE');
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
                                     'answered', (select count(*) from pad_responses r where r.prompt_id = v_p.id)));
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


create or replace function pad_set_label(p_actor uuid, p_prompt uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     pad_prompts;
  v_s     pad_sessions;
  v_label text := nullif(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), '');
begin
  select * into v_p from pad_prompts where id = p_prompt for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;
  if v_s.teacher_id is distinct from p_actor then
    return pad_reject(v_s.id, v_p.id, p_actor, 'label', 'NOT_SESSION_TEACHER');
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'label');
  end if;

  update pad_prompts set label = v_label, version = version + 1 where id = v_p.id returning * into v_p;
  perform pad_log(v_s.id, v_p.id, p_actor, 'label', null);
  return jsonb_build_object('ok', true, 'changed', true, 'prompt_id', v_p.id, 'state', v_p.state, 'version', v_p.version);
end $$;


-- -----------------------------------------------------------------------------
-- Students
-- -----------------------------------------------------------------------------

create or replace function pad_submit(p_actor uuid, p_prompt uuid, p_raw text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p    pad_prompts;
  v_s    pad_sessions;
  v_r    pad_responses;
  v_norm text;
begin
  -- A shared lock against CLOSE's exclusive one: an answer committed before the
  -- Close stands, one arriving after it is rejected. Commit order decides.
  select * into v_p from pad_prompts where id = p_prompt for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_s from pad_sessions where id = v_p.session_id;

  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'NOT_ENROLLED');
  end if;

  -- First answer wins: a retry or a second device gets the answer already locked.
  select * into v_r from pad_responses where prompt_id = v_p.id and student_id = p_actor;
  if found then
    return jsonb_build_object('ok', true, 'status', 'duplicate', 'answer', v_r.norm_answer,
                              'raw_answer', v_r.raw_answer, 'responded_at', v_r.responded_at);
  end if;

  if v_s.status <> 'live' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'SESSION_NOT_LIVE');
  end if;
  if v_p.state <> 'open' then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'PROMPT_NOT_OPEN', jsonb_build_object('state', v_p.state));
  end if;

  v_norm := pad_normalize(v_p.answer_type, p_raw);
  if v_norm is null or (v_p.answer_type = 'mcq' and ascii(v_norm) - 64 > v_p.option_count) then
    return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'INVALID_ANSWER');
  end if;

  perform set_config('pad.transition', 'submit', true);
  insert into pad_responses (prompt_id, student_id, raw_answer, norm_answer)
  values (v_p.id, p_actor, left(btrim(p_raw), 200), v_norm)
  on conflict (prompt_id, student_id) do nothing
  returning * into v_r;

  if not found then
    -- Lost a race with the same student's other request: return the winner.
    select * into v_r from pad_responses where prompt_id = v_p.id and student_id = p_actor;
    return jsonb_build_object('ok', true, 'status', 'duplicate', 'answer', v_r.norm_answer,
                              'raw_answer', v_r.raw_answer, 'responded_at', v_r.responded_at);
  end if;

  perform pad_touch_app_presence(v_s.id, p_actor);
  return jsonb_build_object('ok', true, 'status', 'accepted', 'answer', v_r.norm_answer,
                            'raw_answer', v_r.raw_answer, 'responded_at', v_r.responded_at);
end $$;


create or replace function pad_join_by_code(p_actor uuid, p_code text, p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s          pad_sessions;
  v_user_fails int;
  v_ip_fails   int := 0;
  v_code       text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
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
  perform pad_touch_app_presence(v_s.id, p_actor);
  return jsonb_build_object('ok', true, 'session_id', v_s.id);
end $$;


create or replace function pad_join_by_meeting(p_actor uuid, p_meeting_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s pad_sessions;
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

  perform pad_touch_app_presence(v_s.id, p_actor);
  return jsonb_build_object('ok', true, 'session_id', v_s.id);
end $$;


create or replace function pad_heartbeat(p_actor uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s pad_sessions;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_actor is null or not pad_is_enrolled_student(p_actor, v_s.classroom_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED');
  end if;
  if v_s.status = 'live' then
    perform pad_touch_app_presence(v_s.id, p_actor);
  end if;
  return jsonb_build_object('ok', true, 'status', v_s.status);
end $$;


-- -----------------------------------------------------------------------------
-- Snapshots and reads
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
           'state', p.state,
           'ungraded', p.ungraded,
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
    'rows', coalesce((select jsonb_agg(to_jsonb(t)) from pad_participation_rows(p_prompt, p_roster) t), '[]'::jsonb)
  );
end $$;


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


-- Enrolled students who should get the "Question is open" call to action: not
-- connected to the pad, and in the meeting when the bot has seen them.
create or replace function pad_notification_targets(p_actor uuid, p_session uuid, p_roster uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s          pad_sessions;
  v_has_meet   boolean;
  v_recipients jsonb;
  v_missing    int;
begin
  select * into v_s from pad_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_s.teacher_id is distinct from p_actor then
    return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');
  end if;

  v_has_meet := v_s.meeting_id is not null and exists (
    select 1 from pad_meeting_presence mp
    where mp.meeting_id = v_s.meeting_id and mp.left_at is null and mp.joined_at > now() - interval '12 hours'
  );

  with roster as (
    select distinct x as student_id from unnest(coalesce(p_roster, '{}'::uuid[])) x where x is not null
  ),
  targets as (
    select r.student_id
    from roster r
    where not exists (
            select 1 from pad_app_presence ap
            where ap.session_id = v_s.id
              and ap.student_id = r.student_id
              and ap.last_seen_at >= now() - interval '90 seconds')
      and (not v_has_meet or exists (
            select 1 from pad_meeting_presence mp
            where mp.meeting_id = v_s.meeting_id
              and mp.student_id = r.student_id
              and mp.left_at is null
              and mp.joined_at > now() - interval '12 hours'))
  )
  select coalesce(jsonb_agg(tu.teams_user_id) filter (where tu.teams_user_id is not null), '[]'::jsonb),
         count(*)
    into v_recipients, v_missing
  from targets t
  left join pad_teams_users tu on tu.user_id = t.student_id;

  return jsonb_build_object(
    'ok', true,
    'meeting_presence_known', v_has_meet,
    'not_connected', v_missing,
    'recipients', v_recipients
  );
end $$;


-- -----------------------------------------------------------------------------
-- Bot (called only by the bot route after it validates the Bot Framework token)
-- -----------------------------------------------------------------------------

create or replace function pad_bot_upsert_conversation(
  p_conversation_id text, p_service_url text, p_tenant_id text, p_meeting_id text, p_team_id text, p_channel_id text
) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into pad_bot_conversations (conversation_id, service_url, tenant_id, meeting_id, team_id, channel_id)
  values (p_conversation_id, p_service_url, p_tenant_id, p_meeting_id, p_team_id, p_channel_id)
  on conflict (conversation_id) do update
    set service_url = excluded.service_url,
        tenant_id   = coalesce(excluded.tenant_id, pad_bot_conversations.tenant_id),
        meeting_id  = coalesce(excluded.meeting_id, pad_bot_conversations.meeting_id),
        team_id     = coalesce(excluded.team_id, pad_bot_conversations.team_id),
        channel_id  = coalesce(excluded.channel_id, pad_bot_conversations.channel_id),
        updated_at  = now();
$$;


create or replace function pad_bot_participant_event(
  p_meeting_id text, p_aad_object_id text, p_teams_user_id text, p_event text, p_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user   uuid;
  v_next   timestamptz;
  v_closed int;
  v_at     timestamptz := coalesce(p_at, now());
begin
  if p_meeting_id is null or p_aad_object_id is null or p_event is null or p_event not in ('join', 'leave') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  -- Stored object ids are lowercase, as Graph returns them. Matching the raw and
  -- lowercased forms keeps the unique index on users.ms_oid usable.
  select u.id into v_user
  from users u
  where u.ms_oid in (p_aad_object_id, lower(p_aad_object_id))
  limit 1;

  if v_user is null then
    -- A guest, or someone Nexus does not know. Nothing to record.
    return jsonb_build_object('ok', true, 'mapped', false);
  end if;

  if p_teams_user_id is not null and p_teams_user_id <> '' then
    insert into pad_teams_users (user_id, teams_user_id)
    values (v_user, p_teams_user_id)
    on conflict (user_id) do update set teams_user_id = excluded.teams_user_id, updated_at = now();
  end if;

  -- Teams can deliver an event more than once, and not always in order. An
  -- interval must never stay open after the student left, or they would count
  -- as present for the next 12 hours.
  if p_event = 'join' then
    if not exists (
      select 1 from pad_meeting_presence
      where meeting_id = p_meeting_id and student_id = v_user
        and joined_at <= v_at and (left_at is null or left_at >= v_at)
    ) then
      -- A join older than an event already recorded ends where that event
      -- starts, instead of staying open.
      select min(joined_at) into v_next
      from pad_meeting_presence
      where meeting_id = p_meeting_id and student_id = v_user and joined_at > v_at;

      insert into pad_meeting_presence (meeting_id, student_id, joined_at, left_at)
      values (p_meeting_id, v_user, v_at, v_next);
    end if;
  else
    update pad_meeting_presence
       set left_at = v_at
     where meeting_id = p_meeting_id and student_id = v_user and left_at is null and joined_at <= v_at;
    get diagnostics v_closed = row_count;

    if v_closed = 0 and not exists (
      select 1 from pad_meeting_presence
      where meeting_id = p_meeting_id and student_id = v_user
        and joined_at <= v_at and left_at >= v_at
    ) then
      -- A leave with no join on record (lost, or still on its way): keep the
      -- moment, so a join that arrives late closes against it.
      insert into pad_meeting_presence (meeting_id, student_id, joined_at, left_at)
      values (p_meeting_id, v_user, v_at, v_at);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'mapped', true, 'user_id', v_user);
end $$;


create or replace function pad_bot_meeting_end(p_meeting_id text, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_closed int;
begin
  update pad_meeting_presence
     set left_at = greatest(coalesce(p_at, now()), joined_at)
   where meeting_id = p_meeting_id and left_at is null;
  get diagnostics v_closed = row_count;
  return jsonb_build_object('ok', true, 'closed', v_closed);
end $$;


-- -----------------------------------------------------------------------------
-- Privileges: nothing for anon/authenticated, functions for service_role only
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pad_sessions', 'pad_prompts', 'pad_responses', 'pad_app_presence', 'pad_meeting_presence',
    'pad_events', 'pad_join_attempts', 'pad_bot_conversations', 'pad_teams_users'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

-- Identity columns own sequences, and Supabase's default privileges grant those
-- to the client roles as well.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as seq
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'pad\_%'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', r.seq);
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
