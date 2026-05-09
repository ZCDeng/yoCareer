// yoCareer v2 — GET /healthz (public, no auth).
//
// Liveness + minimal version probe. Used by:
//   - CLI clients to detect "is the daemon up" (lib/daemon-client.mjs)
//   - kube-style/launchd liveness probes (if user wraps in a service)
//   - Docs-recommended `curl http://127.0.0.1:8650/healthz` smoke test

export function handleHealth(_req, ctx) {
  const userVersion = ctx.db.pragma('user_version', { simple: true });
  return {
    status: 200,
    body: {
      ok: true,
      version: ctx.version,
      port: ctx.port,
      pid: process.pid,
      db_path: ctx.info.db_path,
      db_user_version: userVersion,
      started_at: ctx.info.started_at,
      sse: ctx.broadcaster.stats(),
    },
  };
}
