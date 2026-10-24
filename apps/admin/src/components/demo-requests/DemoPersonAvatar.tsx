'use client';

/**
 * PersonAvatar for a demo request.
 *
 * A request made from the student's own account looks its person up by user_id,
 * like any other list. A request made from a parent's account (or added by staff
 * with no account at all) must not borrow that account's photo or ring, so it
 * draws initials, takes its ring from what the desk already knows (gold once the
 * fee is recorded or they were a student before) and guesses the language from
 * the request's own city and site language.
 */
import type { DemoRequest } from './types';
import PersonAvatar from '@/components/person/PersonAvatar';
import type { DemoEnrolment } from './journey';

export default function DemoPersonAvatar({
  request,
  enrolment,
  size = 36,
}: {
  request: Pick<DemoRequest, 'name' | 'user_id' | 'account_holder' | 'city' | 'preferred_language'>;
  enrolment?: DemoEnrolment | null;
  size?: number;
}) {
  const ownAccount = request.account_holder !== 'parent' ? request.user_id : null;
  const studentByDesk = enrolment?.kind === 'enrolled' || enrolment?.kind === 'student_before';
  return (
    <PersonAvatar
      userId={ownAccount}
      name={request.name}
      src={ownAccount ? undefined : null}
      size={size}
      place={{ city: request.city, locale: request.preferred_language }}
      ring={ownAccount ? (studentByDesk ? 'student' : undefined) : studentByDesk ? 'student' : 'lead'}
    />
  );
}
