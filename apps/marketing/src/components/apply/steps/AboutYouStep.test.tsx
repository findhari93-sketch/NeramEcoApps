import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

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

const getCurrentPosition = vi.fn();

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  updateFormData.mockClear();
  getCurrentPosition.mockClear();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
});
afterEach(() => cleanup());

describe('AboutYouStep', () => {
  it('never asks for the location on mount', () => {
    render(<AboutYouStep />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('asks for the location only when the student presses the button', () => {
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.useMyLocation' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('shows the PIN-code fallback copy when the browser refuses', () => {
    getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: { message: string }) => void) => fail({ message: 'denied' }));
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.useMyLocation' }));
    expect(screen.getByRole('alert').textContent).toContain('aboutYou.locationFailed');
  });

  it('renders every field one per row with the parent phone and optional email', () => {
    const { container } = render(<AboutYouStep />);
    for (const name of ['firstName', 'fatherName', 'dateOfBirth', 'pincode', 'phone', 'parentPhone', 'email']) {
      expect(container.querySelector(`input[name="${name}"]`), name).not.toBeNull();
    }
    expect(container.querySelector('input[name="email"]')?.hasAttribute('required')).toBe(false);
  });

  it('shows the found city and state under the PIN code', () => {
    formData.location = { ...formData.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', locationSource: 'pincode' };
    render(<AboutYouStep />);
    expect(screen.getByText('aboutYou.pinFound:Madurai,Tamil Nadu')).toBeTruthy();
  });

  it('marks the application as started on the first keystroke', () => {
    const { container } = render(<AboutYouStep />);
    fireEvent.change(container.querySelector('input[name="firstName"]')!, { target: { value: 'A' } });
    expect(markApplicationStarted).toHaveBeenCalled();
    expect(updateFormData).toHaveBeenCalledWith('personal', { firstName: 'A' });
  });
});
