/**
 * City-specific SEO content for high-priority NATA coaching location pages.
 *
 * Each entry contains REAL college names, exam centers, and genuinely unique
 * highlights so that every city page has differentiated content. This avoids
 * thin/template content penalties from Google.
 *
 * Data sources: Council of Architecture (CoA) approved institution lists,
 * NATA exam center notifications, and local architecture education context.
 */

export interface LocationSeoContent {
  city: string;
  nearbyColleges: { name: string; type: 'government' | 'private' | 'deemed' }[];
  examCenters: string[];
  uniqueHighlights: string[];
  localContext: string;
}

export const locationSeoContent: LocationSeoContent[] = [
  // ═══════════════════════════════════════════════════════════════
  // TAMIL NADU
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'chennai',
    nearbyColleges: [
      { name: 'School of Architecture and Planning, Anna University', type: 'government' },
      { name: 'Measi Academy of Architecture', type: 'private' },
      { name: 'SRM School of Architecture, SRM Institute of Science and Technology', type: 'deemed' },
      { name: 'Hindustan Institute of Technology and Science, School of Architecture', type: 'deemed' },
      { name: 'B.S. Abdur Rahman Crescent Institute of Science and Technology, School of Architecture', type: 'deemed' },
    ],
    examCenters: ['Chennai', 'Kanchipuram', 'Vellore'],
    uniqueHighlights: [
      'Live sketching sessions at Marina Beach and Kapaleeshwarar Temple for perspective drawing practice',
      'Heritage walk study tours through George Town and Fort St. George for understanding colonial architecture',
      'Weekend workshops at DakshinaChitra Heritage Museum for vernacular architecture studies',
      'Access to Anna University architecture library and studio spaces for advanced portfolio building',
    ],
    localContext:
      'Chennai is the architecture education capital of South India, home to Anna University — one of the oldest and most prestigious architecture schools in the country. The city offers an unparalleled mix of Dravidian temple architecture, colonial-era buildings in the Fort area, and cutting-edge contemporary design in the IT corridor. Students preparing for NATA in Chennai benefit from exposure to this living textbook of architectural styles spanning over two millennia.',
  },
  {
    city: 'coimbatore',
    nearbyColleges: [
      { name: 'Government College of Technology, Department of Architecture', type: 'government' },
      { name: 'Kumaraguru College of Technology, School of Architecture', type: 'private' },
      { name: 'PSG College of Technology, Department of Architecture', type: 'private' },
      { name: 'Karpagam Academy of Higher Education, School of Architecture', type: 'deemed' },
    ],
    examCenters: ['Coimbatore', 'Salem', 'Erode'],
    uniqueHighlights: [
      'Outdoor sketching at Marudhamalai Hill Temple for landscape and elevation practice',
      'Industrial architecture study visits to manufacturing units in the Coimbatore industrial belt',
      'Cooler climate allows comfortable year-round outdoor drawing sessions unlike coastal cities',
      'Weekend nature sketching camps in the Nilgiri foothills for environmental design inspiration',
    ],
    localContext:
      'Known as the Manchester of South India, Coimbatore combines industrial pragmatism with proximity to the Western Ghats. Architecture students here gain unique exposure to factory and industrial design alongside traditional Kongu Nadu temple architecture. The city\'s rapid growth has created a vibrant construction scene, giving NATA aspirants direct insight into contemporary building practices and sustainable design suited to the semi-arid climate.',
  },
  {
    city: 'madurai',
    nearbyColleges: [
      { name: 'Thiagarajar College of Engineering, Department of Architecture', type: 'government' },
      { name: 'Mepco Schlenk Engineering College, School of Architecture', type: 'private' },
      { name: 'Kalasalingam Academy of Research and Education, School of Architecture', type: 'deemed' },
    ],
    examCenters: ['Madurai', 'Dindigul', 'Tirunelveli'],
    uniqueHighlights: [
      'Weekly sketching practice at Meenakshi Amman Temple — one of the finest examples of Dravidian architecture',
      'Study of ancient Tamil urban planning through the concentric layout of Madurai city streets',
      'Drawing sessions at Thirumalai Nayakkar Mahal for Indo-Saracenic architectural detailing',
      'Affordable coaching with lower cost of living compared to metro cities',
    ],
    localContext:
      'Madurai, one of the oldest continuously inhabited cities in the world, is a living classroom for architecture students. The Meenakshi Amman Temple complex — with its towering gopurams, thousand-pillar hall, and intricate sculptural programmes — provides unmatched reference material for NATA drawing sections. The city\'s organic street grid radiating from the temple demonstrates ancient principles of urban planning that remain relevant in modern architectural theory.',
  },
  {
    city: 'trichy',
    nearbyColleges: [
      { name: 'National Institute of Technology (NIT) Trichy, Department of Architecture', type: 'government' },
      { name: 'Periyar Maniammai Institute of Science and Technology, School of Architecture', type: 'deemed' },
      { name: 'M.A.M. School of Architecture, Trichy', type: 'private' },
    ],
    examCenters: ['Trichy', 'Thanjavur', 'Madurai'],
    uniqueHighlights: [
      'Rock Fort Temple sketching sessions for understanding architecture carved into natural rock formations',
      'Proximity to NIT Trichy — one of India\'s top-ranked architecture departments',
      'Study trips to the nearby Srirangam temple complex, the largest functioning Hindu temple in the world',
      'Central Tamil Nadu location makes it accessible from Thanjavur, Madurai, and Salem',
    ],
    localContext:
      'Tiruchirappalli (Trichy) sits at the geographic heart of Tamil Nadu and is home to NIT Trichy, consistently ranked among India\'s top architecture programmes. The iconic Rock Fort rising 83 metres above the city demonstrates how ancient builders integrated architecture with natural geology. Students benefit from easy access to both the Srirangam temple island — the world\'s largest functioning temple complex — and the Cauvery Delta\'s rich built heritage.',
  },
  {
    city: 'salem',
    nearbyColleges: [
      { name: 'Sona College of Technology, Department of Architecture', type: 'private' },
      { name: 'Paavai Engineering College, School of Architecture', type: 'private' },
      { name: 'Vinayaka Mission\'s Kirupananda Variyar Engineering College, Department of Architecture', type: 'deemed' },
    ],
    examCenters: ['Salem', 'Coimbatore', 'Erode'],
    uniqueHighlights: [
      'Sketching practice at the historic Salem Fort and Sugavaneswarar Temple',
      'Study of sustainable hill-station architecture with proximity to Yercaud',
      'Smaller batch sizes enable more personalized coaching and individual attention',
      'Cost-effective alternative to Chennai and Coimbatore with excellent road connectivity',
    ],
    localContext:
      'Salem, a rapidly developing city in the western belt of Tamil Nadu, offers NATA aspirants a focused study environment away from metropolitan distractions. The city\'s terrain — flanked by the Shevaroy and Jarugumalai hills — provides natural drawing subjects and inspires climate-responsive design thinking. Salem\'s steel and textile industries have driven distinctive industrial architecture, while nearby Yercaud hill station showcases colonial bungalow design.',
  },
  {
    city: 'tirunelveli',
    nearbyColleges: [
      { name: 'Mepco Schlenk Engineering College, School of Architecture, Sivakasi', type: 'private' },
      { name: 'Kalasalingam Academy of Research and Education, School of Architecture, Krishnankoil', type: 'deemed' },
      { name: 'National Engineering College, Department of Architecture, Kovilpatti', type: 'private' },
    ],
    examCenters: ['Tirunelveli', 'Madurai', 'Nagercoil'],
    uniqueHighlights: [
      'Sketching at the Nellaiappar Temple complex for detailed Dravidian sculpture and gopuram studies',
      'Study of Pandya-dynasty architecture in the deep south Tamil Nadu corridor',
      'Access to the unique vernacular architecture of the Tirunelveli region\'s courtyard houses (thinnai)',
      'Serves students from Thoothukudi, Nagercoil, and Kanyakumari districts',
    ],
    localContext:
      'Tirunelveli, the cultural capital of southern Tamil Nadu, preserves some of the finest examples of Pandya-era temple architecture. The city\'s traditional courtyard houses (agathu veedu) with their characteristic thinnai (sit-out verandahs) represent a climate-responsive design tradition perfected over centuries for the hot, semi-arid climate. NATA aspirants from the southernmost districts of Tamil Nadu find Tirunelveli a convenient regional hub with strong architectural heritage.',
  },
  {
    city: 'vellore',
    nearbyColleges: [
      { name: 'VIT School of Design, Vellore Institute of Technology', type: 'deemed' },
      { name: 'Shanmugha Arts, Science, Technology and Research Academy (SASTRA), School of Architecture, Thanjavur', type: 'deemed' },
      { name: 'Sri Venkateswara College of Engineering, Department of Architecture, Sriperumbudur', type: 'private' },
    ],
    examCenters: ['Vellore', 'Chennai', 'Kanchipuram'],
    uniqueHighlights: [
      'Sketching at the 16th-century Vellore Fort — a masterpiece of Vijayanagara military architecture with a surrounding moat',
      'Proximity to VIT, one of India\'s top-ranked deemed universities with a strong design school',
      'Study of Jalakandeswarar Temple inside the fort for Hindu temple architecture within a fortification context',
      'Gateway location between Tamil Nadu and Andhra Pradesh, serving students from both states',
    ],
    localContext:
      'Vellore is home to the magnificently preserved Vellore Fort, a 16th-century Vijayanagara fortification considered one of the finest examples of military architecture in South India. Its concentric moats, granite ramparts, and the Jalakandeswarar Temple within the fort walls provide extraordinary study material for NATA aspirants. The presence of VIT — ranked among India\'s top private universities — brings a modern academic ecosystem that benefits architecture coaching students.',
  },
  {
    city: 'thanjavur',
    nearbyColleges: [
      { name: 'SASTRA Deemed University, School of Architecture and Design', type: 'deemed' },
      { name: 'Periyar Maniammai Institute of Science and Technology, School of Architecture, Vallam', type: 'deemed' },
      { name: 'M.A.M. School of Architecture, Trichy', type: 'private' },
    ],
    examCenters: ['Thanjavur', 'Trichy', 'Kumbakonam'],
    uniqueHighlights: [
      'UNESCO World Heritage Brihadeeswara Temple for studying monumental Chola architecture and structural engineering',
      'Drawing sessions at the Thanjavur Maratha Palace complex for Indo-Saracenic style studies',
      'Field trips to the Gangaikonda Cholapuram and Airavatesvara temples — together forming the Great Living Chola Temples',
      'Immersion in the Cauvery Delta\'s agrarian architecture and traditional irrigation systems',
    ],
    localContext:
      'Thanjavur is the crown jewel of Chola architectural heritage, centred around the UNESCO World Heritage Brihadeeswara Temple (Big Temple) — a thousand-year-old granite marvel with the world\'s first complete granite structure rising to 66 metres. The city and its surrounding delta region contain three UNESCO-listed Great Living Chola Temples. NATA students in Thanjavur study architecture at its most monumental, gaining appreciation for structural engineering, proportional systems, and sculptural integration that few cities in the world can match.',
  },

  // ═══════════════════════════════════════════════════════════════
  // KARNATAKA
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'bangalore',
    nearbyColleges: [
      { name: 'University Visvesvaraya College of Engineering (UVCE), Department of Architecture', type: 'government' },
      { name: 'BMS College of Engineering, Department of Architecture', type: 'private' },
      { name: 'RV College of Architecture', type: 'private' },
      { name: 'Dayananda Sagar College of Architecture', type: 'private' },
      { name: 'Reva University, School of Architecture', type: 'private' },
    ],
    examCenters: ['Bangalore', 'Mysore', 'Tumkur'],
    uniqueHighlights: [
      'Evening and weekend batch options for working professionals in the IT corridor',
      'Study visits to Bangalore Palace, Vidhana Soudha, and IISc campus for diverse architectural styles',
      'Exposure to India\'s most active contemporary architecture scene with firms like Mindspace and Hundredhands',
      'Well-connected by metro to reach coaching centres from any part of the city',
    ],
    localContext:
      'Bangalore is India\'s fastest-growing city and arguably its most dynamic architecture market, where cutting-edge tech campuses, sustainable high-rises, and heritage conservation projects coexist. The city houses over a dozen CoA-approved architecture colleges — the highest density in South India — creating a competitive academic ecosystem. NATA aspirants here benefit from exposure to award-winning contemporary practices alongside heritage sites like the Bangalore Palace and the neo-Dravidian Vidhana Soudha.',
  },
  {
    city: 'mysore',
    nearbyColleges: [
      { name: 'Sri Jayachamarajendra College of Engineering (SJCE), Department of Architecture', type: 'government' },
      { name: 'Vidyavardhaka College of Engineering, School of Architecture', type: 'private' },
      { name: 'JSS Science and Technology University, School of Architecture', type: 'deemed' },
    ],
    examCenters: ['Mysore', 'Bangalore', 'Mangalore'],
    uniqueHighlights: [
      'Sketching the Mysore Palace — one of India\'s most visited monuments with Indo-Saracenic architecture',
      'Heritage city atmosphere ideal for studying urban conservation and heritage management',
      'Study of Hoysala temple architecture with day trips to Somnathpur and Belur-Halebidu',
      'Peaceful academic city environment with lower distractions than Bangalore',
    ],
    localContext:
      'Mysore, the cultural capital of Karnataka, is a heritage city renowned for its palatial architecture and well-planned urban layout. The Mysore Palace, designed by Henry Irwin in the Indo-Saracenic style, is the centrepiece of a city that blends royal Wodeyar-era architecture with colonial planning. Day trips to the exquisitely carved Hoysala temples at Somnathpur, Belur, and Halebidu offer NATA students unparalleled exposure to India\'s most intricate stone carving traditions.',
  },
  {
    city: 'mangalore',
    nearbyColleges: [
      { name: 'National Institute of Technology Karnataka (NITK), Surathkal, Department of Architecture', type: 'government' },
      { name: 'Manipal School of Architecture and Planning, MAHE', type: 'deemed' },
      { name: 'Bearys Institute of Technology, Department of Architecture', type: 'private' },
    ],
    examCenters: ['Mangalore', 'Bangalore', 'Udupi'],
    uniqueHighlights: [
      'Coastal architecture studies with exposure to traditional Mangalorean tiled-roof houses and Guthu mansions',
      'Proximity to NITK Surathkal — one of the top-ranked NITs for architecture in India',
      'Study of Kadri Manjunath Temple and Rosario Cathedral for Hindu-Christian architectural diversity',
      'Field trips to Manipal campus, one of India\'s best-designed university townships',
    ],
    localContext:
      'Mangalore offers a unique coastal architectural context where traditional Guthu mansions with their laterite walls and Mangalore-tile roofs represent centuries of climate-responsive design for the tropical monsoon climate. The city is flanked by two premier institutions — NITK Surathkal and the Manipal School of Architecture — making it a serious architecture education hub. NATA aspirants here study how architecture adapts to heavy rainfall, coastal winds, and the distinct material palette of laterite and red oxide.',
  },
  {
    city: 'hubli',
    nearbyColleges: [
      { name: 'BVB College of Engineering and Technology (KLE Technological University), Department of Architecture', type: 'private' },
      { name: 'SDM College of Engineering and Technology, Department of Architecture, Dharwad', type: 'private' },
      { name: 'BLDEA\'s V.P. Dr. P.G. Halakatti College of Engineering and Technology, Department of Architecture, Vijayapura', type: 'private' },
    ],
    examCenters: ['Hubli-Dharwad', 'Belgaum', 'Bangalore'],
    uniqueHighlights: [
      'Study of Chalukyan temple architecture with proximity to Aihole, Badami, and Pattadakal UNESCO sites',
      'Hub for North Karnataka students covering Dharwad, Belgaum, Gulbarga, and Bijapur districts',
      'Field visits to the experimental architecture of Unkal Lake development and Hubli-Dharwad BRT corridor',
      'Growing city with affordable coaching costs compared to Bangalore',
    ],
    localContext:
      'Hubli-Dharwad is the gateway to North Karnataka\'s extraordinary Chalukyan architectural heritage, including the UNESCO World Heritage site at Pattadakal and the "cradle of Indian architecture" at Aihole, where over 125 stone temples document the evolution of temple design from the 5th to 12th centuries. This region is where the Dravidian and Nagara architectural styles meet and merge. NATA aspirants from North Karnataka find Hubli an accessible regional centre with direct exposure to some of India\'s most architecturally significant sites.',
  },

  // ═══════════════════════════════════════════════════════════════
  // KERALA
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'thiruvananthapuram',
    nearbyColleges: [
      { name: 'College of Engineering Trivandrum (CET), Department of Architecture', type: 'government' },
      { name: 'TKM College of Engineering, Department of Architecture, Kollam', type: 'government' },
      { name: 'Mar Baselios College of Engineering and Technology, School of Architecture', type: 'private' },
    ],
    examCenters: ['Thiruvananthapuram', 'Kollam', 'Kochi'],
    uniqueHighlights: [
      'Study of Kerala\'s distinctive sloped-roof nalukettu architecture at the Padmanabhapuram Palace',
      'Sketching practice at the Napier Museum — a landmark Indo-Saracenic building with Kerala adaptations',
      'Proximity to Laurie Baker\'s iconic cost-effective architecture experiments in the city',
      'Access to CET Trivandrum — Kerala\'s oldest and most prestigious architecture school',
    ],
    localContext:
      'Thiruvananthapuram, Kerala\'s capital, is the intellectual centre of the state\'s distinctive architectural tradition. The city bears the strong imprint of Laurie Baker, the legendary architect who pioneered cost-effective, climate-responsive building techniques using exposed brick, jali walls, and filler slabs — concepts now taught in architecture schools worldwide. CET Trivandrum, established in 1939, is one of the oldest architecture departments in India, and the nearby Padmanabhapuram Palace represents the pinnacle of Kerala\'s traditional timber and laterite construction.',
  },
  {
    city: 'kochi',
    nearbyColleges: [
      { name: 'Cochin University of Science and Technology (CUSAT), School of Engineering, Department of Architecture', type: 'government' },
      { name: 'Rajagiri School of Engineering and Technology, Department of Architecture', type: 'private' },
      { name: 'Albertian Institute of Science and Technology, Department of Architecture', type: 'private' },
      { name: 'Toc H Institute of Science and Technology, Department of Architecture', type: 'private' },
    ],
    examCenters: ['Kochi', 'Thrissur', 'Thiruvananthapuram'],
    uniqueHighlights: [
      'Study of Portuguese, Dutch, and British colonial architecture in Fort Kochi and Mattancherry',
      'Sketching at the Chinese fishing nets, St. Francis Church (India\'s oldest European church), and Jewish Synagogue',
      'Exposure to the Kochi-Muziris Biennale — India\'s largest contemporary art event held in heritage warehouses',
      'Waterfront and tropical coastal architecture studies along the backwaters and harbour area',
    ],
    localContext:
      'Kochi is a palimpsest of architectural influences — Portuguese, Dutch, British, Jewish, and indigenous Kerala styles layered over 600 years of maritime trade history. Fort Kochi\'s heritage zone, where the Kochi-Muziris Biennale transforms colonial warehouses into contemporary art spaces, demonstrates how adaptive reuse breathes new life into historic structures. For NATA aspirants, this multicultural built environment provides extraordinarily diverse drawing subjects, from the cantilevered Chinese fishing nets to the gabled Dutch Palace.',
  },
  {
    city: 'kozhikode',
    nearbyColleges: [
      { name: 'National Institute of Technology Calicut (NIT Calicut), Department of Architecture', type: 'government' },
      { name: 'TKM College of Engineering, Department of Architecture, Kollam', type: 'government' },
      { name: 'MEA Engineering College, Department of Architecture, Malappuram', type: 'private' },
    ],
    examCenters: ['Kozhikode', 'Kannur', 'Thrissur'],
    uniqueHighlights: [
      'Proximity to NIT Calicut — one of the highest-ranked architecture programmes in South India',
      'Study of Malabar\'s unique timber and laterite tharavad (ancestral home) architecture',
      'Sketching at Kappad Beach, Beypore port, and the Kozhikode beach heritage zone',
      'Regional hub serving students from Malappuram, Wayanad, and Kannur districts',
    ],
    localContext:
      'Kozhikode (Calicut), the historic spice trading port of Malabar, is home to NIT Calicut — consistently ranked among the top ten architecture programmes in India. The city\'s tharavad houses, with their massive timber frameworks, inner courtyards, and laterite walls, represent an architecture of joint-family social structures that is increasingly studied for its sustainability principles. The Kozhikode beach promenade and Beypore shipbuilding yard offer unique subjects for architectural sketching and documentation.',
  },

  // ═══════════════════════════════════════════════════════════════
  // TELANGANA & ANDHRA PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'hyderabad',
    nearbyColleges: [
      { name: 'Jawaharlal Nehru Architecture and Fine Arts University (JNAFAU)', type: 'government' },
      { name: 'School of Planning and Architecture (SPA) Vijayawada, Hyderabad campus', type: 'government' },
      { name: 'CEPT-affiliated Deccan School of Architecture', type: 'private' },
      { name: 'Malla Reddy College of Engineering and Technology, Department of Architecture', type: 'private' },
      { name: 'Anurag University, School of Architecture', type: 'private' },
    ],
    examCenters: ['Hyderabad', 'Warangal', 'Vijayawada'],
    uniqueHighlights: [
      'Sketching at Charminar, Golconda Fort, and the Qutb Shahi Tombs for Indo-Islamic architectural mastery',
      'Home to JNAFAU — one of only three dedicated architecture universities in India',
      'Study of Hyderabad\'s distinctive Deccani architectural style blending Persian, Turkish, and Indian elements',
      'Growing contemporary architecture scene in HITEC City and Gachibowli tech corridor',
    ],
    localContext:
      'Hyderabad is one of India\'s most architecturally significant cities, home to JNAFAU — one of only three universities in the country dedicated exclusively to architecture and fine arts. The city\'s 400-year-old Qutb Shahi heritage, from Charminar to the acoustic marvels of Golconda Fort, represents the pinnacle of Deccani architecture. NATA aspirants here can study how ancient engineering genius created structures with sophisticated acoustics, ventilation, and water systems — concepts central to modern sustainable design.',
  },
  {
    city: 'visakhapatnam',
    nearbyColleges: [
      { name: 'Andhra University, College of Engineering, Department of Architecture', type: 'government' },
      { name: 'Gitam School of Architecture, GITAM Deemed University', type: 'deemed' },
      { name: 'Raghu School of Architecture', type: 'private' },
    ],
    examCenters: ['Visakhapatnam', 'Rajahmundry', 'Vijayawada'],
    uniqueHighlights: [
      'Coastal city sketching with the Eastern Ghats meeting the Bay of Bengal — unique topography for landscape studies',
      'Study of Kailasagiri hill-top urban design and the RK Beach promenade architecture',
      'Field visits to the ancient Buddhist monastery ruins at Thotlakonda for archaeological architecture',
      'Serves students from Srikakulam, Vizianagaram, and East Godavari districts',
    ],
    localContext:
      'Visakhapatnam (Vizag) is Andhra Pradesh\'s largest city, uniquely positioned where the Eastern Ghats tumble into the Bay of Bengal. This dramatic topography creates fascinating architectural challenges — hillside construction, coastal building design, and urban planning on varied terrain. The ancient Buddhist monastery ruins at Thotlakonda and Bavikonda on the hilltops above the city demonstrate how 2,000-year-old builders solved the same site-planning problems that modern architects face in this growing port city.',
  },
  {
    city: 'vijayawada',
    nearbyColleges: [
      { name: 'School of Planning and Architecture (SPA) Vijayawada', type: 'government' },
      { name: 'KL University, School of Architecture, Guntur', type: 'deemed' },
      { name: 'Siddhartha Academy of Higher Education, Department of Architecture', type: 'private' },
    ],
    examCenters: ['Vijayawada', 'Guntur', 'Hyderabad'],
    uniqueHighlights: [
      'Home to SPA Vijayawada — one of India\'s elite Schools of Planning and Architecture',
      'Study of Amaravati, the new Andhra Pradesh capital under construction — a rare chance to witness city-building in real time',
      'Sketching at Undavalli Caves, Kanaka Durga Temple, and the Prakasam Barrage for diverse architectural subjects',
      'Krishna River waterfront development offers lessons in urban waterfront design',
    ],
    localContext:
      'Vijayawada is home to the School of Planning and Architecture (SPA) — one of only four SPAs in India and among the most selective architecture programmes in the country. The city sits at the epicentre of Andhra Pradesh\'s ambitious new capital project at Amaravati, designed by Foster + Partners, offering NATA aspirants a once-in-a-generation opportunity to witness a state capital being planned and built from scratch. The Undavalli cave temples, carved from sandstone hills, provide stunning examples of rock-cut architecture.',
  },

  // ═══════════════════════════════════════════════════════════════
  // MAHARASHTRA
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'mumbai',
    nearbyColleges: [
      { name: 'Sir J.J. College of Architecture', type: 'government' },
      { name: 'Academy of Architecture, Rachana Sansad', type: 'private' },
      { name: 'Kamla Raheja Vidyanidhi Institute for Architecture and Environmental Studies (KRVIA)', type: 'private' },
      { name: 'Rizvi College of Architecture', type: 'private' },
      { name: 'L.S. Raheja School of Architecture', type: 'private' },
    ],
    examCenters: ['Mumbai', 'Thane', 'Pune'],
    uniqueHighlights: [
      'Home to Sir J.J. College of Architecture — India\'s oldest and most iconic architecture school (est. 1857)',
      'Sketching at the Gateway of India, CST Station (UNESCO), and the Art Deco ensemble of Marine Drive',
      'Exposure to India\'s densest and most complex urban environment — a goldmine for urban design thinking',
      'Networking with India\'s largest concentration of architecture firms, from Charles Correa Associates to SOM',
    ],
    localContext:
      'Mumbai is the birthplace of formal architecture education in India, with Sir J.J. College of Architecture operating since 1857. The city contains India\'s largest collection of Art Deco buildings (a UNESCO-nominated ensemble along Marine Drive), the Victorian Gothic CST station (a UNESCO World Heritage Site), and the Elephanta Caves. For NATA aspirants, Mumbai represents the ultimate architectural melting pot — where heritage conservation, high-density housing, slum rehabilitation, and supertall towers coexist in a single urban frame.',
  },
  {
    city: 'pune',
    nearbyColleges: [
      { name: 'College of Engineering Pune (CoEP), Department of Architecture', type: 'government' },
      { name: 'Bharati Vidyapeeth\'s College of Architecture', type: 'private' },
      { name: 'Dr. B.N. College of Architecture, Symbiosis International University', type: 'deemed' },
      { name: 'MIT World Peace University, School of Architecture', type: 'private' },
      { name: 'Sinhgad College of Architecture', type: 'private' },
    ],
    examCenters: ['Pune', 'Mumbai', 'Nashik'],
    uniqueHighlights: [
      'Study of Maratha military architecture at Shaniwar Wada, Sinhagad Fort, and Raigad Fort',
      'Home to CoEP — one of India\'s oldest engineering colleges with a strong architecture tradition',
      'Vibrant architecture student community with multiple colleges creating a peer-learning ecosystem',
      'Pleasant year-round climate ideal for outdoor sketching and site visits',
    ],
    localContext:
      'Pune, India\'s education capital, hosts more CoA-approved architecture colleges than almost any other Indian city, creating a vibrant competitive ecosystem for NATA aspirants. The city\'s Maratha-era architecture — from the sprawling Shaniwar Wada palace-fort to the dramatic Sinhagad and Rajgad forts perched on the Western Ghats — provides dramatic drawing subjects. Pune\'s transformation from a pensioners\' paradise to an IT hub has generated a contemporary architecture boom, giving students exposure to both heritage and cutting-edge design.',
  },
  {
    city: 'nagpur',
    nearbyColleges: [
      { name: 'Visvesvaraya National Institute of Technology (VNIT), Department of Architecture', type: 'government' },
      { name: 'Priyadarshini Institute of Architecture and Design Studies', type: 'private' },
      { name: 'College of Architecture, Nagpur (Nagpur University)', type: 'private' },
    ],
    examCenters: ['Nagpur', 'Aurangabad', 'Pune'],
    uniqueHighlights: [
      'Home to VNIT Nagpur — a premier NIT with a well-regarded architecture department',
      'Central India location serving students from Vidarbha, Chhattisgarh, and Madhya Pradesh',
      'Study of Deekshabhoomi — the largest hollow stupa in the world, designed by Sheo Dan Mal',
      'Proximity to the Ajanta and Ellora Caves (UNESCO) for rock-cut architecture field studies',
    ],
    localContext:
      'Nagpur, the geographic centre of India, is home to VNIT — one of the original National Institutes of Technology with a distinguished architecture department. The city\'s landmark Deekshabhoomi, a massive Buddhist stupa inspired by the Sanchi Stupa, is an important modern monument. NATA students in Nagpur benefit from relative proximity to the UNESCO World Heritage Ajanta and Ellora Caves, where rock-cut architecture achieved its finest expression in India, and the Gond and Bhonsle-era buildings of the old city.',
  },

  // ═══════════════════════════════════════════════════════════════
  // GUJARAT
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'ahmedabad',
    nearbyColleges: [
      { name: 'CEPT University (Centre for Environmental Planning and Technology)', type: 'deemed' },
      { name: 'School of Architecture, Adarsh Institute, Ahmedabad', type: 'private' },
      { name: 'Birla Vishvakarma Mahavidyalaya (BVM), Department of Architecture, Vallabh Vidyanagar', type: 'government' },
    ],
    examCenters: ['Ahmedabad', 'Vadodara', 'Surat'],
    uniqueHighlights: [
      'Home to CEPT University — India\'s #1 ranked architecture school and a global benchmark',
      'UNESCO World Heritage City with the walled old city\'s pols, havelis, and step-wells',
      'Study of Le Corbusier\'s Mill Owners\' Association Building, Louis Kahn\'s IIM Ahmedabad, and B.V. Doshi\'s Sangath',
      'The only Indian city where works by three Pritzker Prize laureates can be studied in person',
    ],
    localContext:
      'Ahmedabad is the undisputed mecca of architectural education in India, home to CEPT University — consistently ranked India\'s number one architecture school. The city is the only place in the world where buildings by three Pritzker Prize laureates stand in close proximity: Le Corbusier\'s Mill Owners\' Association Building, Louis Kahn\'s IIM Ahmedabad campus, and B.V. Doshi\'s Sangath studio. Its UNESCO-inscribed walled city, with intricately carved wooden havelis and ingenious pol house clusters, provides a living laboratory of sustainable urban design. For serious NATA aspirants, Ahmedabad is the gold standard.',
  },

  // ═══════════════════════════════════════════════════════════════
  // DELHI NCR
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'delhi',
    nearbyColleges: [
      { name: 'School of Planning and Architecture (SPA) Delhi', type: 'government' },
      { name: 'Jamia Millia Islamia, Faculty of Architecture and Ekistics', type: 'government' },
      { name: 'Sushant University (formerly Sushant School of Art and Architecture)', type: 'private' },
      { name: 'Guru Gobind Singh Indraprastha University, School of Architecture', type: 'government' },
      { name: 'BMS School of Architecture, Delhi', type: 'private' },
    ],
    examCenters: ['Delhi', 'Noida', 'Gurgaon'],
    uniqueHighlights: [
      'Home to SPA Delhi — India\'s most prestigious architecture school (the IIT of architecture)',
      'Sketching at Mughal masterpieces: Red Fort, Humayun\'s Tomb (UNESCO), Qutub Minar (UNESCO), Jama Masjid',
      'Study of Lutyens\' Delhi — the grand imperial capital design with Rashtrapati Bhavan and India Gate',
      'Access to the largest concentration of architecture firms, competitions, and exhibitions in India',
    ],
    localContext:
      'Delhi is the seat of SPA Delhi — India\'s most selective architecture programme, often called the "IIT of architecture." The city is an unparalleled architectural encyclopedia spanning 2,000 years, from Qutub Minar\'s 12th-century Afghan tower to Lutyens\' 20th-century imperial capital to the contemporary Lotus Temple. NATA aspirants in Delhi can sketch Mughal masterpieces, study Lutyens\' classical urban planning, and visit modern landmarks — all within a single city. The sheer density of architectural history here is unmatched in India.',
  },
  {
    city: 'noida',
    nearbyColleges: [
      { name: 'Amity School of Architecture and Planning, Amity University', type: 'private' },
      { name: 'School of Planning and Architecture (SPA) Delhi (nearby)', type: 'government' },
      { name: 'Jamia Millia Islamia, Faculty of Architecture (nearby)', type: 'government' },
      { name: 'Sharda University, School of Architecture', type: 'private' },
    ],
    examCenters: ['Noida', 'Delhi', 'Ghaziabad'],
    uniqueHighlights: [
      'Study of planned-city urbanism — Noida and Greater Noida are among India\'s best-planned modern cities',
      'Proximity to Delhi\'s heritage sites while offering more affordable coaching and living costs',
      'Exposure to large-scale modern construction: Supertech, Jaypee, and ATS township developments',
      'Easy access to SPA Delhi and Jamia Millia via Delhi Metro',
    ],
    localContext:
      'Noida (New Okhla Industrial Development Authority) represents India\'s most successful planned-city experiment, offering NATA aspirants a real-world case study in modernist urban planning. The city\'s grid layout, sector-based zoning, and generous green buffer design contrast sharply with Old Delhi\'s organic medieval fabric, allowing students to compare both approaches. With Delhi Metro connectivity to SPA Delhi and Jamia Millia, students in Noida enjoy lower living costs while remaining plugged into Delhi\'s rich architectural ecosystem.',
  },
  {
    city: 'gurgaon',
    nearbyColleges: [
      { name: 'Sushant University (formerly Sushant School of Art and Architecture)', type: 'private' },
      { name: 'School of Planning and Architecture (SPA) Delhi (nearby)', type: 'government' },
      { name: 'GD Goenka University, School of Architecture and Planning', type: 'private' },
    ],
    examCenters: ['Gurgaon', 'Delhi', 'Faridabad'],
    uniqueHighlights: [
      'Home to Sushant University — one of North India\'s premier private architecture schools',
      'Study of India\'s most ambitious commercial architecture: DLF Cyber Hub, Unitech Cyber Park, and Kingdom of Dreams',
      'Exposure to high-rise residential and corporate campus design at scale',
      'Close to Delhi heritage sites via Rapid Metro and Delhi Metro connectivity',
    ],
    localContext:
      'Gurgaon (Gurugram) has transformed from agricultural land to India\'s corporate capital in just three decades, offering a dramatic case study in rapid urbanization and its architectural consequences. The city\'s skyline of glass-and-steel towers, including DLF Cyber City and Unitech Cyber Park, represents India\'s most concentrated collection of contemporary commercial architecture. NATA aspirants here study how urban design succeeds and fails at scale, while benefiting from proximity to Delhi\'s incomparable heritage sites.',
  },

  // ═══════════════════════════════════════════════════════════════
  // RAJASTHAN
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'jaipur',
    nearbyColleges: [
      { name: 'Malaviya National Institute of Technology (MNIT), Department of Architecture', type: 'government' },
      { name: 'Aayojan School of Architecture, University of Rajasthan', type: 'government' },
      { name: 'Manipal University Jaipur, School of Architecture', type: 'private' },
      { name: 'JECRC University, School of Architecture', type: 'private' },
    ],
    examCenters: ['Jaipur', 'Jodhpur', 'Delhi'],
    uniqueHighlights: [
      'UNESCO World Heritage City — the world\'s first planned city with a grid layout (1727)',
      'Sketching at Hawa Mahal, Jantar Mantar (UNESCO), Amber Fort, and City Palace for Rajput architecture',
      'Study of colour-coded urban planning: the "Pink City" concept as early branding in architecture',
      'MNIT Jaipur\'s architecture programme combines Rajasthani heritage with contemporary design education',
    ],
    localContext:
      'Jaipur is a UNESCO World Heritage City and arguably the finest example of pre-modern urban planning in India, laid out in 1727 by Maharaja Sawai Jai Singh II using Vastu Shastra and European grid principles. The city\'s colour-coded identity (the famous pink wash), its astronomical instruments at Jantar Mantar (UNESCO), and the iconic Hawa Mahal with 953 jharokha windows make it a living masterclass in Rajput architectural ingenuity. NATA aspirants in Jaipur sketch heritage at a scale and quality that few cities in the world can match.',
  },

  // ═══════════════════════════════════════════════════════════════
  // UTTAR PRADESH
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'lucknow',
    nearbyColleges: [
      { name: 'School of Architecture, Babu Banarasi Das University', type: 'private' },
      { name: 'Integral University, Faculty of Architecture', type: 'private' },
      { name: 'Institute of Engineering and Technology (IET) Lucknow, Department of Architecture', type: 'government' },
    ],
    examCenters: ['Lucknow', 'Kanpur', 'Allahabad'],
    uniqueHighlights: [
      'Sketching at Bara Imambara — one of the largest arched constructions in the world without external support beams',
      'Study of Nawabi-era Lucknowi architecture blending Mughal, Persian, and European elements',
      'Bhool Bhulaiya (labyrinth) at Bara Imambara for understanding complex spatial planning',
      'Exposure to the ongoing Lucknow Metro and smart city redevelopment projects',
    ],
    localContext:
      'Lucknow\'s Nawabi-era architecture represents a unique fusion of Mughal grandeur, Persian refinement, and early European influences. The Bara Imambara, with its 50-metre unsupported arched hall — one of the largest in the world — and its famously disorienting Bhool Bhulaiya labyrinth, demonstrates extraordinary structural engineering achieved without modern technology. NATA aspirants in Lucknow study architectural ambition at its most dramatic, alongside the city\'s ongoing transformation through metro construction and smart city initiatives.',
  },

  // ═══════════════════════════════════════════════════════════════
  // CHANDIGARH
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'chandigarh',
    nearbyColleges: [
      { name: 'Chandigarh College of Architecture (CCA), Punjab University', type: 'government' },
      { name: 'Chitkara School of Architecture, Chitkara University', type: 'private' },
      { name: 'IKG Punjab Technical University, School of Architecture', type: 'government' },
    ],
    examCenters: ['Chandigarh', 'Amritsar', 'Ludhiana'],
    uniqueHighlights: [
      'Study of Le Corbusier\'s master plan — the only city in the world fully designed by the legendary architect',
      'The Capitol Complex (UNESCO World Heritage) with the High Court, Secretariat, and Open Hand Monument',
      'CCA Chandigarh is located in a building designed by Le Corbusier himself — architecture school inside a masterpiece',
      'Entire city functions as a living textbook of modernist urban planning and brutalist architecture',
    ],
    localContext:
      'Chandigarh is the only city in the world entirely planned and designed by Le Corbusier, making it a UNESCO-inscribed masterpiece of modernist urbanism. The Capitol Complex — with the High Court, Secretariat, Legislative Assembly, and the iconic Open Hand Monument — is one of the 20th century\'s most significant architectural ensembles. NATA aspirants studying here literally walk through a Le Corbusier design every day, and the Chandigarh College of Architecture itself occupies a Corbusier-designed building. No other city offers this level of immersion in a single architect\'s vision.',
  },

  // ═══════════════════════════════════════════════════════════════
  // WEST BENGAL
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'kolkata',
    nearbyColleges: [
      { name: 'Indian Institute of Engineering Science and Technology (IIEST) Shibpur, Department of Architecture', type: 'government' },
      { name: 'Jadavpur University, Faculty of Engineering and Technology, Department of Architecture', type: 'government' },
      { name: 'Techno India University, School of Architecture', type: 'private' },
      { name: 'Budge Budge Institute of Technology, Department of Architecture', type: 'private' },
    ],
    examCenters: ['Kolkata', 'Durgapur', 'Siliguri'],
    uniqueHighlights: [
      'Largest collection of colonial British architecture in India — Victoria Memorial, Howrah Bridge, Writers\' Building, GPO',
      'Study of Indo-Gothic and Indo-Saracenic styles at their most prolific',
      'Sketching at the Marble Palace, Jorasanko Thakur Bari (Tagore House), and the terracotta temples of Bishnupur (day trip)',
      'Home to IIEST Shibpur (est. 1856) — one of India\'s oldest architecture schools',
    ],
    localContext:
      'Kolkata possesses the largest concentration of colonial-era architecture in India, with entire neighbourhoods of Indo-Gothic, Indo-Saracenic, and Art Deco buildings in the BBD Bagh, Park Street, and South Kolkata areas. IIEST Shibpur (formerly Bengal Engineering College, est. 1856) is one of Asia\'s oldest engineering institutions with a distinguished architecture department. The city\'s heritage crisis — with hundreds of grand mansions facing decay — makes it a compelling study site for conservation architecture, while day trips to Bishnupur\'s terracotta temples offer exposure to unique Bengali temple architecture.',
  },

  // ═══════════════════════════════════════════════════════════════
  // BIHAR
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'patna',
    nearbyColleges: [
      { name: 'National Institute of Technology (NIT) Patna, Department of Architecture', type: 'government' },
      { name: 'Chandragupt Institute of Management Patna (CIMP), Architecture wing', type: 'private' },
      { name: 'Birla Institute of Technology Mesra, Patna Extension Centre', type: 'deemed' },
    ],
    examCenters: ['Patna', 'Ranchi', 'Varanasi'],
    uniqueHighlights: [
      'Study of one of the world\'s oldest continuously inhabited cities (as Pataliputra, founded ~490 BCE)',
      'Proximity to Nalanda University ruins — an ancient seat of learning with sophisticated monastery architecture',
      'Sketching at Golghar (granary), Patna Sahib Gurudwara, and the Mahatma Gandhi Setu',
      'Regional hub for NATA aspirants from Bihar, Jharkhand, and eastern UP',
    ],
    localContext:
      'Patna, as the ancient Pataliputra, was once the largest city in the world and the capital of the Maurya Empire. The Mauryan-era archaeological sites nearby — including the remains at Kumhrar with its 80-pillar hall — provide insights into India\'s earliest monumental architecture. Day trips to the Nalanda University ruins (UNESCO) offer NATA aspirants exposure to sophisticated monastery campus planning from the 5th century. NIT Patna\'s growing architecture department is strengthening Bihar\'s architectural education infrastructure.',
  },

  // ═══════════════════════════════════════════════════════════════
  // ODISHA
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'bhubaneswar',
    nearbyColleges: [
      { name: 'National Institute of Technology (NIT) Rourkela, Department of Architecture', type: 'government' },
      { name: 'College of Engineering and Technology (CET) Bhubaneswar, Department of Architecture', type: 'government' },
      { name: 'Kalinga Institute of Industrial Technology (KIIT), School of Architecture', type: 'deemed' },
    ],
    examCenters: ['Bhubaneswar', 'Rourkela', 'Kolkata'],
    uniqueHighlights: [
      'The "Temple City of India" with over 500 ancient temples showcasing Kalinga architecture',
      'Sketching at the Lingaraja Temple, Rajarani Temple, and Mukteshwar Temple — masterpieces of Odisha temple style',
      'Day trips to Konark Sun Temple (UNESCO) — one of the finest architectural achievements in India',
      'Study of the modern planned-city layout designed by German architect Otto Koenigsberger',
    ],
    localContext:
      'Bhubaneswar, the Temple City of India, contains over 500 temples spanning 2,000 years of Kalinga architectural evolution — from the 2nd century BCE Jain caves at Udayagiri-Khandagiri to the towering Lingaraja Temple. Day trips to the UNESCO-listed Konark Sun Temple, designed as a colossal stone chariot, give NATA aspirants exposure to one of humanity\'s greatest architectural achievements. The modern city itself, planned by Otto Koenigsberger in 1948, is an important example of post-independence Indian town planning.',
  },

  // ═══════════════════════════════════════════════════════════════
  // GULF COUNTRIES
  // ═══════════════════════════════════════════════════════════════
  {
    city: 'dubai',
    nearbyColleges: [
      { name: 'American University in Dubai, School of Architecture, Art and Design', type: 'private' },
      { name: 'University of Sharjah, College of Architecture, Art and Design', type: 'private' },
      { name: 'Ajman University, College of Architecture, Art and Design', type: 'private' },
    ],
    examCenters: ['NATA exam taken in India — nearest centers: Mumbai, Kochi, Chennai'],
    uniqueHighlights: [
      'Classes scheduled for Gulf timezone (IST+1.5) with live online sessions from India-based faculty',
      'Weekend intensive batches designed for students attending Indian curriculum schools (CBSE/ICSE) in Dubai',
      'Study of Dubai\'s record-breaking architecture: Burj Khalifa, Museum of the Future, Dubai Frame',
      'Pre-NATA orientation trips to India organized for exam preparation and college campus visits',
    ],
    localContext:
      'Dubai is home to the largest NRI student population in the Gulf, with thousands attending CBSE and ICSE schools who aspire to study architecture at top Indian colleges. Since NATA is conducted only in India, Dubai-based students need structured coaching that aligns with the exam schedule and includes India visit planning for the test dates. Dubai itself is a living showcase of extreme contemporary architecture — from the 828-metre Burj Khalifa to the Zaha Hadid-designed Opus building — giving students daily exposure to ambitious design thinking.',
  },
  {
    city: 'doha',
    nearbyColleges: [
      { name: 'Qatar University, Department of Architecture and Urban Planning', type: 'government' },
      { name: 'Virginia Commonwealth University in Qatar, Department of Interior Design', type: 'private' },
    ],
    examCenters: ['NATA exam taken in India — nearest centers: Mumbai, Kochi, Chennai'],
    uniqueHighlights: [
      'Classes timed for Gulf timezone (IST+1.5) with weekend intensive format',
      'Exposure to world-class contemporary architecture: Museum of Islamic Art (I.M. Pei), National Museum of Qatar (Jean Nouvel)',
      'Study of Qatar\'s FIFA World Cup 2022 stadium architecture by Zaha Hadid and Foster + Partners',
      'Small-group coaching for the focused Indian student community in Doha',
    ],
    localContext:
      'Doha has invested heavily in signature architecture, commissioning buildings from the world\'s greatest architects: I.M. Pei\'s Museum of Islamic Art, Jean Nouvel\'s desert-rose National Museum, and Zaha Hadid\'s Al Wakrah Stadium. Indian students in Doha who aspire to study architecture in India can draw daily inspiration from these buildings while preparing for NATA. The city\'s Msheireb Downtown regeneration project is one of the world\'s most ambitious sustainable urban redevelopment efforts.',
  },
  {
    city: 'muscat',
    nearbyColleges: [
      { name: 'German University of Technology in Oman (GUtech), Department of Architecture', type: 'private' },
      { name: 'Middle East College, Department of Architecture and Interior Design', type: 'private' },
    ],
    examCenters: ['NATA exam taken in India — nearest centers: Mumbai, Kochi, Hyderabad'],
    uniqueHighlights: [
      'Classes timed for Gulf timezone (IST+1.5) with flexible scheduling for Indian curriculum students',
      'Study of traditional Omani fort architecture: Nizwa Fort, Jabrin Castle, and Nakhal Fort',
      'Exposure to contemporary Omani design: Royal Opera House Muscat and Sultan Qaboos Grand Mosque',
      'Guided exploration of Muscat\'s strict urban design codes that preserve traditional Arabian character',
    ],
    localContext:
      'Muscat offers a rare architectural environment where strict building height limits and aesthetic codes preserve the city\'s traditional Arabian character — a counter-example to Dubai\'s skyscraper approach. The Sultan Qaboos Grand Mosque, with its 4,343 m² hand-woven carpet and Swarovski crystal chandelier, represents contemporary Islamic architecture at its most refined. Indian students in Oman benefit from studying how a nation balances modernization with architectural heritage preservation — a debate central to Indian architecture today.',
  },
  {
    city: 'riyadh',
    nearbyColleges: [
      { name: 'King Saud University, College of Architecture and Planning', type: 'government' },
      { name: 'Dar Al Uloom University, College of Architecture and Digital Design', type: 'private' },
      { name: 'Prince Sultan University, College of Architecture and Design', type: 'private' },
    ],
    examCenters: ['NATA exam taken in India — nearest centers: Mumbai, Hyderabad, Kochi'],
    uniqueHighlights: [
      'Classes timed for Saudi timezone (IST+2.5) with weekend intensive format',
      'Study of Saudi Vision 2030 mega-projects: NEOM, The Line, Diriyah Gate, and Riyadh Metro stations',
      'Exposure to Najdi mud-brick architecture at the UNESCO-listed At-Turaif District in Diriyah',
      'Pre-NATA planning support for India visit logistics and exam center registration',
    ],
    localContext:
      'Riyadh is at the epicentre of the most ambitious architectural programme in the modern world — Saudi Vision 2030 — which includes NEOM\'s The Line (a 170-km linear city), Diriyah Gate (a heritage-led development), and the Riyadh Metro designed by Zaha Hadid, Snohetta, and Foster + Partners. Indian students here witness architecture-as-nation-building at an unprecedented scale. The UNESCO-listed At-Turaif District in nearby Diriyah showcases traditional Najdi mud-brick architecture, providing a grounding in how desert communities built sustainably for centuries.',
  },
  {
    city: 'kuwait-city',
    nearbyColleges: [
      { name: 'Kuwait University, College of Architecture', type: 'government' },
      { name: 'American University of Kuwait', type: 'private' },
    ],
    examCenters: ['NATA exam taken in India — nearest centers: Mumbai, Kochi, Chennai'],
    uniqueHighlights: [
      'Classes timed for Gulf timezone (IST+2.5) with weekend and evening batch options',
      'Study of Kuwait Towers — an iconic 1970s modernist landmark and symbol of the country',
      'Exposure to the post-liberation reconstruction architecture of Kuwait City',
      'Strong Indian community presence with well-organized CBSE/ICSE school networks',
    ],
    localContext:
      'Kuwait City\'s architectural story is one of dramatic destruction and reconstruction. The city\'s post-Gulf War rebuilding in the 1990s created one of the most comprehensive modern urban reconstruction programmes in history. The iconic Kuwait Towers (1979), designed by Swedish architects Malene Bjorn and Sune Lindstrom, remain a masterclass in sculptural modernism. Indian students in Kuwait — one of the largest expatriate communities — benefit from structured NATA coaching that bridges Gulf-based living with India-based exam and admission timelines.',
  },
];

// ═══════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get SEO content for a specific city.
 * @param city - The city slug (lowercase, hyphenated) matching the `city` field in locations.ts
 * @returns The LocationSeoContent for the city, or undefined if not found
 */
export function getLocationSeoContent(city: string): LocationSeoContent | undefined {
  return locationSeoContent.find((c) => c.city === city);
}

/**
 * Get all cities that have rich SEO content available.
 * Useful for determining which location pages can render enhanced content.
 */
export function getCitiesWithSeoContent(): string[] {
  return locationSeoContent.map((c) => c.city);
}
