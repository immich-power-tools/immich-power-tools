CREATE TABLE `job_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`queue_name` text NOT NULL,
	`force` integer DEFAULT false NOT NULL,
	`cron_schedule` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`last_status` text,
	`last_error` text,
	`created_at` integer,
	`updated_at` integer
);
