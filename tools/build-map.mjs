// Erzeugt data/world.json (projizierte SVG-Pfade je ISO-2-Land) aus world-atlas (Natural Earth 50m).
// Aufruf: npm i world-atlas topojson-client d3-geo i18n-iso-countries && node tools/build-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as topo from 'topojson-client';
import { geoEqualEarth, geoPath } from 'd3-geo';
import iso from 'i18n-iso-countries';
const t = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json'));
const W = 1000;
const proj = geoEqualEarth().rotate([-11, 0]);
const fc = topo.feature(t, t.objects.countries);
const extra = { 'Kosovo': 'XK', 'N. Cyprus': null, 'Somaliland': null };
const geo = fc.features.filter(f => f.properties.name !== 'Antarctica' && f.properties.name !== 'Fr. S. Antarctic Lands');
proj.fitWidth(W, { type: 'FeatureCollection', features: geo });
const path = geoPath(proj).digits(1);
const out = {}; let H = 0;
for (const f of geo) {
  let c = f.id ? iso.numericToAlpha2(String(f.id).padStart(3, '0')) : extra[f.properties.name];
  if (!c) { if (f.properties.name === 'Kosovo') c = 'XK'; else if (f.properties.name === 'N. Cyprus') c = 'CY'; else if (f.properties.name === 'Somaliland') c = 'SO'; else { console.warn('skip', f.properties.name, f.id); continue; } }
  const d = path(f); if (!d) continue;
  out[c] = (out[c] ? out[c] : '') + d;
}
const b = geoPath(proj).bounds({ type: 'FeatureCollection', features: geo });
writeFileSync('data/world.json', JSON.stringify({ w: Math.ceil(b[1][0]), h: Math.ceil(b[1][1]), paths: out }));
console.log(Object.keys(out).length, 'Länder');
