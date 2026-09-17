/**
 * In-memory Postgres for the Answer Pad database tests.
 *
 * Loads a minimal stub of the Nexus tables the pad reads (users, classrooms,
 * enrollments, scheduled classes, attendance) and then the REAL migration file,
 * so every test exercises the exact SQL that ships. PGlite is Postgres compiled
 * to WASM: no Docker, no network, and it runs in CI under `pnpm test:run`.
 *
 * One connection only, so row-lock races (a submit racing CLOSE, two ASKs at
 * once) cannot be exercised here. Those run against staging in
 * scripts/answer-pad/concurrency.ts.
 *
 * Test files that import this must opt into the node environment with
 * `// @vitest-environment node`; the repo default is jsdom.
 */
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../../supabase/migrations');
const FINGERPRINT_FILE = path.resolve(__dirname, '../../../../../../scripts/answer-pad/schema-fingerprint.sql');

export function schemaFingerprintSql(): string {
  return readFileSync(FINGERPRINT_FILE, 'utf-8');
}

export function answerPadMigrationSql(): string {
  // Mutation checks point this at a deliberately broken copy to prove the suite notices.
  const override = process.env.PAD_MIGRATION_SQL_FILE;
  if (override) return readFileSync(override, 'utf-8');
  const file = readdirSync(MIGRATIONS_DIR).find((name) => /_answer_pad\.sql$/.test(name));
  if (!file) throw new Error(`answer pad migration not found in ${MIGRATIONS_DIR}`);
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}

/**
 * Only the columns the pad functions read. Shapes follow staging as of
 * 2026-09-10 (information_schema), including UNIQUE(user_id, classroom_id) on
 * nexus_enrollments and users.user_type being an enum.
 *
 * The default privileges copy staging's pg_default_acl: Supabase grants every
 * new table, function and sequence in public to anon and authenticated. Without
 * them the privilege tests would pass whether or not the migration revokes.
 */
const STUB_SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create type user_type as enum ('lead', 'student', 'teacher', 'admin', 'parent');

  create table users (
    id         uuid primary key default gen_random_uuid(),
    name       text not null default 'User',
    email      text,
    ms_oid     text,
    user_type  user_type,
    staff_role text,
    can_teach  boolean not null default true,
    is_alumni  boolean not null default false
  );

  create table nexus_classrooms (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    type        text not null default 'nata',
    is_active   boolean default true,
    is_archived boolean not null default false
  );

  create table nexus_batches (
    id           uuid primary key default gen_random_uuid(),
    classroom_id uuid references nexus_classrooms(id) on delete cascade,
    name         text
  );

  create table nexus_enrollments (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null references users(id) on delete cascade,
    classroom_id         uuid not null references nexus_classrooms(id) on delete cascade,
    role                 text not null check (role in ('teacher', 'student')),
    is_active            boolean default true,
    participation_status text not null default 'active',
    batch_id             uuid references nexus_batches(id) on delete set null,
    enrolled_at          timestamptz default now(),
    unique (user_id, classroom_id)
  );

  create table nexus_scheduled_classes (
    id                uuid primary key default gen_random_uuid(),
    classroom_id      uuid references nexus_classrooms(id) on delete cascade,
    teacher_id        uuid references users(id),
    title             text,
    scheduled_date    date,
    start_time        time,
    end_time          time,
    teams_meeting_id  text,
    teams_meeting_url text,
    batch_id          uuid
  );

  create table nexus_attendance (
    id                   uuid primary key default gen_random_uuid(),
    scheduled_class_id   uuid references nexus_scheduled_classes(id) on delete cascade,
    student_id           uuid references users(id) on delete cascade,
    attended             boolean,
    joined_at            timestamptz,
    left_at              timestamptz,
    duration_minutes     int,
    source               text,
    attendance_intervals jsonb,
    unique (scheduled_class_id, student_id)
  );
`;

/** A Postgres array literal. Ids here are generated UUIDs, never user input. */
export function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(',')}}`;
}

export type Json = any;

export type UserKind = 'student' | 'teacher' | 'manager' | 'admin';

export interface ClassFixture {
  classroomId: string;
  teacherId: string;
  students: string[];
}

export class PadTestDb {
  private constructor(readonly db: PGlite) {}

  static async create(): Promise<PadTestDb> {
    const db = new PGlite();
    await db.exec(STUB_SCHEMA);
    await db.exec(answerPadMigrationSql());
    return new PadTestDb(db);
  }

  /** Named dispose, not close: close() below is the CLOSE transition. */
  async dispose(): Promise<void> {
    await this.db.close();
  }

  async rows<T = Json>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.db.query<T>(sql, params);
    return result.rows;
  }

  /** Run the migration file a second time, as a re-applied deploy would. */
  async reapplyMigration(): Promise<void> {
    await this.db.exec(answerPadMigrationSql());
  }

  /**
   * One hash over every pad function, column, constraint, index, trigger and RLS
   * flag, from scripts/answer-pad/schema-fingerprint.sql. Running that same file
   * against staging or production proves the deployed schema is the one tested.
   */
  async fingerprint(): Promise<{ objects: number; hash: string }> {
    const [row] = await this.rows<{ objects: number; hash: string }>(schemaFingerprintSql());
    return row;
  }

  private async fn(sql: string, params: unknown[]): Promise<Json> {
    const result = await this.db.query<{ r: Json }>(sql, params);
    return result.rows[0]?.r;
  }

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------

  async user(kind: UserKind, opts: { msOid?: string; name?: string } = {}): Promise<string> {
    const id = randomUUID();
    const userType = kind === 'student' ? 'student' : kind === 'teacher' ? 'teacher' : 'admin';
    const staffRole = kind === 'student' ? null : kind;
    await this.db.query(
      `insert into users (id, name, email, ms_oid, user_type, staff_role)
       values ($1, $2, $3, $4, $5::user_type, $6)`,
      [id, opts.name ?? `${kind} ${id.slice(0, 6)}`, `${id.slice(0, 8)}@test.local`, opts.msOid ?? randomUUID(), userType, staffRole],
    );
    return id;
  }

  async classroom(name = 'Test Classroom'): Promise<string> {
    const id = randomUUID();
    await this.db.query(`insert into nexus_classrooms (id, name) values ($1, $2)`, [id, name]);
    return id;
  }

  async enroll(
    userId: string,
    classroomId: string,
    opts: { role?: 'student' | 'teacher'; active?: boolean; participation?: 'active' | 'dormant' } = {},
  ): Promise<void> {
    await this.db.query(
      `insert into nexus_enrollments (user_id, classroom_id, role, is_active, participation_status)
       values ($1, $2, $3, $4, $5)`,
      [userId, classroomId, opts.role ?? 'student', opts.active ?? true, opts.participation ?? 'active'],
    );
  }

  async classWithStudents(count = 3): Promise<ClassFixture> {
    const classroomId = await this.classroom();
    const teacherId = await this.user('teacher');
    await this.enroll(teacherId, classroomId, { role: 'teacher' });
    const students: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = await this.user('student', { name: `Student ${i + 1}` });
      await this.enroll(id, classroomId);
      students.push(id);
    }
    return { classroomId, teacherId, students };
  }

  async scheduledClass(classroomId: string, teacherId: string | null = null): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `insert into nexus_scheduled_classes (id, classroom_id, teacher_id, title, scheduled_date)
       values ($1, $2, $3, 'Test class', current_date)`,
      [id, classroomId, teacherId],
    );
    return id;
  }

  async attendance(classId: string, studentId: string, intervals: unknown): Promise<void> {
    await this.db.query(
      `insert into nexus_attendance (scheduled_class_id, student_id, attended, source, attendance_intervals)
       values ($1, $2, true, 'teams', $3::jsonb)`,
      [classId, studentId, JSON.stringify(intervals)],
    );
  }

  async appPresence(sessionId: string, studentId: string, joinedAt: Date, lastSeenAt: Date): Promise<void> {
    await this.db.query(
      `insert into pad_app_presence (session_id, student_id, joined_at, last_seen_at)
       values ($1, $2, $3::timestamptz, $4::timestamptz)`,
      [sessionId, studentId, joinedAt.toISOString(), lastSeenAt.toISOString()],
    );
  }

  async meetingPresence(meetingId: string, studentId: string, joinedAt: Date, leftAt: Date | null): Promise<void> {
    await this.db.query(
      `insert into pad_meeting_presence (meeting_id, student_id, joined_at, left_at)
       values ($1, $2, $3::timestamptz, $4::timestamptz)`,
      [meetingId, studentId, joinedAt.toISOString(), leftAt ? leftAt.toISOString() : null],
    );
  }

  /**
   * Move a prompt's open window into the past so presence can be placed around
   * it. Test-only: it sets the transition flag the guard trigger requires, which
   * no application path can do.
   */
  async shiftPromptWindow(promptId: string, openedAt: Date, closedAt: Date | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(`select set_config('pad.transition', 'end', true)`);
      await tx.query(
        `update pad_prompts
            set opened_at = $2::timestamptz,
                closed_at = case when state = 'open' then null else $3::timestamptz end,
                revealed_at = case when state = 'revealed' then $3::timestamptz else null end
          where id = $1`,
        [promptId, openedAt.toISOString(), closedAt ? closedAt.toISOString() : null],
      );
    });
  }

  async teamsUser(userId: string, teamsUserId: string): Promise<void> {
    await this.db.query(`insert into pad_teams_users (user_id, teams_user_id) values ($1, $2)`, [userId, teamsUserId]);
  }

  async msOid(userId: string): Promise<string> {
    const [row] = await this.rows<{ ms_oid: string }>(`select ms_oid from users where id = $1`, [userId]);
    return row.ms_oid;
  }

  async meetingIntervals(meetingId: string, userId: string): Promise<Array<[string, string | null]>> {
    const rows = await this.rows<{ joined_at: Date; left_at: Date | null }>(
      `select joined_at, left_at from pad_meeting_presence
        where meeting_id = $1 and student_id = $2
        order by joined_at, left_at nulls last`,
      [meetingId, userId],
    );
    return rows.map((r) => [new Date(r.joined_at).toISOString(), r.left_at ? new Date(r.left_at).toISOString() : null]);
  }

  async ageSession(sessionId: string, hours: number): Promise<void> {
    await this.db.query(
      `update pad_sessions set created_at = now() - make_interval(hours => $2) where id = $1`,
      [sessionId, hours],
    );
  }

  async events(sessionId: string): Promise<Array<{ action: string; detail: Json; actor_id: string | null }>> {
    return this.rows(`select action, detail, actor_id from pad_events where session_id = $1 order by id`, [sessionId]);
  }

  // ---------------------------------------------------------------------------
  // Functions under test
  // ---------------------------------------------------------------------------

  start(
    actor: string | null,
    classroomId: string,
    opts: { scheduledClassId?: string; batchId?: string; meetingId?: string; meetingThread?: string; endExisting?: boolean } = {},
  ): Promise<Json> {
    return this.fn(
      `select pad_start_or_resume_session($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::boolean) as r`,
      [actor, classroomId, opts.scheduledClassId ?? null, opts.batchId ?? null, opts.meetingId ?? null, opts.meetingThread ?? null, opts.endExisting ?? false],
    );
  }

  recallMeeting(actor: string | null, thread: string | null): Promise<Json> {
    return this.fn(`select pad_recall_meeting_binding($1::uuid, $2::text) as r`, [actor, thread]);
  }

  end(actor: string | null, sessionId: string, confirmUnrevealed = false): Promise<Json> {
    return this.fn(`select pad_end_session($1::uuid, $2::uuid, $3::boolean) as r`, [actor, sessionId, confirmUnrevealed]);
  }

  ask(actor: string | null, sessionId: string, answerType: string | null = 'mcq', optionCount: number | null = 4): Promise<Json> {
    return this.fn(`select pad_ask($1::uuid, $2::uuid, $3::text, $4::int) as r`, [actor, sessionId, answerType, optionCount]);
  }

  close(actor: string | null, promptId: string): Promise<Json> {
    return this.fn(`select pad_close($1::uuid, $2::uuid) as r`, [actor, promptId]);
  }

  reopen(actor: string | null, promptId: string): Promise<Json> {
    return this.fn(`select pad_reopen($1::uuid, $2::uuid) as r`, [actor, promptId]);
  }

  setKey(actor: string | null, promptId: string, keys: string[] | null, ungraded = false): Promise<Json> {
    return this.fn(`select pad_set_key($1::uuid, $2::uuid, $3::text[], $4::boolean) as r`, [
      actor,
      promptId,
      keys === null ? null : `{${keys.map((k) => `"${k.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`,
      ungraded,
    ]);
  }

  reveal(actor: string | null, promptId: string): Promise<Json> {
    return this.fn(`select pad_reveal($1::uuid, $2::uuid) as r`, [actor, promptId]);
  }

  label(actor: string | null, promptId: string, label: string | null): Promise<Json> {
    return this.fn(`select pad_set_label($1::uuid, $2::uuid, $3::text) as r`, [actor, promptId, label]);
  }

  submit(actor: string | null, promptId: string, raw: string | null): Promise<Json> {
    return this.fn(`select pad_submit($1::uuid, $2::uuid, $3::text) as r`, [actor, promptId, raw]);
  }

  joinByCode(actor: string | null, code: string, ipHash: string | null = null): Promise<Json> {
    return this.fn(`select pad_join_by_code($1::uuid, $2::text, $3::text) as r`, [actor, code, ipHash]);
  }

  joinByMeeting(actor: string | null, meetingId: string): Promise<Json> {
    return this.fn(`select pad_join_by_meeting($1::uuid, $2::text) as r`, [actor, meetingId]);
  }

  heartbeat(actor: string | null, sessionId: string): Promise<Json> {
    return this.fn(`select pad_heartbeat($1::uuid, $2::uuid) as r`, [actor, sessionId]);
  }

  studentSnapshot(actor: string | null, sessionId: string, touch = false): Promise<Json> {
    return this.fn(`select pad_student_snapshot($1::uuid, $2::uuid, $3::boolean) as r`, [actor, sessionId, touch]);
  }

  teacherSnapshot(actor: string | null, sessionId: string, roster: readonly string[]): Promise<Json> {
    return this.fn(`select pad_teacher_snapshot($1::uuid, $2::uuid, $3::uuid[]) as r`, [actor, sessionId, uuidArray(roster)]);
  }

  participation(actor: string | null, promptId: string, roster: readonly string[]): Promise<Json> {
    return this.fn(`select pad_participation($1::uuid, $2::uuid, $3::uuid[]) as r`, [actor, promptId, uuidArray(roster)]);
  }

  report(actor: string | null, sessionId: string, roster: readonly string[]): Promise<Json> {
    return this.fn(`select pad_session_report($1::uuid, $2::uuid, $3::uuid[]) as r`, [actor, sessionId, uuidArray(roster)]);
  }

  notificationTargets(actor: string | null, sessionId: string, roster: readonly string[]): Promise<Json> {
    return this.fn(`select pad_notification_targets($1::uuid, $2::uuid, $3::uuid[]) as r`, [actor, sessionId, uuidArray(roster)]);
  }

  async botConversation(conversationId: string, serviceUrl: string, meetingId: string | null): Promise<void> {
    await this.db.query(`select pad_bot_upsert_conversation($1, $2, $3, $4, $5, $6)`, [
      conversationId,
      serviceUrl,
      'tenant-1',
      meetingId,
      null,
      null,
    ]);
  }

  botParticipant(meetingId: string, aadObjectId: string, teamsUserId: string | null, event: string, at?: Date): Promise<Json> {
    return this.fn(`select pad_bot_participant_event($1::text, $2::text, $3::text, $4::text, $5::timestamptz) as r`, [
      meetingId,
      aadObjectId,
      teamsUserId,
      event,
      at ? at.toISOString() : null,
    ]);
  }

  botMeetingEnd(meetingId: string, at?: Date): Promise<Json> {
    return this.fn(`select pad_bot_meeting_end($1::text, $2::timestamptz) as r`, [meetingId, at ? at.toISOString() : null]);
  }

  async normalize(type: string, raw: string | null): Promise<string | null> {
    return this.fn(`select pad_normalize($1::text, $2::text) as r`, [type, raw]);
  }
}

export const minutes = (n: number): number => n * 60_000;

export function at(base: Date, offsetMs: number): Date {
  return new Date(base.getTime() + offsetMs);
}
