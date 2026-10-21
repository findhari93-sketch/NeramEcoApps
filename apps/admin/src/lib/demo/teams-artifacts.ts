/**
 * What Microsoft Teams knows about a demo after it ran: who joined (attendance
 * reports) and which recordings exist (the organizer's OneDrive Recordings
 * folder, where Teams saves recordings of non-channel meetings).
 *
 * Suggestions only. Staff confirm Attended or No-show and pick the recording,
 * because a test run or a student who opened the link by mistake also shows up.
 *
 * App-only Graph, same app as Nexus: OnlineMeetings.Read(Write).All +
 * OnlineMeetingArtifact.Read.All for attendance (with the Teams application
 * access policy), OnlineMeetingTranscript.Read.All for the transcript (the
 * same one Nexus class transcripts use), Files.Read.All for the Recordings folder.
 */

import { getAppOnlyToken } from '@neram/auth';
import { graph, isDemoTeamsDryRun, tokenRoles } from './teams';
import { demoWindow } from './demo-verdict';
import { demoRecordingCandidates, mergeAttendance, type DemoAttendee, type DemoRecordingFile, type GraphAttendanceRecord, type GraphDriveItem } from './teams-evidence';

export * from './teams-evidence';

// ─── Graph ───────────────────────────────────────────────────────────────

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

async function getAll<T>(token: string, path: string, max = 10): Promise<{ status: number; items: T[] }> {
  const items: T[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < max; page++) {
    const res = await graph(next.startsWith(GRAPH_ROOT) ? next.slice(GRAPH_ROOT.length) : next, { token, method: 'GET' });
    if (!res.ok) return { status: res.status, items };
    const body = (await res.json()) as { value?: T[]; '@odata.nextLink'?: string };
    items.push(...(body.value ?? []));
    next = body['@odata.nextLink'] ?? null;
  }
  return { status: 200, items };
}

function attendanceRefusal(status: number, token: string): string {
  const roles = tokenRoles(token);
  if ((status === 401 || status === 403) && !roles.includes('OnlineMeetingArtifact.Read.All')) {
    return 'Attendance needs the Graph application permission OnlineMeetingArtifact.Read.All on the Microsoft app.';
  }
  if (status === 401 || status === 403) return "Teams refused the app for this organizer's meetings. Check the Teams application access policy.";
  return `Teams attendance could not be read (HTTP ${status}).`;
}

export interface DemoTeamsRead {
  meetingId: string | null;
  attendance: DemoAttendee[] | null;
  recordings: DemoRecordingFile[] | null;
  /** The demo's transcript, when one was asked for and Teams has it. */
  transcript: { id: string; vtt: string } | null;
  note: string | null;
}

/**
 * The transcript Teams made around the booked time. A meeting can hold several
 * (a test run transcribes too); the longest one near the booked time wins.
 * Content needs text/vtt named in the header AND the query: Node's default
 * Accept makes Graph answer 400 (same lesson as Nexus transcript-resolver).
 */
async function readTranscript(
  token: string,
  base: string,
  meetingId: string,
  window: { from: number; end: number },
): Promise<{ transcript: { id: string; vtt: string } | null; note: string | null }> {
  const path = `${base}/${encodeURIComponent(meetingId)}/transcripts`;
  const res = await graph(path, { token, method: 'GET' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (/GraphAccessToTranscriptsDisabled/i.test(body)) {
      return { transcript: null, note: 'Transcripts are switched off for Graph in the Teams admin center (Meeting policy, Transcript API access).' };
    }
    if ((res.status === 401 || res.status === 403) && !tokenRoles(token).includes('OnlineMeetingTranscript.Read.All')) {
      return { transcript: null, note: 'Transcripts need the Graph application permission OnlineMeetingTranscript.Read.All on the Microsoft app.' };
    }
    return { transcript: null, note: `The transcript could not be read (HTTP ${res.status}).` };
  }
  const list = (((await res.json()) as { value?: Array<{ id: string; createdDateTime?: string }> }).value ?? [])
    .filter((t) => {
      const at = t.createdDateTime ? new Date(t.createdDateTime).getTime() : NaN;
      return Number.isFinite(at) && at >= window.from && at <= window.end + 6 * 3_600_000;
    })
    .slice(0, 3);
  let best: { id: string; vtt: string } | null = null;
  for (const t of list) {
    const content = await fetch(`${GRAPH_ROOT}${path}/${encodeURIComponent(t.id)}/content?$format=text/vtt`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/vtt' },
    });
    if (!content.ok) continue;
    const vtt = await content.text();
    if (vtt.includes('-->') && (!best || vtt.length > best.vtt.length)) best = { id: t.id, vtt };
  }
  return { transcript: best, note: null };
}

/** Read attendance and recordings. Each half fails on its own, with a note staff can act on. */
export async function readDemoTeams(input: {
  organizerUpn: string;
  /** Whoever presses Record by hand gets the file in their own OneDrive, so the tutor's is searched too. */
  tutorUpn: string | null;
  joinUrl: string;
  meetingId: string | null;
  ref: string;
  staffEmails: string[];
  start: string;
  minutes: number;
  /** False once the transcript is stored: saves the calls. */
  wantTranscript: boolean;
}): Promise<DemoTeamsRead> {
  if (isDemoTeamsDryRun()) return { meetingId: null, attendance: [], recordings: [], transcript: null, note: 'Dry run: Teams is not called.' };
  const token = await getAppOnlyToken();
  const notes: string[] = [];

  const who = await graph(`/users/${encodeURIComponent(input.organizerUpn)}?$select=id`, { token, method: 'GET' });
  const oid = who.ok ? ((await who.json()) as { id?: string }).id ?? null : null;
  if (!oid) {
    return { meetingId: input.meetingId, attendance: null, recordings: null, transcript: null, note: `No Microsoft account found for ${input.organizerUpn}.` };
  }
  const base = `/users/${encodeURIComponent(oid)}/onlineMeetings`;

  let meetingId = input.meetingId;
  let attendance: DemoAttendee[] | null = null;
  if (!meetingId) {
    const filter = `JoinWebUrl eq '${input.joinUrl.replace(/'/g, "''")}'`;
    const found = await graph(`${base}?$filter=${encodeURIComponent(filter)}&$select=id`, { token, method: 'GET' });
    if (found.ok) meetingId = ((await found.json()) as { value?: Array<{ id: string }> }).value?.[0]?.id ?? null;
    else notes.push(attendanceRefusal(found.status, token));
  }
  if (meetingId) {
    const reports = await getAll<{ id: string }>(token, `${base}/${encodeURIComponent(meetingId)}/attendanceReports`);
    if (reports.status !== 200) {
      notes.push(attendanceRefusal(reports.status, token));
    } else {
      const records: GraphAttendanceRecord[] = [];
      for (const rep of reports.items.slice(0, 10)) {
        const rec = await getAll<GraphAttendanceRecord>(
          token,
          `${base}/${encodeURIComponent(meetingId)}/attendanceReports/${encodeURIComponent(rep.id)}/attendanceRecords`,
        );
        if (rec.status === 200) records.push(...rec.items);
      }
      attendance = mergeAttendance(records, { orgTenantId: process.env.AZ_TENANT_ID || null, staffEmails: input.staffEmails });
    }
  } else if (!notes.length) {
    notes.push('Teams did not find the meeting behind this demo.');
  }

  let transcript: DemoTeamsRead['transcript'] = null;
  if (meetingId && input.wantTranscript) {
    const t = await readTranscript(token, base, meetingId, demoWindow(input.start, input.minutes));
    transcript = t.transcript;
    if (t.note) notes.push(t.note);
  }

  let recordings: DemoRecordingFile[] | null = null;
  const owners = [oid, ...(input.tutorUpn && input.tutorUpn.toLowerCase() !== input.organizerUpn.toLowerCase() ? [input.tutorUpn] : [])];
  for (const owner of owners) {
    const files = await getAll<GraphDriveItem>(
      token,
      `/users/${encodeURIComponent(owner)}/drive/root:/Recordings:/children?$select=id,name,webUrl,createdDateTime,size,file,video,parentReference&$top=200`,
    );
    if (files.status === 200) recordings = [...(recordings ?? []), ...demoRecordingCandidates(files.items, input.ref)];
    else if (files.status === 404) recordings = recordings ?? [];
    else if (owner === oid) notes.push(`Recordings could not be listed (HTTP ${files.status}). The Microsoft app needs Files.Read.All.`);
  }
  recordings?.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { meetingId, attendance, recordings, transcript, note: notes.join(' ') || null };
}

/** A short-lived playable URL for a picked recording. Never store it. */
export async function demoRecordingPlayUrl(driveId: string, itemId: string): Promise<string | null> {
  if (isDemoTeamsDryRun()) return null;
  const token = await getAppOnlyToken();
  const res = await graph(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,@microsoft.graph.downloadUrl`,
    { token, method: 'GET' },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  const url = body['@microsoft.graph.downloadUrl'];
  return typeof url === 'string' ? url : null;
}
