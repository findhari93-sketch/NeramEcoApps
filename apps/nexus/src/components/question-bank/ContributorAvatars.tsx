'use client';

import { Tooltip, Typography, Box } from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';

/**
 * Who recalled this paper, as faces.
 *
 * Students wear the info ring, staff do not: StudentAvatar looks each id up in
 * the session-wide lookup and falls back to a plain avatar for anyone it does
 * not recognise, which is exactly right in a list that mixes both. The tooltip
 * still names the role, so a bare face never has to be guessed at.
 *
 * This used to be a MUI AvatarGroup of hand-coloured initials. The overlap
 * saved a little width and cost the ring, which is the wrong trade on the one
 * surface where you want to know whose recall you are reading.
 */
interface Contributor {
  /** users.id. What the ring is looked up by. */
  user_id?: string | null;
  display_name: string;
  role: 'student' | 'teacher' | 'admin';
}

interface ContributorAvatarsProps {
  contributors: Contributor[];
  max?: number;
  size?: number;
}

export default function ContributorAvatars({ contributors, max = 4, size = 28 }: ContributorAvatarsProps) {
  const shown = contributors.slice(0, max);
  const extra = contributors.length - shown.length;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
      {shown.map((c, i) => (
        <Tooltip key={c.user_id || `${c.display_name}-${i}`} title={`${c.display_name} (${c.role})`} arrow>
          {/* The span gives Tooltip a DOM node to anchor to without wrapping the ring in another box. */}
          <Box component="span" sx={{ display: 'inline-flex' }}>
            <StudentAvatar userId={c.user_id} name={c.display_name} size={size} tapToView={false} />
          </Box>
        </Tooltip>
      ))}
      {extra > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          +{extra}
        </Typography>
      )}
      {extra === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, minWidth: 0 }} noWrap>
          {contributors.map((c) => c.display_name.split(' ')[0]).join(', ')}
        </Typography>
      )}
    </Box>
  );
}
