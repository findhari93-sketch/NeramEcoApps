'use client';

import { useMemo, useState } from 'react';
import { Box, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import DemoGate from '@/components/tools/DemoGate';
import { EDUCATION_OPTIONS, SUBJECTS, evaluateEligibility } from '@/lib/tools/eligibility-rules';

/**
 * Public demo: the real COA rules, verdict and reasons. Signed in: your state
 * counselling's rule, a saved report and the document checklist.
 */
export default function EligibilityDemo() {
  const [education, setEducation] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [aggregate, setAggregate] = useState('');

  const ready = education !== '' && subjects.length > 0;
  const result = useMemo(
    () => (ready ? evaluateEligibility({ education, subjects, aggregate, purpose: 'B.Arch Admission' }) : null),
    [ready, education, subjects, aggregate]
  );
  const needsAggregate = education === 'Passed 10+2' || education === '10+3 Diploma (Passed)';
  const toggle = (s: string) => setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField select label="Your qualification" value={education} onChange={(e) => setEducation(e.target.value)} sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}>
          {EDUCATION_OPTIONS.map((o) => (
            <MenuItem key={o} value={o} sx={{ minHeight: 44 }}>
              {o}
            </MenuItem>
          ))}
        </TextField>
        {needsAggregate && (
          <TextField
            label="Aggregate percentage"
            value={aggregate}
            onChange={(e) => setAggregate(e.target.value.replace(/[^\d.]/g, ''))}
            inputProps={{ inputMode: 'decimal' }}
            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
          />
        )}
      </Box>

      <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mt: 2 }}>
        <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Your subjects
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {SUBJECTS.map((s) => (
            <FormControlLabel
              key={s}
              control={<Checkbox checked={subjects.includes(s)} onChange={() => toggle(s)} />}
              label={s}
              sx={{ minHeight: 44, mr: 0 }}
            />
          ))}
        </Box>
      </Box>

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {result ? (
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            {[
              { ok: result.nataEligible, text: result.nataEligible ? 'You can write NATA' : 'You cannot write NATA yet' },
              { ok: !!result.barchEligible, text: result.barchEligible ? 'You meet the B.Arch admission rule' : 'You do not meet the B.Arch admission rule yet' },
            ].map((v) => (
              <Box key={v.text} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
                {v.ok ? <CheckCircleRoundedIcon aria-hidden="true" sx={{ color: 'success.main' }} /> : <CancelRoundedIcon aria-hidden="true" sx={{ color: 'error.main' }} />}
                <Typography sx={{ fontWeight: 700 }}>{v.text}</Typography>
              </Box>
            ))}
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
              {result.conditions.filter((c) => !c.met).slice(0, 3).map((c) => (
                <Typography component="li" variant="body2" key={c.label}>
                  {c.explanation}
                </Typography>
              ))}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Pick your qualification and tick your subjects to see if you are eligible.
          </Typography>
        )}
      </Box>

      {result && (
        <DemoGate
          toolId="nata-eligibility-checker"
          headline="Check your state counselling rule too"
          benefits={['Your state rule (45% or 50%) and category relaxations', 'A saved eligibility report', 'Document checklist for counselling']}
          cta="Sign in free to continue"
          input={{ education, aggregate, subjects }}
        />
      )}
    </Box>
  );
}
