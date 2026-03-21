'use client';

import { useState } from 'react';
import { Box, Tabs, Tab } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ClassDocumentMatrix from '@/components/documents/ClassDocumentMatrix';
import TemplateManager from '@/components/documents/TemplateManager';
import AuditLog from '@/components/documents/AuditLog';
import ExamTrackingDashboard from '@/components/documents/ExamTrackingDashboard';

export default function TeacherDocumentsPage() {
  const { activeClassroom } = useNexusAuthContext();
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <PageHeader
        title="Document Vault"
        subtitle={activeClassroom ? `Manage student documents for ${activeClassroom.name}` : 'Select a classroom'}
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Overview" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Templates" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Exam Tracking" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab label="Audit Log" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {tab === 0 && <ClassDocumentMatrix />}
      {tab === 1 && <TemplateManager />}
      {tab === 2 && <ExamTrackingDashboard />}
      {tab === 3 && <AuditLog />}
    </Box>
  );
}
