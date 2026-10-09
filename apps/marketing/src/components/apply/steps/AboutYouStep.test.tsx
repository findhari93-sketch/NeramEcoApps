import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

const trackTaxonomyEvent = vi.fn();
vi.mock('@/lib/funnel-tracker', () => ({ trackTaxonomyEvent: (...args: unknown[]) => trackTaxonomyEvent(...args) }));

let formData: ApplicationFormData = structuredClone(DEFAULT_FORM_DATA);
const updateFormData = vi.fn((section: keyof ApplicationFormData, data: object) => {
  formData = { ...formData, [section]: { ...(formData[section] as object), ...data } } as ApplicationFormData;
});
const setShowPhoneVerification = vi.fn();
const markApplicationStarted = vi.fn();
vi.mock('../FormContext', () => ({
  useFormContext: () => ({
    formData,
    updateFormData,
    isFieldPrefilled: () => false,
    setShowPhoneVerification,
    markApplicationStarted,
  }),
}));

import AboutYouStep from './AboutYouStep';

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  updateFormData.mockClear();
  markApplicationStarted.mockClear();
  trackTaxonomyEvent.mockClear();
});
afterEach(() => cleanup());

describe('AboutYouStep', () => {
  it('asks name, father name, mobile, email, class and the PIN, and nothing from Review', () => {
    const { container } = render(<AboutYouStep />);
    for (const name of ['firstName', 'fatherName', 'phone', 'email', 'pincode']) {
      expect(container.querySelector(`input[name="${name}"]`), name).not.toBeNull();
    }
    for (const name of ['dateOfBirth', 'state', 'city', 'address', 'parentPhone']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull();
    }
    expect(screen.getByRole('group', { name: 'aboutYou.currentlyIn' })).toBeTruthy();
  });

  it('labels every input from above, tied by id', () => {
    render(<AboutYouStep />);
    expect((screen.getByLabelText('aboutYou.fullName') as HTMLInputElement).name).toBe('firstName');
    expect((screen.getByLabelText('aboutYou.fatherName') as HTMLInputElement).name).toBe('fatherName');
    expect((screen.getByLabelText('aboutYou.pinCode') as HTMLInputElement).name).toBe('pincode');
  });

  it('shows the Google card only while signed out, and it opens sign-in', () => {
    const onSignIn = vi.fn();
    render(<AboutYouStep onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.googleTitle/ }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    cleanup();
    render(<AboutYouStep />);
    expect(screen.queryByRole('button', { name: /aboutYou.googleTitle/ })).toBeNull();
  });

  it('Class 12 makes the applicant a school student in class 12', () => {
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.currentlyIn12' }));
    expect(formData.academic.currentlyIn).toBe('12');
    expect(formData.academic.applicantCategory).toBe('school_student');
    expect(formData.academic.schoolStudentData?.current_class).toBe('12');
  });

  it('Repeater records class 12 completed, and keeps a school name already typed', () => {
    formData.academic = {
      ...formData.academic,
      applicantCategory: 'school_student',
      schoolStudentData: { current_class: '11', school_name: 'TVS', board: 'CBSE' },
    };
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.currentlyInRepeater' }));
    expect(formData.academic.schoolStudentData).toMatchObject({ current_class: '12_completed', school_name: 'TVS' });
  });

  it('Other clears a school category so Your studies asks which best describes them', () => {
    formData.academic = {
      ...formData.academic,
      applicantCategory: 'school_student',
      schoolStudentData: { current_class: '11', school_name: '', board: '' },
    };
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.currentlyInOther' }));
    expect(formData.academic.currentlyIn).toBe('other');
    expect(formData.academic.applicantCategory).toBeNull();
  });

  it('shows the class Your studies already holds as selected', () => {
    formData.academic = {
      ...formData.academic,
      applicantCategory: 'school_student',
      schoolStudentData: { current_class: '11', school_name: '', board: '' },
    };
    render(<AboutYouStep />);
    expect(screen.getByRole('button', { name: 'aboutYou.currentlyIn11' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the application as started on the first keystroke, and the manual path once when signed out', () => {
    const { container } = render(<AboutYouStep onSignIn={vi.fn()} />);
    const name = container.querySelector('input[name="firstName"]')!;
    fireEvent.change(name, { target: { value: 'A' } });
    fireEvent.change(name, { target: { value: 'Ar' } });
    expect(markApplicationStarted).toHaveBeenCalled();
    expect(updateFormData).toHaveBeenCalledWith('personal', { firstName: 'A' });
    expect(trackTaxonomyEvent.mock.calls.filter(([e]) => e === 'manual_entry_started')).toHaveLength(1);
  });

  it('does not count a signed-in student as the manual path', () => {
    const { container } = render(<AboutYouStep />);
    fireEvent.change(container.querySelector('input[name="firstName"]')!, { target: { value: 'A' } });
    expect(trackTaxonomyEvent).not.toHaveBeenCalledWith('manual_entry_started');
  });

  it('the country code changes only the mobile, never where the student lives', () => {
    formData.location = { ...formData.location, pincode: '600001', city: 'Chennai' };
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.countryCode/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /United Arab Emirates/ }));
    expect(formData.personal.phoneCountry).toBe('AE');
    expect(formData.location).toMatchObject({ country: 'IN', pincode: '600001', city: 'Chennai' });
  });
});
