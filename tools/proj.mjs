// Gemeinsame Projektion für Länder- und Besatzungs-Layer (Equal Earth, 1000 Einheiten breit).
import { readFileSync } from 'node:fs';
import * as topo from 'topojson-client';
import { geoEqualEarth, geoPath } from 'd3-geo';
const t = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json'));
export const geo = topo.feature(t, t.objects.countries).features.filter(f => !['Antarctica', 'Fr. S. Antarctic Lands'].includes(f.properties.name));
export const proj = geoEqualEarth().rotate([-11, 0]);
proj.fitWidth(1000, { type: 'FeatureCollection', features: geo });
export const path = geoPath(proj).digits(1);
export const OUT = process.env.OUT || 'data';
