CREATE TABLE `hotel_names` (
	`hotel_id` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`hotel_id`, `name_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_hotel_names_key` ON `hotel_names` (`name_key`,`hotel_id`);