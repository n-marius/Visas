const V = 'passage-v6';
const SHELL = ['./','index.html','css/style.css','js/app.js','data/world.json','data/passport-index-tidy-iso2.csv','data/overrides.json','data/meta.json','data/occupied.json','data/verified.json','manifest.webmanifest','icons/logo.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && c.put(u, r))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('passage-v') && n !== V).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
// Netzwerk zuerst (am HTTP-Cache vorbei, GitHub Pages cached 10 Min.), bei Offline aus dem Cache.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(V).then(async c => {
    try {
      const r = await fetch(new Request(e.request, { cache: 'no-cache' }));
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? c.match('index.html') : Response.error());
    }
  }));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Visas', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Visas', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow('./')));
});
