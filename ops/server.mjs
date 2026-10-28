// ops.chipperlyapp.com: one page to see the sites, deployments, the server and its logs, and to
// manage Cloudflare. No dependencies on purpose: it must keep working when the app is down, and
// stay small on a server it shares with live. Runs as the `ops` user (deploy/contabo/README.md, "Ops panel").
//
// Sign-in: the panel's own (email, password, authenticator code; auth.mjs), or Cloudflare Access
// once it is switched on for ops.chipperlyapp.com (its signature is checked here, access.mjs).
import { spawn, execFile } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, statfsSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { promisify } from 'node:util';
import path from 'node:path';
import { verifyAccessJwt } from './access.mjs';
import { createAuth } from './auth.mjs';

const run = promisify(execFile);
const env = process.env;
const PORT = Number(env.OPS_PORT || 8070);
const DATA_DIR = env.OPS_DATA_DIR || '/var/lib/ops';
const ACCESS_TEAM = env.ACCESS_TEAM_DOMAIN; // e.g. chipperly.cloudflareaccess.com
const ACCESS_AUD = env.ACCESS_AUD;
const CF_TOKEN = env.CF_API_TOKEN;
const CF_ACCOUNT = env.CF_ACCOUNT_ID || 'e576a82e9534f6dcf627eeaf15adf6d7';
const CF_ZONE = env.CF_ZONE_ID || '9f961107ff719cdefb274757754dd8cc';
const GH_TOKEN = env.GH_TOKEN;
const GH_REPO = env.GH_REPO || 'Cooperation-org/chipperly';
const HTML = readFileSync(new URL('./index.html', import.meta.url));
const TWO_STEP = env.OPS_TWO_STEP !== 'off';
const LOGIN = readFileSync(new URL('./login.html', import.meta.url), 'utf8').replace(TWO_STEP ? '' : /<!--code-->.*<!--\/code-->/s, '');
const auth = createAuth(path.join(DATA_DIR, 'users.json'), { twoStep: TWO_STEP });
const COOKIE = 'ops_session';
const cookieOf = (req) => (/(?:^|;\s*)ops_session=([\w-]+)/.exec(req.headers.cookie || '') || [])[1];
// Caddy is the only client (we listen on 127.0.0.1) and puts the visitor's address last.
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();

// What we watch. `restart` is what the panel may do to it (/etc/sudoers.d/ops allows exactly these).
const UNITS = [
  { id: 'chipperly', label: 'App (live)', cgroup: 'system.slice/chipperly.service', restart: 'restart' },
  { id: 'chipperly-dev', label: 'App (dev)', cgroup: 'system.slice/chipperly-dev.service', restart: 'restart' },
  { id: 'postgresql@18-main', label: 'PostgreSQL', cgroup: 'system.slice/system-postgresql.slice' },
  { id: 'caddy', label: 'Caddy', cgroup: 'system.slice/caddy.service', restart: 'reload' },
  { id: 'github-runner', label: 'CI runner', cgroup: 'system.slice/github-runner.service' },
  { id: 'ops', label: 'Ops panel', cgroup: 'system.slice/ops.service' },
  { id: 'spl-harvester', label: 'spl-harvester (not Chipperly)', cgroup: 'system.slice/spl-harvester.service' },
];
const SITES = [
  { name: 'App', url: 'https://app.chipperlyapp.com', health: '/api/health', env: 'live', kind: 'server' },
  { name: 'Admin', url: 'https://admin.chipperlyapp.com', health: '/api/health', env: 'live', kind: 'server' },
  { name: 'Marketing site', url: 'https://chipperlyapp.com', health: '/', env: 'live', kind: 'worker', worker: 'chipperly-site' },
  { name: 'Dev app', url: 'https://dev-app.chipperlyapp.com', health: '/api/health', env: 'dev', kind: 'server' },
  { name: 'Dev admin', url: 'https://dev-admin.chipperlyapp.com', health: '/api/health', env: 'dev', kind: 'server' },
  { name: 'Dev site', url: 'https://dev.chipperlyapp.com', health: '/api/categories?limit=1', env: 'dev', kind: 'worker', worker: 'chipperly-site-dev' },
];

// ---- Cloudflare Access ----------------------------------------------------------------------

let certs = { at: 0, keys: {} };
async function accessKeys() {
  if (Date.now() - certs.at < 3600_000) return certs.keys;
  const res = await fetch(`https://${ACCESS_TEAM}/cdn-cgi/access/certs`);
  const { keys } = await res.json();
  certs = { at: Date.now(), keys: Object.fromEntries(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
  return certs.keys;
}

/** The signed-in person's email, or null. Fails closed when Access is not configured. */
async function accessUser(req) {
  if (!ACCESS_TEAM || !ACCESS_AUD) return null;
  try {
    return verifyAccessJwt(req.headers['cf-access-jwt-assertion'], await accessKeys(), { team: ACCESS_TEAM, aud: ACCESS_AUD });
  } catch {
    return null;
  }
}

// ---- Server metrics: sampled every 10 s, 24 h kept in memory and on disk --------------------

const SAMPLE_MS = 10_000;
const KEEP = (24 * 3600_000) / SAMPLE_MS;
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
let samples = [];
try {
  samples = JSON.parse(readFileSync(METRICS_FILE, 'utf8')).filter((s) => s.t > Date.now() - 24 * 3600_000);
} catch {}
let prev = null;

const readNum = (f) => {
  try {
    return Number(readFileSync(f, 'utf8').trim());
  } catch {
    return null;
  }
};
const cpuUsec = (cg) => {
  try {
    return Number(/usage_usec (\d+)/.exec(readFileSync(`/sys/fs/cgroup/${cg}/cpu.stat`, 'utf8'))[1]);
  } catch {
    return null;
  }
};

function sample() {
  const now = Date.now();
  const cpuLine = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = cpuLine[3] + cpuLine[4];
  const total = cpuLine.reduce((a, b) => a + b, 0);
  const mem = Object.fromEntries(
    readFileSync('/proc/meminfo', 'utf8').split('\n').filter(Boolean).map((l) => {
      const [k, v] = l.split(':');
      return [k, parseInt(v, 10) * 1024];
    }),
  );
  const net = readFileSync('/proc/net/dev', 'utf8').split('\n').find((l) => l.trim().startsWith('eth0:'));
  const [rx, , , , , , , , tx] = net ? net.split(':')[1].trim().split(/\s+/).map(Number) : [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const fs = statfsSync('/');
  const units = Object.fromEntries(UNITS.map((u) => [u.id, { mem: readNum(`/sys/fs/cgroup/${u.cgroup}/memory.current`), cpu: cpuUsec(u.cgroup) }]));
  const cur = { now, idle, total, rx, tx, units };
  if (prev) {
    const dt = (now - prev.now) / 1000;
    const s = {
      t: now,
      cpu: +(100 * (1 - (idle - prev.idle) / (total - prev.total))).toFixed(1),
      mem: mem.MemTotal - mem.MemAvailable,
      swap: mem.SwapTotal - mem.SwapFree,
      rx: Math.round((rx - prev.rx) / dt),
      tx: Math.round((tx - prev.tx) / dt),
      load: +readFileSync('/proc/loadavg', 'utf8').split(' ')[0],
      u: {},
    };
    for (const u of UNITS) {
      const a = units[u.id];
      const b = prev.units[u.id];
      s.u[u.id] = [a.mem, a.cpu != null && b?.cpu != null ? +((a.cpu - b.cpu) / 1e4 / dt).toFixed(1) : null];
    }
    samples.push(s);
    if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
  }
  prev = cur;
  return { memTotal: mem.MemTotal, swapTotal: mem.SwapTotal, diskTotal: fs.blocks * fs.bsize, diskUsed: (fs.blocks - fs.bfree) * fs.bsize };
}
let staticInfo = sample();
setInterval(() => (staticInfo = sample()), SAMPLE_MS).unref();
setInterval(() => {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(METRICS_FILE, JSON.stringify(samples));
  } catch {}
}, 300_000).unref();

// ---- systemd and journald --------------------------------------------------------------------

async function unitStates() {
  const { stdout } = await run('systemctl', ['show', ...UNITS.map((u) => u.id), '-p', 'Id,ActiveState,SubState,ActiveEnterTimestamp,NRestarts,MainPID', '--no-pager']);
  const blocks = stdout.trim().split('\n\n').map((b) => Object.fromEntries(b.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])));
  return UNITS.map((u, i) => ({ ...u, ...blocks[i], last: samples.at(-1)?.u[u.id] }));
}

const unitById = (id) => UNITS.find((u) => u.id === id);

async function logs({ unit, lines = 300, grep, priority, since }) {
  const args = ['-u', unit, '-n', String(Math.min(Number(lines) || 300, 2000)), '-o', 'short-iso', '--no-pager', '--no-hostname'];
  if (grep) args.push('--grep', grep, '--case-sensitive=false');
  if (priority) args.push('-p', priority);
  if (since) args.push('--since', since);
  const { stdout } = await run('journalctl', args, { maxBuffer: 16 * 1024 * 1024 }).catch((e) => ({ stdout: e.stdout || '' }));
  return stdout;
}

// ---- GitHub Actions --------------------------------------------------------------------------

const ghCache = new Map();
async function gh(pathname, { method = 'GET', body, cacheMs = 30_000 } = {}) {
  const key = method + pathname;
  const hit = ghCache.get(key);
  if (method === 'GET' && hit && Date.now() - hit.at < cacheMs) return hit.data;
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'chipperly-ops',
      ...(GH_TOKEN ? { authorization: `Bearer ${GH_TOKEN}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `GitHub ${res.status}`), { status: res.status });
  if (method === 'GET') ghCache.set(key, { at: Date.now(), data });
  return data;
}

// ---- Cloudflare API (IPv4 only: the token is locked to the server's IPv4 address) ------------

function cf(pathname, { method = 'GET', body, query } = {}) {
  if (!CF_TOKEN) return Promise.reject(Object.assign(new Error('CF_API_TOKEN is not set'), { status: 503 }));
  const qs = query ? '?' + new URLSearchParams(query) : '';
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      { host: 'api.cloudflare.com', path: `/client/v4${pathname}${qs}`, method, family: 4, headers: { authorization: `Bearer ${CF_TOKEN}`, 'content-type': 'application/json' } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            return reject(Object.assign(new Error(`Cloudflare ${res.statusCode}`), { status: 502 }));
          }
          if (!data.success && data.errors?.length) return reject(Object.assign(new Error(data.errors.map((e) => e.message).join('; ')), { status: res.statusCode }));
          resolve(data);
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20_000, () => req.destroy(new Error('Cloudflare timed out')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const acct = (p) => `/accounts/${CF_ACCOUNT}${p}`;

// ---- Site checks -----------------------------------------------------------------------------

async function checkSite(s) {
  const t0 = Date.now();
  try {
    const res = await fetch(s.url + s.health, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    let commit = null;
    if (s.health === '/api/health') commit = (await res.json().catch(() => ({}))).commit ?? null;
    return { ...s, status: res.status, up: res.status < 500, ms, commit };
  } catch (e) {
    return { ...s, status: 0, up: false, ms: Date.now() - t0, error: e.message };
  }
}

// ---- HTTP ------------------------------------------------------------------------------------

const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c.length + raw.length > 1e6 ? '' : c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const audit = (who, what) => console.log(JSON.stringify({ msg: 'ops action', who, what }));

const routes = {
  'GET /api/me': async ({ user }) => ({ email: user, github: Boolean(GH_TOKEN), cloudflare: Boolean(CF_TOKEN) }),

  'GET /api/overview': async () => {
    const [sites, units] = await Promise.all([Promise.all(SITES.map(checkSite)), unitStates()]);
    return { sites, units, host: { ...staticInfo, last: samples.at(-1) } };
  },

  'GET /api/metrics': async ({ q }) => {
    const hours = Math.min(Number(q.get('hours')) || 1, 24);
    const from = Date.now() - hours * 3600_000;
    const pts = samples.filter((s) => s.t >= from);
    const step = Math.max(1, Math.floor(pts.length / 360)); // at most ~360 points per chart
    return { info: staticInfo, units: UNITS.map(({ id, label }) => ({ id, label })), points: pts.filter((_, i) => i % step === 0) };
  },

  'GET /api/logs': async ({ q }) => {
    const unit = unitById(q.get('unit'));
    if (!unit) throw Object.assign(new Error('Unknown unit'), { status: 400 });
    return { unit: unit.id, text: await logs({ unit: unit.id, lines: q.get('lines'), grep: q.get('grep') || undefined, priority: q.get('priority') || undefined, since: q.get('since') || undefined }) };
  },

  'POST /api/units/restart': async ({ body, user }) => {
    const unit = unitById(body.unit);
    if (!unit?.restart) throw Object.assign(new Error('That service cannot be restarted from here'), { status: 400 });
    audit(user, `${unit.restart} ${unit.id}`);
    await run('sudo', ['-n', '/usr/bin/systemctl', unit.restart, unit.id]);
    return { ok: true };
  },

  'GET /api/deployments': async () => {
    const [runs, workflows] = await Promise.all([gh(`/repos/${GH_REPO}/actions/runs?per_page=30`), gh(`/repos/${GH_REPO}/actions/workflows`, { cacheMs: 600_000 })]);
    return {
      repo: GH_REPO,
      canDispatch: Boolean(GH_TOKEN),
      workflows: workflows.workflows.map((w) => ({ id: w.id, name: w.name, path: w.path, state: w.state })),
      runs: runs.workflow_runs.map((r) => ({
        id: r.id,
        name: r.name,
        branch: r.head_branch,
        sha: r.head_sha.slice(0, 7),
        title: r.display_title,
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        actor: r.actor?.login,
        created: r.created_at,
        updated: r.updated_at,
        url: r.html_url,
      })),
    };
  },

  'GET /api/deployments/jobs': async ({ q }) => {
    const id = Number(q.get('run'));
    const data = await gh(`/repos/${GH_REPO}/actions/runs/${id}/jobs`, { cacheMs: 10_000 });
    return data.jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, started: j.started_at, completed: j.completed_at, url: j.html_url, steps: j.steps?.map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion })) }));
  },

  'POST /api/deployments/dispatch': async ({ body, user }) => {
    const allowed = { 'deploy-app.yml': 'main', 'deploy-site.yml': 'main' };
    if (!allowed[body.workflow]) throw Object.assign(new Error('Unknown workflow'), { status: 400 });
    audit(user, `dispatch ${body.workflow}`);
    await gh(`/repos/${GH_REPO}/actions/workflows/${body.workflow}/dispatches`, { method: 'POST', body: { ref: allowed[body.workflow] } });
    return { ok: true, note: 'Started. It waits for an approval on the production environment in GitHub.' };
  },

  // Cloudflare
  'GET /api/cf/workers': async () => {
    const scripts = (await cf(acct('/workers/scripts'))).result;
    return Promise.all(
      scripts.map(async (s) => {
        const deps = await cf(acct(`/workers/scripts/${s.id}/deployments`)).catch(() => ({ result: { deployments: [] } }));
        const versions = await cf(acct(`/workers/scripts/${s.id}/versions`), { query: { per_page: '10' } }).catch(() => ({ result: { items: [] } }));
        return { id: s.id, modified: s.modified_on, created: s.created_on, deployments: (deps.result.deployments || []).slice(0, 5), versions: versions.result.items || [] };
      }),
    );
  },

  'POST /api/cf/workers/rollback': async ({ body, user }) => {
    if (!/^[a-z0-9-]+$/.test(body.script || '') || !/^[0-9a-f-]{36}$/.test(body.version || '')) throw Object.assign(new Error('Bad request'), { status: 400 });
    audit(user, `rollback ${body.script} to ${body.version}`);
    return (await cf(acct(`/workers/scripts/${body.script}/deployments`), { method: 'POST', body: { strategy: 'percentage', versions: [{ version_id: body.version, percentage: 100 }], annotations: { 'workers/message': `Rollback from ops panel by ${user}` } } })).result;
  },

  'GET /api/cf/worker-logs': async ({ q }) => {
    const script = q.get('script');
    const minutes = Math.min(Number(q.get('minutes')) || 60, 24 * 60);
    const to = Date.now();
    const filters = [{ key: '$metadata.service', operation: 'eq', type: 'string', value: script }];
    if (q.get('errors') === '1') filters.push({ key: '$metadata.error', operation: 'exists', type: 'string' });
    const data = await cf(acct('/workers/observability/telemetry/query'), {
      method: 'POST',
      body: { queryId: 'ops-panel', timeframe: { from: to - minutes * 60_000, to }, view: 'events', limit: 200, parameters: { filters } },
    });
    const events = data.result?.events?.events || [];
    return events.map((e) => ({ t: e.timestamp, level: e.$metadata?.level, message: e.$metadata?.message || e.source?.message || '', status: e.$workers?.event?.response?.status, url: e.$workers?.event?.request?.url, error: e.$metadata?.error }));
  },

  'GET /api/cf/storage': async () => {
    const [d1, r2] = await Promise.all([cf(acct('/d1/database'), { query: { per_page: '50' } }), cf(acct('/r2/buckets'))]);
    const buckets = await Promise.all(
      (r2.result.buckets || []).map(async (b) => {
        const usage = await cf(acct(`/r2/buckets/${b.name}/usage`)).catch(() => null);
        return { name: b.name, created: b.creation_date, size: usage?.result?.payloadSize ?? null, objects: usage?.result?.objectCount ?? null };
      }),
    );
    return { d1: d1.result.map((d) => ({ name: d.name, id: d.uuid, size: d.file_size, tables: d.num_tables, created: d.created_at })), r2: buckets };
  },

  'GET /api/cf/dns': async () => (await cf(`/zones/${CF_ZONE}/dns_records`, { query: { per_page: '200' } })).result.map((r) => ({ id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl, comment: r.comment })),

  'POST /api/cf/dns': async ({ body, user }) => {
    const rec = { type: body.type, name: body.name, content: body.content, proxied: Boolean(body.proxied), ttl: 1, comment: body.comment || undefined };
    audit(user, `dns ${body.id ? 'update' : 'create'} ${rec.type} ${rec.name} ${rec.content}`);
    return body.id ? (await cf(`/zones/${CF_ZONE}/dns_records/${body.id}`, { method: 'PUT', body: rec })).result : (await cf(`/zones/${CF_ZONE}/dns_records`, { method: 'POST', body: rec })).result;
  },

  'POST /api/cf/dns/delete': async ({ body, user }) => {
    audit(user, `dns delete ${body.id}`);
    return (await cf(`/zones/${CF_ZONE}/dns_records/${body.id}`, { method: 'DELETE' })).result;
  },

  'POST /api/cf/purge': async ({ body, user }) => {
    audit(user, `purge ${body.urls?.length ? body.urls.join(' ') : 'everything'}`);
    return (await cf(`/zones/${CF_ZONE}/purge_cache`, { method: 'POST', body: body.urls?.length ? { files: body.urls } : { purge_everything: true } })).result;
  },

  'GET /api/cf/analytics': async () => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const query = `query($a:String!,$z:String!,$since:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:20,filter:{datetime_geq:$since},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors subrequests}quantiles{cpuTimeP50 cpuTimeP99}}}zones(filter:{zoneTag:$z}){httpRequests1hGroups(limit:24,filter:{datetime_geq:$since},orderBy:[datetime_ASC]){dimensions{datetime}sum{requests cachedRequests bytes threats}uniq{uniques}}}}}`;
    const data = await cf('/graphql', { method: 'POST', body: { query, variables: { a: CF_ACCOUNT, z: CF_ZONE, since } } });
    const v = data.data?.viewer;
    return { workers: v?.accounts?.[0]?.workersInvocationsAdaptive || [], zone: v?.zones?.[0]?.httpRequests1hGroups || [] };
  },
};

// Live log tail over server-sent events.
function streamLogs(req, res, q) {
  const unit = unitById(q.get('unit'));
  if (!unit) return json(res, 400, { error: 'Unknown unit' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const args = ['-u', unit.id, '-f', '-n', '50', '-o', 'short-iso', '--no-pager', '--no-hostname'];
  if (q.get('priority')) args.push('-p', q.get('priority'));
  const child = spawn('journalctl', args);
  let buf = '';
  child.stdout.on('data', (c) => {
    buf += c;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const l of lines) res.write(`data: ${JSON.stringify(l)}\n\n`);
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(ping);
    child.kill();
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const sec = { 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
  if (req.method === 'POST' && url.pathname === '/login') {
    if (!String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { error: 'JSON only' });
    const r = auth.signIn(await readBody(req), clientIp(req));
    console.log(JSON.stringify({ msg: r.token ? 'ops sign-in' : 'ops sign-in refused', who: r.email, ip: clientIp(req) }));
    if (!r.token) return json(res, 401, { error: r.error });
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=${r.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`, ...sec });
    return res.end('{"ok":true}');
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    auth.signOut(cookieOf(req));
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`, ...sec });
    return res.end('{"ok":true}');
  }
  const user = (await accessUser(req)) || auth.user(cookieOf(req));
  if (!user) {
    if (url.pathname.startsWith('/api/')) return json(res, 401, { error: 'Signed out' });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...sec });
    return res.end(LOGIN);
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...sec });
    return res.end(HTML);
  }
  if (req.method === 'GET' && url.pathname === '/api/logs/stream') return streamLogs(req, res, url.searchParams);
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return json(res, 404, { error: 'Not found' });
  // Changes need a same-origin JSON request: a form on another site cannot send one.
  if (req.method !== 'GET' && !String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { error: 'JSON only' });
  try {
    json(res, 200, await handler({ q: url.searchParams, body: req.method === 'GET' ? {} : await readBody(req), user }));
  } catch (e) {
    json(res, e.status && e.status < 600 ? e.status : 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`ops panel on 127.0.0.1:${PORT}`));

if (!existsSync(DATA_DIR)) console.log(`note: ${DATA_DIR} missing; metrics history is kept in memory only`);
