import { NextResponse } from 'next/server';

const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.neramclasses.app',
      sha256_cert_fingerprints: [
        // TODO: Replace with actual SHA256 fingerprint from your signing key after
        // generating the Android package via PWABuilder
        'PLACEHOLDER:REPLACE_WITH_ACTUAL_SHA256_FINGERPRINT',
      ],
    },
  },
];

export async function GET() {
  return NextResponse.json(assetLinks, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
