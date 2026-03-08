'use client';

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Collapse,
  Divider,
  Tooltip,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LanguageIcon from '@mui/icons-material/Language';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { CoaInstitution } from '@neram/database';
import COAStatusBadge from './COAStatusBadge';
import { COA_STATUS_CONFIG } from './constants';

interface COAResultCardProps {
  institution: CoaInstitution;
}

export default function COAResultCard({ institution: inst }: COAResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = COA_STATUS_CONFIG[inst.approval_status] ?? COA_STATUS_CONFIG.unknown;

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${config.color}`,
        borderRadius: 2,
      }}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              bgcolor: `${config.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SchoolIcon sx={{ color: config.color, fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
              {inst.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Code: {inst.institution_code}
              {inst.affiliating_university && ` · ${inst.affiliating_university}`}
            </Typography>
          </Box>
          <COAStatusBadge status={inst.approval_status} size="medium" />
        </Box>

        {/* Location */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            {[inst.city, inst.state, inst.pincode].filter(Boolean).join(', ')}
          </Typography>
        </Box>

        {/* Chips */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
          {inst.current_intake && (
            <Chip label={`Intake: ${inst.current_intake}`} size="small" variant="outlined" />
          )}
          {inst.commenced_year && (
            <Chip label={`Est. ${inst.commenced_year}`} size="small" variant="outlined" />
          )}
          {inst.approval_period_raw && (
            <Chip label={inst.approval_period_raw} size="small" variant="outlined" />
          )}
        </Box>

        {/* Expand toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            color: 'text.secondary',
          }}
          onClick={() => setExpanded((p) => !p)}
        >
          <Typography variant="caption" sx={{ flex: 1 }}>
            {expanded ? 'Hide contact details' : 'Show contact details'}
          </Typography>
          <IconButton size="small">
            {expanded ? (
              <ExpandLessIcon sx={{ fontSize: 16 }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Box>

        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {inst.head_of_dept && (
              <Typography variant="caption" color="text.secondary">
                Head of Dept: <strong>{inst.head_of_dept}</strong>
              </Typography>
            )}
            {inst.phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption">{inst.phone}</Typography>
              </Box>
            )}
            {inst.mobile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption">{inst.mobile} (mobile)</Typography>
              </Box>
            )}
            {inst.email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EmailIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography
                  variant="caption"
                  component="a"
                  href={`mailto:${inst.email}`}
                  sx={{ color: 'primary.main' }}
                >
                  {inst.email}
                </Typography>
              </Box>
            )}
            {inst.website && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LanguageIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Tooltip title={inst.website}>
                  <Typography
                    variant="caption"
                    component="a"
                    href={inst.website.startsWith('http') ? inst.website : `https://${inst.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: 'primary.main', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
                  >
                    {inst.website}
                  </Typography>
                </Tooltip>
              </Box>
            )}
            {inst.address && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {inst.address}
              </Typography>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
