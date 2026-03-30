-- Create 'documents' storage bucket for payment proofs and general document uploads
-- The Nexus fee-report API uploads to storage.from('documents') under payment-proofs/{user_id}/

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (proof URLs are shared with admins for verification)
CREATE POLICY "Public read documents bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- Service role can upload (API routes use admin client)
CREATE POLICY "Service role upload documents"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'documents');

-- Service role can update
CREATE POLICY "Service role update documents"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'documents');

-- Service role can delete
CREATE POLICY "Service role delete documents"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'documents');
