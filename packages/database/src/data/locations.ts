/**
 * Location data for NATA coaching center pages
 * Used for generating static pages and location-based SEO
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all location pages.
 * Both the page component and sitemap.ts import from here.
 * To add a new city, add it here and it will automatically appear in both.
 */

export interface Location {
  city: string;
  cityDisplay: string;
  state: string;
  stateDisplay: string;
  country: string;
  region: 'south-india' | 'north-india' | 'west-india' | 'east-india' | 'central-india' | 'gulf';
  /** Controls sitemap inclusion and robots indexing:
   * - high: included in sitemap, indexed by Google (major metros, state capitals)
   * - medium: included in sitemap, indexed by Google (district HQs, decent population)
   * - low: NOT in sitemap, noindex (small towns, minor cities) */
  sitemapPriority: 'high' | 'medium' | 'low';
}

export const locations: Location[] = [
  // Tamil Nadu - All 38 districts + key towns
  { city: 'chennai', cityDisplay: 'Chennai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'coimbatore', cityDisplay: 'Coimbatore', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'madurai', cityDisplay: 'Madurai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'trichy', cityDisplay: 'Trichy', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'salem', cityDisplay: 'Salem', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'tirunelveli', cityDisplay: 'Tirunelveli', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'erode', cityDisplay: 'Erode', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'vellore', cityDisplay: 'Vellore', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'thoothukudi', cityDisplay: 'Thoothukudi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'tiruppur', cityDisplay: 'Tiruppur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'dindigul', cityDisplay: 'Dindigul', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'thanjavur', cityDisplay: 'Thanjavur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'ranipet', cityDisplay: 'Ranipet', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'sivakasi', cityDisplay: 'Sivakasi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'karur', cityDisplay: 'Karur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'hosur', cityDisplay: 'Hosur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'nagercoil', cityDisplay: 'Nagercoil', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'kanchipuram', cityDisplay: 'Kanchipuram', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'kumbakonam', cityDisplay: 'Kumbakonam', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'tiruvannamalai', cityDisplay: 'Tiruvannamalai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'udhagamandalam', cityDisplay: 'Udhagamandalam (Ooty)', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'rajapalayam', cityDisplay: 'Rajapalayam', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'pudukkottai', cityDisplay: 'Pudukkottai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'ambur', cityDisplay: 'Ambur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'nagapattinam', cityDisplay: 'Nagapattinam', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'chengalpattu', cityDisplay: 'Chengalpattu', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'ariyalur', cityDisplay: 'Ariyalur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'kallakurichi', cityDisplay: 'Kallakurichi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'krishnagiri', cityDisplay: 'Krishnagiri', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'dharmapuri', cityDisplay: 'Dharmapuri', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'mayiladuthurai', cityDisplay: 'Mayiladuthurai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'perambalur', cityDisplay: 'Perambalur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'ramanathapuram', cityDisplay: 'Ramanathapuram', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'sivaganga', cityDisplay: 'Sivaganga', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'tenkasi', cityDisplay: 'Tenkasi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'theni', cityDisplay: 'Theni', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'thiruvarur', cityDisplay: 'Thiruvarur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'viluppuram', cityDisplay: 'Viluppuram', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'virudhunagar', cityDisplay: 'Virudhunagar', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'pondicherry', cityDisplay: 'Pondicherry', state: 'puducherry', stateDisplay: 'Puducherry', country: 'india', region: 'south-india', sitemapPriority: 'medium' },

  // Karnataka - All 31 districts
  { city: 'bangalore', cityDisplay: 'Bangalore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'mysore', cityDisplay: 'Mysore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'mangalore', cityDisplay: 'Mangalore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'hubli', cityDisplay: 'Hubli', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'belgaum', cityDisplay: 'Belgaum', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'gulbarga', cityDisplay: 'Gulbarga', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'davangere', cityDisplay: 'Davangere', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'bellary', cityDisplay: 'Bellary', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'shimoga', cityDisplay: 'Shimoga', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'tumkur', cityDisplay: 'Tumkur', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'bidar', cityDisplay: 'Bidar', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'chamarajanagar', cityDisplay: 'Chamarajanagar', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'chikkaballapura', cityDisplay: 'Chikkaballapura', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'chikkamagaluru', cityDisplay: 'Chikkamagaluru', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'chitradurga', cityDisplay: 'Chitradurga', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'dharwad', cityDisplay: 'Dharwad', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'gadag', cityDisplay: 'Gadag', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'hassan', cityDisplay: 'Hassan', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'haveri', cityDisplay: 'Haveri', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'kodagu', cityDisplay: 'Kodagu', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'kolar', cityDisplay: 'Kolar', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'koppal', cityDisplay: 'Koppal', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'mandya', cityDisplay: 'Mandya', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'raichur', cityDisplay: 'Raichur', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'ramanagara', cityDisplay: 'Ramanagara', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'udupi', cityDisplay: 'Udupi', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'karwar', cityDisplay: 'Karwar', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'bijapur', cityDisplay: 'Bijapur', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'yadgir', cityDisplay: 'Yadgir', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'vijayanagara', cityDisplay: 'Vijayanagara', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'bengaluru-rural', cityDisplay: 'Bengaluru Rural', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india', sitemapPriority: 'low' },

  // Kerala
  { city: 'thiruvananthapuram', cityDisplay: 'Thiruvananthapuram', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'kochi', cityDisplay: 'Kochi', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'kozhikode', cityDisplay: 'Kozhikode', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'thrissur', cityDisplay: 'Thrissur', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'kollam', cityDisplay: 'Kollam', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'palakkad', cityDisplay: 'Palakkad', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'alappuzha', cityDisplay: 'Alappuzha', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'kannur', cityDisplay: 'Kannur', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'kottayam', cityDisplay: 'Kottayam', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india', sitemapPriority: 'low' },

  // Andhra Pradesh & Telangana
  { city: 'hyderabad', cityDisplay: 'Hyderabad', state: 'telangana', stateDisplay: 'Telangana', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'visakhapatnam', cityDisplay: 'Visakhapatnam', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'vijayawada', cityDisplay: 'Vijayawada', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'high' },
  { city: 'guntur', cityDisplay: 'Guntur', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'tirupati', cityDisplay: 'Tirupati', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'warangal', cityDisplay: 'Warangal', state: 'telangana', stateDisplay: 'Telangana', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'nellore', cityDisplay: 'Nellore', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'medium' },
  { city: 'rajahmundry', cityDisplay: 'Rajahmundry', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'low' },
  { city: 'kakinada', cityDisplay: 'Kakinada', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india', sitemapPriority: 'low' },

  // Maharashtra
  { city: 'mumbai', cityDisplay: 'Mumbai', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'high' },
  { city: 'pune', cityDisplay: 'Pune', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'high' },
  { city: 'nagpur', cityDisplay: 'Nagpur', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'high' },
  { city: 'nashik', cityDisplay: 'Nashik', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'medium' },
  { city: 'aurangabad', cityDisplay: 'Aurangabad', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'medium' },
  { city: 'thane', cityDisplay: 'Thane', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india', sitemapPriority: 'medium' },

  // Gujarat
  { city: 'ahmedabad', cityDisplay: 'Ahmedabad', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india', sitemapPriority: 'high' },
  { city: 'surat', cityDisplay: 'Surat', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india', sitemapPriority: 'medium' },
  { city: 'vadodara', cityDisplay: 'Vadodara', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india', sitemapPriority: 'medium' },
  { city: 'rajkot', cityDisplay: 'Rajkot', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india', sitemapPriority: 'medium' },

  // Delhi NCR
  { city: 'delhi', cityDisplay: 'Delhi', state: 'delhi', stateDisplay: 'Delhi', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'noida', cityDisplay: 'Noida', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'gurgaon', cityDisplay: 'Gurgaon', state: 'haryana', stateDisplay: 'Haryana', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'faridabad', cityDisplay: 'Faridabad', state: 'haryana', stateDisplay: 'Haryana', country: 'india', region: 'north-india', sitemapPriority: 'medium' },
  { city: 'ghaziabad', cityDisplay: 'Ghaziabad', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india', sitemapPriority: 'medium' },

  // Other North India
  { city: 'jaipur', cityDisplay: 'Jaipur', state: 'rajasthan', stateDisplay: 'Rajasthan', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'lucknow', cityDisplay: 'Lucknow', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'kanpur', cityDisplay: 'Kanpur', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india', sitemapPriority: 'medium' },
  { city: 'chandigarh', cityDisplay: 'Chandigarh', state: 'chandigarh', stateDisplay: 'Chandigarh', country: 'india', region: 'north-india', sitemapPriority: 'high' },
  { city: 'dehradun', cityDisplay: 'Dehradun', state: 'uttarakhand', stateDisplay: 'Uttarakhand', country: 'india', region: 'north-india', sitemapPriority: 'medium' },
  { city: 'amritsar', cityDisplay: 'Amritsar', state: 'punjab', stateDisplay: 'Punjab', country: 'india', region: 'north-india', sitemapPriority: 'medium' },
  { city: 'ludhiana', cityDisplay: 'Ludhiana', state: 'punjab', stateDisplay: 'Punjab', country: 'india', region: 'north-india', sitemapPriority: 'medium' },

  // East India
  { city: 'kolkata', cityDisplay: 'Kolkata', state: 'west-bengal', stateDisplay: 'West Bengal', country: 'india', region: 'east-india', sitemapPriority: 'high' },
  { city: 'patna', cityDisplay: 'Patna', state: 'bihar', stateDisplay: 'Bihar', country: 'india', region: 'east-india', sitemapPriority: 'high' },
  { city: 'bhubaneswar', cityDisplay: 'Bhubaneswar', state: 'odisha', stateDisplay: 'Odisha', country: 'india', region: 'east-india', sitemapPriority: 'high' },
  { city: 'ranchi', cityDisplay: 'Ranchi', state: 'jharkhand', stateDisplay: 'Jharkhand', country: 'india', region: 'east-india', sitemapPriority: 'medium' },
  { city: 'guwahati', cityDisplay: 'Guwahati', state: 'assam', stateDisplay: 'Assam', country: 'india', region: 'east-india', sitemapPriority: 'medium' },

  // Central India
  { city: 'indore', cityDisplay: 'Indore', state: 'madhya-pradesh', stateDisplay: 'Madhya Pradesh', country: 'india', region: 'central-india', sitemapPriority: 'medium' },
  { city: 'bhopal', cityDisplay: 'Bhopal', state: 'madhya-pradesh', stateDisplay: 'Madhya Pradesh', country: 'india', region: 'central-india', sitemapPriority: 'medium' },
  { city: 'raipur', cityDisplay: 'Raipur', state: 'chhattisgarh', stateDisplay: 'Chhattisgarh', country: 'india', region: 'central-india', sitemapPriority: 'medium' },

  // UAE
  { city: 'dubai', cityDisplay: 'Dubai', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'high' },
  { city: 'abu-dhabi', cityDisplay: 'Abu Dhabi', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'medium' },
  { city: 'sharjah', cityDisplay: 'Sharjah', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'medium' },
  { city: 'ajman', cityDisplay: 'Ajman', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'low' },
  { city: 'ras-al-khaimah', cityDisplay: 'Ras Al Khaimah', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'low' },
  { city: 'fujairah', cityDisplay: 'Fujairah', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf', sitemapPriority: 'low' },

  // Qatar
  { city: 'doha', cityDisplay: 'Doha', state: 'qatar', stateDisplay: 'Qatar', country: 'qatar', region: 'gulf', sitemapPriority: 'high' },
  { city: 'al-wakrah', cityDisplay: 'Al Wakrah', state: 'qatar', stateDisplay: 'Qatar', country: 'qatar', region: 'gulf', sitemapPriority: 'low' },
  { city: 'al-khor', cityDisplay: 'Al Khor', state: 'qatar', stateDisplay: 'Qatar', country: 'qatar', region: 'gulf', sitemapPriority: 'low' },
  { city: 'lusail', cityDisplay: 'Lusail', state: 'qatar', stateDisplay: 'Qatar', country: 'qatar', region: 'gulf', sitemapPriority: 'low' },

  // Oman
  { city: 'muscat', cityDisplay: 'Muscat', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'high' },
  { city: 'seeb', cityDisplay: 'Seeb', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'low' },
  { city: 'sohar', cityDisplay: 'Sohar', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'low' },
  { city: 'salalah', cityDisplay: 'Salalah', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'low' },
  { city: 'nizwa', cityDisplay: 'Nizwa', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'low' },
  { city: 'sur', cityDisplay: 'Sur', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf', sitemapPriority: 'low' },

  // Saudi Arabia
  { city: 'riyadh', cityDisplay: 'Riyadh', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'high' },
  { city: 'jeddah', cityDisplay: 'Jeddah', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'medium' },
  { city: 'dammam', cityDisplay: 'Dammam', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'medium' },
  { city: 'al-khobar', cityDisplay: 'Al Khobar', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'low' },
  { city: 'jubail', cityDisplay: 'Jubail', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'low' },
  { city: 'yanbu', cityDisplay: 'Yanbu', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'low' },
  { city: 'makkah', cityDisplay: 'Makkah', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'low' },
  { city: 'madinah', cityDisplay: 'Madinah', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf', sitemapPriority: 'low' },

  // Kuwait
  { city: 'kuwait-city', cityDisplay: 'Kuwait City', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf', sitemapPriority: 'high' },
  { city: 'farwaniya', cityDisplay: 'Farwaniya', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf', sitemapPriority: 'low' },
  { city: 'salmiya', cityDisplay: 'Salmiya', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf', sitemapPriority: 'low' },
  { city: 'hawally', cityDisplay: 'Hawally', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf', sitemapPriority: 'low' },
  { city: 'mangaf', cityDisplay: 'Mangaf', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf', sitemapPriority: 'low' },

  // Bahrain
  { city: 'manama', cityDisplay: 'Manama', state: 'bahrain', stateDisplay: 'Bahrain', country: 'bahrain', region: 'gulf', sitemapPriority: 'medium' },
  { city: 'muharraq', cityDisplay: 'Muharraq', state: 'bahrain', stateDisplay: 'Bahrain', country: 'bahrain', region: 'gulf', sitemapPriority: 'low' },
  { city: 'riffa', cityDisplay: 'Riffa', state: 'bahrain', stateDisplay: 'Bahrain', country: 'bahrain', region: 'gulf', sitemapPriority: 'low' },
];

export function getLocationByCity(city: string): Location | undefined {
  return locations.find((loc) => loc.city === city);
}

export function getLocationsByState(state: string): Location[] {
  return locations.filter((loc) => loc.state === state);
}

export function getLocationsByRegion(region: Location['region']): Location[] {
  return locations.filter((loc) => loc.region === region);
}

export function getAllCities(): string[] {
  return locations.map((loc) => loc.city);
}

export function getSitemapLocations(): Location[] {
  return locations.filter((loc) => loc.sitemapPriority !== 'low');
}

export function getHighPriorityLocations(): Location[] {
  return locations.filter((loc) => loc.sitemapPriority === 'high');
}
