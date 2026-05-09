// yoCareer v2 — SSE broadcaster (multi-client + heartbeat + ring buffer).
//
// One broadcaster per daemon. Clients (Web SPA, extension SW, CLI) attach via
// /api/events, get a stream of named events, and reconnect with Last-Event-ID
// after network blips.
//
// SSE protocol details (matches plan §SSE 协议):
//   Initial frame:    `retry: 5000\n\n`
//   Heartbeat:        `: keepalive\n\n`  (every 15s)
//   Event frame:      `id: <N>\nevent: <name>\ndata: <json>\n\n`
//
// The `id` is monotonic across the broadcaster's lifetime (resets on daemon
// restart). Ring buffer keeps the last 100 events for Last-Event-ID replay;
// older events are silently dropped (clients gone for long enough must
// refetch from REST endpoints).

const HEARTBEAT_INTERVAL_MS = 15_000;
const RING_BUFFER_MAX = 100;
const SSE_RETRY_MS = 5_000;

export function createBroadcaster({
  heartbeatMs = HEARTBEAT_INTERVAL_MS,
  ringBufferMax = RING_BUFFER_MAX,
} = {}) {
  const clients = new Map();    // clientId -> { res, lastEventIdSent }
  let nextEventId = 1;
  let nextClientId = 1;
  const ringBuffer = [];        // [{ id, event, data }]
  let heartbeatTimer = null;

  function pushToBuffer(entry) {
    ringBuffer.push(entry);
    while (ringBuffer.length > ringBufferMax) ringBuffer.shift();
  }

  function frame(entry) {
    return `id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`;
  }

  function safeWrite(res, payload) {
    try {
      if (res.writableEnded || res.destroyed) return false;
      res.write(payload);
      return true;
    } catch {
      return false;
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      for (const [id, client] of clients) {
        if (!safeWrite(client.res, ': keepalive\n\n')) {
          clients.delete(id);
        }
      }
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /**
   * Attach an SSE client. Caller must have already validated the ticket and
   * set headers (Content-Type: text/event-stream, Cache-Control: no-cache,
   * Connection: keep-alive, X-Accel-Buffering: no, ...).
   *
   * Returns a clientId (number). Caller should also wire `req.on('close',
   * () => broadcaster.removeClient(clientId))` for cleanup.
   *
   * If `lastEventId` is provided, replays buffered events with id > lastEventId.
   */
  function addClient(res, { lastEventId = null } = {}) {
    const id = nextClientId++;
    safeWrite(res, `retry: ${SSE_RETRY_MS}\n\n`);

    if (lastEventId !== null && lastEventId !== undefined) {
      const cursor = parseInt(lastEventId, 10);
      if (!Number.isNaN(cursor)) {
        for (const entry of ringBuffer) {
          if (entry.id > cursor) safeWrite(res, frame(entry));
        }
      }
    }

    clients.set(id, { res, lastEventIdSent: nextEventId - 1 });
    startHeartbeat();
    return id;
  }

  function removeClient(clientId) {
    const client = clients.get(clientId);
    if (!client) return false;
    clients.delete(clientId);
    if (clients.size === 0) stopHeartbeat();
    return true;
  }

  /**
   * Broadcast an event to all attached clients. Returns the event id assigned.
   * Drops dead connections (writes that fail) without throwing.
   */
  function broadcast(eventName, data) {
    const entry = { id: nextEventId++, event: eventName, data };
    pushToBuffer(entry);
    const payload = frame(entry);
    for (const [id, client] of clients) {
      if (!safeWrite(client.res, payload)) {
        clients.delete(id);
      } else {
        client.lastEventIdSent = entry.id;
      }
    }
    if (clients.size === 0) stopHeartbeat();
    return entry.id;
  }

  /**
   * Tear-down: end every client's response and stop the heartbeat. Called
   * on daemon SIGTERM.
   */
  function shutdown() {
    stopHeartbeat();
    for (const [, client] of clients) {
      try {
        client.res.write('event: shutdown\ndata: {"reason":"daemon_stopping"}\n\n');
        client.res.end();
      } catch { /* best-effort */ }
    }
    clients.clear();
  }

  function stats() {
    return {
      clients: clients.size,
      buffered: ringBuffer.length,
      nextEventId,
    };
  }

  return {
    addClient,
    removeClient,
    broadcast,
    shutdown,
    stats,
    // Test hooks
    _ringBuffer: ringBuffer,
    _clients: clients,
  };
}

export const _internals = {
  HEARTBEAT_INTERVAL_MS,
  RING_BUFFER_MAX,
  SSE_RETRY_MS,
};
