import { env } from 'cloudflare:workers';
export function favoritesDb(){if(!env.DB) throw new Error('DB binding unavailable');return env.DB}
