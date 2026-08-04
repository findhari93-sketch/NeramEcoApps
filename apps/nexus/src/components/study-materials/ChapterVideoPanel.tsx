'use client';

/**
 * The "how do I finish this chapter" strip at the bottom of a Foundation
 * chapter.
 *
 * A chapter is complete when the student has watched one recording all the way
 * through, in EITHER language, and then passed the chapter test. This shows them
 * where they are in that, and it is the only place the two halves are explained
 * as one thing.
 *
 * Only recordings that actually exist appear. Chapters are being filled in one
 * language at a time, so a chapter with a single track has to read as normal
 * rather than as half-broken: the picker simply shows one button.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Chip, Skeleton, alpha, useTheme } from '@neram/ui';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';

export interface ChapterVideoState {
  tracks: {
    id: string;
    language: string;
    language_label: string;
    section_count: number;
    progress_status: 'in_progress' | 'completed' | 'locked' | null;
  }[];
  video_completed_at: string | null;
  video_language: string | null;
  test_passed_at: string | null;
  completed_at: string | null;
  requires_video: boolean;
}

interface Props {
  fileId: string;
  hasTest: boolean;
  bestScorePct: number | null;
  getToken: () => Promise<string | null>;
  onTakeTest: () => void;
  onPractise?: () => void;
}

export default function ChapterVideoPanel({
  fileId,
  hasTest,
  bestScorePct,
  getToken,
  onTakeTest,
  onPractise,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [state, setState] = useState<ChapterVideoState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/student/study-videos/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setState(await res.json());
    } catch {
      // A chapter with no video is the common case and not worth an error here:
      // the footer just falls back to the plain test prompt.
    } finally {
      setLoading(false);
    }
  }, [fileId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Skeleton variant="rounded" height={64} />;

  const videoDone = !!state?.video_completed_at;
  const chapterDone = !!state?.completed_at;
  const needsVideo = !!state?.requires_video && !videoDone;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {/* Language picker. Absent entirely when the chapter has no recordings. */}
      {!!state?.tracks.length && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {videoDone ? 'Watch again' : 'Watch the class'}
          </Typography>
          {state.tracks.map((t) => {
            const done = t.progress_status === 'completed';
            return (
              <Button
                key={t.id}
                size="small"
                variant={done ? 'outlined' : 'contained'}
                color={done ? 'success' : 'primary'}
                startIcon={done ? <ReplayRoundedIcon /> : <SmartDisplayOutlinedIcon />}
                onClick={() => router.push(`/student/study-materials/watch/${t.id}`)}
                sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
              >
                {t.language_label}
                {t.progress_status === 'in_progress' && ' (continue)'}
              </Button>
            );
          })}
          {videoDone && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`Watched in ${
                state.tracks.find((t) => t.language === state.video_language)?.language_label ||
                state.video_language
              }`}
            />
          )}
        </Box>
      )}

      {/* Where the chapter stands. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: alpha(
            chapterDone ? theme.palette.success.main : theme.palette.text.primary,
            0.05,
          ),
        }}
      >
        {chapterDone ? (
          <>
            <CheckCircleIcon sx={{ color: 'success.main' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} color="success.main">
                Chapter completed
              </Typography>
              {bestScorePct != null && (
                <Typography variant="caption" color="text.secondary">
                  Best score {Math.round(bestScorePct)}%
                </Typography>
              )}
            </Box>
            {hasTest && onPractise && (
              // Practice, kept apart from the record. The server refuses a
              // revision attempt on a chapter that is not complete, so this
              // button is the only way in and it only exists here.
              <Button
                size="small"
                variant="text"
                onClick={onPractise}
                sx={{ textTransform: 'none', flexShrink: 0, minHeight: 44 }}
              >
                Practise the questions
              </Button>
            )}
          </>
        ) : needsVideo ? (
          <>
            <LockOutlinedIcon sx={{ color: 'text.disabled' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>
                Watch a recording to unlock the test
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Either language counts. You only need to watch one.
              </Typography>
            </Box>
          </>
        ) : hasTest ? (
          <>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>
                {videoDone ? 'Recording finished. One step left.' : 'Ready to complete this chapter?'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pass the short test to mark it completed.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<QuizOutlinedIcon />}
              onClick={onTakeTest}
              sx={{ textTransform: 'none', flexShrink: 0, minHeight: 44 }}
            >
              Take test
            </Button>
          </>
        ) : (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              Test coming soon
            </Typography>
            <Typography variant="caption" color="text.secondary">
              A test will be added so you can complete this chapter.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
