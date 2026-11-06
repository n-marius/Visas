// Projiziert data/cities-src.json ([{n, lat, lon}]) mit derselben Projektion wie die Karte nach data/cities.json.
// Aufruf: OUT=data node tools/build-cities.mjs  (im Ordner mit node_modules: world-atlas, topojson-client, d3-geo)
import { readFileSync, writeFileSync } from 'node:fs';
import { proj, OUT } from './proj.mjs';
const src = JSON.parse(readFileSync(process.env.SRC || 'data/cities-src.json'));
const pts = src.map(c => { const [x, y] = proj([c.lon, c.lat]); return [c.n, +x.toFixed(2), +y.toFixed(2)]; });
writeFileSync(OUT + '/cities.json', JSON.stringify({ pts }));
console.log(pts.length, 'Orte');
