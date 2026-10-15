CREATE TABLE `case_create_requests` (
	`owner_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`case_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `key_hash`)
);
