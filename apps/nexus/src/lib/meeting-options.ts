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
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { status: res.status, allowedPresenters: null };
  const body = (await res.json().catch(() => null)) as { allowedPresenters?: AllowedPresenters } | null;
  return { status: res.status, allowedPresenters: body?.allowedPresenters ?? null };
}

async function patch(token: string, owner: MeetingOwner, meetingId: string, body: Record<string, unknown>, fetchImpl: FetchLike) {
  return fetchImpl(`${base(owner)}/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Set who may present, and optionally auto-record, in one PATCH.
 *
 * A tenant meeting policy can refuse one of the two settings and the whole
 * PATCH fails with it, so when both were asked for and the pair is refused,
 * each is retried alone: a policy that forbids auto-record must not also leave
 * the students able to present.
 */
export async function applyMeetingOptions(
  token: string,
  owner: MeetingOwner,
  meetingId: string,
  options: { allowedPresenters?: AllowedPresenters; recordAutomatically?: boolean },
  fetchImpl: FetchLike = fetch,
): Promise<{ presenters: boolean; record: boolean; status: number }> {
  const wantPresenters = !!options.allowedPresenters;
  const wantRecord = options.recordAutomatically === true;
  if (!wantPresenters && !wantRecord) return { presenters: false, record: false, status: 0 };

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
