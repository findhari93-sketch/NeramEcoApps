# NATA Exam Centers – Supabase + Admin Panel Implementation Plan

## 📁 Files Delivered

| File | Purpose |
|------|---------|
| `nata_exam_centers_supabase.csv` | Ready-to-import CSV with 96 cities, geocoordinates, all metadata |
| `nata_exam_centers_migration.sql` | Complete Supabase migration: table, RLS, indexes, views, clone function |
| `NATA_Probable_Exam_Centers_All_India_2025.xlsx` | Research reference with evidence & confidence ratings |

---

## Step 1: Set Up Supabase Table

### Option A: SQL Editor (Recommended)
1. Go to **Supabase Dashboard → SQL Editor**
2. Paste the entire contents of `nata_exam_centers_migration.sql`
3. Click **Run** — this creates the table, RLS policies, indexes, views, and the year-clone function

### Option B: Via Supabase CLI
```bash
supabase db push --file nata_exam_centers_migration.sql
```

---

## Step 2: Import the CSV

### Option A: Supabase Dashboard (Quickest)
1. Go to **Table Editor → nata_exam_centers**
2. Click **Insert → Import data from CSV**
3. Upload `nata_exam_centers_supabase.csv`
4. Map columns (they should auto-map since names match)
5. Click **Import**

### Option B: Via Supabase JS Client (Programmatic)
```typescript
import Papa from 'papaparse';

const importCSV = async (file: File) => {
  const text = await file.text();
  const { data } = Papa.parse(text, { header: true, dynamicTyping: true });
  
  // Batch insert in chunks of 50
  for (let i = 0; i < data.length; i += 50) {
    const chunk = data.slice(i, i + 50);
    const { error } = await supabase
      .from('nata_exam_centers')
      .upsert(chunk, { 
        onConflict: 'city_brochure,state,year',
        ignoreDuplicates: false 
      });
    if (error) console.error(`Chunk ${i}:`, error);
  }
};
```

### Option C: Via psql (Direct DB)
```bash
# Get your Supabase connection string from Settings → Database
psql "postgresql://postgres:PASSWORD@db.PROJECTREF.supabase.co:5432/postgres" \
  -c "\copy public.nata_exam_centers(state,city_brochure,brochure_ref,latitude,longitude,probable_center_1,center_1_address,center_1_evidence,probable_center_2,center_2_address,center_2_evidence,confidence,is_new_2025,was_in_2024,tcs_ion_confirmed,has_barch_college,notes,city_population_tier,year) FROM 'nata_exam_centers_supabase.csv' WITH CSV HEADER"
```

---

## Step 3: Admin Panel Features (admin.neramclasses.com)

### 3A. CSV Template Download

```typescript
// pages/admin/exam-centers/index.tsx

const downloadTemplate = () => {
  const headers = [
    'state', 'city_brochure', 'brochure_ref', 'latitude', 'longitude',
    'probable_center_1', 'center_1_address', 'center_1_evidence',
    'probable_center_2', 'center_2_address', 'center_2_evidence',
    'confidence', 'is_new_2025', 'was_in_2024', 'tcs_ion_confirmed',
    'has_barch_college', 'notes', 'city_population_tier', 'year'
  ];
  
  // Include 2 sample rows for reference
  const sampleRows = [
    ['Tamil Nadu', 'Chennai', '19.1', '13.0827', '80.2707',
     'Chennai Institute of Technology (CIT)', 'Sarathy Nagar, Kundrathur, Chennai-600069',
     'TCS iON confirmed', 'SRM IST Kattankulathur', 'SRM Nagar, Chengalpattu-603203',
     'Self-announced NATA center', 'HIGH', 'false', 'true', 'true',
     'true', 'Both TCS iON + SRM confirmed', 'Metro', '2026'],
  ];
  
  const csv = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nata_centers_template_${new Date().getFullYear() + 1}.csv`;
  a.click();
};
```

### 3B. CSV Upload with Validation

```typescript
// components/admin/CentersCsvUpload.tsx

interface UploadResult {
  total: number;
  inserted: number;
  updated: number;
  errors: { row: number; message: string }[];
}

const uploadCenters = async (file: File, year: number): Promise<UploadResult> => {
  const text = await file.text();
  const { data, errors: parseErrors } = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  
  const result: UploadResult = { total: data.length, inserted: 0, updated: 0, errors: [] };
  
  // Validate each row
  const validRows = data.filter((row: any, idx: number) => {
    if (!row.state || !row.city_brochure) {
      result.errors.push({ row: idx + 2, message: 'Missing state or city' });
      return false;
    }
    if (!row.latitude || !row.longitude) {
      result.errors.push({ row: idx + 2, message: 'Missing coordinates' });
      return false;
    }
    if (row.confidence && !['HIGH', 'MEDIUM', 'LOW'].includes(row.confidence)) {
      result.errors.push({ row: idx + 2, message: `Invalid confidence: ${row.confidence}` });
      return false;
    }
    // Override year to selected year
    row.year = year;
    return true;
  });
  
  // Upsert in batches
  for (let i = 0; i < validRows.length; i += 50) {
    const chunk = validRows.slice(i, i + 50);
    const { data: upserted, error } = await supabase
      .from('nata_exam_centers')
      .upsert(chunk, { onConflict: 'city_brochure,state,year' })
      .select();
    
    if (error) {
      result.errors.push({ row: i, message: error.message });
    } else {
      result.inserted += upserted?.length || 0;
    }
  }
  
  return result;
};
```

### 3C. Year-over-Year Clone (Admin Action)

```typescript
// "Clone 2025 data → 2026" button in admin panel

const cloneToNewYear = async (sourceYear: number, targetYear: number) => {
  const { data, error } = await supabase.rpc('clone_centers_to_new_year', {
    source_year: sourceYear,
    target_year: targetYear,
  });
  
  if (error) throw error;
  return data; // Returns number of rows cloned
};

// Usage in admin UI:
// 1. Admin clicks "Prepare NATA 2026 Centers"
// 2. System clones 2025 data → 2026 (all cities copied, is_new reset to false)
// 3. Admin can then edit individual cities, upload new CSV to update
// 4. Original 2025 data preserved for comparison
```

### 3D. Inline Editing in Admin Table

```typescript
// Use Material React Table (already in your stack) with inline editing
// Key columns to show:

const columns = [
  { accessorKey: 'state', header: 'State', enableEditing: false },
  { accessorKey: 'city_brochure', header: 'City', enableEditing: false },
  { accessorKey: 'brochure_ref', header: 'Ref #' },
  { accessorKey: 'probable_center_1', header: 'Primary Center' },
  { accessorKey: 'center_1_address', header: 'Address' },
  { accessorKey: 'center_1_evidence', header: 'Evidence' },
  { accessorKey: 'probable_center_2', header: 'Alternate Center' },
  { accessorKey: 'confidence', header: 'Confidence',
    editVariant: 'select',
    editSelectOptions: ['HIGH', 'MEDIUM', 'LOW'],
  },
  { accessorKey: 'tcs_ion_confirmed', header: 'TCS iON',
    Cell: ({ cell }) => cell.getValue() ? '✅' : '❌',
  },
  { accessorKey: 'has_barch_college', header: 'B.Arch College' },
  { accessorKey: 'notes', header: 'Notes' },
];
```

### 3E. CSV Export (Download Current Data)

```typescript
const exportCenters = async (year: number) => {
  const { data } = await supabase
    .from('nata_exam_centers')
    .select('*')
    .eq('year', year)
    .order('state')
    .order('city_brochure');
  
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nata_centers_${year}_export.csv`;
  a.click();
};
```

---

## Step 4: Public App Features (app.neramclasses.com)

### 4A. Center Locator Map (Already Planned)

```typescript
// Uses latitude/longitude from the table
// Filter by state, confidence level, year
// Show center details in popup cards

const { data: centers } = await supabase
  .from('nata_current_centers')  // Uses the view (always latest year)
  .select('*')
  .eq('state', selectedState);
```

### 4B. Informational Columns to Show in App

For each center card/detail view, display these from the data:

| Column | Display As | Where to Show |
|--------|-----------|---------------|
| `city_brochure` | City Name | Card title |
| `brochure_ref` | "Ref: 19.1" | Subtitle badge |
| `probable_center_1` | "Likely Exam Venue" | Main content |
| `center_1_address` | Full address | Below venue name |
| `center_1_evidence` | "Source: TCS iON confirmed" | Evidence tag |
| `probable_center_2` | "Alternative Venue" | Secondary section |
| `confidence` | Color-coded badge (🟢🟡🟠) | Top-right corner |
| `is_new_2025` | "NEW" badge | If true, show tag |
| `tcs_ion_confirmed` | "TCS iON ✓" chip | If true |
| `has_barch_college` | "B.Arch College in City" chip | If true |
| `city_population_tier` | "Metro / Tier-1 / Tier-2 / Tier-3" | Info line |
| `notes` | Expandable notes section | Bottom of card |
| `was_in_2024` | "Also available in 2024" | Historical context |

### 4C. Search & Filter Options

- **By State**: Dropdown with all states
- **By Confidence**: HIGH / MEDIUM / LOW toggle
- **By TCS iON Status**: Show only confirmed centers
- **By City Tier**: Metro / Tier-1 / Tier-2 / Tier-3
- **By New/Existing**: Show only new cities
- **Nearest Center**: Use device GPS → sort by distance using PostGIS or client-side haversine

---

## Step 5: Year-over-Year Workflow (Annual Process)

```
┌─────────────────────────────────────────────────────────┐
│                  ANNUAL NATA CENTER UPDATE               │
│                                                          │
│  Dec/Jan: CoA releases new NATA brochure                │
│     │                                                    │
│     ▼                                                    │
│  Admin: Click "Clone 2025 → 2026" in admin panel        │
│     │   (Copies all existing data as baseline)           │
│     │                                                    │
│     ▼                                                    │
│  Admin: Download CSV template → Update cities            │
│     │   - Add new cities from brochure                   │
│     │   - Remove dropped cities                          │
│     │   - Update center names from new admit cards       │
│     │                                                    │
│     ▼                                                    │
│  Admin: Upload updated CSV → System upserts              │
│     │                                                    │
│     ▼                                                    │
│  Mar-Jun: As exams happen, collect admit card data       │
│     │   - Students share venue names                     │
│     │   - Update confidence levels                       │
│     │   - Inline edit in admin table                     │
│     │                                                    │
│     ▼                                                    │
│  App auto-shows latest year data via nata_current_centers│
│  Old year data preserved for historical reference        │
└─────────────────────────────────────────────────────────┘
```

---

## Supabase Types (for your shared packages)

Add to `packages/supabase/types/nata_exam_centers.ts`:

```typescript
export interface NataExamCenter {
  id: string;
  state: string;
  city_brochure: string;
  brochure_ref: string | null;
  latitude: number;
  longitude: number;
  city_population_tier: 'Metro' | 'Tier-1' | 'Tier-2' | 'Tier-3' | 'International';
  probable_center_1: string | null;
  center_1_address: string | null;
  center_1_evidence: string | null;
  probable_center_2: string | null;
  center_2_address: string | null;
  center_2_evidence: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  is_new_2025: boolean;
  was_in_2024: boolean;
  tcs_ion_confirmed: boolean;
  has_barch_college: boolean;
  notes: string | null;
  year: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
```

---

## Quick Reference: Supabase Queries

```typescript
// Get all centers for current year
const { data } = await supabase.from('nata_current_centers').select('*');

// Get Tamil Nadu centers
const { data } = await supabase
  .from('nata_exam_centers')
  .select('*')
  .eq('state', 'Tamil Nadu')
  .eq('year', 2025);

// Get HIGH confidence only
const { data } = await supabase
  .from('nata_exam_centers')
  .select('*')
  .eq('confidence', 'HIGH')
  .eq('year', 2025);

// Year comparison
const { data } = await supabase.from('nata_centers_yoy').select('*');

// State summary stats
const { data } = await supabase.from('nata_state_summary').select('*');

// Find nearest center (client-side haversine)
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
```
