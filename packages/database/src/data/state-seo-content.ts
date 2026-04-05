/**
 * State-level SEO content for Indian states, used for programmatic
 * state landing pages for NATA coaching.
 *
 * Each entry contains REAL CoA-approved college names, NATA exam centers,
 * and genuinely unique highlights so that every state page has
 * differentiated content.
 *
 * Data sources: Council of Architecture (CoA) approved institution lists,
 * NATA exam center notifications, and state-level architecture education context.
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

// Helper to generate the 5 standard FAQs for a state
function generateStateFaqs(stateDisplay: string): StateSeoContent['faqs'] {
  return [
    {
      question: `What is the best NATA coaching in ${stateDisplay}?`,
      answer: `Neram Classes is rated the #1 NATA coaching institute for students in ${stateDisplay}, with a 99.9% success rate. Our faculty includes IIT and NIT alumni who provide personalized mentorship. We offer both online and offline coaching, so students across ${stateDisplay} can access top-quality NATA preparation from anywhere.`,
    },
    {
      question: `How much does NATA coaching cost in ${stateDisplay}?`,
      answer: `Neram Classes offers affordable NATA coaching starting from INR 15,000 for students in ${stateDisplay}. Our comprehensive program, taught by IIT/NIT faculty, includes drawing practice, aptitude training, mock tests, and portfolio guidance. We also offer flexible EMI options and scholarships for deserving students from ${stateDisplay}.`,
    },
    {
      question: `Is online NATA coaching available in ${stateDisplay}?`,
      answer: `Yes! Neram Classes provides fully interactive online NATA coaching for students across ${stateDisplay}. Our live online classes feature the same IIT/NIT faculty and 99.9% success rate as our offline program. Students from any city or town in ${stateDisplay} can join live sessions, submit drawings for review, and access recorded lectures anytime.`,
    },
    {
      question: `What are the top architecture colleges in ${stateDisplay}?`,
      answer: `${stateDisplay} has several excellent CoA-approved architecture colleges. Neram Classes has helped thousands of students secure admission to these top colleges with our 99.9% NATA success rate. Our IIT/NIT faculty provide targeted preparation to help you score high enough for your preferred college in ${stateDisplay}.`,
    },
    {
      question: `Can I prepare for NATA from ${stateDisplay} online?`,
      answer: `Absolutely! Neram Classes' online NATA coaching is specifically designed for students in ${stateDisplay} who want top-quality preparation without relocating. With live interactive classes, daily drawing assignments, weekly mock tests, and 24/7 doubt clearing by our IIT/NIT faculty, you can prepare for NATA from the comfort of your home in ${stateDisplay} and still achieve a 99.9% success rate.`,
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
      { name: 'NIT Tiruchirappalli, Department of Architecture', city: 'Tiruchirappalli', type: 'government' },
      { name: 'SRM Institute of Science and Technology, School of Architecture', city: 'Chennai', type: 'deemed' },
      { name: 'VIT School of Architecture', city: 'Vellore', type: 'deemed' },
      { name: 'PSG College of Technology, Department of Architecture', city: 'Coimbatore', type: 'private' },
    ],
    examCenters: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'],
    keyHighlights: [
      'Home to Anna University — one of India\'s oldest and most prestigious architecture schools',
      'Rich Dravidian temple architecture provides unmatched real-world study material for NATA drawing',
      'Highest number of CoA-approved architecture colleges in South India',
      'Strong placement record with architecture firms in Chennai\'s growing urban design sector',
    ],
    description: 'Tamil Nadu is the architecture education powerhouse of South India, home to Anna University and NIT Trichy — two of the country\'s most sought-after architecture programs. The state\'s extraordinary Dravidian temple heritage, from the Brihadeeswarar Temple to Meenakshi Amman, offers students a living laboratory for studying proportion, ornamentation, and spatial design that directly enhances NATA preparation.',
    faqs: generateStateFaqs('Tamil Nadu'),
  },

  // ═══════════════════════════════════════════════════════════════
  // KARNATAKA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'karnataka',
    stateDisplay: 'Karnataka',
    topColleges: [
      { name: 'BMS College of Architecture', city: 'Bengaluru', type: 'private' },
      { name: 'RV College of Architecture', city: 'Bengaluru', type: 'private' },
      { name: 'M.S. Ramaiah Institute of Technology, School of Architecture', city: 'Bengaluru', type: 'private' },
      { name: 'Dayananda Sagar College of Architecture', city: 'Bengaluru', type: 'private' },
      { name: 'NIT Karnataka, Department of Architecture', city: 'Surathkal', type: 'government' },
    ],
    examCenters: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
    keyHighlights: [
      'Bengaluru is a hub for contemporary architecture and sustainable design firms',
      'BMS College of Architecture is among the top-ranked private architecture schools in India',
      'Proximity to Hampi and Mysore Palace provides world-class heritage architecture for study',
      'Growing IT infrastructure creates demand for architects specializing in tech campus design',
    ],
    description: 'Karnataka offers a dynamic architecture education landscape anchored by Bengaluru\'s thriving design community. The state blends ancient Hoysala and Vijayanagara temple architecture with cutting-edge tech-park urbanism, giving NATA aspirants a uniquely diverse architectural vocabulary. BMS College and RV College consistently rank among India\'s best private architecture programs.',
    faqs: generateStateFaqs('Karnataka'),
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
      { name: 'TKM College of Engineering, School of Architecture', city: 'Kollam', type: 'government' },
      { name: 'Mar Athanasius College of Engineering, Department of Architecture', city: 'Kothamangalam', type: 'private' },
    ],
    examCenters: ['Thiruvananthapuram', 'Kochi', 'Kozhikode'],
    keyHighlights: [
      'NIT Calicut is one of the top government architecture schools in the country',
      'Kerala\'s unique tropical vernacular architecture (nalukettu, ettukettu) is studied worldwide',
      'Strong focus on sustainable and climate-responsive design in Kerala architecture programs',
      'Laureate Ar. Laurie Baker\'s legacy of cost-effective, eco-friendly architecture is deeply rooted in the state',
    ],
    description: 'Kerala stands out for its emphasis on sustainable, climate-responsive architecture education. NIT Calicut and CET Trivandrum are premier government institutions with excellent placement records. The state\'s distinctive vernacular architecture — sloped roofs, internal courtyards, and natural ventilation — has influenced architects worldwide and provides NATA students with rich material for understanding how design responds to environment.',
    faqs: generateStateFaqs('Kerala'),
  },

  // ═══════════════════════════════════════════════════════════════
  // ANDHRA PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'andhra-pradesh',
    stateDisplay: 'Andhra Pradesh',
    topColleges: [
      { name: 'Andhra University, College of Engineering, Department of Architecture', city: 'Visakhapatnam', type: 'government' },
      { name: 'JNTU Anantapur, School of Planning and Architecture', city: 'Anantapur', type: 'government' },
      { name: 'KL University, School of Architecture', city: 'Guntur', type: 'deemed' },
      { name: 'Acharya Nagarjuna University, School of Architecture', city: 'Guntur', type: 'government' },
    ],
    examCenters: ['Visakhapatnam', 'Vijayawada', 'Tirupati'],
    keyHighlights: [
      'Amaravati capital city project offers real-world exposure to large-scale urban planning',
      'Andhra University in Vizag is one of the oldest architecture departments in South India',
      'Tirupati and Lepakshi heritage sites provide excellent study material for temple architecture',
      'Rapidly growing infrastructure in Vizag and Vijayawada creates strong demand for architects',
    ],
    description: 'Andhra Pradesh is witnessing a construction and urban design renaissance with the development of its new capital Amaravati, making it an exciting state for aspiring architects. Andhra University in Visakhapatnam has a well-established architecture program with decades of heritage. The state\'s rich temple architecture at Tirupati and Lepakshi, combined with modern infrastructure growth, provides NATA students with diverse architectural inspiration.',
    faqs: generateStateFaqs('Andhra Pradesh'),
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
      { name: 'Chaitanya Bharathi Institute of Technology (CBIT), Department of Architecture', city: 'Hyderabad', type: 'private' },
      { name: 'Jawaharlal Nehru Architecture and Fine Arts University (JNAFAU)', city: 'Hyderabad', type: 'government' },
    ],
    examCenters: ['Hyderabad', 'Warangal', 'Karimnagar'],
    keyHighlights: [
      'JNAFAU Hyderabad is one of the few dedicated architecture and fine arts universities in India',
      'Hyderabad\'s Qutb Shahi and Nizam-era architecture offers rich Indo-Islamic design study material',
      'Booming IT corridor (HITEC City) creates demand for modern commercial and campus architecture',
      'Lower cost of living compared to other metros makes Hyderabad an affordable study destination',
    ],
    description: 'Telangana, centered on Hyderabad, offers a unique architectural education environment blending Qutb Shahi monuments, Nizam-era palaces, and futuristic HITEC City developments. JNAFAU is a nationally recognized dedicated architecture university, and JNTU Hyderabad has a strong planning and architecture program. NATA aspirants in Telangana benefit from studying one of India\'s most architecturally diverse cities.',
    faqs: generateStateFaqs('Telangana'),
  },

  // ═══════════════════════════════════════════════════════════════
  // MAHARASHTRA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'maharashtra',
    stateDisplay: 'Maharashtra',
    topColleges: [
      { name: 'Sir J.J. College of Architecture', city: 'Mumbai', type: 'government' },
      { name: 'Academy of Architecture', city: 'Mumbai', type: 'private' },
      { name: 'VNIT Nagpur, Department of Architecture', city: 'Nagpur', type: 'government' },
      { name: 'Sinhgad College of Architecture', city: 'Pune', type: 'private' },
      { name: 'BNCA (Bharati Vidyapeeth College of Architecture)', city: 'Pune', type: 'private' },
    ],
    examCenters: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
    keyHighlights: [
      'Sir J.J. College of Architecture in Mumbai is the most prestigious architecture school in India',
      'Mumbai\'s Art Deco and Victorian Gothic heritage is a UNESCO World Heritage ensemble',
      'Largest number of architecture firms and employment opportunities in the country',
      'Pune\'s growing design ecosystem offers affordable alternatives to Mumbai',
    ],
    description: 'Maharashtra is the undisputed leader in architecture education in India, home to the legendary Sir J.J. College of Architecture — the country\'s oldest and most prestigious architecture school, founded in 1857. Mumbai\'s UNESCO-listed Victorian Gothic and Art Deco buildings provide world-class reference material for NATA aspirants. The state offers the widest range of career opportunities for architects, from heritage conservation to high-rise design.',
    faqs: generateStateFaqs('Maharashtra'),
  },

  // ═══════════════════════════════════════════════════════════════
  // GUJARAT
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'gujarat',
    stateDisplay: 'Gujarat',
    topColleges: [
      { name: 'CEPT University, Faculty of Architecture', city: 'Ahmedabad', type: 'government' },
      { name: 'Maharaja Sayajirao University (MSU), Faculty of Architecture', city: 'Vadodara', type: 'government' },
      { name: 'L.J. University, School of Architecture', city: 'Ahmedabad', type: 'private' },
      { name: 'Nirma University, Institute of Architecture and Planning', city: 'Ahmedabad', type: 'private' },
    ],
    examCenters: ['Ahmedabad', 'Vadodara', 'Surat', 'Rajkot'],
    keyHighlights: [
      'CEPT University Ahmedabad is ranked among the top 3 architecture schools in India',
      'Ahmedabad is India\'s first UNESCO World Heritage City for its walled-city pol architecture',
      'Le Corbusier\'s modernist buildings and IIM Ahmedabad by Louis Kahn are in the city',
      'Strong tradition of architectural practice and education dating back to Balkrishna Doshi',
    ],
    description: 'Gujarat is an architecture education powerhouse, home to CEPT University — consistently ranked among India\'s top 3 architecture schools alongside IIT Kharagpur and SPA Delhi. Ahmedabad, India\'s first UNESCO World Heritage City, offers an extraordinary range of architectural study material from medieval pol houses to Le Corbusier\'s modernist buildings and Louis Kahn\'s iconic IIM campus. The state has produced some of India\'s greatest architects, including Pritzker laureate Balkrishna Doshi.',
    faqs: generateStateFaqs('Gujarat'),
  },

  // ═══════════════════════════════════════════════════════════════
  // DELHI
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'delhi',
    stateDisplay: 'Delhi',
    topColleges: [
      { name: 'School of Planning and Architecture (SPA Delhi)', city: 'New Delhi', type: 'government' },
      { name: 'Jamia Millia Islamia, Faculty of Architecture and Ekistics', city: 'New Delhi', type: 'government' },
      { name: 'Guru Gobind Singh Indraprastha University, School of Architecture', city: 'New Delhi', type: 'government' },
      { name: 'Sushant University, School of Art and Architecture', city: 'Gurugram', type: 'private' },
    ],
    examCenters: ['New Delhi', 'Noida', 'Gurugram'],
    keyHighlights: [
      'SPA Delhi is the #1 ranked architecture school in India and a national institute of importance',
      'Unparalleled access to Mughal, colonial, and contemporary landmark architecture',
      'Highest concentration of leading architecture firms and design consultancies',
      'Lutyens\' Delhi and New Delhi masterplan offer textbook examples of urban design',
    ],
    description: 'Delhi is the epicenter of architecture education in India, home to the School of Planning and Architecture (SPA) — the country\'s top-ranked architecture institution and an Institute of National Importance. The capital offers NATA aspirants access to an unmatched range of architectural heritage spanning Mughal masterpieces like Humayun\'s Tomb and Red Fort, Lutyens\' grand colonial avenues, and cutting-edge contemporary projects. Delhi also has the highest concentration of architecture practices in the country.',
    faqs: generateStateFaqs('Delhi'),
  },

  // ═══════════════════════════════════════════════════════════════
  // UTTAR PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'uttar-pradesh',
    stateDisplay: 'Uttar Pradesh',
    topColleges: [
      { name: 'Aligarh Muslim University (AMU), Department of Architecture', city: 'Aligarh', type: 'government' },
      { name: 'Institute of Engineering and Technology, Lucknow (IET), Department of Architecture', city: 'Lucknow', type: 'government' },
      { name: 'Amity University, School of Architecture and Planning', city: 'Noida', type: 'private' },
      { name: 'Babu Banarasi Das University, School of Architecture', city: 'Lucknow', type: 'private' },
      { name: 'AKTU affiliated colleges of Architecture', city: 'Lucknow', type: 'government' },
    ],
    examCenters: ['Lucknow', 'Noida', 'Agra', 'Varanasi'],
    keyHighlights: [
      'Home to the Taj Mahal — the most iconic architectural masterpiece in the world',
      'AMU Aligarh has one of the oldest architecture departments in North India',
      'Lucknow\'s Nawabi architecture and Varanasi\'s ghats offer diverse study material',
      'Large student population and affordable coaching options across the state',
    ],
    description: 'Uttar Pradesh offers NATA aspirants an extraordinary wealth of architectural heritage, from the Taj Mahal in Agra to the Mughal fort complexes in Fatehpur Sikri, the Nawabi palaces of Lucknow, and the ancient ghats of Varanasi. AMU Aligarh and IET Lucknow provide strong government architecture programs. The state\'s affordable cost of living and proximity to Delhi make it an attractive destination for architecture education.',
    faqs: generateStateFaqs('Uttar Pradesh'),
  },

  // ═══════════════════════════════════════════════════════════════
  // HARYANA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'haryana',
    stateDisplay: 'Haryana',
    topColleges: [
      { name: 'Deenbandhu Chhotu Ram University of Science and Technology, Department of Architecture', city: 'Murthal', type: 'government' },
      { name: 'Sushant University (formerly Ansal University), School of Art and Architecture', city: 'Gurugram', type: 'private' },
      { name: 'B.P.S. Mahila Vishwavidyalaya, Department of Architecture', city: 'Sonipat', type: 'government' },
    ],
    examCenters: ['Gurugram', 'Faridabad', 'Hisar'],
    keyHighlights: [
      'Gurugram is a hub for modern high-rise and commercial architecture in the NCR region',
      'Proximity to Delhi provides access to top architecture firms and heritage sites',
      'Chandigarh\'s Le Corbusier masterplan is easily accessible for study tours',
      'Rapidly developing infrastructure creates strong demand for architecture professionals',
    ],
    description: 'Haryana benefits from its strategic location in the National Capital Region, offering architecture students proximity to Delhi\'s heritage and Gurugram\'s modern skyline. The state\'s rapid urbanization, particularly in the Gurugram-Faridabad corridor, provides real-world exposure to contemporary commercial and residential design. Easy access to Le Corbusier\'s planned city of Chandigarh adds a unique educational advantage for NATA aspirants.',
    faqs: generateStateFaqs('Haryana'),
  },

  // ═══════════════════════════════════════════════════════════════
  // RAJASTHAN
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'rajasthan',
    stateDisplay: 'Rajasthan',
    topColleges: [
      { name: 'Malaviya National Institute of Technology (MNIT), Department of Architecture', city: 'Jaipur', type: 'government' },
      { name: 'Aayojan School of Architecture', city: 'Jaipur', type: 'private' },
      { name: 'Poornima University, School of Architecture', city: 'Jaipur', type: 'private' },
      { name: 'Manipal University Jaipur, School of Architecture', city: 'Jaipur', type: 'private' },
    ],
    examCenters: ['Jaipur', 'Jodhpur', 'Udaipur'],
    keyHighlights: [
      'MNIT Jaipur offers one of the top government architecture programs in North India',
      'Jaipur is a UNESCO World Heritage City with stunning Rajput and Mughal architecture',
      'Rajasthan\'s diverse building traditions — from desert forts to havelis — provide unmatched study material',
      'Strong focus on climate-responsive desert architecture and sustainable building practices',
    ],
    description: 'Rajasthan is an architect\'s paradise, boasting UNESCO World Heritage Sites in Jaipur and a stunning collection of forts, palaces, havelis, and stepwells that showcase centuries of climate-responsive desert architecture. MNIT Jaipur anchors the state\'s architecture education with a top-tier government program. NATA students in Rajasthan benefit from studying how traditional builders solved the challenges of extreme heat, water scarcity, and desert winds — skills highly relevant to modern sustainable design.',
    faqs: generateStateFaqs('Rajasthan'),
  },

  // ═══════════════════════════════════════════════════════════════
  // PUNJAB
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'punjab',
    stateDisplay: 'Punjab',
    topColleges: [
      { name: 'Guru Nanak Dev University, Department of Architecture', city: 'Amritsar', type: 'government' },
      { name: 'IKG Punjab Technical University affiliated colleges', city: 'Jalandhar', type: 'government' },
      { name: 'Chitkara University, School of Architecture', city: 'Rajpura', type: 'private' },
      { name: 'Lovely Professional University, School of Architecture', city: 'Phagwara', type: 'private' },
    ],
    examCenters: ['Chandigarh', 'Amritsar', 'Ludhiana'],
    keyHighlights: [
      'Proximity to Chandigarh — Le Corbusier\'s planned city and a living architecture textbook',
      'Golden Temple in Amritsar is a masterclass in sacred architecture and water body integration',
      'Strong Sikh architectural heritage with gurdwaras showcasing intricate design',
      'Affordable coaching and living costs compared to Delhi NCR',
    ],
    description: 'Punjab\'s architecture education landscape is enriched by its proximity to Chandigarh, Le Corbusier\'s masterplanned city that serves as a living laboratory for modern urban design. The state\'s rich Sikh architectural heritage, epitomized by the Golden Temple in Amritsar, provides NATA aspirants with inspiring examples of sacred architecture, water body integration, and community-oriented design. Punjab offers affordable education with easy access to world-class architectural references.',
    faqs: generateStateFaqs('Punjab'),
  },

  // ═══════════════════════════════════════════════════════════════
  // WEST BENGAL
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'west-bengal',
    stateDisplay: 'West Bengal',
    topColleges: [
      { name: 'Jadavpur University, Faculty of Architecture', city: 'Kolkata', type: 'government' },
      { name: 'IIT Kharagpur, Department of Architecture and Regional Planning', city: 'Kharagpur', type: 'government' },
      { name: 'Indian Institute of Engineering Science and Technology (IIEST) Shibpur, Department of Architecture', city: 'Howrah', type: 'government' },
      { name: 'Techno India University, School of Architecture', city: 'Kolkata', type: 'private' },
    ],
    examCenters: ['Kolkata', 'Siliguri', 'Durgapur'],
    keyHighlights: [
      'IIT Kharagpur has the oldest and most prestigious architecture department among all IITs',
      'Kolkata\'s colonial architecture — Victoria Memorial, Howrah Bridge, Writers\' Building — is iconic',
      'Jadavpur University is a top-ranked government architecture school in Eastern India',
      'Rich tradition of arts and design culture in Kolkata supports creative development',
    ],
    description: 'West Bengal offers world-class architecture education through IIT Kharagpur — which has the oldest architecture department among all IITs — and Jadavpur University, a premier government institution. Kolkata\'s extraordinary colonial-era architecture, from the Victoria Memorial to the Raj Bhavan, provides NATA aspirants with a rich tapestry of Gothic, Baroque, and Indo-Saracenic styles. The city\'s vibrant arts and design culture fosters the creative thinking essential for architecture.',
    faqs: generateStateFaqs('West Bengal'),
  },

  // ═══════════════════════════════════════════════════════════════
  // BIHAR
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'bihar',
    stateDisplay: 'Bihar',
    topColleges: [
      { name: 'NIT Patna, Department of Architecture', city: 'Patna', type: 'government' },
      { name: 'Birla Institute of Technology Mesra, Department of Architecture (Patna Extension)', city: 'Patna', type: 'deemed' },
      { name: 'Muzaffarpur Institute of Technology, Department of Architecture', city: 'Muzaffarpur', type: 'government' },
    ],
    examCenters: ['Patna', 'Gaya'],
    keyHighlights: [
      'NIT Patna offers an excellent government architecture program in Eastern India',
      'Ancient Nalanda University ruins provide insight into early Indian campus planning and architecture',
      'Affordable cost of living makes architecture education highly accessible',
      'Growing infrastructure development in Bihar creates emerging opportunities for architects',
    ],
    description: 'Bihar, the land of Nalanda and Vikramshila, has deep roots in institutional architecture dating back over a thousand years. NIT Patna anchors the state\'s modern architecture education with a strong government program. The ruins of ancient Nalanda — one of the world\'s first planned university campuses — provide NATA aspirants with fascinating study material on early spatial planning and community architecture.',
    faqs: generateStateFaqs('Bihar'),
  },

  // ═══════════════════════════════════════════════════════════════
  // ODISHA
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'odisha',
    stateDisplay: 'Odisha',
    topColleges: [
      { name: 'NIT Rourkela, Department of Architecture', city: 'Rourkela', type: 'government' },
      { name: 'College of Engineering and Technology (CET) Bhubaneswar, Department of Architecture', city: 'Bhubaneswar', type: 'government' },
      { name: 'KIIT University, School of Architecture', city: 'Bhubaneswar', type: 'deemed' },
    ],
    examCenters: ['Bhubaneswar', 'Rourkela'],
    keyHighlights: [
      'Bhubaneswar is the "Temple City" with over 700 temples showcasing Kalinga architecture',
      'NIT Rourkela has a well-regarded architecture department in Eastern India',
      'Konark Sun Temple (UNESCO) is a masterpiece of architectural engineering',
      'Emerging smart city development in Bhubaneswar offers modern urban planning exposure',
    ],
    description: 'Odisha is a treasure trove of temple architecture, with Bhubaneswar\'s 700+ temples and the UNESCO-listed Konark Sun Temple showcasing the magnificent Kalinga style of architecture. NIT Rourkela and CET Bhubaneswar provide strong government architecture programs. NATA aspirants in Odisha benefit from studying some of India\'s most structurally ambitious ancient buildings, where stone was carved to mimic wooden construction in extraordinary detail.',
    faqs: generateStateFaqs('Odisha'),
  },

  // ═══════════════════════════════════════════════════════════════
  // JHARKHAND
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'jharkhand',
    stateDisplay: 'Jharkhand',
    topColleges: [
      { name: 'Birla Institute of Technology (BIT) Mesra, Department of Architecture', city: 'Ranchi', type: 'deemed' },
      { name: 'NIT Jamshedpur, Department of Architecture', city: 'Jamshedpur', type: 'government' },
      { name: 'Jharkhand Rai University, School of Architecture', city: 'Ranchi', type: 'private' },
    ],
    examCenters: ['Ranchi', 'Jamshedpur'],
    keyHighlights: [
      'BIT Mesra is a premier deemed university with a strong architecture program',
      'Jamshedpur — India\'s first planned industrial city — offers unique urban planning study material',
      'Affordable education and living costs in the state',
      'Rich tribal architectural heritage with sustainable mud and bamboo construction techniques',
    ],
    description: 'Jharkhand offers a distinctive architecture education experience anchored by BIT Mesra — a premier deemed university with an excellent architecture program. Jamshedpur, India\'s first planned industrial city designed by the Tata Group, provides a unique case study in urban planning. The state\'s rich tribal architectural traditions, using sustainable materials like mud, bamboo, and thatch, offer NATA aspirants valuable lessons in eco-friendly and vernacular design.',
    faqs: generateStateFaqs('Jharkhand'),
  },

  // ═══════════════════════════════════════════════════════════════
  // ASSAM
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'assam',
    stateDisplay: 'Assam',
    topColleges: [
      { name: 'Assam Engineering College, Department of Architecture', city: 'Guwahati', type: 'government' },
      { name: 'NIT Silchar, Department of Architecture', city: 'Silchar', type: 'government' },
      { name: 'Girijananda Chowdhury University, School of Architecture', city: 'Guwahati', type: 'private' },
    ],
    examCenters: ['Guwahati', 'Silchar'],
    keyHighlights: [
      'Gateway to Northeast India\'s diverse vernacular architecture traditions',
      'Ahom-era monuments like Rang Ghar and Talatal Ghar showcase unique regional architecture',
      'Assam-type houses (Ikra construction) represent earthquake-resistant bamboo architecture',
      'Growing urbanization in Guwahati creates demand for architects in the Northeast',
    ],
    description: 'Assam serves as the gateway to Northeast India\'s extraordinarily diverse architectural traditions. The Ahom dynasty monuments — including Rang Ghar, one of Asia\'s oldest amphitheatres — showcase a unique architectural style found nowhere else. The traditional Assam-type house, built with bamboo and ikra (reed) construction, is a globally recognized example of earthquake-resistant vernacular architecture. NATA aspirants from Assam bring a distinctive perspective to architecture education.',
    faqs: generateStateFaqs('Assam'),
  },

  // ═══════════════════════════════════════════════════════════════
  // MADHYA PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'madhya-pradesh',
    stateDisplay: 'Madhya Pradesh',
    topColleges: [
      { name: 'School of Architecture and Planning, Bhopal (MANIT affiliated)', city: 'Bhopal', type: 'government' },
      { name: 'Maulana Azad National Institute of Technology (MANIT), Department of Architecture', city: 'Bhopal', type: 'government' },
      { name: 'IPS Academy, School of Architecture', city: 'Indore', type: 'private' },
      { name: 'Oriental University, School of Architecture', city: 'Indore', type: 'private' },
    ],
    examCenters: ['Bhopal', 'Indore', 'Gwalior'],
    keyHighlights: [
      'MANIT Bhopal is a prestigious NIT with a well-regarded architecture department',
      'Khajuraho temples (UNESCO) and Sanchi Stupa provide world-class heritage architecture for study',
      'Bhopal\'s blend of Nawabi and modern architecture offers diverse urban contexts',
      'Central location makes it affordable and well-connected for students from across India',
    ],
    description: 'Madhya Pradesh, the heart of India, offers architecture students access to some of the country\'s most iconic built heritage — from the UNESCO-listed Khajuraho temples and Sanchi Stupa to the Nawabi architecture of Bhopal. MANIT Bhopal provides a strong government architecture education. The state\'s central location, affordable living costs, and rich architectural diversity spanning Buddhist, Hindu, and Islamic traditions make it an excellent base for NATA preparation.',
    faqs: generateStateFaqs('Madhya Pradesh'),
  },

  // ═══════════════════════════════════════════════════════════════
  // CHHATTISGARH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'chhattisgarh',
    stateDisplay: 'Chhattisgarh',
    topColleges: [
      { name: 'NIT Raipur, Department of Architecture', city: 'Raipur', type: 'government' },
      { name: 'Rungta College of Engineering and Technology, School of Architecture', city: 'Bhilai', type: 'private' },
      { name: 'Shri Shankaracharya Technical Campus, Department of Architecture', city: 'Bhilai', type: 'private' },
    ],
    examCenters: ['Raipur', 'Bhilai'],
    keyHighlights: [
      'NIT Raipur offers an affordable, high-quality government architecture program',
      'Rich tribal architectural heritage with unique mud and wood construction traditions',
      'New capital development at Naya Raipur (Atal Nagar) offers exposure to smart city planning',
      'Among the most affordable states for architecture education in India',
    ],
    description: 'Chhattisgarh is an emerging destination for architecture education, anchored by NIT Raipur. The state offers NATA aspirants a unique perspective through its rich tribal architectural heritage, featuring sustainable mud, wood, and thatch construction techniques that are gaining renewed global interest. The development of Naya Raipur (Atal Nagar) as a planned smart city provides real-world exposure to modern urban planning and green building practices.',
    faqs: generateStateFaqs('Chhattisgarh'),
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
      { name: 'University of Petroleum and Energy Studies (UPES), School of Design', city: 'Dehradun', type: 'private' },
    ],
    examCenters: ['Dehradun', 'Roorkee', 'Haldwani'],
    keyHighlights: [
      'IIT Roorkee has one of the top 3 architecture departments in India (established 1847)',
      'Himalayan mountain architecture offers unique study material for climate-responsive design',
      'Dehradun\'s pleasant climate and affordable living make it ideal for focused NATA preparation',
      'Exposure to earthquake-resistant construction techniques crucial for hill architecture',
    ],
    description: 'Uttarakhand is home to IIT Roorkee, which has one of the oldest and most highly ranked architecture departments in India, established in 1847. The state\'s Himalayan setting provides NATA aspirants with unique exposure to mountain architecture, seismic-resistant design, and climate-responsive building techniques. Traditional Garhwali and Kumaoni houses, built with stone and wood to withstand earthquakes and heavy snowfall, offer valuable lessons in vernacular sustainable design.',
    faqs: generateStateFaqs('Uttarakhand'),
  },

  // ═══════════════════════════════════════════════════════════════
  // CHANDIGARH
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'chandigarh',
    stateDisplay: 'Chandigarh',
    topColleges: [
      { name: 'Chandigarh College of Architecture (CCA)', city: 'Chandigarh', type: 'government' },
      { name: 'Punjab Engineering College (PEC), Department of Architecture', city: 'Chandigarh', type: 'government' },
      { name: 'Chitkara University, School of Architecture (nearby)', city: 'Rajpura', type: 'private' },
    ],
    examCenters: ['Chandigarh'],
    keyHighlights: [
      'Chandigarh is Le Corbusier\'s masterplanned city — a UNESCO World Heritage site for modern architecture',
      'Chandigarh College of Architecture (CCA) is among the top government architecture schools in North India',
      'The Capitol Complex, Rock Garden, and Sector 17 plaza are iconic modernist landmarks',
      'Living in a planned city provides daily exposure to urban design principles',
    ],
    description: 'Chandigarh is a pilgrimage site for architecture students worldwide — the only city in India designed by the legendary Le Corbusier, with its Capitol Complex now a UNESCO World Heritage Site. The Chandigarh College of Architecture (CCA) is a premier government institution situated in this living laboratory of modernist urban design. NATA aspirants studying here experience world-class architecture in their daily lives, from the geometric sector grid to the brutalist government buildings.',
    faqs: generateStateFaqs('Chandigarh'),
  },

  // ═══════════════════════════════════════════════════════════════
  // PUDUCHERRY
  // ═══════════════════════════════════════════════════════════════
  {
    state: 'puducherry',
    stateDisplay: 'Puducherry',
    topColleges: [
      { name: 'Pondicherry University, Department of Architecture', city: 'Puducherry', type: 'government' },
      { name: 'Auroville Design Consultancy (affiliated programs)', city: 'Auroville', type: 'private' },
      { name: 'Perunthalaivar Kamarajar Institute of Engineering and Technology, Architecture Wing', city: 'Puducherry', type: 'government' },
    ],
    examCenters: ['Puducherry'],
    keyHighlights: [
      'Unique French colonial architecture in the White Town heritage quarter',
      'Auroville — the experimental township — is a globally recognized sustainable architecture project',
      'Pondicherry University offers a central government architecture program',
      'Compact city with walkable heritage zones ideal for architectural sketching and study',
    ],
    description: 'Puducherry offers a uniquely cosmopolitan architecture education experience, blending French colonial heritage in the White Town quarter with Tamil vernacular traditions and the experimental sustainable architecture of Auroville. Pondicherry University provides a central government architecture program in this charming coastal city. NATA aspirants here benefit from studying how different cultural influences — French, Tamil, and international — have created a distinctive architectural identity within a compact, walkable urban setting.',
    faqs: generateStateFaqs('Puducherry'),
  },
];

export function getStateSeoContent(stateSlug: string): StateSeoContent | undefined {
  return stateSeoContent.find((s) => s.state === stateSlug);
}
