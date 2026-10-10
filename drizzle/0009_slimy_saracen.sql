CREATE TABLE `hotel_result_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`query_key` text NOT NULL,
	`ids` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_result_sessions_expiry` ON `hotel_result_sessions` (`expires_at`);