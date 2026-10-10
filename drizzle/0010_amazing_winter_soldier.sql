CREATE TABLE `hotel_lifecycle` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_detail_at` text,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`missing_at` text,
	`state` text DEFAULT 'unverified' NOT NULL,
	`checked_at` text,
	`evidence` text
);
--> statement-breakpoint
CREATE INDEX `idx_lifecycle_review` ON `hotel_lifecycle` (`state`,`missing_count`);--> statement-breakpoint
CREATE TABLE `hotel_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`checked_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lifecycle_events_hotel` ON `hotel_lifecycle_events` (`hotel_id`,`checked_at`);--> statement-breakpoint
ALTER TABLE `crawl_jobs` ADD `priority` integer DEFAULT 90 NOT NULL;