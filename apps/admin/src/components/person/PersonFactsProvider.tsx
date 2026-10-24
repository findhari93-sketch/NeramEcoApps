'use client';

/**
 * The facts every PersonAvatar on screen needs, fetched together.
 *
 * Each avatar asks for its person by id (or, for a demo request with no account,
 * by place). The store collects every ask made within 50ms, sends them in one
 * POST /api/people/facts, and keeps the answers for the session, so a list of
 * 50 rows costs one call and going back to it costs none.
 *
 * Mounted once in the dashboard layout. Without it (a test, a stray page) the
 * hook simply returns nothing and avatars render with no ring and no mark.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { LanguageGuess, PersonFacts } from '@/lib/person-avatar';

export interface PersonPlace {
  city?: string | null;
  state?: string | null;
  locale?: string | null;
}

const BATCH_MS = 50;

export function placeKeyOf(place: PersonPlace | null | undefined): string | null {
  if (!place) return null;
  const parts = [place.city, place.state, place.locale].map((p) => (p ?? '').trim().toLowerCase());
  return parts.some(Boolean) ? parts.join('|') : null;
}

class PersonFactsStore {
  private people = new Map<string, PersonFacts>();
  private places = new Map<string, LanguageGuess | null>();
  private requested = new Set<string>();
  private queuedIds = new Set<string>();
  private queuedPlaces = new Map<string, PersonPlace>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  person(id: string): PersonFacts | undefined {
    return this.people.get(id);
  }

  place(key: string): LanguageGuess | null | undefined {
    return this.places.get(key);
  }

  request(id: string | null | undefined, place: PersonPlace | null | undefined) {
    if (id && !this.requested.has(id)) {
      this.requested.add(id);
      this.queuedIds.add(id);
    }
    const key = placeKeyOf(place);
    if (key && !this.requested.has(`place:${key}`)) {
      this.requested.add(`place:${key}`);
      this.queuedPlaces.set(key, place!);
    }
    if ((this.queuedIds.size || this.queuedPlaces.size) && !this.timer) {
      this.timer = setTimeout(() => void this.flush(), BATCH_MS);
    }
  }

  /**
   * An editor's optimistic write. `refetch` asks the server again, once a save
   * has landed: a cleared language or class brings back the guess, or what
   * their application said, which only the server can work out.
   */
  update(id: string, patch: Partial<PersonFacts>, refetch = false) {
    const current = this.people.get(id);
    if (current) this.people.set(id, { ...current, ...patch });
    if (refetch) {
      this.requested.delete(id);
      this.request(id, null);
    }
    this.emit();
  }

  private emit() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  private async flush() {
    this.timer = null;
    const ids = Array.from(this.queuedIds);
    const places = Array.from(this.queuedPlaces, ([key, p]) => ({ key, ...p }));
    this.queuedIds.clear();
    this.queuedPlaces.clear();
    try {
      const res = await fetch('/api/people/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, places }),
      });
      if (!res.ok) throw new Error(`people/facts ${res.status}`);
      const data = (await res.json()) as {
        people?: Record<string, PersonFacts>;
        places?: Record<string, LanguageGuess | null>;
      };
      for (const [id, facts] of Object.entries(data.people ?? {})) this.people.set(id, facts);
      for (const [key, guess] of Object.entries(data.places ?? {})) this.places.set(key, guess);
      this.emit();
    } catch {
      // Let the next render ask again rather than leave these people blank for the session.
      ids.forEach((id) => this.requested.delete(id));
      places.forEach((p) => this.requested.delete(`place:${p.key}`));
    }
  }
}

const PersonFactsContext = createContext<PersonFactsStore | null>(null);

export function PersonFactsProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new PersonFactsStore(), []);
  return <PersonFactsContext.Provider value={store}>{children}</PersonFactsContext.Provider>;
}

const noopSubscribe = () => () => {};
const zero = () => 0;

/**
 * The facts for one person (by id) and the language guess for a place, once
 * loaded. Undefined while loading or when there is no provider.
 */
export function usePersonFacts(
  userId: string | null | undefined,
  place?: PersonPlace | null,
): { facts: PersonFacts | undefined; placeGuess: LanguageGuess | null | undefined } {
  const store = useContext(PersonFactsContext);
  useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getVersion ?? zero, zero);

  const key = placeKeyOf(place);
  const city = place?.city;
  const state = place?.state;
  const locale = place?.locale;
  useEffect(() => {
    store?.request(userId, key ? { city, state, locale } : null);
  }, [store, userId, key, city, state, locale]);

  return {
    facts: userId ? store?.person(userId) : undefined,
    placeGuess: key ? store?.place(key) : undefined,
  };
}

/** For the editors: write through to every avatar of this person on screen. */
export function useUpdatePersonFacts(): (id: string, patch: Partial<PersonFacts>, refetch?: boolean) => void {
  const store = useContext(PersonFactsContext);
  return useCallback((id, patch, refetch) => store?.update(id, patch, refetch), [store]);
}
