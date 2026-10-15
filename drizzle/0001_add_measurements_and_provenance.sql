ALTER TABLE `support_cases` ADD `measurements` text;--> statement-breakpoint
ALTER TABLE `support_cases` ADD `rule_version` text DEFAULT '1.0.0' NOT NULL;