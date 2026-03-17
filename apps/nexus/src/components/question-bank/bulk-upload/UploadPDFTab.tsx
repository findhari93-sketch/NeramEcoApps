'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { parseNTAAnswerSheet } from '@/lib/nta-parser';
import { ntaParsedToReviewQuestions, type ReviewQuestion } from '@/lib/bulk-upload-schema';

interface UploadPDFTabProps {
  onQuestionsReady: (questions: ReviewQuestion[], warnings: string[]) => void;
}

export default function UploadPDFTab({ onQuestionsReady }: UploadPDFTabProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    // Dynamically import pdfjs-dist for client-side PDF parsing
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => (item.str ?? ''))
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('File too large (max 100 MB)');
      return;
    }

    setError('');
    setLoading(true);
    setFileName(file.name);

    try {
      const text = await extractTextFromPDF(file);

      if (!text.trim()) {
        setError('Could not extract text from this PDF. It may be a scanned image. Try using the JSON upload method with an AI tool like Gemini instead.');
        return;
      }

      const parsed = parseNTAAnswerSheet(text);

      if (parsed.total === 0) {
        setError(
          'No questions found in the extracted text. This PDF may not be in the NTA answer sheet format. ' +
          'Try the JSON upload method — use an AI tool (Gemini, Claude) to extract questions from the PDF.'
        );
        return;
      }

      const reviewQuestions = ntaParsedToReviewQuestions(parsed);
      onQuestionsReady(reviewQuestions, parsed.warnings);
    } catch (err) {
      console.error('PDF processing error:', err);
      setError('Failed to process PDF. Try the Paste Text or JSON upload methods instead.');
    } finally {
      setLoading(false);
    }
  }, [extractTextFromPDF, onQuestionsReady]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload an NTA answer sheet PDF. Text will be extracted and parsed automatically.
        For PDFs with images/diagrams, use the <strong>JSON upload</strong> method with an AI tool for better results.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* File drop zone */}
      <Box
        onClick={() => !loading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
          borderRadius: 3,
          p: 4,
          textAlign: 'center',
          cursor: loading ? 'wait' : 'pointer',
          bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          transition: 'all 150ms',
          '&:hover': loading ? {} : {
            borderColor: theme.palette.primary.main,
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          },
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" fontWeight={600}>
              Extracting text from {fileName}...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This may take a moment for large PDFs
            </Typography>
          </Box>
        ) : (
          <>
            <PictureAsPdfOutlinedIcon sx={{ fontSize: 40, color: 'error.main', mb: 1, opacity: 0.7 }} />
            <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
              Drop PDF here or click to browse
            </Typography>
            <Typography variant="caption" color="text.secondary">
              NTA answer sheet PDF (text-selectable)
            </Typography>
          </>
        )}
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = '';
        }}
      />

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Note:</strong> PDF text extraction works best with text-selectable PDFs.
          Scanned/image-only PDFs won&apos;t work — use the JSON method with an AI tool instead.
        </Typography>
      </Alert>
    </Box>
  );
}
