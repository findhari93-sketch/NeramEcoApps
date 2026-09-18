'use client';

import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { addSketchBody, practiseBody } from './sketchbook-api';

interface AddSketchSheetProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  /** "Practise this" from an Inspiration drawing: pins it as the reference and links the sketch to it. */
  practise?: { itemId: string; imageUrl: string; title: string } | null;
}

/** The drawing module's sheet, in sketchbook clothes: one photo, one optional line, a thumbnail. */
export default function AddSketchSheet({ open, onClose, onAdded, practise = null }: AddSketchSheetProps) {
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
      submitBody={practise ? practiseBody(practise.itemId) : addSketchBody}
      referenceImageUrl={practise?.imageUrl ?? null}
      title={practise ? 'Practise this drawing' : 'Add a sketch'}
      intro={
        practise
          ? `Draw your own version of "${practise.title}", then take a photo of it.`
          : 'Assignment drawings appear in your sketchbook on their own, so there is no need to add them here.'
      }
      noteLabel="One line about this sketch (optional)"
      notePlaceholder="What did you draw, or what did you try?"
      noteMaxLength={80}
      submitLabel="Add to sketchbook"
    />
  );
}
