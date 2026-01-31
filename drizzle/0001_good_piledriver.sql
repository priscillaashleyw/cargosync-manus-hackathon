CREATE TABLE `delivery_run_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryRunId` int NOT NULL,
	`orderId` int NOT NULL,
	`sequence` int NOT NULL,
	`estimatedArrival` timestamp,
	`actualArrival` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_run_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runDate` date NOT NULL,
	`truckId` int NOT NULL,
	`driverId` int,
	`helperId` int,
	`status` enum('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
	`totalWeight` decimal(10,2),
	`totalVolume` decimal(10,2),
	`estimatedDuration` int,
	`actualStartTime` timestamp,
	`actualEndTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `load_plan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryRunId` int NOT NULL,
	`orderItemId` int NOT NULL,
	`positionX` decimal(10,2) NOT NULL,
	`positionY` decimal(10,2) NOT NULL,
	`positionZ` decimal(10,2) NOT NULL,
	`rotation` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `load_plan_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`skuId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(100) NOT NULL,
	`zipcode` varchar(20) NOT NULL,
	`deliveryZone` enum('North','South','East','West','Central'),
	`address` text,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`status` enum('pending','allocated','in_transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `personnel` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` varchar(100) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`personnelType` enum('driver','helper') NOT NULL DEFAULT 'driver',
	`status` enum('available','assigned','off_duty') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personnel_id` PRIMARY KEY(`id`),
	CONSTRAINT `personnel_employeeId_unique` UNIQUE(`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuCode` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`length` decimal(10,2),
	`width` decimal(10,2),
	`height` decimal(10,2),
	`weight` decimal(10,2),
	`requiresTwoPeople` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `skus_skuCode_unique` UNIQUE(`skuCode`)
);
--> statement-breakpoint
CREATE TABLE `trucks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`truckName` varchar(100) NOT NULL,
	`width` decimal(10,2) NOT NULL,
	`depth` decimal(10,2) NOT NULL,
	`height` decimal(10,2) NOT NULL,
	`maxWeight` decimal(10,2) DEFAULT '1000',
	`status` enum('available','in_transit','maintenance') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trucks_id` PRIMARY KEY(`id`),
	CONSTRAINT `trucks_truckName_unique` UNIQUE(`truckName`)
);
--> statement-breakpoint
CREATE TABLE `zipcode_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`zipcode` varchar(20) NOT NULL,
	`zone` enum('North','South','East','West','Central') NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zipcode_zones_id` PRIMARY KEY(`id`),
	CONSTRAINT `zipcode_zones_zipcode_unique` UNIQUE(`zipcode`)
);
