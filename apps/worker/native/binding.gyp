{
  "targets": [
    { "target_name": "job_owner", "sources": ["job-owner.cc"], "defines": ["NAPI_VERSION=8"] },
    { "target_name": "diagnostic_bootstrap", "type": "executable", "sources": ["diagnostic-bootstrap.cc"] },
    { "target_name": "job_owner_test", "sources": ["job-owner.cc"], "defines": ["NAPI_VERSION=8", "AJANKATI_TEST"] },
    { "target_name": "diagnostic_bootstrap_test", "type": "executable", "sources": ["diagnostic-bootstrap.cc"], "defines": ["AJANKATI_TEST"] }
  ]
}
