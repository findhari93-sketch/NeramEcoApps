'use client';

import { useCallback, useRef, useState } from 'react';
import DuplicateConfirmSheet, { type DuplicateCandidate } from './DuplicateConfirmSheet';

export interface DirectoryPerson {
  ms_oid: string;
  name: string;
  email: string;
}

export interface EnrollOutcome {
  /** ms_oids now enrolled. */
  added: string[];
  /** ms_oids the teacher chose to skip at the duplicate question. */
  skipped: string[];
  /** One readable sentence per failure. */
  errors: string[];
}

type Decision = { action: 'link'; userId: string } | { action: 'new' } | { action: 'skip' };

interface PendingQuestion {
  person: DirectoryPerson;
  candidates: DuplicateCandidate[];
}

/**
 * Enrolls Microsoft directory accounts one at a time, pausing to ask when the
 * server says an account may belong to a student already enrolled without one.
 * The server refuses to guess, so every add flow asks the same question.
 */
export function useDirectoryEnroll({
  classroomId,
  getToken,
  role = 'student',
  batchId = null,
}: {
  classroomId: string;
  getToken: () => Promise<string | null>;
  role?: 'student' | 'teacher';
  batchId?: string | null;
}) {
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const resolveDecision = useRef<((decision: Decision) => void) | null>(null);

  const ask = useCallback(
    (question: PendingQuestion) =>
      new Promise<Decision>((resolve) => {
        resolveDecision.current = resolve;
        setPending(question);
      }),
    [],
  );

  const answer = useCallback((decision: Decision) => {
    resolveDecision.current?.(decision);
    resolveDecision.current = null;
    setPending(null);
  }, []);

  const enroll = useCallback(
    async (people: DirectoryPerson[]): Promise<EnrollOutcome> => {
      const outcome: EnrollOutcome = { added: [], skipped: [], errors: [] };

      const post = async (person: DirectoryPerson, extra: Record<string, unknown> = {}) => {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Sign in again.');
        return fetch(`/api/classrooms/${classroomId}/enrollments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            batch_id: batchId,
            ms_oid: person.ms_oid,
            name: person.name,
            email: person.email,
            user_type: role,
            ...extra,
          }),
        });
      };

      const errorOf = async (res: Response) => {
        const data = await res.json().catch(() => ({}));
        return typeof data?.error === 'string' ? data.error : 'Could not add.';
      };

      // One at a time on purpose: a question pauses the run, and the answer for
      // one account must never be applied to the next.
      for (const person of people) {
        let res = await post(person);

        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data?.error !== 'possible_duplicate' || !Array.isArray(data.candidates)) {
            outcome.errors.push(`${person.name}: ${typeof data?.error === 'string' ? data.error : 'Could not add.'}`);
            continue;
          }
          const decision = await ask({ person, candidates: data.candidates });
          if (decision.action === 'skip') {
            outcome.skipped.push(person.ms_oid);
            continue;
          }
          res = await post(
            person,
            decision.action === 'link' ? { link_user_id: decision.userId } : { confirm_new: true },
          );
        }

        if (res.ok) outcome.added.push(person.ms_oid);
        else outcome.errors.push(`${person.name}: ${await errorOf(res)}`);
      }

      return outcome;
    },
    [ask, batchId, classroomId, getToken, role],
  );

  const dialog = (
    <DuplicateConfirmSheet
      open={!!pending}
      personName={pending?.person.name ?? ''}
      personEmail={pending?.person.email ?? ''}
      candidates={pending?.candidates ?? []}
      onLink={(userId) => answer({ action: 'link', userId })}
      onCreateNew={() => answer({ action: 'new' })}
      onSkip={() => answer({ action: 'skip' })}
    />
  );

  return { enroll, dialog };
}
