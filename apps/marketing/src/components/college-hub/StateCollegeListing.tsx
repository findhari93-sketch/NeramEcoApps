'use client';

import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import DirectoryListing from './directory/DirectoryListing';
import type { StateOption } from './directory/DirectoryHero';

interface Props {
  colleges: ListingCollege[];
  state: string;
  stateName: string;
  states?: StateOption[];
}

/** The /colleges/[state] directory (canvas: List, Grid and Table views, filter rail, mobile results and filter sheet). */
export default function StateCollegeListing({ colleges, state, stateName, states }: Props) {
  return (
    <DirectoryListing
      mode="state"
      colleges={colleges}
      state={state}
      stateName={stateName}
      states={states}
      breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: stateName }]}
    />
  );
}
