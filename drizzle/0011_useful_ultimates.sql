CREATE TABLE `hotel_source_groups` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`trip_hotel_id` text,
	`jalan_hotel_id` text,
	`google_place_id` text,
	`payload` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_source_groups_trip_hotel_id_unique` ON `hotel_source_groups` (`trip_hotel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_source_groups_jalan_hotel_id_unique` ON `hotel_source_groups` (`jalan_hotel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_source_groups_google_place_id_unique` ON `hotel_source_groups` (`google_place_id`);