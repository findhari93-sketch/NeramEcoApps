/**
 * City data for NATA online coaching landing pages.
 *
 * Each city object is the single source of truth for the
 * /nata-coaching/[city] route. Fields stay generic enough that any
 * city onboards with the same CityCoachingTemplate, no per-city
 * code branches.
 *
 * tnCities   : Tamil Nadu cities (Neram's home market, some have offline presence)
 * metroCities: Pan-India metros (online-only audience, no Neram physical centre)
 *
 * Both records share the CityData shape and feed the same template.
 */

export interface CityData {
  /** URL slug (lowercase, hyphenated). Matches folder name under /nata-coaching/. */
  slug: string;
  /** Display name used in titles, H1, breadcrumbs. */
  displayName: string;
  /** Tamil display name (used inline for local relevance). */
  displayNameTamil?: string;
  /** State display name. */
  state: string;
  /** Population-rank or coaching-demand tier. 1 = top tier. */
  tier: 1 | 2 | 3;
  /** Localised intro paragraph (English). Keep under 80 words. */
  intro: string;
  /** Optional Neram physical presence statement. */
  neramPresence?: string;
  /** Publicly listed NATA exam centres in/near this city (verifiable on CoA portal). */
  nataExamCenters: string[];
  /** Sub-areas / neighbourhoods Neram serves (for internal linking + AEO). */
  servedAreas: string[];
  /** Top architecture colleges in or near this city (drives interest). */
  topArchColleges: string[];
  /** Average NATA aspirants per year from this city (rough public estimate). */
  yearlyAspirantsLabel?: string;
}

export const panIndiaCities: Record<string, CityData> = {
  bangalore: {
    slug: 'bangalore',
    displayName: 'Bangalore',
    displayNameTamil: 'பெங்களூரு',
    state: 'Karnataka',
    tier: 1,
    intro:
      "Bangalore is one of India's largest architecture-aspirant hubs, with strong NATA preparation demand from Koramangala, HSR Layout, Whitefield, Indiranagar, Jayanagar, and Electronic City. Students target BMS College of Engineering, RV College, MSRIT, and Christ University B.Arch programs every year.",
    neramPresence:
      'Neram Classes is headquartered in Electronic City Phase 1, Bangalore, and runs live online batches accessible across all Bangalore neighbourhoods.',
    nataExamCenters: [
      'NATA Exam Center, Bangalore (Yeshwanthpur area)',
      'NATA Exam Center, Bangalore (Electronic City area)',
      'NATA Exam Center, Bangalore (Whitefield area)',
    ],
    servedAreas: [
      'Koramangala',
      'HSR Layout',
      'Indiranagar',
      'Whitefield',
      'Jayanagar',
      'JP Nagar',
      'Electronic City',
      'Yeshwanthpur',
      'Marathahalli',
      'Banashankari',
    ],
    topArchColleges: [
      'BMS College of Engineering, Bangalore',
      'RV College of Engineering',
      'MS Ramaiah Institute of Technology',
      'Christ University School of Architecture',
      'Acharya Institute of Technology',
      'BMS School of Architecture',
    ],
    yearlyAspirantsLabel: '2,500+ NATA aspirants per year',
  },
  hyderabad: {
    slug: 'hyderabad',
    displayName: 'Hyderabad',
    state: 'Telangana',
    tier: 1,
    intro:
      'Hyderabad has a thriving NATA preparation community, with students from Madhapur, Gachibowli, Banjara Hills, Kondapur, Kukatpally, and Secunderabad targeting JNAFAU School of Planning and Architecture, JNTU College of Architecture, and other Telugu-state institutes.',
    nataExamCenters: [
      'NATA Exam Center, Hyderabad (Hitech City area)',
      'NATA Exam Center, Hyderabad (Secunderabad area)',
    ],
    servedAreas: [
      'Madhapur',
      'Gachibowli',
      'Banjara Hills',
      'Kondapur',
      'Kukatpally',
      'Secunderabad',
      'Begumpet',
      'Ameerpet',
      'Miyapur',
      'LB Nagar',
    ],
    topArchColleges: [
      'JNAFAU School of Planning and Architecture',
      'JNTU College of Architecture',
      'Aurora\'s Design Academy',
      'Vasavi College of Engineering',
      'CBIT Hyderabad',
    ],
    yearlyAspirantsLabel: '1,800+ NATA aspirants per year',
  },
  mumbai: {
    slug: 'mumbai',
    displayName: 'Mumbai',
    state: 'Maharashtra',
    tier: 1,
    intro:
      'Mumbai is home to JJ College of Architecture, one of the most prestigious B.Arch destinations in India. Students from Andheri, Bandra, Powai, Thane, Borivali, Vashi, and the wider MMR region prepare for NATA every year. JJ, KRVIA, Rachana Sansad, and Sir JJ are the top targets.',
    nataExamCenters: [
      'NATA Exam Center, Mumbai (Andheri area)',
      'NATA Exam Center, Mumbai (Navi Mumbai)',
      'NATA Exam Center, Mumbai (Thane area)',
    ],
    servedAreas: [
      'Andheri',
      'Bandra',
      'Powai',
      'Thane',
      'Borivali',
      'Mulund',
      'Navi Mumbai',
      'Vashi',
      'Dadar',
      'Goregaon',
    ],
    topArchColleges: [
      'Sir JJ College of Architecture',
      'KRVIA (Kamla Raheja Vidyanidhi Institute)',
      'Rachana Sansad Academy of Architecture',
      'Rizvi College of Architecture',
      'Pillai HOC College of Architecture',
      'D Y Patil College of Architecture, Navi Mumbai',
    ],
    yearlyAspirantsLabel: '2,200+ NATA aspirants per year',
  },
  delhi: {
    slug: 'delhi',
    displayName: 'Delhi',
    state: 'Delhi NCR',
    tier: 1,
    intro:
      'Delhi NCR is the most competitive NATA market in India, with SPA Delhi (School of Planning and Architecture) as the top national B.Arch destination. Students from South Delhi, Dwarka, Noida, Gurgaon, Ghaziabad, and Faridabad compete for SPA Delhi, USAP, Jamia Millia, and Manav Rachna programs.',
    nataExamCenters: [
      'NATA Exam Center, Delhi',
      'NATA Exam Center, Noida',
      'NATA Exam Center, Gurgaon',
    ],
    servedAreas: [
      'South Delhi',
      'Dwarka',
      'Rohini',
      'Noida',
      'Greater Noida',
      'Gurgaon',
      'Ghaziabad',
      'Faridabad',
      'Karol Bagh',
      'Pitampura',
    ],
    topArchColleges: [
      'School of Planning and Architecture (SPA), Delhi',
      'University School of Architecture and Planning (USAP), GGSIPU',
      'Jamia Millia Islamia Faculty of Architecture',
      'Manav Rachna University, Faridabad',
      'Amity School of Architecture and Planning, Noida',
      'Sushant University School of Art and Architecture',
    ],
    yearlyAspirantsLabel: '3,500+ NATA aspirants per year',
  },
  pune: {
    slug: 'pune',
    displayName: 'Pune',
    state: 'Maharashtra',
    tier: 1,
    intro:
      'Pune has a deep architecture-education ecosystem, with students from Kothrud, Aundh, Baner, Viman Nagar, Hadapsar, and Pimpri-Chinchwad preparing for NATA each year. BNCA (Bharati Vidyapeeth College of Architecture for Women), Sinhgad, MIT, and DY Patil are the most-targeted institutes.',
    nataExamCenters: [
      'NATA Exam Center, Pune',
      'NATA Exam Center, Pimpri-Chinchwad',
    ],
    servedAreas: [
      'Kothrud',
      'Aundh',
      'Baner',
      'Viman Nagar',
      'Hadapsar',
      'Pimpri',
      'Chinchwad',
      'Wakad',
      'Hinjewadi',
      'Camp',
    ],
    topArchColleges: [
      'BNCA (Bharati Vidyapeeth College of Architecture)',
      'Sinhgad College of Architecture',
      'MIT College of Architecture',
      'D Y Patil College of Architecture, Pune',
      'PVPIT College of Architecture',
    ],
    yearlyAspirantsLabel: '1,400+ NATA aspirants per year',
  },
  kolkata: {
    slug: 'kolkata',
    displayName: 'Kolkata',
    state: 'West Bengal',
    tier: 1,
    intro:
      'Kolkata aspirants traditionally target Jadavpur University B.Arch, IIEST Shibpur, Bengal Institute of Technology, and other eastern-region architecture institutes. Students from Salt Lake, New Town, Howrah, Tollygunge, and Behala prepare for NATA every year through online batches.',
    nataExamCenters: [
      'NATA Exam Center, Kolkata',
      'NATA Exam Center, Howrah area',
    ],
    servedAreas: [
      'Salt Lake',
      'New Town',
      'Howrah',
      'Tollygunge',
      'Behala',
      'Park Street',
      'Ballygunge',
      'Garia',
      'Jadavpur',
      'Kasba',
    ],
    topArchColleges: [
      'Jadavpur University Department of Architecture',
      'Bengal Engineering and Science University (IIEST Shibpur)',
      'Bengal Institute of Technology',
      'JIS School of Architecture',
      'Techno India University, Salt Lake',
    ],
    yearlyAspirantsLabel: '900+ NATA aspirants per year',
  },
  kochi: {
    slug: 'kochi',
    displayName: 'Kochi',
    state: 'Kerala',
    tier: 2,
    intro:
      'Kochi and the wider Ernakulam region produce a strong stream of NATA aspirants every year, targeting CET Trivandrum, TKM College of Engineering Kollam, College of Engineering Trivandrum, and Karunya Institute. Students from Edappally, Kakkanad, Vyttila, Aluva, and Tripunithura enrol in Neram online batches for live faculty access without travelling to Chennai.',
    nataExamCenters: [
      'NATA Exam Center, Kochi (Ernakulam)',
    ],
    servedAreas: [
      'Edappally',
      'Kakkanad',
      'Vyttila',
      'Aluva',
      'Tripunithura',
      'Palarivattom',
      'Kalamassery',
      'Fort Kochi',
    ],
    topArchColleges: [
      'College of Engineering, Trivandrum (CET)',
      'TKM College of Engineering, Kollam',
      'Government Engineering College, Thrissur',
      'NIT Calicut Department of Architecture',
      'Karunya Institute of Technology and Sciences',
    ],
    yearlyAspirantsLabel: '700+ NATA aspirants per year',
  },
  ahmedabad: {
    slug: 'ahmedabad',
    displayName: 'Ahmedabad',
    state: 'Gujarat',
    tier: 1,
    intro:
      'Ahmedabad is home to CEPT University, arguably the most influential architecture institute in India. NATA aspirants from Satellite, Vastrapur, Bopal, Maninagar, Naranpura, and Gandhinagar target CEPT, Nirma School of Architecture, SAL Architecture, and Anant National University every year.',
    nataExamCenters: [
      'NATA Exam Center, Ahmedabad',
      'NATA Exam Center, Gandhinagar',
    ],
    servedAreas: [
      'Satellite',
      'Vastrapur',
      'Bopal',
      'Maninagar',
      'Naranpura',
      'Navrangpura',
      'SG Highway',
      'Prahlad Nagar',
      'Gandhinagar',
    ],
    topArchColleges: [
      'CEPT University Faculty of Architecture',
      'Nirma School of Architecture',
      'SAL School of Architecture',
      'Anant National University',
      'Indubhai Parekh School of Architecture, Rajkot',
    ],
    yearlyAspirantsLabel: '1,500+ NATA aspirants per year',
  },
};

export const tnCities: Record<string, CityData> = {
  chennai: {
    slug: 'chennai',
    displayName: 'Chennai',
    displayNameTamil: 'சென்னை',
    state: 'Tamil Nadu',
    tier: 1,
    intro:
      'Chennai is the architecture-education capital of South India. Students from Anna Nagar, Adyar, T. Nagar, Tambaram, Velachery, OMR, and surrounding suburbs prepare for NATA every year for entry to Anna University SAP, MEASI, BSA Crescent, and other top B.Arch programs.',
    neramPresence:
      'Neram Classes has been training NATA aspirants from Chennai since 2009, with a flagship centre in Ashok Nagar (5 minutes from Ashok Nagar metro) and online live batches that serve all Chennai neighbourhoods.',
    nataExamCenters: [
      'NATA Exam Center, Anna University area',
      'NATA Exam Center, OMR (Old Mahabalipuram Road)',
      'NATA Exam Center, Tambaram',
      'NATA Exam Center, Velachery',
    ],
    servedAreas: [
      'Anna Nagar',
      'Adyar',
      'T. Nagar',
      'Tambaram',
      'Velachery',
      'Ashok Nagar',
      'OMR',
      'Porur',
      'Guindy',
      'Mylapore',
    ],
    topArchColleges: [
      'School of Architecture and Planning, Anna University',
      'MEASI Academy of Architecture',
      'BSA Crescent University',
      'Hindustan University, Chennai',
      'SRM University, Kattankulathur',
      'Sathyabama Institute of Science and Technology',
    ],
    yearlyAspirantsLabel: '3,000+ NATA aspirants per year',
  },
  coimbatore: {
    slug: 'coimbatore',
    displayName: 'Coimbatore',
    displayNameTamil: 'கோயம்புத்தூர்',
    state: 'Tamil Nadu',
    tier: 1,
    intro:
      'Coimbatore is one of the strongest NATA preparation hubs in Tamil Nadu, with consistent annual selections to top architecture colleges. Students from RS Puram, Saibaba Colony, Peelamedu, Saravanampatti, and Pollachi enrol in Neram Classes online for live faculty access without travelling to Chennai.',
    nataExamCenters: [
      'NATA Exam Center, Coimbatore (Government Polytechnic area)',
      'NATA Exam Center, Peelamedu',
    ],
    servedAreas: [
      'RS Puram',
      'Saibaba Colony',
      'Peelamedu',
      'Saravanampatti',
      'Vadavalli',
      'Race Course',
      'Singanallur',
      'Pollachi',
    ],
    topArchColleges: [
      'Karpagam Academy of Higher Education',
      'Kumaraguru College of Technology, Coimbatore',
      'Park College of Architecture',
      'PSG College of Technology',
      'Coimbatore Institute of Engineering and Technology',
    ],
    yearlyAspirantsLabel: '1,200+ NATA aspirants per year',
  },
  madurai: {
    slug: 'madurai',
    displayName: 'Madurai',
    displayNameTamil: 'மதுரை',
    state: 'Tamil Nadu',
    tier: 2,
    intro:
      'Madurai students traditionally travel to Chennai for NATA coaching. Neram Classes online removes that constraint, with live evening batches accessible from K.K. Nagar, Anna Nagar, Tallakulam, and surrounding suburbs of southern Tamil Nadu.',
    nataExamCenters: [
      'NATA Exam Center, Madurai',
    ],
    servedAreas: [
      'K.K. Nagar',
      'Anna Nagar',
      'Tallakulam',
      'Goripalayam',
      'Villapuram',
      'Thirunagar',
    ],
    topArchColleges: [
      'Thiagarajar College of Engineering, Madurai',
      'Mepco Schlenk Engineering College, Sivakasi',
      'PSNA College of Engineering, Dindigul',
    ],
    yearlyAspirantsLabel: '500+ NATA aspirants per year',
  },
  trichy: {
    slug: 'trichy',
    displayName: 'Trichy',
    displayNameTamil: 'திருச்சி',
    state: 'Tamil Nadu',
    tier: 2,
    intro:
      'Trichy is home to NIT Trichy, one of India’s top B.Arch destinations. Students from Cantonment, Thillai Nagar, Srirangam, K.K. Nagar, and nearby districts (Karur, Pudukkottai, Thanjavur) target NIT Trichy and NIT Calicut via NATA and JEE Paper 2 combined preparation through Neram Classes online.',
    nataExamCenters: [
      'NATA Exam Center, Trichy',
    ],
    servedAreas: [
      'Cantonment',
      'Thillai Nagar',
      'Srirangam',
      'K.K. Nagar',
      'Woraiyur',
      'Thuvakudi',
    ],
    topArchColleges: [
      'National Institute of Technology, Tiruchirappalli (NIT Trichy)',
      'Bharath University, Trichy campus',
      'Roever College of Engineering, Perambalur',
    ],
    yearlyAspirantsLabel: '400+ NATA aspirants per year',
  },
  salem: {
    slug: 'salem',
    displayName: 'Salem',
    displayNameTamil: 'சேலம்',
    state: 'Tamil Nadu',
    tier: 2,
    intro:
      'Salem and the western Tamil Nadu belt (Erode, Namakkal, Dharmapuri) historically had limited NATA coaching options. Neram Classes online brings live drawing sessions, mock tests, and faculty from NIT/IIT directly to Salem aspirants without relocation.',
    nataExamCenters: [
      'NATA Exam Center, Salem',
    ],
    servedAreas: [
      'Hasthampatti',
      'Fairlands',
      'Suramangalam',
      'Five Roads',
      'Shevapet',
      'Steel Plant area',
    ],
    topArchColleges: [
      'Government College of Engineering, Salem',
      'Sona College of Technology',
      'Vinayaka Mission’s University',
    ],
    yearlyAspirantsLabel: '250+ NATA aspirants per year',
  },
  vellore: {
    slug: 'vellore',
    displayName: 'Vellore',
    displayNameTamil: 'வேலூர்',
    state: 'Tamil Nadu',
    tier: 2,
    intro:
      'Vellore students prepare for NATA with one eye on VIT, Anna University, and Bangalore-based architecture colleges. Neram Classes online gives Vellore aspirants the same NIT/IIT alumni faculty access that Chennai students get, with no commute.',
    nataExamCenters: [
      'NATA Exam Center, Vellore',
    ],
    servedAreas: [
      'Katpadi',
      'Sathuvachari',
      'Gandhi Nagar',
      'Bagayam',
      'Thiruvalam',
      'Ranipet',
    ],
    topArchColleges: [
      'Vellore Institute of Technology (VIT)',
      'C. Abdul Hakeem College of Engineering and Technology',
      'Adhiparasakthi College of Engineering, Kalavai',
    ],
    yearlyAspirantsLabel: '300+ NATA aspirants per year',
  },
};

export type CitySlug = keyof typeof tnCities;
