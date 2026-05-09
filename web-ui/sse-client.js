// yoCareer v2 Web UI — SSE client
//
// EventSource + ticket exchange + auto-reconnect + Last-Event-ID resume.

export function createSseClient(token, onEvent, onError) {
  let es = null;
  let lastEventId = '';
  let closed = false;
  let reconnectTimer = null;

  async function connect() {
    if (closed) return;

    // Step 1: exchange token for ticket
    let ticket;
    try {
      const res = await fetch('/api/events/ticket', {
        method: 'POST',
        headers: { 'x-yo-token': token },
      });
      if (!res.ok) throw new Error(`ticket ${res.status}`);
      const data = await res.json();
      ticket = data.ticket;
    } catch (err) {
      onError?.('ticket_failed', err.message);
      scheduleReconnect();
      return;
    }

    // Step 2: open EventSource with ticket
    const url = `/api/events?ticket=${encodeURIComponent(ticket)}${lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : ''}`;
    es = new EventSource(url);

    es.onopen = () => {
      onEvent?.('_connected', { message: 'SSE connected' });
    };

    es.onmessage = (ev) => {
      if (ev.id) lastEventId = ev.id;
      if (ev.data) {
        try {
          const data = JSON.parse(ev.data);
          onEvent?.(ev.event || 'message', data);
        } catch {
          onEvent?.(ev.event || 'message', ev.data);
        }
      }
    };

    es.onerror = () => {
      onError?.('connection_error', 'SSE connection error');
      es.close();
      es = null;
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  function close() {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (es) {
      es.close();
      es = null;
    }
  }

  connect();
  return { close };
}
