#!/usr/bin/env bash
set -euo pipefail

# Example bridge for YOCAREER_REACH_READ_URL_CMD.
# Input: $1 = public URL
# Output: JSON with "signals" array.
# Replace the body with your real Reach/Seek CLI call.

url="${1:-}"
if [[ -z "$url" ]]; then
  echo '{"signals":[]}'
  exit 0
fi

cat <<JSON
{
  "signals": [
    {
      "kind": "official_job",
      "company": "BridgeExample",
      "title": "Bridge Example AI Role",
      "url": "$url",
      "confidence": 0.74,
      "source_platform": "reach_read_url",
      "recommended_action": "apply_on_official_site",
      "evidence_text": "Replace this script with a real reach-read-url implementation."
    }
  ]
}
JSON
