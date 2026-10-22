import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The barrel pulls in the locale router; ReviewStep only needs the tokens.
vi.mock('@/design-system', async () => {
  const actual = await vi.importActual<any>('@/design-system/tokens');
  return { ...actual };
});

import ReviewStep from './ReviewStep';
import { DEFAULT_FORM_DATA } from '@/components/apply/types';

const LINK = {
  interestCourse: 'both',
  courseName: 'NATA + JEE Paper 2',
  batchName: null,
  centerName: null,
  learningMode: 'online',
  totalFee: 30000,
  discountAmount: 5000,
  finalFee: 25000,
  amountPaid: 25000,
};

describe('ReviewStep', () => {
  it('calls onSubmit with no arguments, never the click event', () => {
    // Regression: onClick={onSubmit} handed the MouseEvent to the submit handler,
    // which put it in the request body and crashed on JSON.stringify
    // ("Converting circular structure to JSON ... HTMLButtonElement"). The data
    // was auto-saved by then, but the enrolment could never complete.
    const onSubmit = vi.fn();
    render(
      <ReviewStep
        formData={DEFAULT_FORM_DATA as any}
        linkData={LINK as any}
        phoneVerified
        termsAccepted
        setTermsAccepted={() => {}}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete Enrollment' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]).toHaveLength(0);
  });
});
