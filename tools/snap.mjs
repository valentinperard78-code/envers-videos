// Usage : node tools/snap.mjs <page> "<query>" out.jpg [t]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { startStaticServer } from './static-server.js';
import { findChrome, chromeArgs } from './chrome.js';
const [page, query = '', out = 'scratch/snap.jpg', t = '1'] = process.argv.slice(2);
const srv = await startStaticServer(process.cwd(), 0);
const b = await puppeteer.launch({ executablePath: findChrome(), args: chromeArgs() });
const p = await b.newPage();
p.on('console', (m) => console.log('PAGE', m.text())); p.on('pageerror', (e) => console.log('ERR', e.message, e.stack));
await p.goto(`http://127.0.0.1:${srv.address().port}/app/${page}.html?${query}`);
await p.waitForFunction('window.ready===true', { timeout: 120000 });
const t0 = Date.now();
const d = await p.evaluate(`renderFrame(${t})`);
fs.writeFileSync(out, Buffer.from(d, 'base64'));
console.log('ok', Date.now() - t0, 'ms');
await b.close(); srv.close();
