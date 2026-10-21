import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NeramThemeProvider } from '@neram/ui';

vi.mock('@neram/auth', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'token' } }),
}));

import ClassSetupGuide, { type ClassSetupData } from './ClassSetupGuide';

const base: ClassSetupData = {
  ready: true,
  firstName: 'Radhika',
  upn: 'Radhika_Bhanuprakash@neramclasses.com',
  password: 'Radhika@123',
  passwordChanged: false,
  passwordFromOffice: false,
  whatsappGroupUrl: 'https://chat.whatsapp.com/AbC123',
  nexusUrl: 'https://nexus.neramclasses.com',
  photoStatus: null,
  done: { whatsapp: false, authenticator: false, teams: false, signin: false, nexus: false },
  count: 0,
  total: 5,
};

function renderGuide(data: Partial<ClassSetupData> = {}, onRefresh = vi.fn(async () => null)) {
  return render(
    <NeramThemeProvider>
      <ClassSetupGuide initial={{ ...base, ...data }} onRefresh={onRefresh} />
    </NeramThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
});

describe('ClassSetupGuide', () => {
  it('greets the student and opens the first step that is not done', () => {
    renderGuide();
    expect(screen.getByRole('heading', { name: /Hi Radhika/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join your batch WhatsApp group/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Join the WhatsApp group/ })).toHaveAttribute('href', 'https://chat.whatsapp.com/AbC123');
  });

  it('shows the login and start password in the sign-in step', () => {
    renderGuide({ done: { ...base.done, whatsapp: true, authenticator: true, teams: true } , count: 3 });
    expect(screen.getByText('Radhika_Bhanuprakash@neramclasses.com')).toBeInTheDocument();
    expect(screen.getByText('Radhika@123')).toBeInTheDocument();
  });

  it('hides the password once the student has chosen their own', () => {
    renderGuide({
      password: null,
      passwordChanged: true,
      done: { ...base.done, whatsapp: true, authenticator: true, teams: true, signin: true },
      count: 4,
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign in and choose your password/ }));
    expect(screen.queryByText('Radhika@123')).not.toBeInTheDocument();
    expect(screen.getByText(/You have chosen your own password/)).toBeInTheDocument();
  });

  it('ticks a step with the signed-in token and moves on', async () => {
    renderGuide();
    fireEvent.click(screen.getByRole('button', { name: "I've joined" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('/api/class-setup');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body)).toEqual({ step: 'whatsapp', done: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Install Microsoft Authenticator/ })).toHaveAttribute('aria-expanded', 'true'),
    );
  });

  it('says the group link is on its way when none is set', () => {
    renderGuide({ whatsappGroupUrl: null });
    expect(screen.getByText(/group link is on its way/)).toBeInTheDocument();
  });

  it('celebrates when all five are done', () => {
    renderGuide({ done: { whatsapp: true, authenticator: true, teams: true, signin: true, nexus: true }, count: 5 });
    expect(screen.getByRole('heading', { name: /You're all set, Radhika/ })).toBeInTheDocument();
  });
});
