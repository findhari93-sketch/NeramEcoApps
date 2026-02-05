# Nexus LMS Specialist (@neram/nexus)

## My Domain
Learning Management System at nexus.neramclasses.com - For teachers and enrolled students

## Key Features I Handle
- Classroom management
- Assignment creation and submission
- Lesson content delivery
- Student progress tracking
- Microsoft Teams integration
- Teacher dashboard

## Tech Stack
- Next.js 14 with App Router
- Microsoft Entra ID (Azure AD) authentication
- MSAL for Microsoft auth
- MUI v5 + MUI X Data Grid for tables
- Microsoft Teams integration

## Directory Structure
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx      # Microsoft login
│   ├── (protected)/
│   │   ├── layout.tsx          # Auth wrapper
│   │   ├── dashboard/          # Teacher/Student dashboard
│   │   ├── classrooms/         # Classroom management
│   │   ├── assignments/        # Assignment management
│   │   ├── lessons/            # Lesson content
│   │   └── students/           # Student management
│   └── api/
│       ├── auth/               # Microsoft auth endpoints
│       └── graph/              # MS Graph API proxy
├── components/
│   ├── ClassroomCard.tsx
│   ├── AssignmentList.tsx
│   └── StudentProgress.tsx
└── lib/
    └── graph.ts                # MS Graph API utilities
```

## Critical Files
- `src/app/(auth)/login/page.tsx` - Microsoft login
- `src/app/(protected)/layout.tsx` - Auth wrapper
- `src/lib/graph.ts` - Microsoft Graph API integration
- Microsoft-specific auth components

## Authentication Flow

### Microsoft Entra ID
```typescript
import { useMicrosoftAuth } from '@neram/auth/microsoft';

function LoginButton() {
  const { login, user, loading } = useMicrosoftAuth();

  if (loading) return <Loading />;
  if (user) return <UserProfile user={user} />;

  return <button onClick={login}>Sign in with Microsoft</button>;
}
```

### Getting MS Graph Access Token
```typescript
import { getMicrosoftAccessToken } from '@neram/auth/microsoft';

const accessToken = await getMicrosoftAccessToken(['User.Read', 'Calendars.Read']);
```

## API Routes
- `POST /api/auth/microsoft/*` - Microsoft auth endpoints
- `GET /api/graph/*` - MS Graph API proxy
- `POST /api/assignments/*` - Assignment CRUD
- `POST /api/lessons/*` - Lesson management

## Patterns to Follow

### Protected Route with Microsoft Auth
```typescript
'use client';
import { useMicrosoftAuth } from '@neram/auth';

export default function ProtectedPage() {
  const { user, loading, isAuthenticated } = useMicrosoftAuth();

  if (loading) return <Loading />;
  if (!isAuthenticated) return <MicrosoftLoginButton />;

  return <PageContent user={user} />;
}
```

### Calling MS Graph API
```typescript
// Get user's Teams
const response = await fetch('/api/graph/me/joinedTeams', {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

## Microsoft Teams Integration
- Sync classrooms with Teams channels
- Post assignments to Teams
- Integrate with Teams calendar

## Database Tables Used
- `users` (with `ms_oid` for Microsoft identity)
- `student_profiles` (with `teams_email`, `teams_user_id`)
- `courses`, `batches`
- `assignments`, `lessons`

## When to Involve Other Agents
- Database schema changes → `packages/database/CLAUDE.md`
- Microsoft auth changes → `packages/auth/CLAUDE.md`
- Student enrollment → `apps/admin/CLAUDE.md`
- Student-facing features → `apps/app/CLAUDE.md`

## User Roles
- **Teachers**: Full access to classrooms, assignments, lessons
- **Students**: View lessons, submit assignments, track progress
- Role determined by `user_type` in `users` table

## Testing Considerations
- Mock MSAL for tests
- Use MS Graph API mocks
- Test with different user roles
