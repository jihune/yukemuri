CREATE TABLE `hotel_search_results` (
	`key` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_search_results_created` ON `hotel_search_results` (`created_at`);