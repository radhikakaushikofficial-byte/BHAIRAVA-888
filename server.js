import express from 'express';
import {mkdirSync, openSync, closeSync, unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Resolve relative configuration against the repository, even when launched elsewhere.
const root = fileURLToPath(new URL('./', import.meta.url));
process.chdir(root);
const dataDirectory = path.resolve(root, process.env.DATA_DIR || 'data');
process.env.DATA_DIR = dataDirectory;
for (const directory of [dataDirectory, path.join(dataDirectory, 'payment')]) {
  try {
    mkdirSync(directory, {recursive:true, mode:0o700});
    // Check actual write access on the mounted volume before loading either store.
    const probe = path.join(directory, `.startup-${randomUUID()}`);
    const descriptor = openSync(probe, 'wx', 0o600);
    closeSync(descriptor);
    unlinkSync(probe);
  } catch (error) {
    throw new Error(`Data directory is not writable: ${directory}. Check volume ownership for the node user.`, {cause:error});
  }
}
// Dynamic imports guarantee directory initialization precedes module-level DB access.
const {handleMain} = await import('./server/main.mjs');
const {handlePayment} = await import('./payment/handler.mjs');
const app = express();
app.disable('x-powered-by');
app.get('/healthz', (req,res) => res.json({ok:true,service:'bhairava-unified'}));
app.use((req,res,next) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/payment') return res.redirect(308, '/payment/' + new URL(req.url,'http://localhost').search);
  if (!pathname.startsWith('/payment/')) return next();
  req.url = req.url.slice('/payment'.length);
  return handlePayment(req,res);
});
// Serialize main requests: SQLite transaction jobs must not interleave across requests.
let mainQueue = Promise.resolve();
app.use((req,res,next) => {
  mainQueue = mainQueue.then(() => handleMain(req,res)).catch(next);
});
app.use((error,req,res,next) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({error:'Server error'});
});
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => console.log(`BHAIRAVA unified listening on ${server.address().port}`));
let stopping = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); process.exit(0); });
});
