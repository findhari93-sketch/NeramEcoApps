'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import NataTracker from './NataTracker';
import JeeTracker from './JeeTracker';

interface ExamRegistration {
  id: string;
  exam_type: 'nata' | 'jee';
  is_writing: boolean;
  application_number: string | null;
  application_summary_doc_id: string | null;
}

interface ExamAttempt {
  id: string;
  exam_type: 'nata' | 'jee';
  phase: string;
  attempt_number: number;
  exam_date_id: string | null;
  state: 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
  application_date: string | null;
  exam_completed_at: string | null;
  aptitude_score: number | null;
  drawing_score: number | null;
  total_score: number | null;
}

interface ExamDate {
  id: string;
  exam_type: 'nata' | 'jee';
  year: number;
  phase: string;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
}

interface ExamSelectionPanelProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
}

export default function ExamSelectionPanel({ classroomId, getToken }: ExamSelectionPanelProps) {
  const theme = useTheme();
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingNata, setTogglingNata] = useState(false);
  const [togglingJee, setTogglingJee] = useState(false);

  const fetchData = useCallback(async () => {
    if (!classroomId) return;
    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };
      const [regRes, attRes, datesRes] = await Promise.all([
        fetch(`/api/documents/exam-registrations?classroom=${classroomId}`, { headers }),
        fetch(`/api/documents/exam-attempts?classroom=${classroomId}`, { headers }),
        fetch('/api/documents/exam-dates', { headers }),
      ]);

      if (regRes.ok) {
        const data = await regRes.json();
        setRegistrations(data.registrations || []);
      }
      if (attRes.ok) {
        const data = await attRes.json();
        setAttempts(data.attempts || []);
      }
      if (datesRes.ok) {
        const data = await datesRes.json();
        setExamDates(data.exam_dates || []);
      }
    } catch (err) {
      console.error('Failed to fetch exam data:', err);
    } finally {
      setLoading(false);
    }
  }, [classroomId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nataReg = registrations.find((r) => r.exam_type === 'nata');
  const jeeReg = registrations.find((r) => r.exam_type === 'jee');
  const isNataOn = nataReg?.is_writing ?? false;
  const isJeeOn = jeeReg?.is_writing ?? false;

  const handleToggle = useCallback(async (examType: 'nata' | 'jee', newValue: boolean) => {
    const setToggling = examType === 'nata' ? setTogglingNata : setTogglingJee;
    setToggling(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/documents/exam-registrations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: classroomId,
          exam_type: examType,
          is_writing: newValue,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRegistrations((prev) => {
          const filtered = prev.filter((r) => r.exam_type !== examType);
          return [...filtered, data.registration];
        });
      }
    } catch (err) {
      console.error('Failed to toggle exam:', err);
    } finally {
      setToggling(false);
    }
  }, [getToken, classroomId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const nataAttempts = attempts.filter((a) => a.exam_type === 'nata');
  const jeeAttempts = attempts.filter((a) => a.exam_type === 'jee');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* NATA Card */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          borderColor: isNataOn ? theme.palette.primary.main : theme.palette.divider,
          borderWidth: isNataOn ? 2 : 1,
        }}
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            bgcolor: isNataOn ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          }}
        >
          <SchoolOutlinedIcon sx={{ fontSize: 28, color: isNataOn ? 'primary.main' : 'text.disabled' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" fontWeight={700}>
              NATA 2026
            </Typography>
            <Typography variant="caption" color="text.secondary">
              National Aptitude Test in Architecture
            </Typography>
          </Box>
          <Switch
            checked={isNataOn}
            onChange={(_, checked) => handleToggle('nata', checked)}
            disabled={togglingNata}
            sx={{ '& .MuiSwitch-switchBase': { '&.Mui-checked': { color: theme.palette.primary.main } } }}
          />
        </Box>

        {isNataOn && nataReg && (
          <Box sx={{ p: 2, pt: 0 }}>
            <NataTracker
              classroomId={classroomId}
              getToken={getToken}
              registration={nataReg}
              attempts={nataAttempts}
              examDates={examDates}
              onRefresh={fetchData}
            />
          </Box>
        )}
      </Paper>

      {/* JEE Card */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          borderColor: isJeeOn ? theme.palette.secondary.main : theme.palette.divider,
          borderWidth: isJeeOn ? 2 : 1,
        }}
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            bgcolor: isJeeOn ? alpha(theme.palette.secondary.main, 0.04) : 'transparent',
          }}
        >
          <ArchitectureOutlinedIcon sx={{ fontSize: 28, color: isJeeOn ? 'secondary.main' : 'text.disabled' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" fontWeight={700}>
              JEE Main 2026
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Paper 2 - B.Arch
            </Typography>
          </Box>
          <Switch
            checked={isJeeOn}
            onChange={(_, checked) => handleToggle('jee', checked)}
            disabled={togglingJee}
            sx={{ '& .MuiSwitch-switchBase': { '&.Mui-checked': { color: theme.palette.secondary.main } } }}
          />
        </Box>

        {isJeeOn && jeeReg && (
          <Box sx={{ p: 2, pt: 0 }}>
            <JeeTracker
              classroomId={classroomId}
              getToken={getToken}
              registration={jeeReg}
              attempts={jeeAttempts}
              examDates={examDates}
              onRefresh={fetchData}
            />
          </Box>
        )}
      </Paper>
    </Box>
  );
}
