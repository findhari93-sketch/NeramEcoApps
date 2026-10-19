import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@neram/auth', () => ({ getCurrentUser: () => null }));
vi.mock('@/design-system', async () => {
  const actual = await vi.importActual<any>('@/design-system/tokens');
  // CtaButton pulls in the locale router; a plain button/anchor is enough here.
  const CtaButton = ({ children, href, onClick, disabled }: any) =>
    href ? <a href={href}>{children}</a> : <button type="button" onClick={onClick} disabled={disabled}>{children}</button>;
  return { ...actual, CtaButton, errorColor: '#c62828' };
});

import PlanChoiceStep from './PlanChoiceStep';
import PayStep from './PayStep';
import { DEFAULT_PAYMENT_PAYEE } from '@neram/database/student-pay';

const OFFER = {
  listFee: 30000,
  extraDiscount: 0,
  fullAmount: 25000,
  installmentTotal: 30000,
  installment1: 16500,
  installment2: 13500,
  savings: 5000,
  allowsInstallments: true,
  balanceDueDays: 45,
};

describe('PlanChoiceStep', () => {
  it('leads with paying in full: best value, struck-out total, the access date', () => {
    render(<PlanChoiceStep offer={OFFER} scheme="full" onChange={() => {}} accessUntil="September 2027" payeeName="Manoharan Trust" />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Best value, save ₹5,000')).toBeTruthy();
    expect(screen.getByText('₹25,000')).toBeTruthy();
    expect(screen.getByText(/until September 2027/)).toBeTruthy();
    expect(screen.getByText(/which is ₹5,000 more than paying in full/)).toBeTruthy();
  });

  it('picks installments by click and by arrow key', () => {
    const onChange = vi.fn();
    render(<PlanChoiceStep offer={OFFER} scheme="full" onChange={onChange} accessUntil="September 2027" payeeName="Manoharan Trust" />);
    fireEvent.click(screen.getByText('Two installments'));
    expect(onChange).toHaveBeenLastCalledWith('installment');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('installment');
  });

  it('hides installments when the fee structure has none', () => {
    render(
      <PlanChoiceStep
        offer={{ ...OFFER, allowsInstallments: false, installment1: null, installment2: null, savings: 0, installmentTotal: 25000 }}
        scheme="full"
        onChange={() => {}}
        accessUntil="September 2027"
        payeeName="Manoharan Trust"
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('uses no em dashes in what it shows', () => {
    const { container } = render(<PlanChoiceStep offer={OFFER} scheme="full" onChange={() => {}} accessUntil="September 2027" payeeName="Manoharan Trust" />);
    expect(container.textContent).not.toMatch(/—|--/);
  });
});

const BASE_PAYMENT = {
  paymentDate: '2026-10-19',
  paymentType: 'full' as const,
  installmentNumber: 1,
  paymentMethod: 'upi_direct',
  transactionReference: '',
  paymentProofUrl: null,
  paymentProofFileName: null,
};

function renderPay(over: Partial<React.ComponentProps<typeof PayStep>> = {}) {
  const props: React.ComponentProps<typeof PayStep> = {
    amount: 25000,
    scheme: 'full',
    balance: null,
    balanceDueDate: null,
    payee: DEFAULT_PAYMENT_PAYEE,
    paymentNote: 'NRM 4F2A9C',
    token: 'tok',
    payment: BASE_PAYMENT,
    updatePayment: vi.fn(),
    termsAccepted: false,
    setTermsAccepted: vi.fn(),
    phoneVerified: true,
    onSubmit: vi.fn(),
    submitting: false,
    fieldErrors: {},
    ...over,
  };
  return { props, ...render(<PayStep {...props} />) };
}

describe('PayStep', () => {
  it('shows the fixed amount, the trust UPI ID and the note to add', () => {
    renderPay();
    expect(screen.getAllByText('₹25,000').length).toBeGreaterThan(0);
    expect(screen.getByText('neramclassroom-1@okhdfcbank')).toBeTruthy();
    expect(screen.getAllByText('NRM 4F2A9C').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Copy UPI ID')).toBeTruthy();
  });

  it('bank transfer shows the KVB account and IFSC', () => {
    renderPay({ payment: { ...BASE_PAYMENT, paymentMethod: 'bank_transfer' } });
    expect(screen.getAllByText('1928135000001183').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KVBL0001928').length).toBeGreaterThan(0);
  });

  it('keeps Submit off until a 12-digit UTR, screenshot and terms are in', () => {
    renderPay({ termsAccepted: true, payment: { ...BASE_PAYMENT, transactionReference: '1234', paymentProofUrl: 'https://x/1.jpg' } });
    expect((screen.getByRole('button', { name: 'Submit payment for verification' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Submit when everything is filled', () => {
    renderPay({
      termsAccepted: true,
      payment: { ...BASE_PAYMENT, transactionReference: '412345678901', paymentProofUrl: 'https://x/1.jpg', paymentProofFileName: '1.jpg' },
    });
    expect((screen.getByRole('button', { name: 'Submit payment for verification' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('installments say what is left and when', () => {
    renderPay({ amount: 16500, scheme: 'installment', balance: 13500, balanceDueDate: '2026-12-03' });
    expect(screen.getByText(/₹13,500 more by 3 Dec 2026/)).toBeTruthy();
  });

  it('shows a server field error under the UTR', () => {
    renderPay({ fieldErrors: { transactionReference: 'Already used for another payment.' } });
    expect(screen.getByText('Already used for another payment.')).toBeTruthy();
  });
});
