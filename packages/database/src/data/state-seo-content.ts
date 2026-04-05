/**
 * State-level SEO content for NATA coaching state landing pages.
 * Each entry contains REAL college names, exam centers, and state-specific
 * highlights so every state page has unique, differentiated content.
 */

export interface StateSeoContent {
  state: string;
  stateDisplay: string;
  topColleges: { name: string; city: string; type: 'government' | 'private' | 'deemed' }[];
  examCenters: string[];
  keyHighlights: string[];
  description: string;
  faqs: { question: string; answer: string }[];
}

function makeStateFaqs(stateDisplay: string, topColleges: string): { question: string; answer: string }[] {
  return [
    {
      question: `What is the best NATA coaching in ${stateDisplay}?`,
      answer: `Neram Classes is the top-rated NATA coaching institute in ${stateDisplay} with a 99.9% success rate since 2009. With IIT/NIT alumni faculty, both online and offline classes, small batches of max 25 students, and a free AI-powered study app, Neram Classes offers the most comprehensive NATA preparation available in ${stateDisplay}.`,
    },
    {
      question: `How much does NATA coaching cost in ${stateDisplay}?`,
      answer: `NATA coaching fees at Neram Classes for students in ${stateDisplay} range from Rs.15,000 for a 3-month crash course to Rs.35,000 for a 2-year program. The 1-year program starts from Rs.25,000. Scholarships, EMI options, and YouTube subscription discounts are available.`,
    },
    {
      question: `Is online NATA coaching available in ${stateDisplay}?`,
      answer: `Yes, Neram Classes offers live online NATA coaching for students across ${stateDisplay}. Online classes include live interactive sessions with IIT/NIT faculty, daily drawing practice via screen sharing, 100+ mock tests, and 24/7 doubt support via WhatsApp. Students can switch between online and offline modes anytime.`,
    },
    {
      question: `What are the top architecture colleges in ${stateDisplay}?`,
      answer: `Top architecture colleges in ${stateDisplay} accepting NATA scores include ${topColleges}. Neram Classes has helped 10,000+ students gain admission to these and other CoA-approved institutions across India.`,
    },
    {
      question: `Can I prepare for NATA from ${stateDisplay} online?`,
      answer: `Absolutely. Neram Classes' online NATA coaching is designed for students in ${stateDisplay} who want expert preparation from home. The program includes live classes, daily drawing practice, personal mentoring, and access to a free AI study app with cutoff calculator and college predictor for 5,000+ colleges.`,
    },
  ];
}

export const stateSeoContent: StateSeoContent[] = [
  // ═══════════════════════════════════════════════════════════════
  // TAMIL NADU
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'tamil-nadu',
    stateDisplay: 'Tamil Nadu',
    topColleges: [
      { name: 'School of Architecture and Planning, Anna University', city: 'Chennai', type: 'government' },
      { name: 'NIT Tiruchirappalli, Department of Architecture', city: 'Trichy', type: 'government' },
      { name: 'SRM Institute of Science and Technology, School of Architecture', city: 'Chennai', type: 'deemed' },
      { name: 'VIT University, School of Architecture', city: 'Vellore', type: 'deemed' },
      { name: 'PSG College of Technology, Department of Architecture', city: 'Coimbatore', type: 'private' },
    ],
    examCenters: ['Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Salem'],
    keyHighlights: [
      'Home to Anna University — one of India\'s oldest and most prestigious architecture schools',
      'Largest concentration of CoA-approved architecture colleges in South India',
      'Rich Dravidian temple architecture heritage ideal for design studies',
      'Neram Classes flagship center with 5,000+ students trained since 2009',
    ],
    description: 'Tamil Nadu is the architecture education powerhouse of South India, with Anna University Chennai and NIT Trichy ranking among India\'s top architecture schools. The state\'s rich heritage of Dravidian temple architecture, colonial-era buildings, and modern IT corridor design makes it an inspiring setting for aspiring architects.',
    faqs: makeStateFaqs('Tamil Nadu', 'Anna University Chennai, NIT Trichy, SRM University, VIT Vellore, and PSG College of Technology Coimbatore'),
  },

  // ═══════════════════════════════════════════════════════════════
  // KARNATAKA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'karnataka',
    stateDisplay: 'Karnataka',
    topColleges: [
      { name: 'BMS College of Architecture', city: 'Bangalore', type: 'private' },
      { name: 'RV College of Architecture', city: 'Bangalore', type: 'private' },
      { name: 'Dayananda Sagar College of Architecture', city: 'Bangalore', type: 'private' },
      { name: 'MSRIT School of Architecture', city: 'Bangalore', type: 'private' },
      { name: 'UVCE, Department of Architecture', city: 'Bangalore', type: 'government' },
    ],
    examCenters: ['Bangalore', 'Mysore', 'Mangalore', 'Hubli'],
    keyHighlights: [
      'Bangalore is India\'s tech capital with cutting-edge sustainable architecture practices',
      'Home to BMS and RV — two of South India\'s most sought-after architecture colleges',
      'Hampi, Mysore Palace, and Hoysala temples provide world-class architectural study material',
      'Growing demand for architecture professionals in Bangalore\'s booming real estate sector',
    ],
    description: 'Karnataka, with Bangalore as India\'s Silicon Valley, offers an exciting blend of ancient Hoysala and Vijayanagara architecture with modern sustainable design. The state hosts several top-ranked CoA-approved architecture colleges and presents excellent career opportunities in the booming construction and real estate sectors.',
    faqs: makeStateFaqs('Karnataka', 'BMS College of Architecture, RV College of Architecture, Dayananda Sagar College, MSRIT Bangalore, and UVCE Bangalore'),
  },

  // ═══════════════════════════════════════════════════════════════
  // KERALA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'kerala',
    stateDisplay: 'Kerala',
    topColleges: [
      { name: 'College of Engineering Trivandrum (CET), Department of Architecture', city: 'Thiruvananthapuram', type: 'government' },
      { name: 'NIT Calicut, Department of Architecture', city: 'Kozhikode', type: 'government' },
      { name: 'TKM College of Engineering, Department of Architecture', city: 'Kollam', type: 'government' },
      { name: 'Mar Athanasius College of Engineering, Department of Architecture', city: 'Kothamangalam', type: 'private' },
    ],
    examCenters: ['Thiruvananthapuram', 'Kochi', 'Kozhikode'],
    keyHighlights: [
      'NIT Calicut is among the top 10 architecture schools in India',
      'Kerala\'s unique tropical and sustainable architecture is globally recognized',
      'Laurie Baker\'s cost-effective architecture movement originated in Kerala',
      'Strong demand for architects in Kerala\'s tourism and hospitality sectors',
    ],
    description: 'Kerala is renowned for its distinctive tropical architecture and the legacy of Laurie Baker\'s sustainable design philosophy. With NIT Calicut and CET Trivandrum as premier institutions, the state offers excellent architecture education amidst a landscape that naturally teaches climate-responsive design.',
    faqs: makeStateFaqs('Kerala', 'NIT Calicut, CET Trivandrum, TKM College Kollam, and Mar Athanasius College Kothamangalam'),
  },
  // ═══════════════════════════════════════════════════════════════
  // ANDHRA PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'andhra-pradesh',
    stateDisplay: 'Andhra Pradesh',
    topColleges: [
      { name: 'JNTU Anantapur, School of Planning and Architecture', city: 'Anantapur', type: 'government' },
      { name: 'Andhra University, Department of Architecture', city: 'Visakhapatnam', type: 'government' },
      { name: 'KL University, Department of Architecture', city: 'Vijayawada', type: 'deemed' },
      { name: 'Sree Vidyanikethan Engineering College, Dept of Architecture', city: 'Tirupati', type: 'private' },
    ],
    examCenters: ['Visakhapatnam', 'Vijayawada', 'Tirupati'],
    keyHighlights: [
      'New capital city Amaravati is a massive architecture and urban planning project',
      'Visakhapatnam emerging as a major architecture education hub on the east coast',
      'Rich Buddhist heritage sites like Nagarjunakonda offer unique study opportunities',
      'Affordable cost of living makes AP attractive for architecture students',
    ],
    description: 'Andhra Pradesh presents a unique opportunity for architecture students with the ongoing development of Amaravati as a planned capital city. The state combines rich Buddhist and Hindu architectural heritage with modern urban development, offering practical learning experiences for aspiring architects.',
    faqs: makeStateFaqs('Andhra Pradesh', 'JNTU Anantapur, Andhra University Visakhapatnam, KL University Vijayawada, and Sree Vidyanikethan Tirupati'),
  },

  // ═══════════════════════════════════════════════════════════════
  // TELANGANA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'telangana',
    stateDisplay: 'Telangana',
    topColleges: [
      { name: 'JNTU Hyderabad, School of Planning and Architecture', city: 'Hyderabad', type: 'government' },
      { name: 'Osmania University, Department of Architecture', city: 'Hyderabad', type: 'government' },
      { name: 'CBIT, Department of Architecture', city: 'Hyderabad', type: 'private' },
      { name: 'Jawaharlal Nehru Architecture and Fine Arts University (JNAFAU)', city: 'Hyderabad', type: 'government' },
    ],
    examCenters: ['Hyderabad', 'Warangal'],
    keyHighlights: [
      'JNAFAU Hyderabad is one of India\'s only dedicated architecture and fine arts universities',
      'Hyderabad\'s blend of Qutb Shahi, Nizam-era, and modern architecture is iconic',
      'Rapidly growing IT sector driving demand for commercial and residential architects',
      'Lower tuition fees compared to other metro cities for equivalent quality education',
    ],
    description: 'Telangana, centered around Hyderabad, is a rising architecture education hub with JNAFAU as India\'s only dedicated architecture and fine arts university. The city\'s stunning blend of Qutb Shahi tombs, Nizam-era palaces, and cutting-edge HITEC City creates a living laboratory for architecture students.',
    faqs: makeStateFaqs('Telangana', 'JNAFAU Hyderabad, JNTU Hyderabad, Osmania University, and CBIT Hyderabad'),
  },

  // ═══════════════════════════════════════════════════════════════
  // MAHARASHTRA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'maharashtra',
    stateDisplay: 'Maharashtra',
    topColleges: [
      { name: 'Sir JJ College of Architecture', city: 'Mumbai', type: 'government' },
      { name: 'VNIT Nagpur, Department of Architecture', city: 'Nagpur', type: 'government' },
      { name: 'Sinhgad College of Architecture', city: 'Pune', type: 'private' },
      { name: 'BKPS College of Architecture', city: 'Pune', type: 'private' },
      { name: 'Rachana Sansad Academy of Architecture', city: 'Mumbai', type: 'private' },
    ],
    examCenters: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'],
    keyHighlights: [
      'Sir JJ College of Architecture Mumbai is India\'s oldest and most prestigious architecture school (est. 1857)',
      'Mumbai\'s Art Deco district is the second largest in the world after Miami',
      'Pune is emerging as a major architecture education hub with 10+ colleges',
      'Maharashtra has the highest number of CoA-approved architecture colleges in India',
    ],
    description: 'Maharashtra is India\'s architecture education capital, home to the legendary Sir JJ College of Architecture (est. 1857) and the largest number of CoA-approved institutions. From Mumbai\'s iconic Art Deco skyline to Pune\'s growing architectural scene and Ajanta-Ellora\'s ancient rock-cut caves, the state offers unmatched exposure for architecture students.',
    faqs: makeStateFaqs('Maharashtra', 'Sir JJ College of Architecture Mumbai, VNIT Nagpur, Sinhgad College Pune, and Rachana Sansad Mumbai'),
  },
  // ═══════════════════════════════════════════════════════════════
  // GUJARAT
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'gujarat',
    stateDisplay: 'Gujarat',
    topColleges: [
      { name: 'CEPT University, Faculty of Architecture', city: 'Ahmedabad', type: 'government' },
      { name: 'MS University, Faculty of Technology and Engineering', city: 'Vadodara', type: 'government' },
      { name: 'LJ University, School of Architecture', city: 'Ahmedabad', type: 'private' },
      { name: 'Parul University, Faculty of Architecture', city: 'Vadodara', type: 'private' },
    ],
    examCenters: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
    keyHighlights: [
      'CEPT Ahmedabad is consistently ranked among India\'s top 3 architecture schools',
      'Ahmedabad is a UNESCO World Heritage City — the first in India to receive this status',
      'Le Corbusier\'s and Louis Kahn\'s iconic buildings in Ahmedabad are global architecture landmarks',
      'Gujarat\'s traditional step-wells (vav) and pol houses offer unique vernacular architecture studies',
    ],
    description: 'Gujarat is home to CEPT University Ahmedabad, consistently ranked among India\'s top 3 architecture schools. Ahmedabad, India\'s first UNESCO World Heritage City, features masterworks by Le Corbusier and Louis Kahn, while the state\'s traditional pol houses and step-wells provide rich vernacular architecture study material.',
    faqs: makeStateFaqs('Gujarat', 'CEPT University Ahmedabad, MS University Vadodara, LJ University Ahmedabad, and Parul University Vadodara'),
  },

  // ═══════════════════════════════════════════════════════════════
  // DELHI
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'delhi',
    stateDisplay: 'Delhi',
    topColleges: [
      { name: 'School of Planning and Architecture (SPA) Delhi', city: 'Delhi', type: 'government' },
      { name: 'Jamia Millia Islamia, Faculty of Architecture and Ekistics', city: 'Delhi', type: 'government' },
      { name: 'Guru Gobind Singh Indraprastha University, School of Architecture', city: 'Delhi', type: 'government' },
      { name: 'Sushant University, School of Art and Architecture', city: 'Gurgaon', type: 'private' },
    ],
    examCenters: ['Delhi', 'Noida', 'Gurgaon'],
    keyHighlights: [
      'SPA Delhi is India\'s #1 ranked architecture school and a national institute of importance',
      'Delhi has the richest concentration of Mughal, Colonial, and Modern architecture in India',
      'Lutyens\' Delhi, Red Fort, and Lotus Temple offer world-class architectural case studies',
      'Proximity to Chandigarh — Le Corbusier\'s planned city — for study tours',
    ],
    description: 'Delhi is the epicenter of Indian architecture education, home to SPA Delhi (India\'s #1 ranked architecture school) and Jamia Millia Islamia. The city\'s architectural landscape spans 1,000 years — from Qutub Minar and Red Fort to Lutyens\' colonial masterplan and contemporary landmarks like the Lotus Temple.',
    faqs: makeStateFaqs('Delhi', 'SPA Delhi (India\'s #1), Jamia Millia Islamia, IP University School of Architecture, and Sushant University Gurgaon'),
  },

  // ═══════════════════════════════════════════════════════════════
  // UTTAR PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'uttar-pradesh',
    stateDisplay: 'Uttar Pradesh',
    topColleges: [
      { name: 'Aligarh Muslim University (AMU), Department of Architecture', city: 'Aligarh', type: 'government' },
      { name: 'IIT BHU Varanasi, Department of Architecture', city: 'Varanasi', type: 'government' },
      { name: 'Amity University, School of Architecture', city: 'Noida', type: 'private' },
      { name: 'Galgotias University, School of Architecture', city: 'Greater Noida', type: 'private' },
    ],
    examCenters: ['Lucknow', 'Noida', 'Varanasi', 'Allahabad'],
    keyHighlights: [
      'IIT BHU Varanasi offers one of India\'s most prestigious B.Arch programs through JEE Advanced',
      'The Taj Mahal, Fatehpur Sikri, and Lucknow\'s Nawabi architecture are world heritage sites',
      'Noida/Greater Noida has a rapidly growing cluster of architecture colleges near Delhi NCR',
      'UP has the largest student population in India — high demand for quality coaching',
    ],
    description: 'Uttar Pradesh combines world-renowned architectural heritage — from the Taj Mahal to Varanasi\'s ancient ghats — with strong educational institutions like IIT BHU and AMU Aligarh. The Noida/Greater Noida corridor, close to Delhi, has become a growing hub for architecture education.',
    faqs: makeStateFaqs('Uttar Pradesh', 'IIT BHU Varanasi, AMU Aligarh, Amity University Noida, and Galgotias University Greater Noida'),
  },

  // ═══════════════════════════════════════════════════════════════
  // RAJASTHAN
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'rajasthan',
    stateDisplay: 'Rajasthan',
    topColleges: [
      { name: 'MNIT Jaipur, Department of Architecture', city: 'Jaipur', type: 'government' },
      { name: 'Aayojan School of Architecture', city: 'Jaipur', type: 'private' },
      { name: 'Manipal University Jaipur, Faculty of Architecture', city: 'Jaipur', type: 'private' },
      { name: 'Poornima University, School of Architecture', city: 'Jaipur', type: 'private' },
    ],
    examCenters: ['Jaipur', 'Jodhpur', 'Udaipur'],
    keyHighlights: [
      'MNIT Jaipur is a top-ranked NIT with an excellent architecture department',
      'Rajasthan\'s forts, palaces, havelis and step-wells are UNESCO World Heritage masterpieces',
      'Jaipur is India\'s first planned city (1727) — a living urban planning case study',
      'Desert architecture and climate-responsive design are unique Rajasthani contributions',
    ],
    description: 'Rajasthan is a treasure trove of architectural heritage, from the planned city of Jaipur (1727) to the magnificent forts of Jodhpur, Udaipur, and Jaisalmer. MNIT Jaipur leads architecture education in the state, while Rajasthan\'s desert climate architecture offers unique lessons in sustainable and climate-responsive design.',
    faqs: makeStateFaqs('Rajasthan', 'MNIT Jaipur, Aayojan School of Architecture, Manipal University Jaipur, and Poornima University Jaipur'),
  },

  // ═══════════════════════════════════════════════════════════════
  // WEST BENGAL
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'west-bengal',
    stateDisplay: 'West Bengal',
    topColleges: [
      { name: 'Jadavpur University, Department of Architecture', city: 'Kolkata', type: 'government' },
      { name: 'IIT Kharagpur, Department of Architecture', city: 'Kharagpur', type: 'government' },
      { name: 'Bengal Engineering and Science University', city: 'Howrah', type: 'government' },
    ],
    examCenters: ['Kolkata'],
    keyHighlights: [
      'Jadavpur University is one of India\'s top-ranked architecture programs',
      'IIT Kharagpur offers B.Arch through JEE Advanced — one of the most coveted seats',
      'Kolkata\'s colonial architecture is among the best preserved in Asia',
      'Strong tradition of art and design education in Bengal',
    ],
    description: 'West Bengal combines world-class architecture education at Jadavpur University and IIT Kharagpur with Kolkata\'s extraordinary colonial architectural heritage. The city\'s Victoria Memorial, Howrah Bridge, and terracotta temple towns of Bishnupur offer unique design inspiration.',
    faqs: makeStateFaqs('West Bengal', 'Jadavpur University Kolkata, IIT Kharagpur, and Bengal Engineering University Howrah'),
  },


  // ═══════════════════════════════════════════════════════════════
  // MADHYA PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'madhya-pradesh',
    stateDisplay: 'Madhya Pradesh',
    topColleges: [
      { name: 'School of Planning and Architecture (SPA) Bhopal', city: 'Bhopal', type: 'government' },
      { name: 'MANIT Bhopal, Department of Architecture', city: 'Bhopal', type: 'government' },
      { name: 'IPS Academy, School of Architecture', city: 'Indore', type: 'private' },
    ],
    examCenters: ['Bhopal', 'Indore'],
    keyHighlights: [
      'SPA Bhopal is one of only 3 SPAs in India — a national institute of importance',
      'Sanchi Stupa, Khajuraho temples, and Mandu fort are UNESCO heritage architectural sites',
      'Bhopal is an affordable city with excellent architecture education options',
      'Central location makes it accessible from all parts of India',
    ],
    description: 'Madhya Pradesh hosts SPA Bhopal, one of only three Schools of Planning and Architecture in India. The state\'s UNESCO World Heritage sites — Sanchi, Khajuraho, and Bhimbetka — along with Mandu\'s Afghan architecture, provide an extraordinary canvas for architecture students.',
    faqs: makeStateFaqs('Madhya Pradesh', 'SPA Bhopal (national institute), MANIT Bhopal, and IPS Academy Indore'),
  },

  // ═══════════════════════════════════════════════════════════════
  // HARYANA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'haryana',
    stateDisplay: 'Haryana',
    topColleges: [
      { name: 'NIT Kurukshetra, Department of Architecture', city: 'Kurukshetra', type: 'government' },
      { name: 'Deenbandhu Chhotu Ram University, Architecture Department', city: 'Sonipat', type: 'government' },
      { name: 'Sushant University, School of Art and Architecture', city: 'Gurgaon', type: 'private' },
    ],
    examCenters: ['Gurgaon', 'Faridabad', 'Kurukshetra'],
    keyHighlights: [
      'Proximity to Delhi and Chandigarh — two major architecture education and practice hubs',
      'Gurgaon\'s modern high-rise landscape offers exposure to contemporary commercial architecture',
      'NIT Kurukshetra is well-ranked for architecture in North India',
      'Lower living costs than Delhi NCR while maintaining access to top opportunities',
    ],
    description: 'Haryana benefits from its strategic location between Delhi and Chandigarh, two of India\'s most important cities for architecture. Gurgaon\'s modern skyline and NIT Kurukshetra\'s strong architecture department make the state an attractive base for NATA preparation.',
    faqs: makeStateFaqs('Haryana', 'NIT Kurukshetra, Sushant University Gurgaon, and Deenbandhu Chhotu Ram University Sonipat'),
  },

  // ═══════════════════════════════════════════════════════════════
  // PUNJAB
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'punjab',
    stateDisplay: 'Punjab',
    topColleges: [
      { name: 'Guru Nanak Dev University, Department of Architecture', city: 'Amritsar', type: 'government' },
      { name: 'Chitkara University, School of Architecture', city: 'Rajpura', type: 'private' },
      { name: 'Lovely Professional University, School of Architecture', city: 'Jalandhar', type: 'private' },
    ],
    examCenters: ['Chandigarh', 'Amritsar', 'Ludhiana'],
    keyHighlights: [
      'Adjacent to Chandigarh — Le Corbusier\'s planned city and a UNESCO World Heritage Site',
      'Golden Temple Amritsar is a masterpiece of Sikh architecture studied worldwide',
      'Punjab Agricultural University campus showcases modernist institutional architecture',
      'Growing number of private architecture colleges offering quality education',
    ],
    description: 'Punjab students have the unique advantage of proximity to Chandigarh, Le Corbusier\'s planned city and a UNESCO World Heritage Site. Combined with the architectural grandeur of the Golden Temple and growing educational institutions, Punjab offers strong opportunities for aspiring architects.',
    faqs: makeStateFaqs('Punjab', 'Guru Nanak Dev University Amritsar, Chitkara University, and Lovely Professional University Jalandhar'),
  },


  // ═══════════════════════════════════════════════════════════════
  // BIHAR
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'bihar',
    stateDisplay: 'Bihar',
    topColleges: [
      { name: 'NIT Patna, Department of Architecture', city: 'Patna', type: 'government' },
      { name: 'Birla Institute of Technology Mesra, Architecture Department', city: 'Ranchi', type: 'deemed' },
      { name: 'Chandragupt Institute of Management Patna (Architecture wing)', city: 'Patna', type: 'private' },
    ],
    examCenters: ['Patna', 'Gaya'],
    keyHighlights: [
      'NIT Patna is the primary architecture education institution in Bihar',
      'Nalanda University ruins represent one of the world\'s oldest planned educational campuses',
      'Bihar\'s Buddhist architectural heritage at Bodhgaya is internationally significant',
      'Online coaching bridges the gap for students in smaller Bihar towns',
    ],
    description: 'Bihar has a growing architecture education scene anchored by NIT Patna. The state\'s incredible Buddhist heritage — Nalanda University ruins and Mahabodhi Temple at Bodhgaya — offers unique insights into ancient Indian planned architecture and campus design.',
    faqs: makeStateFaqs('Bihar', 'NIT Patna and nearby Birla Institute of Technology Mesra'),
  },

  // ═══════════════════════════════════════════════════════════════
  // ODISHA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'odisha',
    stateDisplay: 'Odisha',
    topColleges: [
      { name: 'NIT Rourkela, Department of Architecture', city: 'Rourkela', type: 'government' },
      { name: 'College of Engineering and Technology Bhubaneswar (CET)', city: 'Bhubaneswar', type: 'government' },
      { name: 'SOA University, School of Architecture', city: 'Bhubaneswar', type: 'deemed' },
    ],
    examCenters: ['Bhubaneswar', 'Rourkela'],
    keyHighlights: [
      'NIT Rourkela has one of Eastern India\'s best architecture programs',
      'Bhubaneswar is known as the "Temple City" with 700+ ancient temples',
      'Konark Sun Temple is a UNESCO masterpiece of Odishan architecture',
      'Bhubaneswar is one of India\'s smartest planned cities — great for urban studies',
    ],
    description: 'Odisha combines ancient temple architecture with modern smart city planning. Bhubaneswar, the "Temple City" with 700+ ancient temples, and the UNESCO-listed Konark Sun Temple provide extraordinary architectural heritage, while NIT Rourkela leads architecture education in the state.',
    faqs: makeStateFaqs('Odisha', 'NIT Rourkela, CET Bhubaneswar, and SOA University Bhubaneswar'),
  },
  // ═══════════════════════════════════════════════════════════════
  // JHARKHAND
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'jharkhand',
    stateDisplay: 'Jharkhand',
    topColleges: [
      { name: 'Birla Institute of Technology Mesra, Department of Architecture', city: 'Ranchi', type: 'deemed' },
      { name: 'NIT Jamshedpur, Department of Architecture', city: 'Jamshedpur', type: 'government' },
    ],
    examCenters: ['Ranchi', 'Jamshedpur'],
    keyHighlights: [
      'BIT Mesra Ranchi is a well-established architecture school in Eastern India',
      'Jamshedpur (Tata Nagar) is India\'s first planned industrial city — an urban planning milestone',
      'Online coaching helps students overcome limited local coaching options',
      'Growing infrastructure development creating demand for architects in the state',
    ],
    description: 'Jharkhand offers architecture education through BIT Mesra Ranchi, a well-respected institution. Jamshedpur, India\'s first planned industrial city built by the Tata Group, provides unique insights into industrial town planning and modern Indian urbanism.',
    faqs: makeStateFaqs('Jharkhand', 'BIT Mesra Ranchi and NIT Jamshedpur'),
  },

  // ═══════════════════════════════════════════════════════════════
  // ASSAM
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'assam',
    stateDisplay: 'Assam',
    topColleges: [
      { name: 'IIT Guwahati, Department of Design', city: 'Guwahati', type: 'government' },
      { name: 'Assam Engineering College, Architecture Department', city: 'Guwahati', type: 'government' },
      { name: 'Girijananda Chowdhury University, School of Architecture', city: 'Guwahati', type: 'private' },
    ],
    examCenters: ['Guwahati'],
    keyHighlights: [
      'IIT Guwahati offers design programs that complement architecture education',
      'Northeast India\'s bamboo architecture is gaining global recognition',
      'Assam\'s Ahom-era monuments represent a unique architectural heritage',
      'Online coaching is essential for students in remote Northeast locations',
    ],
    description: 'Assam serves as the gateway to Northeast India\'s architecture education. IIT Guwahati and Assam Engineering College anchor the region, while Assam\'s unique Ahom-era architecture and the Northeast\'s globally recognized bamboo construction traditions offer distinctive study opportunities.',
    faqs: makeStateFaqs('Assam', 'IIT Guwahati (Design), Assam Engineering College, and Girijananda Chowdhury University Guwahati'),
  },


  // ═══════════════════════════════════════════════════════════════
  // CHHATTISGARH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'chhattisgarh',
    stateDisplay: 'Chhattisgarh',
    topColleges: [
      { name: 'NIT Raipur, Department of Architecture', city: 'Raipur', type: 'government' },
      { name: 'Rungta College of Architecture', city: 'Bhilai', type: 'private' },
    ],
    examCenters: ['Raipur'],
    keyHighlights: [
      'NIT Raipur offers a respected architecture program in Central India',
      'Raipur is rapidly developing as a smart city with modern infrastructure projects',
      'Online coaching bridges the gap for students in smaller Chhattisgarh towns',
      'Affordable cost of education compared to major metro cities',
    ],
    description: 'Chhattisgarh\'s architecture education is anchored by NIT Raipur. The state\'s rapid smart city development in Raipur and Naya Raipur provides practical exposure to modern urban planning, while online coaching from Neram Classes ensures students get top-quality preparation regardless of location.',
    faqs: makeStateFaqs('Chhattisgarh', 'NIT Raipur and Rungta College of Architecture Bhilai'),
  },

  // ═══════════════════════════════════════════════════════════════
  // UTTARAKHAND
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'uttarakhand',
    stateDisplay: 'Uttarakhand',
    topColleges: [
      { name: 'IIT Roorkee, Department of Architecture and Planning', city: 'Roorkee', type: 'government' },
      { name: 'Graphic Era University, School of Architecture', city: 'Dehradun', type: 'private' },
    ],
    examCenters: ['Dehradun', 'Roorkee'],
    keyHighlights: [
      'IIT Roorkee is India\'s oldest technical institution (est. 1847) with a top-ranked architecture dept',
      'Hill station architecture and disaster-resilient building design are unique study areas',
      'Proximity to Chandigarh for Le Corbusier\'s architecture study tours',
      'Dehradun\'s pleasant climate and affordable living attract architecture students',
    ],
    description: 'Uttarakhand is home to IIT Roorkee, India\'s oldest technical institution (established 1847) with a nationally top-ranked architecture department. The state offers unique learning in hill station architecture, seismic-resilient design, and mountain urbanism.',
    faqs: makeStateFaqs('Uttarakhand', 'IIT Roorkee (India\'s oldest technical institution) and Graphic Era University Dehradun'),
  },

  // ═══════════════════════════════════════════════════════════════
  // CHANDIGARH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'chandigarh',
    stateDisplay: 'Chandigarh',
    topColleges: [
      { name: 'Chandigarh College of Architecture (CCA)', city: 'Chandigarh', type: 'government' },
      { name: 'Punjab Engineering College, Architecture Department', city: 'Chandigarh', type: 'government' },
    ],
    examCenters: ['Chandigarh'],
    keyHighlights: [
      'Chandigarh IS Le Corbusier\'s masterpiece — the city itself is an architecture textbook',
      'CCA Chandigarh is one of India\'s most sought-after government architecture colleges',
      'Capitol Complex is a UNESCO World Heritage Site and modernist architecture landmark',
      'Students live and study inside the world\'s most famous planned city',
    ],
    description: 'Chandigarh is the ultimate city for architecture students — designed by Le Corbusier, it is a living textbook of modernist urban planning. CCA Chandigarh is one of India\'s most prestigious government architecture colleges, and the UNESCO-listed Capitol Complex is right at students\' doorstep.',
    faqs: makeStateFaqs('Chandigarh', 'Chandigarh College of Architecture (CCA) and Punjab Engineering College Chandigarh'),
  },

  // ═══════════════════════════════════════════════════════════════
  // PUDUCHERRY
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'puducherry',
    stateDisplay: 'Puducherry',
    topColleges: [
      { name: 'Pondicherry University, Department of Architecture', city: 'Pondicherry', type: 'government' },
      { name: 'Periyar Maniammai Institute of Science and Technology', city: 'Thanjavur', type: 'deemed' },
    ],
    examCenters: ['Pondicherry'],
    keyHighlights: [
      'Pondicherry\'s French colonial architecture and Auroville experimental township are globally unique',
      'Auroville is a UNESCO-supported experimental city showcasing futuristic architecture',
      'Compact coastal city with Tamil and French architectural influences',
      'Close to Chennai and South Tamil Nadu for additional architecture exposure',
    ],
    description: 'Puducherry offers a uniquely multicultural architectural experience, blending French colonial heritage with Tamil traditions. Auroville, the UNESCO-supported experimental township, is a globally recognized model for sustainable and futuristic community design — an extraordinary resource for architecture students.',
    faqs: makeStateFaqs('Puducherry', 'Pondicherry University and nearby Anna University Chennai and NIT Trichy'),
  },
];

export function getStateSeoContent(stateSlug: string): StateSeoContent | undefined {
  return stateSeoContent.find((s) => s.state === stateSlug);
}
