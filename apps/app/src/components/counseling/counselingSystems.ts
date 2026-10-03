/**
 * Helpers shared by the counseling tools (college predictor, rank predictor)
 * for choosing which counseling system a page opens on.
 *
 * Most active systems have no rank or allotment data yet, so opening on the
 * first one by name ("ACPC Gujarat") showed an empty tool. Pages open on the
 * system named in `?system=`, else TNEA B.Arch, else the first system the API
 * says has data, else the first active one.
 */

export interface CounselingSystemLike {
  id: string;
  code: string;
  name: string;
  state?: string | null;
  is_active: boolean;
  /**
   * Optional: set by the API when it knows whether the system has any rank,
   * allotment or directory rows. Absent means "unknown", never "empty".
   */
  has_data?: boolean;
}

export const PREFERRED_SYSTEM_CODE = 'TNEA_BARCH';

/** true / false when the API says so, null when the response does not tell us */
export function systemHasData(sys: CounselingSystemLike): boolean | null {
  return typeof sys.has_data === 'boolean' ? sys.has_data : null;
}

/** A system can be picked when it is active and not known to be empty */
export function isSystemSelectable(sys: CounselingSystemLike): boolean {
  return sys.is_active && systemHasData(sys) !== false;
}

/**
 * Match a `?system=` value to a system code. Case-insensitive, and accepts the
 * short "_ARCH" form used by marketing links (KEAM_ARCH) for a "_BARCH" code.
 */
export function resolveSystemCode<T extends CounselingSystemLike>(
  systems: T[],
  param: string | null | undefined
): T | null {
  if (!param) return null;
  const wanted = param.trim().toUpperCase();
  if (!wanted) return null;
  const candidates = [wanted];
  if (wanted.endsWith('_ARCH') && !wanted.endsWith('_BARCH')) {
    candidates.push(wanted.replace(/_ARCH$/, '_BARCH'));
  }
  for (const code of candidates) {
    const match = systems.find((s) => s.code.toUpperCase() === code);
    if (match && isSystemSelectable(match)) return match;
  }
  return null;
}

export function pickDefaultSystem<T extends CounselingSystemLike>(
  systems: T[],
  param?: string | null
): T | null {
  const fromUrl = resolveSystemCode(systems, param);
  if (fromUrl) return fromUrl;

  const preferred = systems.find((s) => s.code === PREFERRED_SYSTEM_CODE && isSystemSelectable(s));
  if (preferred) return preferred;

  const withData = systems.find((s) => s.is_active && systemHasData(s) === true);
  if (withData) return withData;

  return systems.find((s) => isSystemSelectable(s)) ?? null;
}

/** Plain-language reason for a failed GET, never the raw server message */
export async function readJsonOrThrow<T = unknown>(res: Response, fallback: string): Promise<T> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body && typeof body.error === 'string' && res.status < 500 ? body.error : fallback;
    throw new Error(message);
  }
  return body as T;
}

export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}
