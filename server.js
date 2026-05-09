import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const port = Number(process.env.PORT) || 4173;
const root = process.cwd();
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

function resolvePath(url) {
  const pathname = new URL(url, `http://localhost:${port}`).pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return null;
  }

  return filePath;
}

createServer((request, response) => {
  const filePath = resolvePath(request.url);

  if (!filePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': types[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Focus Dashboard running at http://localhost:${port}`);
});
