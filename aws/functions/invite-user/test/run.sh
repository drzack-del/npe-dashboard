#!/bin/bash
# Local checks for invite-user (no AWS): copies index.mjs next to the checks with a stand-in for
# the Cognito SDK, then runs them.   bash aws/functions/invite-user/test/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/node_modules/@aws-sdk/client-cognito-identity-provider"
cp "$here/../index.mjs" "$tmp/index.mjs"; cp "$here/checks.mjs" "$tmp/checks.mjs"
cp "$here/stub/cognito-stub.js" "$tmp/node_modules/@aws-sdk/client-cognito-identity-provider/index.js"
echo '{"name":"@aws-sdk/client-cognito-identity-provider","type":"module","main":"index.js"}' > "$tmp/node_modules/@aws-sdk/client-cognito-identity-provider/package.json"
cd "$tmp" && node checks.mjs
