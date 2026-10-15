ALTER TABLE `support_cases` ADD `internal_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `support_cases` ADD `assigned_to` text;--> statement-breakpoint
ALTER TABLE `support_cases` ADD `escalated_at` text;
