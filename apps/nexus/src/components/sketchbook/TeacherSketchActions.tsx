'use client';

import { useState } from 'react';
import { Box, Button, Chip, TextField, Typography } from '@neram/ui';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import type { SketchbookReaction } from '@neram/database/types';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { REACTION_LABEL } from '@/lib/sketchbook-messages';
import type { SketchbookFeatureFact } from '@neram/database/queries/nexus';
import { chatTokenGetter, reactToSketch, unfeatureSketch } from './sketchbook-api';
import FeatureSheet from './FeatureSheet';

const ICONS: Record<SketchbookReaction, React.ReactNode> = {
  heart: <FavoriteBorderOutlinedIcon />,
  fire: <LocalFireDepartmentOutlinedIcon />,
  wow: <AutoAwesomeOutlinedIcon />,
};
const ORDER: SketchbookReaction[] = ['heart', 'fire', 'wow'];

interface TeacherSketchActionsProps {
  sketchId: string;
  reaction: SketchbookReaction | null;
  featured: SketchbookFeatureFact[];
  /** Whose work it is, so the confirm sheet can say who gets told. */
  studentName?: string | null;
  /** Called after any change so the parent can refetch. */
  onChanged: (change: { reaction?: SketchbookReaction | null; featured?: SketchbookFeatureFact[] }) => void;
  /** Compact: the comment box starts collapsed behind a "Comment" toggle (used inside the flip card). */
  compact?: boolean;
  /**
   * Hand the reaction to the parent instead of sending it here. Flip through
   * uses this to answer the tap at once and hold the send for Undo; without it
   * the reaction is sent and awaited in place (the review screen).
   */
  onReact?: (reaction: SketchbookReaction, comment?: string) => void;
  /** With onReact: send the comment on its own, keeping the current reaction. */
  onComment?: (comment: string) => void;
}

export default function TeacherSketchActions({
  sketchId, reaction, featured, studentName, onChanged, compact = false, onReact, onComment,
}: TeacherSketchActionsProps) {
  // Reactions become a Teams chat from this teacher, so they carry the chat-scoped
  // token (the standing rule for anything a teacher presses Send on).
  const { getToken, getTeacherToken } = useNexusAuthContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [sent, setSent] = useState<SketchbookReaction | null>(null);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [error, setError] = useState('');
  const live = featured[0];
  const trimmed = comment.trim();

  const react = async (r: SketchbookReaction) => {
    if (onReact) {
      setSent(r); setComment(''); setError('');
      onReact(r, trimmed || undefined);
      return;
    }
    setBusy(r); setError('');
    try {
      await reactToSketch(chatTokenGetter(getTeacherToken, getToken), sketchId, r, trimmed || undefined);
      setSent(r); setComment('');
      onChanged({ reaction: r });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); } finally { setBusy(null); }
  };

  const sendComment = () => {
    if (!onComment || !trimmed) return;
    setComment('');
    onComment(trimmed);
  };

  return (
    <Box sx={{ mb: 2 }}>
      {/* The three reactions share one even row at every width: on a phone they
          used to wrap to three rows and push Next under the fold. */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        {ORDER.map((r) => (
          <Button key={r} variant={(sent ?? reaction) === r ? 'contained' : 'outlined'} startIcon={ICONS[r]} disabled={busy !== null}
            onClick={() => react(r)} aria-label={REACTION_LABEL[r]} sx={{ minHeight: 48, flex: '1 1 0', minWidth: 0, px: 1 }}>
            {REACTION_LABEL[r]}
          </Button>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 0.5 }}>
        {compact && (
          <Button variant="text" disabled={busy !== null} onClick={() => setCommentOpen((o) => !o)}
            aria-expanded={commentOpen} sx={{ minHeight: 48 }}>
            Comment
          </Button>
        )}
        {live ? (
          <Button variant="text" color="warning" startIcon={<StarOutlinedIcon />} disabled={busy !== null} sx={{ minHeight: 48 }}
            onClick={async () => {
              setBusy('unfeature'); setError('');
              try { await unfeatureSketch(getToken, sketchId, live.classroom_id); onChanged({ featured: [] }); }
              catch (e) { setError(e instanceof Error ? e.message : 'Could not un-feature'); } finally { setBusy(null); }
            }}>
            Un-feature
          </Button>
        ) : (
          <Button variant="text" startIcon={<StarBorderOutlinedIcon />} disabled={busy !== null} onClick={() => setFeatureOpen(true)} sx={{ minHeight: 48 }}>
            Feature
          </Button>
        )}
      </Box>
      {sent && <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>Sent {REACTION_LABEL[sent]}</Typography>}
      {live && <Chip size="small" icon={<StarOutlinedIcon />} color="warning" label={`Featured in ${live.classroom_name}`} sx={{ mt: 1 }} />}
      {(!compact || commentOpen) && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5 }}>
          <TextField
            label={onComment ? 'Add a line (sent with a reaction, or press Send)' : 'Add a line (optional, sent with your reaction)'}
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 300))}
            onKeyDown={(e) => { if (onComment && e.key === 'Enter') { e.preventDefault(); sendComment(); } }}
            fullWidth
            size="small"
            inputProps={{ 'aria-label': 'Comment' }}
          />
          {onComment && (
            <Button variant="outlined" startIcon={<SendOutlinedIcon />} disabled={!trimmed} onClick={sendComment} sx={{ minHeight: 44, flexShrink: 0 }}>
              Send
            </Button>
          )}
        </Box>
      )}
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
      <FeatureSheet open={featureOpen} onClose={() => setFeatureOpen(false)} sketchId={sketchId} studentName={studentName}
        onFeatured={(fact) => onChanged({ featured: [fact] })} />
    </Box>
  );
}
