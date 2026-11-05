// Erzeugt data/world.json: projizierte SVG-Pfade je ISO-2-Land (Natural Earth 50m via world-atlas),
// ergänzt um Gebiete, die nur in 10m vorkommen (Gibraltar, Tuvalu), und Marker für sehr kleine Staaten/Gebiete.
// Aufruf: npm i world-atlas topojson-client d3-geo i18n-iso-countries && OUT=data node tools/build-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as topo from 'topojson-client';
import iso from 'i18n-iso-countries';
import { geo, proj, path, OUT } from './proj.mjs';
import { geoPath } from 'd3-geo';
const t10 = JSON.parse(readFileSync('node_modules/world-atlas/countries-10m.json'));
const ids50 = new Set(geo.map(f => f.id));
const add10 = topo.feature(t10, t10.objects.countries).features.filter(f => f.id && !ids50.has(f.id) && ['292', '798'].includes(String(f.id)));
const code = f => {
  if (f.id) return iso.numericToAlpha2(String(f.id).padStart(3, '0'));
  return { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' }[f.properties.name];
};
const out = {}, marks = {}, feats = {};
for (const f of [...geo, ...add10]) {
  const c = code(f);
  if (!c) { console.warn('skip', f.properties.name, f.id); continue; }
  const d = path(f); if (!d) continue;
  out[c] = (out[c] || '') + d;
  (feats[c] ||= []).push(f);
}
const gp = geoPath(proj);
for (const [c, fs] of Object.entries(feats)) {
  const area = fs.reduce((a, f) => a + gp.area(f), 0);
  if (area < 14) { // Fläche in Karteneinheiten² (Karte 1000 breit)
    const big = fs.sort((a, b) => gp.area(b) - gp.area(a))[0];
    const [x, y] = gp.centroid(big);
    const bb = fs.map(f => gp.bounds(f));
    const dim = Math.max(Math.max(...bb.map(q => q[1][0])) - Math.min(...bb.map(q => q[0][0])), Math.max(...bb.map(q => q[1][1])) - Math.min(...bb.map(q => q[0][1])));
    if (isFinite(x)) marks[c] = [+x.toFixed(1), +y.toFixed(1), +dim.toFixed(2)]; // dim = Ausdehnung in Karteneinheiten
  }
}
const b = gp.bounds({ type: 'FeatureCollection', features: geo });
writeFileSync(OUT + '/world.json', JSON.stringify({ w: Math.ceil(b[1][0]), h: Math.ceil(b[1][1]), paths: out, marks }));
console.log(Object.keys(out).length, 'Länder,', Object.keys(marks).length, 'Marker:', Object.keys(marks).join(' '));
