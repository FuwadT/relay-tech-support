CREATE TABLE `support_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`device_name` text NOT NULL,
	`category` text NOT NULL,
	`os` text NOT NULL,
	`ownership` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`answers` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`consent` integer NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`verified_at` text
);
--> statement-breakpoint
CREATE INDEX `support_cases_owner_updated` ON `support_cases` (`user_id`,`updated_at`);