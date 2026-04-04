'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Chip,
  alpha,
  useTheme,
  CircularProgress,
} from '@neram/ui';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { parseCoursePlanCSV } from '@/lib/course-plan-csv-parser';
import type {
  CoursePlanCSVData,
  TeacherMapping,
  PlanConfig,
} from '@/lib/course-plan-csv-schema';

interface UploadStepProps {
  planId: string;
  planConfig: PlanConfig;
  teacherMappings: TeacherMapping[];
  onParsed: (data: CoursePlanCSVData) => void;
  getToken: () => Promise<string | null>;
}

export default function UploadStep({
  planId,
  planConfig,
  teacherMappings,
  onParsed,
  getToken,
}: UploadStepProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [warningCount, setWarningCount] = useState(0);
  const [parsedData, setParsedData] = useState<CoursePlanCSVData | null>(null);

  const handleDownloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/csv-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to download template');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `course-plan-template-${planId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setParseErrors([
        err instanceof Error ? err.message : 'Download failed',
      ]);
    } finally {
      setDownloading(false);
    }
  }, [planId, getToken]);

  const processFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      setParsing(true);
      setParseErrors([]);
      setWarningCount(0);
      setParsedData(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const result = parseCoursePlanCSV(text, teacherMappings, planConfig);

          if (!result.valid) {
            setParseErrors(
              result.errors.map(
                (err) =>
                  `[${err.section}${err.column ? `:${err.column}` : ''} row ${err.row}] ${err.message}`
              )
            );
            setParsing(false);
            return;
          }

          setWarningCount(result.warnings.length);
          setParsedData(result.data);
        } catch (err) {
          setParseErrors([
            err instanceof Error ? err.message : 'Failed to parse CSV',
          ]);
        } finally {
          setParsing(false);
        }
      };

      reader.onerror = () => {
        setParseErrors(['Failed to read file']);
        setParsing(false);
      };

      reader.readAsText(file);
    },
    [teacherMappings, planConfig]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        setParseErrors(['Please upload a .csv file']);
      }
    },
    [processFile]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Template download section */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2.5 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <DescriptionOutlinedIcon
            sx={{
              fontSize: 32,
              color: 'primary.main',
              mt: 0.5,
              display: { xs: 'none', sm: 'block' },
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              Step 1: Download the CSV Template
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2 }}
            >
              The template has all session slots pre-filled for your plan.
              Open it in Google Sheets or Excel, fill in titles, teachers,
              and homework, then upload it below.
            </Typography>

            {/* Teacher abbreviations hint */}
            {teacherMappings.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  flexWrap: 'wrap',
                  mb: 2,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Teachers:
                </Typography>
                {teacherMappings.map((t) => (
                  <Chip
                    key={t.user_id}
                    label={`${t.abbreviation} = ${t.name}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 24 }}
                  />
                ))}
              </Box>
            )}

            <Button
              variant="contained"
              startIcon={
                downloading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <DownloadOutlinedIcon />
                )
              }
              onClick={handleDownloadTemplate}
              disabled={downloading}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {downloading ? 'Downloading...' : 'Download CSV Template'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* File upload section */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2.5 }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Step 2: Upload Filled CSV
        </Typography>

        {/* Drop zone */}
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: dragOver
              ? 'primary.main'
              : parsedData
                ? 'success.main'
                : 'divider',
            borderRadius: 2,
            bgcolor: dragOver
              ? alpha(theme.palette.primary.main, 0.04)
              : parsedData
                ? alpha(theme.palette.success.main, 0.04)
                : 'transparent',
            p: { xs: 3, sm: 4 },
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 200ms ease',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.02),
            },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {parsing ? (
            <>
              <CircularProgress size={40} sx={{ mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary">
                Parsing CSV...
              </Typography>
            </>
          ) : parsedData ? (
            <>
              <CheckCircleOutlineIcon
                sx={{ fontSize: 48, color: 'success.main', mb: 1 }}
              />
              <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
                {fileName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {parsedData.sessions.length} sessions,{' '}
                {parsedData.weeks.length} weeks,{' '}
                {parsedData.tests.length} tests,{' '}
                {parsedData.drills.length} drills,{' '}
                {parsedData.resources.length} resources
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                Click to upload a different file
              </Typography>
            </>
          ) : (
            <>
              <UploadFileOutlinedIcon
                sx={{
                  fontSize: 48,
                  color: dragOver ? 'primary.main' : 'text.secondary',
                  mb: 1,
                }}
              />
              <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
                {dragOver
                  ? 'Drop your CSV here'
                  : 'Drag and drop your CSV file here'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                or click to browse
              </Typography>
            </>
          )}
        </Box>

        {/* Errors */}
        {parseErrors.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              CSV parsing failed ({parseErrors.length} error
              {parseErrors.length > 1 ? 's' : ''})
            </Typography>
            <Box
              component="ul"
              sx={{ m: 0, pl: 2, '& li': { fontSize: '0.8rem' } }}
            >
              {parseErrors.slice(0, 10).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {parseErrors.length > 10 && (
                <li>...and {parseErrors.length - 10} more errors</li>
              )}
            </Box>
          </Alert>
        )}

        {/* Warnings */}
        {parsedData && warningCount > 0 && (
          <Alert
            severity="warning"
            icon={<WarningAmberIcon />}
            sx={{ mt: 2 }}
          >
            {warningCount} warning{warningCount > 1 ? 's' : ''} detected
            (non-blocking). Review the data in the next step.
          </Alert>
        )}

        {/* Continue button */}
        {parsedData && (
          <Button
            variant="contained"
            fullWidth
            onClick={() => onParsed(parsedData)}
            sx={{ mt: 2, minHeight: 48, textTransform: 'none' }}
          >
            Continue to Review
          </Button>
        )}
      </Paper>
    </Box>
  );
}
