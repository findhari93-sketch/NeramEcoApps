-- Migration: Add enrolled and partial_payment status to application_status enum
-- Applied directly to production on 2026-02-25, now tracked in local files

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'enrolled';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'partial_payment';
