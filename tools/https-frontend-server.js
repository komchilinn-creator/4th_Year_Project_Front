'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const host = '0.0.0.0';
const port = Number(process.env.ATTENDQR_FRONTEND_PORT || 8000);
const root = path.resolve(__dirname, '..');
const certificateDirectory = 'C:/xampp2/apache/conf/attendqr';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.crt': 'application/x-x509-ca-cert',
};

const server = https.createServer({
  cert: fs.readFileSync(path.join(certificateDirectory, 'attendqr-server.crt')),
  key: fs.readFileSync(path.join(certificateDirectory, 'attendqr-server.key')),
}, (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'https://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`EasyAttend frontend: https://localhost:${port}`);
});
