'use client';

/**
 * Marketing Intelligence: Settings. How much the agent may do by itself.
 * A category can go automatic only after 15 human decisions at 90% approval;
 * the server enforces this too. The stop switch halts every automatic change
 * at once. The Account profile holds what Google cannot tell the agent:
 * Neram's facts for ads, competitors, protected keywords and landing pages.
 * Desktop first. Entered from the sidebar or the Overview's Autopilot card;
 * Back goes to the Overview.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Button,
  FormControlLabel,
  LinearProgress,
  Paper,
  Radio,
  RadioGroup,
  Snackbar,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly, ConfirmDialog } from '@/components/marketing-ai/Parts';
import { api, CATEGORY_LABEL } from '@/components/marketing-ai/format';

const CATEGORY_HELP: Record<string, string> = {
  add_negative: 'Blocks search terms that the AI, at or above your confidence threshold, labels as job seekers, other exams or other courses. Never blocks a search that converted, one of your keywords, a protected keyword, or a search for free NATA material (the free app brings sign-ups).',
  bid_cut: 'Lowers the max CPC (up to the increase limit) of a keyword that spent twice the target with no sign-ups, or costs more than twice the target per sign-up. Only on Manual CPC campaigns, never below ₹5, never a protected keyword.',
  bid_raise: 'Raises the max CPC of a keyword that brings sign-ups well under target but shows below the first-page bid or rarely. Never above the max CPC ceiling.',
  budget_cut: 'Cuts daily budgets that could add up to more than the monthly cap. Only ever lowers spend.',
  pause_keyword: 'Pauses a keyword that spent three times the target cost per sign-up on 30 or more clicks with no sign-up. Never the last keyword of an ad group.',
  budget_raise: 'Raises the budget of a campaign that is limited by budget and beats the target, within the increase limit and the monthly cap.',
  add_keyword: 'Adds a search that already brings sign-ups at or under target as its own exact match keyword.',
  new_ad: 'Adds an AI-written responsive search ad beside the current ads in a group whose ads are rarely clicked. Google reviews it first.',
  pause_ad: 'Pauses an ad that is rarely clicked and brings no sign-ups while another ad in the group does. Never the last ad.',
};

/**
 * An editable list of short texts as chips: type and press Enter to add,
 * Backspace or the chip's delete button to remove. A labelled input, so
 * screen readers announce what the list is.
 */
function ChipListField({ label, helper, value, onChange, lower = false }: { label: string; helper: string; value: string[]; onChange: (v: string[]) => void; lower?: boolean }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={[] as string[]}
      value={value}
      onChange={(_, v) => {
        const clean = (v as string[]).map((x) => (lower ? x.toLowerCase() : x).replace(/\s+/g, ' ').trim()).filter(Boolean);
        onChange([...new Set(clean)]);
      }}
      renderTags={(items, getTagProps) => items.map((item, index) => <Chip {...getTagProps({ index })} key={item} label={item} size="small" />)}
      renderInput={(params) => <TextField {...params} label={label} helperText={helper} placeholder="Type and press Enter" />}
    />
  );
}

export default function MarketingAiSettingsPage() {
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState<string | null>(null);

  useEffect(() => {
    api('/api/marketing-ai/settings')
      .then((d) => {
        setData(d);
        setDraft(structuredClone(d.settings));
      })
      .catch((e) => setError({ message: e.message, status: e.status }));
  }, []);

  const dirty = useMemo(() => data && draft && JSON.stringify(data.settings) !== JSON.stringify(draft), [data, draft]);

  if (error?.status === 403) return <AdminOnly />;

  const set = (path: string[], value: unknown) =>
    setDraft((d: any) => {
      const next = structuredClone(d);
      let o = next;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path[path.length - 1]] = value;
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api('/api/marketing-ai/settings', { method: 'PUT', body: JSON.stringify(draft) });
      setData((d: any) => ({ ...d, settings: r.settings, eligibility: r.eligibility }));
      setDraft(structuredClone(r.settings));
      setToast('Settings saved.');
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  };

  const numberField = (label: string, path: string[], helper: string, props: { min: number; max: number; step?: number; prefix?: string; suffix?: string }) => (
    <TextField
      label={label}
      type="number"
      value={path.reduce((o, k) => o?.[k], draft) ?? ''}
      onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))}
      helperText={helper}
      inputProps={{ min: props.min, max: props.max, step: props.step ?? 1, inputMode: 'decimal' }}
      InputProps={{ startAdornment: props.prefix ? <Typography sx={{ mr: 0.5 }}>{props.prefix}</Typography> : undefined, endAdornment: props.suffix ? <Typography sx={{ ml: 0.5 }}>{props.suffix}</Typography> : undefined }}
      fullWidth
    />
  );

  return (
    <Box sx={{ pb: 10 }}>
      <OpsPageHeader
        icon={TuneIcon}
        title="Agent settings"
        subtitle="How much the Google Ads agent may change by itself. Every change, automatic or approved, is checked, logged and can be undone."
        actions={
          <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
            Back to overview
          </Button>
        }
      />
      {error && <Alert severity="error">{error.message}</Alert>}
      {!draft && !error && <OpsSkeleton variant="rounded" height={480} />}

      {draft && (
        <Box sx={{ display: 'grid', gap: 2, maxWidth: 880 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: draft.autonomy.kill_switch ? 'error.main' : 'divider' }}>
            <FormControlLabel
              control={<Switch checked={draft.autonomy.kill_switch} onChange={(e) => set(['autonomy', 'kill_switch'], e.target.checked)} />}
              label={<Typography fontWeight={700}>Stop all automatic changes</Typography>}
              sx={{ minHeight: 44 }}
            />
            <Typography variant="body2" color="text.secondary">
              When on, the agent only recommends, whatever is set below. Use it if something looks wrong.
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" component="h2" fontWeight={700}>
              Autonomy
            </Typography>
            <RadioGroup value={String(Math.min(draft.autonomy.level, 2))} onChange={(e) => set(['autonomy', 'level'], Number(e.target.value))}>
              <FormControlLabel value="1" control={<Radio />} label="Recommend only. Every change waits for an admin." sx={{ minHeight: 44 }} />
              <FormControlLabel value="2" control={<Radio />} label="Automatic for the categories turned on below. Everything else waits for an admin." sx={{ minHeight: 44 }} />
            </RadioGroup>

            <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
              {data.eligibility.map((e: any) => {
                const mode = draft.autonomy.categories[e.category];
                const safe = data.rules.SAFE_AUTO.includes(e.category);
                const locked = !safe && !e.eligible && data.settings.autonomy.categories[e.category] !== 'auto';
                return (
                  <Box key={e.category} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 1.5, alignItems: 'center', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography fontWeight={700}>{CATEGORY_LABEL[e.category]}</Typography>
                        {safe && <StatusChip icon={VerifiedUserOutlinedIcon} tone="success" label="Safe: only lowers spend or blocks junk" />}
                      </Box>
                      <Typography variant="body2" color="text.secondary">{CATEGORY_HELP[e.category]}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <LinearProgress variant="determinate" value={Math.min(100, (e.decided / data.rules.ELIGIBILITY.minDecided) * 100)} sx={{ flex: 1, maxWidth: 220, height: 6, borderRadius: 3 }} aria-label={`${e.decided} of ${data.rules.ELIGIBILITY.minDecided} decisions`} />
                        <Typography variant="caption" color="text.secondary">
                          {e.decided} of {data.rules.ELIGIBILITY.minDecided} decisions{e.rate !== null ? `, ${Math.round(e.rate * 100)}% approved` : ''}
                          {safe ? '. Allowed automatic from day one.' : e.eligible ? '. Earned.' : locked ? `. Needs ${Math.round(data.rules.ELIGIBILITY.minApprovalRate * 100)}% approval.` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={mode}
                      onChange={(_, v) => {
                        if (!v || v === mode) return;
                        if (v === 'auto') setConfirmAuto(e.category);
                        else set(['autonomy', 'categories', e.category], v);
                      }}
                      aria-label={`${CATEGORY_LABEL[e.category]} mode`}
                    >
                      <ToggleButton value="approve" sx={TARGET_44}>Ask me</ToggleButton>
                      <ToggleButton value="auto" sx={TARGET_44} disabled={locked}>Automatic</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                );
              })}
            </Box>
            {Object.values(draft.autonomy.categories).includes('auto') && draft.autonomy.level < 2 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Categories set to Automatic only act when Autonomy is set to the second option.
              </Alert>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" component="h2" fontWeight={700}>
              Budget and targets
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              The monthly cap is a hard ceiling: the agent proposes cutting daily budgets that could add up to more, warns when a month is running ahead, and never proposes a raise past it. Google can spend up to 30.4 times the daily budget in a month, so a ₹7,000 cap means about ₹230 a day across all campaigns.
            </Typography>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 2.5 }}>
              <TextField
                label="Phone verified conversion live since"
                type="date"
                value={draft.targets.conversions_since ?? ''}
                onChange={(e) => set(['targets', 'conversions_since'], e.target.value || null)}
                InputLabelProps={{ shrink: true }}
                helperText="The day 'Phone verified (Neram app)' became the primary conversion in Google Ads. Rules that judge by sign-ups wait for 21 days of data after it, so nothing is paused on the old conversion definition."
                fullWidth
              />
              <TextField
                label="Use last season's history from"
                type="date"
                value={draft.targets.proxy_history_since ?? ''}
                onChange={(e) => set(['targets', 'proxy_history_since'], e.target.value || null)}
                InputLabelProps={{ shrink: true }}
                helperText="Until the OTP conversion has 21 days, suggestions that need your approval (new keywords, bid raises) may use the old Sign-up conversions from this date. Automatic changes never do. Clear it to turn this off."
                fullWidth
              />
            </Box>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Admission season months
            </Typography>
            <ToggleButtonGroup
              size="small"
              value={draft.targets.season.months}
              onChange={(_, v: number[]) => set(['targets', 'season', 'months'], [...v].sort((a, b) => a - b))}
              aria-label="Admission season months"
              sx={{ flexWrap: 'wrap', mb: 2 }}
            >
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) => (
                <ToggleButton key={label} value={i + 1} sx={{ ...TARGET_44, minWidth: 52 }}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
                <Typography variant="subtitle2" fontWeight={700}>Off-season (the other months)</Typography>
                {numberField('Monthly spend cap', ['targets', 'monthly_spend_cap_inr'], 'The most Google Ads may spend in an off-season month.', { min: 0, max: 10000000, prefix: '₹' })}
                {numberField('Target cost per sign-up', ['targets', 'target_cpa_inr'], 'What an OTP-verified sign-up is worth paying for. Most rules measure against this.', { min: 50, max: 100000, prefix: '₹' })}
              </Box>
              <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
                <Typography variant="subtitle2" fontWeight={700}>Admission season</Typography>
                {numberField('Monthly spend cap', ['targets', 'season', 'monthly_spend_cap_inr'], 'The most Google Ads may spend in a season month.', { min: 0, max: 10000000, prefix: '₹' })}
                {numberField('Target cost per sign-up', ['targets', 'season', 'target_cpa_inr'], 'Usually the same or a little higher, when competition for clicks is stronger.', { min: 50, max: 100000, prefix: '₹' })}
              </Box>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" component="h2" fontWeight={700}>
              Guardrails
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Limits for the agent. The server also has fixed ceilings ({data.rules.HARD_LIMITS.max_budget_change_pct}% budget increase, {data.rules.HARD_LIMITS.max_auto_actions_per_day} automatic changes a day) that no setting can exceed.
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {numberField('Largest budget or bid increase', ['guardrails', 'max_budget_change_pct'], 'Per change. Budget cuts to stay within the monthly cap can be larger.', { min: 1, max: data.rules.HARD_LIMITS.max_budget_change_pct, suffix: '%' })}
              {numberField('Max CPC ceiling', ['guardrails', 'max_cpc_ceiling_inr'], 'No keyword bid is raised above this, and first-page bids above it are not chased.', { min: 5, max: data.rules.HARD_LIMITS.max_cpc_ceiling_inr, prefix: '₹' })}
              {numberField('Automatic changes per day', ['guardrails', 'max_auto_actions_per_day'], 'After this many, the rest wait for approval.', { min: 0, max: data.rules.HARD_LIMITS.max_auto_actions_per_day })}
              {numberField('Clicks before judging a search', ['guardrails', 'min_clicks_to_judge'], 'Below this, a search term has not proven anything yet.', { min: 1, max: 1000 })}
              {numberField('AI confidence to block automatically', ['guardrails', 'auto_min_confidence'], 'Between 0.7 and 1.', { min: 0.7, max: 1, step: 0.05 })}
              {numberField('CPA rise that switches autopilot off', ['guardrails', 'auto_demote_cpa_worsening_pct'], 'Measured a week after an automatic change.', { min: 5, max: 200, suffix: '%' })}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} component="section" aria-labelledby="mi-profile">
            <Typography id="mi-profile" variant="subtitle1" component="h2" fontWeight={700}>
              Account profile
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              What Google Ads cannot tell the agent. The AI writes ads only from these facts, and the agent never touches a protected keyword or names a competitor in an ad.
            </Typography>
            <Box sx={{ display: 'grid', gap: 2.5 }}>
              <ChipListField
                label="Facts the AI may use in ads"
                helper="Claims that are true and approved, for example 'AIR 1 in JEE B.Arch 2024'. The AI uses nothing else."
                value={draft.profile.brand_facts}
                onChange={(v) => set(['profile', 'brand_facts'], v)}
              />
              <ChipListField
                label="Competitors"
                helper="Other coaching brands. Never written in ad text. Keywords naming them are fine."
                value={draft.profile.competitors}
                onChange={(v) => set(['profile', 'competitors'], v)}
                lower
              />
              <ChipListField
                label="Protected keywords"
                helper="Never paused, given a lower bid or blocked by a negative, for example the umbrella 'nata coaching'."
                value={draft.profile.protected_keywords}
                onChange={(v) => set(['profile', 'protected_keywords'], v)}
                lower
              />
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  label="Landing page for coaching searches"
                  type="url"
                  value={draft.profile.landing_pages.coaching}
                  onChange={(e) => set(['profile', 'landing_pages', 'coaching'], e.target.value)}
                  helperText="Classes, centres and fees. Must be an https neramclasses.com page."
                  fullWidth
                />
                <TextField
                  label="Landing page for exam resources"
                  type="url"
                  value={draft.profile.landing_pages.resources}
                  onChange={(e) => set(['profile', 'landing_pages', 'resources'], e.target.value)}
                  helperText="Mock tests, past papers and study material (the free app)."
                  fullWidth
                />
                <TextField
                  label="Area the campaigns are for"
                  value={draft.profile.target_area}
                  onChange={(e) => set(['profile', 'target_area'], e.target.value)}
                  helperText="For example Tamil Nadu."
                  fullWidth
                />
              </Box>
              <ChipListField
                label="Places outside that area"
                helper="A keyword naming one of these is flagged, for example 'nata coaching in bangalore' in a Tamil Nadu campaign."
                value={draft.profile.outside_places}
                onChange={(v) => set(['profile', 'outside_places'], v)}
                lower
              />
            </Box>
          </Paper>
        </Box>
      )}

      {draft && (
        <Paper elevation={6} sx={{ position: 'fixed', bottom: 16, right: 16, left: { xs: 16, md: 'auto' }, p: 1.5, display: 'flex', gap: 1, alignItems: 'center', zIndex: 20 }}>
          <Typography variant="body2" sx={{ mr: 1 }}>{dirty ? 'Unsaved changes' : 'All changes saved'}</Typography>
          <Button disabled={!dirty || saving} onClick={() => setDraft(structuredClone(data.settings))} sx={TARGET_44}>
            Discard
          </Button>
          <Button variant="contained" disabled={!dirty || saving} onClick={save} sx={TARGET_44}>
            {saving ? 'Saving' : 'Save'}
          </Button>
        </Paper>
      )}

      <ConfirmDialog
        open={!!confirmAuto}
        title={`Let the agent ${confirmAuto ? CATEGORY_LABEL[confirmAuto].toLowerCase() : ''} by itself?`}
        body={
          <Typography variant="body2">
            {confirmAuto && CATEGORY_HELP[confirmAuto]} Each change is still checked against Google first, appears in the morning email with an Undo, and the category switches back to Ask me if cost per conversion gets worse. This takes effect when you press Save.
          </Typography>
        }
        confirmLabel="Turn on"
        onCancel={() => setConfirmAuto(null)}
        onConfirm={async () => {
          set(['autonomy', 'categories', confirmAuto!], 'auto');
          if (draft.autonomy.level < 2) set(['autonomy', 'level'], 2);
          setConfirmAuto(null);
        }}
      />
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}
