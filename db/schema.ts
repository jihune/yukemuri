import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
// Preserve the original owner's collection when enabling anonymous browsing.
export const favorites=sqliteTable('favorites',{
 hotelId:text('hotel_id').primaryKey(),
 createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const visitorFavorites=sqliteTable('visitor_favorites',{
 visitorKey:text('visitor_key').notNull(),
 hotelId:text('hotel_id').notNull(),
 createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},table=>[primaryKey({columns:[table.visitorKey,table.hotelId]})]);
export const hotels=sqliteTable('hotels',{
 id:text('id').primaryKey(),region:text('region').notNull(),prefecture:text('prefecture'),name:text('name').notNull(),searchText:text('search_text').notNull(),kind:text('kind').notNull(),
 tripScore:real('trip_score'),tripReviews:integer('trip_reviews'),jalanScore:real('jalan_score'),jalanReviews:integer('jalan_reviews'),
 natural:integer('natural'),largeBath:integer('large_bath'),outdoor:integer('outdoor'),privateBath:integer('private_bath'),roomOnsen:integer('room_onsen'),roomOutdoor:integer('room_outdoor'),
 bathFeatures:integer('bath_features'),bathKnown:integer('bath_known'),
 payload:text('payload').notNull(),
});
// C04: every index adds a written row to each insert, and to each update that
// sets its columns. Lists, search and the map read the static snapshot (P03),
// so the hotels, hotel_names and hotel_lifecycle indexes and two crawl_jobs
// ones served only row counts and the manual health report (0014,
// docs/C04-20261019.md).
export const catalogMeta=sqliteTable('catalog_meta',{key:text('key').primaryKey(),value:text('value').notNull()});
export const hotelNames=sqliteTable('hotel_names',{
 hotelId:text('hotel_id').notNull(),nameKey:text('name_key').notNull(),name:text('name').notNull(),
},table=>[primaryKey({columns:[table.hotelId,table.nameKey]})]);
export const crawlJobs=sqliteTable('crawl_jobs',{
 url:text('url').primaryKey(),provider:text('provider').notNull(),kind:text('kind').notNull(),prefecture:text('prefecture'),status:text('status').notNull(),attempts:integer('attempts').notNull(),nextAt:real('next_at').notNull(),error:text('error'),fetchedAt:text('fetched_at'),
 leaseToken:text('lease_token'),leaseUntil:real('lease_until').notNull().default(0),lastToken:text('last_token'),priority:integer('priority').notNull().default(90),
},table=>[index('idx_crawl_jobs_provider_lease').on(table.provider,table.leaseUntil),
 // Claim order of each lane (lib/crawl-queue.ts), so a claim reads the first
 // eligible job in index order instead of sorting every waiting job.
 index('idx_crawl_jobs_claim_priority').on(table.provider,table.kind,table.status,table.priority,sql`COALESCE(unixepoch(${table.fetchedAt}),0)`,table.attempts,table.url),
 index('idx_crawl_jobs_claim_national').on(table.provider,table.kind,table.status,sql`COALESCE(unixepoch(${table.fetchedAt}),0)`,table.nextAt,table.attempts,table.url)]);
export const priceQuotes=sqliteTable('price_quotes',{
 key:text('key').primaryKey(),payload:text('payload').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('idx_price_quotes_expiry').on(table.expiresAt)]);

export const hotelNameLocalizations=sqliteTable('hotel_name_localizations',{
 hotelId:text('hotel_id').primaryKey(),payload:text('payload'),checkedAt:text('checked_at').notNull(),
});

export const hotelDescriptionTranslations=sqliteTable('hotel_description_translations',{
 hotelId:text('hotel_id').primaryKey(),sourceText:text('source_text').notNull(),textKo:text('text_ko').notNull(),translatedAt:text('translated_at').notNull(),
});
export const hotelDescriptionRequests=sqliteTable('hotel_description_requests',{
 hotelId:text('hotel_id').primaryKey(),sourceText:text('source_text').notNull(),requestedAt:text('requested_at').notNull(),
},table=>[index('idx_description_requests_time').on(table.requestedAt)]);

// Only ordered IDs and search aggregates are held for a short browsing session.
export const hotelResultSessions=sqliteTable('hotel_result_sessions',{
 token:text('token').primaryKey(),queryKey:text('query_key').notNull(),
 ids:text('ids').notNull(),metadata:text('metadata').notNull(),
 createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('idx_result_sessions_expiry').on(table.expiresAt)]);

export const hotelLifecycle=sqliteTable('hotel_lifecycle',{
 hotelId:text('hotel_id').primaryKey(),firstSeenAt:text('first_seen_at').notNull(),lastSeenAt:text('last_seen_at').notNull(),lastDetailAt:text('last_detail_at'),
 missingCount:integer('missing_count').notNull().default(0),missingAt:text('missing_at'),state:text('state').notNull().default('unverified'),
 checkedAt:text('checked_at'),evidence:text('evidence'),
});
export const hotelLifecycleEvents=sqliteTable('hotel_lifecycle_events',{
 id:text('id').primaryKey(),hotelId:text('hotel_id').notNull(),checkedAt:text('checked_at').notNull(),payload:text('payload').notNull(),
},table=>[index('idx_lifecycle_events_hotel').on(table.hotelId,table.checkedAt)]);

// Verified identity links, not a merge of source observations or favorites.
// Google content is not stored here; only its reusable place ID is retained.
export const hotelSourceGroups=sqliteTable('hotel_source_groups',{
 hotelId:text('hotel_id').primaryKey(),
 tripHotelId:text('trip_hotel_id').unique(),jalanHotelId:text('jalan_hotel_id').unique(),googlePlaceId:text('google_place_id').unique(),
 payload:text('payload').notNull(),checkedAt:text('checked_at').notNull(),
});

// Provider observations linked to curated hotels stay out of the hotel list.
export const hotelSourceObservations=sqliteTable('hotel_source_observations',{
 id:text('id').primaryKey(),payload:text('payload').notNull(),observedAt:text('observed_at').notNull(),
});
