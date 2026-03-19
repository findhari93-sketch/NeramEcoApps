'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Alert, Paper } from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { NataExamCenter } from '@neram/database';

import ExamCentersStatsBar from '@/components/exam-centers/ExamCentersStatsBar';
import ExamCentersToolbar from '@/components/exam-centers/ExamCentersToolbar';
import ExamCentersTable from '@/components/exam-centers/ExamCentersTable';
import CsvUploadDialog from '@/components/exam-centers/CsvUploadDialog';
import AddCenterDialog from '@/components/exam-centers/AddCenterDialog';
import CloneYearDialog from '@/components/exam-centers/CloneYearDialog';

interface ExamCenterStats {
  total: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  tcs_confirmed: number;
  with_barch: number;
  states_count: number;
  new_this_year: number;
}

export default function ExamCentersPage() {
  const [centers, setCenters] = useState<NataExamCenter[]>([]);
  const [stats, setStats] = useState<ExamCenterStats | null>(null);
  const [years, setYears] = useState<number[]>([2025]);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [showUpload, setShowUpload] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null);

  // Fetch years
  const fetchYears = useCallback(async () => {
    try {
      const res = await fetch('/api/exam-centers/years');
      const json = await res.json();
      if (json.data?.length > 0) {
        setYears(json.data);
        setSelectedYear(json.data[0]); // Most recent year
      }
    } catch {
      // Keep default year
    }
  }, []);

  // Fetch centers + stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [centersRes, statsRes] = await Promise.all([
        fetch(`/api/exam-centers?year=${selectedYear}&limit=500`),
        fetch(`/api/exam-centers/stats?year=${selectedYear}`),
      ]);

      const centersJson = await centersRes.json();
      const statsJson = await statsRes.json();

      if (!centersRes.ok) throw new Error(centersJson.error || 'Failed to load');

      setCenters(centersJson.data || []);
      setStats(statsJson.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/exam-centers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update');

    // Update local state
    setCenters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } as NataExamCenter : c))
    );
    // Refresh stats
    const statsRes = await fetch(`/api/exam-centers/stats?year=${selectedYear}`);
    const statsJson = await statsRes.json();
    if (statsRes.ok) setStats(statsJson.data);
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete exam center "${label}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/exam-centers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete');

    setCenters((prev) => prev.filter((c) => c.id !== id));
    // Refresh stats
    const statsRes = await fetch(`/api/exam-centers/stats?year=${selectedYear}`);
    const statsJson = await statsRes.json();
    if (statsRes.ok) setStats(statsJson.data);
  };

  const handleAddSave = async (data: Record<string, unknown>) => {
    const isEdit = editData && editData.id;
    const url = isEdit ? `/api/exam-centers/${editData.id}` : '/api/exam-centers';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || (isEdit ? 'Failed to update' : 'Failed to create'));
    await fetchData(); // Refresh all data
  };

  const handleBulkImport = async (rows: Record<string, unknown>[]) => {
    const res = await fetch('/api/exam-centers/bulk-upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to import');
    await fetchData(); // Refresh all data
    return json.data;
  };

  const handleClone = async (sourceYear: number, targetYear: number) => {
    const res = await fetch('/api/exam-centers/clone-year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_year: sourceYear, target_year: targetYear }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to clone');
    await fetchYears();
    setSelectedYear(targetYear);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LocationOnIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              NATA Exam Centers
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage exam center data for the student locator tool
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Stats */}
      <ExamCentersStatsBar stats={stats} loading={loading && !stats} />

      {/* Toolbar */}
      <ExamCentersToolbar
        years={years}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        onAddClick={() => setShowAdd(true)}
        onUploadClick={() => setShowUpload(true)}
        onCloneClick={() => setShowClone(true)}
        onRefresh={fetchData}
        centers={centers}
        loading={loading}
      />

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <ExamCentersTable
        data={centers}
        loading={loading}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {/* Dialogs */}
      <CsvUploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        year={selectedYear}
        onImport={handleBulkImport}
      />

      <AddCenterDialog
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditData(null); }}
        year={selectedYear}
        onSave={handleAddSave}
        initialData={editData}
      />

      <CloneYearDialog
        open={showClone}
        onClose={() => setShowClone(false)}
        years={years}
        onClone={handleClone}
      />
    </Box>
  );
}
