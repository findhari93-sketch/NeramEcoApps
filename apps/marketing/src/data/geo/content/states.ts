/**
 * Hand-written content for state coaching pages. Migrated 2026-10-01 from
 * packages/database state-seo-content.ts (the templated FAQs were dropped: they
 * carried unverifiable "#1" and success-rate claims).
 */
export interface StateContent {
  description: string;
  highlights: string[];
  /** True once staff have checked every fact (agents/seo-aeo/location-content-review.md). */
  reviewed?: boolean;
  updatedAt: string;
}

export const STATE_CONTENT: Record<string, StateContent> = {
    "andaman-and-nicobar": {
      "description": "The Andaman and Nicobar Islands combine colonial history, tribal building traditions and the challenge of building where earthquakes and tsunamis are real risks. In Sri Vijaya Puram (formerly Port Blair), the British built the Cellular Jail with wings radiating from a central tower, a plan that let a few guards watch many cells. Its surviving wings are now a national memorial. On nearby Ross Island, now Netaji Subhash Chandra Bose Dweep, ruined colonial buildings are slowly being claimed by tree roots. Nicobarese families traditionally built round, thatched huts raised high on timber stilts and entered by a ladder. After the 2004 tsunami, resilient coastal construction became a major concern. With no B.Arch college on the islands, students usually apply to mainland colleges through JoSAA and CSAB counselling.",
      "highlights": [
        "The Cellular Jail in Sri Vijaya Puram follows a radial plan, with wings spreading from a central watchtower.",
        "Nicobarese huts are traditionally round and thatched, raised on tall timber stilts and entered by a ladder.",
        "High earthquake and tsunami risk makes seismic and coastal resilient design essential across the islands."
      ],
      "updatedAt": "2026-10-01"
    },
    "andhra-pradesh": {
      "description": "Andhra Pradesh is witnessing a construction and urban design renaissance with the development of its new capital Amaravati, making it an exciting state for aspiring architects. Andhra University in Visakhapatnam has a well-established architecture program with decades of heritage. The state's rich temple architecture at Tirupati and Lepakshi, combined with modern infrastructure growth, provides NATA students with diverse architectural inspiration.",
      "highlights": [
        "Amaravati capital city project offers real-world exposure to large-scale urban planning",
        "Andhra University in Vizag is one of the oldest architecture departments in South India",
        "Tirupati and Lepakshi heritage sites provide excellent study material for temple architecture",
        "Rapidly growing infrastructure in Vizag and Vijayawada creates strong demand for architects"
      ],
      "updatedAt": "2026-10-01"
    },
    "arunachal-pradesh": {
      "description": "Arunachal Pradesh spans subtropical foothills and high Himalayan valleys, so its architecture changes with altitude. In the west, Monpa communities build stone and timber houses with carved windows, and Tawang Monastery, founded in the seventeenth century, sits on a ridge above the town. In the Ziro valley, Apatani villages of closely spaced bamboo houses raised on stilts sit among carefully managed rice fields, a landscape on India's tentative list for UNESCO World Heritage. Adi and Nyishi communities also build on stilts using bamboo, cane and timber, often in long, shared houses. In Itanagar, the brick walls of Ita Fort recall an older past. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB for JEE Paper 2.",
      "highlights": [
        "Tawang Monastery, founded in the seventeenth century, overlooks the Tawang valley from a mountain ridge.",
        "Apatani houses in the Ziro valley are built of bamboo and raised on stilts in tight rows.",
        "Ita Fort in Itanagar is a historic fortification built largely of brick."
      ],
      "updatedAt": "2026-10-01"
    },
    "assam": {
      "description": "Assam serves as the gateway to Northeast India's extraordinarily diverse architectural traditions. The Ahom dynasty monuments, including Rang Ghar, one of Asia's oldest amphitheatres, showcase a unique architectural style found nowhere else. The traditional Assam-type house, built with bamboo and ikra (reed) construction, is a globally recognized example of earthquake-resistant vernacular architecture. NATA aspirants from Assam bring a distinctive perspective to architecture education.",
      "highlights": [
        "Gateway to Northeast India's diverse vernacular architecture traditions",
        "Ahom-era monuments like Rang Ghar and Talatal Ghar showcase unique regional architecture",
        "Assam-type houses (Ikra construction) represent earthquake-resistant bamboo architecture",
        "Growing urbanization in Guwahati creates demand for architects in the Northeast"
      ],
      "updatedAt": "2026-10-01"
    },
    "bihar": {
      "description": "Bihar, the land of Nalanda and Vikramshila, has deep roots in institutional architecture dating back over a thousand years. NIT Patna anchors the state's modern architecture education with a strong government program. The ruins of ancient Nalanda, one of the world's first planned university campuses, provide NATA aspirants with fascinating study material on early spatial planning and community architecture.",
      "highlights": [
        "NIT Patna offers an excellent government architecture program in Eastern India",
        "Ancient Nalanda University ruins provide insight into early Indian campus planning and architecture",
        "Affordable cost of living makes architecture education highly accessible",
        "Growing infrastructure development in Bihar creates emerging opportunities for architects"
      ],
      "updatedAt": "2026-10-01"
    },
    "chandigarh": {
      "description": "Chandigarh is a pilgrimage site for architecture students worldwide, the only city in India designed by the legendary Le Corbusier, with its Capitol Complex now a UNESCO World Heritage Site. The Chandigarh College of Architecture (CCA) is a premier government institution situated in this living laboratory of modernist urban design. NATA aspirants studying here experience world-class architecture in their daily lives, from the geometric sector grid to the brutalist government buildings.",
      "highlights": [
        "Chandigarh is Le Corbusier's masterplanned city, a UNESCO World Heritage site for modern architecture",
        "Chandigarh College of Architecture (CCA) is among the top government architecture schools in North India",
        "The Capitol Complex, Rock Garden, and Sector 17 plaza are iconic modernist landmarks",
        "Living in a planned city provides daily exposure to urban design principles"
      ],
      "updatedAt": "2026-10-01"
    },
    "chhattisgarh": {
      "description": "Chhattisgarh is an emerging destination for architecture education, anchored by NIT Raipur. The state offers NATA aspirants a unique perspective through its rich tribal architectural heritage, featuring sustainable mud, wood, and thatch construction techniques that are gaining renewed global interest. The development of Naya Raipur (Atal Nagar) as a planned smart city provides real-world exposure to modern urban planning and green building practices.",
      "highlights": [
        "NIT Raipur offers an affordable, high-quality government architecture program",
        "Rich tribal architectural heritage with unique mud and wood construction traditions",
        "New capital development at Naya Raipur (Atal Nagar) offers exposure to smart city planning",
        "Among the most affordable states for architecture education in India"
      ],
      "updatedAt": "2026-10-01"
    },
    "dadra-and-nagar-haveli-and-daman-and-diu": {
      "description": "This union territory joins three small regions with very different building stories. Daman and Diu were Portuguese enclaves until 1961, and their sea forts still stand: Moti Daman's walled fort encloses the Church of Bom Jesus, while Diu Fort guards the island's coast near the carved baroque facade of St. Paul's Church. Inland, Dadra and Nagar Haveli around Silvassa is home to Warli, Kokna and other tribal communities, whose houses use mud and cow dung plastered walls, timber posts and thatched or tiled roofs, often decorated with Warli painting. The warm, humid coastal climate rewards deep shade, sloping roofs and good ventilation. Students here usually look to B.Arch colleges in neighbouring Gujarat and Maharashtra and to national counselling through JoSAA and CSAB.",
      "highlights": [
        "Diu Fort, built by the Portuguese in the sixteenth century, guards the island's rocky coastline.",
        "Moti Daman's walled fort encloses the Church of Bom Jesus and other Portuguese era buildings.",
        "Warli tribal homes in Dadra and Nagar Haveli use mud plastered walls, timber posts and painted surfaces."
      ],
      "updatedAt": "2026-10-01"
    },
    "delhi": {
      "description": "Delhi is the epicenter of architecture education in India, home to the School of Planning and Architecture (SPA), an Institute of National Importance. The capital offers NATA aspirants access to an unmatched range of architectural heritage spanning Mughal masterpieces like Humayun's Tomb and Red Fort, Lutyens' grand colonial avenues, and cutting-edge contemporary projects. Delhi also has the highest concentration of architecture practices in the country.",
      "highlights": [
        "SPA Delhi is an Institute of National Importance and one of India's most selective architecture schools",
        "Unparalleled access to Mughal, colonial, and contemporary landmark architecture",
        "Highest concentration of leading architecture firms and design consultancies",
        "Lutyens' Delhi and New Delhi masterplan offer textbook examples of urban design"
      ],
      "updatedAt": "2026-10-01"
    },
    "goa": {
      "description": "Goa's architecture reflects more than four centuries of Portuguese rule blended with local Konkan building craft. The Churches and Convents of Goa, including the Basilica of Bom Jesus and the Se Cathedral in Old Goa, form a UNESCO World Heritage Site. In Panaji, the Fontainhas quarter is lined with colourful lime-washed houses, and village homes across the state show the Indo-Portuguese style: laterite walls, Mangalore-tiled sloping roofs for the heavy monsoon, balcões (covered entrance porches with built-in seats) and windows once glazed with translucent oyster shells. Among modern landmarks, the Kala Academy in Panaji was designed by Charles Correa. Aspirants can also study close to home at the government Goa College of Architecture in Panaji, while JoSAA and CSAB counselling opens national options.",
      "highlights": [
        "The Churches and Convents of Goa, including the Basilica of Bom Jesus, are a UNESCO World Heritage Site.",
        "Traditional Goan houses combine laterite walls, tiled roofs, balcão porches and oyster shell window panes.",
        "Charles Correa designed the Kala Academy, the performing arts centre on the Mandovi riverfront in Panaji."
      ],
      "updatedAt": "2026-10-01"
    },
    "gujarat": {
      "description": "Gujarat is an architecture education powerhouse, home to CEPT University, one of India's best-known architecture schools. Ahmedabad, India's first UNESCO World Heritage City, offers an extraordinary range of architectural study material from medieval pol houses to Le Corbusier's modernist buildings and Louis Kahn's iconic IIM campus. The state has produced some of India's greatest architects, including Pritzker laureate Balkrishna Doshi.",
      "highlights": [
        "CEPT University Ahmedabad is one of India's best-known architecture schools",
        "Ahmedabad is India's first UNESCO World Heritage City for its walled-city pol architecture",
        "Le Corbusier's modernist buildings and IIM Ahmedabad by Louis Kahn are in the city",
        "Strong tradition of architectural practice and education dating back to Balkrishna Doshi"
      ],
      "updatedAt": "2026-10-01"
    },
    "haryana": {
      "description": "Haryana benefits from its strategic location in the National Capital Region, offering architecture students proximity to Delhi's heritage and Gurugram's modern skyline. The state's rapid urbanization, particularly in the Gurugram-Faridabad corridor, provides real-world exposure to contemporary commercial and residential design. Easy access to Le Corbusier's planned city of Chandigarh adds a unique educational advantage for NATA aspirants.",
      "highlights": [
        "Gurugram is a hub for modern high-rise and commercial architecture in the NCR region",
        "Proximity to Delhi provides access to top architecture firms and heritage sites",
        "Chandigarh's Le Corbusier masterplan is easily accessible for study tours",
        "Rapidly developing infrastructure creates strong demand for architecture professionals"
      ],
      "updatedAt": "2026-10-01"
    },
    "himachal-pradesh": {
      "description": "Himachal Pradesh is a living textbook of mountain architecture. In valleys such as Kullu, houses and temples follow kath-kuni construction, where layers of deodar timber alternate with dry stacked stone, giving walls that flex rather than crack during earthquakes. Heavy slate roofs and small windows keep interiors warm through snowy winters. The Hidimba Devi Temple in Manali, with its tiered wooden roofs, is a well known example of the pagoda style. Shimla, the British summer capital, offers a contrast in colonial buildings such as the Viceregal Lodge, now the Indian Institute of Advanced Study, and the Kalka Shimla Railway is part of the UNESCO listed Mountain Railways of India. Within the state, NIT Hamirpur offers a B.Arch programme through JoSAA counselling.",
      "highlights": [
        "Kath-kuni walls alternate deodar timber beams with dry stone, an earthquake resistant Himalayan technique.",
        "The Hidimba Devi Temple in Manali is a timber shrine crowned by tiered pagoda style roofs.",
        "The Kalka Shimla Railway is part of the Mountain Railways of India UNESCO World Heritage Site."
      ],
      "updatedAt": "2026-10-01"
    },
    "jammu-and-kashmir": {
      "description": "Jammu and Kashmir has a rich tradition of timber architecture adapted to cold winters and frequent earthquakes. Old Srinagar uses two clever systems: taq, where timber bands are laced into brick or stone masonry, and dhajji dewari, a timber frame filled with brick or rubble, both known for performing well in tremors. Interiors often feature khatamband ceilings made of small interlocking wooden pieces in geometric patterns. Landmarks include the wooden Khanqah of Shah Hamadan on the Jhelum, the Jamia Masjid with its forest of deodar columns, and the terraced Mughal gardens of Shalimar and Nishat beside Dal Lake. In Jammu, the Mubarak Mandi palace complex blends Rajput, Mughal and European styles. Many aspirants also look to B.Arch colleges in neighbouring states, such as NIT Hamirpur, through JoSAA and CSAB counselling.",
      "highlights": [
        "Dhajji dewari construction fills a timber frame with brick or rubble, helping Srinagar buildings resist earthquakes.",
        "Khatamband ceilings are assembled from small wooden pieces fitted together in geometric patterns.",
        "Shalimar Bagh and Nishat Bagh in Srinagar are terraced Mughal gardens laid out beside Dal Lake."
      ],
      "updatedAt": "2026-10-01"
    },
    "jharkhand": {
      "description": "Jharkhand offers a distinctive architecture education experience anchored by BIT Mesra, a premier deemed university with an excellent architecture program. Jamshedpur, India's first planned industrial city designed by the Tata Group, provides a unique case study in urban planning. The state's rich tribal architectural traditions, using sustainable materials like mud, bamboo, and thatch, offer NATA aspirants valuable lessons in eco-friendly and vernacular design.",
      "highlights": [
        "BIT Mesra is a premier deemed university with a strong architecture program",
        "Jamshedpur, India's first planned industrial city, offers unique urban planning study material",
        "Affordable education and living costs in the state",
        "Rich tribal architectural heritage with sustainable mud and bamboo construction techniques"
      ],
      "updatedAt": "2026-10-01"
    },
    "karnataka": {
      "description": "Karnataka offers a dynamic architecture education landscape anchored by Bengaluru's thriving design community. The state blends ancient Hoysala and Vijayanagara temple architecture with cutting-edge tech-park urbanism, giving NATA aspirants a uniquely diverse architectural vocabulary. BMS College and RV College consistently rank among India's best private architecture programs.",
      "highlights": [
        "Bengaluru is a hub for contemporary architecture and sustainable design firms",
        "BMS College of Architecture is among the top-ranked private architecture schools in India",
        "Proximity to Hampi and Mysore Palace provides world-class heritage architecture for study",
        "Growing IT infrastructure creates demand for architects specializing in tech campus design"
      ],
      "updatedAt": "2026-10-01"
    },
    "kerala": {
      "description": "Kerala stands out for its emphasis on sustainable, climate-responsive architecture education. NIT Calicut and CET Trivandrum are premier government institutions with excellent placement records. The state's distinctive vernacular architecture, sloped roofs, internal courtyards, and natural ventilation, has influenced architects worldwide and provides NATA students with rich material for understanding how design responds to environment.",
      "highlights": [
        "NIT Calicut is one of the top government architecture schools in the country",
        "Kerala's unique tropical vernacular architecture (nalukettu, ettukettu) is studied worldwide",
        "Strong focus on sustainable and climate-responsive design in Kerala architecture programs",
        "Laureate Ar. Laurie Baker's legacy of cost-effective, eco-friendly architecture is deeply rooted in the state"
      ],
      "updatedAt": "2026-10-01"
    },
    "ladakh": {
      "description": "Ladakh is a high altitude cold desert, and its buildings show how to survive extreme cold with very little fuel. Traditional houses use thick walls of sun-dried mud brick on stone bases, flat roofs of poplar and willow topped with packed earth, and small windows turned towards the sun. Monasteries such as Hemis, Thiksey and Alchi cling to hillsides or sit in the Indus valley, and the seventeenth century Leh Palace rises above the old town. Contemporary projects continue this passive solar thinking, including the Druk White Lotus School at Shey and the solar heated earth buildings of the SECMOL campus near Leh. There is no B.Arch college in Ladakh, so students usually look to colleges in other states and to national counselling through JoSAA and CSAB.",
      "highlights": [
        "Ladakhi houses use thick sun-dried mud brick walls that store daytime warmth for freezing nights.",
        "Leh Palace, built in the seventeenth century, overlooks the old town of Leh from a ridge.",
        "The Druk White Lotus School at Shey is a widely studied example of passive solar design."
      ],
      "updatedAt": "2026-10-01"
    },
    "lakshadweep": {
      "description": "Lakshadweep is a group of low coral atolls in the Arabian Sea, and its architecture is shaped by scarce land, fresh water and building materials. Older homes were built with cut coral stone and lime, with coconut timber framing and roofs thatched with coconut fronds, while newer houses mostly use concrete. On Kavaratti, the Ujra Mosque is admired for its carved wooden ceiling. For a design student, the islands are a lesson in building lightly: shaded verandahs, cross ventilation for the humid heat, raised plinths against storm surges, and care for a fragile reef ecosystem. There is no B.Arch college on the islands, so students usually look to mainland colleges, such as NIT Calicut in Kerala, and to national counselling through JoSAA and CSAB for JEE Paper 2.",
      "highlights": [
        "Traditional island homes used coral stone masonry, coconut timber and roofs thatched with coconut palm fronds.",
        "The Ujra Mosque on Kavaratti island is known for its intricately carved wooden ceiling.",
        "On these low-lying coral atolls, raised plinths, deep shade and cross ventilation are central to good design."
      ],
      "updatedAt": "2026-10-01"
    },
    "madhya-pradesh": {
      "description": "Madhya Pradesh, the heart of India, offers architecture students access to some of the country's most iconic built heritage, from the UNESCO-listed Khajuraho temples and Sanchi Stupa to the Nawabi architecture of Bhopal. MANIT Bhopal provides a strong government architecture education. The state's central location, affordable living costs, and rich architectural diversity spanning Buddhist, Hindu, and Islamic traditions make it an excellent base for NATA preparation.",
      "highlights": [
        "MANIT Bhopal is a prestigious NIT with a well-regarded architecture department",
        "Khajuraho temples (UNESCO) and Sanchi Stupa provide world-class heritage architecture for study",
        "Bhopal's blend of Nawabi and modern architecture offers diverse urban contexts",
        "Central location makes it affordable and well-connected for students from across India"
      ],
      "updatedAt": "2026-10-01"
    },
    "maharashtra": {
      "description": "Maharashtra is a major centre of architecture education, home to the legendary Sir J.J. College of Architecture, the country's oldest and most prestigious architecture school, founded in 1857. Mumbai's UNESCO-listed Victorian Gothic and Art Deco buildings provide world-class reference material for NATA aspirants. The state offers the widest range of career opportunities for architects, from heritage conservation to high-rise design.",
      "highlights": [
        "Sir J.J. College of Architecture in Mumbai is the most prestigious architecture school in India",
        "Mumbai's Art Deco and Victorian Gothic heritage is a UNESCO World Heritage ensemble",
        "Largest number of architecture firms and employment opportunities in the country",
        "Pune's growing design ecosystem offers affordable alternatives to Mumbai"
      ],
      "updatedAt": "2026-10-01"
    },
    "manipur": {
      "description": "Manipur sits in an oval valley ringed by hills, and its architecture reflects both Meitei valley culture and the hill traditions of Naga and Kuki communities. Traditional Meitei houses face east, with timber frames, mud plastered walls and steep thatched roofs. Kangla, the historic seat of Manipuri kings in the heart of Imphal, holds gateways, ruins and sacred structures beside the Imphal River. The Shree Govindajee Temple, with its twin domes, is a major place of worship. On Loktak Lake, fishing families live in phumshangs, small huts built on floating mats of vegetation called phumdis. The state lies in a high earthquake zone, which shapes how buildings are framed and roofed. Students usually look to B.Arch colleges in other states and to JoSAA and CSAB counselling.",
      "highlights": [
        "Kangla in Imphal was the historic seat of Manipur's kings, standing beside the Imphal River.",
        "Phumshang huts on Loktak Lake are built on floating mats of vegetation known as phumdis.",
        "Traditional Meitei houses face east and use timber frames, mud plastered walls and thatched roofs."
      ],
      "updatedAt": "2026-10-01"
    },
    "meghalaya": {
      "description": "Meghalaya receives some of the heaviest rainfall on Earth, and its architecture is built around water, slopes and earthquakes. Traditional Khasi houses have rounded ends, raised stone plinths and steep thatched roofs that shed rain quickly. Shillong is known for Assam type houses, with light timber frames, ikra or lath and plaster walls and sloping metal roofs, a system that copes well with tremors. The state's most celebrated structures are not buildings at all: the living root bridges of the Khasi and Jaintia hills, grown by guiding rubber fig roots across streams over many years. Villages such as Mawlynnong are admired for their clean, carefully kept layouts. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB for JEE Paper 2.",
      "highlights": [
        "Living root bridges are grown by training rubber fig roots across streams in the Khasi and Jaintia hills.",
        "Assam type houses in Shillong use light timber frames and sloping roofs suited to earthquakes and rain.",
        "Mawsynram and Sohra (Cherrapunji) receive extreme rainfall, so steep roofs and raised plinths are essential."
      ],
      "updatedAt": "2026-10-01"
    },
    "mizoram": {
      "description": "Mizoram is a land of steep ridges, and building here means building on slopes. Traditional Mizo houses were raised on timber or bamboo stilts on the downhill side, with woven bamboo walls and thatched roofs that keep interiors cool and dry. Villages once centred on the zawlbuk, a bachelors' dormitory that also served as a community hall. In Aizawl, the capital, homes and offices are often entered from a ridge road at the top, with several storeys stepping down the hillside below street level, a striking urban form that raises real questions of slope stability and earthquake safety. Solomon's Temple, a large church in Aizawl, is a well known modern landmark. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB.",
      "highlights": [
        "Aizawl buildings often step down the hillside, with several floors below the level of the road.",
        "Traditional Mizo houses stand on bamboo or timber stilts, with woven bamboo walls and thatched roofs.",
        "The zawlbuk was a traditional bachelors' dormitory at the centre of Mizo village life."
      ],
      "updatedAt": "2026-10-01"
    },
    "nagaland": {
      "description": "Nagaland's architecture is rooted in its many tribal communities, each with distinct house forms. Villages were traditionally built on hilltops for defence, with houses of timber, bamboo and thatch, and many have a morung, a dormitory for young men decorated with carved posts showing hornbills, mithun and other motifs. Kisama Heritage Village near Kohima, the venue of the Hornbill Festival, brings together traditional houses of the major tribes, which makes it a rich field study site. The Catholic Cathedral in Kohima draws on the form of a traditional Naga house, while the Kohima War Cemetery is laid out on terraced slopes. In Dimapur, the Kachari ruins feature carved stone pillars. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB.",
      "highlights": [
        "Kisama Heritage Village near Kohima displays traditional houses of Nagaland's tribes during the Hornbill Festival.",
        "Naga morungs, dormitories for young men, are known for carved wooden posts with hornbill and mithun motifs.",
        "The Kachari ruins in Dimapur feature rows of carved, mushroom shaped stone pillars."
      ],
      "updatedAt": "2026-10-01"
    },
    "odisha": {
      "description": "Odisha is a treasure trove of temple architecture, with Bhubaneswar's 700+ temples and the UNESCO-listed Konark Sun Temple showcasing the magnificent Kalinga style of architecture. NIT Rourkela and CET Bhubaneswar provide strong government architecture programs. NATA aspirants in Odisha benefit from studying some of India's most structurally ambitious ancient buildings, where stone was carved to mimic wooden construction in extraordinary detail.",
      "highlights": [
        "Bhubaneswar is the \"Temple City\" with over 700 temples showcasing Kalinga architecture",
        "NIT Rourkela has a well-regarded architecture department in Eastern India",
        "Konark Sun Temple (UNESCO) is a masterpiece of architectural engineering",
        "Emerging smart city development in Bhubaneswar offers modern urban planning exposure"
      ],
      "updatedAt": "2026-10-01"
    },
    "puducherry": {
      "description": "Puducherry offers a uniquely cosmopolitan architecture education experience, blending French colonial heritage in the White Town quarter with Tamil vernacular traditions and the experimental sustainable architecture of Auroville. Pondicherry University provides a central government architecture program in this charming coastal city. NATA aspirants here benefit from studying how different cultural influences, French, Tamil, and international, have created a distinctive architectural identity within a compact, walkable urban setting.",
      "highlights": [
        "Unique French colonial architecture in the White Town heritage quarter",
        "Auroville, the experimental township, is a globally recognized sustainable architecture project",
        "Pondicherry University offers a central government architecture program",
        "Compact city with walkable heritage zones ideal for architectural sketching and study"
      ],
      "updatedAt": "2026-10-01"
    },
    "punjab": {
      "description": "Punjab's architecture education landscape is enriched by its proximity to Chandigarh, Le Corbusier's masterplanned city that serves as a living laboratory for modern urban design. The state's rich Sikh architectural heritage, epitomized by the Golden Temple in Amritsar, provides NATA aspirants with inspiring examples of sacred architecture, water body integration, and community-oriented design. Punjab offers affordable education with easy access to world-class architectural references.",
      "highlights": [
        "Proximity to Chandigarh, Le Corbusier's planned city and a living architecture textbook",
        "Golden Temple in Amritsar is a masterclass in sacred architecture and water body integration",
        "Strong Sikh architectural heritage with gurdwaras showcasing intricate design",
        "Affordable coaching and living costs compared to Delhi NCR"
      ],
      "updatedAt": "2026-10-01"
    },
    "rajasthan": {
      "description": "Rajasthan is an architect's paradise, boasting UNESCO World Heritage Sites in Jaipur and a stunning collection of forts, palaces, havelis, and stepwells that showcase centuries of climate-responsive desert architecture. MNIT Jaipur anchors the state's architecture education with a top-tier government program. NATA students in Rajasthan benefit from studying how traditional builders solved the challenges of extreme heat, water scarcity, and desert winds, skills highly relevant to modern sustainable design.",
      "highlights": [
        "MNIT Jaipur offers one of the top government architecture programs in North India",
        "Jaipur is a UNESCO World Heritage City with stunning Rajput and Mughal architecture",
        "Rajasthan's diverse building traditions, from desert forts to havelis, provide unmatched study material",
        "Strong focus on climate-responsive desert architecture and sustainable building practices"
      ],
      "updatedAt": "2026-10-01"
    },
    "sikkim": {
      "description": "Sikkim packs subtropical valleys and snow peaks into a small Himalayan state, and its architecture blends Lepcha, Bhutia and Nepali traditions. Lepcha houses were raised on stilts and built of timber and bamboo, while Bhutia homes are known for richly carved and painted wooden windows. Many hill houses use ekra walls, a bamboo mesh plastered with mud or cement that is light and performs well in earthquakes. Monasteries such as Rumtek, Pemayangtse and Enchey show Tibetan Buddhist forms, colours and courtyards, and the ruins of Rabdentse recall an early royal capital. Khangchendzonga National Park is a UNESCO World Heritage Site listed for both natural and cultural values. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB for JEE Paper 2.",
      "highlights": [
        "Khangchendzonga National Park is a UNESCO World Heritage Site listed for both natural and cultural values.",
        "Ekra walls of bamboo mesh plastered with mud or cement keep Sikkim's hill houses light.",
        "Rumtek, Pemayangtse and Enchey monasteries show Tibetan Buddhist architecture, colour and courtyard planning."
      ],
      "updatedAt": "2026-10-01"
    },
    "tamil-nadu": {
      "description": "Tamil Nadu is the architecture education powerhouse of South India, home to Anna University and NIT Trichy, two of the country's most sought-after architecture programs. The state's extraordinary Dravidian temple heritage, from the Brihadeeswarar Temple to Meenakshi Amman, offers students a living laboratory for studying proportion, ornamentation, and spatial design that directly enhances NATA preparation.",
      "highlights": [
        "Home to Anna University, one of India's oldest and most prestigious architecture schools",
        "Rich Dravidian temple architecture provides unmatched real-world study material for NATA drawing",
        "Highest number of CoA-approved architecture colleges in South India",
        "Strong placement record with architecture firms in Chennai's growing urban design sector"
      ],
      "updatedAt": "2026-10-01"
    },
    "telangana": {
      "description": "Telangana, centered on Hyderabad, offers a unique architectural education environment blending Qutb Shahi monuments, Nizam-era palaces, and futuristic HITEC City developments. JNAFAU is a nationally recognized dedicated architecture university, and JNTU Hyderabad has a strong planning and architecture program. NATA aspirants in Telangana benefit from studying one of India's most architecturally diverse cities.",
      "highlights": [
        "JNAFAU Hyderabad is one of the few dedicated architecture and fine arts universities in India",
        "Hyderabad's Qutb Shahi and Nizam-era architecture offers rich Indo-Islamic design study material",
        "Booming IT corridor (HITEC City) creates demand for modern commercial and campus architecture",
        "Lower cost of living compared to other metros makes Hyderabad an affordable study destination"
      ],
      "updatedAt": "2026-10-01"
    },
    "tripura": {
      "description": "Tripura's architecture ranges from royal palaces to bamboo homes. In Agartala, the white Ujjayanta Palace, completed around 1901 by the Manikya rulers, shows Indo-Saracenic domes set in Mughal style gardens and now houses the Tripura State Museum. Neermahal, a palace standing in Rudrasagar Lake at Melaghar, blends Hindu and Islamic elements and was used as a royal summer retreat. Rural and tribal communities traditionally build with bamboo, raising houses on stilts for ventilation and protection from damp, and the state is known for fine bamboo and cane craft. At Unakoti, large rock reliefs carved into a forested hillside reveal a much older artistic tradition. Students usually look to B.Arch colleges in other states and to national counselling through JoSAA and CSAB for JEE Paper 2.",
      "highlights": [
        "Ujjayanta Palace in Agartala, completed around 1901, now houses the Tripura State Museum.",
        "Neermahal is a royal palace built in the middle of Rudrasagar Lake at Melaghar.",
        "Tribal homes in Tripura are often built of bamboo and raised on stilts above damp ground."
      ],
      "updatedAt": "2026-10-01"
    },
    "uttar-pradesh": {
      "description": "Uttar Pradesh offers NATA aspirants an extraordinary wealth of architectural heritage, from the Taj Mahal in Agra to the Mughal fort complexes in Fatehpur Sikri, the Nawabi palaces of Lucknow, and the ancient ghats of Varanasi. AMU Aligarh and IET Lucknow provide strong government architecture programs. The state's affordable cost of living and proximity to Delhi make it an attractive destination for architecture education.",
      "highlights": [
        "Home to the Taj Mahal, the most iconic architectural masterpiece in the world",
        "AMU Aligarh has one of the oldest architecture departments in North India",
        "Lucknow's Nawabi architecture and Varanasi's ghats offer diverse study material",
        "Large student population and affordable coaching options across the state"
      ],
      "updatedAt": "2026-10-01"
    },
    "uttarakhand": {
      "description": "Uttarakhand is home to IIT Roorkee, which has one of the oldest and most highly ranked architecture departments in India, established in 1847. The state's Himalayan setting provides NATA aspirants with unique exposure to mountain architecture, seismic-resistant design, and climate-responsive building techniques. Traditional Garhwali and Kumaoni houses, built with stone and wood to withstand earthquakes and heavy snowfall, offer valuable lessons in vernacular sustainable design.",
      "highlights": [
        "IIT Roorkee, which traces its roots to 1847, has one of the highest-ranked architecture departments in India",
        "Himalayan mountain architecture offers unique study material for climate-responsive design",
        "Dehradun's pleasant climate and affordable living make it ideal for focused NATA preparation",
        "Exposure to earthquake-resistant construction techniques crucial for hill architecture"
      ],
      "updatedAt": "2026-10-01"
    },
    "west-bengal": {
      "description": "West Bengal offers world-class architecture education through IIT Kharagpur, which has the oldest architecture department among all IITs, and Jadavpur University, a premier government institution. Kolkata's extraordinary colonial-era architecture, from the Victoria Memorial to the Raj Bhavan, provides NATA aspirants with a rich tapestry of Gothic, Baroque, and Indo-Saracenic styles. The city's vibrant arts and design culture fosters the creative thinking essential for architecture.",
      "highlights": [
        "IIT Kharagpur has the oldest and most prestigious architecture department among all IITs",
        "Kolkata's colonial architecture, Victoria Memorial, Howrah Bridge, Writers' Building, is iconic",
        "Jadavpur University is a top-ranked government architecture school in Eastern India",
        "Rich tradition of arts and design culture in Kolkata supports creative development"
      ],
      "updatedAt": "2026-10-01"
    }
  };
