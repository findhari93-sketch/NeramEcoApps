# Database Specialist (@neram/database)

## My Domain
Supabase PostgreSQL - Single source of truth for all apps

## Key Responsibilities
- Schema design and migrations
- TypeScript types generation
- Query functions for all apps
- RLS (Row Level Security) policies
- Supabase client management

## Tech Stack
- Supabase (PostgreSQL)
- TypeScript for type safety
- Resend for email service

## Directory Structure
```
src/
├── client.ts               # Supabase client factories
├── types/
│   └── index.ts            # All TypeScript types
├── queries/
│   ├── users.ts            # User queries
│   ├── courses.ts          # Course queries
│   ├── payments.ts         # Payment queries
│   ├── coupons.ts          # Coupon queries
│   ├── colleges.ts         # College data queries
│   ├── tools.ts            # Tools data queries
│   ├── emails.ts           # Email queries
│   └── blog.ts             # Blog queries
└── services/
    └── email.ts            # Resend email service

# Root level (outside package)
supabase/
├── config.toml             # Local Supabase config
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_application_form_enhancements.sql
│   └── 003_youtube_subscription_coupons.sql
└── seed.sql                # Seed data
```

## Critical Files
- `src/types/index.ts` - All database TypeScript types
- `src/client.ts` - Supabase client factories
- `src/queries/*.ts` - Data access functions
- `supabase/migrations/*.sql` - Database schema

## Client Types

### Browser Client (RLS enforced)
```typescript
import { createBrowserClient } from '@neram/database';

const supabase = createBrowserClient();
// Uses anon key, RLS policies apply
```

### Server Client (Per-request, RLS enforced)
```typescript
import { createServerClient } from '@neram/database';

// In API route or Server Component
const supabase = createServerClient();
// Creates fresh client per request
```

### Admin Client (Bypasses RLS)
```typescript
import { createAdminClient } from '@neram/database';

// Only use in secure API routes!
const supabase = createAdminClient();
// Uses service role key, full access
```

## Database Schema Overview

### User Management
```sql
users                 -- Unified identity
├── firebase_uid      -- Firebase auth ID
├── ms_oid            -- Microsoft Object ID
├── google_id         -- Google account ID
├── user_type         -- 'lead', 'student', 'teacher', 'admin'
└── status            -- 'pending', 'approved', 'active', etc.

lead_profiles         -- Application form data
student_profiles      -- Enrolled students
teacher_profiles      -- Teaching staff
```

### Courses & Content
```sql
courses               -- Course offerings
batches               -- Student cohorts
assignments           -- Homework/tasks
lessons               -- Learning content
```

### Financial
```sql
payments              -- Payment records
├── razorpay_*        -- Razorpay integration
└── receipt_number    -- Auto-generated

coupons               -- Discount codes
payment_installments  -- Installment plans
```

### Tools Data
```sql
colleges              -- College information
cutoff_data           -- Cutoff scores
exam_centers          -- NATA/JEE centers
```

### YouTube Rewards
```sql
youtube_subscription_coupons
├── user_id           -- User who subscribed
├── channel_id        -- YouTube channel ID
└── coupon_code       -- Generated coupon
```

## Workflow: Adding a New Table

1. **Create Migration**
```sql
-- supabase/migrations/XXX_description.sql
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- your columns
);

-- Add RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "..." ON new_table FOR SELECT USING (...);
```

2. **Update Types**
```typescript
// src/types/index.ts
export interface NewTable {
  id: string;
  created_at: string;
  // your fields
}

export interface Database {
  public: {
    Tables: {
      new_table: {
        Row: NewTable;
        Insert: Omit<NewTable, 'id' | 'created_at'>;
        Update: Partial<NewTable>;
      };
      // ... existing tables
    };
  };
}
```

3. **Add Queries**
```typescript
// src/queries/newTable.ts
import { createServerClient, createAdminClient } from '../client';
import type { NewTable } from '../types';

export async function getNewTableItems(): Promise<NewTable[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('new_table')
    .select('*');

  if (error) throw error;
  return data;
}
```

4. **Regenerate Types**
```bash
pnpm supabase:gen:types
```

## Query Patterns

### Basic CRUD
```typescript
// Select
const { data } = await supabase.from('users').select('*');

// Insert
const { data } = await supabase.from('users').insert({ ... });

// Update
const { data } = await supabase.from('users').update({ ... }).eq('id', id);

// Delete
const { error } = await supabase.from('users').delete().eq('id', id);
```

### With Relationships
```typescript
const { data } = await supabase
  .from('student_profiles')
  .select(`
    *,
    user:users(*),
    course:courses(*),
    batch:batches(*)
  `)
  .eq('user_id', userId);
```

### RPC Functions
```typescript
const { data } = await supabase.rpc('function_name', { param: value });
```

## RLS Policy Patterns

### Public Read
```sql
CREATE POLICY "Public read" ON table_name
FOR SELECT USING (true);
```

### Authenticated Only
```sql
CREATE POLICY "Authenticated users" ON table_name
FOR SELECT USING (auth.role() = 'authenticated');
```

### Own Data Only
```sql
CREATE POLICY "Users see own data" ON table_name
FOR SELECT USING (user_id = auth.uid());
```

## When Apps Need Me
- Any database schema changes
- New query functions
- RLS policy updates
- Type definition updates
- Email service integration

## Commands
```bash
# Local development
pnpm supabase:start         # Start local Supabase
pnpm supabase:stop          # Stop local Supabase
pnpm supabase:db:reset      # Reset with seed data

# Remote
pnpm supabase:db:push       # Push migrations
pnpm supabase:db:pull       # Pull remote schema
pnpm supabase:gen:types     # Regenerate TS types

# Studio
pnpm db:studio              # Open Supabase Studio
```

## Testing
- Use local Supabase for tests
- Seed test data via `seed.sql`
- Mock Supabase client for unit tests
