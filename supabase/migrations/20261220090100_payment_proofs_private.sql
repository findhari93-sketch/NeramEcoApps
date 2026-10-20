-- Payment screenshots are proof of money; they were served from a PUBLIC bucket,
-- so anyone with a URL (and URLs sit in emails and admin pages) could open them.
-- The bucket becomes private; readers use short-lived signed URLs (admin
-- lib/payment-proof.ts). Kept separate from 20261220090000 so it ships in the
-- same deploy as the readers that sign.
DO $$ BEGIN
  UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'payment-proofs: no privilege to flip public=false here; set it in the Supabase dashboard (Storage > payment-proofs > Make private).';
END $$;
