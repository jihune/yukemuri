ALTER TABLE `crawl_jobs` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `crawl_jobs` ADD `lease_until` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crawl_jobs` ADD `last_token` text;--> statement-breakpoint
CREATE INDEX `idx_crawl_jobs_provider_ready` ON `crawl_jobs` (`provider`,`kind`,`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `idx_crawl_jobs_provider_lease` ON `crawl_jobs` (`provider`,`lease_until`);