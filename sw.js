/* Service Worker — محل نور
   - الصفحات و products.json: الشبكة الأول (عشان تعديلات المدير تظهر فوراً)، وبتفتح من النسخة المحفوظة لو مفيش نت.
   - الصور والأيقونات والخطوط: من الكاش وتتحدّث في الخلفية.
   - طلبات GitHub API (لوحة التحكم) مابتعديش من هنا خالص.
   لو غيّرتي في قايمة SHELL، غيّري رقم VERSION. */
const VERSION = 'noor-pages-v1';
const RUNTIME = 'noor-assets-v1';
const SHELL = ['./', 'index.html', 'admin.html', 'manifest.json', 'admin-manifest.json',
               'icon-192.png', 'icon-512.png', 'admin-192.png', 'admin-512.png'];
const CDN = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const MAX_RUNTIME = 160;

const sleep = ms => new Promise(r => setTimeout(r, ms));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [VERSION, RUNTIME];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(e, req, key) {
  const cache = await caches.open(VERSION);
  const net = fetch(req.url, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  const first = await Promise.race([net.catch(() => null), sleep(4000).then(() => null)]);
  if (first) return first;
  const cached = await cache.match(key);
  if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
  try { return await net; } catch (_) {}
  if (req.mode === 'navigate') {
    const home = await cache.match(new URL('index.html', self.registration.scope).href);
    if (home) return home;
  }
  return Response.error();
}

async function staleWhileRevalidate(e, req, sameOrigin) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req, { ignoreSearch: sameOrigin });
  const net = fetch(req).then(res => {
    if (res && res.status !== 206 && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).then(() => trim(cache, MAX_RUNTIME)).catch(() => {});
    }
    return res;
  }).catch(() => null);
  if (cached) { e.waitUntil(net); return cached; }
  return (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const p = url.pathname;
    const isDoc = req.mode === 'navigate' || p.endsWith('/') || /\.(html|json)$/i.test(p);
    e.respondWith(isDoc ? networkFirst(e, req, url.origin + p) : staleWhileRevalidate(e, req, true));
  } else if (CDN.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(e, req, false));
  }
});
