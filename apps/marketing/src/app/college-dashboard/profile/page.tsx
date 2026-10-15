'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useCollegeDashboard } from '../context';
import { Card, PageHeader, formatDay } from '../ui';
import { SECTIONS } from '@/lib/college-dashboard/content-sections';
import { can } from '@/lib/college-dashboard/permissions';
import SectionForm, { type SectionState } from './SectionForm';

/**
 * /college-dashboard/profile: every part of the public college page the
 * college can change. Each section is sent for staff review on its own.
 */
export default function CollegeProfileEditor() {
  const { api, collegeAdmin, refreshCollege } = useCollegeDashboard();
  const [sections, setSections] = useState<Record<string, SectionState> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const readOnly = !can(collegeAdmin?.role, 'edit_content');

  const load = useCallback(async () => {
    const r = await api<{ sections: Record<string, SectionState> }>('/api/college-dashboard/content');
    if (r.ok) {
      setSections(r.data.sections);
      setVersion((v) => v + 1);
    } else setLoadError(r.data.error ?? 'Could not load your college page.');
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Jump to #fees etc. once the sections exist.
  useEffect(() => {
    if (!sections || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [sections]);

  const upload = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const r = await api<{ url: string }>('/api/college-dashboard/upload', { form });
      if (!r.ok) throw new Error(r.data.error ?? 'Upload failed');
      return { url: r.data.url };
    },
    [api]
  );

  return (
    <Stack gap={2.5}>
      <PageHeader
        title="Your college page"
        intro="Update what students see on Neram Classes. Each part is checked by our team before it goes live, so students can trust it. Pages marked “Provided by the college” rank and convert better."
      />
      {readOnly && <Alert severity="info">You have view-only access. Ask an owner on your team to make you an editor.</Alert>}
      {loadError && <Alert severity="error">{loadError}</Alert>}
      {!sections && !loadError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={220} />)}
      {sections &&
        SECTIONS.map((def) => {
          const st = sections[def.key];
          return (
            <Card key={`${def.key}-${version}`} sx={{ scrollMarginTop: 130 }}>
              <Box id={def.key} sx={{ scrollMarginTop: 130 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ mb: 2 }}>
                  <Box>
                    <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18 }}>{def.title}</Typography>
                    <Typography sx={{ fontSize: 14.5, color: 'text.secondary' }}>{def.intro}</Typography>
                  </Box>
                  {st.approved_at && (
                    <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, color: 'success.dark', flexShrink: 0 }}>
                      <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 16 }} />
                      Live since {formatDay(st.approved_at)}
                    </Typography>
                  )}
                </Stack>
                <SectionForm
                  def={def}
                  state={st}
                  readOnly={readOnly}
                  upload={upload}
                  notice={notices[def.key] ?? null}
                  onSubmit={async (values) => {
                    const r = await api('/api/college-dashboard/content', { body: { section: def.key, values } });
                    if (r.ok) {
                      setNotices((n) => ({ ...n, [def.key]: 'Sent. The Neram team will check it, usually within one working day, and then it goes live.' }));
                      await load();
                      void refreshCollege();
                    }
                    return { ok: r.ok, error: r.data.error, fields: r.data.fields };
                  }}
                  onWithdraw={async () => {
                    await api(`/api/college-dashboard/content?section=${def.key}`, { method: 'DELETE' });
                    setNotices((n) => ({ ...n, [def.key]: '' }));
                    await load();
                    void refreshCollege();
                  }}
                />
              </Box>
            </Card>
          );
        })}
    </Stack>
  );
}
