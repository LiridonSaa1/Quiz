/**
 * Normalize common video page URLs to embed-friendly URLs for iframes.
 */
export function toEmbedVideoUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const m = parsed.pathname.match(/\/embed\/([^/?]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}`;
      const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    }
    if (host.includes('vimeo.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const id = parts[0] === 'video' ? parts[1] : parts[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host.includes('dailymotion.com')) {
      const m = parsed.pathname.match(/\/video\/([^/?]+)/);
      if (m) return `https://www.dailymotion.com/embed/video/${m[1]}`;
    }
  } catch {
    return u;
  }
  return u;
}

/** Direct file URLs (mp4, etc.) should use <video>, not iframe */
export function isDirectVideoFileUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url.trim());
}

export function isLikelyVideoLink(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    isDirectVideoFileUrl(url) ||
    /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/.test(lower)
  );
}
