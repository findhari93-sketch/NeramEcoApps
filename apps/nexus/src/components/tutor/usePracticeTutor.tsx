'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { NexusQBQuestionDetail } from '@neram/database';
import { baseIdOf } from '@/lib/practice-atoms';
import { stableHover } from '@/components/assistant/stableHover';
import type { GetToken } from './client';
import { useTutorGate } from './useTutorGate';
import { useTutorSession } from './useTutorSession';
import { setTutorDoor, setTutorPresence } from './tutor-presence';
import TutorButton from './TutorButton';
import TutorPanel from './TutorPanel';
import TutorSheet from './TutorSheet';

/** The address-bar key for "the tutor is open". qb-practice-url passes unknown keys through. */
export const TUTOR_PARAM = 'tutor';

type DetailWithTutor = NexusQBQuestionDetail & { tutor_available?: boolean; question_text_hi?: string | null };

interface UsePracticeTutorOptions {
  currentId: string | null;
  detail: NexusQBQuestionDetail | null;
  /** Two panes (md up): the tutor docks beside the reader; below, a full-screen sheet. */
  docked: boolean;
  lang: 'en' | 'hi';
  getToken: GetToken;
  /**
   * Open another question in the reader, writing the address bar the page's
   * way. `mode` is push (a new history step) or replace (over the tutor's own step).
   */
  openQuestion: (id: string, mode: 'push' | 'replace') => void;
}

export interface PracticeTutor {
  /** For PracticeReader's header, beside the language switch. Null when there is no tutor here. */
  headerAction: ReactNode;
  /** For PracticeReader's body overlay on a phone: the "Back to tutor" pill. */
  bodyOverlay: ReactNode;
  /** The docked panel (two panes), or null while closed. */
  dock: ReactNode;
  /** The phone's sheet; always rendered so it can slide out. Null when docked. */
  sheet: ReactNode;
  /**
   * Wraps the reader's submit: after Check answer succeeds on this question
   * while a tutor session exists for it, the tutor hears `reader_answered`.
   * Grading is untouched; the server reads the attempt it just recorded.
   */
  wrapSubmit: <R>(submit: (id: string, answer: string) => Promise<R>) => (id: string, answer: string) => Promise<R>;
}

function writeTutorParam(mode: 'push' | 'replace', on: boolean) {
  const params = new URLSearchParams(window.location.search);
  if (on) params.set(TUTOR_PARAM, '1');
  else params.delete(TUTOR_PARAM);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  // null state, as the page's own writer does, so Next's useSearchParams follows.
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

const urlSaysOpen = () => {
  const p = new URLSearchParams(window.location.search);
  return p.get(TUTOR_PARAM) === '1' && !!p.get('qid');
};

/**
 * The AI Tutor on the practice screen: who sees the door, where the panel
 * goes at each width, and how it lives in the address bar.
 *
 * Opening pushes `tutor=1`, so a phone's Back closes the tutor and stays on
 * the question; the close button goes back through history for the same
 * result. "Try it myself" on a phone parks the tutor (the conversation stays
 * in memory) and leaves a "Back to tutor" pill in the reader.
 */
export function usePracticeTutor({ currentId, detail, docked, lang, getToken, openQuestion }: UsePracticeTutorOptions): PracticeTutor {
  const gate = useTutorGate();
  const baseId = baseIdOf(currentId);
  const d = detail as DetailWithTutor | null;
  const available = gate && !!d && d.id === baseId && d.tutor_available === true;
  const session = useTutorSession({ questionId: available ? d!.id : null, getToken });

  const [open, setOpen] = useState(false);
  const [parked, setParked] = useState(false);
  const [seenTurns, setSeenTurns] = useState(0);
  const pushedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const showing = open && available;

  // The corner Assistant button steps aside while the tutor is up.
  useEffect(() => {
    setTutorPresence(showing);
  }, [showing]);
  useEffect(() => () => setTutorPresence(false), []);

  // A reload or a shared link with tutor=1 opens it once the question allows.
  const fromLink = useRef<boolean | null>(null);
  useEffect(() => {
    if (fromLink.current === null) fromLink.current = typeof window !== 'undefined' && urlSaysOpen();
    if (fromLink.current && available) {
      fromLink.current = false;
      setOpen(true);
    }
  }, [available]);

  // Back and Forward.
  useEffect(() => {
    const onPop = () => {
      const on = urlSaysOpen();
      pushedRef.current = on;
      setOpen(on);
      if (on) setParked(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Another question: the tutor closes and its pill goes.
  const prevId = useRef(baseId);
  useEffect(() => {
    const prev = prevId.current;
    prevId.current = baseId;
    if (!prev || !baseId || prev === baseId) return;
    setParked(false);
    if (openRef.current) {
      pushedRef.current = false;
      writeTutorParam('replace', false);
      setOpen(false);
    }
  }, [baseId]);

  const openTutor = useCallback(() => {
    if (!urlSaysOpen()) {
      writeTutorParam('push', true);
      pushedRef.current = true;
    }
    setParked(false);
    setOpen(true);
  }, []);

  // The Assistant's "Explain this question" opens the tutor through this door while there is one.
  // Its sheet is closing as this runs, so open on the next tick: the sheet hands focus back first,
  // then the phone's tutor dialog takes it, or (docked, no trap) the docked panel is focused.
  const dockedRef = useRef(docked);
  dockedRef.current = docked;
  const doorQuestion = available ? d!.id : null;
  useEffect(() => {
    if (!doorQuestion) return;
    const door = {
      questionId: doorQuestion,
      open: () => {
        window.setTimeout(() => {
          openTutor();
          if (dockedRef.current) {
            window.setTimeout(() => document.querySelector<HTMLElement>('[data-tutor-dock]')?.focus(), 0);
          }
        }, 0);
      },
    };
    setTutorDoor(door);
    return () => setTutorDoor(null);
  }, [doorQuestion, openTutor]);

  const closeTutor = useCallback(() => {
    if (pushedRef.current) {
      // The popstate handler closes it, so Back and this button agree.
      window.history.back();
      return;
    }
    writeTutorParam('replace', false);
    setOpen(false);
  }, []);

  const tryMyself = useCallback(() => {
    if (docked) return;
    // The press and the tutor's answer to it are both seen: the pill's dot is for what comes after.
    setSeenTurns(session.turns.length + 2);
    setParked(true);
    closeTutor();
  }, [docked, closeTutor, session.turns.length]);

  const openSimilar = useCallback(
    (id: string) => {
      const replace = pushedRef.current;
      pushedRef.current = false;
      setOpen(false);
      setParked(false);
      // Over the tutor's own history step, so Back from the new question
      // returns to the one being taught; otherwise a fresh step.
      writeTutorParam('replace', false);
      openQuestion(id, replace ? 'replace' : 'push');
    },
    [openQuestion],
  );

  // reader_answered, once any turn in flight has landed.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const owed = useRef<string | null>(null);
  useEffect(() => {
    const qid = owed.current;
    if (!qid || session.pending) return;
    if (session.questionId !== qid) {
      owed.current = null;
      return;
    }
    owed.current = null;
    void session.send({ type: 'reader_answered' });
  }, [session.pending, session.questionId, session]);

  const wrapSubmit = useCallback(
    <R,>(submit: (id: string, answer: string) => Promise<R>) =>
      async (id: string, answer: string): Promise<R> => {
        const result = await submit(id, answer);
        const s = sessionRef.current;
        const base = baseIdOf(id) ?? id;
        if (s.questionId === base && s.turns.length > 0) {
          if (s.pending) owed.current = base;
          else void s.send({ type: 'reader_answered' });
        }
        return result;
      },
    [],
  );

  const questionText = d ? (lang === 'hi' && d.question_text_hi ? d.question_text_hi : d.question_text) ?? null : null;
  const unseen = parked && session.turns.length > seenTurns;

  const headerAction = available ? (
    <TutorButton onClick={showing && docked ? closeTutor : openTutor} active={showing} />
  ) : null;

  const bodyOverlay =
    available && parked && !showing && !docked ? (
      <Badge color="error" variant="dot" invisible={!unseen} overlap="circular">
        <Button
          onClick={openTutor}
          variant="contained"
          startIcon={<SchoolOutlinedIcon />}
          aria-label={unseen ? 'Back to tutor, new reply' : 'Back to tutor'}
          sx={{ ...stableHover, minHeight: 44, borderRadius: 22, px: 2.5, textTransform: 'none', fontWeight: 700, boxShadow: 3 }}
        >
          Back to tutor
        </Button>
      </Badge>
    ) : null;

  const panelProps = {
    session,
    onClose: closeTutor,
    getToken,
    questionText,
    onTryMyself: tryMyself,
    onOpenSimilar: openSimilar,
  };

  return {
    headerAction,
    bodyOverlay,
    dock: docked && showing ? <TutorPanel {...panelProps} variant="dock" /> : null,
    sheet: !docked && available ? <TutorSheet {...panelProps} open={showing} /> : null,
    wrapSubmit,
  };
}
