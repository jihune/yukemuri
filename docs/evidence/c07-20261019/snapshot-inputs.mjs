// C07 plan 3: prints snapshotInputs() of the checkout it runs in (the files a
// search snapshot is made from, scripts/build-search-snapshot.mjs) as JSON.
// Usage: node docs/evidence/c07-20261019/snapshot-inputs.mjs
import {snapshotInputs} from '../../../scripts/build-search-snapshot.mjs';
console.log(JSON.stringify(snapshotInputs()));
