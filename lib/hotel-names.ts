import type { Hotel } from './hotel-types';
import { REGIONS } from './hotel-types';

export function normalizeSearch(value: string): string {
  // Locale-independent: the stored search text and name keys were lower-cased
  // this way, so a Turkish browser must not turn "I" into a dotless "ı".
  return value.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[\s\p{P}\p{S}]/gu, '');
}

export function hotelNames(hotel: Pick<Hotel,'names'|'aliases'>): string[] {
  return [...new Set([hotel.names.ko, hotel.names.ja, hotel.names.en, ...(hotel.aliases ?? [])].map(s => s.trim()).filter(Boolean))];
}

// U07 (D03, user decision 2026-10-17): a stay is named in Korean, else in English, else in its
// own language, and its original name is shown beside the first when it differs. A Jalan stay
// carries one name in all three fields, so `en` counts only when it reads as English: Latin
// letters and no Hangul, kana or kanji (after NFKC, so full-width ＣＯＧＯ is English too).
// en is null when it is the original name again; ja is null when it is the title.
const HANGUL = /[가-힣]/;
const JAPANESE = /[ぁ-ゖァ-ヺー㐀-䶿一-鿿]/;
const sameName = (a: string, b: string) => normalizeSearch(a) === normalizeSearch(b);
const isEnglish = (value: string) => { const s = value.normalize('NFKC'); return /[A-Za-z]/.test(s) && !HANGUL.test(s) && !JAPANESE.test(s); };
export type DisplayNames = { title: string; titleLang: 'ko' | 'en' | 'ja'; en: string | null; ja: string | null };
export function displayNames(names: Hotel['names']): DisplayNames {
  const ko = HANGUL.test(names.ko) ? names.ko.trim() : '';
  const ja = names.ja.trim() || names.ko.trim();
  const english = [names.en, names.ko].map(s => s.trim()).find(s => s && isEnglish(s) && !sameName(s, ja)) ?? null;
  const title = ko || english || ja;
  return { title, titleLang: ko ? 'ko' : english ? 'en' : 'ja', en: english && english !== title ? english : null, ja: sameName(ja, title) ? null : ja };
}
// The lang attribute of a shown name: none for Korean (the page's own), en or ja otherwise.
export const nameLang = (name: string) => HANGUL.test(name) ? undefined : isEnglish(name) ? 'en' : 'ja';

export function hotelSearchText(hotel: Pick<Hotel,'names'|'aliases'|'regionId'|'prefecture'|'location'>): string {
  const region = REGIONS.find(r => r.id === hotel.regionId);
  const pref = REGIONS.find(r => r.id === hotel.prefecture);
  return normalizeSearch([...hotelNames(hotel), hotel.location.label, hotel.location.address, region?.name.split(' · ')[0], region?.ja.split('・')[0], region?.en.split(' ')[0], pref?.name.split(' · ')[0], pref?.ja, pref?.en.split(' ')[0]].join(' '));
}
