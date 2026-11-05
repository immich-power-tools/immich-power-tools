PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflow_processed_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`run_id` text NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_workflow_processed_assets`("id", "workflow_id", "asset_id", "run_id", "processed_at") SELECT "id", "workflow_id", "asset_id", "run_id", "processed_at" FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "workflow_id", "asset_id" ORDER BY "processed_at" DESC, "id" DESC) AS rn FROM `workflow_processed_assets` WHERE "workflow_id" IN (SELECT "id" FROM `workflows`)) WHERE rn = 1;--> statement-breakpoint
DROP TABLE `workflow_processed_assets`;--> statement-breakpoint
ALTER TABLE `__new_workflow_processed_assets` RENAME TO `workflow_processed_assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_processed_assets_workflow_id_asset_id_unique` ON `workflow_processed_assets` (`workflow_id`,`asset_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
