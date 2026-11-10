// Feed the same coordinates to the three in-Japan rules.
// Usage (cwd = repo copy): node <this file> <scratch temp dir>
// crawl-contract.ts is compiled with the repository's own compileLib; the
// collector's and snapshot-geo's rules are their source lines, evaluated as written.
import {createRequire} from 'node:module';
import {mkdtempSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const temp = mkdtempSync(join(resolve(process.argv[2]), 'coord-'));
const {compileLib} = await import(pathToFileURL(resolve('scripts/build-search-snapshot.mjs')).href);
const require = createRequire(import.meta.url);
const contract = require(compileLib(temp, 'lib/crawl-contract.ts'));
let observed = contract.observedHotel;
while (!observed.shape && observed._def?.schema) observed = observed._def.schema; // unwrap .refine()
const location = observed.shape.location;

const geoLine = readFileSync('scripts/snapshot-geo.mjs', 'utf8').split('\n').find((line) => line.startsWith('const inJapan='));
const inJapan = new Function(geoLine + ';return inJapan')();
const pyLine = readFileSync('scripts/crawler/collect.py', 'utf8').split('\n').find((line) => line.includes('if not (20 < lat'));
const pyCondition = pyLine.trim().replace(/^if not \((.*)\):$/, '$1');

const inputs = [[35.0, 139.0], [20, 139.0], [46.5, 139.0], [35.0, 122], [35.0, 154], [19.99, 139.0], [22.0, 139.0]];
console.log('collect.py line: ' + pyLine.trim());
console.log('snapshot-geo.mjs line: ' + geoLine.slice(0, 110));
for (const [lat, lng] of inputs) {
  const py = spawnSync('python3', ['-I', '-c', `lat,lng=${lat},${lng}\nprint('kept' if (${pyCondition}) else 'dropped')`], {encoding: 'utf8'}).stdout.trim();
  const zod = location.safeParse({label: 'x', address: 'x', latitude: lat, longitude: lng, isApproximate: false}).success ? 'accepted' : 'rejected';
  console.log(`lat=${lat} lng=${lng}\tcollect.py=${py}\tcrawl-contract.ts=${zod}\tsnapshot-geo.mjs=${inJapan(lat, lng) ? 'inJapan' : 'outside'}`);
}
