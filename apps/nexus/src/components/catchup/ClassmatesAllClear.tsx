'use client';

/**
 * The classmates who have nothing left to catch up on.
 *
 * The only place in Nexus where a student sees another student's name, and the
 * reason it earns that exception is that the list is the whole mechanism. A
 * count of your own backlog tells you what you owe; seeing eleven people who
 * have cleared theirs tells you it is normal to finish, which is the thing that
 * actually moves somebody to open a recap on a Sunday.
 *
 * What keeps it from being a scoreboard:
 *
 * There is no complement anywhere on this screen. Nobody is told how many people
 * are behind, and no student can work out from this card whether a specific
 * classmate is on the wrong side of it, because "not shown" also covers a
 * dormant student, a late enrolment and a cold cache.
 *
 * Nothing is ranked or numbered. It is a set, in most-recently-finished order,
 * with no positions and no counts beside anybody's name.
 *
 * And it renders nothing when it is empty. An empty wall reading "nobody has
 * caught up yet" would be a public statement about the whole cohort.
 */
import { Avatar, AvatarGroup, Box, Paper, Typography, alpha, useTheme } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useAuthSWR } from '@/lib/nexus-swr';

/** Faces before it collapses into "+N". Eight fits one row at 375px. */
const FACES = 8;

interface WallPerson {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export default function ClassmatesAllClear({
  classroomId,
  meId,
}: {
  classroomId: string | null;
  /** The viewer, so their own name can be pointed out rather than hunted for. */
  meId?: string | null;
}) {
  const theme = useTheme();
  const { data } = useAuthSWR<{ allClear: WallPerson[] }>(
    classroomId ? `/api/catchup/wall?classroomId=${classroomId}` : null,
  );

  const people = data?.allClear || [];
  // Also covers the feature being off: the route answers with an empty list
  // rather than an error, so there is exactly one thing to check here.
  if (people.length === 0) return null;

  const includesMe = !!meId && people.some((p) => p.id === meId);
  const faces = people.slice(0, FACES);
  const rest = people.length - faces.length;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(theme.palette.success.main, 0.4),
        bgcolor: alpha(theme.palette.success.main, 0.06),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        {/* An icon as well as the green: colour on its own is not a label. */}
        <EmojiEventsOutlinedIcon
          aria-hidden
          sx={{ fontSize: 28, color: 'success.main', flexShrink: 0 }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700}>
            {people.length === 1
              ? '1 person is fully caught up'
              : `${people.length} people are fully caught up`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {includesMe
              ? 'You are one of them. Nice work.'
              : 'Clear what you have waiting and your name joins them.'}
          </Typography>
        </Box>
      </Box>

      {/*
        Faces first, then names. The row wraps rather than scrolling sideways,
        because a horizontally scrolling list on a dashboard hides most of itself
        on the one viewport most of these students are using.
      */}
      <AvatarGroup
        max={FACES + 1}
        sx={{
          justifyContent: 'flex-start',
          mb: 1,
          '& .MuiAvatar-root': { width: 32, height: 32, fontSize: '0.8rem' },
        }}
      >
        {faces.map((p) => (
          <StudentAvatar
            key={p.id}
            userId={p.id}
            src={p.avatar_url}
            name={p.name || ''}
            size={32}
          />
        ))}
        {/* A bare Avatar with no src is an icon badge, not a face, so it does
            not belong to StudentAvatar. */}
        {rest > 0 && <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>+{rest}</Avatar>}
      </AvatarGroup>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {people.map((p) => p.name || 'A classmate').join(', ')}
      </Typography>
    </Paper>
  );
}
