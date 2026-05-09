// yoCareer v2 — SSE ticket store (one-time, short-lived).
//
// EventSource has no header customization (WHATWG HTML §9.2 only supports
// `withCredentials`). Daemon's /api/events therefore cannot require the
// long-lived `x-yo-token` header. Instead:
//
//   1. Client POST /api/events/ticket  (with x-yo-token)  → ticket UUID
//   2. Client EventSource('/api/events?ticket=<UUID>')
//   3. Daemon validates + immediately invalidates the ticket
//
// Tickets are in-memory only (no SQLite — no value in surviving restart;
// daemon restart implies all SSE clients reconnect anyway).
//
// Lifetime: 30s. Single-use. Janitor sweeps expired entries every 30s.

import { randomUUID } from 'node:crypto';

const TICKET_TTL_MS = 30_000;
const JANITOR_INTERVAL_MS = 30_000;

/**
 * Build a ticket store. The store is a plain object — no class — to make
 * test mocking and shutdown wiring obvious.
 *
 * Returns { issue, consume, has, size, stop }.
 */
export function createTicketStore({ ttlMs = TICKET_TTL_MS, now = Date.now } = {}) {
  const tickets = new Map();    // ticket -> expires_at (ms)
  let janitor = null;

  function issue() {
    const ticket = randomUUID();
    tickets.set(ticket, now() + ttlMs);
    return { ticket, expires_in: Math.floor(ttlMs / 1000) };
  }

  /**
   * Validate + invalidate (atomic). Returns true iff the ticket existed,
   * was unexpired, and was consumed by this call.
   */
  function consume(ticket) {
    if (!ticket || typeof ticket !== 'string') return false;
    const expiresAt = tickets.get(ticket);
    if (expiresAt === undefined) return false;
    tickets.delete(ticket);
    if (expiresAt < now()) return false;
    return true;
  }

  function has(ticket) {
    if (!tickets.has(ticket)) return false;
    return tickets.get(ticket) >= now();
  }

  function size() {
    return tickets.size;
  }

  function startJanitor(intervalMs = JANITOR_INTERVAL_MS) {
    if (janitor) return;
    janitor = setInterval(() => {
      const t = now();
      for (const [k, v] of tickets) {
        if (v < t) tickets.delete(k);
      }
    }, intervalMs);
    janitor.unref?.();   // don't keep the event loop alive for this
  }

  function stop() {
    if (janitor) {
      clearInterval(janitor);
      janitor = null;
    }
    tickets.clear();
  }

  return { issue, consume, has, size, stop, startJanitor };
}

export const _internals = { TICKET_TTL_MS, JANITOR_INTERVAL_MS };
