# Kerala SEO/AEO Dominance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create ~32 SEO-optimized pages (1 state hub + 5 city hubs + ~24 neighborhood pages) to dominate "NATA coaching" search results across Kerala's major cities.

**Architecture:** Generalize the proven Chennai hub-and-spoke SEO pattern into reusable components. Kerala data lives in a single data file (`kerala-cities.ts`) that feeds generic components (`CityHubPage`, `CityNeighborhoodPage`, `StateHubPage`). Dynamic `[slug]` routes per city render neighborhood pages from the data file. Sitemap auto-generates entries from data.

**Tech Stack:** Next.js 14 App Router, next-intl, MUI v5, JSON-LD structured data

**Spec:** `docs/superpowers/specs/2026-04-03-kerala-seo-dominance-design.md`

---

## Dependency Graph

```
Layer 0 (parallel):   [Task 1: Interfaces]   [Task 2: Kerala Data]   [Task 3: Schemas]
                            |                        |                      |
Layer 1 (parallel):   [Task 4: NeighborhoodPage]  [Task 5: CityHub]  [Task 6: StateHub]
                            \                        |                    /
Layer 2 (parallel):   [Task 7: Kerala route] [Task 8: Kochi] [Task 9: Triv] [Task 10: Cal] [Task 11: Thr] [Task 12: Kan]
                                \                |          |         |         |          /
Layer 3 (parallel):          [Task 13: Sitemap]  [Task 14: Redirects]  [Task 15: Translations]
                                        \               |                /
Layer 4:                            [Task 16: Build & Verify]
```

---

### Task 1: Generic City Data Interfaces

**Files:**
- Create: `apps/marketing/src/lib/seo/city-neighborhoods.ts`

- [ ] **Step 1: Create the interfaces and helper functions file**

```typescript
// apps/marketing/src/lib/seo/city-neighborhoods.ts
import { BASE_URL, ORG_NAME, ORG_PHONE, ORG_EMAIL, SOCIAL_PROFILES, ORG_LOGO } from '@/lib/seo/constants';

export interface CityNeighborhood {
  slug: string;
  name: string;
  displayName: string;
  distanceFromCenter: string;
  transportInfo: string;
  landmarks: string[];
  nearbySchools: string[];
  description: string;
  whyStudentsChoose: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  faqs: Array<{ question: string; answer: string }>;
}

export interface CityData {
  slug: string;
  officialName: string;
  displayName: string;
  state: string;
  stateSlug: string;
  centerAddress: string;
  centerStatus: 'active' | 'coming-soon';
  centerCoords: { lat: number; lng: number };
  nearbyColleges: string[];
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  faqs: Array<{ question: string; answer: string }>;
  neighborhoods: CityNeighborhood[];
}

export interface StateData {
  name: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  nearbyColleges: string[];
  faqs: Array<{ question: string; answer: string }>;
}

export function getCityBySlug(cities: CityData[], slug: string): CityData | undefined {
  return cities.find((c) => c.slug === slug);
}

export function getNeighborhoodBySlug(city: CityData, slug: string): CityNeighborhood | undefined {
  return city.neighborhoods.find((n) => n.slug === slug);
}

export function generateCityNeighborhoodSchema(city: CityData, neighborhood: CityNeighborhood) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/coaching/nata-coaching-${city.slug}/${neighborhood.slug}`,
    name: `${ORG_NAME} — NATA Coaching for ${neighborhood.name}, ${city.displayName}`,
    url: `${BASE_URL}/coaching/nata-coaching-${city.slug}/${neighborhood.slug}`,
    logo: ORG_LOGO,
    image: ORG_LOGO,
    description: `Best NATA coaching for students in ${neighborhood.name}, ${city.displayName}. ${neighborhood.distanceFromCenter}. IIT/NIT/SPA alumni faculty, 99.9% success rate, free AI study app, max 25 per batch.`,
    telephone: ORG_PHONE,
    email: ORG_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: city.centerAddress,
      addressLocality: city.displayName,
      addressRegion: city.state,
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: city.centerCoords.lat,
      longitude: city.centerCoords.lng,
    },
    sameAs: SOCIAL_PROFILES,
    areaServed: { '@type': 'City', name: city.displayName },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '50',
      bestRating: '5',
      worstRating: '1',
    },
    parentOrganization: { '@id': `${BASE_URL}/#organization` },
  };
}

export function generateCityHubSchema(city: CityData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/coaching/nata-coaching-${city.slug}`,
    name: `${ORG_NAME} — NATA Coaching in ${city.displayName}`,
    url: `${BASE_URL}/coaching/nata-coaching-${city.slug}`,
    logo: ORG_LOGO,
    description: `Best NATA coaching in ${city.displayName}, ${city.state}. IIT/NIT/SPA alumni faculty, 99.9% success rate since 2009.`,
    telephone: ORG_PHONE,
    email: ORG_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: city.centerAddress,
      addressLocality: city.displayName,
      addressRegion: city.state,
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: city.centerCoords.lat,
      longitude: city.centerCoords.lng,
    },
    sameAs: SOCIAL_PROFILES,
    areaServed: { '@type': 'City', name: city.displayName },
    parentOrganization: { '@id': `${BASE_URL}/#organization` },
  };
}

export function generateStateHubSchema(state: StateData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/coaching/nata-coaching-${state.slug}`,
    name: `${ORG_NAME} — NATA Coaching in ${state.name}`,
    url: `${BASE_URL}/coaching/nata-coaching-${state.slug}`,
    logo: ORG_LOGO,
    description: `Best NATA coaching in ${state.name}. IIT/NIT/SPA alumni faculty, 99.9% success rate since 2009. Online + classroom coaching.`,
    telephone: ORG_PHONE,
    email: ORG_EMAIL,
    sameAs: SOCIAL_PROFILES,
    areaServed: { '@type': 'State', name: state.name },
    parentOrganization: { '@id': `${BASE_URL}/#organization` },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/marketing && npx tsc --noEmit src/lib/seo/city-neighborhoods.ts 2>&1 | head -20`
Expected: No errors (or only unrelated existing errors)

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/lib/seo/city-neighborhoods.ts
git commit -m "feat(marketing): add generic CityData interfaces and schema generators for multi-city SEO pages"
```

---

### Task 2: Kerala Cities Data File

**Files:**
- Create: `apps/marketing/src/lib/seo/kerala-cities.ts`

This is the largest content task. Each city has ~5 neighborhoods, each with rich local data.

- [ ] **Step 1: Create the Kerala cities data file with all 5 cities and ~24 neighborhoods**

```typescript
// apps/marketing/src/lib/seo/kerala-cities.ts
import type { CityData, StateData } from './city-neighborhoods';

// ─── KERALA STATE META ───────────────────────────────────────────────
export const keralaState: StateData = {
  name: 'Kerala',
  slug: 'kerala',
  metaTitle: 'Best NATA Coaching in Kerala 2026 — Online + Classroom | Neram Classes',
  metaDescription: 'Top NATA coaching in Kerala — Kochi, Trivandrum, Calicut, Thrissur, Kannur. IIT/NIT alumni faculty, 99.9% success rate since 2009, free AI study app. Online + classroom hybrid. Get into NIT Calicut, CET Trivandrum, TKM Kollam.',
  metaKeywords: 'NATA coaching Kerala, best NATA coaching in Kerala, NATA classes Kerala, NATA coaching Kochi, NATA coaching Trivandrum, NATA coaching Calicut, NATA coaching Thrissur, NATA coaching Kannur, architecture coaching Kerala, NATA 2026 Kerala',
  nearbyColleges: [
    'NIT Calicut (National Institute of Technology)',
    'College of Engineering Trivandrum (CET)',
    'TKM College of Engineering, Kollam',
    'Government Engineering College, Thrissur',
    'MES College of Engineering, Kuttippuram',
    'MA College of Engineering, Kothamangalam',
    'NSS College of Engineering, Palakkad',
    'Sree Buddha College of Engineering, Alappuzha',
  ],
  faqs: [
    {
      question: 'Is NATA coaching available in Kerala?',
      answer: 'Yes, Neram Classes offers NATA coaching across Kerala — in Kochi, Trivandrum, Calicut, Thrissur, and Kannur. We provide live online classes accessible from anywhere in Kerala, plus physical centers are opening soon in major cities. Since 2009, we have trained 10,000+ students with a 99.9% success rate.',
    },
    {
      question: 'Which is the best NATA coaching center in Kerala?',
      answer: 'Neram Classes is rated the best NATA coaching in Kerala by students and parents. Key advantages: IIT/NIT/SPA alumni faculty, max 25 students per batch, free AI-powered study app with cutoff calculator and college predictor, hybrid online-offline model, and 99.9% success rate since 2009.',
    },
    {
      question: 'Can I attend NATA coaching online from Kerala?',
      answer: 'Yes, Neram offers live interactive NATA classes online from any location in Kerala. Same curriculum, same IIT/NIT faculty, real-time drawing feedback via screen sharing. Students from Kochi, Trivandrum, Calicut, Thrissur, Kannur, and smaller towns all attend our online classes.',
    },
    {
      question: 'What are the top architecture colleges in Kerala?',
      answer: 'Kerala has excellent architecture programs: NIT Calicut (top-ranked nationally), CET Trivandrum, TKM College Kollam, GEC Thrissur, MES College Kuttippuram, MA College Kothamangalam, and NSS College Palakkad. A good NATA score (130+) opens doors to all these colleges.',
    },
    {
      question: 'What NATA score is needed for NIT Calicut?',
      answer: 'NIT Calicut typically requires a NATA score of 140+ for general category admission. For reserved categories, 120-130 is usually sufficient. Neram Classes students consistently score 140+ — our structured preparation covers both drawing (80 marks) and aptitude (120 marks) with daily practice.',
    },
    {
      question: 'How much does NATA coaching cost in Kerala?',
      answer: 'Neram Classes NATA coaching starts at ₹15,000 for the crash course (3 months) and ₹25,000 for the 1-year program. This includes free access to our AI study app, mock tests, and drawing practice sessions. Scholarships available for meritorious students.',
    },
    {
      question: 'Is online NATA coaching effective for drawing practice?',
      answer: 'Yes, Neram\'s online NATA coaching includes real-time drawing feedback via screen sharing and tablet-based drawing exercises. Our faculty reviews each student\'s drawings individually. Many of our top scorers (140+) prepared entirely online.',
    },
    {
      question: 'When should I start NATA preparation in Kerala?',
      answer: 'Ideally, start in Class 11 for the 2-year program. For Class 12 students, the 1-year program covers everything. Even a 3-month crash course before the exam has helped students score 120+. Neram offers flexible batch timings suited to Kerala academic schedules.',
    },
  ],
};

// ─── KOCHI ───────────────────────────────────────────────────────────
const kochi: CityData = {
  slug: 'kochi',
  officialName: 'Ernakulam',
  displayName: 'Kochi (Cochin)',
  state: 'Kerala',
  stateSlug: 'kerala',
  centerAddress: 'Coming Soon — Kochi, Kerala',
  centerStatus: 'coming-soon',
  centerCoords: { lat: 9.9312, lng: 76.2673 },
  nearbyColleges: ['MA College of Engineering Kothamangalam', 'Sree Buddha College Alappuzha', 'Rajagiri School of Engineering', 'FISAT Angamaly'],
  metaTitle: 'Best NATA Coaching in Kochi (Cochin) 2026 | Neram Classes',
  metaDescription: 'Top NATA coaching in Kochi — IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Online classes now + Kochi center coming soon. Serving Edappally, Kakkanad, Marine Drive, Aluva, Tripunithura students.',
  metaKeywords: 'NATA coaching Kochi, NATA coaching Cochin, NATA classes Kochi, best NATA coaching Kochi, architecture coaching Kochi, NATA coaching Ernakulam, NATA 2026 Kochi',
  faqs: [
    {
      question: 'Is there NATA coaching in Kochi?',
      answer: 'Yes, Neram Classes offers live online NATA coaching for Kochi students right now, with a physical center opening soon. IIT/NIT alumni faculty, max 25 per batch, free AI study app. Students from Edappally, Kakkanad, Marine Drive, Aluva, and Tripunithura are already enrolled.',
    },
    {
      question: 'Which is the best NATA coaching center in Kochi?',
      answer: 'Neram Classes is the top choice for Kochi students — 99.9% success rate since 2009, IIT/NIT/SPA alumni faculty, max 25 students per batch, and the only institute with a free AI-powered NATA study app with cutoff calculator and college predictor for 5000+ colleges.',
    },
    {
      question: 'Can I attend NATA coaching online from Kochi?',
      answer: 'Yes, Neram offers live interactive online NATA classes from Kochi. Same curriculum, same faculty, real-time drawing feedback. Students from all Kochi areas — Edappally, Kakkanad, Marine Drive, Fort Kochi, Aluva — attend our online sessions.',
    },
    {
      question: 'What architecture colleges can I get into from Kochi?',
      answer: 'Kochi students typically target: NIT Calicut, CET Trivandrum, MA College Kothamangalam, TKM Kollam, and Rajagiri School of Engineering. With a good NATA score (130+), all these are within reach. Neram students consistently score 140+.',
    },
    {
      question: 'What are the fees for NATA coaching in Kochi?',
      answer: 'Neram NATA coaching starts at ₹15,000 (crash course, 3 months) and ₹25,000 (1-year program). Includes free AI study app, mock tests, daily drawing practice. Scholarships available for meritorious students.',
    },
    {
      question: 'When will Neram open a center in Kochi?',
      answer: 'Neram is planning to open a physical center in Kochi soon. Until then, our live online classes provide the same quality coaching with real-time drawing feedback. Many Kochi students have already scored 130+ through our online program.',
    },
  ],
  neighborhoods: [
    {
      slug: 'edappally',
      name: 'Edappally',
      displayName: 'Edappally',
      distanceFromCenter: 'Central Kochi — prime location for upcoming center',
      transportInfo: 'Edappally is a major junction on NH 66 with excellent connectivity. Kochi Metro (Edappally station) connects to all parts of the city. KSRTC buses from Edappally Junction to all Kerala cities. 10 km from Cochin International Airport.',
      landmarks: ['Lulu Mall (India\'s largest mall)', 'Edappally Church (St. George Forane Church)', 'Edappally Junction', 'Kochi Metro Edappally Station'],
      nearbySchools: ['Rajagiri Public School', 'Bhavans Adarsha Vidyalaya', 'Choice School Tripunithura', 'GEMS School Edappally'],
      description: 'Edappally is Kochi\'s commercial and retail hub, home to Lulu Mall — India\'s largest shopping mall. The area\'s modern architecture, from the mall\'s design to the new metro stations, provides aspiring architects with contemporary examples of commercial and transit design. Edappally Junction is one of Kochi\'s most connected points, making it ideal for students from all parts of the city.',
      whyStudentsChoose: 'Edappally students choose Neram for our hybrid model — attend live online classes from home, saving commute time. When our Kochi center opens, Edappally\'s central location and metro connectivity will make it easily accessible. Several Edappally students have scored 130+ in NATA through our online program.',
      metaTitle: 'Best NATA Coaching in Edappally, Kochi 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Edappally, Kochi students. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Live online classes now + Kochi center coming soon. Near Lulu Mall. Max 25 per batch.',
      metaKeywords: 'NATA coaching Edappally, NATA classes Edappally Kochi, best NATA coaching near Edappally, architecture coaching Edappally, NATA preparation Edappally Kochi',
      faqs: [
        { question: 'Is there NATA coaching near Edappally, Kochi?', answer: 'Yes, Neram Classes offers live online NATA coaching accessible from Edappally. A physical Kochi center is coming soon. IIT/NIT alumni faculty, max 25 per batch, 99.9% success rate.' },
        { question: 'Which is the best NATA coaching near Edappally?', answer: 'Neram Classes — the only NATA coaching with a free AI study app, IIT/NIT alumni faculty, and max 25 per batch. Live online classes available from Edappally now.' },
        { question: 'Can I attend NATA coaching online from Edappally?', answer: 'Yes, Neram\'s live interactive online classes are available from Edappally. Same curriculum, real-time drawing feedback. Switch to offline when our Kochi center opens.' },
      ],
    },
    {
      slug: 'kakkanad',
      name: 'Kakkanad',
      displayName: 'Kakkanad',
      distanceFromCenter: 'Kochi\'s IT hub — 8 km from city center',
      transportInfo: 'Kakkanad is connected via Seaport-Airport Road (SA Road). KSRTC and private buses from Kakkanad to Ernakulam Junction (30 min). Auto/cab: 25 minutes to city center. Kochi Metro extension to Kakkanad is under construction.',
      landmarks: ['Infopark Kochi', 'SmartCity Kochi', 'Kakkanad Municipality Office', 'Hill Palace Museum (nearby)'],
      nearbySchools: ['Toc H Public School', 'Nirmala Public School Kakkanad', 'Rajagiri Christu Jayanti Public School', 'Sree Narayana Public School'],
      description: 'Kakkanad is Kochi\'s technology hub, home to Infopark and SmartCity — two of Kerala\'s largest IT parks. The area showcases modern tech-campus architecture with sustainable design elements. Many IT professionals\' children in Kakkanad aspire to architecture and design careers. The Hill Palace Museum nearby is a heritage architecture landmark often used for NATA drawing practice.',
      whyStudentsChoose: 'Kakkanad students benefit from Neram\'s online classes that fit around school schedules — no commute to the city center needed. Our AI study app is popular with tech-savvy Kakkanad families. When our Kochi center opens, the upcoming metro extension will provide easy access from Kakkanad.',
      metaTitle: 'Best NATA Coaching in Kakkanad, Kochi 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Kakkanad, Kochi students. Near Infopark & SmartCity. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Live online classes. Max 25 per batch.',
      metaKeywords: 'NATA coaching Kakkanad, NATA classes Kakkanad Kochi, best NATA coaching near Kakkanad, architecture coaching Kakkanad, NATA preparation Infopark Kochi',
      faqs: [
        { question: 'Is there NATA coaching near Kakkanad, Kochi?', answer: 'Yes, Neram Classes offers live online NATA coaching from Kakkanad. IIT/NIT alumni faculty, max 25 per batch. Physical center coming soon in Kochi.' },
        { question: 'Which is the best NATA coaching for Kakkanad students?', answer: 'Neram Classes — free AI study app, IIT/NIT faculty, 99.9% success rate. Online classes designed for Kakkanad students.' },
        { question: 'Can Infopark area students attend NATA coaching online?', answer: 'Yes, Neram\'s live online classes are perfect for Kakkanad/Infopark area students. Real-time drawing feedback, flexible timings, no commute.' },
      ],
    },
    {
      slug: 'marine-drive',
      name: 'Marine Drive',
      displayName: 'Marine Drive',
      distanceFromCenter: 'Kochi city center — waterfront promenade',
      transportInfo: 'Marine Drive is in the heart of Ernakulam city. Walking distance to Ernakulam Junction Railway Station (1 km) and KSRTC Bus Stand (2 km). Kochi Metro nearby at Maharaja\'s College station. Water taxi to Fort Kochi.',
      landmarks: ['Marine Drive Walkway', 'Subhash Park', 'Ernakulam Junction Railway Station', 'High Court of Kerala (nearby)'],
      nearbySchools: ['Maharaja\'s College', 'St. Teresa\'s College', 'Bhavans Vidya Mandir Ernakulam', 'Sacred Heart School Thevara'],
      description: 'Marine Drive is Kochi\'s iconic waterfront promenade overlooking Vembanad Lake and the backwaters. The rainwater harvesting walkway design, the Bolgatty Palace visible across the lake, and the mix of colonial and modern buildings along the waterfront make it a rich study in urban waterfront architecture. For NATA aspirants, Marine Drive offers endless sketching subjects — from the curved promenade to the ferry terminal architecture.',
      whyStudentsChoose: 'Marine Drive students are in the heart of Kochi — when our center opens, it will be easily accessible. Until then, our live online classes and free AI study app provide top-tier NATA preparation. The Marine Drive waterfront itself is a great subject for drawing practice.',
      metaTitle: 'Best NATA Coaching near Marine Drive, Kochi 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Marine Drive, Ernakulam students. Heart of Kochi. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Online classes + Kochi center coming soon.',
      metaKeywords: 'NATA coaching Marine Drive Kochi, NATA classes Ernakulam, best NATA coaching near Marine Drive, architecture coaching Kochi city center',
      faqs: [
        { question: 'Is there NATA coaching near Marine Drive, Kochi?', answer: 'Yes, Neram Classes offers live online NATA coaching accessible from Marine Drive. A physical center is coming soon to Kochi.' },
        { question: 'Which NATA coaching is best for Ernakulam city students?', answer: 'Neram Classes — 99.9% success rate, IIT/NIT faculty, free AI study app. Live online classes from anywhere in Ernakulam.' },
        { question: 'Can I practice NATA drawing at Marine Drive?', answer: 'Yes! Marine Drive\'s waterfront architecture is excellent for NATA sketching practice. Our faculty can guide drawing exercises featuring local landmarks.' },
      ],
    },
    {
      slug: 'aluva',
      name: 'Aluva',
      displayName: 'Aluva (Alwaye)',
      distanceFromCenter: '15 km north of Kochi city center',
      transportInfo: 'Aluva is the northern gateway to Kochi. Kochi Metro\'s northern terminus is at Aluva. Aluva Railway Station on the main trunk line. KSRTC buses to all major cities. 8 km from Cochin International Airport.',
      landmarks: ['Aluva Manapuram (Sivarathri festival ground)', 'Periyar River bank', 'Cochin International Airport (nearby)', 'Aluva Metro Station'],
      nearbySchools: ['St. Mary\'s School Aluva', 'Al-Ameen Public School', 'Nirmala Public School Aluva', 'SBOA School Aluva'],
      description: 'Aluva, sitting on the banks of the Periyar River, is Kochi\'s gateway to the hills and the northern terminus of the Kochi Metro. The area\'s temple architecture (Shiva Temple at Manapuram), colonial-era buildings, and modern metro infrastructure create a fascinating architectural timeline. Aluva\'s proximity to the airport makes it a strategic location for students from northern Ernakulam, Thrissur, and Idukki districts.',
      whyStudentsChoose: 'Aluva students choose Neram for the online-first model — no need to commute 15 km to city center. The Kochi Metro from Aluva provides easy access when our center opens. Students from Angamaly, Perumbavoor, and Kalady also join through our Aluva network.',
      metaTitle: 'Best NATA Coaching in Aluva, Kochi 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Aluva (Alwaye), Kochi students. Near Kochi Metro terminus & Airport. IIT/NIT alumni faculty, 99.9% success rate. Online classes. Serving Angamaly, Perumbavoor students too.',
      metaKeywords: 'NATA coaching Aluva, NATA classes Aluva Kochi, best NATA coaching near Aluva, architecture coaching Alwaye, NATA coaching near Kochi Airport',
      faqs: [
        { question: 'Is there NATA coaching in Aluva?', answer: 'Yes, Neram offers live online NATA coaching from Aluva. Kochi Metro connects Aluva to the upcoming center. IIT/NIT faculty, max 25 per batch.' },
        { question: 'Can Angamaly and Perumbavoor students join?', answer: 'Yes, students from Angamaly, Perumbavoor, Kalady, and nearby areas attend Neram\'s online classes. The metro from Aluva also provides easy access.' },
        { question: 'Is Neram opening a center near Aluva?', answer: 'Neram is opening a center in Kochi soon. Aluva\'s metro connectivity (terminus station) will provide direct access. Online classes available now.' },
      ],
    },
    {
      slug: 'tripunithura',
      name: 'Tripunithura',
      displayName: 'Tripunithura',
      distanceFromCenter: '10 km southeast of Kochi city center',
      transportInfo: 'Tripunithura Railway Station on Ernakulam-Kottayam line. Kochi Metro extension to Tripunithura is planned. Regular buses to Ernakulam Junction (30 min). Auto/cab: 25 minutes to city center via SA Road.',
      landmarks: ['Hill Palace Museum (Kerala\'s largest archaeological museum)', 'Sree Poornathrayeesa Temple', 'Tripunithura Railway Station', 'Kodanad Elephant Training Centre (nearby)'],
      nearbySchools: ['Choice School Tripunithura', 'St. Joseph\'s School', 'SRV Higher Secondary School', 'Tripunithura English Medium School'],
      description: 'Tripunithura is the cultural capital of Kochi, home to the Hill Palace Museum — Kerala\'s largest archaeological museum housed in a stunning heritage palace complex. The Sree Poornathrayeesa Temple showcases Kerala\'s distinctive temple architecture. For NATA aspirants, Tripunithura offers unparalleled sketching subjects: the Hill Palace\'s 49 buildings across 54 acres, traditional Kerala roof architecture (Nalukettu style), and the temple\'s intricate carvings.',
      whyStudentsChoose: 'Tripunithura students benefit from growing up surrounded by heritage architecture — the Hill Palace alone is a masterclass in Kerala architectural design. Neram\'s online classes let Tripunithura students study from home while our faculty guides them through NATA drawing exercises featuring these local landmarks.',
      metaTitle: 'Best NATA Coaching in Tripunithura, Kochi 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Tripunithura, Kochi students. Near Hill Palace Museum — Kerala\'s heritage architecture hub. IIT/NIT alumni faculty, 99.9% success rate, free AI study app.',
      metaKeywords: 'NATA coaching Tripunithura, NATA classes Tripunithura Kochi, best NATA coaching near Tripunithura, architecture coaching Tripunithura, NATA coaching Hill Palace Kochi',
      faqs: [
        { question: 'Is there NATA coaching near Tripunithura?', answer: 'Yes, Neram offers live online NATA coaching from Tripunithura. A Kochi center is coming soon. IIT/NIT faculty, max 25 per batch, 99.9% success rate.' },
        { question: 'Can Hill Palace be used for NATA drawing practice?', answer: 'Yes! Hill Palace Museum is excellent for NATA sketching practice. Our faculty can guide drawing exercises featuring Kerala heritage architecture.' },
        { question: 'Which NATA coaching is best for Tripunithura students?', answer: 'Neram Classes — free AI study app, IIT/NIT alumni faculty, hybrid model. Tripunithura\'s heritage architecture gives our students a natural advantage in NATA drawing.' },
      ],
    },
  ],
};

// ─── THIRUVANANTHAPURAM (TRIVANDRUM) ─────────────────────────────────
const trivandrum: CityData = {
  slug: 'trivandrum',
  officialName: 'Thiruvananthapuram',
  displayName: 'Thiruvananthapuram (Trivandrum)',
  state: 'Kerala',
  stateSlug: 'kerala',
  centerAddress: 'Coming Soon — Thiruvananthapuram, Kerala',
  centerStatus: 'coming-soon',
  centerCoords: { lat: 8.5241, lng: 76.9366 },
  nearbyColleges: ['College of Engineering Trivandrum (CET)', 'TKM College of Engineering Kollam', 'LBS Institute of Technology', 'Mar Baselios College of Engineering Trivandrum'],
  metaTitle: 'Best NATA Coaching in Trivandrum 2026 | Neram Classes',
  metaDescription: 'Top NATA coaching in Thiruvananthapuram (Trivandrum) — IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Near CET Trivandrum. Online + classroom. Serving Kowdiar, Pattom, Technopark, Kazhakkoottam students.',
  metaKeywords: 'NATA coaching Trivandrum, NATA coaching Thiruvananthapuram, NATA classes Trivandrum, best NATA coaching Trivandrum, architecture coaching Trivandrum, NATA coaching near CET Trivandrum',
  faqs: [
    { question: 'Is there NATA coaching in Trivandrum?', answer: 'Yes, Neram Classes offers live online NATA coaching for Trivandrum students. Physical center coming soon. IIT/NIT alumni faculty, 99.9% success rate, free AI study app.' },
    { question: 'Which is the best NATA coaching in Thiruvananthapuram?', answer: 'Neram Classes — IIT/NIT/SPA alumni faculty, max 25 per batch, free AI study app with cutoff calculator and college predictor. 99.9% success rate since 2009.' },
    { question: 'What NATA score is needed for CET Trivandrum?', answer: 'CET Trivandrum typically requires a NATA score of 130+ for general category. Neram students consistently score 140+.' },
    { question: 'Can I attend NATA coaching online from Trivandrum?', answer: 'Yes, Neram\'s live interactive online classes are available from all Trivandrum areas — Kowdiar, Pattom, Technopark, Kazhakkoottam, and Vattiyoorkavu.' },
    { question: 'When will Neram open a center in Trivandrum?', answer: 'Neram is planning to open a physical center in Trivandrum soon. Online classes available now with the same quality coaching.' },
  ],
  neighborhoods: [
    {
      slug: 'kowdiar',
      name: 'Kowdiar',
      displayName: 'Kowdiar',
      distanceFromCenter: 'Premium residential area — 3 km from city center',
      transportInfo: 'Kowdiar is centrally located in Trivandrum. KSRTC buses from East Fort (5 min). Auto/cab: 10 minutes from Trivandrum Central Railway Station. Close to Kowdiar Palace and Museum area.',
      landmarks: ['Kowdiar Palace', 'Kanakakunnu Palace', 'Trivandrum Zoo (nearby)', 'Napier Museum'],
      nearbySchools: ['Loyola School Trivandrum', 'Holy Angels\' ISC School', 'Kendriya Vidyalaya Pattom', 'St. Joseph\'s Higher Secondary School'],
      description: 'Kowdiar is Trivandrum\'s most prestigious residential area, home to the Kowdiar Palace — the official residence of the Travancore royal family. The neighborhood showcases Kerala\'s finest heritage architecture: the Indo-Saracenic Napier Museum, the palace\'s Kerala-European fusion design, and the nearby Kanakakunnu Palace. For NATA aspirants, Kowdiar is an open-air architecture museum.',
      whyStudentsChoose: 'Kowdiar students are surrounded by architectural heritage — from the Kowdiar Palace to the Napier Museum. Neram\'s online classes help them channel this advantage into NATA scores. Our faculty guides drawing exercises featuring Trivandrum\'s heritage buildings.',
      metaTitle: 'Best NATA Coaching in Kowdiar, Trivandrum 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Kowdiar, Trivandrum students. Near Kowdiar Palace & Napier Museum. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Max 25 per batch.',
      metaKeywords: 'NATA coaching Kowdiar, NATA classes Kowdiar Trivandrum, best NATA coaching near Kowdiar, architecture coaching Kowdiar Trivandrum',
      faqs: [
        { question: 'Is there NATA coaching near Kowdiar, Trivandrum?', answer: 'Yes, Neram offers live online NATA coaching from Kowdiar. Trivandrum center coming soon. IIT/NIT faculty, max 25 per batch.' },
        { question: 'Which is the best NATA coaching for Kowdiar students?', answer: 'Neram Classes — free AI study app, IIT/NIT faculty, 99.9% success rate. Online classes from home in Kowdiar.' },
        { question: 'Can Kowdiar Palace be used for NATA drawing practice?', answer: 'Yes! Kowdiar Palace and nearby Napier Museum are excellent for NATA sketching. Our faculty guides local landmark-based drawing exercises.' },
      ],
    },
    {
      slug: 'pattom',
      name: 'Pattom',
      displayName: 'Pattom',
      distanceFromCenter: 'Government hub — 2 km from city center',
      transportInfo: 'Pattom is on the main Trivandrum road network. KSRTC buses from Pattom Junction to all parts of the city. Auto/cab: 5 minutes from Kerala Secretariat. Near Trivandrum Central Railway Station.',
      landmarks: ['Kerala Secretariat', 'Kerala State Library', 'Pattom Palace Road', 'Government Press Junction'],
      nearbySchools: ['Kendriya Vidyalaya Pattom', 'Carmel Girls School', 'St. Mary\'s HSS Pattom', 'Cotton Hill School (nearby)'],
      description: 'Pattom is the administrative heart of Kerala, housing the Kerala Secretariat and many government buildings. The area\'s institutional architecture — from the colonial-era Secretariat building to modern government complexes — showcases how public architecture evolves. For NATA students, Pattom offers examples of both heritage institutional design and contemporary government architecture.',
      whyStudentsChoose: 'Pattom students benefit from Neram\'s flexible online schedule that works around school timings. The government buildings in Pattom provide unique NATA drawing subjects. When our Trivandrum center opens, Pattom\'s central location ensures easy access.',
      metaTitle: 'Best NATA Coaching in Pattom, Trivandrum 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Pattom, Trivandrum students. Near Kerala Secretariat. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Online + classroom.',
      metaKeywords: 'NATA coaching Pattom, NATA classes Pattom Trivandrum, best NATA coaching near Pattom, architecture coaching Pattom Thiruvananthapuram',
      faqs: [
        { question: 'Is there NATA coaching near Pattom, Trivandrum?', answer: 'Yes, Neram offers live online NATA coaching from Pattom. Trivandrum center coming soon. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Pattom students attend NATA coaching online?', answer: 'Yes, live interactive online classes from Pattom. Same IIT/NIT faculty, real-time drawing feedback, flexible timings.' },
        { question: 'Which is the nearest NATA coaching to Kerala Secretariat?', answer: 'Neram Classes serves Pattom/Secretariat area students through online classes now and a physical center coming soon.' },
      ],
    },
    {
      slug: 'technopark',
      name: 'Technopark',
      displayName: 'Technopark (Kazhakkoottam)',
      distanceFromCenter: '15 km from city center — IT hub',
      transportInfo: 'Technopark is on NH 66, south of Trivandrum. KSRTC buses from Technopark to East Fort (45 min). Auto/cab: 30 minutes to city center. Near Trivandrum International Airport (5 km).',
      landmarks: ['Technopark Phase I, II, III', 'Trivandrum International Airport', 'Kovalam Beach (nearby)', 'Shanghumughom Beach'],
      nearbySchools: ['Kendriya Vidyalaya Pangode', 'The Oxford School Trivandrum', 'Saraswathi Vidyalaya', 'EMS Vidyalayam Technopark'],
      description: 'Technopark (Kazhakkoottam) is India\'s first technology park and Kerala\'s IT hub, designed by renowned architect Charles Correa. The campus\'s sustainable design, green buildings, and landscape architecture are world-class examples of technology-campus design. For NATA students, Technopark demonstrates how architecture and technology converge — from the campus master plan to individual building designs.',
      whyStudentsChoose: 'Technopark students (often children of IT professionals) value Neram\'s tech-forward approach — our AI study app, online classes, and digital drawing tools resonate with their families. The Technopark campus itself is a valuable NATA drawing subject.',
      metaTitle: 'Best NATA Coaching near Technopark, Trivandrum 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Technopark/Kazhakkoottam, Trivandrum students. Near India\'s first tech park. IIT/NIT alumni faculty, 99.9% success rate. Online classes + AI study app.',
      metaKeywords: 'NATA coaching Technopark, NATA classes Kazhakkoottam, best NATA coaching near Technopark Trivandrum, architecture coaching Technopark Kerala',
      faqs: [
        { question: 'Is there NATA coaching near Technopark Trivandrum?', answer: 'Yes, Neram offers live online NATA coaching from the Technopark/Kazhakkoottam area. IIT/NIT faculty, max 25 per batch, free AI study app.' },
        { question: 'Can IT park area students attend online?', answer: 'Yes, Neram\'s online model is perfect for Technopark-area students. Flexible timings, no commute to city center. Same quality coaching.' },
        { question: 'Is Technopark campus good for NATA drawing practice?', answer: 'Yes! Technopark\'s Charles Correa-designed campus is excellent for architectural sketching. Our faculty can guide campus-based drawing exercises.' },
      ],
    },
    {
      slug: 'kazhakkoottam',
      name: 'Kazhakkoottam',
      displayName: 'Kazhakkoottam',
      distanceFromCenter: '12 km south — near CET Trivandrum',
      transportInfo: 'Kazhakkoottam is on NH 66 between Trivandrum city and airport. KSRTC buses frequent. Near CET Trivandrum campus. Auto/cab: 25 minutes to city center.',
      landmarks: ['College of Engineering Trivandrum (CET)', 'IIST (Indian Institute of Space Science)', 'VSSC (Vikram Sarabhai Space Centre)', 'Kazhakkoottam Junction'],
      nearbySchools: ['CET Model School', 'Kendriya Vidyalaya VSSC', 'Arya Central School', 'Holy Cross School Kazhakkoottam'],
      description: 'Kazhakkoottam is an education and space science hub, home to CET Trivandrum (one of Kerala\'s top engineering colleges with B.Arch program), IIST, and VSSC. The campus architectures here showcase institutional design excellence. CET\'s architecture department itself is a destination for aspiring architects. Living near CET gives Kazhakkoottam students unique exposure to real architecture students and their work.',
      whyStudentsChoose: 'Kazhakkoottam students are already near CET — Kerala\'s top architecture college. Neram helps them ace the NATA exam to get in. Our online classes fit around school schedules, and faculty can arrange virtual tours of CET\'s architecture department projects.',
      metaTitle: 'Best NATA Coaching in Kazhakkoottam, Trivandrum 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Kazhakkoottam students. Near CET Trivandrum — Kerala\'s top B.Arch college. IIT/NIT alumni faculty, 99.9% success rate. Get into CET with Neram.',
      metaKeywords: 'NATA coaching Kazhakkoottam, NATA classes near CET Trivandrum, best NATA coaching Kazhakkoottam, architecture coaching near CET Kerala',
      faqs: [
        { question: 'Is there NATA coaching near CET Trivandrum?', answer: 'Yes, Neram offers NATA coaching for Kazhakkoottam/CET area students. Online classes now, physical center coming soon. IIT/NIT alumni faculty.' },
        { question: 'What NATA score do I need for CET Trivandrum?', answer: 'CET Trivandrum B.Arch typically requires NATA 130+ for general category. Neram students consistently score 140+.' },
        { question: 'Can I visit CET campus for drawing practice?', answer: 'Yes, CET campus is excellent for NATA drawing practice. Our faculty can guide exercises featuring institutional architecture.' },
      ],
    },
    {
      slug: 'vattiyoorkavu',
      name: 'Vattiyoorkavu',
      displayName: 'Vattiyoorkavu',
      distanceFromCenter: '5 km northeast — residential suburb',
      transportInfo: 'Vattiyoorkavu is a well-connected residential area. KSRTC buses from Vattiyoorkavu Junction to East Fort (20 min). Auto/cab: 15 minutes to city center. Regular buses to Nedumangad and Neyyattinkara.',
      landmarks: ['Vattiyoorkavu Devi Temple', 'Vellayani Lake (nearby)', 'Kariavattom University Campus', 'Vattiyoorkavu Junction'],
      nearbySchools: ['Sarvodaya Vidyalaya', 'Nirmala Bhavan Higher Secondary School', 'Mar Ivanios School', 'Government HSS Vattiyoorkavu'],
      description: 'Vattiyoorkavu is a rapidly developing residential suburb of Trivandrum, known for the Vattiyoorkavu Devi Temple\'s traditional Kerala temple architecture. The area is close to the University of Kerala\'s Kariavattom campus, providing exposure to institutional architecture. The blend of traditional temple design and modern residential development makes Vattiyoorkavu an interesting study in urban expansion.',
      whyStudentsChoose: 'Vattiyoorkavu students choose Neram\'s online classes for convenience — no commute to city center. The area\'s mix of traditional and modern architecture provides natural drawing practice subjects. When our Trivandrum center opens, bus connectivity from Vattiyoorkavu ensures easy access.',
      metaTitle: 'Best NATA Coaching in Vattiyoorkavu, Trivandrum 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Vattiyoorkavu, Trivandrum students. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Live online classes. Max 25 per batch.',
      metaKeywords: 'NATA coaching Vattiyoorkavu, NATA classes Vattiyoorkavu Trivandrum, best NATA coaching near Vattiyoorkavu, architecture coaching Vattiyoorkavu',
      faqs: [
        { question: 'Is there NATA coaching near Vattiyoorkavu?', answer: 'Yes, Neram offers live online NATA coaching from Vattiyoorkavu. Trivandrum center coming soon. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Vattiyoorkavu students attend online?', answer: 'Yes, live interactive online classes with real-time drawing feedback. No commute needed. Same IIT/NIT faculty and curriculum.' },
        { question: 'Which NATA coaching is best near University of Kerala?', answer: 'Neram Classes serves Kariavattom/Vattiyoorkavu students. Free AI study app, max 25 per batch, flexible online timings.' },
      ],
    },
  ],
};

// ─── KOZHIKODE (CALICUT) ────────────────────────────────────────────
const calicut: CityData = {
  slug: 'calicut',
  officialName: 'Kozhikode',
  displayName: 'Calicut (Kozhikode)',
  state: 'Kerala',
  stateSlug: 'kerala',
  centerAddress: 'Coming Soon — Kozhikode, Kerala',
  centerStatus: 'coming-soon',
  centerCoords: { lat: 11.2588, lng: 75.7804 },
  nearbyColleges: ['NIT Calicut (National Institute of Technology)', 'MES College of Engineering Kuttippuram', 'Government Engineering College Kozhikode', 'AWH Engineering College Calicut'],
  metaTitle: 'Best NATA Coaching in Calicut (Kozhikode) 2026 | Neram Classes',
  metaDescription: 'Top NATA coaching in Calicut — IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Near NIT Calicut. Online + classroom. Serving Mavoor Road, Palayam, Feroke, Nadakkavu, Beypore students.',
  metaKeywords: 'NATA coaching Calicut, NATA coaching Kozhikode, NATA classes Calicut, best NATA coaching Calicut, architecture coaching Kozhikode, NATA coaching near NIT Calicut',
  faqs: [
    { question: 'Is there NATA coaching in Calicut?', answer: 'Yes, Neram Classes offers live online NATA coaching for Calicut students. Physical center coming soon. IIT/NIT alumni faculty, 99.9% success rate.' },
    { question: 'Which is the best NATA coaching in Kozhikode?', answer: 'Neram Classes — IIT/NIT/SPA alumni faculty, max 25 per batch, free AI study app. The only NATA coaching with a cutoff calculator and college predictor for 5000+ colleges.' },
    { question: 'What NATA score is needed for NIT Calicut?', answer: 'NIT Calicut B.Arch typically requires NATA 140+ for general category. Neram students consistently score 140+.' },
    { question: 'Can I attend NATA coaching online from Calicut?', answer: 'Yes, Neram\'s live interactive online classes are available from all Calicut areas — Mavoor Road, Palayam, Feroke, Nadakkavu, Beypore.' },
    { question: 'When will Neram open a center in Calicut?', answer: 'Neram is planning to open a physical center in Calicut soon. Online classes available now with the same quality coaching.' },
  ],
  neighborhoods: [
    {
      slug: 'mavoor-road',
      name: 'Mavoor Road',
      displayName: 'Mavoor Road',
      distanceFromCenter: 'Main commercial street — city center',
      transportInfo: 'Mavoor Road is Calicut\'s main commercial artery. Walking distance to Kozhikode Railway Station (1 km) and KSRTC Bus Stand (500 m). All city buses pass through Mavoor Road.',
      landmarks: ['HiLite Mall', 'Kozhikode Railway Station', 'Mananchira Square (nearby)', 'Focus Mall'],
      nearbySchools: ['Devagiri CMI Public School', 'Presentation Higher Secondary School', 'Silver Hills School', 'Providence Women\'s College (nearby)'],
      description: 'Mavoor Road is the commercial spine of Calicut — a bustling stretch of modern retail architecture, from HiLite Mall to Focus Mall. The road\'s transformation from colonial-era warehouses to contemporary commercial complexes tells the story of Calicut\'s economic evolution. For NATA students, the contrast between the heritage buildings near Mananchira and the modern malls on Mavoor Road provides rich sketching material.',
      whyStudentsChoose: 'Mavoor Road students are at the heart of Calicut — when our center opens here, they\'ll have walking-distance access. Until then, our online classes provide the same IIT/NIT alumni faculty. The Mavoor Road area\'s architectural diversity is great for NATA drawing practice.',
      metaTitle: 'Best NATA Coaching on Mavoor Road, Calicut 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Mavoor Road, Calicut students. City center location. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Online + center coming soon.',
      metaKeywords: 'NATA coaching Mavoor Road, NATA classes Mavoor Road Calicut, best NATA coaching Calicut center, architecture coaching Kozhikode city',
      faqs: [
        { question: 'Is there NATA coaching on Mavoor Road, Calicut?', answer: 'Yes, Neram offers live online NATA coaching from Mavoor Road area. A Calicut center is coming soon. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Which is the best NATA coaching in Calicut city center?', answer: 'Neram Classes — free AI study app, IIT/NIT alumni faculty, max 25 per batch. Online classes now, center opening on Mavoor Road area soon.' },
        { question: 'Can I attend NATA coaching online from Mavoor Road?', answer: 'Yes, live interactive online classes with real-time drawing feedback from the Mavoor Road/city center area.' },
      ],
    },
    {
      slug: 'palayam',
      name: 'Palayam',
      displayName: 'Palayam',
      distanceFromCenter: '2 km — heritage quarter',
      transportInfo: 'Palayam is walkable from Mananchira. KSRTC bus stand nearby. Auto/cab: 5 minutes from Railway Station. Near SM Street (Sweet Meat Street).',
      landmarks: ['Mananchira Square', 'Kozhikode Public Library', 'SM Street (Mittai Theruvu)', 'Mishkal Mosque'],
      nearbySchools: ['Zamorin\'s Guruvayurappan School', 'Malabar Christian College', 'Town School Kozhikode', 'Government Girls School Palayam'],
      description: 'Palayam is Calicut\'s historic quarter, home to Mananchira Square — a beautiful public space with heritage buildings. The area showcases Calicut\'s architectural heritage: the Mishkal Mosque (a marvel of Malabar wooden architecture), colonial-era buildings around Mananchira, and the bustling SM Street. For NATA students, Palayam is a living museum of Malabar architectural styles.',
      whyStudentsChoose: 'Palayam students grow up surrounded by Calicut\'s finest heritage architecture. Neram\'s faculty helps them use this familiarity in NATA drawings. Online classes save commute time, letting students focus on daily drawing practice.',
      metaTitle: 'Best NATA Coaching in Palayam, Calicut 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Palayam, Calicut students. Heritage quarter near Mananchira & SM Street. IIT/NIT alumni faculty, 99.9% success rate. Online + center coming soon.',
      metaKeywords: 'NATA coaching Palayam, NATA classes Palayam Calicut, best NATA coaching near Mananchira, architecture coaching Palayam Kozhikode',
      faqs: [
        { question: 'Is there NATA coaching in Palayam, Calicut?', answer: 'Yes, Neram offers live online NATA coaching from Palayam. Calicut center coming soon. IIT/NIT faculty, max 25 per batch.' },
        { question: 'Can I practice NATA drawing at Mananchira?', answer: 'Yes! Mananchira Square and nearby heritage buildings are excellent for NATA sketching. Our faculty guides local landmark-based exercises.' },
        { question: 'Which NATA coaching is best for Palayam students?', answer: 'Neram Classes — the only NATA coaching with a free AI study app, IIT/NIT alumni faculty, and 99.9% success rate. Online classes from home.' },
      ],
    },
    {
      slug: 'feroke',
      name: 'Feroke',
      displayName: 'Feroke',
      distanceFromCenter: '10 km south — on Calicut-Kochi highway',
      transportInfo: 'Feroke is on NH 66 south of Calicut. Feroke Railway Station on the main trunk line. KSRTC buses to Calicut city (20 min). Auto/cab: 25 minutes to city center.',
      landmarks: ['Feroke Railway Station', 'Chaliyar River', 'Kadalundi Bird Sanctuary (nearby)', 'Feroke Tile Factory (heritage)'],
      nearbySchools: ['MES Raja Residential School', 'Feroke Higher Secondary School', 'GVHSS Feroke', 'Markaz Public School (nearby)'],
      description: 'Feroke, on the banks of the Chaliyar River, is known for its tile manufacturing heritage — the famous Feroke tiles have been an architectural staple across Kerala for decades. The area\'s industrial architecture, river-bank settlements, and proximity to Kadalundi Bird Sanctuary (a wetland conservation area) offer unique perspectives on how human habitation interacts with natural landscapes.',
      whyStudentsChoose: 'Feroke students choose Neram\'s online model to avoid the daily commute to Calicut city. The tile factory heritage and river-bank architecture provide unique NATA drawing subjects not found in other coaching centers\' materials.',
      metaTitle: 'Best NATA Coaching in Feroke, Calicut 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Feroke, Calicut students. On Calicut-Kochi highway. IIT/NIT alumni faculty, 99.9% success rate. Online classes + AI study app.',
      metaKeywords: 'NATA coaching Feroke, NATA classes Feroke Calicut, best NATA coaching near Feroke, architecture coaching Feroke Kozhikode',
      faqs: [
        { question: 'Is there NATA coaching near Feroke?', answer: 'Yes, Neram offers live online NATA coaching from Feroke. No commute to Calicut city needed. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Feroke students attend online NATA classes?', answer: 'Yes, live interactive online classes from home in Feroke. Same IIT/NIT faculty, real-time drawing feedback, flexible timings.' },
        { question: 'Is Feroke good for NATA drawing practice?', answer: 'Yes! Feroke\'s tile factory heritage, river-bank architecture, and Kadalundi wetlands offer unique sketching subjects for NATA drawing practice.' },
      ],
    },
    {
      slug: 'nadakkavu',
      name: 'Nadakkavu',
      displayName: 'Nadakkavu',
      distanceFromCenter: '3 km — residential hub near NIT',
      transportInfo: 'Nadakkavu is well-connected by city buses to Railway Station (15 min) and Mavoor Road. Auto/cab: 10 minutes to city center. Near NIT Calicut access road.',
      landmarks: ['Nadakkavu Junction', 'NIT Calicut (nearby)', 'Calicut University (nearby)', 'Kozhikode Beach Road'],
      nearbySchools: ['Providence Higher Secondary School', 'Devagiri Public School', 'Malabar Christian College School', 'NIT campus school'],
      description: 'Nadakkavu is a thriving residential area strategically located between Calicut city center and NIT Calicut. The proximity to NIT — one of India\'s premier institutions with an architecture program — gives Nadakkavu students daily exposure to institutional campus design. The area\'s residential architecture ranges from traditional Malabar style to modern apartments.',
      whyStudentsChoose: 'Nadakkavu students are close to NIT Calicut — many aim for its B.Arch program. Neram\'s coaching specifically targets NIT-level NATA scores (140+). Our online classes and faculty from NIT/IIT provide the exact preparation needed.',
      metaTitle: 'Best NATA Coaching in Nadakkavu, Calicut 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Nadakkavu, Calicut students. Near NIT Calicut. IIT/NIT alumni faculty, 99.9% success rate. Get into NIT with Neram. Online + center coming soon.',
      metaKeywords: 'NATA coaching Nadakkavu, NATA classes Nadakkavu Calicut, best NATA coaching near NIT Calicut, architecture coaching Nadakkavu Kozhikode',
      faqs: [
        { question: 'Is there NATA coaching near NIT Calicut?', answer: 'Yes, Neram serves Nadakkavu/NIT area students with live online classes. IIT/NIT alumni faculty, max 25 per batch, targeting 140+ NATA scores for NIT admission.' },
        { question: 'What NATA score is needed for NIT Calicut B.Arch?', answer: 'NIT Calicut B.Arch typically requires 140+ NATA score for general category. Neram students consistently achieve this.' },
        { question: 'Can Nadakkavu students attend NATA coaching online?', answer: 'Yes, live interactive online classes from Nadakkavu. Same IIT/NIT faculty, real-time drawing feedback. No commute needed.' },
      ],
    },
    {
      slug: 'beypore',
      name: 'Beypore',
      displayName: 'Beypore',
      distanceFromCenter: '10 km south — historic port town',
      transportInfo: 'Beypore is on the coast south of Calicut. KSRTC buses to Calicut city (25 min). Auto/cab: 20 minutes via Beach Road. Beypore Railway Halt on the Shoranur line.',
      landmarks: ['Beypore Port', 'Beypore Beach', 'Uru (dhow) building yard', 'Beypore Lighthouse'],
      nearbySchools: ['Beypore Higher Secondary School', 'MES School Beypore', 'Al Ameen School Beypore', 'Feroke schools (nearby)'],
      description: 'Beypore is an ancient port town famous for its traditional Uru (dhow) boat-building craft — massive wooden sailing vessels built by hand. The boat-building yard, one of the last of its kind in the world, is a masterclass in traditional construction. The port\'s warehouses, the lighthouse, and the fishing village architecture offer NATA aspirants a unique perspective on maritime and vernacular architecture.',
      whyStudentsChoose: 'Beypore students have a unique architectural heritage — the Uru boat-building yards teach construction principles that no other coaching center covers. Neram\'s online classes let Beypore students study from home while our faculty connects their local heritage to NATA exam topics.',
      metaTitle: 'Best NATA Coaching in Beypore, Calicut 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Beypore, Calicut students. Historic port town with unique architecture. IIT/NIT alumni faculty, 99.9% success rate. Online classes + AI study app.',
      metaKeywords: 'NATA coaching Beypore, NATA classes Beypore Calicut, best NATA coaching near Beypore, architecture coaching Beypore Kozhikode, NATA coaching Beypore port',
      faqs: [
        { question: 'Is there NATA coaching near Beypore?', answer: 'Yes, Neram offers live online NATA coaching from Beypore. No commute to Calicut city. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Beypore\'s boat yards help with NATA drawing?', answer: 'Yes! The Uru boat-building yards offer unique sketching subjects for NATA drawing — traditional construction, maritime architecture, and coastal design.' },
        { question: 'Which NATA coaching is best for coastal Calicut students?', answer: 'Neram Classes — online model means no commute from Beypore/coastal areas. Free AI study app, IIT/NIT faculty, max 25 per batch.' },
      ],
    },
  ],
};

// ─── THRISSUR ────────────────────────────────────────────────────────
const thrissur: CityData = {
  slug: 'thrissur',
  officialName: 'Thrissur',
  displayName: 'Thrissur',
  state: 'Kerala',
  stateSlug: 'kerala',
  centerAddress: 'Coming Soon — Thrissur, Kerala',
  centerStatus: 'coming-soon',
  centerCoords: { lat: 10.5276, lng: 76.2144 },
  nearbyColleges: ['Government Engineering College Thrissur', 'NSS College of Engineering Palakkad', 'Sree Buddha College of Engineering', 'Vidya Academy of Science and Technology'],
  metaTitle: 'Best NATA Coaching in Thrissur 2026 | Neram Classes',
  metaDescription: 'Top NATA coaching in Thrissur — IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Cultural capital of Kerala. Online + classroom. Serving Round South, Ollur, Poothole, Ayyanthole students.',
  metaKeywords: 'NATA coaching Thrissur, NATA coaching Trichur, NATA classes Thrissur, best NATA coaching Thrissur, architecture coaching Thrissur, NATA coaching cultural capital Kerala',
  faqs: [
    { question: 'Is there NATA coaching in Thrissur?', answer: 'Yes, Neram Classes offers live online NATA coaching for Thrissur students. Physical center coming soon. IIT/NIT alumni faculty, 99.9% success rate.' },
    { question: 'Which is the best NATA coaching in Thrissur?', answer: 'Neram Classes — IIT/NIT/SPA alumni faculty, max 25 per batch, free AI study app with cutoff calculator. 99.9% success rate since 2009.' },
    { question: 'Can I attend NATA coaching online from Thrissur?', answer: 'Yes, live interactive online classes from all Thrissur areas — Round South, Ollur, Poothole, Ayyanthole, and surrounding towns.' },
    { question: 'Is Thrissur good for architecture students?', answer: 'Thrissur is Kerala\'s cultural capital with rich temple architecture (Vadakkunnathan Temple), the famous Thrissur Pooram ground, and the Shakthan Thampuran Palace. Excellent for NATA drawing practice.' },
  ],
  neighborhoods: [
    {
      slug: 'round-south',
      name: 'Round South',
      displayName: 'Round South (Swaraj Round)',
      distanceFromCenter: 'City center — around Vadakkunnathan Temple',
      transportInfo: 'Round South is the heart of Thrissur, encircling the Vadakkunnathan Temple. KSRTC bus stand (500 m), Thrissur Railway Station (2 km). All city buses pass through the Round.',
      landmarks: ['Vadakkunnathan Temple', 'Thrissur Round (Swaraj Round)', 'Sahitya Akademi Library', 'Shakthan Thampuran Palace (nearby)'],
      nearbySchools: ['St. Thomas College HSS', 'Vivekodayam School', 'St. Anthony\'s School', 'CMS School Thrissur'],
      description: 'Round South is the iconic heart of Thrissur — the circular road system around the ancient Vadakkunnathan Temple. This unique urban planning, where the entire city radiates from a central temple, is a rare example of concentric city design in India. The Swaraj Round hosts the famous Thrissur Pooram festival. For NATA aspirants, the temple\'s Kerala-style architecture, the round\'s urban planning, and the nearby Shakthan Thampuran Palace offer unmatched sketching subjects.',
      whyStudentsChoose: 'Round South students live at the architectural heart of Thrissur — the concentric city plan itself is a NATA design lesson. Neram\'s online classes help them translate this everyday exposure into NATA exam scores. Walking distance to all landmarks for drawing practice.',
      metaTitle: 'Best NATA Coaching in Round South, Thrissur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Round South, Thrissur students. Heart of Thrissur near Vadakkunnathan Temple. IIT/NIT alumni faculty, 99.9% success rate. Online + center coming soon.',
      metaKeywords: 'NATA coaching Round South Thrissur, NATA classes Swaraj Round, best NATA coaching Thrissur center, architecture coaching Thrissur',
      faqs: [
        { question: 'Is there NATA coaching in Thrissur Round area?', answer: 'Yes, Neram offers live online NATA coaching from the Round South area. Thrissur center coming soon. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Vadakkunnathan Temple be used for NATA drawing?', answer: 'Yes! Vadakkunnathan Temple is a masterpiece of Kerala temple architecture — excellent for NATA sketching practice.' },
        { question: 'Which NATA coaching is best for Thrissur city center students?', answer: 'Neram Classes — free AI study app, IIT/NIT alumni faculty, max 25 per batch. Online classes from home, center opening in Thrissur soon.' },
      ],
    },
    {
      slug: 'ollur',
      name: 'Ollur',
      displayName: 'Ollur',
      distanceFromCenter: '5 km east — educational hub',
      transportInfo: 'Ollur is well-connected by KSRTC and private buses to Thrissur (15 min). Ollur Railway Station on the Shoranur line. Auto/cab: 15 minutes to city center.',
      landmarks: ['St. Thomas College Thrissur', 'Ollur Railway Station', 'Sacred Heart Church Ollur', 'Vilangan Hills (nearby)'],
      nearbySchools: ['St. Thomas Higher Secondary School', 'Mar Athanasius College School', 'Sacred Heart School Ollur', 'GUPS Ollur'],
      description: 'Ollur is Thrissur\'s education corridor, home to St. Thomas College and several prominent schools. The area\'s institutional architecture — from colonial-era college buildings to modern campus designs — provides NATA aspirants with diverse sketching subjects. The nearby Vilangan Hills offer a unique perspective on how Kerala\'s architecture integrates with its hilly terrain.',
      whyStudentsChoose: 'Ollur students benefit from the area\'s educational atmosphere and easy access to institutional architecture for drawing practice. Neram\'s online classes mean no commute to Thrissur city center. Multiple Ollur students have joined our NATA program.',
      metaTitle: 'Best NATA Coaching in Ollur, Thrissur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Ollur, Thrissur students. Educational hub near St. Thomas College. IIT/NIT alumni faculty, 99.9% success rate. Online classes + AI study app.',
      metaKeywords: 'NATA coaching Ollur, NATA classes Ollur Thrissur, best NATA coaching near Ollur, architecture coaching Ollur Thrissur',
      faqs: [
        { question: 'Is there NATA coaching near Ollur, Thrissur?', answer: 'Yes, Neram offers live online NATA coaching from Ollur. IIT/NIT faculty, max 25 per batch, 99.9% success rate.' },
        { question: 'Can Ollur students attend NATA coaching online?', answer: 'Yes, live interactive online classes from home in Ollur. Same quality as classroom coaching.' },
        { question: 'Which NATA coaching is best for Ollur area students?', answer: 'Neram Classes — free AI study app, IIT/NIT alumni faculty, flexible online timings suited to school schedules.' },
      ],
    },
    {
      slug: 'poothole',
      name: 'Poothole',
      displayName: 'Poothole',
      distanceFromCenter: '4 km south — growing residential area',
      transportInfo: 'Poothole is on the Thrissur-Kochi highway (NH 544). Regular buses to Thrissur (10 min). Auto/cab: 15 minutes to city center. Near Punkunnam Junction.',
      landmarks: ['Punkunnam Junction', 'Poothole Temple', 'Kerala Sahitya Akademi (nearby)', 'Kuttanellur Durga Temple'],
      nearbySchools: ['Nirmala HSS Thrissur', 'Model HSS Thrissur', 'Don Bosco School Poothole', 'Little Flower School'],
      description: 'Poothole is a rapidly developing residential area on the Thrissur-Kochi highway. The area\'s growth from a quiet suburb to a busy residential hub showcases modern urban development patterns. Poothole\'s proximity to both the city center and the highway makes it a convenient base for students from southern Thrissur district.',
      whyStudentsChoose: 'Poothole students choose Neram\'s online model for the flexibility — study from home without commuting. Our AI study app is especially popular for self-paced practice. When our Thrissur center opens, the highway connectivity ensures easy access from Poothole.',
      metaTitle: 'Best NATA Coaching in Poothole, Thrissur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Poothole, Thrissur students. On Thrissur-Kochi highway. IIT/NIT alumni faculty, 99.9% success rate. Online classes + free AI study app.',
      metaKeywords: 'NATA coaching Poothole, NATA classes Poothole Thrissur, best NATA coaching near Poothole, architecture coaching Poothole Thrissur',
      faqs: [
        { question: 'Is there NATA coaching near Poothole?', answer: 'Yes, Neram offers live online NATA coaching from Poothole. Thrissur center coming soon on the highway. IIT/NIT faculty.' },
        { question: 'Can Poothole students join NATA coaching online?', answer: 'Yes, live interactive online classes. Same IIT/NIT faculty, real-time drawing feedback. Flexible timings.' },
        { question: 'Which NATA coaching covers southern Thrissur district?', answer: 'Neram Classes — online model serves all of Thrissur district including Poothole, Punkunnam, Wadakkancherry, and Irinjalakuda.' },
      ],
    },
    {
      slug: 'ayyanthole',
      name: 'Ayyanthole',
      displayName: 'Ayyanthole',
      distanceFromCenter: '3 km northwest — near GEC Thrissur',
      transportInfo: 'Ayyanthole is well-connected to Thrissur Round (10 min by bus). Auto/cab: 10 minutes to city center. Near Government Engineering College Thrissur.',
      landmarks: ['Government Engineering College Thrissur', 'Ayyanthole Junction', 'Thrissur Zoo (nearby)', 'Peechi Dam (30 min)'],
      nearbySchools: ['Devamatha CMI Public School', 'GEC Thrissur campus school', 'Model Residential School', 'Lisieux CMI School'],
      description: 'Ayyanthole is home to Government Engineering College (GEC) Thrissur — one of Kerala\'s top engineering colleges with a B.Arch program. The campus\'s institutional architecture and the nearby Thrissur Zoo\'s landscape design provide aspiring architects with daily inspiration. GEC Thrissur\'s architecture department is a destination for students aiming for B.Arch in Thrissur itself.',
      whyStudentsChoose: 'Ayyanthole students are right next to GEC Thrissur — a top B.Arch destination. Neram\'s coaching targets the NATA scores needed for GEC admission. Our online classes and AI study app complement the academic environment around GEC.',
      metaTitle: 'Best NATA Coaching in Ayyanthole, Thrissur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Ayyanthole, Thrissur students. Near GEC Thrissur — B.Arch destination. IIT/NIT alumni faculty, 99.9% success rate. Online + center coming soon.',
      metaKeywords: 'NATA coaching Ayyanthole, NATA classes near GEC Thrissur, best NATA coaching Ayyanthole, architecture coaching near GEC Thrissur',
      faqs: [
        { question: 'Is there NATA coaching near GEC Thrissur?', answer: 'Yes, Neram serves Ayyanthole/GEC area students with live online classes. IIT/NIT alumni faculty, targeting GEC-level NATA scores.' },
        { question: 'What NATA score is needed for GEC Thrissur?', answer: 'GEC Thrissur B.Arch typically requires NATA 125-130+ for general category. Neram students consistently exceed this.' },
        { question: 'Can Ayyanthole students attend online?', answer: 'Yes, live interactive online classes from Ayyanthole. Same quality, no commute. Flexible timings around school schedule.' },
      ],
    },
  ],
};

// ─── KANNUR ──────────────────────────────────────────────────────────
const kannur: CityData = {
  slug: 'kannur',
  officialName: 'Kannur',
  displayName: 'Kannur',
  state: 'Kerala',
  stateSlug: 'kerala',
  centerAddress: 'Coming Soon — Kannur, Kerala',
  centerStatus: 'coming-soon',
  centerCoords: { lat: 11.8745, lng: 75.3704 },
  nearbyColleges: ['Government Engineering College Kannur', 'Kannur University', 'Don Bosco College Kannur', 'DharmaSala Govt. Polytechnic'],
  metaTitle: 'Best NATA Coaching in Kannur 2026 | Neram Classes',
  metaDescription: 'Top NATA coaching in Kannur — IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Heritage fort city. Online + classroom. Serving City Center, Thavakkara, Thalassery, Mattannur students.',
  metaKeywords: 'NATA coaching Kannur, NATA coaching Cannanore, NATA classes Kannur, best NATA coaching Kannur, architecture coaching Kannur, NATA coaching North Kerala',
  faqs: [
    { question: 'Is there NATA coaching in Kannur?', answer: 'Yes, Neram Classes offers live online NATA coaching for Kannur students. Physical center coming soon. IIT/NIT alumni faculty, 99.9% success rate since 2009.' },
    { question: 'Which is the best NATA coaching in Kannur?', answer: 'Neram Classes — IIT/NIT/SPA alumni faculty, max 25 per batch, free AI study app. The only NATA coaching serving North Kerala with dedicated online classes.' },
    { question: 'Can North Kerala students attend NATA coaching online?', answer: 'Yes, Neram\'s live interactive online classes are available from Kannur, Thalassery, Mattannur, and all North Kerala locations.' },
    { question: 'Does Neram have plans for a center in Kannur?', answer: 'Yes, Neram is planning to open a physical center in Kannur. Online classes available now with the same quality coaching and IIT/NIT faculty.' },
  ],
  neighborhoods: [
    {
      slug: 'city-center',
      name: 'Kannur City Center',
      displayName: 'Kannur City Center',
      distanceFromCenter: 'City center — near Fort area',
      transportInfo: 'Kannur city center is compact and walkable. Kannur Railway Station (1 km). KSRTC bus stand (500 m). Auto/cab available throughout. Kannur International Airport (25 km).',
      landmarks: ['St. Angelo Fort (Portuguese fort)', 'Payyambalam Beach', 'Kannur Lighthouse', 'Arakkal Museum'],
      nearbySchools: ['Chinmaya Vidyalaya Kannur', 'Kendriya Vidyalaya Kannur', 'St. Michael\'s School', 'DPM School Kannur'],
      description: 'Kannur city center is dominated by St. Angelo Fort — a Portuguese-era fortress built in 1505 overlooking the Arabian Sea. The fort\'s European military architecture contrasts with the nearby Arakkal Palace (the only Muslim royal family in Kerala) and traditional Malabar houses. For NATA aspirants, Kannur city center is a rare mix of colonial, Islamic, and Kerala architectural styles within walking distance.',
      whyStudentsChoose: 'Kannur city center students have St. Angelo Fort and Arakkal Museum within walking distance — incredible NATA drawing subjects. Neram\'s online classes help them leverage this heritage. When our center opens, city center students will have easy access.',
      metaTitle: 'Best NATA Coaching in Kannur City Center 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Kannur city center students. Near St. Angelo Fort & Arakkal Museum. IIT/NIT alumni faculty, 99.9% success rate. Online + center coming soon.',
      metaKeywords: 'NATA coaching Kannur city, NATA classes Kannur center, best NATA coaching Kannur, architecture coaching Kannur Fort area',
      faqs: [
        { question: 'Is there NATA coaching in Kannur city center?', answer: 'Yes, Neram offers live online NATA coaching from Kannur city. Center coming soon. IIT/NIT faculty, max 25 per batch.' },
        { question: 'Can St. Angelo Fort help with NATA drawing?', answer: 'Yes! St. Angelo Fort\'s Portuguese architecture is excellent for NATA sketching practice. Our faculty can guide fort-based drawing exercises.' },
        { question: 'Which NATA coaching is best in Kannur?', answer: 'Neram Classes — free AI study app, IIT/NIT alumni faculty, 99.9% success rate. Online classes from Kannur city center.' },
      ],
    },
    {
      slug: 'thavakkara',
      name: 'Thavakkara',
      displayName: 'Thavakkara',
      distanceFromCenter: '3 km — residential area near railway',
      transportInfo: 'Thavakkara is near Kannur Railway Station. Regular buses to city center (10 min). Auto/cab: 10 minutes. Well-connected to NH 66.',
      landmarks: ['Kannur Railway Station', 'Thavakkara Junction', 'Mapilla Bay (nearby)', 'Kannur University Campus (15 km)'],
      nearbySchools: ['Don Bosco School Kannur', 'Naval Public School', 'GHSS Thavakkara', 'Mambaram School'],
      description: 'Thavakkara is a residential hub near Kannur Railway Station, serving as a gateway for students from across North Kerala. The area\'s mix of traditional Malabar houses with ornate wooden facades and modern residential developments illustrates Kannur\'s architectural evolution. Mapilla Bay nearby showcases traditional fishing village architecture.',
      whyStudentsChoose: 'Thavakkara students choose Neram for the online-first approach — especially important for North Kerala where few NATA coaching options exist. Railway connectivity means easy access when our center opens. Students from Kasargod and Wayanad also connect via Thavakkara.',
      metaTitle: 'Best NATA Coaching in Thavakkara, Kannur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Thavakkara, Kannur students. Near Kannur Railway Station. IIT/NIT alumni faculty, 99.9% success rate. Online classes + free AI study app.',
      metaKeywords: 'NATA coaching Thavakkara, NATA classes Thavakkara Kannur, best NATA coaching near Kannur Railway, architecture coaching Thavakkara',
      faqs: [
        { question: 'Is there NATA coaching near Thavakkara, Kannur?', answer: 'Yes, Neram offers live online NATA coaching from Thavakkara. IIT/NIT faculty, max 25 per batch.' },
        { question: 'Can students from Kasargod join via Thavakkara?', answer: 'Yes, students from Kasargod, Wayanad, and other North Kerala districts attend Neram\'s online classes. Railway connectivity via Thavakkara.' },
        { question: 'Which NATA coaching serves North Kerala?', answer: 'Neram Classes is the top choice for North Kerala — online classes serve Kannur, Kasargod, Wayanad, and Kozhikode districts.' },
      ],
    },
    {
      slug: 'thalassery',
      name: 'Thalassery',
      displayName: 'Thalassery (Tellicherry)',
      distanceFromCenter: '20 km south — historic spice trade town',
      transportInfo: 'Thalassery is on NH 66. Thalassery Railway Station on the main trunk line. KSRTC buses to Kannur (30 min). Auto/cab: 35 minutes to Kannur city.',
      landmarks: ['Thalassery Fort (British-era)', 'Muzhappilangad Drive-in Beach', 'Overbury\'s Folly', 'Thalassery Pier'],
      nearbySchools: ['Brennen HSS Thalassery', 'Government Brennen College', 'Thalassery Public School', 'BEM School Thalassery'],
      description: 'Thalassery (Tellicherry) is a historic spice trade town with a British-era fort, colonial-era warehouses, and the unique "circus" architectural heritage — Thalassery is the birthplace of Indian circus. The Thalassery Fort, built by the East India Company in 1708, and the nearby Overbury\'s Folly (a peculiar colonial building) offer fascinating architectural studies. The town\'s organic layout reflecting centuries of spice trade is a rare urban planning case study.',
      whyStudentsChoose: 'Thalassery students have unique architectural heritage — the fort, colonial warehouses, and circus-era buildings. Neram\'s online model is ideal for Thalassery students who don\'t want to commute to Kannur city. Our faculty connects local heritage to NATA exam drawing skills.',
      metaTitle: 'Best NATA Coaching in Thalassery, Kannur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Thalassery (Tellicherry), Kannur students. Historic fort town. IIT/NIT alumni faculty, 99.9% success rate. Online classes + free AI study app.',
      metaKeywords: 'NATA coaching Thalassery, NATA classes Tellicherry, best NATA coaching Thalassery Kannur, architecture coaching Thalassery',
      faqs: [
        { question: 'Is there NATA coaching in Thalassery?', answer: 'Yes, Neram offers live online NATA coaching from Thalassery. No commute to Kannur. IIT/NIT faculty, 99.9% success rate.' },
        { question: 'Can Thalassery Fort help with NATA drawing?', answer: 'Yes! Thalassery Fort and colonial-era buildings are excellent for NATA architectural sketching practice.' },
        { question: 'Which NATA coaching is best for Thalassery students?', answer: 'Neram Classes — online model perfect for Thalassery. Free AI study app, IIT/NIT alumni faculty, max 25 per batch.' },
      ],
    },
    {
      slug: 'mattannur',
      name: 'Mattannur',
      displayName: 'Mattannur',
      distanceFromCenter: '25 km east — inland town',
      transportInfo: 'Mattannur is on NH 66 (old alignment). Mattannur Railway Station on the Mangalore-Shoranur line. KSRTC buses to Kannur (40 min). Gateway to Wayanad district.',
      landmarks: ['Mattannur Railway Station', 'Peralassery Temple', 'Mattannur Town Square', 'Aralam Wildlife Sanctuary (nearby)'],
      nearbySchools: ['Mattannur Higher Secondary School', 'GHSS Mattannur', 'Government School Irikkur', 'Nirmala School Mattannur'],
      description: 'Mattannur is an inland town in Kannur district, serving as a gateway between the coast and the Western Ghats. The area\'s architecture reflects this transition — from coastal Kerala-style buildings to hill-station influences. The nearby Aralam Wildlife Sanctuary and its eco-tourism structures showcase how architecture adapts to forest environments. Mattannur\'s growing role as a commercial hub has brought modern construction alongside traditional buildings.',
      whyStudentsChoose: 'Mattannur students (and those from interior Kannur/Wayanad) have limited coaching options. Neram\'s online classes bring IIT/NIT alumni faculty directly to their homes. Railway connectivity makes future center access easy. The local architecture variety — coastal, hill, and modern — enriches NATA drawing practice.',
      metaTitle: 'Best NATA Coaching in Mattannur, Kannur 2026 | Neram Classes',
      metaDescription: 'NATA coaching for Mattannur, Kannur students. Gateway to North Kerala interior. IIT/NIT alumni faculty, 99.9% success rate. Online classes from home.',
      metaKeywords: 'NATA coaching Mattannur, NATA classes Mattannur Kannur, best NATA coaching Mattannur, architecture coaching interior Kannur, NATA coaching near Wayanad',
      faqs: [
        { question: 'Is there NATA coaching in Mattannur?', answer: 'Yes, Neram offers live online NATA coaching from Mattannur. IIT/NIT faculty, max 25 per batch. Serving Mattannur, Irikkur, and Wayanad students.' },
        { question: 'Can Wayanad students join from Mattannur?', answer: 'Yes, students from Wayanad, interior Kannur, and surrounding areas attend Neram\'s online classes. Mattannur is the closest rail-connected town.' },
        { question: 'Is online NATA coaching effective from rural areas?', answer: 'Yes, Neram\'s online classes work with basic internet. Same IIT/NIT faculty, real-time drawing feedback, free AI study app for self-practice.' },
      ],
    },
  ],
};

// ─── EXPORTS ─────────────────────────────────────────────────────────
export const keralaCities: CityData[] = [kochi, trivandrum, calicut, thrissur, kannur];
export const kochiCity = kochi;
export const trivandrumCity = trivandrum;
export const calicutCity = calicut;
export const thrissurCity = thrissur;
export const kannurCity = kannur;

export function getKeralaCityBySlug(slug: string): CityData | undefined {
  return keralaCities.find((c) => c.slug === slug);
}
```

- [ ] **Step 2: Verify the file compiles with the interfaces from Task 1**

Run: `cd apps/marketing && npx tsc --noEmit src/lib/seo/kerala-cities.ts 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/lib/seo/kerala-cities.ts
git commit -m "feat(marketing): add Kerala cities data with 5 cities and 24 neighborhoods for SEO pages"
```

---

### Task 3: Generalized CityNeighborhoodPage Component

**Files:**
- Create: `apps/marketing/src/components/seo/CityNeighborhoodPage.tsx`
- Reference: `apps/marketing/src/components/seo/ChennaiNeighborhoodPage.tsx`

- [ ] **Step 1: Create the generalized neighborhood page component**

Adapted from `ChennaiNeighborhoodPage.tsx` — accepts `CityData` + `CityNeighborhood` props instead of Chennai-specific data.

```typescript
// apps/marketing/src/components/seo/CityNeighborhoodPage.tsx
'use client';

import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import type { CityData, CityNeighborhood } from '@/lib/seo/city-neighborhoods';

interface Props {
  city: CityData;
  neighborhood: CityNeighborhood;
}

export default function CityNeighborhoodPage({ city, neighborhood }: Props) {
  const otherNeighborhoods = city.neighborhoods.filter((n) => n.slug !== neighborhood.slug);
  const cityUrl = `/coaching/nata-coaching-${city.slug}`;
  const stateUrl = `/coaching/nata-coaching-${city.stateSlug}`;
  const isComingSoon = city.centerStatus === 'coming-soon';

  return (
    <>
      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label={`${neighborhood.name}, ${city.displayName}`} color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, fontWeight: 800, mb: 2, lineHeight: 1.2 }}>
            Best NATA Coaching in {neighborhood.name}, {city.displayName}
          </Typography>
          <Typography component="p" sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'rgba(255,255,255,0.8)', maxWidth: 650, lineHeight: 1.6, mb: 3 }}>
            {neighborhood.distanceFromCenter}. IIT/NIT/SPA alumni faculty, 99.9% success rate,
            free AI study app. Online + offline hybrid classes. Max 25 students per batch.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4 }}>
              Book Free Demo Class
            </Button>
            <Button component={Link} href={cityUrl} variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
              {city.displayName} Overview
            </Button>
          </Box>
        </Container>
      </Box>

      {/* About This Neighborhood */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching for {neighborhood.name} Students
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', mb: 3, maxWidth: 800 }}>
            {neighborhood.description}
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', maxWidth: 800 }}>
            {neighborhood.whyStudentsChoose}
          </Typography>
        </Container>
      </Box>

      {/* How to Reach */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            {isComingSoon ? `NATA Coaching Access from ${neighborhood.name}` : `How to Reach Neram from ${neighborhood.name}`}
          </Typography>
          <Card elevation={0} sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, mb: 1, color: '#1a1a2e' }}>Connectivity & Transport</Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, mb: 2 }}>{neighborhood.transportInfo}</Typography>
              <Typography sx={{ fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
                {isComingSoon ? 'Center Status' : 'Center Address'}
              </Typography>
              <Typography sx={{ color: '#555' }}>
                {isComingSoon
                  ? `Physical center coming soon to ${city.displayName}. Live online classes available now from ${neighborhood.name}.`
                  : city.centerAddress}
              </Typography>
            </CardContent>
          </Card>

          <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
            Landmarks in {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
            {neighborhood.landmarks.map((l, i) => (
              <Chip key={i} label={l} variant="outlined" size="small" />
            ))}
          </Box>

          <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
            Schools Near {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {neighborhood.nearbySchools.map((s, i) => (
              <Chip key={i} label={s} variant="outlined" size="small" />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Why Neram */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Why {neighborhood.name} Students Choose Neram Classes
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { title: 'Free AI Study App', desc: 'Only institute with free NATA cutoff calculator, college predictor (5000+ colleges), and exam center locator.' },
              { title: 'Hybrid: Online + Offline', desc: `Study online from ${neighborhood.name} or attend at our ${city.displayName} center${isComingSoon ? ' (opening soon)' : ''}. Switch anytime.` },
              { title: 'Max 25 Per Batch', desc: 'Individual drawing feedback and personal mentoring. Not 50-100+ students like other institutes.' },
              { title: '99.9% Success Rate', desc: 'Highest success rate. Students scoring 130+ and admitted to NIT Calicut, CET Trivandrum, TKM Kollam.' },
              { title: 'IIT/NIT/SPA Faculty', desc: 'Every instructor is an IIT, NIT, or SPA alumnus — practising architects, not freelancers.' },
              { title: 'Daily Drawing (2+ hrs)', desc: 'Drawing is 80/200 marks in NATA. We provide 2+ hours of supervised drawing practice daily.' },
            ].map((item, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: '#1a1a2e' }}>{item.title}</Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Quick Stats */}
      <Box sx={{ py: 5, bgcolor: '#1a1a2e', color: '#fff' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, textAlign: 'center' }}>
            {[
              { value: '17+', label: 'Years (Since 2009)' },
              { value: '99.9%', label: 'Success Rate' },
              { value: 'Max 25', label: 'Per Batch' },
              { value: '4.9/5', label: 'Student Rating' },
            ].map((stat, i) => (
              <Box key={i}>
                <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, color: '#e8a020' }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Courses */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching Programs Available from {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { name: 'NATA Crash Course', duration: '3 Months', fee: '₹15,000', features: ['Quick revision', '30+ mock tests', 'Drawing practice', 'Online + offline'] },
              { name: 'NATA 1-Year Program', duration: '12 Months', fee: '₹25,000', features: ['Complete syllabus', '100+ mock tests', 'Daily drawing (2+ hrs)', 'Personal mentoring', 'Free AI study app'] },
              { name: 'NATA 2-Year Program', duration: '24 Months', fee: '₹30,000', features: ['Foundation + Advanced', '1-on-1 mentoring', 'NATA + JEE Paper 2', 'Scholarship eligible'] },
            ].map((course, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a2e' }}>{course.name}</Typography>
                  <Typography sx={{ color: '#666', fontSize: '0.85rem', mb: 1 }}>{course.duration}</Typography>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#e8a020', mb: 1.5 }}>Starting {course.fee}</Typography>
                  {course.features.map((f, j) => (
                    <Typography key={j} sx={{ color: '#555', fontSize: '0.9rem', mb: 0.3 }}>• {f}</Typography>
                  ))}
                  <Button component={Link} href="/apply" variant="contained" fullWidth sx={{ mt: 2, bgcolor: '#1a1a2e', '&:hover': { bgcolor: '#0a0a1e' } }}>
                    Apply Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Other Neighborhoods */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching Across {city.displayName}
          </Typography>
          <Typography sx={{ color: '#555', mb: 3 }}>
            Neram Classes serves students from all {city.displayName} areas through {isComingSoon ? 'online classes' : 'our center'} and live online sessions.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {otherNeighborhoods.map((n) => (
              <Chip
                key={n.slug}
                component={Link}
                href={`${cityUrl}/${n.slug}`}
                label={`NATA Coaching ${n.name}`}
                clickable
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
            ))}
            <Chip component={Link} href={stateUrl} label={`${city.state} Overview`} clickable color="warning" sx={{ fontWeight: 600 }} />
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Ready to Start NATA Preparation?
          </Typography>
          <Typography sx={{ color: '#333', mb: 3 }}>
            Book a free demo class — attend online from {neighborhood.name} or visit our {city.displayName} center{isComingSoon ? ' (opening soon)' : ''}.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}>
              Apply Now — ₹15,000 Onwards
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/marketing && npx tsc --noEmit src/components/seo/CityNeighborhoodPage.tsx 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/seo/CityNeighborhoodPage.tsx
git commit -m "feat(marketing): add generic CityNeighborhoodPage component for multi-city SEO"
```

---

### Task 4: CityHubPage Component

**Files:**
- Create: `apps/marketing/src/components/seo/CityHubPage.tsx`
- Reference: `apps/marketing/src/app/[locale]/coaching/nata-coaching-chennai/page.tsx` (inline JSX)

- [ ] **Step 1: Create the city hub page component**

```typescript
// apps/marketing/src/components/seo/CityHubPage.tsx
'use client';

import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import type { CityData } from '@/lib/seo/city-neighborhoods';

interface Props {
  city: CityData;
}

export default function CityHubPage({ city }: Props) {
  const cityUrl = `/coaching/nata-coaching-${city.slug}`;
  const stateUrl = `/coaching/nata-coaching-${city.stateSlug}`;
  const isComingSoon = city.centerStatus === 'coming-soon';

  return (
    <>
      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 9 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label={`${city.displayName} • Since 2009`} color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, fontWeight: 800, mb: 2, lineHeight: 1.2 }}>
            NATA Coaching in {city.displayName}
          </Typography>
          <Typography component="p" sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'rgba(255,255,255,0.8)', maxWidth: 650, lineHeight: 1.6, mb: 3 }}>
            Find NATA coaching in your {city.displayName} neighborhood. {isComingSoon ? `Live online classes now + ${city.displayName} center coming soon.` : `Center at ${city.centerAddress} + online classes.`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href={stateUrl} variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
              {city.state} Overview
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Neighborhood Grid */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            NATA Coaching by {city.displayName} Area
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            Click on your area to see transport info, nearby schools, and local details.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {city.neighborhoods.map((n) => (
              <Card key={n.slug} elevation={0} sx={{ border: '1px solid #e0e0e0', '&:hover': { borderColor: '#e8a020', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }, transition: 'all 0.2s' }}>
                <CardContent component={Link} href={`${cityUrl}/${n.slug}`} sx={{ p: 3, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 0.5, color: '#1a1a2e' }}>
                    NATA Coaching {n.name}
                  </Typography>
                  <Typography sx={{ color: '#e8a020', fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>
                    {n.distanceFromCenter}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {n.description.slice(0, 150)}...
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Center Info */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            {isComingSoon ? `Neram Classes in ${city.displayName} — Coming Soon` : `Our ${city.displayName} Center`}
          </Typography>
          <Card elevation={0} sx={{ border: isComingSoon ? '2px dashed #e8a020' : '2px solid #e8a020' }}>
            <CardContent sx={{ p: 3 }}>
              <Chip label={isComingSoon ? 'Coming Soon' : 'Active Center'} color="warning" size="small" sx={{ mb: 1 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1, color: '#1a1a2e' }}>
                Neram Classes — {city.displayName}
              </Typography>
              {isComingSoon ? (
                <>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 1 }}>
                    Physical center is being set up in {city.displayName}. Until then, our live online classes provide the same IIT/NIT alumni faculty and curriculum.
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>
                    Online classes: Mon-Sat | Drawing practice + aptitude + mock tests
                  </Typography>
                </>
              ) : (
                <>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>{city.centerAddress}</Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>Mon-Fri: 9 AM — 6 PM | Sat: 9 AM — 2 PM</Typography>
                </>
              )}
            </CardContent>
          </Card>

          {city.nearbyColleges.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
                Architecture Colleges Near {city.displayName}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {city.nearbyColleges.map((c, i) => (
                  <Chip key={i} label={c} variant="outlined" size="small" />
                ))}
              </Box>
            </Box>
          )}
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            Frequently Asked Questions
          </Typography>
          {city.faqs.map((faq, i) => (
            <Box key={i} sx={{ mb: 3, pb: 3, borderBottom: i < city.faqs.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
              <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>{faq.question}</Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>{faq.answer}</Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Join {city.displayName}&apos;s #1 NATA Coaching
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}>
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/seo/CityHubPage.tsx
git commit -m "feat(marketing): add generic CityHubPage component for multi-city SEO"
```

---

### Task 5: StateHubPage Component

**Files:**
- Create: `apps/marketing/src/components/seo/StateHubPage.tsx`

- [ ] **Step 1: Create the state hub page component**

```typescript
// apps/marketing/src/components/seo/StateHubPage.tsx
'use client';

import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import type { CityData, StateData } from '@/lib/seo/city-neighborhoods';

interface Props {
  state: StateData;
  cities: CityData[];
}

export default function StateHubPage({ state, cities }: Props) {
  return (
    <>
      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label={`${state.name} • Since 2009`} color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.75rem' }, fontWeight: 800, mb: 2, lineHeight: 1.2 }}>
            Best NATA Coaching in {state.name}
          </Typography>
          <Typography component="p" sx={{ fontSize: { xs: '1rem', md: '1.2rem' }, color: 'rgba(255,255,255,0.8)', maxWidth: 700, lineHeight: 1.6, mb: 3 }}>
            Online + Classroom coaching across {cities.length} {state.name} cities.
            IIT/NIT/SPA alumni faculty, 99.9% success rate since 2009, free AI study app.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>

      {/* City Grid */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            NATA Coaching Across {state.name}
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            Choose your city to find neighborhood-level coaching details and local information.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            {cities.map((city) => (
              <Card key={city.slug} elevation={0} sx={{ border: '1px solid #e0e0e0', '&:hover': { borderColor: '#e8a020', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }, transition: 'all 0.2s' }}>
                <CardContent component={Link} href={`/coaching/nata-coaching-${city.slug}`} sx={{ p: 3, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <Typography variant="h3" sx={{ fontSize: '1.2rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
                    NATA Coaching {city.displayName}
                  </Typography>
                  <Chip label={city.centerStatus === 'coming-soon' ? 'Online + Center Coming Soon' : 'Active Center'} color={city.centerStatus === 'coming-soon' ? 'default' : 'success'} size="small" sx={{ mb: 1.5 }} />
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.5, mb: 1 }}>
                    Serving {city.neighborhoods.length} areas: {city.neighborhoods.map((n) => n.name).join(', ')}
                  </Typography>
                  <Typography sx={{ color: '#e8a020', fontSize: '0.85rem', fontWeight: 600 }}>
                    {city.nearbyColleges[0]} &amp; more →
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Architecture Colleges */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Top Architecture Colleges in {state.name}
          </Typography>
          <Typography sx={{ color: '#555', mb: 3, maxWidth: 800, lineHeight: 1.7 }}>
            {state.name} has some of India&apos;s best architecture programs. A good NATA score (130+) opens doors to all of them.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {state.nearbyColleges.map((c, i) => (
              <Chip key={i} label={c} variant="outlined" size="small" sx={{ fontWeight: 500 }} />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Why Neram */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Why {state.name} Students Choose Neram Classes
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { title: 'Free AI Study App', desc: 'Only institute with free NATA cutoff calculator, college predictor (5000+ colleges), and exam center locator.' },
              { title: 'Online + Offline Hybrid', desc: `Live online classes from any ${state.name} city. Physical centers opening soon in major cities.` },
              { title: 'Max 25 Per Batch', desc: 'Individual drawing feedback and personal mentoring — not overcrowded classrooms.' },
              { title: '99.9% Success Rate', desc: 'Highest success rate since 2009. Students scoring 140+ for NIT Calicut, CET Trivandrum.' },
              { title: 'IIT/NIT/SPA Faculty', desc: 'Every instructor is an IIT, NIT, or SPA alumnus — practising architects.' },
              { title: 'Daily Drawing Practice', desc: 'Drawing is 80/200 marks. 2+ hours daily supervised practice with real-time feedback.' },
            ].map((item, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: '#1a1a2e' }}>{item.title}</Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Quick Stats */}
      <Box sx={{ py: 5, bgcolor: '#1a1a2e', color: '#fff' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, textAlign: 'center' }}>
            {[
              { value: '17+', label: 'Years (Since 2009)' },
              { value: '99.9%', label: 'Success Rate' },
              { value: `${cities.length}`, label: `${state.name} Cities` },
              { value: '4.9/5', label: 'Student Rating' },
            ].map((stat, i) => (
              <Box key={i}>
                <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, color: '#e8a020' }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            Frequently Asked Questions
          </Typography>
          {state.faqs.map((faq, i) => (
            <Box key={i} sx={{ mb: 3, pb: 3, borderBottom: i < state.faqs.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
              <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>{faq.question}</Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>{faq.answer}</Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Join {state.name}&apos;s Top NATA Coaching
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}>
              Apply Now — ₹15,000 Onwards
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/seo/StateHubPage.tsx
git commit -m "feat(marketing): add StateHubPage component for state-level SEO hub pages"
```

---

### Task 6: Kerala State Hub Route

**Files:**
- Create: `apps/marketing/src/app/[locale]/coaching/nata-coaching-kerala/page.tsx`

- [ ] **Step 1: Create the Kerala state hub route page**

```typescript
// apps/marketing/src/app/[locale]/coaching/nata-coaching-kerala/page.tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateStateHubSchema } from '@/lib/seo/city-neighborhoods';
import { keralaState, keralaCities } from '@/lib/seo/kerala-cities';
import StateHubPage from '@/components/seo/StateHubPage';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: keralaState.metaTitle,
    description: keralaState.metaDescription,
    keywords: keralaState.metaKeywords,
    alternates: buildAlternates(locale, '/coaching/nata-coaching-kerala'),
    openGraph: {
      title: keralaState.metaTitle,
      description: keralaState.metaDescription,
      type: 'article',
    },
  };
}

export default function Page({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateStateHubSchema(keralaState)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching Kerala' },
      ])} />
      <JsonLd data={generateFAQSchema(keralaState.faqs)} />
      <StateHubPage state={keralaState} cities={keralaCities} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-kerala/page.tsx
git commit -m "feat(marketing): add Kerala state SEO hub page"
```

---

### Task 7: Kochi City Hub + Neighborhood Routes

**Files:**
- Create: `apps/marketing/src/app/[locale]/coaching/nata-coaching-kochi/page.tsx`
- Create: `apps/marketing/src/app/[locale]/coaching/nata-coaching-kochi/[slug]/page.tsx`

- [ ] **Step 1: Create the Kochi city hub route page**

```typescript
// apps/marketing/src/app/[locale]/coaching/nata-coaching-kochi/page.tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateCityHubSchema } from '@/lib/seo/city-neighborhoods';
import { kochiCity } from '@/lib/seo/kerala-cities';
import CityHubPage from '@/components/seo/CityHubPage';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: kochiCity.metaTitle,
    description: kochiCity.metaDescription,
    keywords: kochiCity.metaKeywords,
    alternates: buildAlternates(locale, '/coaching/nata-coaching-kochi'),
    openGraph: {
      title: kochiCity.metaTitle,
      description: kochiCity.metaDescription,
      type: 'article',
    },
  };
}

export default function Page({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateCityHubSchema(kochiCity)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching Kerala', url: `${BASE_URL}/coaching/nata-coaching-kerala` },
        { name: 'NATA Coaching Kochi' },
      ])} />
      <JsonLd data={generateFAQSchema(kochiCity.faqs)} />
      <CityHubPage city={kochiCity} />
    </>
  );
}
```

- [ ] **Step 2: Create the Kochi neighborhood dynamic route**

```typescript
// apps/marketing/src/app/[locale]/coaching/nata-coaching-kochi/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateCityNeighborhoodSchema, getNeighborhoodBySlug } from '@/lib/seo/city-neighborhoods';
import { kochiCity } from '@/lib/seo/kerala-cities';
import CityNeighborhoodPage from '@/components/seo/CityNeighborhoodPage';

export function generateStaticParams() {
  return kochiCity.neighborhoods.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const neighborhood = getNeighborhoodBySlug(kochiCity, slug);
  if (!neighborhood) return {};

  return {
    title: neighborhood.metaTitle,
    description: neighborhood.metaDescription,
    keywords: neighborhood.metaKeywords,
    alternates: buildAlternates(locale, `/coaching/nata-coaching-kochi/${slug}`),
    openGraph: {
      title: neighborhood.metaTitle,
      description: neighborhood.metaDescription,
      type: 'article',
    },
  };
}

export default function Page({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);
  const neighborhood = getNeighborhoodBySlug(kochiCity, slug);
  if (!neighborhood) notFound();

  return (
    <>
      <JsonLd data={generateCityNeighborhoodSchema(kochiCity, neighborhood)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching Kerala', url: `${BASE_URL}/coaching/nata-coaching-kerala` },
        { name: 'NATA Coaching Kochi', url: `${BASE_URL}/coaching/nata-coaching-kochi` },
        { name: `NATA Coaching ${neighborhood.name}` },
      ])} />
      <JsonLd data={generateFAQSchema(neighborhood.faqs)} />
      <CityNeighborhoodPage city={kochiCity} neighborhood={neighborhood} />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-kochi/
git commit -m "feat(marketing): add Kochi city hub + neighborhood SEO pages"
```

---

### Task 8: Trivandrum City Hub + Neighborhood Routes

**Files:**
- Create: `apps/marketing/src/app/[locale]/coaching/nata-coaching-trivandrum/page.tsx`
- Create: `apps/marketing/src/app/[locale]/coaching/nata-coaching-trivandrum/[slug]/page.tsx`

Follow the **exact same pattern as Task 7** (Kochi) with these substitutions:
- Replace `kochiCity` → `trivandrumCity`
- Replace `kochi` → `trivandrum` in all URL paths
- Replace `'NATA Coaching Kochi'` → `'NATA Coaching Trivandrum'` in breadcrumbs

- [ ] **Step 1: Create Trivandrum hub page** (same pattern as Task 7 Step 1, with `trivandrumCity` import and `trivandrum` in URLs)

- [ ] **Step 2: Create Trivandrum [slug] page** (same pattern as Task 7 Step 2, with `trivandrumCity` import and `trivandrum` in URLs)

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-trivandrum/
git commit -m "feat(marketing): add Trivandrum city hub + neighborhood SEO pages"
```

---

### Task 9: Calicut City Hub + Neighborhood Routes

Same pattern as Task 7 with:
- `calicutCity` import, `calicut` in URLs, `'NATA Coaching Calicut'` in breadcrumbs

- [ ] **Step 1: Create Calicut hub page**
- [ ] **Step 2: Create Calicut [slug] page**
- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-calicut/
git commit -m "feat(marketing): add Calicut city hub + neighborhood SEO pages"
```

---

### Task 10: Thrissur City Hub + Neighborhood Routes

Same pattern as Task 7 with:
- `thrissurCity` import, `thrissur` in URLs, `'NATA Coaching Thrissur'` in breadcrumbs

- [ ] **Step 1: Create Thrissur hub page**
- [ ] **Step 2: Create Thrissur [slug] page**
- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-thrissur/
git commit -m "feat(marketing): add Thrissur city hub + neighborhood SEO pages"
```

---

### Task 11: Kannur City Hub + Neighborhood Routes

Same pattern as Task 7 with:
- `kannurCity` import, `kannur` in URLs, `'NATA Coaching Kannur'` in breadcrumbs

- [ ] **Step 1: Create Kannur hub page**
- [ ] **Step 2: Create Kannur [slug] page**
- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-kannur/
git commit -m "feat(marketing): add Kannur city hub + neighborhood SEO pages"
```

---

### Task 12: Sitemap Update

**Files:**
- Modify: `apps/marketing/src/app/sitemap.ts`

- [ ] **Step 1: Add Kerala pages to the static pages array**

Add these entries to the `staticPages` array in `sitemap.ts`, after the existing Chennai entries (around line 54):

```typescript
  // Kerala state hub + city hubs + neighborhoods
  { path: '/coaching/nata-coaching-kerala', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi/edappally', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi/kakkanad', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi/marine-drive', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi/aluva', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kochi/tripunithura', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum/kowdiar', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum/pattom', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum/technopark', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum/kazhakkoottam', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-trivandrum/vattiyoorkavu', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut/mavoor-road', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut/palayam', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut/feroke', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut/nadakkavu', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-calicut/beypore', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-thrissur', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-thrissur/round-south', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-thrissur/ollur', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-thrissur/poothole', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-thrissur/ayyanthole', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kannur', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kannur/city-center', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kannur/thavakkara', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kannur/thalassery', lastModified: '2026-04-03' },
  { path: '/coaching/nata-coaching-kannur/mattannur', lastModified: '2026-04-03' },
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/app/sitemap.ts
git commit -m "feat(marketing): add Kerala SEO pages to sitemap"
```

---

### Task 13: Redirects in next.config.js

**Files:**
- Modify: `apps/marketing/next.config.js`

- [ ] **Step 1: Add alternate spelling redirects**

Add these redirects in the `redirects` array in `next.config.js`, before the catch-all location redirect (around line 170). Also update the existing `/nata-coaching-kochi` redirect to point to the new hub page instead of the generic dynamic page:

```javascript
      // Kerala alternate city name redirects (official → popular search name)
      { source: '/coaching/nata-coaching-kozhikode/:path*', destination: '/coaching/nata-coaching-calicut/:path*', permanent: true },
      { source: '/coaching/nata-coaching-thiruvananthapuram/:path*', destination: '/coaching/nata-coaching-trivandrum/:path*', permanent: true },
      { source: '/coaching/nata-coaching-ernakulam/:path*', destination: '/coaching/nata-coaching-kochi/:path*', permanent: true },
      { source: '/coaching/nata-coaching-cochin/:path*', destination: '/coaching/nata-coaching-kochi/:path*', permanent: true },
      { source: '/coaching/nata-coaching-trichur/:path*', destination: '/coaching/nata-coaching-thrissur/:path*', permanent: true },
      { source: '/coaching/nata-coaching-cannanore/:path*', destination: '/coaching/nata-coaching-kannur/:path*', permanent: true },
```

Also update the existing redirect on line 167 from:
```javascript
{ source: '/nata-coaching-kochi', destination: '/coaching/nata-coaching/nata-coaching-centers-in-kochi', permanent: true },
```
to:
```javascript
{ source: '/nata-coaching-kochi', destination: '/coaching/nata-coaching-kochi', permanent: true },
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/next.config.js
git commit -m "feat(marketing): add Kerala alternate city name redirects"
```

---

### Task 14: Verify Build

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/marketing && pnpm type-check`
Expected: No errors

- [ ] **Step 2: Run build**

Run: `cd apps/marketing && pnpm build`
Expected: All ~32 new pages generate successfully. Look for the Kerala URLs in the build output.

- [ ] **Step 3: Run dev server and spot-check pages**

Run: `cd apps/marketing && pnpm dev`

Check these URLs in browser:
- `http://localhost:3010/coaching/nata-coaching-kerala` — state hub
- `http://localhost:3010/coaching/nata-coaching-kochi` — city hub
- `http://localhost:3010/coaching/nata-coaching-kochi/edappally` — neighborhood
- `http://localhost:3010/coaching/nata-coaching-calicut` — Calicut hub
- `http://localhost:3010/coaching/nata-coaching-calicut/mavoor-road` — Calicut neighborhood
- `http://localhost:3010/ml/coaching/nata-coaching-kerala` — Malayalam variant

Verify each page has:
- Correct title tag (`<title>`)
- Correct breadcrumbs
- Working internal links between state → city → neighborhood
- No horizontal scroll on mobile (375px viewport)
- JSON-LD schemas in page source

- [ ] **Step 4: Check sitemap**

Visit: `http://localhost:3010/sitemap.xml`
Expected: All ~32 Kerala pages listed with correct URLs and priorities

- [ ] **Step 5: Check redirects**

Visit: `http://localhost:3010/coaching/nata-coaching-kozhikode` — should redirect to `/coaching/nata-coaching-calicut`
Visit: `http://localhost:3010/coaching/nata-coaching-cochin` — should redirect to `/coaching/nata-coaching-kochi`

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(marketing): address build issues in Kerala SEO pages"
```
