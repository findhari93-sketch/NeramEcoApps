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
const updateFormData = vi.fn((section: keyof ApplicationFormData, data: object) => {
  formData = { ...formData, [section]: { ...(formData[section] as object), ...data } } as ApplicationFormData;
});
vi.mock('../FormContext', () => ({
  useFormContext: () => ({ formData, setTermsAccepted, updateFormData }),
}));

const getCurrentPosition = vi.fn();

import ReviewStep from './ReviewStep';

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  formData.personal = { ...formData.personal, firstName: 'Arun', fatherName: 'Rajendran', phone: '9876543210', phoneVerified: true, parentPhone: '9123456789', email: 'arun@example.com' };
  formData.course = { ...formData.course, interestCourse: 'nata', feeStructureLabel: 'NATA 1 Year', learningMode: 'online_only' };
  formData.academic = { ...formData.academic, applicantCategory: 'school_student', targetExamYear: '2027-28', schoolStudentData: { current_class: '11', school_name: 'TVS', board: 'CBSE' } };
  setTermsAccepted.mockClear();
  updateFormData.mockClear();
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
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

  it('shows the programme and the email, with the parent phone editable in A few more details', () => {
    const { container } = render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.getByText('NATA 1 Year')).toBeTruthy();
    expect(screen.getByText('arun@example.com')).toBeTruthy();
    expect((container.querySelector('input[name="parentPhone"]') as HTMLInputElement).value).toBe('9123456789');
  });

  it('asks only date of birth, gender, address and parent mobile; name, father name and place are on step 1', () => {
    const { container } = render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'review.moreDetails' })).toBeTruthy();
    for (const name of ['dateOfBirth', 'address', 'parentPhone']) {
      expect(container.querySelector(`[name="${name}"]`), name).not.toBeNull();
    }
    expect(screen.getByRole('group', { name: 'aboutYou.gender' })).toBeTruthy();
    for (const name of ['fatherName', 'pincode', 'state', 'city']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull();
    }
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('the summary shows the father name and where the student lives, PIN included', () => {
    formData.location = { ...formData.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', locationSource: 'pincode' };
    render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.getByText('Rajendran')).toBeTruthy();
    expect(screen.getByText('Madurai, Tamil Nadu, India, 625001')).toBeTruthy();
  });

  it('shows a mobile with its own code, and abroad the country by name', () => {
    formData.personal = { ...formData.personal, phone: '501234567', phoneCountry: 'AE' };
    formData.location = { ...formData.location, country: 'AE', city: 'Dubai' };
    render(<ReviewStep onEditStep={vi.fn()} />);
    expect(screen.getByText('+971 501234567')).toBeTruthy();
    expect(screen.getByText('Dubai, United Arab Emirates')).toBeTruthy();
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
