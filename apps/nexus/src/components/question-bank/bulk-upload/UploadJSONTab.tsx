'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme,
  Divider,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { parseJSONFile } from '@/lib/json-parser';
import { AI_PROMPT_TEMPLATE, type ReviewQuestion } from '@/lib/bulk-upload-schema';

interface UploadJSONTabProps {
  onQuestionsReady: (questions: ReviewQuestion[], warnings: string[]) => void;
}

export default function UploadJSONTab({ onQuestionsReady }: UploadJSONTabProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await parseJSONFile(file);
      if (!result.valid) {
        setError(result.errors.join('\n'));
        return;
      }
      onQuestionsReady(result.questions, result.warnings);
    } catch {
      setError('Failed to read file');
    } finally {
      setLoading(false);
    }
  }, [onQuestionsReady]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box>
      {/* Instructions accordion */}
      <Accordion
        elevation={0}
        disableGutters
        defaultExpanded
        sx={{
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '12px !important',
          mb: 2,
          overflow: 'hidden',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToyOutlinedIcon sx={{ fontSize: '1.15rem', color: theme.palette.info.main }} />
            <Typography variant="body2" fontWeight={700}>
              How to generate JSON using AI tools
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Use any AI tool that supports PDF input to extract questions from an answer sheet or question paper.
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          {/* Step-by-step instructions */}
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', mb: 1, display: 'block' }}>
            Steps
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, mb: 2 }}>
            {[
              'Open Google Gemini (gemini.google.com) or Claude (claude.ai).',
              'Upload the NTA answer sheet PDF or question paper PDF.',
              'Copy the prompt below and paste it into the AI chat.',
              'The AI will output a JSON object. Copy the entire JSON.',
              'Save it as a .json file, or paste it here.',
              'Review the extracted questions in the preview panel and fix any errors.',
            ].map((step, i) => (
              <Box component="li" key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2">{step}</Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', mb: 1, display: 'block' }}>
            AI tools that work well
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {[
              { name: 'Google Gemini', note: 'Best for PDFs with images — extracts diagrams as base64' },
              { name: 'Claude', note: 'Great text extraction — may need separate image upload' },
              { name: 'ChatGPT', note: 'Works with PDF upload — image extraction varies' },
            ].map((tool) => (
              <Paper
                key={tool.name}
                variant="outlined"
                sx={{ px: 1.5, py: 1, borderRadius: 2, flex: '1 1 200px' }}
              >
                <Typography variant="body2" fontWeight={600}>{tool.name}</Typography>
                <Typography variant="caption" color="text.secondary">{tool.note}</Typography>
              </Paper>
            ))}
          </Box>

          <Divider sx={{ my: 1.5 }} />

          {/* Prompt to copy */}
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', mb: 1, display: 'block' }}>
            Prompt to use
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.info.main, 0.04),
              maxHeight: 200,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {AI_PROMPT_TEMPLATE}
          </Paper>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyPrompt}
            sx={{ mt: 1 }}
          >
            {copied ? 'Copied!' : 'Copy Prompt'}
          </Button>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Tip:</strong> After the AI generates the JSON, save it as a <code>.json</code> file
              and upload it below. You can review and edit every question before importing.
            </Typography>
          </Alert>
        </AccordionDetails>
      </Accordion>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* File drop zone */}
      <Box
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
          borderRadius: 3,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          transition: 'all 150ms',
          '&:hover': {
            borderColor: theme.palette.primary.main,
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          },
        }}
      >
        <UploadFileOutlinedIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
        <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
          {loading ? 'Processing...' : 'Drop .json file here or click to browse'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Upload the JSON file generated by your AI tool
        </Typography>
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = '';
        }}
      />
    </Box>
  );
}
