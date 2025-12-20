/**
 * Location data for NATA coaching center pages
 * Used for generating static pages and location-based SEO
 */

export interface Location {
  city: string;
  cityDisplay: string;
  state: string;
  stateDisplay: string;
  country: string;
  region: 'south-india' | 'north-india' | 'west-india' | 'east-india' | 'central-india' | 'gulf';
}

export const locations: Location[] = [
  // Tamil Nadu
  { city: 'chennai', cityDisplay: 'Chennai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'coimbatore', cityDisplay: 'Coimbatore', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'madurai', cityDisplay: 'Madurai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'trichy', cityDisplay: 'Trichy', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'salem', cityDisplay: 'Salem', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'tirunelveli', cityDisplay: 'Tirunelveli', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'erode', cityDisplay: 'Erode', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'vellore', cityDisplay: 'Vellore', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'thoothukudi', cityDisplay: 'Thoothukudi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'tiruppur', cityDisplay: 'Tiruppur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'dindigul', cityDisplay: 'Dindigul', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'thanjavur', cityDisplay: 'Thanjavur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'ranipet', cityDisplay: 'Ranipet', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'sivakasi', cityDisplay: 'Sivakasi', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'karur', cityDisplay: 'Karur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'hosur', cityDisplay: 'Hosur', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'nagercoil', cityDisplay: 'Nagercoil', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'kanchipuram', cityDisplay: 'Kanchipuram', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'kumbakonam', cityDisplay: 'Kumbakonam', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'tiruvannamalai', cityDisplay: 'Tiruvannamalai', state: 'tamil-nadu', stateDisplay: 'Tamil Nadu', country: 'india', region: 'south-india' },
  { city: 'pondicherry', cityDisplay: 'Pondicherry', state: 'puducherry', stateDisplay: 'Puducherry', country: 'india', region: 'south-india' },

  // Karnataka
  { city: 'bangalore', cityDisplay: 'Bangalore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'mysore', cityDisplay: 'Mysore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'mangalore', cityDisplay: 'Mangalore', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'hubli', cityDisplay: 'Hubli', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'belgaum', cityDisplay: 'Belgaum', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'gulbarga', cityDisplay: 'Gulbarga', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'davangere', cityDisplay: 'Davangere', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'bellary', cityDisplay: 'Bellary', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'shimoga', cityDisplay: 'Shimoga', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },
  { city: 'tumkur', cityDisplay: 'Tumkur', state: 'karnataka', stateDisplay: 'Karnataka', country: 'india', region: 'south-india' },

  // Kerala
  { city: 'thiruvananthapuram', cityDisplay: 'Thiruvananthapuram', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'kochi', cityDisplay: 'Kochi', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'kozhikode', cityDisplay: 'Kozhikode', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'thrissur', cityDisplay: 'Thrissur', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'kollam', cityDisplay: 'Kollam', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'palakkad', cityDisplay: 'Palakkad', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'alappuzha', cityDisplay: 'Alappuzha', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'kannur', cityDisplay: 'Kannur', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },
  { city: 'kottayam', cityDisplay: 'Kottayam', state: 'kerala', stateDisplay: 'Kerala', country: 'india', region: 'south-india' },

  // Andhra Pradesh & Telangana
  { city: 'hyderabad', cityDisplay: 'Hyderabad', state: 'telangana', stateDisplay: 'Telangana', country: 'india', region: 'south-india' },
  { city: 'visakhapatnam', cityDisplay: 'Visakhapatnam', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },
  { city: 'vijayawada', cityDisplay: 'Vijayawada', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },
  { city: 'guntur', cityDisplay: 'Guntur', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },
  { city: 'tirupati', cityDisplay: 'Tirupati', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },
  { city: 'warangal', cityDisplay: 'Warangal', state: 'telangana', stateDisplay: 'Telangana', country: 'india', region: 'south-india' },
  { city: 'nellore', cityDisplay: 'Nellore', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },
  { city: 'rajahmundry', cityDisplay: 'Rajahmundry', state: 'andhra-pradesh', stateDisplay: 'Andhra Pradesh', country: 'india', region: 'south-india' },

  // Maharashtra
  { city: 'mumbai', cityDisplay: 'Mumbai', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },
  { city: 'pune', cityDisplay: 'Pune', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },
  { city: 'nagpur', cityDisplay: 'Nagpur', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },
  { city: 'nashik', cityDisplay: 'Nashik', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },
  { city: 'aurangabad', cityDisplay: 'Aurangabad', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },
  { city: 'thane', cityDisplay: 'Thane', state: 'maharashtra', stateDisplay: 'Maharashtra', country: 'india', region: 'west-india' },

  // Gujarat
  { city: 'ahmedabad', cityDisplay: 'Ahmedabad', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india' },
  { city: 'surat', cityDisplay: 'Surat', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india' },
  { city: 'vadodara', cityDisplay: 'Vadodara', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india' },
  { city: 'rajkot', cityDisplay: 'Rajkot', state: 'gujarat', stateDisplay: 'Gujarat', country: 'india', region: 'west-india' },

  // Delhi NCR
  { city: 'delhi', cityDisplay: 'Delhi', state: 'delhi', stateDisplay: 'Delhi', country: 'india', region: 'north-india' },
  { city: 'noida', cityDisplay: 'Noida', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india' },
  { city: 'gurgaon', cityDisplay: 'Gurgaon', state: 'haryana', stateDisplay: 'Haryana', country: 'india', region: 'north-india' },
  { city: 'faridabad', cityDisplay: 'Faridabad', state: 'haryana', stateDisplay: 'Haryana', country: 'india', region: 'north-india' },
  { city: 'ghaziabad', cityDisplay: 'Ghaziabad', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india' },

  // Other North India
  { city: 'jaipur', cityDisplay: 'Jaipur', state: 'rajasthan', stateDisplay: 'Rajasthan', country: 'india', region: 'north-india' },
  { city: 'lucknow', cityDisplay: 'Lucknow', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india' },
  { city: 'kanpur', cityDisplay: 'Kanpur', state: 'uttar-pradesh', stateDisplay: 'Uttar Pradesh', country: 'india', region: 'north-india' },
  { city: 'chandigarh', cityDisplay: 'Chandigarh', state: 'chandigarh', stateDisplay: 'Chandigarh', country: 'india', region: 'north-india' },
  { city: 'dehradun', cityDisplay: 'Dehradun', state: 'uttarakhand', stateDisplay: 'Uttarakhand', country: 'india', region: 'north-india' },
  { city: 'amritsar', cityDisplay: 'Amritsar', state: 'punjab', stateDisplay: 'Punjab', country: 'india', region: 'north-india' },
  { city: 'ludhiana', cityDisplay: 'Ludhiana', state: 'punjab', stateDisplay: 'Punjab', country: 'india', region: 'north-india' },

  // East India
  { city: 'kolkata', cityDisplay: 'Kolkata', state: 'west-bengal', stateDisplay: 'West Bengal', country: 'india', region: 'east-india' },
  { city: 'patna', cityDisplay: 'Patna', state: 'bihar', stateDisplay: 'Bihar', country: 'india', region: 'east-india' },
  { city: 'bhubaneswar', cityDisplay: 'Bhubaneswar', state: 'odisha', stateDisplay: 'Odisha', country: 'india', region: 'east-india' },
  { city: 'ranchi', cityDisplay: 'Ranchi', state: 'jharkhand', stateDisplay: 'Jharkhand', country: 'india', region: 'east-india' },
  { city: 'guwahati', cityDisplay: 'Guwahati', state: 'assam', stateDisplay: 'Assam', country: 'india', region: 'east-india' },

  // Central India
  { city: 'indore', cityDisplay: 'Indore', state: 'madhya-pradesh', stateDisplay: 'Madhya Pradesh', country: 'india', region: 'central-india' },
  { city: 'bhopal', cityDisplay: 'Bhopal', state: 'madhya-pradesh', stateDisplay: 'Madhya Pradesh', country: 'india', region: 'central-india' },
  { city: 'raipur', cityDisplay: 'Raipur', state: 'chhattisgarh', stateDisplay: 'Chhattisgarh', country: 'india', region: 'central-india' },

  // Gulf Countries
  { city: 'dubai', cityDisplay: 'Dubai', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf' },
  { city: 'abu-dhabi', cityDisplay: 'Abu Dhabi', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf' },
  { city: 'sharjah', cityDisplay: 'Sharjah', state: 'uae', stateDisplay: 'UAE', country: 'uae', region: 'gulf' },
  { city: 'doha', cityDisplay: 'Doha', state: 'qatar', stateDisplay: 'Qatar', country: 'qatar', region: 'gulf' },
  { city: 'muscat', cityDisplay: 'Muscat', state: 'oman', stateDisplay: 'Oman', country: 'oman', region: 'gulf' },
  { city: 'riyadh', cityDisplay: 'Riyadh', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf' },
  { city: 'jeddah', cityDisplay: 'Jeddah', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf' },
  { city: 'dammam', cityDisplay: 'Dammam', state: 'saudi-arabia', stateDisplay: 'Saudi Arabia', country: 'saudi-arabia', region: 'gulf' },
  { city: 'kuwait-city', cityDisplay: 'Kuwait City', state: 'kuwait', stateDisplay: 'Kuwait', country: 'kuwait', region: 'gulf' },
  { city: 'manama', cityDisplay: 'Manama', state: 'bahrain', stateDisplay: 'Bahrain', country: 'bahrain', region: 'gulf' },
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
