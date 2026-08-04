CREATE TABLE `leaderboard_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`camel_count` integer NOT NULL,
	`sortable_score` integer NOT NULL,
	`photo_key` text NOT NULL,
	`consented_at` text NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_score_submitted` ON `leaderboard_entries` (`sortable_score`,`submitted_at`);