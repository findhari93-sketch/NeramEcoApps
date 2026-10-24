import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('fills the exam pill orange for a break year, and keeps Class 12 plain', () => {
    render(<PersonAvatar name="Divya" facts={{ userType: 'lead', examYear: 2027, currentStandard: 'gap_year', twelfthPassedYear: 2025 }} />);
    const pill = screen.getByTestId('person-exam-mark');
    expect(pill.textContent).toBe('27');
    expect(pill.getAttribute('data-break-year')).toBe('true');
    expect(
      screen.getByRole('img', { name: 'Divya. Lead. Break year: finished Class 12 in 2025, 2027 exam.' }),
    ).toBeTruthy();
  });

  it('keeps a Class 12 pill plain', () => {
    render(<PersonAvatar name="Arun" facts={{ userType: 'lead', examYear: 2027, currentStandard: '12th' }} />);
    expect(screen.getByTestId('person-exam-mark').getAttribute('data-break-year')).toBeNull();
  });

  it('shows a break year even when no exam year is known', () => {
    render(<PersonAvatar name="Ravi" facts={{ userType: 'lead', currentStandard: 'gap_year' }} />);
    const pill = screen.getByTestId('person-exam-mark');
    expect(pill.getAttribute('data-break-year')).toBe('true');
    expect(pill.querySelector('svg')).toBeTruthy();
  });

  it('opens the quick editor on click, and the row underneath does not open', () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <PersonAvatar userId="u1" name="Divya" facts={{ userType: 'lead', currentStandard: 'gap_year' }} />
      </div>,
    );
    const avatar = screen.getByRole('button', { name: /^Divya\. Lead\..*Set class or language\.$/ });
    fireEvent.click(avatar);
    expect(rowClick).not.toHaveBeenCalled();
    const editor = screen.getByTestId('person-quick-editor');
    expect(editor.getAttribute('aria-label')).toBe('Edit Divya');
    expect(screen.getByRole('button', { name: 'Break year' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Finished Class 12 in')).toBeTruthy();
  });

  it('opens from the keyboard too', () => {
    render(<PersonAvatar userId="u1" name="Divya" facts={{ userType: 'lead' }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Set class or language/ }), { key: 'Enter' });
    expect(screen.getByTestId('person-quick-editor')).toBeTruthy();
  });

  it('offers no editor for staff, people with no account, or a photo that opens on tap', () => {
    render(<PersonAvatar userId="s1" name="Hari" ring="staff" />);
    render(<PersonAvatar name="Walk-in" facts={{ userType: 'lead' }} />);
    render(<PersonAvatar userId="u2" name="Asha" facts={{ userType: 'lead' }} tapToView />);
    expect(screen.queryByRole('button', { name: /Set class or language/ })).toBeNull();
  });
});
