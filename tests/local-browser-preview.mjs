// Test infrastructure only. Adds a synthetic customer identity to a local Worker
// so browser QA does not require deployable application auth bypasses.
import http from 'node:http';
const upstream = new URL(process.env.RELAY_TEST_URL ?? 'http://127.0.0.1:8789');
if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(upstream.hostname)) {
  throw new Error('Browser fixture proxy requires a local HTTP Worker.');
}
const port = 8790;
const origin = `http://127.0.0.1:${port}`;
const fixtureId = process.env.RELAY_TEST_BROWSER_OWNER_ID ?? `browser-fixture-${crypto.randomUUID()}`;
if (!/^browser-fixture-[a-zA-Z0-9-]{1,100}$/.test(fixtureId)) throw new Error('Synthetic browser fixture ID required.');
let loseCreateResponse = process.env.RELAY_TEST_LOSE_CREATE_RESPONSE_ONCE === '1';
http.createServer((incoming, outgoing) => {
  if (incoming.headers.host !== `127.0.0.1:${port}` ||
      (incoming.headers.origin && incoming.headers.origin !== origin)) {
    incoming.resume();
    outgoing.writeHead(403).end('Local QA origin required.');
    return;
  }
  const headers = { ...incoming.headers, host: upstream.host,
    'oai-authenticated-user-id': fixtureId,
    'oai-authenticated-user-email': 'browser-fixture@example.invalid',
    'oai-authenticated-user-full-name': 'Local QA Fixture',
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
  };
  for (const key of ['cookie', 'authorization', 'x-relay-role', 'oai-authenticated-user-role']) delete headers[key];
  if (headers.origin) headers.origin = upstream.origin;
  const forwarded = http.request({ hostname: upstream.hostname, port: upstream.port,
    path: incoming.url, method: incoming.method, headers }, response => {
    if (loseCreateResponse && incoming.method === 'POST' && incoming.url === '/api/cases' && response.statusCode === 201) {
      loseCreateResponse = false;
      // Test-only transport fixture: let the upstream commit and drain its
      // success, then hide that response from the browser exactly once.
      response.resume();
      response.on('end', () => outgoing.writeHead(502, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Simulated lost create response. Retry the same save.' })));
      return;
    }
    const responseHeaders = { ...response.headers };
    delete responseHeaders['set-cookie'];
    outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
    response.pipe(outgoing);
  });
  forwarded.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end('Local QA Worker unavailable.'); });
  incoming.pipe(forwarded);
}).listen(port, '127.0.0.1', () => console.log(`Synthetic customer browser QA: ${origin} (test infrastructure only)`));
