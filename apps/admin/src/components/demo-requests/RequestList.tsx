'use client';

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
} from '@neram/ui';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import BrushIcon from '@mui/icons-material/Brush';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { FOCUS_RING } from '@/components/ops/OpsUi';
import type { DemoRequest, DemoScheduleSettings, DeskTab } from './types';
import { ago, classLabel, isCallbackDue, isOverdueNew, telHref, waHref, whenLabel } from './format';

export default function RequestList({
  rows,
  tab,
  selectedId,
  onSelect,
  schedule,
  now,
}: {
  rows: DemoRequest[];
  tab: DeskTab;
  selectedId: string | null;
  onSelect: (id: string) => void;
  schedule: DemoScheduleSettings;
  now: Date;
}) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small" aria-label="Demo requests">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Student</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{tab === 'upcoming' || tab === 'done' ? 'Demo' : 'Asked for'}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{tab === 'followup' ? 'Call back' : 'Requested'}</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Contact
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const when = whenLabel(r, schedule);
            const overdue = isOverdueNew(r, now);
            const callbackDue = isCallbackDue(r, now);
            const selected = r.id === selectedId;
            return (
              <TableRow
                key={r.id}
                hover
                selected={selected}
                onClick={() => onSelect(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(r.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selected}
                sx={{ cursor: 'pointer', ...FOCUS_RING, '& td': { py: 1.25 } }}
              >
                <TableCell sx={{ minWidth: 180 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {r.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}>
                    <Typography variant="caption">{r.ref_code}</Typography>
                    {classLabel(r.current_class) && <Typography variant="caption">{classLabel(r.current_class)}</Typography>}
                    {r.parent_joining && (
                      <Tooltip title="Parent joining">
                        <FamilyRestroomIcon aria-label="Parent joining" sx={{ fontSize: 16 }} />
                      </Tooltip>
                    )}
                    {r.drawing_received_at && (
                      <Tooltip title={r.drawing_feedback_at ? 'Drawing received, feedback sent' : 'Drawing received'}>
                        <BrushIcon
                          aria-label="Drawing received"
                          sx={{ fontSize: 16, color: r.drawing_feedback_at ? 'success.main' : 'warning.main' }}
                        />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 180 }}>
                  <Typography variant="body2">{when.primary}</Typography>
                  {when.secondary && (
                    <Typography variant="caption" color="text.secondary">
                      {when.secondary}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {tab === 'followup' && r.next_contact_at ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: callbackDue ? 'error.main' : 'text.primary' }}>
                      <ScheduleIcon aria-hidden sx={{ fontSize: 16 }} />
                      <Typography variant="body2" fontWeight={callbackDue ? 700 : 400}>
                        {callbackDue ? 'Due now' : new Date(r.next_contact_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: overdue ? 'error.main' : 'text.secondary' }}>
                      {overdue && <ErrorOutlineIcon aria-hidden sx={{ fontSize: 16 }} />}
                      <Typography variant="body2" fontWeight={overdue ? 700 : 400}>
                        {ago(r.created_at, now)}
                        {overdue ? ', call now' : ''}
                      </Typography>
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={`Call ${r.name}`}>
                    <IconButton
                      component="a"
                      href={telHref(r.phone)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      aria-label={`Call ${r.name}`}
                      sx={{ width: 44, height: 44 }}
                    >
                      <PhoneIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={`WhatsApp ${r.name}`}>
                    <IconButton
                      component="a"
                      href={waHref(r.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      aria-label={`WhatsApp ${r.name}`}
                      sx={{ width: 44, height: 44, color: 'success.main' }}
                    >
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
