declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CRAWL_ACCESS_KEY?: string;
    API_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
    REJECT_AUTOMATED_AGENTS?: string;
    GOOGLE_PLACES_API_KEY?: string;
    GOOGLE_PLACES_ENABLED?: string;
    GOOGLE_PLACES_DAILY_REQUEST_LIMIT?: string;
  }
}
