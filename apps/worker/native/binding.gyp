{
  "targets": [
    { "target_name": "sandbox_fixture", "type": "executable", "sources": ["sandbox-fixture.cc"], "libraries": ["advapi32.lib", "ws2_32.lib"] },
    { "target_name": "path_boundary_test", "sources": ["path-boundary.cc"], "defines": ["NAPI_VERSION=8", "AJANKATI_TEST"], "libraries": ["normaliz.lib"], "msvs_settings": { "VCCLCompilerTool": { "AdditionalOptions": ["/utf-8"] } } },
    { "target_name": "path_boundary", "sources": ["path-boundary.cc"], "defines": ["NAPI_VERSION=8"], "libraries": ["normaliz.lib"], "msvs_settings": { "VCCLCompilerTool": { "AdditionalOptions": ["/utf-8"] } } },
    { "target_name": "stdio_owner", "sources": ["stdio-owner.cc"], "defines": ["NAPI_VERSION=8"], "libraries": ["bcrypt.lib", "shell32.lib", "advapi32.lib", "ole32.lib"] },
    { "target_name": "stdio_owner_test", "sources": ["stdio-owner.cc"], "defines": ["NAPI_VERSION=8", "AJANKATI_TEST"], "libraries": ["bcrypt.lib", "shell32.lib", "advapi32.lib", "ole32.lib"] },
    { "target_name": "stdio_fixture", "type": "executable", "sources": ["stdio-fixture.cc"] },
    { "target_name": "job_owner", "sources": ["job-owner.cc"], "defines": ["NAPI_VERSION=8"] },
    { "target_name": "diagnostic_bootstrap", "type": "executable", "sources": ["diagnostic-bootstrap.cc"] },
    { "target_name": "job_owner_test", "sources": ["job-owner.cc"], "defines": ["NAPI_VERSION=8", "AJANKATI_TEST"] },
    { "target_name": "diagnostic_bootstrap_test", "type": "executable", "sources": ["diagnostic-bootstrap.cc"], "defines": ["AJANKATI_TEST"] }
  ]
}
