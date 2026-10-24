// Builds the regional basemap (public/geo/region.json) from Natural Earth
// 1:50m boundaries packaged in the `world-atlas` npm module (public domain).
// ASEAN members keep their ISO 3166 numeric code; neighbours are kept as
// grey context shapes. Run with: node scripts/build-geo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const all = feature(topo, topo.objects.countries);

const ASEAN = { '096': 'BRN', '116': 'KHM', '360': 'IDN', '418': 'LAO', '458': 'MYS', '104': 'MMR', '608': 'PHL', '702': 'SGP', '764': 'THA', '626': 'TLS', '704': 'VNM' };
const BBOX = [88, -13, 145, 30];

const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100] : c.map(round));
const inBox = (geom) => {
  const flat = JSON.stringify(geom.coordinates).match(/-?\d+\.?\d*/g).map(Number);
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = [flat[i], flat[i + 1]];
    if (x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3]) return true;
  }
  return false;
};

const out = { type: 'FeatureCollection', features: [] };
for (const f of all.features) {
  if (!f.geometry) continue;
  const id = String(f.id).padStart(3, '0');
  const iso3 = ASEAN[id];
  if (!iso3 && !inBox(f.geometry)) continue;
  out.features.push({
    type: 'Feature',
    properties: { name: iso3 || `ctx-${id}`, member: Boolean(iso3) },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  });
}
writeFileSync(new URL('../public/geo/region.json', import.meta.url), JSON.stringify(out));
console.log(`features: ${out.features.length}, members: ${out.features.filter((f) => f.properties.member).length}`);
