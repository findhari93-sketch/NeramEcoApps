import { Typography } from '@neram/ui';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';
import { CtaBand, CtaButton, PageHero, Section, tokens as t } from '@/design-system';
import CollegesGrid from './CollegesGrid';
import RegistrationForm from './RegistrationForm';
import AskSeniorsFAQ from './AskSeniorsFAQ';

interface Props {
  event: AskSeniorsEvent;
  colleges: AskSeniorsCollege[];
}

function formatEventDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return 'Coming June/July 2026';
  }
}

/**
 * #AskSeniors event page: dark hero (date, real college count, Register Free),
 * participating colleges, the three-step registration form, FAQ, closing band.
 */
export default function AskSeniorsPageContent({ event, colleges }: Props) {
  const dateDisplay = event.event_date ? formatEventDate(event.event_date) : 'Coming June/July 2026';

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'AskSeniors' }]}
        pills={['Free Online Event']}
        eyebrow="Student voices"
        title={<>#AskSeniors <em>{event.year}</em></>}
        lede="Real students. Real answers. Before you decide."
        stats={[
          { value: colleges.length, label: 'Colleges' },
          { value: 'Free', label: 'For Everyone' },
          { value: 'Live', label: 'Q&A Session' },
        ]}
        actions={<CtaButton href="#register">Register Free</CtaButton>}
      >
        <Typography
          component="p"
          sx={{ m: 0, display: 'inline-flex', alignItems: 'center', gap: 1, fontWeight: 600, color: t.gold500 }}
        >
          <EventOutlinedIcon aria-hidden sx={{ fontSize: 20 }} />
          {dateDisplay}
        </Typography>
        {event.description && (
          <Typography component="p" sx={{ m: 0, maxWidth: 580, lineHeight: 1.7, color: t.paperMuted }}>
            {event.description}
          </Typography>
        )}
      </PageHero>

      <CollegesGrid colleges={colleges} />

      <Section id="register-section" width="narrow" header={{ eyebrow: 'Register', title: 'Save Your Spot' }}>
        <RegistrationForm event={event} colleges={colleges} />
      </Section>

      <AskSeniorsFAQ />

      <CtaBand
        eyebrow="Your turn"
        title="Ready to write your own success story?"
        actions={
          <>
            <CtaButton href="/demo-class">Book your free demo</CtaButton>
            <CtaButton variant="link" href="/achievements">
              See achievements
            </CtaButton>
          </>
        }
      />
    </>
  );
}
