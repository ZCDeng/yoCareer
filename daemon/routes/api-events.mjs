// yoCareer v2 — GET /api/events?ticket=<UUID>  (SSE).
//
// Public route in auth.mjs (so token-less browser EventSource gets through),
// but the ticket consumer enforces single-use 30s tickets minted by
// /api/events/ticket. Without a valid ticket the connection is rejected
// with 401 before any event-stream headers are sent.

export function handleEvents(req, res, url, ctx) {
  const ticket = url.searchParams.get('ticket');
  if (!ticket || !ctx.ticketStore.consume(ticket)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'invalid_ticket',
      message: 'GET /api/events requires a valid ?ticket=<UUID> minted by POST /api/events/ticket',
    }));
    return null;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const lastEventId = req.headers['last-event-id'];
  const clientId = ctx.broadcaster.addClient(res, { lastEventId });

  req.on('close', () => ctx.broadcaster.removeClient(clientId));
  return null;        // signal: handler took over the response
}
