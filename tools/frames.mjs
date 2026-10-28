// Usage : node tools/frames.mjs <timeline.json> <q> out_prefix t1 t2 ...
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { startStaticServer } from './static-server.js';
import { findChrome, chromeArgs } from './chrome.js';
const [tl, q, prefix, ...times] = process.argv.slice(2);
const srv = await startStaticServer(process.cwd(), 0);
const b = await puppeteer.launch({ executablePath: findChrome(), args: chromeArgs() });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() !== 'warning') console.log('PAGE', m.text()); }); p.on('pageerror', (e) => console.log('ERR', e.message, e.stack));
await p.goto(`http://127.0.0.1:${srv.address().port}/app/render.html?q=${q}&tl=/${tl}`);
await p.waitForFunction('window.ready===true', { timeout: 300000 });
for (const t of times) { const t0 = Date.now(); const d = await p.evaluate(`renderFrame(${t})`); fs.writeFileSync(`${prefix}_${t}.jpg`, Buffer.from(d, 'base64')); console.log('frame', t, Date.now() - t0, 'ms'); }
await b.close(); srv.close();
