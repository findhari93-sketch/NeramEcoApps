/**
 * Create Supabase Storage bucket for question images
 */

const ACCESS_TOKEN = 'sbp_e5079eeb22db99c56a8619959ab4c7c5640a6e0b';
const PROJECT_REF = 'zdnypksjqnhtiblwdaic';
const API_BASE = 'https://api.supabase.com';

async function createBucket() {
  console.log('Creating question-images storage bucket...');

  const response = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/storage/buckets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'question-images',
      name: 'question-images',
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    }),
  });

  const text = await response.text();

  if (response.ok) {
    console.log('✅ Bucket created successfully');
  } else if (response.status === 409 || text.includes('already exists')) {
    console.log('✅ Bucket already exists');
  } else {
    console.error(`❌ Failed (${response.status}): ${text}`);
  }

  // Also add storage policies via SQL
  const sql = `
    -- Allow authenticated users to upload to their own folder
    INSERT INTO storage.policies (bucket_id, name, definition, check_expression, operation, roles)
    VALUES
      ('question-images', 'Users can upload images', 'true', 'auth.role() = ''authenticated''', 'INSERT', ARRAY['authenticated'])
    ON CONFLICT DO NOTHING;
  `;

  // Use SQL to set up RLS on storage objects
  const policySQL = `
    -- Storage RLS: allow public reads
    CREATE POLICY IF NOT EXISTS "Public can read question images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'question-images');

    -- Storage RLS: authenticated users can upload
    CREATE POLICY IF NOT EXISTS "Authenticated users can upload question images"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'question-images'
        AND auth.role() = 'authenticated'
      );

    -- Storage RLS: users can delete own images
    CREATE POLICY IF NOT EXISTS "Users can delete own question images"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'question-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  `;

  console.log('\nSetting up storage policies...');
  const policyResponse = await fetch(`${API_BASE}/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: policySQL }),
  });

  const policyText = await policyResponse.text();
  if (policyResponse.ok) {
    console.log('✅ Storage policies configured');
  } else {
    // Policies might already exist
    console.log('ℹ️  Storage policies (may already exist):', policyText.substring(0, 100));
  }
}

createBucket().catch(console.error);
