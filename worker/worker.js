// Cloudflare Worker (kostenloser Plan): speichert Push-Abos + Fristen, sendet täglich per Cron.
// UNGETESTET-Gerüst – siehe README, Abschnitt „Echte Push-Nachrichten“.
import { buildPushPayload } from '@block65/webcrypto-web-push';

const cors = o => ({ 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env) {
    const h = cors(env.ALLOW_ORIGIN || '*');
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/subscribe') {
      const { subscription, reminders } = await req.json();
      if (!subscription?.endpoint) return new Response('bad request', { status: 400, headers: h });
      await env.SUBS.put(await hash(subscription.endpoint), JSON.stringify({ subscription, reminders: reminders || [] }));
      return new Response('ok', { headers: h });
    }
    return new Response('Visas push worker', { headers: h });
  },

  async scheduled(_evt, env) {
    const today = new Date().toISOString().slice(0, 10);
    const left = d => Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
    const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE };
    const { keys } = await env.SUBS.list();
    for (const { name } of keys) {
      const rec = JSON.parse(await env.SUBS.get(name));
      for (const r of rec.reminders) {
        const n = left(r.expiry);
        if (!(r.remindOn === today || [30, 7, 1, 0].includes(n))) continue;
        const body = n < 0 ? 'abgelaufen' : n === 0 ? 'läuft heute ab' : `noch ${n} Tage (Ablauf ${r.expiry})`;
        try {
          const payload = await buildPushPayload({ data: JSON.stringify({ title: r.title, body, tag: r.id }), options: { ttl: 86400 } }, rec.subscription, vapid);
          const res = await fetch(rec.subscription.endpoint, payload);
          if (res.status === 404 || res.status === 410) { await env.SUBS.delete(name); break; }
        } catch (e) { console.log('push failed', e); }
      }
    }
  }
};
