#!/usr/bin/env bash
# Phase 1 Rollback: Delete DNS records created during Phase 1
# Generated: Wed Apr 15 18:55:06 IST 2026
# Run this to undo Phase 1 changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/cloudflare-api.sh"
load_env

echo 'Rolling back Phase 1: Deleting created DNS records...'

cf_delete_dns_record "9c3a589a841190cbb41f0fb71cf7fea3" && echo 'Deleted record 9c3a589a841190cbb41f0fb71cf7fea3'
cf_delete_dns_record "feb5c1c7bb391c70a97442c24e67c704" && echo 'Deleted record feb5c1c7bb391c70a97442c24e67c704'
cf_delete_dns_record "e563a1e5dc94f86c6a17b8897ef70698" && echo 'Deleted record e563a1e5dc94f86c6a17b8897ef70698'
cf_delete_dns_record "23aa28ee1fe6284233a642ee04c5fe4d" && echo 'Deleted record 23aa28ee1fe6284233a642ee04c5fe4d'
cf_delete_dns_record "c04ac45e0372c1a414ae17e7a783ca18" && echo 'Deleted record c04ac45e0372c1a414ae17e7a783ca18'
cf_delete_dns_record "5240b2da60556b4a8a38c462258ba9ca" && echo 'Deleted record 5240b2da60556b4a8a38c462258ba9ca'
cf_delete_dns_record "ee6e82920b0ef69716ec09c912a6b1ad" && echo 'Deleted record ee6e82920b0ef69716ec09c912a6b1ad'
cf_delete_dns_record "97d220124e4e36575e48097e3874ccfd" && echo 'Deleted record 97d220124e4e36575e48097e3874ccfd'
cf_delete_dns_record "01ba036605f1bbc4206d64aaad887418" && echo 'Deleted record 01ba036605f1bbc4206d64aaad887418'

echo 'Phase 1 rollback complete'
