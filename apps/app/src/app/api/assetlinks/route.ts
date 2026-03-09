import { NextResponse } from 'next/server';

const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.neramclasses.app',
      sha256_cert_fingerprints: [
        'D5:A8:33:0B:D1:BA:C8:F2:4A:64:FD:28:0C:2C:F9:59:C0:AC:E2:40:4E:E5:68:73:2F:27:9D:4F:30:B6:CB:44',
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
