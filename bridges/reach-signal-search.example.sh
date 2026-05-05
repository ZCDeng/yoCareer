#!/usr/bin/env bash
set -euo pipefail

# Example bridge for YOCAREER_REACH_SIGNAL_SEARCH_CMD.
# Input: $1 = platform (e.g. weibo, v2ex, github), $2 = query
# Output: JSON with "signals" array.
# Replace the body with your real Reach/Seek search call.

platform="${1:-web}"
query="${2:-AI 招聘}"
escaped_query="$query"
escaped_query="${escaped_query//\\/\\\\}"
escaped_query="${escaped_query//\"/\\\"}"
escaped_query="${escaped_query//$'\n'/ }"

cat <<JSON
{
  "signals": [
    {
      "kind": "recruiter_post",
      "company": "BridgeExample",
      "title": "Bridge Example Recruiting Signal",
      "url": "https://example.com/bridge-signal",
      "confidence": 0.83,
      "source_platform": "$platform",
      "recommended_action": "message_recruiter",
      "evidence_text": "Query: $escaped_query"
    }
  ]
}
JSON
