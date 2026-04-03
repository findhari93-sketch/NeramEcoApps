'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Grid,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CoursePlanCard from '@/components/course-plan/CoursePlanCard';
import CreatePlanDialog from '@/components/course-plan/CreatePlanDialog';

export default function CoursePlansPage() {
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchPlans = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans?classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Failed to load course plans:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Course Plans
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Create Plan
        </Button>
      </Box>

      {/* Plans Grid */}
      {loading ? (
        <Grid container spacing={2}>
          {[0, 1, 2].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rounded" height={160} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      ) : plans.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            px: 3,
          }}
        >
          <MenuBookIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            No course plans yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first course plan to organize sessions, homework, and tests.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Create Plan
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {plans.map((plan) => (
            <Grid item xs={12} sm={6} md={4} key={plan.id}>
              <CoursePlanCard plan={plan} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Dialog */}
      {activeClassroom && (
        <CreatePlanDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          classroomId={activeClassroom.id}
          onCreated={fetchPlans}
          getToken={getToken}
        />
      )}
    </Box>
  );
}
