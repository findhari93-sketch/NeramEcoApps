'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { NataExamCenter } from '@neram/database';
import Papa from 'papaparse';

interface ExamCentersToolbarProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  onAddClick: () => void;
  onUploadClick: () => void;
  onCloneClick: () => void;
  onRefresh: () => void;
  centers: NataExamCenter[];
  loading?: boolean;
}

const CSV_HEADERS = [
  'state', 'city_brochure', 'brochure_ref', 'latitude', 'longitude',
  'probable_center_1', 'center_1_address', 'center_1_evidence',
  'probable_center_2', 'center_2_address', 'center_2_evidence',
  'confidence', 'is_new_2025', 'was_in_2024', 'tcs_ion_confirmed',
  'has_barch_college', 'notes', 'city_population_tier', 'year',
];

export default function ExamCentersToolbar({
  years,
  selectedYear,
  onYearChange,
  onAddClick,
  onUploadClick,
  onCloneClick,
  onRefresh,
  centers,
  loading,
}: ExamCentersToolbarProps) {

  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        state: 'Tamil Nadu', city_brochure: 'Chennai', brochure_ref: '19.1',
        latitude: '13.0827', longitude: '80.2707',
        probable_center_1: 'Chennai Institute of Technology (CIT)',
        center_1_address: 'Sarathy Nagar, Kundrathur, Chennai-600069',
        center_1_evidence: 'TCS iON confirmed address',
        probable_center_2: '', center_2_address: '', center_2_evidence: '',
        confidence: 'HIGH', is_new_2025: 'False', was_in_2024: 'True',
        tcs_ion_confirmed: 'True', has_barch_college: 'True',
        notes: '', city_population_tier: 'Metro', year: String(selectedYear),
      },
    ];
    const csv = Papa.unparse({ fields: CSV_HEADERS, data: sampleRows });
    downloadCsv(csv, `nata_exam_centers_template_${selectedYear}.csv`);
  };

  const handleExportData = () => {
    if (centers.length === 0) return;
    const exportData = centers.map((c) => ({
      state: c.state,
      city_brochure: c.city_brochure,
      brochure_ref: c.brochure_ref || '',
      latitude: c.latitude,
      longitude: c.longitude,
      probable_center_1: c.probable_center_1 || '',
      center_1_address: c.center_1_address || '',
      center_1_evidence: c.center_1_evidence || '',
      probable_center_2: c.probable_center_2 || '',
      center_2_address: c.center_2_address || '',
      center_2_evidence: c.center_2_evidence || '',
      confidence: c.confidence,
      is_new_2025: c.is_new_2025,
      was_in_2024: c.was_in_2024,
      tcs_ion_confirmed: c.tcs_ion_confirmed,
      has_barch_college: c.has_barch_college,
      notes: c.notes || '',
      city_population_tier: c.city_population_tier || '',
      year: c.year,
    }));
    const csv = Papa.unparse({ fields: CSV_HEADERS, data: exportData });
    downloadCsv(csv, `nata_exam_centers_${selectedYear}_export.csv`);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 100 }}>
        <InputLabel>Year</InputLabel>
        <Select
          value={selectedYear}
          label="Year"
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {years.map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ flexGrow: 1 }} />

      <Tooltip title="Download CSV template">
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleDownloadTemplate}
        >
          Template
        </Button>
      </Tooltip>

      <Tooltip title="Export current data as CSV">
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportData}
          disabled={centers.length === 0}
        >
          Export
        </Button>
      </Tooltip>

      <Button
        size="small"
        variant="outlined"
        startIcon={<UploadFileIcon />}
        onClick={onUploadClick}
      >
        Upload CSV
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={onCloneClick}
      >
        Clone Year
      </Button>

      <Button
        size="small"
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onAddClick}
      >
        Add Center
      </Button>

      <Tooltip title="Refresh data">
        <IconButton size="small" onClick={onRefresh} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
