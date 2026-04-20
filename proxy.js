/**
 * OpenClaw Reverse Proxy
 * Listens on port 3455, routes:
 *   /v2/*  → localhost:3457 (v2 service)
 *   all else → localhost:3456 (v1 server.js)
 *
 * ngrok points to 3455, so both v1 and v2 share alphaboost.ngrok.app
 */
const http = require('http');

const V1_PORT = 3456;
const V2_PORT = 3457;
const PROXY_PORT = 3455;

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${targetPort}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    const target = targetPort === V2_PORT ? 'v2' : 'v1';
    console.error(`[proxy] Error routing to ${target}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'GATEWAY_ERROR', message: `${target} service unavailable.` } }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  const isV2 = req.url.startsWith('/v2');
  proxyRequest(req, res, isV2 ? V2_PORT : V1_PORT);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[proxy] OpenClaw proxy running on port ${PROXY_PORT}`);
  console.log(`[proxy]   /v2/* → :${V2_PORT}`);
  console.log(`[proxy]   /*    → :${V1_PORT}`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
