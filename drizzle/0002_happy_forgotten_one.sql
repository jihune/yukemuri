CREATE TABLE `price_quotes` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_price_quotes_expiry` ON `price_quotes` (`expires_at`);