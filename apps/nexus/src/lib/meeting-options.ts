/**
 * Who may present in a class meeting, and auto-record, set on the Teams
 * online meeting behind a class.
 *
 * Why this exists: a channel class is created as a group calendar event, and
 * an event cannot carry `allowedPresenters`. Nexus only ever PATCHed
 * `recordAutomatically` afterwards, so every channel class was left at Teams'
 * default "everyone can present". On 2026-09-30 a student pressed Share in a
 * pad class and replaced the teacher's screen share, while the class row said
 * `allowed_presenters = 'organizer'`. Graph was the truth; the row was intent.
 *
 * Two callers, two tokens:
 * - creating a meeting: the teacher's delegated token, on /me/onlineMeetings;
 * - the Answer Pad console inside Teams: the app-only token (the pad's Teams
 *   SSO token cannot call Graph), on /users/{organizer oid}/onlineMeetings,
 *   which needs the application permission OnlineMeetings.ReadWrite.All.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type AllowedPresenters = 'everyone' | 'organization' | 'roleIsPresenter' | 'organizer' | 'unknownFutureValue';

/** Where the meeting lives: the signed-in organizer's own, or a named user's. */
export type MeetingOwner = { kind: 'me' } | { kind: 'user'; oid: string };

type FetchLike = typeof fetch;

function base(owner: MeetingOwner): string {
  return owner.kind === 'me' ? `${GRAPH}/me/onlineMeetings` : `${GRAPH}/users/${encodeURIComponent(owner.oid)}/onlineMeetings`;
}

/** The online meeting id behind a join link, or null when Graph has none for this owner. */
export async function findOnlineMeetingId(
  token: string,
  owner: MeetingOwner,
  joinUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const res = await fetchImpl(`${base(owner)}?$filter=${encodeURIComponent(filter)}&$select=id`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { value?: Array<{ id?: string }> } | null;
  return body?.value?.[0]?.id ?? null;
}

/** Who may present right now, or null when the meeting could not be read. */
export async function readAllowedPresenters(
  token: string,
  owner: MeetingOwner,
  meetingId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: number; allowedPresenters: AllowedPresenters | null }> {
  const res = await fetchImpl(`${base(owner)}/${encodeURIComponent(meetingId)}?$select=allowedPresenters`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { status: res.status, allowedPresenters: null };
  const body = (await res.json().catch(() => null)) as { allowedPresenters?: AllowedPresenters } | null;
  return { status: res.status, allowedPresenters: body?.allowedPresenters ?? null };
}

async function patch(token: string, owner: MeetingOwner, meetingId: string, body: Record<string, unknown>, fetchImpl: FetchLike) {
  return fetchImpl(`${base(owner)}/${encodeURIComponent(meetingId)}`, {
    cache: 'no-store',
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * A member of staff who may present: a Microsoft account, by UPN and object id.
 * Built by buildStaffPresenters in @/lib/class-attendees.
 */
export interface StaffPresenter {
  upn: string;
  oid: string;
}

/** One entry of onlineMeeting.participants.attendees, as Graph returns it. */
export interface MeetingParticipant {
  upn?: string | null;
  role?: string | null;
  identity?: { user?: { id?: string | null } | null } | null;
}

/**
 * The attendee list that makes every member of staff a presenter.
 *
 * Read-modify-write, because the PATCH replaces the whole list: everyone
 * already on the meeting stays on it with their role (students stay
 * attendees), staff already listed are promoted, staff not yet listed are
 * added. Matched on object id and on UPN without case, since Microsoft keeps
 * admin-set UPN casing and the stored email can differ from it.
 */
export function buildPresenterParticipants(
  existing: MeetingParticipant[],
  presenters: StaffPresenter[],
  organizer?: MeetingParticipant | null,
): Array<{ upn?: string; role: string; identity?: { user: { id: string } } }> {
  // The organizer always presents and is not an attendee; listing them as one
  // is a list Graph may refuse.
  const orgOid = organizer?.identity?.user?.id?.toLowerCase() || '';
  const orgUpn = organizer?.upn?.toLowerCase() || '';
  const isOrganizer = (p: StaffPresenter) =>
    (!!orgOid && p.oid.toLowerCase() === orgOid) || (!!orgUpn && p.upn.toLowerCase() === orgUpn);

  const byOid = new Map<string, StaffPresenter>();
  const byUpn = new Map<string, StaffPresenter>();
  for (const p of presenters) {
    if (isOrganizer(p)) continue;
    if (p.oid) byOid.set(p.oid.toLowerCase(), p);
    if (p.upn) byUpn.set(p.upn.toLowerCase(), p);
  }

  const placed = new Set<StaffPresenter>();
  const out: Array<{ upn?: string; role: string; identity?: { user: { id: string } } }> = [];
  for (const a of existing || []) {
    const oid = a.identity?.user?.id || '';
    const upn = a.upn || '';
    const staff = byOid.get(oid.toLowerCase()) || byUpn.get(upn.toLowerCase());
    if (staff) placed.add(staff);
    const entry: { upn?: string; role: string; identity?: { user: { id: string } } } = {
      role: staff ? 'presenter' : a.role || 'attendee',
    };
    if (upn) entry.upn = upn;
    if (oid) entry.identity = { user: { id: oid } };
    out.push(entry);
  }

  const seen = new Set<string>();
  for (const p of presenters) {
    if (placed.has(p) || isOrganizer(p)) continue;
    const key = (p.oid || p.upn).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ upn: p.upn, role: 'presenter', identity: { user: { id: p.oid } } });
  }
  return out;
}

/**
 * Teams "Who can present: Specific people", with every member of staff on the
 * list. Students stay attendees, so they still cannot share over the teacher.
 *
 * This is the setting a class needs: the person who scheduled the class is
 * often not the one teaching it (2026-10-08, the tutor could not share until
 * the organizer changed it by hand), and "People in my organization" would let
 * students present, since they have @neramclasses.com accounts.
 */
async function applyStaffPresenters(
  token: string,
  owner: MeetingOwner,
  meetingId: string,
  presenters: StaffPresenter[],
  fetchImpl: FetchLike,
): Promise<Response> {
  const read = await fetchImpl(`${base(owner)}/${encodeURIComponent(meetingId)}?$select=participants`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  // Without the current list the PATCH would drop everyone already on it.
  if (!read.ok) return read;
  const body = (await read.json().catch(() => null)) as
    | { participants?: { organizer?: MeetingParticipant; attendees?: MeetingParticipant[] } }
    | null;
  const attendees = buildPresenterParticipants(body?.participants?.attendees ?? [], presenters, body?.participants?.organizer);
  return patch(token, owner, meetingId, { allowedPresenters: 'roleIsPresenter', participants: { attendees } }, fetchImpl);
}

/**
 * Set who may present, and optionally auto-record.
 *
 * A tenant meeting policy can refuse one of the two settings and the whole
 * PATCH fails with it, so when both were asked for and the pair is refused,
 * each is retried alone: a policy that forbids auto-record must not also leave
 * the students able to present.
 *
 * `roleIsPresenter` with `presenters` makes every member of staff a presenter.
 * When Graph refuses that, the meeting falls back to organizer-only and
 * `presentersFallback` says so. It never falls back to `organization` or
 * `everyone`: either would let students present.
 */
export async function applyMeetingOptions(
  token: string,
  owner: MeetingOwner,
  meetingId: string,
  options: { allowedPresenters?: AllowedPresenters; recordAutomatically?: boolean; presenters?: StaffPresenter[] },
  fetchImpl: FetchLike = fetch,
): Promise<{ presenters: boolean; record: boolean; status: number; presentersFallback?: boolean }> {
  const wantPresenters = !!options.allowedPresenters;
  const wantRecord = options.recordAutomatically === true;
  if (!wantPresenters && !wantRecord) return { presenters: false, record: false, status: 0 };

  if (options.allowedPresenters === 'roleIsPresenter') {
    // Staff presenters need the participant list, so this is its own PATCH and
    // auto-record is set separately: neither can then take the other down.
    const record = wantRecord ? await patch(token, owner, meetingId, { recordAutomatically: true }, fetchImpl) : null;
    const staff = await applyStaffPresenters(token, owner, meetingId, options.presenters ?? [], fetchImpl);
    if (staff.ok) return { presenters: true, record: !!record?.ok, status: staff.status };
    const locked = await patch(token, owner, meetingId, { allowedPresenters: 'organizer' }, fetchImpl);
    return { presenters: false, record: !!record?.ok, status: staff.status, presentersFallback: locked.ok };
  }

  const both: Record<string, unknown> = {};
  if (wantPresenters) both.allowedPresenters = options.allowedPresenters;
  if (wantRecord) both.recordAutomatically = true;

  const first = await patch(token, owner, meetingId, both, fetchImpl);
  if (first.ok) return { presenters: wantPresenters, record: wantRecord, status: first.status };
  if (!(wantPresenters && wantRecord)) return { presenters: false, record: false, status: first.status };

  const presenters = await patch(token, owner, meetingId, { allowedPresenters: options.allowedPresenters }, fetchImpl);
  const record = await patch(token, owner, meetingId, { recordAutomatically: true }, fetchImpl);
  return { presenters: presenters.ok, record: record.ok, status: presenters.status };
}
