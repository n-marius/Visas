// Ausgabe getrennt nach Ukraine (ua) und Georgien (ge), damit die Fläche im Landesfarbton unterlegt werden kann (Natural Earth zählt z. B. die Krim zu Russland).
// Besetzte Gebiete (von Russland): Polygone aus DeepState (OSINT, kein amtlicher Datensatz), nur Status „Occupied“,
// Krim, ORDLO, Abchasien, Zchinwali-Gebiet. Ausgabe: data/occupied.json (projiziert, wie world.json).
import { writeFileSync } from 'node:fs';
import { path, OUT } from './proj.mjs';
const r = await fetch('https://deepstatemap.live/api/history/last');
if (!r.ok) throw new Error('DeepState ' + r.status);
const feats = (await r.json()).map.features;
const keep = n => /^Окуповано\s*\/\/\/\s*Occupied/.test(n) || /Occupied Crimea|CADR and CALR|Occupied Abkhazia|Цхінвальський/.test(n);
const area = ring => ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0);
const fix = rings => rings.map((ring, i) => { const cw = area(ring) < 0; return (i === 0) === cw ? ring : [...ring].reverse(); }); // d3: Außenring im Uhrzeigersinn
let ua = '', ge = '', n = 0;
for (const f of feats) {
  if (f.geometry.type !== 'Polygon' || !keep(f.properties.name || '')) continue;
  const g = { type: 'Polygon', coordinates: fix(f.geometry.coordinates.map(rg => rg.map(p => [p[0], p[1]]))) };
  const dd = path(g) || ''; if (/Abkhazia|Цхінвальський/.test(f.properties.name)) ge += dd; else ua += dd; n++;
}
if (n < 3 || ua.length < 500) throw new Error('zu wenige Gebiete: ' + n);
writeFileSync(OUT + '/occupied.json', JSON.stringify({ source: 'DeepState (deepstatemap.live)', fetched: new Date().toISOString().slice(0, 10), ua, ge }));
console.log(n, 'Polygone', ua.length, ge.length);
