'use client';

import { Box, UserAvatar, type SxProps, type Theme } from '@neram/ui';
import GraphAvatar from '@/components/GraphAvatar';
import StudentStageAvatar from './StudentStageAvatar';
import { useStudentStageFacts } from './StudentStageFactsProvider';

/**
 * A student's face, wearing their cohort, from nothing but their user id.
 *
 * This is the component to reach for anywhere a student is shown. It resolves
 * the classification from the session-wide lookup rather than from the payload
 * of whatever screen it happens to be on, which is what lets the badge appear on
 * a drawing review, a leaderboard row or a comment thread without any of those
 * routes learning about study stages.
 *
 * FALLING BACK IS THE IMPORTANT PART. When the id is not a known active student,
 * or the lookup has not landed yet, or we are on a student-facing page where it
 * is deliberately never fetched, this renders exactly the plain avatar that was
 * there before. So it is safe to swap in at a call site that shows a mix of
 * students and staff (a comment thread, a class channel): teachers keep a bare
 * avatar and only the students gain a ring.
 *
 * The same lookup supplies the PHOTO and the NAME when the caller has neither,
 * which is what lets a screen that knows only a user id draw the real person
 * instead of coloured initials. A caller who passes them still wins; see the
 * resolution rules below.
 *
 * Prefer this over StudentStageAvatar. Use that one directly only where the
 * screen has already loaded the stage itself, as the students list and the
 * attendance register have, and would otherwise be waiting on a second source
 * of truth for something it can already see.
 */

export interface StudentAvatarProps {
  /** users.id. Everything else follows from it. */
  userId?: string | null;
  name?: string | null;
  size?: number;

  /** Present (even as null) selects the live Microsoft Graph photo path. */
  msOid?: string | null;
  fallbackSrc?: string | null;
  presenceStatus?: string | null;

  /** Selects the stored avatar_url path. */
  src?: string | null;
  largeSrc?: string | null;

  clickable?: boolean;
  tapToView?: boolean;
  /** Force the small corner glyph off, e.g. beside a chip that already says it. */
  showGlyph?: boolean;
  /** Styles for the avatar itself, applied whether or not it ends up ringed. */
  sx?: SxProps<Theme>;
}

export default function StudentAvatar({
  userId,
  name,
  size = 40,
  msOid,
  fallbackSrc,
  presenceStatus,
  src,
  largeSrc,
  clickable,
  tapToView,
  showGlyph,
  sx,
}: StudentAvatarProps) {
  const { factsFor } = useStudentStageFacts();
  const facts = factsFor(userId);

  /**
   * A caller who has the photo wins; the lookup only fills a gap.
   *
   * `src={null}` FALLS THROUGH rather than suppressing. Most call sites write
   * `src={row.avatar_url}` off a nullable column, and a null there is the
   * payload saying "I have no photo for this person", not "render none". Reading
   * it as suppression would silently defeat the whole point of the lookup, and
   * the failure would be invisible: a face that stays initials forever. If a
   * caller ever does want to suppress it, `src=""` already works, because both
   * UserAvatar and GraphAvatar do `src={src || undefined}`.
   */
  const resolvedSrc = src ?? facts?.photo ?? null;

  /**
   * Name uses a blank test, NOT `??`. Eight call sites pass
   * `name={student.name || ''}`, and `'' ?? x` is `''`, so `??` would leave every
   * one of them nameless. A deliberate label like "Unknown student" is non-empty
   * so the caller still wins. The trailing `?? name` preserves `''` when the
   * lookup has nothing, keeping those eight byte-identical without a provider.
   */
  const resolvedName = name?.trim() ? name : facts?.name ?? name ?? null;

  if (facts) {
    return (
      <StudentStageAvatar
        stage={facts.stage}
        dormant={facts.dormant}
        name={resolvedName}
        size={size}
        msOid={msOid}
        fallbackSrc={fallbackSrc}
        presenceStatus={presenceStatus}
        src={resolvedSrc}
        largeSrc={largeSrc}
        clickable={clickable}
        tapToView={tapToView}
        showGlyph={showGlyph}
        sx={sx}
      />
    );
  }

  // This branch is only reached when the lookup knew nothing about the id, so
  // `resolvedSrc`/`resolvedName` collapse to the caller's own props. A teacher,
  // an alumnus, a parent or an unknown id therefore cannot gain a face from the
  // lookup: the privacy line holds by construction, not by a guard.
  //
  // `msOid !== undefined` mirrors StudentStageAvatar's rule: passing the prop at
  // all, even as null, is what selects the Graph path. Keeping the two identical
  // means a row does not change which photo source it uses depending on whether
  // the classification happened to have loaded.
  const plain =
    msOid !== undefined ? (
      <GraphAvatar
        msOid={msOid}
        name={resolvedName}
        size={size}
        sx={sx}
        presenceStatus={presenceStatus}
        clickable={clickable}
        tapToView={tapToView}
        fallbackSrc={fallbackSrc ?? resolvedSrc}
      />
    ) : (
      <UserAvatar
        src={resolvedSrc}
        largeSrc={largeSrc}
        name={resolvedName}
        size={size}
        sx={sx}
        clickable={clickable}
        tapToView={tapToView}
      />
    );

  // The ring costs 8px of box, so the unringed case has to reserve it or every
  // list reflows the moment the classification arrives. Reserving it also keeps
  // a mixed list (students beside staff) on one left edge instead of two.
  return (
    <Box
      sx={{
        width: size + 8,
        height: size + 8,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {plain}
    </Box>
  );
}
