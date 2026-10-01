import type { GeoState } from './types';

/**
 * All 28 states and 8 union territories. `counsellingHubs` lists the state's own
 * B.Arch counselling hub(s); the national JoSAA and CSAB rounds apply everywhere
 * and are added by the page, not repeated here.
 */
export const STATES: GeoState[] = [
  // South
  { slug: 'tamil-nadu', name: 'Tamil Nadu', type: 'state', capital: 'Chennai', region: 'south', counsellingHubs: ['tnea-barch'] },
  { slug: 'karnataka', name: 'Karnataka', type: 'state', capital: 'Bangalore', region: 'south', counsellingHubs: ['kea-barch'] },
  { slug: 'kerala', name: 'Kerala', type: 'state', capital: 'Thiruvananthapuram', region: 'south', counsellingHubs: ['keam-arch'] },
  { slug: 'andhra-pradesh', name: 'Andhra Pradesh', type: 'state', capital: 'Amaravati', region: 'south', counsellingHubs: ['ap-barch'] },
  { slug: 'telangana', name: 'Telangana', type: 'state', capital: 'Hyderabad', region: 'south', counsellingHubs: ['tg-barch'] },
  { slug: 'puducherry', name: 'Puducherry', type: 'ut', capital: 'Puducherry', region: 'south', counsellingHubs: [] },
  { slug: 'lakshadweep', name: 'Lakshadweep', type: 'ut', capital: 'Kavaratti', region: 'islands', counsellingHubs: [] },
  { slug: 'andaman-and-nicobar', name: 'Andaman and Nicobar Islands', type: 'ut', capital: 'Port Blair', region: 'islands', counsellingHubs: [] },

  // West
  { slug: 'maharashtra', name: 'Maharashtra', type: 'state', capital: 'Mumbai', region: 'west', counsellingHubs: ['mht-cet-barch'] },
  { slug: 'gujarat', name: 'Gujarat', type: 'state', capital: 'Gandhinagar', region: 'west', counsellingHubs: ['acpc-barch', 'cept-university'] },
  { slug: 'goa', name: 'Goa', type: 'state', capital: 'Panaji', region: 'west', counsellingHubs: ['dte-goa-barch'] },
  { slug: 'rajasthan', name: 'Rajasthan', type: 'state', capital: 'Jaipur', region: 'west', counsellingHubs: ['reap-barch'] },
  { slug: 'dadra-and-nagar-haveli-and-daman-and-diu', name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'ut', capital: 'Daman', region: 'west', counsellingHubs: [] },

  // North
  { slug: 'delhi', name: 'Delhi', type: 'ut', capital: 'New Delhi', region: 'north', counsellingHubs: ['jac-delhi-barch'] },
  { slug: 'haryana', name: 'Haryana', type: 'state', capital: 'Chandigarh', region: 'north', counsellingHubs: ['hstes-barch'] },
  { slug: 'punjab', name: 'Punjab', type: 'state', capital: 'Chandigarh', region: 'north', counsellingHubs: ['ikgptu-barch'] },
  { slug: 'chandigarh', name: 'Chandigarh', type: 'ut', capital: 'Chandigarh', region: 'north', counsellingHubs: ['jac-chandigarh-barch'] },
  { slug: 'uttar-pradesh', name: 'Uttar Pradesh', type: 'state', capital: 'Lucknow', region: 'north', counsellingHubs: ['uptac-barch'] },
  { slug: 'uttarakhand', name: 'Uttarakhand', type: 'state', capital: 'Dehradun', region: 'north', counsellingHubs: ['vmsb-utu-barch'] },
  { slug: 'himachal-pradesh', name: 'Himachal Pradesh', type: 'state', capital: 'Shimla', region: 'north', counsellingHubs: ['hptu-barch'] },
  { slug: 'jammu-and-kashmir', name: 'Jammu and Kashmir', type: 'ut', capital: 'Srinagar', region: 'north', counsellingHubs: ['jkbopee-barch'] },
  { slug: 'ladakh', name: 'Ladakh', type: 'ut', capital: 'Leh', region: 'north', counsellingHubs: [] },

  // Central
  { slug: 'madhya-pradesh', name: 'Madhya Pradesh', type: 'state', capital: 'Bhopal', region: 'central', counsellingHubs: ['dte-mp-barch'] },
  { slug: 'chhattisgarh', name: 'Chhattisgarh', type: 'state', capital: 'Raipur', region: 'central', counsellingHubs: ['dte-cg-barch'] },

  // East
  { slug: 'west-bengal', name: 'West Bengal', type: 'state', capital: 'Kolkata', region: 'east', counsellingHubs: ['wbjee-barch'] },
  { slug: 'odisha', name: 'Odisha', type: 'state', capital: 'Bhubaneswar', region: 'east', counsellingHubs: ['ojee-barch'] },
  { slug: 'bihar', name: 'Bihar', type: 'state', capital: 'Patna', region: 'east', counsellingHubs: ['bceceb-ugeac'] },
  { slug: 'jharkhand', name: 'Jharkhand', type: 'state', capital: 'Ranchi', region: 'east', counsellingHubs: ['jceceb-barch'] },

  // Northeast
  { slug: 'assam', name: 'Assam', type: 'state', capital: 'Dispur', region: 'northeast', counsellingHubs: ['dte-assam-barch'] },
  { slug: 'meghalaya', name: 'Meghalaya', type: 'state', capital: 'Shillong', region: 'northeast', counsellingHubs: [] },
  { slug: 'tripura', name: 'Tripura', type: 'state', capital: 'Agartala', region: 'northeast', counsellingHubs: [] },
  { slug: 'manipur', name: 'Manipur', type: 'state', capital: 'Imphal', region: 'northeast', counsellingHubs: [] },
  { slug: 'mizoram', name: 'Mizoram', type: 'state', capital: 'Aizawl', region: 'northeast', counsellingHubs: [] },
  { slug: 'nagaland', name: 'Nagaland', type: 'state', capital: 'Kohima', region: 'northeast', counsellingHubs: [] },
  { slug: 'arunachal-pradesh', name: 'Arunachal Pradesh', type: 'state', capital: 'Itanagar', region: 'northeast', counsellingHubs: [] },
  { slug: 'sikkim', name: 'Sikkim', type: 'state', capital: 'Gangtok', region: 'northeast', counsellingHubs: [] },
];
