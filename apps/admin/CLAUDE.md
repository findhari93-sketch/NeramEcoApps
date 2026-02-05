# Admin Dashboard Specialist (@neram/admin)

## My Domain
Admin dashboard at admin.neramclasses.com - For staff and administrators

## Key Features I Handle
- User management (leads, students, teachers)
- Application review and approval
- Payment verification
- Coupon management
- Course and batch management
- Email template management
- System settings

## Tech Stack
- Next.js 14 with App Router
- Microsoft Entra ID (Azure AD) authentication
- MUI v5 + MUI X Data Grid for data tables
- MUI X Date Pickers

## Directory Structure
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx      # Microsoft admin login
│   ├── (protected)/
│   │   ├── layout.tsx          # Admin auth wrapper
│   │   ├── dashboard/          # Admin overview
│   │   ├── users/              # User management
│   │   ├── applications/       # Lead applications
│   │   ├── payments/           # Payment management
│   │   ├── coupons/            # Coupon management
│   │   ├── courses/            # Course management
│   │   └── settings/           # System settings
│   └── api/
│       ├── admin/              # Admin-only endpoints
│       └── export/             # Data export endpoints
├── components/
│   ├── DataTable.tsx           # Reusable data grid
│   ├── ApplicationReview.tsx   # Application review form
│   ├── PaymentVerification.tsx # Payment verification
│   └── UserManagement.tsx      # User CRUD
└── lib/
    └── admin.ts                # Admin utilities
```

## Critical Files
- `src/app/(protected)/layout.tsx` - Admin auth wrapper
- `src/app/(protected)/applications/page.tsx` - Application review
- `src/app/(protected)/payments/page.tsx` - Payment verification
- `src/app/(protected)/users/page.tsx` - User management

## Authentication
Uses Microsoft Entra ID with admin role verification:
```typescript
import { useMicrosoftAuth } from '@neram/auth';

function AdminGuard({ children }) {
  const { user } = useMicrosoftAuth();

  // Verify user has admin role
  if (user?.userType !== 'admin') {
    return <AccessDenied />;
  }

  return children;
}
```

## Key Workflows

### Application Review
1. Lead submits application (marketing site)
2. Admin reviews in applications list
3. Admin approves/rejects with notes
4. System sends email notification
5. If approved, lead converts to student

### Payment Verification
1. Student makes payment (app)
2. Admin sees pending payments
3. Admin verifies payment details
4. Admin marks as verified
5. Receipt generated automatically

### Coupon Management
1. Admin creates coupon with rules
2. Set discount type (% or fixed)
3. Set validity period
4. Set usage limits
5. Monitor usage stats

## API Routes (Admin-Only)
- `GET /api/admin/users` - List all users
- `PATCH /api/admin/users/:id` - Update user
- `GET /api/admin/applications` - List applications
- `PATCH /api/admin/applications/:id` - Approve/reject
- `GET /api/admin/payments` - List payments
- `PATCH /api/admin/payments/:id` - Verify payment
- `POST /api/admin/coupons` - Create coupon
- `GET /api/export/*` - Export data to CSV/Excel

## Patterns to Follow

### Admin API Route
```typescript
import { createAdminClient } from '@neram/database';
import { verifyAdminToken } from '@neram/auth';

export async function GET(request: Request) {
  // Verify admin token
  const admin = await verifyAdminToken(request);
  if (!admin) return new Response('Unauthorized', { status: 401 });

  // Use admin client (bypasses RLS)
  const supabase = createAdminClient();
  const { data } = await supabase.from('users').select('*');

  return Response.json(data);
}
```

### Data Table with MUI X
```typescript
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { field: 'name', headerName: 'Name', width: 200 },
  { field: 'email', headerName: 'Email', width: 250 },
  { field: 'status', headerName: 'Status', width: 120 },
];

<DataGrid rows={users} columns={columns} />
```

## Database Tables Used (Full Access)
- All tables via admin client (bypasses RLS)
- Primary focus: `users`, `lead_profiles`, `student_profiles`
- Financial: `payments`, `coupons`, `payment_installments`
- Content: `courses`, `batches`, `email_templates`

## When to Involve Other Agents
- Database schema changes → `packages/database/CLAUDE.md`
- Auth changes → `packages/auth/CLAUDE.md`
- Student-facing changes → `apps/app/CLAUDE.md`
- Marketing site changes → `apps/marketing/CLAUDE.md`

## Security Considerations
- All routes require admin authentication
- Use `createAdminClient()` only in API routes
- Log all admin actions for audit trail
- Never expose service role key to client

## Testing Considerations
- Mock admin user for tests
- Test CRUD operations on all entities
- Test export functionality
- Test role-based access control
