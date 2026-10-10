CREATE TABLE `visitor_favorites` (
	`visitor_key` text NOT NULL,
	`hotel_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`visitor_key`, `hotel_id`)
);
