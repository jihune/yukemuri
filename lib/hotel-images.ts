// Trip.com sometimes embeds a second CDN origin inside its JSON-LD image URL.
// Resolve that origin instead of requesting the invalid concatenated path.
export function normalizeHotelImage(value: string): string {
  const clean = value.trim().replace(/&amp;/g, '&');
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (/^[a-z0-9-]+\.tripcdn\.com$/i.test(url.hostname)) {
      const embedded = [...url.pathname.matchAll(/\/([a-z0-9-]+\.tripcdn\.com)\/images\//gi)].pop();
      if (embedded) {
        return `https://${embedded[1]}/images/${url.pathname.slice(embedded.index! + embedded[0].length).replace(/^\/+/, '')}${url.search}`;
      }
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    }
    return url.href;
  } catch {
    // Preserve the site's own static image assets.
    return /^\/(?!\/)/.test(clean) ? clean : '';
  }
}

export function hotelImageCandidates(src: string, alternatives: string[] = []): string[] {
  const result = [src, ...alternatives].map(normalizeHotelImage).filter(Boolean);
  for (const value of [...result]) {
    try {
      const url = new URL(value);
      if (/^[a-z0-9-]+\.tripcdn\.com$/i.test(url.hostname) && /^\/images\/[^/]+_R_/.test(url.pathname)) {
        // Request the same photo without an obsolete resizing suffix.
        url.pathname = url.pathname.replace(/_R_.*\.(jpg|jpeg|png|webp)$/i, '.$1');
        result.push(url.href);
      }
    } catch { /* Local assets have no remote variant. */ }
  }
  return [...new Set(result)];
}
