ALTER TABLE `delivery_runs` ADD `helper2Id` int;--> statement-breakpoint
ALTER TABLE `delivery_runs` ADD `currentLatitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `delivery_runs` ADD `currentLongitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `delivery_runs` ADD `currentStopIndex` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `load_plan` ADD `placement` enum('front','middle','back') DEFAULT 'middle';--> statement-breakpoint
ALTER TABLE `orders` ADD `helpersRequired` enum('none','one','two') DEFAULT 'none' NOT NULL;