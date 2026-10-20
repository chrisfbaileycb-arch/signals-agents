import express, { type Request, type Response, type NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function sign(value: string, password: string) {
  return createHmac('sha256', password).update(`signals-owner:${value}`).digest('hex');
}
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signals Agents — Agency Workspace</title><style>body{font:17px system-ui;background:#faf5ef;color:#30261c;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:430px;padding:36px;margin:24px;background:white;border:1px solid #e8dfd5;border-radius:22px}p{line-height:1.6}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:10px;padding:13px;margin-top:12px}button{background:#b45309;color:white;border:0;cursor:pointer}label{display:block;margin-top:24px}</style><main><p>CHRIS’S MARKETING STACK</p><h1>Signals Agents</h1><p>Your private four-agent workflow studio. Connect your personal provider key in the BYOK panel after unlocking. Keys stay in page memory and clear on reload.</p><form action="/owner-login" method="post"><label for="password">Workspace owner password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="500" required><button>Open workspace</button></form><p>No provider key is included. Sending and generation require a connected provider.</p></main></html>`;

export function makeOwnerGate(password: string) {
  const router = express.Router();
  router.get('/welcome', (_req, res) => res.set('Cache-Control', 'no-store').type('html').send(page));
  router.post('/owner-login', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const origin = req.get('origin');
    if (origin !== `${req.protocol}://${req.get('host')}`) { res.status(403).send('Forbidden'); return; }
    if (!password) { res.status(503).send('Owner password is not configured.'); return; }
    if (!equal(String(req.body.password || ''), password)) { res.status(401).type('html').send(page.replace('Workspace owner password', 'Incorrect password. Try again.')); return; }
    const expires = String(Date.now() + 12 * 60 * 60 * 1000);
    res.set('Cache-Control', 'no-store');
    res.cookie('signals_owner', `${expires}.${sign(expires, password)}`, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 43200000, path: '/' });
    res.redirect(303, '/');
  });
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health' || req.path === '/api/health') { next(); return; }
    res.set('Cache-Control', 'no-store');
    if (!password) { res.status(503).send('Owner password is not configured.'); return; }
    const raw = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('signals_owner='))?.slice('signals_owner='.length) || '';
    let decoded = '';
    try { decoded = decodeURIComponent(raw); } catch { /* Invalid cookies remain unauthorized. */ }
    const [expires, signature = ''] = decoded.split('.');
    if (Number(expires) > Date.now() && equal(signature, sign(expires!, password))) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== `${req.protocol}://${req.get('host')}`) {
        res.status(403).json({ error: 'invalid_write_origin' }); return;
      }
      res.locals.privateOwnerAuthenticated = true;
      next(); return;
    }
    if (req.path.startsWith('/api/') || req.method !== 'GET') { res.status(401).json({ error: 'Unlock the owner workspace first.' }); return; }
    res.type('html').send(page);
  });
  return router;
}
