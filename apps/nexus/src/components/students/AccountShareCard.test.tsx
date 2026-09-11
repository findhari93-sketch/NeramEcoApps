import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountShareCard from './AccountShareCard';
import type { AccountSteps } from '@/lib/student-account-provisioning';

const UPN = 'Dhisha_Haribabu@neramclasses.com';
const PASSWORD = 'Ab3#kP9m$Qr2';

const steps: AccountSteps = {
  account: { status: 'done' },
  license: { status: 'failed', message: 'There are no free student licenses left.' },
  record: { status: 'done' },
  classroom: { status: 'done' },
  teams: { status: 'skipped', message: 'This class has no linked Microsoft Team.' },
};

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});

describe('AccountShareCard', () => {
  it('copies the password and sends the whole message to the student on WhatsApp', async () => {
    const onDone = vi.fn();
    render(
      <AccountShareCard kind="welcome" firstName="Dhisha" upn={UPN} password={PASSWORD} phone="9876543210" steps={steps} onDone={onDone} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy temporary password' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PASSWORD));

    const whatsapp = screen.getByRole('link', { name: /Send on WhatsApp to 98765 43210/ });
    const href = whatsapp.getAttribute('href') || '';
    expect(href.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    const sent = decodeURIComponent(href.split('text=')[1]);
    expect(sent).toContain(`Login ID: ${UPN}`);
    expect(sent).toContain(`Temporary password: ${PASSWORD}`);

    // Copied, so Done closes straight away.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('asks before closing when nothing was copied or sent', () => {
    const onDone = vi.fn();
    const onSharedChange = vi.fn();
    render(
      <AccountShareCard kind="reset" firstName="Afrin" upn={UPN} password={PASSWORD} onDone={onDone} onSharedChange={onSharedChange} />,
    );
    expect(screen.getByText('New password ready')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be shown again/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSharedChange).not.toHaveBeenCalled();
  });

  it('says which steps need attention and why', () => {
    render(<AccountShareCard kind="welcome" firstName="Dhisha" upn={UPN} password={PASSWORD} steps={steps} onDone={vi.fn()} />);
    expect(screen.getByText('There are no free student licenses left.')).toBeTruthy();
    expect(screen.getByText('This class has no linked Microsoft Team.')).toBeTruthy();
    expect(screen.getAllByText('Needs attention')).toHaveLength(1);
  });

  it('opens WhatsApp without a recipient when the number is unknown', () => {
    render(<AccountShareCard kind="welcome" firstName="" upn={UPN} password={PASSWORD} onDone={vi.fn()} />);
    const href = screen.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href') || '';
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1]).startsWith('Hi there, welcome to Neram Classes!')).toBe(true);
  });
});
