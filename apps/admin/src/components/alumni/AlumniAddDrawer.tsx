'use client';

import { useState, useEffect } from 'react';
import { Drawer, Box, Typography, IconButton, Tabs, Tab } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { ACCENT, ACCENT_SOFT, INK, MUTED, LINE } from './theme';
import SingleAlumnusForm from './SingleAlumnusForm';
import BulkAlumniUpload from './bulk/BulkAlumniUpload';

interface AlumniAddDrawerProps {
  open: boolean;
  adminId: string | null;
  onClose: () => void;
  onAdded: (userId: string) => void;
  onBulkAdded: () => void;
}

/**
 * Right drawer for adding alumni: "Add one" (the single form) and "Bulk upload"
 * (CSV / Excel import with an editable review grid). Inner content is remounted
 * on each open so both tabs start fresh.
 */
export default function AlumniAddDrawer({ open, adminId, onClose, onAdded, onBulkAdded }: AlumniAddDrawerProps) {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100vw', lg: 1180 }, maxWidth: '100vw' } }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: ACCENT_SOFT, color: ACCENT }}>
          <PersonAddAlt1Icon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={800} color={INK} lineHeight={1.2}>
            Add alumni
          </Typography>
          <Typography variant="caption" sx={{ color: MUTED }}>
            Add one by hand, or bulk import a whole batch from CSV or Excel.
          </Typography>
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 2, borderBottom: `1px solid ${LINE}`, '& .MuiTabs-indicator': { bgcolor: ACCENT }, '& .Mui-selected': { color: `${ACCENT} !important` } }}
      >
        <Tab label="Add one" sx={{ textTransform: 'none', fontWeight: 700 }} />
        <Tab label="Bulk upload CSV" sx={{ textTransform: 'none', fontWeight: 700 }} />
      </Tabs>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column' }}>
        {open && tab === 0 && (
          <Box sx={{ maxWidth: 640 }}>
            <SingleAlumnusForm adminId={adminId} onAdded={onAdded} onCancel={onClose} />
          </Box>
        )}
        {open && tab === 1 && (
          <BulkAlumniUpload adminId={adminId} onBulkAdded={onBulkAdded} />
        )}
      </Box>
    </Drawer>
  );
}
