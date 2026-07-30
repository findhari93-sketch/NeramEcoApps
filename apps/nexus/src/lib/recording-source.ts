/**
 * Read a class recording out of SharePoint in slices.
 *
 * The pre-authenticated download URL Graph hands back supports HTTP Range. That
 * was verified against production on 2026-07-30 across all four recording_url
 * shapes in use (personal OneDrive webUrl, Teams recap link, site webUrl and a
 * /:v:/ share link), for both a leading range and an arbitrary mid-file offset:
 * every one answered 206 with Accept-Ranges: bytes. Real recordings measured
 * 130 to 370 MB.
 *
 * That single fact is what makes the whole backup design possible. Without Range
 * a 370 MB file would have to move inside one function lifetime; with it, an
 * upload cut off at 80% resumes on the next cron pass.
 *
 * THE DOWNLOAD URL IS NEVER PERSISTED. It expires in well under an hour, and an
 * expired one answers 403, which a resume running 40 minutes later would happily
 * misread as a dead upload session and throw away 1600 quota units over. Every
 * run re-resolves it, which costs one cheap Graph call.
 */

import {
  getSharePointStreamUrl,
  resolveShareUrlToItem,
  unwrapTeamsRecapUrl,
} from './sharepoint';

export interface RecordingSource {
  /** Short-lived, pre-authenticated. Re-resolve every run; never store. */
  downloadUrl: string;
  /** Exact byte count. Must equal X-Upload-Content-Length or Google refuses. */
  size: number;
  itemId: string | null;
  name: string | null;
}

/**
 * Resolve a stored recording_url to something bytes can be pulled from.
 *
 * `size` comes from the driveItem rather than from a Content-Length, because the
 * upload has to declare the total up front and a wrong total fails the whole
 * session after the bytes have already moved.
 */
export async function resolveRecordingSource(recordingUrl: string): Promise<RecordingSource> {
  const target = unwrapTeamsRecapUrl(recordingUrl);

  // resolveShareUrlToItem does not unwrap recap links itself, so it is given the
  // unwrapped URL. getSharePointStreamUrl does unwrap, so it takes the original.
  const [item, downloadUrl] = await Promise.all([
    resolveShareUrlToItem(target).catch(() => null),
    getSharePointStreamUrl(recordingUrl),
  ]);

  const size = item?.size ?? null;
  if (!size || size <= 0) {
    // Uploading without a known total is not worth 1600 units on a guess.
    throw new Error('RECORDING_SIZE_UNKNOWN');
  }

  return { downloadUrl, size, itemId: item?.id ?? null, name: item?.name ?? null };
}

/**
 * Fetch exactly [start, start+length) bytes.
 *
 * Tops up short reads. A server may legally answer a Range request with fewer
 * bytes than asked for, and a short slice that is not the final one would be a
 * non-256KB-multiple chunk, which Google rejects outright. Looping here is
 * cheaper than discovering that at the upload boundary.
 *
 * Throws RANGE_NOT_SUPPORTED on a 200, which would mean the server ignored the
 * header and is streaming the whole file: reading that into a slice buffer would
 * quietly allocate hundreds of megabytes.
 */
export async function fetchSlice(
  downloadUrl: string,
  start: number,
  length: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let filled = 0;

  while (filled < length) {
    const from = start + filled;
    const to = start + length - 1;
    const res = await fetchImpl(downloadUrl, { headers: { Range: `bytes=${from}-${to}` } });

    if (res.status === 200) throw new Error('RANGE_NOT_SUPPORTED');
    if (res.status !== 206) throw new Error(`RANGE_FETCH_${res.status}`);

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('RANGE_FETCH_EMPTY');

    out.set(buf.subarray(0, Math.min(buf.length, length - filled)), filled);
    filled += buf.length;
  }

  return filled === length ? out : out.subarray(0, filled);
}
