CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`key_name` text NOT NULL,
	`secret` text NOT NULL,
	`immich_key_id` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_user_id_purpose_unique` ON `api_keys` (`user_id`,`purpose`);