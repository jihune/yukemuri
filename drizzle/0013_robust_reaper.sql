CREATE INDEX `idx_crawl_jobs_claim_priority` ON `crawl_jobs` (`provider`,`kind`,`status`,`priority`,COALESCE(unixepoch(`fetched_at`),0),`attempts`,`url`);--> statement-breakpoint
CREATE INDEX `idx_crawl_jobs_claim_national` ON `crawl_jobs` (`provider`,`kind`,`status`,COALESCE(unixepoch(`fetched_at`),0),`next_at`,`attempts`,`url`);
