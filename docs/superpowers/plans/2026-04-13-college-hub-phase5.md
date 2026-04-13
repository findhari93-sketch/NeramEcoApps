# College Hub Phase 5: College Dashboard + Admin Completions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the college self-service dashboard, complete admin College Hub section, and implement lead window system.

**Architecture:** College dashboard lives in the marketing app at /college-dashboard/, authenticated via Supabase email+password with college_admins table linking to Supabase Auth users. Lead windows are globally controlled by admin. Admin gets College Accounts, Lead Windows, and Comments pages to complete the toolkit.

**Tech Stack:** Next.js 14 App Router, MUI v5, Supabase Auth (email+password), @neram/database

---

## Task 1: DB Migration — Phase 5 Schema

**Files to create:**
- `supabase/migrations/20260413_college_hub_phase5.sql`

**Steps:**

- [ ] Create migration file at `supabase/migrations/20260413_college_hub_phase5.sql` with the SQL below
- [ ] Apply to staging via `mcp__supabase-staging__apply_migration`
- [ ] Apply to prod via `mcp__supabase-prod__apply_migration`
- [ ] Regenerate TypeScript types: spawn a subagent to run `pnpm supabase:gen:types` (this produces large output — use a subagent so the generated `packages/database/src/types/supabase.ts` file is written without truncation)
- [ ] Commit: `feat(db): Phase 5 schema — lead_windows, college_page_views, college_admins auth columns`

```sql
-- supabase/migrations/20260413_college_hub_phase5.sql

-- 1. Add auth + contact columns to college_admins
ALTER TABLE college_admins
  ADD COLUMN IF NOT EXISTS supabase_uid UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- 2. Index for fast auth lookup
CREATE UNIQUE INDEX IF NOT EXISTS college_admins_supabase_uid_idx
  ON college_admins (supabase_uid)
  WHERE supabase_uid IS NOT NULL;

-- 3. Lead windows table — globally controls when "I'm Interested" button is active
CREATE TABLE IF NOT EXISTS lead_windows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  applies_to    TEXT NOT NULL DEFAULT 'all'
                  CHECK (applies_to IN ('all', 'tnea', 'josaa')),
  eligible_tiers TEXT[] NOT NULL DEFAULT ARRAY['silver','gold','platinum'],
  is_active     BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one window can be active at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS lead_windows_single_active_idx
  ON lead_windows (is_active)
  WHERE is_active = true;

-- updated_at trigger for lead_windows
CREATE OR REPLACE FUNCTION update_lead_windows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_windows_updated_at ON lead_windows;
CREATE TRIGGER lead_windows_updated_at
  BEFORE UPDATE ON lead_windows
  FOR EACH ROW EXECUTE FUNCTION update_lead_windows_updated_at();

-- 4. College page views — anonymous analytics, public INSERT only
CREATE TABLE IF NOT EXISTS college_page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id  UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  city        TEXT,
  country     TEXT NOT NULL DEFAULT 'IN'
);

-- Index for fast aggregation queries
CREATE INDEX IF NOT EXISTS college_page_views_college_id_idx
  ON college_page_views (college_id);

CREATE INDEX IF NOT EXISTS college_page_views_viewed_at_idx
  ON college_page_views (viewed_at DESC);

-- RLS for page views: anyone can insert, nobody can select directly
ALTER TABLE college_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert page views"
  ON college_page_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No SELECT policy — only service role (admin client) can read
-- This prevents competitors from scraping view counts

-- RLS for lead_windows: read-only for anon (to check active window), write by service role only
ALTER TABLE lead_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lead windows"
  ON lead_windows FOR SELECT
  TO anon, authenticated
  USING (true);
```

---

## Task 2: Admin — College Accounts Page

**Files to create/modify:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/accounts/page.tsx`
- Create: `apps/admin/src/app/api/college-hub/accounts/route.ts`
- Modify: `apps/admin/src/components/Sidebar.tsx`

**Steps:**

- [ ] Create the API route at `apps/admin/src/app/api/college-hub/accounts/route.ts`
- [ ] Create the page component at `apps/admin/src/app/(dashboard)/college-hub/accounts/page.tsx`
- [ ] Add ManageAccountsIcon import and College Accounts item to Sidebar.tsx in the College Hub group, after the Leads item
- [ ] Commit: `feat(admin): College Accounts page — create Supabase auth users for college admins`

### `apps/admin/src/app/api/college-hub/accounts/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_admins')
    .select('id, name, email, phone, designation, role, is_active, invited_at, created_at, colleges(name, slug)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    college_name: (r.colleges as { name: string; slug: string } | null)?.name ?? 'Unknown',
    college_slug: (r.colleges as { name: string; slug: string } | null)?.slug ?? '',
  }));
  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const { college_id, name, email, phone, designation, role } = await request.json();

  if (!college_id || !name || !email || !role) {
    return NextResponse.json(
      { error: 'college_id, name, email, and role are required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const tempPassword = generateTempPassword();

  // Create the Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, role: 'college_admin' },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Insert college_admins row linked to the auth user
  const { data: adminRow, error: insertError } = await supabase
    .from('college_admins')
    .insert({
      college_id,
      name,
      email,
      phone: phone || null,
      designation: designation || null,
      role,
      supabase_uid: authData.user.id,
      is_active: true,
      invited_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    // Rollback: delete the auth user we just created
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: adminRow.id,
    temp_password: tempPassword,
    message: `Account created. Share these login credentials with ${name}: Email: ${email}, Password: ${tempPassword}`,
  });
}

export async function PATCH(request: NextRequest) {
  const { id, is_active } = await request.json();
  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_admins')
    .update({ is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

### `apps/admin/src/app/(dashboard)/college-hub/accounts/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, IconButton, Tooltip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface CollegeOption {
  id: string;
  name: string;
}

interface AccountRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: string;
  is_active: boolean;
  college_name: string;
  college_slug: string;
  invited_at: string | null;
  created_at: string;
}

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'admission_officer', label: 'Admission Officer' },
];

export default function CollegeAccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  // Form state
  const [form, setForm] = useState({
    college_id: '',
    name: '',
    email: '',
    phone: '',
    designation: '',
    role: 'admin',
  });

  const loadAccounts = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/accounts')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadColleges = useCallback(() => {
    fetch('/api/college-hub/colleges?limit=500')
      .then((r) => r.json())
      .then((j) => setColleges((j.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadAccounts();
    loadColleges();
  }, [loadAccounts, loadColleges]);

  const handleCreate = async () => {
    if (!form.college_id || !form.name || !form.email || !form.role) {
      setErrorMsg('College, Name, Email, and Role are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/college-hub/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCreatedCredentials({ email: form.email, password: json.temp_password });
      setSuccessMsg(json.message);
      setOpen(false);
      setForm({ college_id: '', name: '', email: '', phone: '', designation: '', role: 'admin' });
      loadAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await fetch('/api/college-hub/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    });
    loadAccounts();
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
    { field: 'college_name', headerName: 'College', flex: 1, minWidth: 180 },
    { field: 'role', headerName: 'Role', width: 140,
      renderCell: (p: GridRenderCellParams) => (
        <Chip label={(p.value as string).replace('_', ' ')} size="small" variant="outlined" />
      ),
    },
    { field: 'designation', headerName: 'Designation', width: 140 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (p: GridRenderCellParams) => (
        <Chip
          label={p.value ? 'Active' : 'Inactive'}
          size="small"
          color={p.value ? 'success' : 'default'}
          onClick={() => toggleActive(p.row.id as string, p.value as boolean)}
          sx={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      field: 'invited_at',
      headerName: 'Invited',
      width: 110,
      renderCell: (p: GridRenderCellParams) =>
        p.value ? new Date(p.value as string).toLocaleDateString('en-IN') : 'N/A',
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#7c3aed',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ManageAccountsIcon sx={{ color: 'white' }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            College Accounts ({rows.length})
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
        >
          Create Account
        </Button>
      </Stack>

      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      {createdCredentials && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => setCreatedCredentials(null)}
          action={
            <Tooltip title="Copy credentials">
              <IconButton
                size="small"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
                  )
                }
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <Typography variant="body2" fontWeight={600}>Temporary login credentials (share with college):</Typography>
          <Typography variant="body2">Email: {createdCredentials.email}</Typography>
          <Typography variant="body2">Password: {createdCredentials.password}</Typography>
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && (
        <Paper variant="outlined" sx={{ height: 600 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            density="compact"
            pageSizeOptions={[25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Paper>
      )}

      {/* Create Account Dialog */}
      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create College Account</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
            <TextField
              select
              label="College *"
              value={form.college_id}
              onChange={(e) => setForm((f) => ({ ...f, college_id: e.target.value }))}
              fullWidth
              size="small"
            >
              {colleges.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Contact Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Email Address *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
              helperText="This will be the login email for the college dashboard"
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
            />
            <TextField
              label="Designation"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g. Admissions Head, Principal"
            />
            <TextField
              select
              label="Role *"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              fullWidth
              size="small"
            >
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </TextField>
            <Alert severity="info" sx={{ py: 0.5 }}>
              A temporary password will be generated. Share it with the college contact so they can log in at neramclasses.com/college-dashboard/.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
          >
            {saving ? <CircularProgress size={16} /> : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

### Sidebar.tsx modification

In `apps/admin/src/components/Sidebar.tsx`, add the import and menu item:

**Add import** (after the existing `EmojiEventsIcon` import line):
```typescript
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import WindowIcon from '@mui/icons-material/Window';
import CommentIcon from '@mui/icons-material/Comment';
```

**Modify the College Hub group** in `menuGroups` to add items after the Leads entry:
```typescript
{
  label: 'College Hub',
  items: [
    { text: 'Overview', icon: DomainIcon, path: '/college-hub' },
    { text: 'Colleges', icon: LeaderboardIcon, path: '/college-hub/colleges' },
    { text: 'Review Queue', icon: StarHalfIcon, path: '/college-hub/reviews' },
    { text: 'Leads', icon: PeopleIcon, path: '/college-hub/leads' },
    { text: 'College Accounts', icon: ManageAccountsIcon, path: '/college-hub/accounts' },
    { text: 'Lead Windows', icon: WindowIcon, path: '/college-hub/lead-windows' },
    { text: 'Comments', icon: CommentIcon, path: '/college-hub/comments' },
    { text: 'Tier Management', icon: EmojiEventsIcon, path: '/college-hub/tiers' },
  ],
},
```

> Note: All three imports (ManageAccountsIcon, WindowIcon, CommentIcon) are added in this one Sidebar modification step. Tasks 2, 3, and 4 all reference these imports. Apply them together when modifying Sidebar.tsx.

---

## Task 3: Admin — Lead Windows Page

**Files to create:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/lead-windows/page.tsx`
- Create: `apps/admin/src/app/api/college-hub/lead-windows/route.ts`
- (Sidebar already updated in Task 2)

**Steps:**

- [ ] Create the API route at `apps/admin/src/app/api/college-hub/lead-windows/route.ts`
- [ ] Create the page at `apps/admin/src/app/(dashboard)/college-hub/lead-windows/page.tsx`
- [ ] Commit: `feat(admin): Lead Windows page — control when I'm Interested button is visible`

### `apps/admin/src/app/api/college-hub/lead-windows/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_windows')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { name, description, start_date, end_date, applies_to, eligible_tiers } = await request.json();

  if (!name || !start_date || !end_date) {
    return NextResponse.json({ error: 'name, start_date, and end_date are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_windows')
    .insert({
      name,
      description: description || null,
      start_date,
      end_date,
      applies_to: applies_to ?? 'all',
      eligible_tiers: eligible_tiers ?? ['silver', 'gold', 'platinum'],
      is_active: false,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}

export async function PATCH(request: NextRequest) {
  const { id, is_active } = await request.json();

  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If activating, deactivate all other windows first (only one active at a time)
  if (is_active) {
    await supabase
      .from('lead_windows')
      .update({ is_active: false })
      .neq('id', id);
  }

  const { error } = await supabase
    .from('lead_windows')
    .update({ is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

### `apps/admin/src/app/(dashboard)/college-hub/lead-windows/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Switch, FormControlLabel, FormGroup,
} from '@mui/material';
import WindowIcon from '@mui/icons-material/Window';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PublicIcon from '@mui/icons-material/Public';

interface LeadWindow {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  applies_to: string;
  eligible_tiers: string[];
  is_active: boolean;
  created_at: string;
}

const TIER_OPTIONS = ['free', 'silver', 'gold', 'platinum'];
const APPLIES_TO_OPTIONS = [
  { value: 'all', label: 'All Colleges' },
  { value: 'tnea', label: 'TNEA Colleges Only' },
  { value: 'josaa', label: 'JoSAA Colleges Only' },
];

export default function LeadWindowsPage() {
  const [windows, setWindows] = useState<LeadWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    applies_to: 'all',
    eligible_tiers: ['silver', 'gold', 'platinum'],
  });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/lead-windows')
      .then((r) => r.json())
      .then((j) => setWindows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch('/api/college-hub/lead-windows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionMsg(`Error: ${json.error}`);
    } else {
      setActionMsg(!current ? 'Lead window activated. The "I\'m Interested" button is now visible on eligible colleges.' : 'Lead window deactivated.');
    }
    load();
  };

  const handleCreate = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      setErrorMsg('Name, Start Date, and End Date are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/college-hub/lead-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setActionMsg('Lead window created. Activate it when ready to open lead capture.');
      setOpen(false);
      setForm({ name: '', description: '', start_date: '', end_date: '', applies_to: 'all', eligible_tiers: ['silver', 'gold', 'platinum'] });
      load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create window.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTier = (tier: string) => {
    setForm((f) => ({
      ...f,
      eligible_tiers: f.eligible_tiers.includes(tier)
        ? f.eligible_tiers.filter((t) => t !== tier)
        : [...f.eligible_tiers, tier],
    }));
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#0369a1',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <WindowIcon sx={{ color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>Lead Windows</Typography>
            <Typography variant="caption" color="text.secondary">
              Control when the "I'm Interested" button is visible on college pages
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#0369a1', '&:hover': { bgcolor: '#0284c7' } }}
        >
          Create Window
        </Button>
      </Stack>

      {actionMsg && (
        <Alert
          severity={actionMsg.startsWith('Error') ? 'error' : 'success'}
          onClose={() => setActionMsg('')}
          sx={{ mb: 2 }}
        >
          {actionMsg}
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && windows.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <WindowIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No lead windows yet. Create one to control when colleges can receive leads.
          </Typography>
        </Paper>
      )}

      <Stack gap={2}>
        {windows.map((w) => (
          <Paper
            key={w.id}
            variant="outlined"
            sx={{
              p: 2.5, borderRadius: 2,
              borderColor: w.is_active ? 'success.main' : 'divider',
              borderWidth: w.is_active ? 2 : 1,
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={2}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {w.name}
                  </Typography>
                  <Chip
                    label={w.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={w.is_active ? 'success' : 'default'}
                  />
                </Stack>
                {w.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {w.description}
                  </Typography>
                )}
                <Stack direction="row" gap={2} flexWrap="wrap">
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(w.start_date).toLocaleDateString('en-IN')} to {new Date(w.end_date).toLocaleDateString('en-IN')}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PublicIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {APPLIES_TO_OPTIONS.find((o) => o.value === w.applies_to)?.label ?? w.applies_to}
                    </Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" gap={0.5} sx={{ mt: 1 }} flexWrap="wrap">
                  {w.eligible_tiers.map((t) => (
                    <Chip key={t} label={t} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
              <Button
                variant={w.is_active ? 'outlined' : 'contained'}
                color={w.is_active ? 'error' : 'success'}
                size="small"
                onClick={() => toggleActive(w.id, w.is_active)}
                sx={{ flexShrink: 0, minWidth: 110 }}
              >
                {w.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Create Window Dialog */}
      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Lead Window</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
            <TextField
              label="Window Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g. TNEA 2026 Admission Season"
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Brief note about this window for internal reference"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Start Date *"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Date *"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              select
              label="Applies To"
              value={form.applies_to}
              onChange={(e) => setForm((f) => ({ ...f, applies_to: e.target.value }))}
              fullWidth
              size="small"
            >
              {APPLIES_TO_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Eligible Tiers (colleges with these tiers will show the button)
              </Typography>
              <FormGroup row>
                {TIER_OPTIONS.map((tier) => (
                  <FormControlLabel
                    key={tier}
                    control={
                      <Switch
                        size="small"
                        checked={form.eligible_tiers.includes(tier)}
                        onChange={() => toggleTier(tier)}
                      />
                    }
                    label={<Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{tier}</Typography>}
                  />
                ))}
              </FormGroup>
            </Box>
            <Alert severity="info" sx={{ py: 0.5 }}>
              New windows are created inactive. Activate them when the admission season begins.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            sx={{ bgcolor: '#0369a1', '&:hover': { bgcolor: '#0284c7' } }}
          >
            {saving ? <CircularProgress size={16} /> : 'Create Window'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

---

## Task 4: Admin — Comments Moderation Page

**Files to create:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/comments/page.tsx`
- Create: `apps/admin/src/app/api/college-hub/comments/route.ts`
- (Sidebar already updated in Task 2)

**Steps:**

- [ ] Create the API route at `apps/admin/src/app/api/college-hub/comments/route.ts`
- [ ] Create the page at `apps/admin/src/app/(dashboard)/college-hub/comments/page.tsx`
- [ ] Commit: `feat(admin): Comments Moderation page — approve and remove college comments`

### `apps/admin/src/app/api/college-hub/comments/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get('status') ?? 'approved';
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('college_comments')
    .select('id, author_name, body, status, created_at, colleges(name, slug)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json();
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }

  const allowed = ['approved', 'removed'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${allowed.join(', ')}` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_comments')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

### `apps/admin/src/app/(dashboard)/college-hub/comments/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Alert, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import CommentIcon from '@mui/icons-material/Comment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';

type CommentStatus = 'approved' | 'removed';

interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  colleges: { name: string; slug: string } | null;
}

export default function CommentsModerationPage() {
  const [status, setStatus] = useState<CommentStatus>('approved');
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/college-hub/comments?status=${status}`)
      .then((r) => r.json())
      .then((j) => setComments(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, newStatus: CommentStatus) => {
    await fetch('/api/college-hub/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    });
    setActionMsg(`Comment ${newStatus === 'removed' ? 'removed' : 'restored'}.`);
    load();
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42, height: 42, bgcolor: '#b45309',
            borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CommentIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>Comments Moderation</Typography>
      </Stack>

      <ToggleButtonGroup
        value={status}
        exclusive
        onChange={(_, v) => v && setStatus(v)}
        size="small"
        sx={{ mb: 3 }}
      >
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="removed">Removed</ToggleButton>
      </ToggleButtonGroup>

      {actionMsg && (
        <Alert severity="success" onClose={() => setActionMsg('')} sx={{ mb: 2 }}>
          {actionMsg}
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && comments.length === 0 && (
        <Typography color="text.secondary">No {status} comments found.</Typography>
      )}

      <Stack gap={2}>
        {comments.map((comment) => (
          <Paper key={comment.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems="flex-start"
              gap={1}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {comment.author_name}
                  </Typography>
                  {comment.colleges && (
                    <Chip
                      label={comment.colleges.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(comment.created_at).toLocaleDateString('en-IN')}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {comment.body}
                </Typography>
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                {status === 'approved' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<BlockIcon />}
                    onClick={() => updateStatus(comment.id, 'removed')}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => updateStatus(comment.id, 'approved')}
                  >
                    Restore
                  </Button>
                )}
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
```

---

## Task 5: Lead Window Status on Marketing

**Files to create/modify:**
- Create: `apps/marketing/src/app/api/colleges/lead-window-status/route.ts`
- Modify: `apps/marketing/src/components/college-hub/LeadCaptureButton.tsx`

**Steps:**

- [ ] Create the API route at `apps/marketing/src/app/api/colleges/lead-window-status/route.ts`
- [ ] Modify `LeadCaptureButton.tsx` to check active lead window on mount and conditionally render
- [ ] Commit: `feat(marketing): lead window gating — hide I'm Interested button outside admission season`

### `apps/marketing/src/app/api/colleges/lead-window-status/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const collegeId = new URL(request.url).searchParams.get('college_id');
  if (!collegeId) {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Get the college's tier and counseling systems
  const { data: college } = await supabase
    .from('colleges')
    .select('neram_tier, counseling_systems')
    .eq('id', collegeId)
    .single();

  if (!college) {
    return NextResponse.json({ active: false });
  }

  const tier = college.neram_tier ?? 'free';
  const counselingSystems: string[] = college.counseling_systems ?? [];

  // Find an active lead window that covers today and applies to this college
  const { data: windows } = await supabase
    .from('lead_windows')
    .select('id, name, applies_to, eligible_tiers')
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);

  if (!windows || windows.length === 0) {
    return NextResponse.json({ active: false });
  }

  const window = windows[0];

  // Check applies_to: 'all' means all colleges, 'tnea' means TNEA counseling, 'josaa' means JoSAA
  if (window.applies_to !== 'all') {
    const counselingMatch = counselingSystems.some(
      (cs) => cs.toLowerCase() === window.applies_to.toLowerCase()
    );
    if (!counselingMatch) {
      return NextResponse.json({ active: false });
    }
  }

  // Check eligible_tiers
  const eligibleTiers: string[] = window.eligible_tiers ?? [];
  if (!eligibleTiers.includes(tier)) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({ active: true, window_name: window.name });
}
```

### `apps/marketing/src/components/college-hub/LeadCaptureButton.tsx`

Replace the entire file with the updated version that checks the lead window:

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, Alert, CircularProgress, Typography, Checkbox,
  FormControlLabel, Box,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';

interface LeadCaptureButtonProps {
  collegeId: string;
  collegeName: string;
}

export default function LeadCaptureButton({ collegeId, collegeName }: LeadCaptureButtonProps) {
  const [windowActive, setWindowActive] = useState<boolean | null>(null); // null = loading
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nataScore, setNataScore] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/colleges/lead-window-status?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((j) => setWindowActive(j.active === true))
      .catch(() => setWindowActive(false));
  }, [collegeId]);

  const handleSubmit = async () => {
    if (!name || !phone || !consent) {
      setError('Please fill in your name, phone number, and agree to share details.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/colleges/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          name, phone,
          email: email || null,
          nata_score: nataScore ? parseFloat(nataScore) : null,
          city: city || null,
          consent_given: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Still loading — show skeleton placeholder
  if (windowActive === null) {
    return (
      <Box
        sx={{
          height: 48, bgcolor: 'grey.100', borderRadius: 2,
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.4 },
          },
        }}
      />
    );
  }

  // Lead window not active — show informational notice instead
  if (!windowActive) {
    return (
      <Box
        sx={{
          p: 2, border: '1px solid', borderColor: 'divider',
          borderRadius: 2, bgcolor: 'grey.50', textAlign: 'center',
        }}
      >
        <NotificationsOffIcon sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }} />
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          Lead inquiries open during admission season
        </Typography>
        <Typography variant="caption" color="text.secondary">
          (June to September each year)
        </Typography>
      </Box>
    );
  }

  if (success) {
    return (
      <Alert severity="success" icon={<SchoolIcon />}>
        Your interest has been registered. The college admissions team will contact you shortly.
      </Alert>
    );
  }

  return (
    <>
      <Button
        variant="contained"
        size="large"
        startIcon={<SchoolIcon />}
        onClick={() => setOpen(true)}
        sx={{
          bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' },
          borderRadius: 2, px: 3, fontWeight: 700,
        }}
        fullWidth
      >
        I&apos;m Interested — Get Admission Info
      </Button>

      <Dialog open={open} onClose={() => !submitting && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Apply to {collegeName}</Typography>
          <Typography variant="body2" color="text.secondary">
            Share your details and the college will contact you.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              label="Your Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Mobile Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'numeric' }}
              helperText="10-digit Indian mobile number"
            />
            <TextField
              label="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
              type="email"
            />
            <TextField
              label="NATA Score (optional)"
              value={nataScore}
              onChange={(e) => setNataScore(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'decimal' }}
              helperText="Out of 200"
            />
            <TextField
              label="Your City (optional)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
              size="small"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="caption">
                  I agree to share my name, phone, and score with {collegeName} for admission inquiries.
                </Typography>
              }
            />
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !consent}
            sx={{ bgcolor: '#16a34a' }}
          >
            {submitting ? <CircularProgress size={16} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

---

## Task 6: College Dashboard Auth

**Files to create:**
- `apps/marketing/src/app/college-dashboard/login/page.tsx`
- `apps/marketing/src/app/college-dashboard/layout.tsx`
- `apps/marketing/src/app/college-dashboard/context.tsx`
- `apps/marketing/src/lib/college-dashboard/auth.ts`

**Steps:**

- [ ] Create `apps/marketing/src/lib/college-dashboard/auth.ts` — server-side auth helper
- [ ] Create `apps/marketing/src/app/college-dashboard/context.tsx` — client context with session
- [ ] Create `apps/marketing/src/app/college-dashboard/layout.tsx` — protected layout wrapper
- [ ] Create `apps/marketing/src/app/college-dashboard/login/page.tsx` — email+password login form
- [ ] Commit: `feat(marketing): college dashboard auth — Supabase email+password login for college admins`

### `apps/marketing/src/lib/college-dashboard/auth.ts`

```typescript
import { createServerClient, createAdminClient } from '@neram/database';
import { NextRequest } from 'next/server';

export interface CollegeDashboardUser {
  userId: string;
  id: string;
  college_id: string;
  name: string;
  role: string;
}

export async function verifyCollegeDashboardAuth(request: NextRequest): Promise<CollegeDashboardUser> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new Error('No token');

  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid token');

  const admin = createAdminClient();
  const { data: collegeAdmin, error: adminError } = await admin
    .from('college_admins')
    .select('id, college_id, name, role, is_active')
    .eq('supabase_uid', user.id)
    .single();

  if (adminError || !collegeAdmin) throw new Error('College admin record not found');
  if (!collegeAdmin.is_active) throw new Error('Account is inactive. Contact Neram Classes support.');

  return {
    userId: user.id,
    id: collegeAdmin.id as string,
    college_id: collegeAdmin.college_id as string,
    name: collegeAdmin.name as string,
    role: collegeAdmin.role as string,
  };
}
```

### `apps/marketing/src/app/college-dashboard/context.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@neram/database';
import { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

interface CollegeInfo {
  id: string;
  name: string;
  slug: string;
  neram_tier: string;
}

interface CollegeAdminInfo {
  id: string;
  college_id: string;
  name: string;
  role: string;
}

interface CollegeDashboardContextValue {
  session: Session | null;
  collegeAdmin: CollegeAdminInfo | null;
  college: CollegeInfo | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCollege: () => Promise<void>;
}

const CollegeDashboardContext = createContext<CollegeDashboardContextValue | null>(null);

export function CollegeDashboardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [collegeAdmin, setCollegeAdmin] = useState<CollegeAdminInfo | null>(null);
  const [college, setCollege] = useState<CollegeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadAdminData = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/college-dashboard/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setCollegeAdmin(json.admin);
      setCollege(json.college);
    } catch {
      // Silently fail — session may be valid but profile fetch failed
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.access_token) {
        loadAdminData(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) {
        loadAdminData(s.access_token);
      } else {
        setCollegeAdmin(null);
        setCollege(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAdminData]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSession(null);
    setCollegeAdmin(null);
    setCollege(null);
    router.push('/college-dashboard/login');
  };

  const refreshCollege = async () => {
    if (session?.access_token) {
      await loadAdminData(session.access_token);
    }
  };

  return (
    <CollegeDashboardContext.Provider value={{ session, collegeAdmin, college, loading, signOut, refreshCollege }}>
      {children}
    </CollegeDashboardContext.Provider>
  );
}

export function useCollegeDashboard() {
  const ctx = useContext(CollegeDashboardContext);
  if (!ctx) throw new Error('useCollegeDashboard must be used inside CollegeDashboardProvider');
  return ctx;
}
```

### `apps/marketing/src/app/college-dashboard/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, AppBar, Toolbar, Typography, Button, Container, CircularProgress } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import { CollegeDashboardProvider, useCollegeDashboard } from './context';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, college, collegeAdmin, loading, signOut } = useCollegeDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/college-dashboard/login';

  useEffect(() => {
    if (!loading && !session && !isLoginPage) {
      router.push('/college-dashboard/login');
    }
  }, [loading, session, isLoginPage, router]);

  if (loading && !isLoginPage) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!session) {
    return null; // redirect in progress
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppBar position="sticky" color="white" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <SchoolIcon sx={{ color: '#16a34a' }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1, color: 'text.primary' }}>
            {college?.name ?? 'College Dashboard'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {collegeAdmin?.name} ({collegeAdmin?.role?.replace('_', ' ')})
          </Typography>
          <Button size="small" onClick={signOut} color="inherit" sx={{ fontSize: 13 }}>
            Sign Out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
        {children}
      </Container>
    </Box>
  );
}

export default function CollegeDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CollegeDashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </CollegeDashboardProvider>
  );
}
```

### `apps/marketing/src/app/college-dashboard/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Stack, InputAdornment, IconButton,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getSupabaseBrowserClient } from '@neram/database';

export default function CollegeDashboardLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.push('/college-dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Contact Neram Classes if you forgot your credentials.'
            : err.message
          : 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.50',
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 }, borderRadius: 3 }}
      >
        <Stack alignItems="center" gap={1} sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 52, height: 52, bgcolor: '#16a34a',
              borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <SchoolIcon sx={{ color: 'white', fontSize: 28 }} />
          </Box>
          <Typography variant="h6" fontWeight={700} textAlign="center">
            College Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Sign in to manage your college profile, leads, and analytics.
          </Typography>
        </Stack>

        <form onSubmit={handleLogin}>
          <Stack gap={2}>
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              size="small"
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, py: 1.25, fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={18} color="inherit" /> : 'Sign In'}
            </Button>
          </Stack>
        </form>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}>
          Credentials are provided by Neram Classes. Contact us if you need access.
        </Typography>
      </Paper>
    </Box>
  );
}
```

---

## Task 7: College Dashboard — Home + Profile Editor

**Files to create:**
- `apps/marketing/src/app/college-dashboard/page.tsx`
- `apps/marketing/src/app/api/college-dashboard/profile/route.ts`

**Steps:**

- [ ] Create the profile API route at `apps/marketing/src/app/api/college-dashboard/profile/route.ts`
- [ ] Create the dashboard home page at `apps/marketing/src/app/college-dashboard/page.tsx`
- [ ] Commit: `feat(marketing): college dashboard home — profile editor and quick stats`

### `apps/marketing/src/app/api/college-dashboard/profile/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    const { data: college, error } = await supabase
      .from('colleges')
      .select(
        'id, name, slug, neram_tier, verified, about, phone, email, admissions_phone, admissions_email, website, youtube_channel_url, instagram_handle, city, state'
      )
      .eq('id', authUser.college_id)
      .single();

    if (error) throw error;

    return NextResponse.json({
      admin: { id: authUser.id, college_id: authUser.college_id, name: authUser.name, role: authUser.role },
      college,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Allowed fields for college admins to update (admin-only fields like tier, slug are excluded)
const ALLOWED_FIELDS = new Set([
  'about', 'phone', 'email', 'admissions_phone', 'admissions_email',
  'website', 'youtube_channel_url', 'instagram_handle',
]);

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const body = await request.json();

    // Filter to allowed fields only
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        updates[key] = value ?? null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('colleges')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', authUser.college_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

### `apps/marketing/src/app/college-dashboard/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Grid, TextField, Button,
  CircularProgress, Alert, Chip, LinearProgress,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';
import SaveIcon from '@mui/icons-material/Save';
import { useCollegeDashboard } from './context';

interface CollegeProfile {
  id: string;
  name: string;
  slug: string;
  neram_tier: string;
  verified: boolean;
  about: string | null;
  phone: string | null;
  email: string | null;
  admissions_phone: string | null;
  admissions_email: string | null;
  website: string | null;
  youtube_channel_url: string | null;
  instagram_handle: string | null;
}

interface QuickStats {
  page_views_30d: number;
  lead_count: number;
  review_count: number;
}

function getCompletionPercent(profile: CollegeProfile): number {
  const fields: (keyof CollegeProfile)[] = [
    'about', 'phone', 'email', 'admissions_phone', 'admissions_email',
    'website', 'youtube_channel_url', 'instagram_handle',
  ];
  const filled = fields.filter((f) => !!profile[f]).length;
  return Math.round((filled / fields.length) * 100);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1, minWidth: { xs: '100%', sm: 140 } }}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box sx={{ color: '#16a34a' }}>{icon}</Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>{value.toLocaleString('en-IN')}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function CollegeDashboardHome() {
  const { session, collegeAdmin } = useCollegeDashboard();
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  // Editable form state (mirrors profile fields)
  const [form, setForm] = useState({
    about: '',
    phone: '',
    email: '',
    admissions_phone: '',
    admissions_email: '',
    website: '',
    youtube_channel_url: '',
    instagram_handle: '',
  });

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const [profileRes, statsRes] = await Promise.all([
        fetch('/api/college-dashboard/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/college-dashboard/analytics', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);
      if (profileRes.ok) {
        const json = await profileRes.json();
        setProfile(json.college);
        setForm({
          about: json.college.about ?? '',
          phone: json.college.phone ?? '',
          email: json.college.email ?? '',
          admissions_phone: json.college.admissions_phone ?? '',
          admissions_email: json.college.admissions_email ?? '',
          website: json.college.website ?? '',
          youtube_channel_url: json.college.youtube_channel_url ?? '',
          instagram_handle: json.college.instagram_handle ?? '',
        });
      }
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      const res = await fetch('/api/college-dashboard/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaveMsg('Profile saved successfully.');
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const completion = profile ? getCompletionPercent(profile) : 0;

  return (
    <Stack gap={3}>
      {/* Welcome header */}
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Welcome, {collegeAdmin?.name ?? 'College Admin'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {profile?.name} College Dashboard
        </Typography>
      </Box>

      {/* Tier badge */}
      {profile && (
        <Stack direction="row" gap={1} alignItems="center">
          <Chip
            label={`${(profile.neram_tier ?? 'free').toUpperCase()} Tier`}
            size="small"
            sx={{
              bgcolor: profile.neram_tier === 'platinum' ? '#7c3aed'
                : profile.neram_tier === 'gold' ? '#d97706'
                : profile.neram_tier === 'silver' ? '#6b7280'
                : '#e5e7eb',
              color: profile.neram_tier && profile.neram_tier !== 'free' ? 'white' : 'text.secondary',
              fontWeight: 600,
              fontSize: 11,
            }}
          />
          {profile.verified && <Chip label="Verified" size="small" color="success" />}
        </Stack>
      )}

      {/* Quick stats */}
      {stats && (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          <StatCard label="Page Views (30 days)" value={stats.page_views_30d} icon={<VisibilityIcon />} />
          <StatCard label="Total Leads" value={stats.lead_count} icon={<PeopleIcon />} />
          <StatCard label="Approved Reviews" value={stats.review_count} icon={<StarIcon />} />
        </Stack>
      )}

      {/* Profile completion */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>Profile Completion</Typography>
          <Typography variant="subtitle2" fontWeight={700} color={completion === 100 ? 'success.main' : 'warning.main'}>
            {completion}%
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={completion}
          sx={{
            height: 6, borderRadius: 3,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              bgcolor: completion === 100 ? '#16a34a' : '#d97706',
            },
          }}
        />
        {completion < 100 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            A complete profile attracts more students. Fill in all fields below.
          </Typography>
        )}
      </Paper>

      {/* Profile Editor */}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
          <SchoolIcon sx={{ color: '#16a34a' }} />
          <Typography variant="h6" fontWeight={700}>Edit Profile</Typography>
        </Stack>

        {saveMsg && <Alert severity="success" onClose={() => setSaveMsg('')} sx={{ mb: 2 }}>{saveMsg}</Alert>}
        {saveError && <Alert severity="error" onClose={() => setSaveError('')} sx={{ mb: 2 }}>{saveError}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              label="About Your College"
              value={form.about}
              onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={4}
              placeholder="Describe your college, programs, campus, and what makes you unique."
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="General Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="General Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Admissions Phone"
              value={form.admissions_phone}
              onChange={(e) => setForm((f) => ({ ...f, admissions_phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
              helperText="Shown to prospective students"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Admissions Email"
              value={form.admissions_email}
              onChange={(e) => setForm((f) => ({ ...f, admissions_email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
              helperText="Shown to prospective students"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Website URL"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              fullWidth
              size="small"
              type="url"
              placeholder="https://www.yourcollege.edu.in"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="YouTube Channel URL"
              value={form.youtube_channel_url}
              onChange={(e) => setForm((f) => ({ ...f, youtube_channel_url: e.target.value }))}
              fullWidth
              size="small"
              type="url"
              placeholder="https://youtube.com/@yourcollege"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Instagram Handle"
              value={form.instagram_handle}
              onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))}
              fullWidth
              size="small"
              placeholder="@yourcollege"
              helperText="Include the @ symbol"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, minWidth: 130 }}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </Box>
      </Paper>
    </Stack>
  );
}
```

---

## Task 8: College Dashboard — Leads View

**Files to create:**
- `apps/marketing/src/app/college-dashboard/leads/page.tsx`
- `apps/marketing/src/app/api/college-dashboard/leads/route.ts`

**Steps:**

- [ ] Create the API route at `apps/marketing/src/app/api/college-dashboard/leads/route.ts`
- [ ] Create the leads page at `apps/marketing/src/app/college-dashboard/leads/page.tsx`
- [ ] Commit: `feat(marketing): college dashboard leads — paginated leads list with phone masking`

### `apps/marketing/src/app/api/college-dashboard/leads/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 2) + 'X'.repeat(phone.length - 4) + phone.slice(-2);
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    // Check the college's tier to decide phone masking
    const { data: college } = await supabase
      .from('colleges')
      .select('neram_tier')
      .eq('id', authUser.college_id)
      .single();

    const tier = college?.neram_tier ?? 'free';
    const showFullPhone = tier === 'gold' || tier === 'platinum';

    const { data: leads, error } = await supabase
      .from('college_leads')
      .select('id, name, phone, email, city, nata_score, status, created_at')
      .eq('college_id', authUser.college_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (leads ?? []).map((lead) => ({
      ...lead,
      phone: showFullPhone ? lead.phone : maskPhone(lead.phone ?? ''),
      phone_masked: !showFullPhone,
    }));

    return NextResponse.json({ data: rows, tier });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const { id, status } = await request.json();

    const allowedStatuses = ['new', 'contacted', 'qualified', 'dropped'];
    if (!id || !status || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify this lead belongs to the college admin's college
    const { data: lead } = await supabase
      .from('college_leads')
      .select('college_id')
      .eq('id', id)
      .single();

    if (!lead || lead.college_id !== authUser.college_id) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('college_leads')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

### `apps/marketing/src/app/college-dashboard/leads/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Chip, CircularProgress,
  Alert, Select, MenuItem, FormControl, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import LockIcon from '@mui/icons-material/Lock';
import { useCollegeDashboard } from '../context';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  nata_score: number | null;
  status: string;
  created_at: string;
  phone_masked: boolean;
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'dropped'];

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  new: 'warning',
  contacted: 'info',
  qualified: 'success',
  dropped: 'error',
};

export default function CollegeDashboardLeadsPage() {
  const { session } = useCollegeDashboard();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tier, setTier] = useState('free');
  const [loading, setLoading] = useState(true);
  const [updateMsg, setUpdateMsg] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/college-dashboard/leads', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLeads(json.data ?? []);
        setTier(json.tier ?? 'free');
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    if (!session?.access_token) return;
    await fetch('/api/college-dashboard/leads', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, status }),
    });
    setUpdateMsg('Status updated.');
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    setTimeout(() => setUpdateMsg(''), 2000);
  };

  const phoneMasked = tier === 'free' || tier === 'silver';

  return (
    <Stack gap={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#16a34a',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <PeopleIcon sx={{ color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Leads ({leads.length})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Students who expressed interest in your college
            </Typography>
          </Box>
        </Stack>
      </Stack>

      {phoneMasked && (
        <Alert severity="info" icon={<LockIcon />}>
          Phone numbers are partially masked on your current tier. Upgrade to Gold or Platinum to see full phone numbers.
        </Alert>
      )}

      {updateMsg && (
        <Alert severity="success" sx={{ py: 0.5 }}>{updateMsg}</Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && leads.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <PeopleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No leads yet. Leads appear here when students click "I'm Interested" on your college page.
          </Typography>
        </Paper>
      )}

      {!loading && leads.length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>City</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>NATA Score</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{lead.name}</Typography>
                      {lead.email && (
                        <Typography variant="caption" color="text.secondary">{lead.email}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <Typography variant="body2" fontFamily="monospace">
                          {lead.phone}
                        </Typography>
                        {lead.phone_masked && (
                          <LockIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="body2">{lead.city ?? 'N/A'}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2">{lead.nata_score ?? 'N/A'}</Typography>
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 110 }}>
                        <Select
                          value={lead.status}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          sx={{ fontSize: 12 }}
                          renderValue={(v) => (
                            <Chip
                              label={v}
                              size="small"
                              color={STATUS_COLORS[v] ?? 'default'}
                              sx={{ fontSize: 11, height: 20 }}
                            />
                          )}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(lead.created_at).toLocaleDateString('en-IN')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}
```

---

## Task 9: College Dashboard — Analytics + Page View Tracking

**Files to create:**
- `apps/marketing/src/app/college-dashboard/analytics/page.tsx`
- `apps/marketing/src/app/api/college-dashboard/analytics/route.ts`
- `apps/marketing/src/app/api/colleges/pageview/route.ts`
- `apps/marketing/src/components/college-hub/PageViewTracker.tsx`

**Files to modify:**
- `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx`

**Steps:**

- [ ] Create `apps/marketing/src/app/api/college-dashboard/analytics/route.ts`
- [ ] Create `apps/marketing/src/app/college-dashboard/analytics/page.tsx`
- [ ] Create `apps/marketing/src/app/api/colleges/pageview/route.ts`
- [ ] Create `apps/marketing/src/components/college-hub/PageViewTracker.tsx`
- [ ] Modify `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx` to include `<PageViewTracker collegeId={college.id} />`
- [ ] Commit: `feat(marketing): college dashboard analytics + page view tracking`

### `apps/marketing/src/app/api/college-dashboard/analytics/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ago90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [views7, views30, views90, leadsCount, reviewsCount, savesCount] = await Promise.all([
      supabase
        .from('college_page_views')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id)
        .gte('viewed_at', ago7d),
      supabase
        .from('college_page_views')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id)
        .gte('viewed_at', ago30d),
      supabase
        .from('college_page_views')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id)
        .gte('viewed_at', ago90d),
      supabase
        .from('college_leads')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id),
      supabase
        .from('college_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id)
        .eq('status', 'approved'),
      supabase
        .from('college_leads')
        .select('id', { count: 'exact', head: true })
        .eq('college_id', authUser.college_id)
        .eq('source', 'save'),
    ]);

    return NextResponse.json({
      page_views_7d: views7.count ?? 0,
      page_views_30d: views30.count ?? 0,
      page_views_90d: views90.count ?? 0,
      lead_count: leadsCount.count ?? 0,
      review_count: reviewsCount.count ?? 0,
      saves_count: savesCount.count ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

### `apps/marketing/src/app/college-dashboard/analytics/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, CircularProgress,
  Grid, Tabs, Tab,
} from '@mui/material';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useCollegeDashboard } from '../context';

interface AnalyticsData {
  page_views_7d: number;
  page_views_30d: number;
  page_views_90d: number;
  lead_count: number;
  review_count: number;
  saves_count: number;
}

function StatCard({
  label, value, icon, subLabel,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  subLabel?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="flex-start" gap={1.5}>
        <Box
          sx={{
            width: 40, height: 40, bgcolor: '#f0fdf4',
            borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#16a34a', flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1}>
            {value.toLocaleString('en-IN')}
          </Typography>
          <Typography variant="body2" fontWeight={500} sx={{ mt: 0.25 }}>{label}</Typography>
          {subLabel && (
            <Typography variant="caption" color="text.secondary">{subLabel}</Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function CollegeDashboardAnalyticsPage() {
  const { session } = useCollegeDashboard();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewPeriod, setViewPeriod] = useState<7 | 30 | 90>(30);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/college-dashboard/analytics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const pageViewsForPeriod = !data ? 0
    : viewPeriod === 7 ? data.page_views_7d
    : viewPeriod === 30 ? data.page_views_30d
    : data.page_views_90d;

  return (
    <Stack gap={3}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box
          sx={{
            width: 42, height: 42, bgcolor: '#1d4ed8',
            borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <AnalyticsIcon sx={{ color: 'white' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Analytics</Typography>
          <Typography variant="caption" color="text.secondary">
            Track how students discover and engage with your college
          </Typography>
        </Box>
      </Stack>

      {loading && <CircularProgress />}

      {!loading && data && (
        <Stack gap={3}>
          {/* Page views with period toggle */}
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <VisibilityIcon sx={{ color: '#1d4ed8', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700}>Page Views</Typography>
              </Stack>
              <Tabs
                value={viewPeriod}
                onChange={(_, v) => setViewPeriod(v)}
                sx={{ minHeight: 'auto', '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: 12 } }}
              >
                <Tab label="7 days" value={7} />
                <Tab label="30 days" value={30} />
                <Tab label="90 days" value={90} />
              </Tabs>
            </Stack>
            <Typography variant="h3" fontWeight={800} color="#1d4ed8">
              {pageViewsForPeriod.toLocaleString('en-IN')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              students viewed your college page in the last {viewPeriod} days
            </Typography>
          </Paper>

          {/* Other stats */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="Total Leads"
                value={data.lead_count}
                icon={<PeopleIcon />}
                subLabel="Students who clicked I'm Interested"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="Approved Reviews"
                value={data.review_count}
                icon={<StarIcon />}
                subLabel="Verified student reviews"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="College Saves"
                value={data.saves_count}
                icon={<BookmarkIcon />}
                subLabel="Students who saved your college"
              />
            </Grid>
          </Grid>
        </Stack>
      )}
    </Stack>
  );
}
```

### `apps/marketing/src/app/api/colleges/pageview/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const { college_id } = await request.json();
    if (!college_id) {
      return NextResponse.json({ error: 'college_id required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('college_page_views')
      .insert({
        college_id,
        country: 'IN',
      });

    if (error) {
      // Fail silently — pageview tracking should never break the user experience
      return NextResponse.json({ ok: false });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
```

### `apps/marketing/src/components/college-hub/PageViewTracker.tsx`

```typescript
'use client';

import { useEffect, useRef } from 'react';

interface PageViewTrackerProps {
  collegeId: string;
}

export default function PageViewTracker({ collegeId }: PageViewTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || !collegeId) return;
    tracked.current = true;

    // Fire-and-forget: failure is silent
    fetch('/api/colleges/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ college_id: collegeId }),
    }).catch(() => undefined);
  }, [collegeId]);

  return null;
}
```

### Modify `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx`

Add the import and `<PageViewTracker>` to the existing page. The page is a Server Component (`revalidate = 3600`), so `PageViewTracker` is rendered as a client-only component via dynamic import with `ssr: false`:

```typescript
// Add this import at the top of the file:
import dynamic from 'next/dynamic';

const PageViewTracker = dynamic(
  () => import('@/components/college-hub/PageViewTracker'),
  { ssr: false }
);

// Inside the return, add PageViewTracker just before CollegePageTemplate:
return (
  <>
    <PageViewTracker collegeId={college.id} />
    <JsonLd data={collegeSchema} />
    <JsonLd data={breadcrumbSchema} />
    <JsonLd data={faqSchema} />
    <CollegePageTemplate college={college} similarColleges={similarColleges} />
  </>
);
```

> Note: `PageViewTracker` uses `next/dynamic` with `ssr: false` so it runs only in the browser and never on the server during ISR generation. This is critical — ISR pages must not fire DB writes during static rendering.

---

## Task 10: Update Progress Tracker

**Files to modify:**
- `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

**Steps:**

- [ ] Append the Phase 5 section and session log entry to `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`
- [ ] Commit: `docs: update College Hub progress tracker — Phase 5 complete`

### Content to append to `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

Add after the Phase 4 section and before the Session Log table:

```markdown
---

## Phase 5: College Dashboard + Admin Completions (COMPLETE — 2026-04-13)

### DB Migration

- [x] `supabase/migrations/20260413_college_hub_phase5.sql`
  - ALTER TABLE college_admins: added supabase_uid, phone, designation, invited_at
  - CREATE TABLE lead_windows (id, name, description, start_date, end_date, applies_to, eligible_tiers, is_active, created_by, created_at, updated_at)
  - Partial unique index: only one active lead window at a time
  - CREATE TABLE college_page_views (id, college_id, viewed_at, city, country) with RLS (public INSERT, service-role SELECT only)
  - TypeScript types regenerated in packages/database/src/types/supabase.ts

### Admin Completions

- [x] `apps/admin/.../college-hub/accounts/page.tsx` — College Accounts DataGrid + Create Account dialog
- [x] `apps/admin/src/app/api/college-hub/accounts/route.ts` — GET list, POST create auth user + admin row, PATCH toggle active
- [x] `apps/admin/.../college-hub/lead-windows/page.tsx` — Lead Windows cards with Activate/Deactivate
- [x] `apps/admin/src/app/api/college-hub/lead-windows/route.ts` — GET, POST, PATCH (auto-deactivates other windows on activate)
- [x] `apps/admin/.../college-hub/comments/page.tsx` — Comments Moderation with approved/removed tabs
- [x] `apps/admin/src/app/api/college-hub/comments/route.ts` — GET by status, PATCH status
- [x] `apps/admin/src/components/Sidebar.tsx` — Added College Accounts, Lead Windows, Comments to College Hub group

### Lead Window System

- [x] `apps/marketing/src/app/api/colleges/lead-window-status/route.ts` — checks active window, applies_to, eligible_tiers
- [x] `apps/marketing/src/components/college-hub/LeadCaptureButton.tsx` — checks window on mount, shows informational notice when closed

### Page View Tracking

- [x] `apps/marketing/src/app/api/colleges/pageview/route.ts` — POST endpoint, inserts into college_page_views
- [x] `apps/marketing/src/components/college-hub/PageViewTracker.tsx` — 'use client', useEffect fires POST once per mount
- [x] `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx` — PageViewTracker added via dynamic import (ssr: false)

### College Dashboard (marketing app, /college-dashboard/)

- [x] `apps/marketing/src/lib/college-dashboard/auth.ts` — verifyCollegeDashboardAuth() server helper
- [x] `apps/marketing/src/app/college-dashboard/context.tsx` — CollegeDashboardProvider + useCollegeDashboard hook
- [x] `apps/marketing/src/app/college-dashboard/layout.tsx` — Protected layout, redirects to /login if no session
- [x] `apps/marketing/src/app/college-dashboard/login/page.tsx` — Email+password login (Supabase signInWithPassword)
- [x] `apps/marketing/src/app/college-dashboard/page.tsx` — Dashboard home: welcome, tier badge, stats, profile completion bar, profile editor
- [x] `apps/marketing/src/app/api/college-dashboard/profile/route.ts` — GET (returns college row), PATCH (allowed fields only)
- [x] `apps/marketing/src/app/college-dashboard/leads/page.tsx` — Leads table, phone masked for free/silver, status dropdown
- [x] `apps/marketing/src/app/api/college-dashboard/leads/route.ts` — GET with phone masking by tier, PATCH status with college ownership check
- [x] `apps/marketing/src/app/college-dashboard/analytics/page.tsx` — Page views (7/30/90d tabs), leads, reviews, saves stats
- [x] `apps/marketing/src/app/api/college-dashboard/analytics/route.ts` — Parallel Supabase count queries

### Architecture Notes

- College dashboard is OUTSIDE [locale] — no next-intl, no useTranslations
- All college-dashboard API routes use verifyCollegeDashboardAuth() which reads Bearer token from Authorization header
- Phone masking: free/silver see 98XXXXXX12 format, gold/platinum see full number
- Page view tracking uses next/dynamic ssr:false so it never runs during ISR static generation
- Lead window partial unique index enforces at most one active window at a time in the DB
```

Add to Session Log table:
```markdown
| 2026-04-13 | Phase 5 implementation | DB migration, 3 admin pages, lead window system, college dashboard (auth, profile, leads, analytics), page view tracking | 10 tasks |
```

---

## Verification Checklist (Run After All Tasks)

- [ ] `pnpm type-check` passes with 0 errors
- [ ] `pnpm build` passes
- [ ] Admin: Visit `/college-hub/accounts` — DataGrid loads, Create Account dialog opens
- [ ] Admin: Visit `/college-hub/lead-windows` — Create a window, activate it, verify only one can be active at a time
- [ ] Admin: Visit `/college-hub/comments` — Approved/Removed tabs load
- [ ] Marketing: College detail page at `/colleges/tamil-nadu/[slug]` — LeadCaptureButton shows informational notice when no active window
- [ ] Marketing: Activate a lead window in admin, reload college page — button reappears
- [ ] Marketing: Visit `/college-dashboard/login` — login form renders (no i18n provider errors)
- [ ] Marketing: Log in with test college admin credentials — redirects to `/college-dashboard`
- [ ] Marketing: `/college-dashboard` — profile editor loads, save works
- [ ] Marketing: `/college-dashboard/leads` — table renders, status dropdown updates
- [ ] Marketing: `/college-dashboard/analytics` — stat cards show counts, period tabs change page views
- [ ] Page view tracking: open a college detail page in browser, check `college_page_views` table in Supabase has a new row
