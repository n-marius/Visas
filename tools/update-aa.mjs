// Reisewarnungen des Auswärtigen Amts (Open Data) als Snapshot: data/travelwarnings.json
import { writeFileSync } from 'node:fs';
const r = await fetch('https://www.auswaertiges-amt.de/opendata/travelwarning');
if (!r.ok) throw new Error('AA ' + r.status);
const j = (await r.json()).response;
const e = Object.entries(j).filter(([k]) => /^\d+$/.test(k)).map(([, v]) => v);
if (e.length < 100) throw new Error('zu wenige Länder');
const pick = f => e.filter(v => v[f] && v.countryCode).map(v => v.countryCode).sort();
writeFileSync((process.env.OUT || 'data') + '/travelwarnings.json', JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), aaModified: j.lastModified, warning: pick('warning'), partial: pick('partialWarning'), situation: pick('situationWarning') }));
console.log('ok', pick('warning'));
