import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

let formData: ApplicationFormData = structuredClone(DEFAULT_FORM_DATA);
const updateFormData = vi.fn((section: keyof ApplicationFormData, data: object) => {
  formData = { ...formData, [section]: { ...(formData[section] as object), ...data } } as ApplicationFormData;
});
vi.mock('../FormContext', () => ({
  useFormContext: () => ({ formData, updateFormData }),
}));

import PlaceField from './PlaceField';

const getCurrentPosition = vi.fn();
const lookup = (data: unknown) => vi.fn().mockResolvedValue({ json: async () => data });

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  updateFormData.mockClear();
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PlaceField', () => {
  it('in India asks only the PIN: no state list, no city box', () => {
    const { container } = render(<PlaceField />);
    expect(container.querySelector('input[name="pincode"]')).not.toBeNull();
    expect(container.querySelector('[name="state"]')).toBeNull();
    expect(container.querySelector('[name="city"]')).toBeNull();
  });

  it('a PIN shows the place it found under it, and keeps what the lookup said for staff', async () => {
    vi.stubGlobal('fetch', lookup({ success: true, data: { city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu' } }));
    const { container, rerender } = render(<PlaceField />);
    fireEvent.change(container.querySelector('input[name="pincode"]')!, { target: { value: '625001' } });
    await vi.waitFor(() => expect(formData.location.state).toBe('Tamil Nadu'));
    expect(formData.location).toMatchObject({ city: 'Madurai', locationSource: 'pincode' });
    expect(formData.location.detectedLocation).toMatchObject({ pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', country: 'IN' });
    rerender(<PlaceField />);
    expect(screen.getByTestId('apply-place-line').textContent).toContain('Madurai, Tamil Nadu, India');
  });

  it('Edit opens city and state, and an edit is kept as the student typed it', () => {
    formData.location = { ...formData.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', locationSource: 'pincode' };
    const { container, rerender } = render(<PlaceField />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.editPlace' }));
    fireEvent.change(container.querySelector('input[name="city"]')!, { target: { value: 'Thirumangalam' } });
    expect(formData.location).toMatchObject({ city: 'Thirumangalam', state: 'Tamil Nadu', locationSource: 'manual' });
    rerender(<PlaceField />);
    expect((container.querySelector('input[name="city"]') as HTMLInputElement).value).toBe('Thirumangalam');
  });

  it('a PIN it cannot find says so and opens city and state', async () => {
    vi.stubGlobal('fetch', lookup({ success: false }));
    const { container, rerender } = render(<PlaceField />);
    fireEvent.change(container.querySelector('input[name="pincode"]')!, { target: { value: '999999' } });
    await screen.findByText('aboutYou.pinNotFound');
    rerender(<PlaceField />);
    expect(container.querySelector('input[name="city"]')).not.toBeNull();
  });

  it('never asks for the location on mount, only on the press, and says so when refused', () => {
    getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: { message: string }) => void) => fail({ message: 'denied' }));
    render(<PlaceField />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.useMyLocationShort' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('aboutYou.locationFailed');
  });

  it('Live outside India switches to a country and a city, and the empty mobile follows', () => {
    formData.location = { ...formData.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu' };
    const { container, rerender } = render(<PlaceField />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.liveAbroad' }));
    expect(formData.location).toMatchObject({ country: 'AE', pincode: '', city: '', state: '' });
    expect(formData.personal.phoneCountry).toBe('AE');
    rerender(<PlaceField />);
    expect(container.querySelector('input[name="pincode"]')).toBeNull();
    fireEvent.change(container.querySelector('input[name="city"]')!, { target: { value: 'Dubai' } });
    expect(formData.location.city).toBe('Dubai');
  });

  it('a verified Indian mobile keeps its +91 when the student lives abroad', () => {
    formData.personal = { ...formData.personal, phone: '9876543210', phoneVerified: true };
    render(<PlaceField />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.liveAbroad' }));
    expect(formData.personal.phoneCountry).toBe('IN');
  });

  it('I live in India goes back to the PIN', () => {
    formData.location = { ...formData.location, country: 'QA', city: 'Doha' };
    const { container, rerender } = render(<PlaceField />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.liveInIndia' }));
    expect(formData.location).toMatchObject({ country: 'IN', city: '' });
    rerender(<PlaceField />);
    expect(container.querySelector('input[name="pincode"]')).not.toBeNull();
  });
});
