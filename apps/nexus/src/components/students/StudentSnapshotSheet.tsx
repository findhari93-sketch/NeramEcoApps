'use client';

/**
 * The student snapshot: what opens when a teacher taps a student's face.
 *
 * It answers "how is this student doing" in one look, without leaving the
 * screen: the overall level (the bars on their avatar), then each skill that
 * counts for their exam, then their latest drawings. Managers change the drawing
 * level here; teachers read it.
 *
 * A bottom sheet on a phone (thumb reach, the screen stays visible behind it), a
 * right drawer from md up. Staff only: mounted by StudentSnapshotProvider in the
 * teacher layout.
 */
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import { useAuthSWR } from '@/lib/nexus-swr';
import { snapshotKey } from '@/lib/student-level-client';
import {
  LEVEL_LABEL,
  LEVEL_MEANING,
  NOT_RATED_LABEL,
  SKILLS,
  overallBasis,
  type SkillDef,
} from '@/lib/student-level';
import { STAGE_LABEL } from '@/lib/student-stage';
import { languageLabelOf } from '@/lib/student-language';
import type { StudentSnapshotPayload } from '@/lib/student-level-types';
import DrawingLevelControl from './DrawingLevelControl';
import { LevelBars } from './LevelMark';
import StudentAvatar from './StudentAvatar';
import { useStudentStageFacts } from './StudentStageFactsProvider';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const shortDay = (iso: string) => dateFmt.format(new Date(iso));

function examLabel(skill: SkillDef): string {
  return skill.exams.length === 2 ? 'JEE and NATA' : skill.exams[0] === 'jee' ? 'JEE only' : 'NATA only';
}

export default function StudentSnapshotSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { factsFor } = useStudentStageFacts();
  const fact = factsFor(userId);
  const name = fact?.name || 'Student';
  const { data, error, isLoading, mutate } = useAuthSWR<StudentSnapshotPayload>(snapshotKey(userId), {
    revalidateOnFocus: false,
  });

  // The live level comes from the session lookup, so it moves the instant a
  // manager changes it here; the payload adds who set it and when.
  const overall = fact?.overallLevel ?? null;
  const drawingDetail = data?.levels.drawing;
  const language = fact && fact.language !== 'english' ? languageLabelOf(fact.language) : null;

  return (
    <Drawer
      anchor={wide ? 'right' : 'bottom'}
      open
      onClose={onClose}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-label': `${name}, snapshot`,
        'data-testid': 'student-snapshot',
        sx: wide
          ? { width: 420, maxWidth: '100%' }
          : { maxHeight: '88dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
      } as any}
    >
      <Box sx={{ overflowY: 'auto', pb: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        {!wide && (
          <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
        )}

        {/* Who */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, pt: 1.5, pb: 2 }}>
          {/* Tapping the big face opens the photo; it is already this student's snapshot. */}
          <StudentAvatar userId={userId} name={name} size={56} snapshot={false} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[fact ? STAGE_LABEL[fact.stage] : null, language, fact?.dormant ? 'Paused' : null]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close snapshot" sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Overall */}
        <Box
          sx={{
            mx: 2,
            p: 2,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
          }}
          data-testid="snapshot-overall"
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              bgcolor: overall ? 'primary.main' : 'action.hover',
              color: overall ? 'primary.contrastText' : 'text.secondary',
            }}
          >
            {overall ? (
              <LevelBars level={overall} size={30} emptyColor={alpha(theme.palette.primary.contrastText, 0.4)} />
            ) : (
              <Typography sx={{ fontWeight: 800 }}>?</Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, letterSpacing: '0.08em' }}>
              Overall level
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
              {overall ? LEVEL_LABEL[overall] : NOT_RATED_LABEL}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {overall ? `${LEVEL_MEANING[overall]} ${overallBasis()}` : 'No level yet. It comes from drawing for now.'}
            </Typography>
          </Box>
        </Box>

        {/* Per skill */}
        <Typography
          variant="overline"
          color="text.secondary"
          component="h3"
          sx={{ display: 'block', px: 2, pt: 2.5, pb: 0.5, letterSpacing: '0.08em' }}
        >
          By skill
        </Typography>
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ px: 2 }}>
          {SKILLS.map((skill) => (
            <Box key={skill.key} sx={{ py: 1.5 }} data-testid={`snapshot-skill-${skill.key}`}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{skill.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {examLabel(skill)}
                  </Typography>
                </Box>
                {skill.key === 'drawing' ? (
                  <DrawingLevelControl studentId={userId} studentName={name} source="snapshot" compact />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Not tracked yet
                  </Typography>
                )}
              </Stack>

              {skill.key === 'drawing' && (
                <Box sx={{ mt: 1 }}>
                  {isLoading && (
                    <>
                      <Skeleton width="60%" height={20} />
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={i} variant="rounded" sx={{ flex: 1, aspectRatio: '1', height: 'auto' }} />
                        ))}
                      </Stack>
                    </>
                  )}
                  {error && (
                    <Alert
                      severity="warning"
                      action={
                        <Button color="inherit" size="small" onClick={() => mutate()} sx={{ minHeight: 36 }}>
                          Retry
                        </Button>
                      }
                    >
                      Could not load the drawings.
                    </Alert>
                  )}
                  {data && (
                    <>
                      {drawingDetail && (
                        <Typography variant="body2" color="text.secondary">
                          Set by {drawingDetail.setBy?.name?.split(' ')[0] || 'staff'} on {shortDay(drawingDetail.setAt)}
                          {drawingDetail.note ? `. ${drawingDetail.note}` : ''}
                        </Typography>
                      )}
                      {data.recentDrawings.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mt: 1 }}>
                          {data.recentDrawings.map((d) => (
                            <Box
                              key={d.id}
                              component={Link}
                              href={`/teacher/sketchbook/${userId}/${d.id}`}
                              onClick={onClose}
                              aria-label={`Drawing from ${shortDay(d.submittedAt)}`}
                              sx={{
                                display: 'block',
                                aspectRatio: '1',
                                borderRadius: 1.5,
                                overflow: 'hidden',
                                bgcolor: 'action.hover',
                                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                              }}
                            >
                              <Box
                                component="img"
                                src={d.thumbUrl}
                                alt=""
                                loading="lazy"
                                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          No drawings yet.
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Stack>

        {/* Where to go next */}
        <Stack direction="row" spacing={1} sx={{ px: 2, pt: 2 }}>
          <Button
            component={Link}
            href={`/teacher/students/${userId}`}
            onClick={onClose}
            variant="contained"
            sx={{ flex: 1, minHeight: 48 }}
          >
            Open profile
          </Button>
          <Button
            component={Link}
            href={`/teacher/sketchbook/${userId}`}
            onClick={onClose}
            variant="outlined"
            sx={{ flex: 1, minHeight: 48 }}
          >
            Sketchbook
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
