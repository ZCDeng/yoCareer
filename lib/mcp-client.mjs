/**
 * mcp-client.mjs — Shared MCP (Model Context Protocol) client utilities.
 *
 * Used by: bridges/reach-read-url.mjs, bridges/reach-signal-search.mjs
 */

/**
 * Fetch with an AbortController timeout.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse an MCP response body (JSON or SSE-wrapped JSON).
 */
export function parseMcpPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  const lines = trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  let lastData = '';
  for (const line of lines) {
    if (line.startsWith('data:')) {
      lastData = line.slice(5).trim();
    }
  }

  if (!lastData) throw new Error('MCP response is not JSON/SSE JSON');
  return JSON.parse(lastData);
}

/**
 * Send a JSON-RPC request to an MCP endpoint.
 */
export async function mcpRequest(endpointUrl, payload, sessionId = '', timeoutMs) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetchWithTimeout(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, timeoutMs);

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }

  return {
    data: parseMcpPayload(raw),
    sessionId: res.headers.get('mcp-session-id') || sessionId,
  };
}

/**
 * Extract human-readable text from a tool-call result object.
 */
export function extractToolText(result) {
  if (!result || typeof result !== 'object') return '';
  const blocks = Array.isArray(result.content) ? result.content : [];
  const texts = blocks
    .map(block => (typeof block?.text === 'string' ? block.text : ''))
    .filter(Boolean);
  if (texts.length > 0) return texts.join('\n\n');
  if (typeof result.structuredContent === 'string') return result.structuredContent;
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    try {
      return JSON.stringify(result.structuredContent);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Derive a company name from a URL hostname.
 */
export function companyFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const base = host.replace(/^www\./, '').split('.')[0];
    return base || 'Unknown';
  } catch {
    return 'Unknown';
  }
}
