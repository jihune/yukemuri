import { normalizeSearch } from './hotel-names';

export type NameMatch = { score: number; similar: boolean };
export type PreparedName = { name:string; key:string; words:string[]; parts:string[] };
export function prepareHotelName(name:string):PreparedName {
  const key=normalizeSearch(name);
  const parts=[...new Set(name.split(/[\s・·/()[\]（）]+/u).map(normalizeSearch).filter(Boolean))];
  return {name,key,parts,words:[...new Set([key,...parts])]};
}

function substitution(a: string, b: string) {
  if (a === b) return 0;
  const x = a.charCodeAt(0) - 0xac00, y = b.charCodeAt(0) - 0xac00;
  if (x < 0 || y < 0 || x >= 11172 || y >= 11172) return 1;
  // A single mistyped Korean consonant or vowel is closer than another syllable.
  const parts = (n: number) => [Math.floor(n / 588), Math.floor(n / 28) % 21, n % 28];
  return parts(x).filter((v, i) => v !== parts(y)[i]).length === 1 ? .5 : 1;
}

function distance(a: string, b: string) {
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + substitution(a[i - 1], b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + .65);
    }
    rows.push(row);
  }
  return rows[a.length][b.length];
}

export function matchHotelName(query: string, name: string, normalized = false): NameMatch | null {
  return matchPreparedHotelName(normalized ? query : normalizeSearch(query),prepareHotelName(name));
}

export function matchPreparedHotelName(q:string, prepared:PreparedName):NameMatch|null {
  const {key,words}=prepared;
  if (!q || !key) return null;
  if (key === q) return { score: 100, similar: false };
  // Short queries must occur inside a real word. Joining Marina/마리나 and
  // Hakodate/하코다테 would otherwise rank that hotel for Naha/나하.
  const short=(q.length<=2&&/^[가-힣]+$/.test(q))||(q.length<=4&&/^[a-z]+$/.test(q));
  const literal=!short||prepared.parts.some(word=>word.includes(q));
  if (literal&&key.startsWith(q)) return { score: 90 + q.length / key.length, similar: false };
  if (prepared.parts.includes(q)) return { score: 88 + q.length / key.length, similar: false };
  if (literal&&key.includes(q)) return { score: 80 + q.length / key.length, similar: false };
  if (q.length < 3 || q.length > 80) return null;
  const edits = Math.max(1, Math.min(3, Math.floor(q.length * .2)));
  let best = 0;
  // Prefixes support autocomplete before the whole name has been typed. Word
  // boundaries also cover OTA names that prepend the location or hotel brand.
  for (const word of words) {
    for (let length = Math.max(2, q.length - edits); length <= Math.min(word.length, q.length + edits); length++) {
      const part = word.slice(0, length);
      let shared = 0;
      const remaining = [...part];
      for (const ch of q) { const at = remaining.indexOf(ch); if (at >= 0) { shared++; remaining.splice(at, 1); } }
      if (shared < q.length - edits - 1) continue;
      const d = distance(q, part), similarity = 1 - d / Math.max(q.length, length);
      const shortKanji = /^\p{Script=Han}{3}$/u.test(q) && word.length === 3 && shared >= 2;
      if (d <= edits && similarity >= (shortKanji ? 2 / 3 - .001 : .75)) best = Math.max(best, similarity);
    }
  }
  return best ? { score: 50 + best * 20, similar: true } : null;
}
