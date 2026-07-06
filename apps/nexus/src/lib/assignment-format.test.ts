import { describe, it, expect } from 'vitest';
import { validateSubmissionFormat } from './assignment-format';

const pdf = { mime: 'application/pdf' };
const jpg = { mime: 'image/jpeg' };
const png = { mime: 'image/png' };

describe('validateSubmissionFormat', () => {
  it('rejects an empty submission', () => {
    expect(validateSubmissionFormat('pdf', [])).toMatch(/at least one/i);
    expect(validateSubmissionFormat('pdf_or_image', [])).toMatch(/at least one/i);
  });

  describe("format 'pdf'", () => {
    it('accepts exactly one PDF', () => {
      expect(validateSubmissionFormat('pdf', [pdf])).toBeNull();
    });
    it('rejects an image', () => {
      expect(validateSubmissionFormat('pdf', [jpg])).toMatch(/single PDF/i);
    });
    it('rejects two PDFs', () => {
      expect(validateSubmissionFormat('pdf', [pdf, pdf])).toMatch(/single PDF/i);
    });
  });

  describe("format 'pdf_or_image'", () => {
    it('accepts one PDF', () => {
      expect(validateSubmissionFormat('pdf_or_image', [pdf])).toBeNull();
    });
    it('accepts several images', () => {
      expect(validateSubmissionFormat('pdf_or_image', [jpg, png, jpg])).toBeNull();
    });
    it('rejects mixing a PDF with images', () => {
      expect(validateSubmissionFormat('pdf_or_image', [pdf, jpg])).toMatch(/do not mix/i);
    });
    it('rejects a disallowed mime', () => {
      expect(validateSubmissionFormat('pdf_or_image', [{ mime: 'application/zip' }])).toMatch(
        /only pdf or image/i,
      );
    });
  });

  it('rejects too many files', () => {
    const many = Array.from({ length: 13 }, () => jpg);
    expect(validateSubmissionFormat('pdf_or_image', many)).toMatch(/at most 12/i);
  });

  it('rejects an oversized file', () => {
    expect(
      validateSubmissionFormat('pdf_or_image', [{ mime: 'image/jpeg', size_bytes: 60 * 1024 * 1024 }]),
    ).toMatch(/under 50 MB/i);
  });
});
