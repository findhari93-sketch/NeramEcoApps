'use client';

import { Box, Typography, Button, Card, CardContent, Stack, alpha } from '@neram/ui';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { DEFAULT_ADMIN_TEAMS_EMAILS } from '@/lib/constants';

/**
 * Shown when a signed-in parent has no linked student.
 *
 * The parent counterpart to NoClassroomWelcome, and deliberately a separate
 * screen. A student with no classroom needs to be ADDED to one; a parent with
 * no link needs to be LINKED to their child. Showing a parent the student
 * screen would tell them to do something they have no way of doing, and would
 * point them at Teams, which parents do not have.
 *
 * There is no action button on purpose: a parent genuinely cannot self-serve
 * this. Anything clickable here would be a dead end dressed up as a fix.
 */
export default function ParentNoChildLinked() {
  const { signOut, parentSession } = useNexusAuthContext();
  const officeEmail = DEFAULT_ADMIN_TEAMS_EMAILS[0] || 'info@neramclasses.com';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 6,
        bgcolor: (theme) =>
          theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default',
      }}
    >
      <Card sx={{ maxWidth: 460, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2.5,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
            }}
          >
            <FamilyRestroomOutlinedIcon sx={{ fontSize: 38 }} />
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            No student linked yet
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, fontSize: 17, lineHeight: 1.6 }}
          >
            Your login is working, but it is not connected to a student yet.
            Please contact the Neram office and we will link it for you.
          </Typography>

          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                Email us
              </Typography>
              <Typography sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                {officeEmail}
              </Typography>
            </Box>

            {parentSession.parent?.name && (
              <Typography variant="caption" color="text.secondary">
                Signed in as {parentSession.parent.name}
              </Typography>
            )}
          </Stack>

          <Button
            variant="outlined"
            fullWidth
            startIcon={<LogoutOutlinedIcon />}
            onClick={() => signOut()}
            sx={{ minHeight: 48 }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
