'use client';

/**
 * "Watch before class" in Add Class and Edit Class.
 *
 * As the teacher types the class title (or picks the course topic), the best
 * matching past classes and Library videos appear as suggestions. Nothing is
 * attached until they tap one, so a weak match costs a glance, never a wrong
 * video in front of students. "Find a video" opens the full picker.
 *
 * Holds candidates, not ids, so the picked rows can show their thumbnail and
 * title without another request. The dialog sends `{ kind, id }` on save.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Skeleton, Typography, useTheme } from '@neram/ui';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { RADIUS } from '../timetable-theme';
import PrewatchVideoRow from './PrewatchVideoRow';
import PrewatchPickerDialog from './PrewatchPickerDialog';
import { fetchPrewatchCandidates } from './prewatch-client';
import { PREWATCH_MAX } from '@/lib/prewatch';
import type { PrewatchCandidate } from '@/lib/prewatch-suggest';

interface PrewatchFieldProps {
  value: PrewatchCandidate[];
  onChange: (next: PrewatchCandidate[]) => void;
  /** The class title as typed, the main thing suggestions match on. */
  title: string;
  courseTopicId?: string | null;
  classroomIds?: string[];
  /** In edit mode, the class itself, which is never offered to itself. */
  excludeClassId?: string | null;
  getToken: () => Promise<string | null>;
  /** Edit mode, while the current list loads. */
  loading?: boolean;
}

const MIN_TITLE = 3;

export default function PrewatchField({
  value,
  onChange,
  title,
  courseTopicId,
  classroomIds,
  excludeClassId,
  getToken,
  loading = false,
}: PrewatchFieldProps) {
  const theme = useTheme();
  const [suggestions, setSuggestions] = useState<PrewatchCandidate[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const full = value.length >= PREWATCH_MAX;
  const pickedKeys = useMemo(() => value.map((v) => v.key), [value]);
  const trimmedTitle = title.trim();
  const roomsKey = (classroomIds || []).join(',');
  const pickedKey = pickedKeys.join(',');
  const canSuggest = trimmedTitle.length >= MIN_TITLE || !!courseTopicId;

  // Suggestions follow the title and topic, 400ms after the last keystroke.
  useEffect(() => {
    if (!canSuggest || full) {
      setSuggestions([]);
      setSuggesting(false);
      return;
    }
    const controller = new AbortController();
    setSuggesting(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchPrewatchCandidates(
          {
            q: trimmedTitle,
            courseTopicId,
            classroomIds: roomsKey ? roomsKey.split(',') : [],
            excludeClassId,
            exclude: pickedKey ? pickedKey.split(',') : [],
          },
          () => getTokenRef.current(),
          controller.signal,
        );
        setSuggestions(data.suggestions);
      } catch (err) {
        // Suggestions are a nicety: a failure leaves the picker, never an error.
        if ((err as Error)?.name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggesting(false);
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [canSuggest, full, trimmedTitle, courseTopicId, roomsKey, excludeClassId, pickedKey]);

  const add = (c: PrewatchCandidate) => {
    if (full || value.some((v) => v.key === c.key)) return;
    onChange([...value, c]);
  };
  const remove = (key: string) => onChange(value.filter((v) => v.key !== key));

  const freshSuggestions = suggestions.filter((s) => !pickedKeys.includes(s.key));

  return (
    <Box component="section" aria-labelledby="prewatch-field-label">
      <Typography id="prewatch-field-label" variant="subtitle2" sx={{ fontWeight: 700 }}>
        Watch before class (optional)
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Past classes or Library videos for students to watch first. They play inside Nexus, and you see who watched.
      </Typography>

      {loading ? (
        <Skeleton variant="rounded" height={64} sx={{ mb: 1 }} />
      ) : (
        value.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, mb: 1, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {value.map((v) => (
              <Box component="li" key={v.key}>
                <PrewatchVideoRow
                  dense
                  video={v}
                  trailing={
                    <IconButton
                      onClick={() => remove(v.key)}
                      aria-label={`Remove ${v.title}`}
                      sx={{ width: 44, height: 44 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  }
                />
              </Box>
            ))}
          </Box>
        )
      )}

      {!full && canSuggest && (suggesting || freshSuggestions.length > 0) && (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.control,
            p: { xs: 0.75, sm: 1.25 },
            mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
            <AutoAwesomeOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              Suggested for this class
            </Typography>
          </Box>
          {suggesting && !freshSuggestions.length ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }} aria-busy>
              <Skeleton variant="rounded" height={56} />
              <Skeleton variant="rounded" height={56} />
            </Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {freshSuggestions.map((s) => (
                <Box component="li" key={s.key}>
                  <PrewatchVideoRow
                    dense
                    video={s}
                    trailing={
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => add(s)}
                        aria-label={`Add ${s.title}`}
                        sx={{ textTransform: 'none', minHeight: 44, minWidth: 44, px: { xs: 1, sm: 1.5 }, gap: 0.5, borderRadius: RADIUS.control }}
                      >
                        <AddIcon fontSize="small" aria-hidden />
                        {/* Icon only on a phone, where the title needs the width. */}
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                          Add
                        </Box>
                      </Button>
                    }
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      <Button
        variant="text"
        startIcon={<VideoLibraryOutlinedIcon />}
        onClick={() => setPickerOpen(true)}
        disabled={full}
        sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600, ml: -1 }}
      >
        {full ? `${PREWATCH_MAX} videos picked` : value.length ? 'Find another video' : 'Find a video'}
      </Button>

      <PrewatchPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={value}
        onDone={onChange}
        context={{ q: trimmedTitle, courseTopicId, classroomIds, excludeClassId }}
        getToken={getToken}
      />
    </Box>
  );
}
