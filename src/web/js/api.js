// Talking to the hub's server. Every call carries the header the server checks for, so only this page can use the API.

const HEADERS = { 'Content-Type': 'application/json', 'X-DX-Hub': '1' };

/** GET `path`, or POST `body` to it. Returns the JSON; throws with the server's own sentence when it refuses. */
export async function api(path, body) {
  const res = await fetch(
    path,
    body ? { method: 'POST', headers: HEADERS, body: JSON.stringify(body) } : undefined
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The request failed');
  return data;
}

/**
 * Starts an action and reads the stream of events it answers with, calling onEvent(name, data) for each:
 * start, stdout, stderr, issue, error, complete (see api/runs.mjs). Throws when the run could not start.
 */
export async function streamRun(body, onEvent) {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body)
    throw new Error((await res.json().catch(() => ({}))).error || 'Could not start');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventName = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('event: ')) eventName = line.slice(7);
      if (!line.startsWith('data: ')) continue;
      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      onEvent(eventName, data);
    }
  }
}
