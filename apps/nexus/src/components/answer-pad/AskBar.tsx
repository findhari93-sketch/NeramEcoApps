'use client';

/**
 * The next question, always within reach: docked at the bottom of the side
 * panel like the compose box in a Teams chat, or in its own column in a wide
 * window. The teacher snips the question, presses Ctrl + V and Ask, with no
 * scrolling, in every state of the class: ready, while a question is open
 * (which Ask closes first), while one waits for its answer, after a reveal.
 *
 * Everything else about the question (its text, the option texts) folds under
 * More, so the bar stays three short rows on a 300px panel.
 */

import { useId, useState, type MouseEvent } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@neram/ui';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import { answerTypeLabel } from '@/lib/pad/client/format';
import type { AnswerType } from '@/lib/pad/client/types';
import PastePicture from './PastePicture';

/** Every choice of the answer-type menu: multiple choice at each size, then the rest. */
const TYPE_CHOICES: Array<{ type: AnswerType; count: number | null }> = [
  { type: 'mcq', count: 2 },
  { type: 'mcq', count: 3 },
  { type: 'mcq', count: 4 },
  { type: 'mcq', count: 5 },
  { type: 'mcq', count: 6 },
  { type: 'numeric', count: null },
  { type: 'text', count: null },
  { type: 'yesno', count: null },
];

function choiceLabel(type: AnswerType, count: number | null): string {
  if (type === 'mcq' && count === 2) return 'A or B';
  return answerTypeLabel(type, count);
}

export interface AskBarProps {
  /** The paper's question number ("33"). */
  label: string;
  onLabel: (label: string) => void;
  answerType: AnswerType;
  onAnswerType: (type: AnswerType) => void;
  optionCount: number;
  onOptionCount: (count: number) => void;
  text: string;
  onText: (text: string) => void;
  image: string | null;
  onImage: (url: string | null) => void;
  options: string[];
  onOptions: (options: string[]) => void;
  uploadPicture: (file: File) => Promise<{ url: string }>;
  /** "Q.33", for the paste box. */
  questionTitle: string;
  /** The ask itself is in flight. */
  busy: boolean;
  /** Any action is in flight: the bar waits, and a paste waits with it. */
  disabled: boolean;
  buttonLabel: string;
  /** The main action of the screen right now, or a second one beside Close answers or Reveal. */
  emphasis: 'primary' | 'secondary';
  /** One line above the button: what asking does to the question on screen. */
  note?: string | null;
  onAsk: () => void;
  /** A picture just pasted in: the console may offer it to the open question instead. */
  onPasted?: (url: string) => void;
}

export default function AskBar(props: AskBarProps) {
  const {
    label,
    onLabel,
    answerType,
    onAnswerType,
    optionCount,
    onOptionCount,
    text,
    onText,
    image,
    onImage,
    options,
    onOptions,
    uploadPicture,
    questionTitle,
    busy,
    disabled,
    buttonLabel,
    emphasis,
    note,
    onAsk,
    onPasted,
  } = props;
  const moreId = useId();
  const narrow = useMediaQuery('(max-width:339.95px)');
  const [typeAnchor, setTypeAnchor] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  const letters = 'ABCDEF'.slice(0, optionCount).split('');
  const filledDetails = (text.trim() ? 1 : 0) + (answerType === 'mcq' ? options.slice(0, optionCount).filter((entry) => entry?.trim()).length : 0);

  const setOption = (index: number, value: string) => {
    const next = Array.from({ length: Math.max(optionCount, options.length) }, (_, i) => options[i] ?? '');
    next[index] = value;
    onOptions(next);
  };

  return (
    <Stack component="section" aria-label="Next question" spacing={1}>
      <Collapse in={more} unmountOnExit>
        <Stack id={moreId} spacing={1.25} sx={{ maxHeight: '45vh', overflowY: 'auto', pt: 0.5, pb: 0.5 }}>
          <TextField
            size="small"
            label="Question (optional)"
            value={text}
            onChange={(event) => onText(event.target.value)}
            multiline
            minRows={1}
            maxRows={4}
            inputProps={{ maxLength: 500 }}
            helperText="Tip: Windows + H types by voice."
          />
          {answerType === 'mcq' &&
            letters.map((letter, index) => (
              <TextField
                key={letter}
                size="small"
                label={`Option ${letter} (optional)`}
                value={options[index] ?? ''}
                onChange={(event) => setOption(index, event.target.value)}
                inputProps={{ maxLength: 200 }}
              />
            ))}
        </Stack>
      </Collapse>

      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          value={label}
          onChange={(event) => onLabel(event.target.value)}
          inputProps={{ maxLength: 80, autoComplete: 'off', 'aria-label': 'Question number, as printed on the paper' }}
          InputProps={{ startAdornment: <InputAdornment position="start">Q.</InputAdornment> }}
          placeholder="33"
          sx={{ width: narrow ? 84 : 96, flexShrink: 0, '& .MuiInputBase-root': { minHeight: 44 } }}
        />
        <Button
          variant="outlined"
          color="inherit"
          onClick={(event: MouseEvent<HTMLElement>) => setTypeAnchor(event.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={typeAnchor ? true : undefined}
          aria-label={`Answer type: ${choiceLabel(answerType, answerType === 'mcq' ? optionCount : null)}. Change`}
          endIcon={<ExpandMoreRounded />}
          sx={{ minHeight: 44, flex: 1, minWidth: 0, justifyContent: 'space-between', textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {choiceLabel(answerType, answerType === 'mcq' ? optionCount : null)}
          </Box>
        </Button>
        <Tooltip title={more ? 'Hide question details' : 'Question text and option texts'}>
          <IconButton
            onClick={() => setMore(!more)}
            aria-expanded={more}
            aria-controls={moreId}
            aria-label={more ? 'Hide question details' : `More: question text and option texts${filledDetails ? `, ${filledDetails} filled in` : ''}`}
            sx={{ width: 44, height: 44, flexShrink: 0, color: filledDetails ? 'primary.main' : undefined }}
          >
            {more ? <ExpandLessRounded /> : <TuneRounded />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Menu anchorEl={typeAnchor} open={!!typeAnchor} onClose={() => setTypeAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {TYPE_CHOICES.map((choice) => {
          const chosen = answerType === choice.type && (choice.type !== 'mcq' || optionCount === choice.count);
          return (
            <MenuItem
              key={`${choice.type}-${choice.count ?? ''}`}
              selected={chosen}
              onClick={() => {
                onAnswerType(choice.type);
                if (choice.count) onOptionCount(choice.count);
                setTypeAnchor(null);
              }}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon>{chosen ? <CheckRounded fontSize="small" /> : null}</ListItemIcon>
              <ListItemText primary={choiceLabel(choice.type, choice.count)} />
            </MenuItem>
          );
        })}
      </Menu>

      <PastePicture
        value={image}
        onChange={onImage}
        upload={uploadPicture}
        busy={disabled}
        questionTitle={questionTitle}
        onPasted={onPasted}
      />

      {note && (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {note}
        </Typography>
      )}
      <Button
        variant={emphasis === 'primary' ? 'contained' : 'outlined'}
        size="large"
        onClick={onAsk}
        disabled={disabled}
        startIcon={busy ? <CircularProgress size={20} color="inherit" aria-hidden /> : <CampaignRounded />}
        sx={{ minHeight: 52, fontSize: '1.0625rem', fontWeight: 800, touchAction: 'manipulation', lineHeight: 1.2 }}
      >
        {buttonLabel}
      </Button>
    </Stack>
  );
}
