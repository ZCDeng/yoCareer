// yoCareer v2 — POST /api/events/ticket (auth required).
//
// Issue a one-time, 30-second ticket so the client can open EventSource
// without sending the long-lived x-yo-token in a header (EventSource API
// has no header customization). Caller already passed the token check
// in the auth middleware; this route just mints + returns a fresh ticket.

export function handleEventsTicket(_req, ctx) {
  const { ticket, expires_in } = ctx.ticketStore.issue();
  return {
    status: 200,
    body: { ticket, expires_in },
  };
}
