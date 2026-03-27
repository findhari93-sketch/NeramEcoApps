'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Select,
  MenuItem,
  Skeleton,
  Drawer,
  IconButton,
  Button,
} from '@neram/ui';
import { neramTokens, neramFontFamilies } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AddIcon from '@mui/icons-material/Add';
import type { LeaderboardEntry } from '@neram/database/types';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import LeaderboardTopThree from './LeaderboardTopThree';
import LeaderboardRow from './LeaderboardRow';
import LeaderboardYourRank from './LeaderboardYourRank';

type Period = 'weekly' | 'monthly' | 'alltime';

interface Batch {
  id: string;
  name: string;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  period: string;
  totalStudents: number;
}

interface LeaderboardPageProps {
  variant: 'student' | 'teacher';
}

export default function LeaderboardPage({ variant }: LeaderboardPageProps) {
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [period, setPeriod] = useState<Period>('weekly');
  const [batchId, setBatchId] = useState<string>('all');
  const [batches, setBatches] = useState<Batch[]>([]);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Fetch batches
  useEffect(() => {
    if (!activeClassroom) return;

    let cancelled = false;

    async function fetchBatches() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(
          `/api/classrooms/batches?classroom_id=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setBatches(data.batches || []);
          }
        }
      } catch {
        // Batch fetching is optional, silently fail
      }
    }

    fetchBatches();
    return () => {
      cancelled = true;
    };
  }, [activeClassroom, getToken]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    if (!activeClassroom) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        period,
        classroom_id: activeClassroom.id,
      });
      if (batchId !== 'all') {
        params.set('batch_id', batchId);
      }

      const res = await fetch(`/api/gamification/leaderboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load leaderboard (${res.status})`);
      }

      const data: LeaderboardResponse = await res.json();
      setEntries(data.entries || []);
      setMyRank(data.myRank || null);
      setTotalStudents(data.totalStudents || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, period, batchId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Split entries: top 3 and rest
  const topThree = entries.filter((e) => e.rank <= 3);
  const restEntries = entries.filter((e) => e.rank > 3);

  const handlePeriodChange = useCallback((_: React.SyntheticEvent, value: number) => {
    const periods: Period[] = ['weekly', 'monthly', 'alltime'];
    setPeriod(periods[value] || 'weekly');
  }, []);

  const handleBatchChange = useCallback(
    (e: { target: { value: string } }) => {
      setBatchId(e.target.value);
    },
    []
  );

  const handleRowClick = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedStudentId(null);
  }, []);

  const selectedEntry = entries.find((e) => e.student_id === selectedStudentId) || null;

  const periodIndex = ['weekly', 'monthly', 'alltime'].indexOf(period);

  if (!activeClassroom) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          px: 3,
        }}
      >
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            color: neramTokens.cream[300],
            textAlign: 'center',
          }}
        >
          Select a classroom to view the leaderboard.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: neramTokens.navy[900],
        position: 'relative',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <EmojiEventsIcon sx={{ color: neramTokens.gold[500], fontSize: 28 }} />
          <Typography
            variant="h5"
            sx={{
              fontFamily: neramFontFamilies.serif,
              fontWeight: 700,
              color: neramTokens.cream[100],
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
            }}
          >
            Leaderboard
          </Typography>
        </Box>

        {/* Tabs: Weekly / Monthly / All-Time */}
        <Tabs
          value={periodIndex}
          onChange={handlePeriodChange}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            mb: 1.5,
            '& .MuiTabs-indicator': {
              bgcolor: neramTokens.gold[500],
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
            '& .MuiTab-root': {
              fontFamily: neramFontFamilies.body,
              fontWeight: 600,
              fontSize: '0.8rem',
              color: neramTokens.cream[300],
              minHeight: 40,
              textTransform: 'none',
              '&.Mui-selected': {
                color: neramTokens.gold[500],
              },
            },
          }}
        >
          <Tab label="Weekly" />
          <Tab label="Monthly" />
          <Tab label="All-Time" />
        </Tabs>

        {/* Batch filter */}
        {batches.length > 0 && (
          <Select
            value={batchId}
            onChange={handleBatchChange}
            size="small"
            fullWidth
            sx={{
              mb: 1.5,
              fontFamily: neramFontFamilies.body,
              fontSize: '0.85rem',
              color: neramTokens.cream[100],
              bgcolor: neramTokens.navy[800],
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: neramTokens.navy[600],
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: neramTokens.navy[500],
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: neramTokens.gold[500],
              },
              '& .MuiSelect-icon': {
                color: neramTokens.cream[300],
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: neramTokens.navy[800],
                  '& .MuiMenuItem-root': {
                    fontFamily: neramFontFamilies.body,
                    fontSize: '0.85rem',
                    color: neramTokens.cream[100],
                    '&:hover': { bgcolor: neramTokens.navy[700] },
                    '&.Mui-selected': {
                      bgcolor: neramTokens.navy[600],
                      '&:hover': { bgcolor: neramTokens.navy[600] },
                    },
                  },
                },
              },
            }}
          >
            <MenuItem value="all">All Batches</MenuItem>
            {batches.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </Select>
        )}
      </Box>

      {/* Content area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          overflow: 'hidden',
        }}
      >
        {/* Main list */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            pb: myRank ? 10 : 2,
          }}
        >
          {loading ? (
            <Box sx={{ px: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Skeleton for top 3 */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 2,
                  mb: 2,
                }}
              >
                {[1, 2, 3].map((i) => (
                  <Skeleton
                    key={i}
                    variant="rounded"
                    sx={{
                      flex: { xs: '1 1 auto', sm: '1 1 0' },
                      height: { xs: 120, sm: 160 },
                      bgcolor: neramTokens.navy[700],
                      borderRadius: 3,
                    }}
                  />
                ))}
              </Box>
              {/* Skeleton for rows */}
              {[4, 5, 6, 7, 8].map((i) => (
                <Skeleton
                  key={i}
                  variant="rounded"
                  height={56}
                  sx={{
                    bgcolor: neramTokens.navy[700],
                    borderRadius: 2,
                  }}
                />
              ))}
            </Box>
          ) : error ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
                px: 3,
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.body,
                  color: neramTokens.error,
                  textAlign: 'center',
                }}
              >
                {error}
              </Typography>
              <Button
                onClick={fetchLeaderboard}
                size="small"
                sx={{
                  fontFamily: neramFontFamilies.body,
                  color: neramTokens.cream[100],
                  textTransform: 'none',
                }}
              >
                Retry
              </Button>
            </Box>
          ) : entries.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
                px: 3,
              }}
            >
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.body,
                  color: neramTokens.cream[300],
                  textAlign: 'center',
                }}
              >
                No leaderboard data yet for this period.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ px: { xs: 0, sm: 2 } }}>
              {/* Top 3 podium */}
              <LeaderboardTopThree entries={topThree} />

              {/* Remaining rows */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  px: { xs: 1, sm: 0 },
                }}
              >
                {restEntries.map((entry) => (
                  <Box
                    key={entry.student_id}
                    sx={{ position: 'relative' }}
                  >
                    <LeaderboardRow
                      entry={entry}
                      onClick={() => handleRowClick(entry.student_id)}
                    />
                    {/* Teacher: Award Points button */}
                    {variant === 'teacher' && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(entry.student_id);
                        }}
                        title="Award Points"
                        sx={{
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: neramTokens.gold[500],
                          bgcolor: neramTokens.navy[700],
                          width: 28,
                          height: 28,
                          '&:hover': { bgcolor: neramTokens.navy[600] },
                          display: { xs: 'none', sm: 'flex' },
                        }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* Tablet+: Profile drawer inline on the right */}
        <Drawer
          anchor="right"
          open={!!selectedStudentId}
          onClose={handleCloseDrawer}
          variant="temporary"
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: '85vw',
              maxWidth: 360,
              bgcolor: neramTokens.navy[800],
              borderLeft: `1px solid ${neramTokens.navy[600]}`,
            },
          }}
        >
          <StudentProfileDrawerContent
            entry={selectedEntry}
            onClose={handleCloseDrawer}
            variant={variant}
          />
        </Drawer>

        {/* Desktop: Side panel */}
        {selectedStudentId && (
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              width: 340,
              flexShrink: 0,
              bgcolor: neramTokens.navy[800],
              borderLeft: `1px solid ${neramTokens.navy[600]}`,
              overflow: 'auto',
            }}
          >
            <StudentProfileDrawerContent
              entry={selectedEntry}
              onClose={handleCloseDrawer}
              variant={variant}
            />
          </Box>
        )}
      </Box>

      {/* Sticky bottom: Your rank */}
      <LeaderboardYourRank entry={myRank} totalStudents={totalStudents} />
    </Box>
  );
}

// ---------- Student Profile Drawer Content ----------

interface StudentProfileDrawerContentProps {
  entry: LeaderboardEntry | null;
  onClose: () => void;
  variant: 'student' | 'teacher';
}

function StudentProfileDrawerContent({
  entry,
  onClose,
  variant,
}: StudentProfileDrawerContentProps) {
  if (!entry) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            color: neramTokens.cream[300],
          }}
        >
          Student not found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${neramTokens.navy[600]}`,
        }}
      >
        <Typography
          sx={{
            fontFamily: neramFontFamilies.serif,
            fontWeight: 700,
            fontSize: '1rem',
            color: neramTokens.cream[100],
          }}
        >
          Student Profile
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: neramTokens.cream[300] }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Profile content */}
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `2px solid ${neramTokens.gold[500]}`,
            bgcolor: neramTokens.navy[600],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {entry.avatar_url ? (
            <Box
              component="img"
              src={entry.avatar_url}
              alt={entry.student_name}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Typography
              sx={{
                fontFamily: neramFontFamilies.serif,
                fontWeight: 700,
                fontSize: '1.5rem',
                color: neramTokens.cream[100],
              }}
            >
              {entry.student_name?.charAt(0)?.toUpperCase() || '?'}
            </Typography>
          )}
        </Box>

        <Typography
          sx={{
            fontFamily: neramFontFamilies.serif,
            fontWeight: 700,
            fontSize: '1.2rem',
            color: neramTokens.cream[100],
            textAlign: 'center',
          }}
        >
          {entry.student_name}
        </Typography>

        {entry.batch_name && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.8rem',
              color: neramTokens.cream[300],
            }}
          >
            {entry.batch_name}
          </Typography>
        )}

        {/* Stats grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1.5,
            width: '100%',
            mt: 1,
          }}
        >
          <StatBox label="Rank" value={`#${entry.rank}`} />
          <StatBox label="Points" value={entry.normalized_score.toLocaleString()} />
          <StatBox label="Streak" value={`${entry.streak_length}d`} />
          <StatBox label="Attendance" value={`${Math.round(entry.attendance_pct)}%`} />
        </Box>

        {/* Teacher: Award Points button */}
        {variant === 'teacher' && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            fullWidth
            sx={{
              mt: 2,
              fontFamily: neramFontFamilies.body,
              fontWeight: 600,
              textTransform: 'none',
              bgcolor: neramTokens.gold[500],
              color: neramTokens.navy[900],
              minHeight: 48,
              borderRadius: 2,
              '&:hover': {
                bgcolor: neramTokens.gold[600],
              },
            }}
          >
            Award Points
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ---------- Stat Box helper ----------

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        bgcolor: neramTokens.navy[700],
        borderRadius: 2,
        p: 1.5,
        textAlign: 'center',
      }}
    >
      <Typography
        sx={{
          fontFamily: neramFontFamilies.body,
          fontSize: '0.65rem',
          color: neramTokens.cream[300],
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          mb: 0.25,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: neramFontFamilies.mono,
          fontWeight: 700,
          fontSize: '1rem',
          color: neramTokens.cream[100],
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
