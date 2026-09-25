/**
 * Keyword phrases that suggest a Question Bank registry tag, for the Tag
 * coverage screen and for tagging new class checkpoint questions.
 *
 * WHY A DICTIONARY AND NOT A MODEL
 *
 * Half the bank (2,425 of 4,704 questions on 2026-09-25) carried no subject or
 * theme tag, almost all of them class recap checkpoints. A teacher building an
 * "Islamic Architecture" test got zero questions while 131 question texts named
 * a mosque, a Mughal ruler or the Qutub Minar. Monument names, rulers and
 * features are exactly the vocabulary a plain word match gets right, and it
 * costs nothing per question, so this runs with no Gemini call at all. A person
 * still confirms every suggestion before it becomes a tag.
 *
 * RULES FOR EDITING
 *
 * - Keys are registry slugs (nexus_qb_tags.slug). Every theme tag has an entry,
 *   plus the architecture subject tags in ARCHITECTURE_SUBJECT_SLUGS.
 * - Phrases are matched on whole words, case-insensitively, after punctuation is
 *   turned into spaces (see normalizeForMatch in qb-tag-suggest.ts). Write them
 *   in plain lower case; "humayun's tomb" and "humayun s tomb" are the same.
 *   A trailing "s" or "es" is allowed on the last word, so list the singular.
 * - Leave out words that are ordinary English or belong to another subject:
 *   "column" is a matrix column, "pyramid" is a drawing solid, "far" is not a
 *   floor area ratio, "tomb" alone could be anywhere. Prefer the named thing.
 * - One matched phrase is a low-confidence suggestion; two different phrases
 *   make it high confidence. So a phrase that is right only half the time still
 *   helps, as long as it is not the only thing that fires on unrelated questions.
 *
 * Each tag's `aliases` column in the registry is merged in at runtime
 * (mergeTagKeywords), so a teacher can widen a topic without a deploy.
 */

/** Subject tags about architecture that the Tag coverage screen lists beside every theme. */
export const ARCHITECTURE_SUBJECT_SLUGS = [
  'history_of_architecture',
  'architecture_gk',
  'building_materials',
  'famous_architects',
  'building_science',
  'planning',
  'sustainability',
] as const;

export const QB_TAG_KEYWORDS: Record<string, readonly string[]> = {
  // ─── Themes ───────────────────────────────────────────────────────────────

  islamic_architecture: [
    'islam', 'islamic', 'indo islamic', 'muslim', 'mosque', 'masjid', 'jama masjid', 'jami masjid',
    'moti masjid', 'atala masjid', 'mecca masjid', 'badshahi mosque', 'wazir khan',
    'minaret', 'minar', 'qutub minar', 'qutb minar', 'qutub', 'qutb', 'qutbuddin aibak', 'qutb ud din aibak',
    'iltutmish', 'alai darwaza', 'alai minar', 'quwwat ul islam', 'adhai din ka jhonpra',
    'mughal', 'mughal garden', 'mughal architecture', 'delhi sultanate', 'sultanate', 'slave dynasty', 'mamluk',
    'khilji', 'khalji', 'alauddin', 'tughlaq', 'tughluq', 'tughlaqabad', 'firoz shah kotla', 'hauz khas',
    'lodi', 'lodhi', 'lodi garden', 'sayyid dynasty', 'sher shah', 'sher shah suri', 'sasaram',
    'babur', 'humayun', 'akbar', 'jahangir', 'shah jahan', 'shahjahan', 'aurangzeb', 'mumtaz',
    'nur jahan', 'noor jahan', 'jahanara', 'taj mahal', 'fatehpur sikri', 'buland darwaza', 'salim chishti',
    'salim chisti', 'chishti', 'sikandra', 'itmad ud daulah', 'itimad ud daulah', 'bibi ka maqbara',
    'red fort', 'lal qila', 'agra fort', 'diwan i am', 'diwan i khas', 'lahore fort', 'shalimar bagh',
    'shalimar garden', 'nishat bagh', 'charbagh', 'char bagh', 'chahar bagh', 'pietra dura',
    'gol gumbaz', 'bijapur', 'adil shahi', 'ibrahim rauza', 'deccan sultanate', 'bahmani', 'qutb shahi',
    'charminar', 'golconda', 'golkonda', 'bidar', 'sidi saiyyed', 'sidi sayyed', 'jhulta minar',
    'shaking minaret', 'bara imambara', 'chota imambara', 'imambara', 'rumi darwaza', 'dargah', 'khanqah',
    'mihrab', 'minbar', 'qibla', 'iwan', 'madrasa', 'madrasah', 'maqbara', 'onion dome', 'bulbous dome',
    'squinch', 'muqarnas', 'arabesque', 'mashrabiya', 'true arch', 'alhambra', 'dome of the rock',
    'hagia sophia', 'blue mosque', 'sultan ahmed mosque', 'great mosque', 'mezquita', 'cordoba', 'samarra',
    'al aqsa', 'kaaba', 'ottoman', 'mimar sinan', 'safavid', 'isfahan', 'timurid', 'samarkand', 'registan',
    'bukhara',
  ],

  indian_architecture: [
    'indian architecture', 'indian monument', 'ancient india', 'medieval india', 'indian temple',
    'stepwell', 'step well', 'rani ki vav', 'chand baori', 'baori', 'baoli', 'agrasen ki baoli',
    'haveli', 'chhatri', 'jharokha', 'jali', 'jaali', 'vastu', 'vastu shastra', 'indo saracenic',
    'stupa', 'sanchi', 'ajanta', 'ellora', 'elephanta', 'khajuraho', 'konark', 'hampi', 'mahabalipuram',
    'mamallapuram', 'thanjavur', 'tanjore', 'brihadeeswarar', 'brihadeshwara', 'meenakshi', 'madurai',
    'kailasa temple', 'kailasanatha', 'modhera', 'dilwara', 'ranakpur', 'lingaraj', 'jagannath', 'somnath',
    'badami', 'aihole', 'pattadakal', 'belur', 'halebidu', 'somnathpur', 'srirangam', 'chidambaram',
    'rameswaram', 'hawa mahal', 'amber fort', 'amer fort', 'jaisalmer', 'chittorgarh', 'mehrangarh',
    'jantar mantar', 'lotus temple', 'india gate', 'gateway of india', 'rashtrapati bhavan',
    'parliament house', 'sansad bhavan', 'victoria memorial', 'chhatrapati shivaji terminus',
    'victoria terminus', 'vidhana soudha', 'vidhan soudha', 'mysore palace', 'golden temple',
    'harmandir sahib', 'akshardham', 'red fort', 'taj mahal', 'qutub minar', 'qutb minar', 'charminar',
    'gol gumbaz', 'fatehpur sikri', 'humayun', 'nalanda', 'harappa', 'mohenjo daro', 'rock cut',
    'cave temple', 'gopuram', 'shikhara', 'vimana', 'chaitya', 'vihara', 'chandigarh',
    'lutyens', 'unesco world heritage site in india', 'heritage site in india',
  ],

  dravidian_architecture: [
    'dravidian', 'dravida', 'south indian temple', 'gopuram', 'gopura', 'vimana', 'prakara', 'prakaram',
    'chola', 'pallava', 'pandya', 'pandyan', 'nayak', 'nayaka', 'vijayanagara', 'vijayanagar', 'hampi',
    'virupaksha', 'vittala', 'vitthala', 'stone chariot', 'brihadeeswarar', 'brihadeshwara', 'brihadisvara',
    'big temple', 'rajarajeswaram', 'raja raja', 'rajaraja', 'thanjavur', 'tanjore', 'gangaikonda cholapuram',
    'airavatesvara', 'darasuram', 'meenakshi', 'madurai', 'srirangam', 'ranganathaswamy', 'chidambaram',
    'nataraja', 'rameswaram', 'ramanathaswamy', 'kanchipuram', 'kanchi', 'kailasanathar', 'shore temple',
    'mahabalipuram', 'mamallapuram', 'pancha rathas', 'five rathas', 'ratha', 'arjuna s penance',
    'descent of the ganges', 'tiruvannamalai', 'annamalaiyar', 'thousand pillar', 'kalyana mandapa',
    'mandapam', 'tamil nadu temple',
  ],

  indo_aryan_architecture: [
    'indo aryan', 'nagara', 'nagara style', 'north indian temple', 'shikhara', 'sikhara', 'shikara',
    'curvilinear', 'rekha deul', 'pidha deul', 'deul', 'jagamohana', 'jagamohan', 'natamandira',
    'bhogamandapa', 'amalaka', 'amalak', 'kalasha', 'urushringa', 'latina', 'khajuraho',
    'kandariya mahadeva', 'lakshmana temple', 'chandela', 'konark', 'sun temple', 'black pagoda',
    'lingaraj', 'lingaraja', 'jagannath', 'puri', 'bhubaneswar', 'mukteswar', 'mukteshwar',
    'rajarani temple', 'kalinga', 'odisha temple', 'orissa temple', 'modhera', 'solanki', 'dilwara',
    'ranakpur', 'mount abu', 'somnath', 'dashavatara temple', 'deogarh', 'osian', 'gupta temple',
  ],

  buddhist_architecture: [
    'buddhist', 'buddhism', 'buddha', 'stupa', 'chaitya', 'chaitya hall', 'chaitya griha', 'vihara',
    'monastery', 'monasteries', 'sangharama', 'sanchi', 'great stupa', 'torana', 'harmika', 'anda',
    'medhi', 'yashti', 'chhatra', 'vedika', 'pradakshina path', 'ajanta', 'karla', 'karle', 'bhaja',
    'kanheri', 'nalanda', 'bodh gaya', 'bodhgaya', 'mahabodhi', 'sarnath', 'dhamek', 'amaravati',
    'bharhut', 'nagarjunakonda', 'ashoka', 'ashokan', 'ashokan pillar', 'lion capital', 'mauryan',
    'borobudur', 'pagoda', 'shwedagon', 'gompa', 'tawang', 'hemis', 'thiksey', 'tabo', 'rumtek',
  ],

  hindu_temple_architecture: [
    'hindu', 'hindu temple', 'temple', 'temple architecture', 'garbhagriha', 'garbha griha', 'garbhagriya',
    'sanctum', 'sanctum sanctorum', 'mandapa', 'mandapam', 'ardha mandapa', 'ardhamandapa', 'maha mandapa',
    'antarala', 'pradakshina', 'pradakshinapatha', 'circumambulation', 'vimana', 'shikhara', 'sikhara',
    'gopuram', 'amalaka', 'kalasha', 'jagati', 'vastu purusha mandala', 'vastu purusha', 'agama',
    'nagara', 'dravida', 'vesara', 'hoysala', 'chalukya', 'badami', 'aihole', 'pattadakal', 'belur',
    'halebidu', 'halebid', 'somnathpur', 'chennakesava', 'hoysaleswara', 'kailasa temple', 'kailash temple',
    'kailasanatha', 'deity', 'idol', 'shiva', 'vishnu', 'shiva lingam', 'linga', 'lingam', 'nandi',
    'dashavatara', 'khajuraho', 'konark', 'brihadeeswarar', 'meenakshi', 'jagannath', 'somnath',
    'kedarnath', 'badrinath', 'tirupati', 'tirumala', 'sun temple',
  ],

  indus_valley_civilization: [
    'indus', 'indus valley', 'indus valley civilization', 'indus valley civilisation', 'harappa',
    'harappan', 'mohenjo daro', 'mohenjodaro', 'great bath', 'granary', 'citadel', 'lower town',
    'lothal', 'dholavira', 'kalibangan', 'rakhigarhi', 'chanhudaro', 'chanhu daro', 'banawali', 'dockyard',
    'burnt brick', 'baked brick', 'bronze age', 'dancing girl', 'priest king', 'harappan seal',
    'drainage system', 'covered drain',
  ],

  architecture_around_the_world: [
    'eiffel tower', 'colosseum', 'pantheon', 'parthenon', 'acropolis', 'pyramids of giza',
    'great pyramid', 'giza', 'sphinx', 'stonehenge', 'great wall', 'great wall of china', 'forbidden city',
    'angkor wat', 'borobudur', 'petra', 'machu picchu', 'chichen itza', 'christ the redeemer',
    'statue of liberty', 'sydney opera house', 'burj khalifa', 'burj al arab', 'petronas', 'taipei 101',
    'empire state building', 'chrysler building', 'sagrada familia', 'notre dame', 'st peter s basilica',
    'st paul s cathedral', 'westminster abbey', 'big ben', 'leaning tower', 'tower of pisa', 'louvre',
    'guggenheim', 'fallingwater', 'falling water', 'villa savoye', 'farnsworth house', 'seagram building',
    'crystal palace', 'hagia sophia', 'alhambra', 'dome of the rock', 'kremlin', 'st basil s cathedral',
    'neuschwanstein', 'golden gate bridge', 'brooklyn bridge', 'tower bridge', 'sydney harbour bridge',
    'bird s nest', 'cctv headquarters', 'the shard', 'the gherkin', '30 st mary axe',
    'one world trade center', 'marina bay sands', 'shanghai tower', 'jeddah tower', 'habitat 67',
    'brasilia', 'national congress', 'seven wonders', 'wonders of the world', 'gothic cathedral',
    'cathedral', 'basilica', 'mesopotamia', 'ziggurat', 'ancient egypt', 'egyptian', 'ancient greece',
    'greek temple', 'ancient rome', 'roman architecture', 'roman empire', 'byzantine', 'gothic', 'romanesque', 'renaissance', 'baroque',
  ],

  general_architecture_knowledge: [
    'architectural term', 'architectural element', 'architectural feature', 'architectural style',
    'cantilever', 'facade', 'pediment', 'cornice', 'colonnade', 'portico', 'atrium', 'vault',
    'barrel vault', 'groin vault', 'rib vault', 'arch', 'keystone', 'voussoir', 'buttress',
    'flying buttress', 'truss', 'lintel', 'plinth', 'corbel', 'corbelled', 'dome', 'pendentive',
    'entablature', 'frieze', 'architrave', 'baluster', 'balustrade', 'parapet', 'clerestory', 'nave',
    'apse', 'spire', 'cupola', 'oculus', 'loggia', 'pilaster', 'pillar', 'pilotis', 'stilts', 'mezzanine',
    'brise soleil', 'chajja', 'courtyard', 'veranda', 'verandah', 'skylight', 'load bearing',
    'frame structure', 'shell structure', 'tensile structure', 'geodesic dome', 'space frame',
    'doric', 'ionic', 'corinthian', 'tuscan order', 'composite order', 'classical order',
  ],

  // ─── Architecture subjects ─────────────────────────────────────────────────

  history_of_architecture: [
    'history of architecture', 'architectural history', 'ancient', 'medieval', 'dynasty', 'century', 'style of architecture', 'architectural style', 'gothic', 'romanesque',
    'byzantine', 'baroque', 'rococo', 'renaissance', 'neoclassical', 'neo classical', 'classical',
    'ancient greek', 'greek architecture', 'greek temple', 'ancient rome', 'roman architecture',
    'roman empire', 'egyptian', 'mesopotamian', 'ziggurat', 'colonial', 'indo saracenic', 'art deco',
    'art nouveau', 'modernism', 'modern movement', 'bauhaus', 'brutalism', 'brutalist',
    'deconstructivism', 'postmodern', 'postmodernism', 'international style', 'heritage', 'monument',
    'archaeological', 'excavation', 'chola', 'pallava', 'chalukya', 'hoysala', 'vijayanagara', 'mughal',
    'gupta', 'maurya', 'mauryan', 'rajput', 'delhi sultanate', 'pandya', 'kushan', 'satavahana',
    'harappan', 'indus valley', 'built by', 'constructed by', 'commissioned by',
  ],

  architecture_gk: [
    'pritzker', 'pritzker prize', 'unesco', 'world heritage', 'world heritage site', 'tallest building',
    'tallest structure', 'largest dome', 'skyscraper', 'burj khalifa', 'eiffel tower', 'sydney opera house',
    'statue of liberty', 'statue of unity', 'colosseum', 'parthenon', 'lotus temple', 'india gate',
    'gateway of india', 'victoria memorial', 'rashtrapati bhavan', 'parliament house', 'central vista',
    'golden temple', 'hawa mahal', 'taj mahal', 'qutub minar', 'charminar', 'famous building',
    'famous monument', 'monument', 'landmark', 'designed the', 'architect of', 'who designed',
    'capital complex', 'aga khan award', 'riba', 'council of architecture', 'hudco', 'nasa india',
    'indian institute of architects',
  ],

  building_materials: [
    'building material', 'construction material', 'brick', 'fly ash brick', 'concrete',
    'reinforced concrete', 'rcc', 'pcc', 'cement', 'portland cement', 'mortar', 'lime', 'lime mortar',
    'lime plaster', 'timber', 'wood', 'bamboo', 'steel', 'glass', 'stone', 'granite', 'marble',
    'sandstone', 'red sandstone', 'laterite', 'limestone', 'slate', 'basalt', 'aluminium', 'aluminum',
    'plywood', 'gypsum', 'plaster', 'plaster of paris', 'terracotta', 'clay', 'adobe', 'rammed earth',
    'compressed earth block', 'mud', 'fly ash', 'aggregate', 'admixture', 'curing', 'stucco',
    'tile', 'thatch', 'ferrocement', 'precast', 'prestressed', 'glulam', 'cross laminated timber',
    'polycarbonate', 'bitumen', 'asphalt', 'copper', 'bronze', 'wrought iron',
    'cast iron',
  ],

  famous_architects: [
    'le corbusier', 'corbusier', 'frank lloyd wright', 'zaha hadid', 'charles correa', 'b v doshi',
    'bv doshi', 'balkrishna doshi', 'balakrishna doshi', 'laurie baker', 'geoffrey bawa', 'louis kahn',
    'mies van der rohe', 'walter gropius', 'i m pei', 'norman foster', 'renzo piano', 'tadao ando',
    'frank gehry', 'rem koolhaas', 'oscar niemeyer', 'antoni gaudi', 'gaudi', 'alvar aalto', 'raj rewal',
    'achyut kanvinde', 'anant raje', 'hafeez contractor', 'christopher benninger', 'edwin lutyens',
    'lutyens', 'herbert baker', 'robert chisholm', 'charles mant', 'f w stevens', 'ustad ahmad lahauri',
    'lahauri', 'bjarke ingels', 'santiago calatrava', 'jorn utzon', 'eero saarinen', 'philip johnson',
    'kenzo tange', 'shigeru ban', 'kengo kuma', 'anupama kundoo', 'sheila sri prakash', 'nari gandhi',
    'pierre jeanneret', 'jane drew', 'maxwell fry', 'albert mayer', 'matthew nowicki', 'eladio dieste',
    'buckminster fuller', 'richard rogers', 'jean nouvel', 'herzog', 'de meuron', 'daniel libeskind',
    'peter eisenman', 'robert venturi', 'aldo rossi', 'luis barragan', 'glenn murcutt', 'wang shu',
    'alejandro aravena', 'diebedo francis kere', 'francis kere', 'david chipperfield', 'riken yamamoto',
    'liu jiakun', 'mimar sinan', 'andrea palladio', 'palladio', 'brunelleschi', 'michelangelo',
    'christopher wren', 'vitruvius', 'imhotep', 'pritzker', 'famous architect',
  ],

  building_science: [
    'building science', 'thermal comfort', 'insulation', 'thermal insulation', 'u value',
    'thermal conductivity', 'thermal mass', 'heat gain', 'heat loss', 'daylight', 'daylighting',
    'ventilation', 'cross ventilation', 'natural ventilation', 'stack effect', 'humidity',
    'relative humidity', 'shading device', 'sun shading', 'sun path', 'solar radiation', 'solar gain',
    'building orientation', 'microclimate', 'climate', 'overhang', 'louver', 'louvre', 'vertical fin',
    'wind catcher', 'wind tower', 'passive cooling', 'evaporative cooling', 'heat island',
    'urban heat island', 'glare', 'condensation', 'reverberation', 'acoustics', 'sound insulation',
    'decibel', 'lux', 'daylight factor', 'building physics',
  ],

  planning: [
    'town planning', 'urban planning', 'city planning', 'regional planning', 'master plan', 'zoning',
    'land use', 'gridiron', 'grid iron', 'garden city', 'ebenezer howard', 'neighbourhood unit',
    'neighborhood unit', 'clarence perry', 'radburn', 'satellite town', 'new town', 'smart city',
    'floor area ratio', 'fsi', 'floor space index', 'setback', 'ground coverage', 'urban design',
    'road hierarchy', 'cul de sac', 'green belt', 'urban sprawl', 'slum', 'housing', 'population density',
    'chandigarh', 'navi mumbai', 'gandhinagar', 'bhubaneswar plan', 'patrick geddes', 'doxiadis',
    'site planning', 'space planning', 'transit oriented development', 'mixed use', 'bye law', 'bylaw',
  ],

  sustainability: [
    'sustainable', 'sustainability', 'sustainable architecture', 'green building', 'griha', 'leed',
    'igbc', 'net zero', 'carbon footprint', 'embodied energy', 'renewable', 'renewable energy',
    'solar panel', 'photovoltaic', 'rainwater harvesting', 'recycled', 'recycle', 'energy efficient',
    'energy efficiency', 'passive design', 'passive solar', 'green roof', 'eco friendly',
    'climate responsive', 'bioclimatic', 'bio climatic', 'grey water', 'greywater', 'biodegradable',
    'vernacular', 'environment friendly', 'carbon neutral', 'energy conservation', 'ecbc',
  ],
};

/** A registry tag as the dictionary needs it: its slug and its alias list. */
export interface KeywordTag {
  slug: string;
  aliases?: string[] | null;
}

/**
 * The phrases for one tag: the dictionary's own plus the registry aliases.
 * De-duplicated, trimmed, empty strings dropped. A tag with neither gets [].
 */
export function keywordsForTag(tag: KeywordTag): string[] {
  const out = new Set<string>();
  for (const phrase of QB_TAG_KEYWORDS[tag.slug] || []) {
    const p = phrase.trim().toLowerCase();
    if (p) out.add(p);
  }
  for (const alias of tag.aliases || []) {
    const p = typeof alias === 'string' ? alias.trim().toLowerCase() : '';
    if (p) out.add(p);
  }
  return [...out];
}

/** Every given tag's phrases, keyed by slug. Tags with no phrases are left out. */
export function mergeTagKeywords(tags: KeywordTag[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const tag of tags) {
    const phrases = keywordsForTag(tag);
    if (phrases.length > 0) out[tag.slug] = phrases;
  }
  return out;
}
