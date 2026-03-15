# Nexus × Microsoft Graph — User profile data reference

Everything you can pull from Microsoft Entra ID into Nexus via Graph API.

---

## Quick context

Your Neram Entra ID tenant already stores all user data. Every student, teacher, and admin who signs into Teams or Nexus has a full Microsoft user object. Graph API lets Nexus read (and in some cases write) this data. Below is **every property** available, organized by what matters for Neram Classes.

---

## 1. Profile picture (avatar)

This is the highest-demand item — showing user photos in Nexus.

### How to fetch

```
GET /users/{id}/photo/$value
```

Returns the raw binary image (JPEG or PNG). For the signed-in user, use `/me/photo/$value`.

### Available sizes

```
GET /users/{id}/photos/{size}/$value
```

Sizes: `48x48`, `64x64`, `96x96`, `120x120`, `240x240`, `360x360`, `432x432`, `504x504`, `648x648`

### Implementation in Nexus

```typescript
// Next.js API route: /api/graph/users/[id]/photo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGraphToken } from '@/lib/graph-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getGraphToken(req);
  const size = req.nextUrl.searchParams.get('size') || '120x120';
  
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${params.id}/photos/${size}/$value`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    // User has no photo — return default avatar
    return NextResponse.json({ fallback: true }, { status: 404 });
  }

  const imageBuffer = await response.arrayBuffer();
  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400', // Cache 24 hours
    },
  });
}
```

### Fluent UI avatar component

```tsx
import { Avatar, Persona, PresenceBadgeStatus } from '@fluentui/react-components';

// Simple avatar
<Avatar
  image={{ src: `/api/graph/users/${userId}/photo?size=120x120` }}
  name={displayName}  // Fallback: renders initials
  size={48}
/>

// Full persona with presence
<Persona
  avatar={{
    image: { src: `/api/graph/users/${userId}/photo?size=120x120` },
  }}
  name={displayName}
  secondaryText={jobTitle || department}
  presence={{ status: presenceStatus as PresenceBadgeStatus }}
  size="large"
/>
```

### Permission required

| Scope | Type | What it gets |
|-------|------|-------------|
| `User.Read` | Delegated | Signed-in user's own photo |
| `User.ReadBasic.All` | Delegated | Any org user's photo |

### Fallback when no photo exists

Graph returns `404` if a user hasn't uploaded a photo. In Nexus, fall back to Fluent UI's `Avatar` component which auto-generates initials from the `name` prop (e.g., "Hari M" → "HM" in a colored circle).

---

## 2. User properties — complete list

### Default properties (returned without `$select`)

These come back automatically when you call `GET /users` or `GET /users/{id}`:

| Property | Type | Example | Neram use case |
|----------|------|---------|----------------|
| `id` | String (UUID) | `87d349ed-44d7-43e1...` | Primary key linking to Supabase `user_profiles.microsoft_oid` |
| `displayName` | String | `Hari Murugan` | Show everywhere — cards, lists, chat messages |
| `givenName` | String | `Hari` | First name for greetings, informal UI |
| `surname` | String | `Murugan` | Last name for formal contexts, sorting |
| `mail` | String | `hari@neramclasses.com` | Email display, notifications, contact |
| `userPrincipalName` | String | `hari@neramclasses.com` | Login identifier, unique per tenant |
| `jobTitle` | String | `Teacher` / `Student` | Role indicator (set this in Entra admin for each user!) |
| `department` | String | `NATA 2026 Batch` | Batch/class grouping |
| `officeLocation` | String | `Pudukkottai Center` | Physical location / branch |
| `businessPhones` | String[] | `["+91-4322-XXXXX"]` | Contact number (office) |
| `mobilePhone` | String | `+91-98XXX-XXXXX` | WhatsApp / direct contact |
| `preferredLanguage` | String | `ta` / `en` | Language preference for Nexus UI |

### Extended properties (require `$select`)

Add these to the query: `GET /users/{id}?$select=displayName,city,state,country,...`

| Property | Type | Example | Neram use case |
|----------|------|---------|----------------|
| `city` | String | `Pudukkottai` | Student's home city |
| `state` | String | `Tamil Nadu` | State for TNEA/regional filtering |
| `country` | String | `India` / `UAE` | Country — critical for Gulf NRI students |
| `postalCode` | String | `622001` | Postal code for location-based services |
| `streetAddress` | String | `12 East Car Street` | Full address (set by admin) |
| `companyName` | String | `Neram Classes` | Organization name |
| `employeeId` | String | `NERAM-2026-042` | Custom student/teacher ID |
| `employeeType` | String | `Student` / `Teacher` / `Admin` | Role classification |
| `employeeHireDate` | DateTime | `2025-09-01T00:00:00Z` | Enrollment/joining date |
| `createdDateTime` | DateTime | `2025-08-15T10:30:00Z` | When the account was created |
| `accountEnabled` | Boolean | `true` | Is the account active? Useful for alumni |
| `ageGroup` | String | `Minor` / `Adult` | Age classification for CoA compliance |
| `faxNumber` | String | — | Rarely used |
| `imAddresses` | String[] | `["sip:hari@neram..."]` | IM address (Teams/Skype) |
| `onPremisesExtensionAttributes` | Object | Custom fields | 15 custom string fields (extensionAttribute1-15) |

### Properties available only for single user GET (not in `/users` list)

These require `GET /users/{id}?$select=aboutMe,birthday,...` — they cannot be fetched in bulk:

| Property | Type | Example | Neram use case |
|----------|------|---------|----------------|
| `aboutMe` | String | `"Aspiring architect..."` | Student bio for profile page |
| `birthday` | DateTime | `2007-05-15T00:00:00Z` | Age verification, birthday wishes |
| `interests` | String[] | `["Architecture", "Sketching"]` | Student interests for recommendations |
| `schools` | String[] | `["St. Joseph's HSS"]` | School name for student records |
| `skills` | String[] | `["Perspective drawing", "NATA prep"]` | Skill tags for progress tracking |
| `responsibilities` | String[] | `["Batch coordinator"]` | Role-specific responsibilities |
| `pastProjects` | String[] | `["NATA 2025 Batch"]` | Past batch enrollments |
| `hireDate` | DateTime | `2025-09-01T00:00:00Z` | Original joining date |
| `preferredName` | String | `Hari` | Preferred display name |
| `mySite` | String | `https://findhari.com` | Personal website/portfolio |

---

## 3. Presence (online status)

### How to fetch

```
GET /users/{id}/presence
```

Bulk fetch (up to 650 users at once):
```
POST /communications/getPresencesByUserId
{
  "ids": ["id1", "id2", "id3"]
}
```

### Response

```json
{
  "id": "87d349ed-...",
  "availability": "Available",
  "activity": "Available",
  "statusMessage": {
    "message": { "content": "In a meeting till 4 PM" }
  }
}
```

### Availability values

| Value | Fluent UI badge | Meaning |
|-------|----------------|---------|
| `Available` | 🟢 `available` | Online and free |
| `Busy` | 🔴 `busy` | In a call/meeting |
| `DoNotDisturb` | 🔴 `do-not-disturb` | DND mode |
| `Away` | 🟡 `away` | Idle / stepped away |
| `BeRightBack` | 🟡 `away` | Temporarily away |
| `Offline` | ⚫ `offline` | Not signed in |
| `PresenceUnknown` | ⚫ `offline` | Status unknown |

### Permission required

| Scope | Type |
|-------|------|
| `Presence.Read.All` | Delegated |

---

## 4. Manager and org chart

### How to fetch

```
GET /users/{id}/manager          → Returns the user's manager
GET /users/{id}/directReports    → Returns people who report to this user
```

### Neram use case

Map teacher → student relationships. If you set teachers as "managers" of their batch students in Entra, you get a built-in hierarchy:
- A teacher can see all their `directReports` (students)
- A student can see their `manager` (assigned teacher)

### Permission required

| Scope | Type |
|-------|------|
| `User.Read.All` | Delegated |

---

## 5. Group memberships

### How to fetch

```
GET /users/{id}/memberOf          → All groups the user belongs to
GET /users/{id}/transitiveMemberOf → Including nested group memberships
GET /groups/{groupId}/members     → All members of a specific group
```

### Neram use case

Create Entra security groups for each batch/class:
- `Neram-NATA-2026-Batch-A`
- `Neram-JEE-2026-Online`
- `Neram-Teachers`
- `Neram-Admins`

Nexus reads these group memberships to auto-assign roles and classroom enrollments, instead of manually managing them in Supabase.

### Permission required

| Scope | Type |
|-------|------|
| `GroupMember.Read.All` | Delegated |

---

## 6. Teams-specific user data

### Teams the user belongs to

```
GET /me/joinedTeams
```

Returns team IDs, display names, and descriptions. Map these to Nexus classrooms.

### User's role in a team

```
GET /teams/{teamId}/members
```

Returns each member with their role (`owner` = teacher, `member` = student).

### User's chat threads

```
GET /me/chats
```

Returns all 1:1 and group chats. Each chat has `id`, `topic`, `lastUpdatedDateTime`, and `members`.

### Permission required

| Scope | Type |
|-------|------|
| `Team.ReadBasic.All` | Delegated |
| `TeamMember.Read.All` | Delegated |
| `Chat.Read` | Delegated |

---

## 7. Calendar and meeting data

### Upcoming events

```
GET /me/calendarView?startDateTime=2026-03-15T00:00:00Z&endDateTime=2026-03-22T00:00:00Z
```

### Meeting details

```
GET /me/onlineMeetings/{meetingId}
```

Returns: `joinWebUrl`, `subject`, `startDateTime`, `endDateTime`, `participants`, `recordingContentUrl`.

### Permission required

| Scope | Type |
|-------|------|
| `Calendars.Read` | Delegated |
| `OnlineMeetings.Read` | Delegated |

---

## 8. OneDrive / SharePoint files

### User's OneDrive root

```
GET /me/drive/root/children
```

### Team channel files (class materials)

```
GET /teams/{teamId}/channels/{channelId}/filesFolder
GET /drives/{driveId}/items/{folderId}/children
```

### Permission required

| Scope | Type |
|-------|------|
| `Files.Read.All` | Delegated |

---

## 9. Recommended `$select` queries for Nexus

### Student card (list view)

```
GET /users?$select=id,displayName,givenName,surname,mail,jobTitle,department,
    mobilePhone,officeLocation,city,state,country,accountEnabled,employeeId
    &$filter=department eq 'NATA 2026 Batch'
    &$orderby=displayName
    &$top=50
```

### Student profile (detail view)

```
GET /users/{id}?$select=id,displayName,givenName,surname,mail,userPrincipalName,
    jobTitle,department,mobilePhone,businessPhones,officeLocation,
    city,state,country,postalCode,streetAddress,
    employeeId,employeeType,employeeHireDate,
    createdDateTime,accountEnabled,aboutMe,birthday,interests,schools,skills,
    preferredLanguage,preferredName
```

### Teacher directory

```
GET /users?$select=id,displayName,mail,jobTitle,department,mobilePhone,officeLocation
    &$filter=jobTitle eq 'Teacher'
    &$orderby=displayName
```

### People search (type-ahead)

```
GET /users?$search="displayName:Ram"
    &$select=id,displayName,mail,jobTitle,department
    &$orderby=displayName
    &$count=true
    &$top=10
Header: ConsistencyLevel: eventual
```

### Batch presence check

```
POST /communications/getPresencesByUserId
{
  "ids": ["id1", "id2", "id3", ... up to 650]
}
```

---

## 10. Setting user properties (admin only)

As the Neram tenant admin, you can pre-populate user fields that Nexus reads. This is done either in Azure Portal or via Graph API:

```
PATCH /users/{id}
{
  "jobTitle": "Student",
  "department": "NATA 2026 Batch A",
  "officeLocation": "Pudukkottai Center",
  "city": "Pudukkottai",
  "state": "Tamil Nadu",
  "country": "India",
  "employeeId": "NERAM-2026-042",
  "employeeType": "Student",
  "employeeHireDate": "2025-09-01T00:00:00Z"
}
```

### Recommended field mapping for Neram

| Entra field | What to store | Example |
|-------------|--------------|---------|
| `jobTitle` | Role | `Student`, `Teacher`, `Admin`, `Parent` |
| `department` | Batch / class name | `NATA 2026 Batch A`, `JEE 2026 Online` |
| `officeLocation` | Branch / center | `Pudukkottai`, `Chennai`, `Online`, `Dubai` |
| `city` | Home city | `Pudukkottai`, `Trichy`, `Coimbatore` |
| `state` | Home state | `Tamil Nadu`, `Kerala`, `Karnataka` |
| `country` | Country | `India`, `UAE`, `Saudi Arabia`, `Qatar` |
| `employeeId` | Neram student/teacher ID | `NERAM-2026-042` |
| `employeeType` | User type | `Student`, `Teacher`, `Admin` |
| `employeeHireDate` | Enrollment date | `2025-09-01` |
| `aboutMe` | Student bio (optional) | Free text |
| `schools` | School name | `["St. Joseph's HSS, Trichy"]` |
| `skills` | Exam targets | `["NATA", "JEE Paper 2"]` |

### Permission required for writing

| Scope | Type |
|-------|------|
| `User.ReadWrite.All` | Application (admin daemon) |
| `Directory.ReadWrite.All` | Application (admin daemon) |

---

## 11. Custom extension attributes

If the 60+ built-in properties aren't enough, Entra supports 15 custom string fields called `onPremisesExtensionAttributes`:

```
PATCH /users/{id}
{
  "onPremisesExtensionAttributes": {
    "extensionAttribute1": "NATA-2026",
    "extensionAttribute2": "AIR-1-aspirant",
    "extensionAttribute3": "parent-phone:+91-98XXX-XXXXX",
    "extensionAttribute4": "guardian-name:Murugan K",
    "extensionAttribute5": "blood-group:O+"
  }
}
```

Read them back:
```
GET /users/{id}?$select=displayName,onPremisesExtensionAttributes
```

### Suggested custom attributes for Neram

| Attribute | Field | Purpose |
|-----------|-------|---------|
| `extensionAttribute1` | Target exam | `NATA` / `JEE` / `Both` |
| `extensionAttribute2` | Parent name | Guardian for minors |
| `extensionAttribute3` | Parent phone | For parent communication |
| `extensionAttribute4` | Blood group | Safety records |
| `extensionAttribute5` | Fee status | `Paid` / `Partial` / `Pending` |

---

## 12. Complete permissions summary

| Scope | What Nexus can do | Phase |
|-------|-------------------|-------|
| `User.Read` | Read signed-in user's own profile + photo | 1 (existing) |
| `User.ReadBasic.All` | Search/list all org users, read basic profile + photo | 1 |
| `Presence.Read.All` | Read online status of any org user | 1 |
| `ChannelMessage.Read.All` | Read Teams channel messages | 1 |
| `Chat.Read` | Read user's 1:1 and group chats | 1 |
| `Chat.ReadWrite` | Send messages to Teams from Nexus | 1 |
| `Team.ReadBasic.All` | List user's Teams | 1 |
| `Channel.ReadBasic.All` | List channels in a Team | 1 |
| `Files.Read.All` | Read OneDrive/SharePoint files | 2 |
| `Calendars.Read` | Read calendar events | 2 |
| `OnlineMeetings.Read` | Read meeting details + join URLs | 2 |
| `GroupMember.Read.All` | Read group memberships for role sync | 3 |
| `TeamMember.Read.All` | Read team member roles | 3 |
| `User.ReadWrite.All` | Write user properties (admin only) | 3 |

---

## 13. Data flow diagram

```
┌─────────────────────────────────────────────────────┐
│               Microsoft Entra ID Tenant              │
│                  (Neram Classes)                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Users    │  │  Groups  │  │  Teams + Channels │   │
│  │  Photos   │  │  Roles   │  │  Chats + Files    │   │
│  │  Presence │  │  Batches │  │  Meetings + Calls │   │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │              │                 │               │
│       └──────────────┼─────────────────┘               │
│                      │                                 │
│              Microsoft Graph API                       │
│              graph.microsoft.com/v1.0                  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       │ HTTPS (Bearer token)
                       │
┌──────────────────────┴─────────────────────────────────┐
│            Nexus (nexus.neramclasses.com)               │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │  Next.js API Routes (/api/graph/*)       │           │
│  │  • Token forwarding (MSAL → Graph)       │           │
│  │  • Response caching (photos: 24h)        │           │
│  │  • Rate limiting (4 req/min/user)        │           │
│  └────────────────┬─────────────────────────┘           │
│                   │                                     │
│  ┌────────────────┴─────────────────────────┐           │
│  │  Nexus UI (Fluent UI v9)                 │           │
│  │                                          │           │
│  │  • Avatar + Presence badges              │           │
│  │  • PeoplePicker search                   │           │
│  │  • ChatPanel (Teams messages)            │           │
│  │  • FileExplorer (SharePoint)             │           │
│  │  • CalendarView (upcoming classes)       │           │
│  │  • StudentCard / TeacherCard             │           │
│  └──────────────────────────────────────────┘           │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │  Supabase (neram-staging / neram-prod)   │           │
│  │                                          │           │
│  │  • user_profiles.microsoft_oid → links   │           │
│  │  • classroom_teams_map → Teams IDs       │           │
│  │  • All other Nexus data (attendance,     │           │
│  │    grades, tickets, questions, etc.)      │           │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

---

## 14. Important notes

1. **Photo caching**: Profile photos rarely change. Cache them aggressively (24h in Nexus API, browser `Cache-Control`). Use ETags for conditional requests.

2. **Batch requests**: Graph supports `$batch` — combine up to 20 requests in a single HTTP call. Use this for the student list page (fetch profiles + photos + presence in one round trip).

3. **Delta queries**: For user directory sync, use `GET /users/delta` to get only changes since last sync instead of re-fetching everyone.

4. **Rate limits**: Graph throttles at ~10,000 requests per 10 minutes per app. For Neram's scale (~100-200 users), this is never an issue.

5. **Consent**: All delegated scopes require either user consent (for `User.Read`) or admin consent (for `.All` scopes). As tenant admin, Hari grants admin consent once in Azure Portal.

6. **No PII storage**: Nexus does **not** duplicate Microsoft user data into Supabase. It stores only the `microsoft_oid` (UUID) as a foreign key. All profile data is fetched live from Graph, ensuring single source of truth.
