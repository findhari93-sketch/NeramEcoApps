'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Skeleton,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type {
  CoursePlanCSVData,
  TeacherMapping,
  PlanConfig,
} from '@/lib/course-plan-csv-schema';
import UploadStep from '@/components/course-plan/csv-upload/UploadStep';
import ReviewStep from '@/components/course-plan/csv-upload/ReviewStep';
import ConfirmStep from '@/components/course-plan/csv-upload/ConfirmStep';

const STEPS = ['Upload', 'Review', 'Import'];

const STATUS_COLORS: Record<string, 'default' | 'success' | 'info' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  paused: 'warning',
};

interface PlanMeta {
  id: string;
  name: string;
  status: string;
  duration_weeks: number;
  days_per_week: string[];
  sessions_per_day: Array<{ slot: string; start?: string; end?: string; label?: string }>;
  classroom_id: string;
}

export default function CSVUploadPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const { getToken } = useNexusAuthContext();

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanMeta | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [teacherMappings, setTeacherMappings] = useState<TeacherMapping[]>([]);
  const [parsedData, setParsedData] = useState<CoursePlanCSVData | null>(null);

  // Fetch plan detail and teacher mappings on mount
  const fetchPlanMeta = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch plan
      const planRes = await fetch(`/api/course-plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!planRes.ok) {
        console.error('Failed to load plan');
        return;
      }

      const planData = await planRes.json();
      const p = planData.plan;
      setPlan({
        id: p.id,
        name: p.name,
        status: p.status,
        duration_weeks: p.duration_weeks,
        days_per_week: p.days_per_week || [],
        sessions_per_day: p.sessions_per_day || [],
        classroom_id: p.classroom_id,
      });

      setPlanConfig({
        duration_weeks: p.duration_weeks,
        days_per_week: p.days_per_week || [],
        sessions_per_day: (p.sessions_per_day || []).map((s: any) => ({
          slot: s.slot,
          start: s.start || '',
          end: s.end || '',
        })),
      });

      // Fetch teachers from the template endpoint headers
      // We'll re-use the csv-template route but just parse teacher info from it
      // Actually, let's get teachers directly
      const teachersRes = await fetch(
        `/api/course-plans/${planId}/csv-template`,
        {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${token}` },
        }
      ).catch(() => null);

      // Instead, parse teacher info from the template CSV comments
      // Simpler approach: just fetch the full template and parse the comment lines
      const templateRes = await fetch(
        `/api/course-plans/${planId}/csv-template`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (templateRes.ok) {
        const csvText = await templateRes.text();
        // Parse teacher mappings from comment lines like: #   S = Sudha
        const mappings: TeacherMapping[] = [];
        for (const line of csvText.split('\n')) {
          const match = line.match(/^#\s+(\S+)\s+=\s+(.+)$/);
          if (match) {
            mappings.push({
              abbreviation: match[1],
              name: match[2].trim(),
              user_id: '', // Will be resolved server-side during import
            });
          }
        }
        setTeacherMappings(mappings);
      }
    } catch (err) {
      console.error('Failed to load plan metadata:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    fetchPlanMeta();
  }, [fetchPlanMeta]);

  const handleParsed = useCallback((data: CoursePlanCSVData) => {
    setParsedData(data);
    setActiveStep(1);
  }, []);

  const handleDataChange = useCallback((updated: CoursePlanCSVData) => {
    setParsedData(updated);
  }, []);

  const handleImportComplete = useCallback(() => {
    // The ConfirmStep handles its own success state
  }, []);

  if (loading) {
    return (
      <Box sx={{ px: { xs: 0, md: 1 }, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="text" width={200} height={36} />
        </Box>
        <Skeleton variant="rounded" height={48} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 2.5 }} />
      </Box>
    );
  }

  if (!plan || !planConfig) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          Plan not found
        </Typography>
        <Button
          onClick={() => router.push('/teacher/course-plans')}
          sx={{ mt: 2, minHeight: 48 }}
        >
          Back to Plans
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton
          onClick={() => router.push(`/teacher/course-plans/${planId}`)}
          sx={{ width: 40, height: 40 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Import CSV
          </Typography>
        </Box>
        <Chip
          label={plan.status}
          color={STATUS_COLORS[plan.status] || 'default'}
          size="small"
          sx={{ textTransform: 'capitalize', fontWeight: 600 }}
        />
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ ml: 6.5, mb: 2 }}
      >
        {plan.name}
      </Typography>

      {/* Stepper */}
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          mb: 3,
          '& .MuiStepLabel-label': { fontSize: '0.75rem' },
        }}
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step content */}
      {activeStep === 0 && (
        <UploadStep
          planId={planId}
          planConfig={planConfig}
          teacherMappings={teacherMappings}
          onParsed={handleParsed}
          getToken={getToken}
        />
      )}

      {activeStep === 1 && parsedData && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mb: 2,
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="outlined"
              size="small"
              onClick={() => setActiveStep(0)}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Back to Upload
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              size="small"
              onClick={() => setActiveStep(2)}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Continue to Import
            </Button>
          </Box>
          <ReviewStep
            data={parsedData}
            onChange={handleDataChange}
            teacherMappings={teacherMappings}
          />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => setActiveStep(2)}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Continue to Import
            </Button>
          </Box>
        </Box>
      )}

      {activeStep === 2 && parsedData && (
        <Box>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setActiveStep(1)}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Back to Review
            </Button>
          </Box>
          <ConfirmStep
            planId={planId}
            data={parsedData}
            teacherMappings={teacherMappings}
            onComplete={handleImportComplete}
            getToken={getToken}
          />
        </Box>
      )}
    </Box>
  );
}
