CREATE TABLE `hotel_description_requests` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`source_text` text NOT NULL,
	`requested_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_description_requests_time` ON `hotel_description_requests` (`requested_at`);--> statement-breakpoint
CREATE TABLE `hotel_description_translations` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`source_text` text NOT NULL,
	`text_ko` text NOT NULL,
	`translated_at` text NOT NULL
);
