CREATE TABLE `catalog_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crawl_jobs` (
	`url` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`prefecture` text,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`next_at` real NOT NULL,
	`error` text,
	`fetched_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_crawl_jobs_ready` ON `crawl_jobs` (`status`,`next_at`);--> statement-breakpoint
CREATE TABLE `hotels` (
	`id` text PRIMARY KEY NOT NULL,
	`region` text NOT NULL,
	`prefecture` text,
	`name` text NOT NULL,
	`search_text` text NOT NULL,
	`kind` text NOT NULL,
	`trip_score` real,
	`trip_reviews` integer,
	`jalan_score` real,
	`jalan_reviews` integer,
	`natural` integer,
	`large_bath` integer,
	`outdoor` integer,
	`private_bath` integer,
	`room_onsen` integer,
	`room_outdoor` integer,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hotels_prefecture` ON `hotels` (`prefecture`);--> statement-breakpoint
CREATE INDEX `idx_hotels_region` ON `hotels` (`region`);--> statement-breakpoint
CREATE INDEX `idx_hotels_trip_score_reviews` ON `hotels` (`trip_score`,`trip_reviews`);--> statement-breakpoint
CREATE INDEX `idx_hotels_jalan_score_reviews` ON `hotels` (`jalan_score`,`jalan_reviews`);