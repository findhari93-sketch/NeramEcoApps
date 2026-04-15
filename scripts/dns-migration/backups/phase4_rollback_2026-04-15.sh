#!/usr/bin/env bash
# Phase 4 Rollback: Disable proxy on all records
# Generated: Wed Apr 15 19:17:42 IST 2026

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/cloudflare-api.sh"
load_env

echo 'Rolling back Phase 4: Disabling proxy on all records...'

cf_set_proxy 'c04ac45e0372c1a414ae17e7a783ca18' 'false' && echo 'Proxy disabled: admin.neramclasses.com'
cf_set_proxy '23aa28ee1fe6284233a642ee04c5fe4d' 'false' && echo 'Proxy disabled: nexus.neramclasses.com'
cf_set_proxy 'e563a1e5dc94f86c6a17b8897ef70698' 'false' && echo 'Proxy disabled: app.neramclasses.com'
cf_set_proxy 'feb5c1c7bb391c70a97442c24e67c704' 'false' && echo 'Proxy disabled: www.neramclasses.com'
cf_set_proxy '9c3a589a841190cbb41f0fb71cf7fea3' 'false' && echo 'Proxy disabled: neramclasses.com'
cf_set_proxy '5240b2da60556b4a8a38c462258ba9ca' 'false' && echo 'Proxy disabled: staging.neramclasses.com'
cf_set_proxy 'ee6e82920b0ef69716ec09c912a6b1ad' 'false' && echo 'Proxy disabled: staging-app.neramclasses.com'
cf_set_proxy '97d220124e4e36575e48097e3874ccfd' 'false' && echo 'Proxy disabled: staging-nexus.neramclasses.com'
cf_set_proxy '01ba036605f1bbc4206d64aaad887418' 'false' && echo 'Proxy disabled: staging-admin.neramclasses.com'

echo 'Phase 4 rollback complete. All records are now DNS-only.'
