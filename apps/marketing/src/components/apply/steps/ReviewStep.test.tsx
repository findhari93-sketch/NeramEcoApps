import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key;
  (t as any).rich = (key: string) => key;
  return { useTranslations: () => t };
});
vi.mock('@/components/legal/LegalDrawer', () => ({ default: () => null }));

let formData: ApplicationFormData = structuredClone(DEFAULT_FORM_DATA);
const setTermsAccepted = vi.fn();
vi.mock('../FormContext', () => ({
  useFormContext: () => ({ formData, setTermsAccepted }),
}));

import ReviewStep from './ReviewStep';

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  formData.personal = { ...formData.personal, firstName: 'Arun', fatherName: 'Rajendran', phone: '9876543210', phoneVerified: true, parentPhone: '9123456789', email: 'arun@example.com' };
  formData.course = { ...formData.course, interestCourse: 'nata', feeStructureLabel: 'NATA 1 Year', learningMode: 'online_only' };
  formData.academic = { ...formData.academic, applicantCategory: 'school_student', targetExamYear: '2027-28', schoolStudentData: { current_class: '11', school_name: 'TVS', board: 'CBSE' } };
  setTermsAccepted.mockClear();
});
afterEach(() => cleanup());

describe('ReviewStep', () => {
  it('shows three groups, each with an Edit that returns to its step', () => {
    const onEditStep = vi.fn();
    render(<ReviewStep onEditStep={onEditStep} />);
    expect(screen.getByText('review.aboutYou')).toBeTruthy();
    expect(screen.getByText('review.yourCourse')).toBeTruthy();
    expect(screen.getByText('review.contact')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'review.edit:review.yourCourse' }));
    expect(onEditStep).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'review.edit:review.contact' }));
    expect(onEditStep).toHaveBeenLastCalledWith(0);
  });

  it('shows the programme, the parent phone and the email', () => {
    render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.getByText('NATA 1 Year')).toBeTruthy();
    expect(screen.getByText('9123456789')).toBeTruthy();
    expect(screen.getByText('arun@example.com')).toBeTruthy();
  });

  it('has a named terms checkbox that reports to the context', () => {
    const { container } = render(<ReviewStep onEditStep={vi.fn()} />);
    const box = container.querySelector('input[name="termsAccepted"]') as HTMLInputElement;
    expect(box).not.toBeNull();
    fireEvent.click(box);
    expect(setTermsAccepted).toHaveBeenCalledWith(true);
  });

  it('never shows the old 24 to 48 hour promise', () => {
    render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.queryByText(/24-48 hours/)).toBeNull();
  });
});
