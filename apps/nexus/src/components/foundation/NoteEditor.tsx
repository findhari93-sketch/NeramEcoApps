'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Typography, TextField, alpha, useTheme } from '@neram/ui';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';

interface NoteEditorProps {
  sectionId: string;
  sectionTitle: string;
  initialNote?: string;
  onSave: (sectionId: string, noteText: string) => Promise<void>;
}

export default function NoteEditor({
  sectionId,
  sectionTitle,
  initialNote,
  onSave,
}: NoteEditorProps) {
  const theme = useTheme();
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(initialNote || '');

  // Reset when section changes
  useEffect(() => {
    setNote(initialNote || '');
    lastSavedRef.current = initialNote || '';
    setSaved(false);
  }, [sectionId, initialNote]);

  const saveNote = useCallback(async (text: string) => {
    if (text === lastSavedRef.current) return;
    setSaving(true);
    try {
      await onSave(sectionId, text);
      lastSavedRef.current = text;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  }, [sectionId, onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNote(text);
    setSaved(false);

    // Debounce auto-save (2 seconds)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveNote(text), 2000);
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <NoteOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>
          Notes
        </Typography>
        {saving && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SaveOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              Saving...
            </Typography>
          </Box>
        )}
        {saved && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CloudDoneOutlinedIcon sx={{ fontSize: '0.8rem', color: theme.palette.success.main }} />
            <Typography variant="caption" sx={{ color: theme.palette.success.main, fontSize: '0.65rem' }}>
              Saved
            </Typography>
          </Box>
        )}
      </Box>

      <TextField
        multiline
        minRows={3}
        maxRows={8}
        fullWidth
        placeholder={`Take notes for "${sectionTitle}"...`}
        value={note}
        onChange={handleChange}
        variant="outlined"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            fontSize: '0.85rem',
            bgcolor: alpha(theme.palette.background.paper, 0.5),
            '& fieldset': {
              borderColor: alpha(theme.palette.divider, 0.5),
            },
            '&:hover fieldset': {
              borderColor: alpha(theme.palette.primary.main, 0.3),
            },
            '&.Mui-focused fieldset': {
              borderColor: theme.palette.primary.main,
              borderWidth: 1,
            },
          },
        }}
      />
    </Box>
  );
}
