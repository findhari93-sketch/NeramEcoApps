import { BASE_URL, ORG_NAME, ORG_PHONE, ORG_EMAIL, SOCIAL_PROFILES, ORG_LOGO } from '@/lib/seo/constants';

export interface ChennaiNeighborhood {
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
}

export const CHENNAI_CENTER_ADDRESS = 'PT Rajan Road, Sector 13, Ashok Nagar, Chennai, Tamil Nadu';
export const CHENNAI_CENTER_COORDS = { lat: 13.0382, lng: 80.2120 };

export const GOOGLE_BUSINESS_URL = 'https://share.google/CUC4sm7hWYHZEajn7';

export const chennaiNeighborhoods: ChennaiNeighborhood[] = [
  {
    slug: 'anna-nagar',
    name: 'Anna Nagar',
    displayName: 'Anna Nagar',
    distanceFromCenter: '7 km from Ashok Nagar center',
    transportInfo: 'Take Anna Nagar East Metro to Ashok Nagar Metro (1 stop). Bus routes 29C, 27B via Arumbakkam. Auto/cab: 20 minutes via 100 Feet Road.',
    landmarks: ['Anna Nagar Tower (2nd Avenue)', 'Anna Nagar Round Tana', 'VR Mall Anna Nagar', 'Anna Nagar East Metro Station'],
    nearbySchools: ['DAV Boys Senior Secondary School', 'Shri B.S. Mootha Girls School', 'Chinmaya Vidyalaya Anna Nagar', 'PSBB School K.K. Nagar'],
    description: 'Anna Nagar is one of Chennai\'s most well-planned residential localities, known for its wide roads, parks, and excellent educational institutions. Many Class 11 and 12 students from Anna Nagar aspire to architecture careers, given the neighborhood\'s own example of good urban planning. The Anna Nagar Tower, a 135-foot landmark built in 1968, is itself a lesson in structural design and a popular sketching subject for NATA aspirants.',
    whyStudentsChoose: 'Anna Nagar students choose Neram because our Ashok Nagar center is just 1 metro stop away (Anna Nagar East to Ashok Nagar). For those who prefer studying from home, our live online classes offer the same curriculum with real-time drawing feedback. Several Anna Nagar students have scored 140+ in NATA through our program.',
    metaTitle: 'Best NATA Coaching in Anna Nagar, Chennai 2026 | Neram Classes',
    metaDescription: 'NATA coaching for Anna Nagar, Chennai students. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Ashok Nagar center just 1 metro stop away. Online + offline classes. Max 25 per batch.',
    metaKeywords: 'NATA coaching Anna Nagar, NATA classes Anna Nagar Chennai, best NATA coaching near Anna Nagar, architecture coaching Anna Nagar, NATA preparation Anna Nagar',
  },
  {
    slug: 'adyar',
    name: 'Adyar',
    displayName: 'Adyar',
    distanceFromCenter: '8 km from Ashok Nagar center',
    transportInfo: 'Bus routes 21G, 19B from Adyar bus depot to Ashok Nagar. Auto/cab: 25 minutes via Sardar Patel Road. Alternatively, join our live online classes from home.',
    landmarks: ['Adyar Estuary & Eco Park', 'IIT Madras Campus', 'Theosophical Society Gardens', 'Adyar Bridge'],
    nearbySchools: ['Padma Seshadri Bala Bhavan (PSBB) K.K. Nagar', 'Bala Vidya Mandir', 'The School (KFI)', 'Vidya Mandir Senior Secondary School'],
    description: 'Adyar, home to IIT Madras, is Chennai\'s educational heartland. The neighborhood\'s proximity to one of India\'s premier engineering and architecture campuses gives students daily exposure to world-class institutional design. The IIT Madras campus itself, designed with climate-responsive architecture, is a frequent subject in NATA drawing practice. Adyar\'s tree-lined streets and the Theosophical Society\'s heritage buildings offer rich sketching opportunities for aspiring architects.',
    whyStudentsChoose: 'Adyar students benefit from being near IIT Madras — many of our faculty are IIT Madras alumni who can arrange campus visits for drawing practice sessions. Our hybrid model means Adyar students can attend online on busy days and visit our Ashok Nagar center on weekends for intensive drawing workshops.',
    metaTitle: 'Best NATA Coaching in Adyar, Chennai 2026 | Neram Classes',
    metaDescription: 'NATA coaching for Adyar, Chennai students. Near IIT Madras campus. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Online + offline hybrid classes. Max 25 per batch.',
    metaKeywords: 'NATA coaching Adyar, NATA classes Adyar Chennai, best NATA coaching near Adyar, architecture coaching Adyar, NATA preparation Adyar Chennai',
  },
  {
    slug: 'tambaram',
    name: 'Tambaram',
    displayName: 'Tambaram',
    distanceFromCenter: '22 km from Ashok Nagar center (also sub-center in Tambaram)',
    transportInfo: 'Tambaram suburban railway station to Mambalam (15 min by train), then 10 min auto to Ashok Nagar. Bus route 170 direct. OR attend at our Tambaram sub-center (Thiruneermalai, Jain Alpine Meadows).',
    landmarks: ['Tambaram Railway Station', 'Madras Christian College (MCC)', 'Mudichur Lake', 'Chromepet Industrial Area'],
    nearbySchools: ['St. Thomas Matriculation School', 'Velammal Matriculation School Tambaram', 'Sri Sankara Vidyashramam', 'Jain Public School Tambaram'],
    description: 'Tambaram, located in South Chennai, is a rapidly developing educational hub. Home to Madras Christian College (one of Asia\'s oldest colleges), Tambaram offers students a blend of colonial and modern architecture to study. The area\'s suburban railway connectivity makes it a convenient base for students from Chengalpattu, Kanchipuram, and South Chennai. Neram has a dedicated sub-center in Tambaram (Thiruneermalai, Jain Alpine Meadows) specifically to serve students in this region.',
    whyStudentsChoose: 'Tambaram students have two options: attend at our Tambaram sub-center (Thiruneermalai) for convenience, or take the suburban train to Mambalam and walk to our Ashok Nagar main center. Students from Chengalpattu, Mahabalipuram, and East Coast Road also attend at Tambaram. Our online option is popular with Tambaram students during exam season.',
    metaTitle: 'Best NATA Coaching in Tambaram, Chennai 2026 | Neram Classes',
    metaDescription: 'NATA coaching in Tambaram, Chennai. Dedicated sub-center at Thiruneermalai + main center at Ashok Nagar. IIT/NIT alumni faculty, 99.9% success rate. Online + offline classes. Serving Chengalpattu, Kanchipuram students too.',
    metaKeywords: 'NATA coaching Tambaram, NATA classes Tambaram Chennai, best NATA coaching near Tambaram, architecture coaching Tambaram, NATA coaching Chengalpattu, NATA coaching East Tambaram',
  },
  {
    slug: 'ashok-nagar',
    name: 'Ashok Nagar',
    displayName: 'Ashok Nagar',
    distanceFromCenter: 'Center located here — 0 km',
    transportInfo: 'Ashok Nagar Metro Station (Blue Line) is a 5-minute walk. Bus stop on PT Rajan Road. Auto-rickshaws available from Saidapet Junction (5 min). Abundant parking for two-wheelers.',
    landmarks: ['Ashok Nagar Metro Station', 'PT Rajan Road', 'Saidapet Junction', 'Ashok Pillar'],
    nearbySchools: ['PSBB Senior Secondary School K.K. Nagar', 'Vidyodaya Schools', 'St. John\'s Matriculation School', 'Chennai Public School'],
    description: 'Ashok Nagar is where Neram Classes\' flagship Chennai center is located — on PT Rajan Road, Sector 13. This centrally located neighborhood is one of Chennai\'s most accessible areas, served by the Blue Line Metro, multiple bus routes, and major arterial roads. Ashok Nagar\'s central position means students from T. Nagar (5 min), K.K. Nagar (10 min), Saidapet (5 min), and West Mambalam (10 min) can reach the center easily.',
    whyStudentsChoose: 'Ashok Nagar students have the advantage of walking to our center — no commute time means more time for drawing practice. Being in the same neighborhood, many students attend daily evening batches after school. The Ashok Nagar Metro station makes the center accessible from across Chennai.',
    metaTitle: 'NATA Coaching Center in Ashok Nagar, Chennai — Neram Classes Flagship',
    metaDescription: 'Visit Neram Classes flagship NATA coaching center at PT Rajan Road, Ashok Nagar, Chennai. Ashok Nagar Metro (5 min walk). IIT/NIT alumni faculty, 99.9% success rate, max 25 per batch. Free demo class.',
    metaKeywords: 'NATA coaching Ashok Nagar, Neram Classes Ashok Nagar, NATA coaching center Chennai, NATA classes Ashok Nagar, architecture coaching Ashok Nagar Chennai, NATA coaching near Saidapet',
  },
  {
    slug: 'velachery',
    name: 'Velachery',
    displayName: 'Velachery',
    distanceFromCenter: '12 km from Ashok Nagar center',
    transportInfo: 'Velachery MRTS to Saidapet MRTS, then 10 min auto to Ashok Nagar. Bus routes 119, M70 via Guindy. Auto/cab: 30 minutes via Velachery Main Road → Guindy → Ashok Nagar.',
    landmarks: ['Phoenix MarketCity Mall', 'Velachery MRTS Station', 'NIOT (National Institute of Ocean Technology)', 'Guindy National Park (nearby)'],
    nearbySchools: ['Chettinad Vidyashram', 'Santhome Higher Secondary School', 'DAV School Velachery', 'Maharishi Vidya Mandir'],
    description: 'Velachery, South Chennai\'s IT corridor hub, has seen rapid urbanization with modern apartment complexes and commercial towers — offering students real-world examples of contemporary urban architecture. The contrast between Velachery\'s older residential areas and its modern developments makes it an interesting study in urban transformation. Many IT professionals\' children in Velachery aspire to architecture careers.',
    whyStudentsChoose: 'Velachery students typically join our live online classes during weekdays (saving the 30-minute commute) and attend the Ashok Nagar center on weekends for intensive drawing practice. Our hybrid model is specifically designed for students in areas like Velachery, OMR, and Sholinganallur who want expert coaching without daily commuting.',
    metaTitle: 'Best NATA Coaching for Velachery, Chennai Students 2026 | Neram Classes',
    metaDescription: 'NATA coaching for Velachery, Chennai students. Online weekday classes + weekend offline at Ashok Nagar center. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Max 25 per batch.',
    metaKeywords: 'NATA coaching Velachery, NATA classes Velachery Chennai, best NATA coaching near Velachery, architecture coaching Velachery, NATA coaching OMR, NATA coaching Sholinganallur',
  },
  {
    slug: 't-nagar',
    name: 'T. Nagar',
    displayName: 'T. Nagar (Thyagaraya Nagar)',
    distanceFromCenter: '3 km from Ashok Nagar center',
    transportInfo: 'T. Nagar to Ashok Nagar is a 10-minute auto ride or 15-minute walk via Habibullah Road. Bus routes 27B, 23C stop at Ashok Nagar. T. Nagar bus terminus has direct connections.',
    landmarks: ['Ranganathan Street (Pondy Bazaar)', 'T. Nagar Bus Terminus', 'Panagal Park', 'North Usman Road'],
    nearbySchools: ['P.S. Senior Secondary School', 'Vidya Mandir T. Nagar', 'Lady Sivaswami Ayyar Girls School', 'Sir Sivaswami Kalalaya Senior Secondary School'],
    description: 'T. Nagar, Chennai\'s commercial and cultural heart, is known for Ranganathan Street\'s bustling commercial architecture and Pondy Bazaar\'s Art Deco buildings. The neighborhood\'s mix of heritage structures, modern retail spaces, and residential towers provides aspiring architects a living classroom of diverse architectural styles. T. Nagar\'s central location makes it one of the best-connected neighborhoods in Chennai.',
    whyStudentsChoose: 'T. Nagar students are just 10 minutes from our Ashok Nagar center — making it the closest major neighborhood. Many T. Nagar students walk to our center after school. The proximity means they can attend daily classes without wasting time on commuting, giving them more drawing practice hours.',
    metaTitle: 'Best NATA Coaching near T. Nagar, Chennai 2026 | Neram Classes',
    metaDescription: 'NATA coaching for T. Nagar (Thyagaraya Nagar), Chennai students. Just 10 minutes from Ashok Nagar center. IIT/NIT alumni faculty, 99.9% success rate, free AI study app. Daily classes + online option.',
    metaKeywords: 'NATA coaching T Nagar, NATA classes T Nagar Chennai, best NATA coaching near T Nagar, architecture coaching Thyagaraya Nagar, NATA coaching Pondy Bazaar, NATA coaching West Mambalam',
  },
];

export function getNeighborhoodBySlug(slug: string): ChennaiNeighborhood | undefined {
  return chennaiNeighborhoods.find((n) => n.slug === slug);
}

export function generateChennaiNeighborhoodSchema(neighborhood: ChennaiNeighborhood) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/coaching/nata-coaching-chennai/${neighborhood.slug}`,
    name: `${ORG_NAME} — NATA Coaching for ${neighborhood.name}, Chennai`,
    url: `${BASE_URL}/coaching/nata-coaching-chennai/${neighborhood.slug}`,
    logo: ORG_LOGO,
    image: ORG_LOGO,
    description: `Best NATA coaching for students in ${neighborhood.name}, Chennai. ${neighborhood.distanceFromCenter}. IIT/NIT/SPA alumni faculty, 99.9% success rate, free AI study app, max 25 per batch.`,
    telephone: ORG_PHONE,
    email: ORG_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: CHENNAI_CENTER_ADDRESS,
      addressLocality: 'Chennai',
      addressRegion: 'Tamil Nadu',
      postalCode: '600083',
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: CHENNAI_CENTER_COORDS.lat,
      longitude: CHENNAI_CENTER_COORDS.lng,
    },
    sameAs: [...SOCIAL_PROFILES, GOOGLE_BUSINESS_URL],
    areaServed: { '@type': 'City', name: 'Chennai' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '50',
      bestRating: '5',
      worstRating: '1',
    },
    parentOrganization: {
      '@id': `${BASE_URL}/#organization`,
    },
  };
}
