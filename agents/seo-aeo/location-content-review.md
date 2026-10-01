# Location page content: staff fact-check list (2026-10-01)

The city and state coaching pages (`/coaching/nata-coaching/...`, `/coaching/nata-coaching-in-{state}`) carry hand-written local content from `apps/marketing/src/data/geo/content/cities.ts` and `states.ts`. On 2026-10-01, 110 cities and 14 states were drafted from general knowledge (no web lookup) under strict rules: no em dashes, no claims about Neram in the city, no private colleges named, nothing uncertain kept.

A page with this content counts it toward the indexability gate (`apps/marketing/src/lib/seo/location-gate.ts`), so an error here goes live on an indexed page.

**Before deploy, a staff member should check the items below.** For each one: confirm it, or edit the entry in `cities.ts` / `states.ts`. Bump that entry's `updatedAt` after any edit.

The writers flagged these specific facts as uncertain:

### East batch (flagged by writer)
- durgapur: township planned by Joseph Allen Stein and Benjamin Polk (1950s)
- jamshedpur: Otto Koenigsberger plan (1940s)
- imphal: Ima Keithel market tiered roofs echo Manipuri forms
- kohima: Angami house details; cathedral on Aradura Hill echoes Naga house form
- agartala: Tripura Sundari Temple "Bengal temple style"
- kulti: Barakar "Begunia temples", rekha towers; Kulti part of Asansol Municipal Corporation
- muzaffarpur: Langat Singh College colonial building (general)
- berhampur: ropeway to Taratarini; Gopalpur-on-Sea lighthouse
- ranchi: Jagannath Temple and new Vidhan Sabha both in Dhurwa
- bardhaman: 108 Shiva Temples "rosary-like formation"

### North batch (flagged by writer)
- shahjahanpur: Garra and Khannaut rivers; memorials to Bismil and Ashfaqulla
- rohtak: Qila Road carved doors; sector planning
- karnal: cantonment church tower; Gharaunda sarai gateways
- gorakhpur: Gita Press gate styles; Ramgarh Tal promenades
- bareilly: Alakhnath Temple description; Ahichchhatra in Bareilly district
- aligarh: Aligarh Fort moat/ramparts; Upper Kot Jama Masjid location
- meerut: Augharnath Temple link to 1857
- jammu: Amar Mahal red sandstone; Bahu Fort on left bank of Tawi
- varanasi / aligarh / saharanpur / dehradun: IIT (BHU) B.Arch, AMU B.Arch, IIT Roorkee arch dept (writer confident)

### West batch (flagged by writer)
- bhilai: Deobaloda Shiva temple near Charoda in Durg district
- korba: Pali Shiva temple and Chaiturgarh fort in Korba district
- bilaspur: Pataleshwar temple at Malhar; carved figure at Tala
- daman: Nani Daman fort = St Jerome's Fort, gateway facing water; lighthouse in Moti Daman fort
- bhavnagar: founded in the eighteenth century
- jamnagar: Willingdon Crescent modelled on European crescents; Jain temples with painted interiors
- malegaon: Bhuikot fort eighteenth century
- dhule: street pattern of old core; Laling fort walls and gateways
- parbhani: Jintur Nemgiri caves; Turabul Haq dargah (thinnest material)
- nanded: Kandhar fort with wide moat
- chandrapur: Ballarpur fort on Wardha; four named gates
- jalgaon: nearest major railhead for Ajanta; Hemadpanthi temples in district
- gwalior: UNESCO Creative City of Music

### States + top-ups (flagged by writer)
- jammu-and-kashmir: no claim either way on B.Arch colleges in J&K (DB lists 3: Srinagar, Katra, Awantipora)
- northeast: NIT Agartala / Manipur / Mizoram / NERIST not named (unsure of B.Arch)
- arunachal-pradesh: Apatani landscape (Ziro) on UNESCO tentative list (~2014)
- andaman-and-nicobar: Nicobarese huts entered by ladder; Port Blair renamed Sri Vijaya Puram (2024), Ross Island = Netaji Subhash Chandra Bose Dweep
- ladakh: Leh Palace seventeenth century
- kozhikode extra: Mishkal Mosque "medieval"
- mysore extra: St Philomena's "said to draw on" Cologne Cathedral
- tiruppur extra: Avinashi "a major Kongu region pilgrimage site"
- Named: NIT Hamirpur (HP), NIT Calicut (for Lakshadweep), Goa College of Architecture (Panaji)

### South batch (flagged by writer)
- port-blair: renamed Sri Vijaya Puram (2024)
- davangere: "Glass House" conservatory; Santhebennur pushkarani pavilion layout
- nellore: Jonnawada Kamakshi temple near the Penna
- kakinada: Samarlakota temple linga through two-storey shrine; "wide, regular" streets
- raichur: fort inscription Kakatiya period
- yadgir: hill fort; Taylor Manzil at Shorapur (thin knowledge)
- koppal: Kanakachalapathi temple Vijayanagara-period work
- haveri: Shishunala Sharif link; Galaganatha temple near Tungabhadra
- ambur: Battle of Ambur (1749); Javadhu hills "within reach"
- tirupattur: sandalwood trade; Kavalur observatory association
- perambalur: Sathanur fossil wood park and Ranjankudi Fort in the district
- kallakurichi: Gomukhi dam, Kalvarayan hills; Chola-era temples at Tirukoilur
- dharmapuri: Mallikarjunaswamy temple (Kottai Kovil) carved pillars
- theni: generic description
- ramagundam: Ramagiri Fort in Peddapalli district
- nizamabad: Neelakanteshwara temple Jain and Hindu features
- kavaratti: Ujra Mosque carved timber ceiling
- Named: SPA Vijayawada (AP), NIT Calicut, NIT Tiruchirappalli, JNAFAU Hyderabad

### Pre-existing content fixed at merge
- kozhikode: removed "top ten" and "highest-ranked" claims about NIT Calicut
- trichy: removed "world's largest functioning temple complex"
- gurgaon: removed named private college (Sushant University)
