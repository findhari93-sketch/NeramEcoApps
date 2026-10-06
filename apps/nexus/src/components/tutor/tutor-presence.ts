'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the AI Tutor panel is open anywhere on the page.
 *
 * The Assistant's corner button sits where the tutor's composer and chips
 * are (bottom right), and two assistants on one screen is one too many, so
 * StudentHelpFab steps aside while this is true. A module store rather than a
 * context: the fab is mounted by the student layout, far above the practice
 * page that opens the tutor.
 */
let open = false;
const listeners = new Set<() => void>();

export function setTutorPresence(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => open;
const readServer = () => false;

export function useTutorPresence(): boolean {
  return useSyncExternalStore(subscribe, read, readServer);
}

/**
 * The tutor's door for the question on screen, so the Assistant's "Explain
 * this question" can open the tutor instead of answering in chat. Set by the
 * practice page only while that question has a live pack and the tutor is on
 * for this student; null everywhere else.
 */
export interface TutorDoor {
  questionId: string;
  open: () => void;
}

let door: TutorDoor | null = null;
const doorListeners = new Set<() => void>();

export function setTutorDoor(next: TutorDoor | null): void {
  if (door === next) return;
  door = next;
  doorListeners.forEach((l) => l());
}

function subscribeDoor(listener: () => void) {
  doorListeners.add(listener);
  return () => doorListeners.delete(listener);
}

const readDoor = () => door;
const readDoorServer = () => null;

export function useTutorDoor(): TutorDoor | null {
  return useSyncExternalStore(subscribeDoor, readDoor, readDoorServer);
}
