'use client';

import { useState } from 'react';
import { Avatar, Box, Button, Paper, TextField, Typography } from '@neram/ui';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import SendIcon from '@mui/icons-material/Send';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import type { AdminUserNote } from '@neram/database';

interface AdminNotesSectionProps {
  notes: AdminUserNote[];
  userId: string;
  adminId: string;
  adminName: string;
  onNoteAdded: () => void;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(dateStr);
}

export default function AdminNotesSection({ notes, userId, adminId, adminName, onNoteAdded }: AdminNotesSectionProps) {
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/users/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote, adminId, adminName }),
      });
      if (res.ok) { setNewNote(''); onNoteAdded(); }
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote();
  };

  return (
    <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <StickyNote2Icon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Admin Notes</Typography>
      </Box>

      <Box sx={{ p: 2.5 }}>
        {/* Add note form */}
        <Box sx={{ mb: 2.5, p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', bgcolor: 'grey.50' }}>
          <TextField
            fullWidth multiline rows={2} size="small"
            placeholder="Write a note about this user... (Ctrl+Enter to submit)"
            value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={handleKeyDown}
            sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 0.75, fontSize: 13 } }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="small" endIcon={<SendIcon sx={{ fontSize: 14 }} />}
              onClick={handleAddNote} disabled={!newNote.trim() || saving}
              sx={{ borderRadius: 0.75, textTransform: 'none', fontWeight: 500, boxShadow: 'none', px: 2.5 }}
            >
              {saving ? 'Saving...' : 'Add Note'}
            </Button>
          </Box>
        </Box>

        {/* Notes list */}
        {notes.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <NoteAddIcon sx={{ fontSize: 32, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">No notes yet. Add the first one above.</Typography>
          </Box>
        ) : (
          notes.map((note, index) => (
            <Box key={note.id} sx={{
              p: 2, mb: index < notes.length - 1 ? 1.5 : 0, bgcolor: 'background.paper', borderRadius: 1,
              border: '1px solid', borderColor: 'grey.100', borderLeft: '3px solid', borderLeftColor: 'primary.main',
              transition: 'box-shadow 0.15s', '&:hover': { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar sx={{ width: 24, height: 24, fontSize: 10, fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                  {note.admin_name?.charAt(0) || 'A'}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>{note.admin_name}</Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>{timeAgo(note.created_at)}</Typography>
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'text.primary' }}>
                {note.note}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
}
