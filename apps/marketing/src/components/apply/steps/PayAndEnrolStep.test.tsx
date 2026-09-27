import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));
const panel = vi.fn((_props: unknown) => <div data-testid="payment-panel" />);
vi.mock('../PaymentPanel', () => ({ default: (props: unknown) => panel(props) }));

const refreshApplications = vi.fn();
const setActiveStep = vi.fn();
const forgetDraft = vi.fn();
let submittedApplication: { id: string; applicationNumber: string | null } | null = null;
vi.mock('../FormContext', () => ({
  useFormContext: () => ({
    formData: {
      ...DEFAULT_FORM_DATA,
      course: { ...DEFAULT_FORM_DATA.course, interestCourse: 'nata', feeStructureLabel: 'NATA 1 Year', learningMode: 'online_only' },
    },
    submittedApplication,
    refreshApplications,
    setActiveStep,
    forgetDraft,
  }),
}));

import PayAndEnrolStep from './PayAndEnrolStep';

afterEach(() => cleanup());

describe('PayAndEnrolStep', () => {
  it('shows the application number, the enrolment card, what happens after payment, and the panel', () => {
    submittedApplication = { id: 'lead-1', applicationNumber: 'NERAM-2609-00042' };
    render(<PayAndEnrolStep />);
    expect(screen.getByText('pay.applicationNumber:NERAM-2609-00042')).toBeTruthy();
    expect(screen.getByText('pay.yourEnrolment')).toBeTruthy();
    expect(screen.getByText('NATA 1 Year')).toBeTruthy();
    expect(screen.getByText('pay.whatHappens1')).toBeTruthy();
    expect(screen.getByTestId('payment-panel')).toBeTruthy();
    expect(panel).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1', active: true }));
  });

  it('shows a retry message instead of the panel when nothing was submitted', () => {
    submittedApplication = null;
    render(<PayAndEnrolStep />);
    expect(screen.queryByTestId('payment-panel')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('pay.submitFailed');
  });

  it('offers Change details back to Review until the payment starts', () => {
    submittedApplication = { id: 'lead-1', applicationNumber: 'NERAM-2609-00042' };
    render(<PayAndEnrolStep />);
    fireEvent.click(screen.getByRole('button', { name: 'pay.changeDetails' }));
    expect(setActiveStep).toHaveBeenCalledWith(2);
    const props = panel.mock.calls.at(-1)![0] as any;
    act(() => props.onStateChange({ paymentSuccess: false, isProcessing: true }));
    expect(screen.queryByRole('button', { name: 'pay.changeDetails' })).toBeNull();
  });

  it('forgets the saved draft once the payment succeeds', async () => {
    submittedApplication = { id: 'lead-1', applicationNumber: 'NERAM-2609-00042' };
    render(<PayAndEnrolStep />);
    const props = panel.mock.calls.at(-1)![0] as any;
    await act(async () => props.onPaymentComplete());
    expect(forgetDraft).toHaveBeenCalled();
    expect(refreshApplications).toHaveBeenCalled();
  });
});
