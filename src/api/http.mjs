// HTTP plumbing for the API: JSON in and out, and the check that a request came from the hub's own page.

// No CORS headers at all: the hub can run the CLI and write the tasks config, so only the page the hub itself serves may
// call it. A request that names another origin is refused, and a cross-site page cannot get past the browser's own check.
export function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** True when the request has no Origin (not from a browser page) or names the host it was sent to. */
export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
