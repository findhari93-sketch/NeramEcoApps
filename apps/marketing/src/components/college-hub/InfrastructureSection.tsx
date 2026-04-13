import { Box, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import type { CollegeInfrastructure } from '@/lib/college-hub/types';

interface InfrastructureSectionProps {
  infrastructure: CollegeInfrastructure | null;
}

function InfraItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: boolean | null | undefined;
  icon?: React.ReactNode;
}) {
  if (value === null || value === undefined) return null;
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      {value ? (
        <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
      ) : (
        <CancelIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
      )}
      <Typography variant="body2" color={value ? 'text.primary' : 'text.disabled'}>
        {label}
      </Typography>
    </Stack>
  );
}

export default function InfrastructureSection({ infrastructure: infra }: InfrastructureSectionProps) {
  if (!infra) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">
          Infrastructure details not yet available.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Studio */}
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Design Studios
            </Typography>
            {infra.design_studios !== null && (
              <Typography variant="body2" sx={{ mb: 0.75 }}>
                {infra.design_studios} studio{infra.design_studios !== 1 ? 's' : ''}
                {infra.studio_student_ratio && ` (${infra.studio_student_ratio} student:studio ratio)`}
              </Typography>
            )}
            <Stack gap={0.5}>
              <InfraItem label="Digital Fabrication Lab" value={infra.has_digital_fabrication} />
              <InfraItem label="Model Making Lab" value={infra.has_model_making_lab} />
              <InfraItem label="Material Library" value={infra.has_material_library} />
            </Stack>
            {infra.software_available && infra.software_available.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Software Available
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {infra.software_available.map((s) => (
                    <Chip key={s} label={s} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}
            {infra.workshops && infra.workshops.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Workshop Facilities
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {infra.workshops.map((w) => (
                    <Chip key={w} label={w} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Amenities */}
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Campus Amenities
            </Typography>
            <Stack gap={0.5}>
              <InfraItem label="Library" value={infra.has_library} />
              <InfraItem label="Wi-Fi Campus" value={infra.has_wifi} />
              <InfraItem label="Boys Hostel" value={infra.has_hostel_boys} />
              <InfraItem label="Girls Hostel" value={infra.has_hostel_girls} />
              <InfraItem label="Mess / Canteen" value={infra.has_mess} />
              <InfraItem label="Sports Facilities" value={infra.has_sports} />
            </Stack>
            {infra.campus_area_acres !== null && (
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                Campus area: {infra.campus_area_acres} acres
                {infra.campus_type && ` (${infra.campus_type} campus)`}
              </Typography>
            )}
            {infra.hostel_capacity && (
              <Typography variant="body2">
                Hostel capacity: {infra.hostel_capacity.toLocaleString()} students
              </Typography>
            )}
            {infra.library_books_count && (
              <Typography variant="body2">
                Library: {infra.library_books_count.toLocaleString()} books
              </Typography>
            )}
            {infra.sports_facilities && infra.sports_facilities.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {infra.sports_facilities.map((s) => (
                    <Chip key={s} label={s} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
