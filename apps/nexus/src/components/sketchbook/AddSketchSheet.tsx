'use client';

import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { addSketchBody } from './sketchbook-api';

interface AddSketchSheetProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

/** The drawing module's sheet, in sketchbook clothes: one photo, one optional line, a thumbnail. */
export default function AddSketchSheet({ open, onClose, onAdded }: AddSketchSheetProps) {
  const { getToken } = useNexusAuthContext();
  return (
    <DrawingSubmissionSheet
      open={open}
      onClose={onClose}
      sourceType="sketchbook"
      getToken={getToken}
      onSubmitted={onAdded}
      withThumbnail
      submitUrl="/api/sketchbook/entries"
      submitBody={addSketchBody}
      title="Add a sketch"
      noteLabel="One line about this sketch (optional)"
      notePlaceholder="What did you draw, or what did you try?"
      noteMaxLength={80}
      submitLabel="Add to sketchbook"
    />
  );
}
