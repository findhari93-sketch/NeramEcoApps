import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PersonAvatar from './PersonAvatar';

function ring(container: HTMLElement): string | null {
  return container.querySelector('[data-ring]')?.getAttribute('data-ring') ?? null;
}

describe('PersonAvatar', () => {
  it('waits for facts before drawing a ring when it has a userId (no provider here)', () => {
    const { container } = render(<PersonAvatar userId="u1" name="Asha Kumar" />);
    expect(ring(container)).toBe('none');
    expect(screen.queryByTestId('person-language-mark')).toBeNull();
  });

  it('draws the lead ring straight away for someone with no account', () => {
    const { container } = render(<PersonAvatar name="Walk-in enquiry" />);
    expect(ring(container)).toBe('lead');
  });

  it('paints the ring from facts the row already has', () => {
    const { container } = render(<PersonAvatar userId="u1" name="Asha" facts={{ studentProfileId: 'sp-1' }} />);
    expect(ring(container)).toBe('student');
  });

  it('lets an explicit ring win over the facts', () => {
    const { container } = render(
      <PersonAvatar userId="u1" name="Asha" facts={{ studentProfileId: 'sp-1' }} ring="alumni" />,
    );
    expect(ring(container)).toBe('alumni');
  });

  it('marks a recorded language in ink and a guess in grey', () => {
    render(<PersonAvatar name="A" facts={{ homeLanguage: 'tamil', userType: 'lead' }} />);
    const mark = screen.getByTestId('person-language-mark');
    expect(mark.textContent).toBe('த');
    expect(mark.getAttribute('data-likely')).toBe('false');
  });

  it('draws a guess as likely', () => {
    render(
      <PersonAvatar name="B" facts={{ homeLanguage: null, guess: { key: 'telugu', source: 'city', from: 'Hyderabad' } }} />,
    );
    const mark = screen.getByTestId('person-language-mark');
    expect(mark.textContent).toBe('T');
    expect(mark.getAttribute('data-likely')).toBe('true');
  });

  it('leaves the letter off an avatar too small to read it', () => {
    render(<PersonAvatar name="C" size={24} facts={{ homeLanguage: 'hindi' }} />);
    expect(screen.queryByTestId('person-language-mark')).toBeNull();
  });

  it('says who it is, what they are and their language', () => {
    render(
      <PersonAvatar
        name="Asha Kumar"
        facts={{ pipelineStage: 'enrolled', guess: { key: 'tamil', source: 'city', from: 'Chennai' } }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Asha Kumar. Enrolled student. Likely Tamil, from Chennai.' })).toBeTruthy();
  });

  it('rings staff and names an outsider precisely', () => {
    const { container } = render(<PersonAvatar name="Hari" ring="staff" hideLanguage />);
    expect(ring(container)).toBe('staff');
    render(<PersonAvatar name="Meena" ring="other" ringLabel="Google reviewer" />);
    expect(screen.getByRole('img', { name: 'Meena. Google reviewer.' })).toBeTruthy();
  });

  it('calls a parent account a parent', () => {
    render(<PersonAvatar userId="p1" name="Lakshmi" facts={{ userType: 'parent' }} />);
    expect(screen.getByRole('img', { name: 'Lakshmi. Parent.' })).toBeTruthy();
  });

  it('can leave its own tooltip off inside a button that has one', () => {
    render(<PersonAvatar name="Hari" ring="staff" tooltip={false} />);
    expect(screen.getByRole('img', { name: 'Hari. Neram staff.' })).toBeTruthy();
  });

  it('draws the glance corners for a hot, active 2027 lead', () => {
    render(
      <PersonAvatar
        name="Kavya"
        size={40}
        facts={{ userType: 'lead', interest: 'hot', examYear: 2027, engagement: 'engaged', homeLanguage: 'tamil' }}
      />,
    );
    expect(screen.getByTestId('person-exam-mark').textContent).toBe('27');
    expect(screen.getByTestId('person-hot-mark')).toBeTruthy();
    expect(screen.getByTestId('person-active-mark')).toBeTruthy();
    expect(screen.getByTestId('person-language-mark').textContent).toBe('த');
    expect(
      screen.getByRole('img', { name: 'Kavya. Lead. Tamil. Hot lead. 2027 exam. Active this week.' }),
    ).toBeTruthy();
  });

  it('keeps the corners off staff, and off avatars too small to read them', () => {
    render(<PersonAvatar name="Hari" size={40} ring="staff" facts={{ examYear: 2027, engagement: 'engaged' }} />);
    expect(screen.queryByTestId('person-exam-mark')).toBeNull();
    expect(screen.queryByTestId('person-active-mark')).toBeNull();
    render(<PersonAvatar name="Small" size={24} facts={{ userType: 'lead', examYear: 2027, interest: 'hot' }} />);
    expect(screen.queryByTestId('person-exam-mark')).toBeNull();
    expect(screen.queryByTestId('person-hot-mark')).toBeNull();
  });
});
