'use client';

/**
 * One cache for everything the class panel reads.
 *
 * Every section in the timetable drawer used to own a bare `fetch` into its own
 * `useState`, and the tab body is a ternary, so only the active tab is mounted.
 * Switching Prep to After and back destroyed all of it and re-ran four requests,
 * which is the spinner a teacher saw on every single tab press. Closing the
 * drawer threw it away too, so reopening the same class paid the same cost again.
 *
 * SWR fixes that at the layer where it belongs. The cache is module level, so it
 * outlives any unmount: a revisited tab paints from cache on the first frame and
 * revalidates quietly behind it. Two components asking for the same URL in the
 * same tick get one request, which is what finally kills the duplicate wrap-up
 * and images calls that ClassCaptureView and WrapUpSection were both making.
 *
 * Nexus routes are all bearer-authenticated, so the fetcher has to carry a token
 * and the token is resolved per request rather than baked into the key. Baking it
 * in would put a JWT in the cache key and re-key the whole cache on every silent
 * refresh.
 */

import { useEffect, useRef } from 'react';
import useSWR, { mutate as globalMutate, type SWRConfiguration, type SWRResponse } from 'swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export type GetToken = () => Promise<string | null>;

/** Carries the HTTP status, so a caller can tell 404 from 500 without parsing. */
export class NexusFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'NexusFetchError';
  }
}

/**
 * GET a Nexus API route with the caller's bearer token.
 *
 * Throws on a non-2xx rather than returning a shape, because SWR distinguishes
 * "errored" from "resolved to nothing" only by the throw, and a section that
 * silently rendered its empty state on a 500 is how a teacher ends up believing
 * a class has no assignments.
 */
export async function fetchWithToken<T>(url: string, getToken: GetToken): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new NexusFetchError(
      (json as { error?: string })?.error || `Request failed (${res.status})`,
      res.status,
    );
  }
  return json as T;
}

/**
 * The hook every panel section uses.
 *
 * Pass `null` as the key to skip the request entirely, which is how a section
 * behind a collapse or a feature flag stays free until it is actually opened.
 */
export function useNexusSWR<T>(
  key: string | null,
  getToken: GetToken,
  options?: SWRConfiguration<T, NexusFetchError>,
): SWRResponse<T, NexusFetchError> {
  return useSWR<T, NexusFetchError>(
    key,
    (url: string) => fetchWithToken<T>(url, getToken),
    options,
  );
}

/**
 * `useNexusSWR` without having to hand it a token getter.
 *
 * The token has to come from the auth context, so every call site was writing the same
 * two lines to fetch it before it could ask for anything. That friction is the reason
 * most of the app is still on hand-rolled `useEffect` fetches: converting a screen
 * should be deleting code, not adding a hook to thread a dependency through.
 *
 * Pass `null` as the key to skip the request, which is how a screen waits for the
 * classroom id (or a feature flag, or an open accordion) before it costs anything.
 *
 * Deliberately a separate file-local hook rather than a change to `useNexusSWR`: the
 * class-panel sections already pass their own getter and must keep working untouched.
 */
export function useAuthSWR<T>(
  key: string | null,
  options?: SWRConfiguration<T, NexusFetchError>,
): SWRResponse<T, NexusFetchError> {
  const { getToken } = useNexusAuthContext();
  return useNexusSWR<T>(key, getToken, options);
}

/**
 * Refetch when the parent bumps its manual cache-bust counter.
 *
 * The timetable page has carried a `refreshKey` prop since long before this
 * cache existed: it is how a dialog that saved something tells four sibling
 * sections to reload. Reading it here keeps that contract intact, and the ref
 * guard is what stops the very first render from firing a second request on top
 * of the one SWR has already started.
 */
export function useRefreshKey(refreshKey: number | undefined, mutate: () => void): void {
  const seen = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === seen.current) return;
    seen.current = refreshKey;
    mutate();
  }, [refreshKey, mutate]);
}

/**
 * Drop every cached read for one class, so the next render refetches.
 *
 * Call this after any write that could change more than the section that made
 * it: saving a prep test moves the prep roster, publishing a listing changes the
 * class row the wrap-up reads. Matching on the class id rather than naming each
 * route means a new section added later is invalidated without anyone
 * remembering to come back here.
 */
export function revalidateClass(classId: string): Promise<unknown> {
  // One argument on purpose. Passing `undefined` as the second would BLANK every
  // matching entry before refetching, which flips `isLoading` back to true and
  // replaces the section the teacher is looking at with a spinner for the length
  // of a round trip. The single-argument form refetches underneath the data
  // already on screen.
  return globalMutate((key) => typeof key === 'string' && key.includes(`/api/timetable/${classId}`));
}
