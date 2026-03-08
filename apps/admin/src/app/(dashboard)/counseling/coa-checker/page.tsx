'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Alert,
} from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import SearchIcon from '@mui/icons-material/Search';
import ExploreIcon from '@mui/icons-material/Explore';
import BarChartIcon from '@mui/icons-material/BarChart';
import type { CoaInstitution } from '@neram/database';
import COASearchBar from '@/components/coa/COASearchBar';
import COAResultCard from '@/components/coa/COAResultCard';
import COACollegeList from '@/components/coa/COACollegeList';
import COAStatsSummary from '@/components/coa/COAStatsSummary';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

export default function COACheckerPage() {
  const [tab, setTab] = useState(0);
  const [selectedCollege, setSelectedCollege] = useState<CoaInstitution | null>(null);

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 1,
            bgcolor: '#0277BD',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <VerifiedIcon sx={{ color: 'white', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            COA Approval Checker
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Verify Council of Architecture approval status for B.Arch colleges · Data from ecoa.in
          </Typography>
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
        >
          <Tab
            label="Check"
            icon={<SearchIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{ minHeight: 44, fontSize: 13 }}
          />
          <Tab
            label="Explore"
            icon={<ExploreIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{ minHeight: 44, fontSize: 13 }}
          />
          <Tab
            label="Stats"
            icon={<BarChartIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            sx={{ minHeight: 44, fontSize: 13 }}
          />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* Tab 0: Check (search + result) */}
          <TabPanel value={tab} index={0}>
            <Box sx={{ maxWidth: 680 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Search any B.Arch college to instantly verify its COA approval status.
              </Typography>
              <COASearchBar
                onSelect={(inst) => {
                  setSelectedCollege(inst);
                }}
              />
              {selectedCollege && (
                <Box sx={{ mt: 2 }}>
                  <COAResultCard institution={selectedCollege} />
                </Box>
              )}
              {!selectedCollege && (
                <Alert severity="info" sx={{ mt: 2, fontSize: 13 }}>
                  Type at least 2 characters to search. Results are from the official COA list (ecoa.in).
                </Alert>
              )}
            </Box>
          </TabPanel>

          {/* Tab 1: Explore */}
          <TabPanel value={tab} index={1}>
            <COACollegeList />
          </TabPanel>

          {/* Tab 2: Stats */}
          <TabPanel value={tab} index={2}>
            <COAStatsSummary />
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
}
