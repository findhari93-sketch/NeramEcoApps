'use client';

import { Box, Chip, Paper, Typography } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import type { UserJourneyDetail } from '@neram/database';

interface DemoClassSectionProps {
  detail: UserJourneyDetail;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const REG_STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: '#F57C00', bgColor: '#F57C0014', label: 'Pending' },
  approved: { color: '#1976D2', bgColor: '#1976D214', label: 'Approved' },
  rejected: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'Rejected' },
  attended: { color: '#2E7D32', bgColor: '#2E7D3214', label: 'Attended' },
  no_show: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'No Show' },
  cancelled: { color: '#78909C', bgColor: '#78909C14', label: 'Cancelled' },
};

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      {Array.from({ length: max }).map((_, i) => (
        i < rating
          ? <StarIcon key={i} sx={{ fontSize: 14, color: '#FFA000' }} />
          : <StarBorderIcon key={i} sx={{ fontSize: 14, color: '#E0E0E0' }} />
      ))}
      <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600, fontSize: 11, color: 'text.secondary' }}>
        {rating}/{max}
      </Typography>
    </Box>
  );
}

export default function DemoClassSection({ detail }: DemoClassSectionProps) {
  const { demoRegistrations } = detail;

  return (
    <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <VideocamIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Demo Classes</Typography>
        {demoRegistrations.length > 0 && (
          <Chip
            label={demoRegistrations.length}
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'grey.200', color: 'text.secondary', borderRadius: 1, ml: 0.5 }}
          />
        )}
      </Box>

      <Box sx={{ p: 1.5 }}>
        {demoRegistrations.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <VideocamIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No demo class requests. User may have taken the direct application path.
            </Typography>
          </Box>
        ) : (
          demoRegistrations.map((reg, index) => {
            const statusConfig = REG_STATUS_CONFIG[reg.status] || REG_STATUS_CONFIG.pending;
            return (
              <Box
                key={reg.id}
                sx={{
                  p: 2,
                  mb: index < demoRegistrations.length - 1 ? 1.5 : 0,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'grey.100',
                  borderLeft: '3px solid',
                  borderLeftColor: statusConfig.color,
                  transition: 'box-shadow 0.15s',
                  '&:hover': { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
                }}
              >
                {/* Registration header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
                    {(reg as any).slot?.title || 'Demo Class'}
                  </Typography>
                  <Chip
                    label={statusConfig.label}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: statusConfig.bgColor,
                      color: statusConfig.color,
                      borderRadius: 1,
                      border: `1px solid ${statusConfig.color}30`,
                    }}
                  />
                </Box>

                {/* Slot details */}
                {(reg as any).slot && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <EventIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                        {formatDate((reg as any).slot.slot_date)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AccessTimeIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                        {(reg as any).slot.slot_time} ({(reg as any).slot.duration_minutes} min)
                      </Typography>
                    </Box>
                    <Chip
                      label={(reg as any).slot.demo_mode}
                      size="small"
                      sx={{ height: 18, fontSize: 9.5, fontWeight: 600, bgcolor: '#E3F2FD', color: '#1565C0', borderRadius: 1, textTransform: 'capitalize' }}
                    />
                  </Box>
                )}

                {/* Attendance */}
                {reg.attended !== null && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                    {reg.attended
                      ? <CheckCircleOutlineIcon sx={{ fontSize: 15, color: '#2E7D32' }} />
                      : <CancelOutlinedIcon sx={{ fontSize: 15, color: '#D32F2F' }} />
                    }
                    <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600, color: reg.attended ? '#2E7D32' : '#D32F2F' }}>
                      {reg.attended ? 'Attended' : 'Absent'}
                    </Typography>
                  </Box>
                )}

                {/* Survey results */}
                {(reg as any).survey && (
                  <Box sx={{ mt: 1.5, p: 2, bgcolor: '#FFFDE7', borderRadius: 0.75, border: '1px solid #FFF9C4' }}>
                    <Typography variant="overline" sx={{ fontWeight: 700, fontSize: 10, letterSpacing: 1, color: '#F57F17', mb: 1, display: 'block' }}>
                      Survey Feedback
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1 }}>
                      {(reg as any).survey.overall_rating && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block', mb: 0.25 }}>Overall</Typography>
                          <StarRating rating={(reg as any).survey.overall_rating} />
                        </Box>
                      )}
                      {(reg as any).survey.teaching_rating && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block', mb: 0.25 }}>Teaching</Typography>
                          <StarRating rating={(reg as any).survey.teaching_rating} />
                        </Box>
                      )}
                      {(reg as any).survey.enrollment_interest && (
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block', mb: 0.25 }}>Interest</Typography>
                          <Chip
                            label={(reg as any).survey.enrollment_interest}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 1,
                              textTransform: 'capitalize',
                              bgcolor: (reg as any).survey.enrollment_interest === 'yes' ? '#2E7D3214' : (reg as any).survey.enrollment_interest === 'maybe' ? '#F57C0014' : '#D32F2F14',
                              color: (reg as any).survey.enrollment_interest === 'yes' ? '#2E7D32' : (reg as any).survey.enrollment_interest === 'maybe' ? '#F57C00' : '#D32F2F',
                              border: `1px solid ${(reg as any).survey.enrollment_interest === 'yes' ? '#2E7D3230' : (reg as any).survey.enrollment_interest === 'maybe' ? '#F57C0030' : '#D32F2F30'}`,
                            }}
                          />
                        </Box>
                      )}
                    </Box>
                    {(reg as any).survey.liked_most && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.75 }}>
                        <ThumbUpAltIcon sx={{ fontSize: 13, color: '#4CAF50', mt: 0.25 }} />
                        <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {(reg as any).survey.liked_most}
                        </Typography>
                      </Box>
                    )}
                    {(reg as any).survey.suggestions && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.5 }}>
                        <LightbulbIcon sx={{ fontSize: 13, color: '#FF9800', mt: 0.25 }} />
                        <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {(reg as any).survey.suggestions}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {/* Conversion badge */}
                {reg.converted_to_lead && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5 }}>
                    <TrendingUpIcon sx={{ fontSize: 14, color: '#2E7D32' }} />
                    <Chip
                      label="Converted to Lead"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: '#2E7D3214',
                        color: '#2E7D32',
                        borderRadius: 1,
                        border: '1px solid #2E7D3230',
                      }}
                    />
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Paper>
  );
}
