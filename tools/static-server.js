// Petit serveur HTTP statique sans dépendance (Node >= 18).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

export function serveStatic(root, req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/app/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(path.normalize(root))) { res.writeHead(403); res.end(); return true; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const range = req.headers.range;
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = parseInt(s, 10); const end = e ? parseInt(e, 10) : stat.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  }
  return true;
}

export function startStaticServer(root, port = 0, extraHandler = null) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (extraHandler && (await extraHandler(req, res))) return;
        if (!serveStatic(root, req, res)) { res.writeHead(404); res.end('Not found'); }
      } catch (e) {
        console.error(e); try { res.writeHead(500); res.end(String(e)); } catch {}
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
