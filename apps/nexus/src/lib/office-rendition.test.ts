import { describe, it, expect } from 'vitest';
import { fileExtension, isPresentation, needsPdfRendition } from './office-rendition';

describe('fileExtension', () => {
  it('reads the extension in lower case', () => {
    expect(fileExtension('Perspective Basics.PPTX')).toBe('pptx');
    expect(fileExtension('notes.pdf')).toBe('pdf');
  });

  it('returns empty for the shapes that have no usable extension', () => {
    expect(fileExtension('Recordings')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
    // A leading dot is a hidden file, not an extension.
    expect(fileExtension('.gitignore')).toBe('');
    expect(fileExtension('')).toBe('');
    expect(fileExtension(null)).toBe('');
  });

  it('takes the LAST dot, so a versioned name still resolves', () => {
    expect(fileExtension('shadows.v2.final.pptx')).toBe('pptx');
  });
});

describe('needsPdfRendition', () => {
  it('converts the Office formats a teacher actually attaches', () => {
    expect(
      needsPdfRendition(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).toBe(true);
    expect(needsPdfRendition('application/vnd.ms-powerpoint')).toBe(true);
    expect(
      needsPdfRendition('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
    expect(needsPdfRendition('application/msword')).toBe(true);
  });

  it('leaves PDFs and images alone', () => {
    // The reader already handles these. Converting a PDF to a PDF would be a
    // wasted Graph call on every single open.
    expect(needsPdfRendition('application/pdf')).toBe(false);
    expect(needsPdfRendition('image/png')).toBe(false);
    expect(needsPdfRendition('image/jpeg', 'board.jpg')).toBe(false);
  });

  it('tolerates a charset parameter on the mime type', () => {
    expect(needsPdfRendition('application/pdf; charset=binary')).toBe(false);
  });

  it('falls back to the extension when the mime type is missing or wrong', () => {
    // This is the case that matters in production: a file LINKED from SharePoint
    // carries whatever Graph reported, and an uploaded one carries whatever the
    // browser guessed. A deck that silently downloads instead of opening would be
    // reported as "the viewer is broken".
    expect(needsPdfRendition(null, 'Perspective Basics.pptx')).toBe(true);
    expect(needsPdfRendition('application/octet-stream', 'shadows.pptx')).toBe(true);
    expect(needsPdfRendition('', 'brief.docx')).toBe(true);
  });

  it('does not convert things it cannot render', () => {
    expect(needsPdfRendition('application/zip', 'pack.zip')).toBe(false);
    expect(needsPdfRendition('video/mp4', 'class.mp4')).toBe(false);
    expect(needsPdfRendition(null, 'notes.txt')).toBe(false);
  });

  it('prefers the mime type over a misleading extension', () => {
    // A PDF named ".pptx" is still a PDF and must not be sent for conversion.
    expect(needsPdfRendition('application/pdf', 'mislabelled.pptx')).toBe(false);
  });
});

describe('isPresentation', () => {
  it('spots a deck by mime or by extension', () => {
    expect(
      isPresentation('application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ).toBe(true);
    expect(isPresentation('application/vnd.ms-powerpoint')).toBe(true);
    expect(isPresentation(null, 'shadows.pptx')).toBe(true);
    expect(isPresentation(null, 'deck.odp')).toBe(true);
  });

  it('does not call a document or a PDF a deck', () => {
    expect(isPresentation('application/pdf', 'notes.pdf')).toBe(false);
    expect(isPresentation(null, 'brief.docx')).toBe(false);
  });
});
