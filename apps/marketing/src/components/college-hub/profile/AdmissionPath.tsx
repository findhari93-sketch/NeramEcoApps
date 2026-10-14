import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { CollegeDetail } from '@/lib/college-hub/types';
import { joinOr } from '@/lib/college-hub/detail-content';
import { admissionSystems, examList, shortName } from '@/lib/college-hub/format';

interface Step {
  title: string;
  detail: string;
}

/** The four admission steps (canvas: "How to get in"), from the college's exams and counselling. */
export function admissionSteps(c: CollegeDetail): Step[] {
  const exams = examList(c.accepted_exams);
  const examText = exams.length ? joinOr(exams) : 'NATA or JEE Main Paper 2';
  const systems = admissionSystems(c);
  const name = shortName(c);
  const steps: Step[] = [
    {
      title: 'Take an entrance exam',
      detail: exams.length > 1 ? `Score in ${examText}. Either one counts.` : `Score in ${examText}.`,
    },
  ];
  if (systems.length) {
    const sys = joinOr(systems);
    steps.push(
      { title: `Register for ${systems[0]}`, detail: `Apply for ${sys} B.Arch counselling when registration opens.` },
      { title: `Choose ${name}`, detail: `Add ${c.name} to your choice list during choice filling.` },
      { title: 'Confirm your seat', detail: 'Report to the college with your allotment order and documents.' }
    );
  } else {
    steps.push(
      { title: 'Apply to the college', detail: `Fill in ${name}'s B.Arch application when admissions open.` },
      { title: 'Check the merit list', detail: 'The college publishes its selection list after the application window.' },
      { title: 'Confirm your seat', detail: 'Pay the admission fee and submit your documents.' }
    );
  }
  return steps;
}

export default function AdmissionPath({ college }: { college: CollegeDetail }) {
  const steps = admissionSteps(college);
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))' }, gap: { xs: 0, md: 1.75 } }}>
      {steps.map((s, i) => (
        <Box
          component="li"
          key={s.title}
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            gap: { xs: 1.75, md: 1 },
            p: { xs: 0, md: 2.25 },
            pb: { xs: i === steps.length - 1 ? 0 : 2, md: 2.25 },
            borderRadius: 2,
            bgcolor: { xs: 'transparent', md: 'action.hover' },
            position: 'relative',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
            <Box
              aria-hidden
              sx={{ width: { xs: 28, md: 32 }, height: { xs: 28, md: 32 }, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}
            >
              {i + 1}
            </Box>
            {i < steps.length - 1 && (
              <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, flex: '1 1 auto', width: 2, mt: 0.5, minHeight: 14, bgcolor: (t) => alpha(t.palette.primary.main, 0.2) }} />
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: { xs: 0.25, md: 0 } }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.35 }}>
              <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                Step {i + 1}:{' '}
              </Box>
              {s.title}
            </Typography>
            <Typography sx={{ m: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'text.secondary' }}>{s.detail}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** COA eligibility for B.Arch (national rule, same for every college). */
export function EligibilityCard({ exams }: { exams: string[] }) {
  const examText = exams.length ? joinOr(exams) : 'NATA or JEE Main Paper 2';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: { xs: 1.75, md: 2.25 }, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
        Eligibility
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.92rem', lineHeight: 1.5, color: 'text.secondary' }}>
        <li>Class 12 with Physics, Chemistry and Maths</li>
        <li>At least 50% aggregate in Class 12, as per COA norms</li>
        <li>A valid {examText} score</li>
      </Box>
    </Box>
  );
}
