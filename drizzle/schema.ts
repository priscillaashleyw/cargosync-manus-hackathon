import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, date } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Trucks table - stores fleet information
 */
export const trucks = mysqlTable("trucks", {
  id: int("id").autoincrement().primaryKey(),
  truckName: varchar("truckName", { length: 100 }).notNull().unique(),
  width: decimal("width", { precision: 10, scale: 2 }).notNull(), // cm
  depth: decimal("depth", { precision: 10, scale: 2 }).notNull(), // cm
  height: decimal("height", { precision: 10, scale: 2 }).notNull(), // cm
  maxWeight: decimal("maxWeight", { precision: 10, scale: 2 }).default("1000"), // kg
  status: mysqlEnum("status", ["available", "on_route", "in_transit", "maintenance"]).default("available").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Truck = typeof trucks.$inferSelect;
export type InsertTruck = typeof trucks.$inferInsert;

/**
 * SKUs table - master list of products/items
 */
export const skus = mysqlTable("skus", {
  id: int("id").autoincrement().primaryKey(),
  skuCode: varchar("skuCode", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  length: decimal("length", { precision: 10, scale: 2 }), // cm
  width: decimal("width", { precision: 10, scale: 2 }), // cm
  height: decimal("height", { precision: 10, scale: 2 }), // cm
  weight: decimal("weight", { precision: 10, scale: 2 }), // kg
  requiresTwoPeople: boolean("requiresTwoPeople").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sku = typeof skus.$inferSelect;
export type InsertSku = typeof skus.$inferInsert;

/**
 * Orders table - customer delivery orders
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 100 }).notNull().unique(),
  zipcode: varchar("zipcode", { length: 20 }).notNull(),
  deliveryZone: mysqlEnum("deliveryZone", ["North", "South", "East", "West", "Central"]),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  helpersRequired: mysqlEnum("helpersRequired", ["none", "one", "two"]).default("none").notNull(),
  status: mysqlEnum("status", ["pending", "allocated", "in_transit", "delivered", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Order items table - links orders to SKUs
 */
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  skuId: int("skuId").notNull(),
  quantity: int("quantity").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * Personnel table - drivers and helpers
 */
export const personnel = mysqlTable("personnel", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: varchar("employeeId", { length: 100 }).notNull().unique(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  personnelType: mysqlEnum("personnelType", ["driver", "helper"]).default("driver").notNull(),
  status: mysqlEnum("status", ["available", "assigned", "on_route", "off_duty"]).default("available").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Personnel = typeof personnel.$inferSelect;
export type InsertPersonnel = typeof personnel.$inferInsert;

/**
 * Delivery runs table - planned delivery trips
 */
export const deliveryRuns = mysqlTable("delivery_runs", {
  id: int("id").autoincrement().primaryKey(),
  runDate: date("runDate").notNull(),
  truckId: int("truckId").notNull(),
  driverId: int("driverId"),
  helperId: int("helperId"),
  helper2Id: int("helper2Id"), // Second helper for heavy loads
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned").notNull(),
  totalWeight: decimal("totalWeight", { precision: 10, scale: 2 }),
  totalVolume: decimal("totalVolume", { precision: 10, scale: 2 }),
  estimatedDuration: int("estimatedDuration"), // minutes
  actualStartTime: timestamp("actualStartTime"),
  actualEndTime: timestamp("actualEndTime"),
  currentLatitude: decimal("currentLatitude", { precision: 10, scale: 7 }), // For live tracking
  currentLongitude: decimal("currentLongitude", { precision: 10, scale: 7 }), // For live tracking
  currentStopIndex: int("currentStopIndex").default(0), // Current stop in route
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeliveryRun = typeof deliveryRuns.$inferSelect;
export type InsertDeliveryRun = typeof deliveryRuns.$inferInsert;

/**
 * Delivery run orders table - links orders to delivery runs with sequence
 */
export const deliveryRunOrders = mysqlTable("delivery_run_orders", {
  id: int("id").autoincrement().primaryKey(),
  deliveryRunId: int("deliveryRunId").notNull(),
  orderId: int("orderId").notNull(),
  sequence: int("sequence").notNull(),
  estimatedArrival: timestamp("estimatedArrival"),
  actualArrival: timestamp("actualArrival"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeliveryRunOrder = typeof deliveryRunOrders.$inferSelect;
export type InsertDeliveryRunOrder = typeof deliveryRunOrders.$inferInsert;

/**
 * Load plan table - 3D positions of items in truck
 */
export const loadPlan = mysqlTable("load_plan", {
  id: int("id").autoincrement().primaryKey(),
  deliveryRunId: int("deliveryRunId").notNull(),
  orderItemId: int("orderItemId").notNull(),
  positionX: decimal("positionX", { precision: 10, scale: 2 }).notNull(), // cm
  positionY: decimal("positionY", { precision: 10, scale: 2 }).notNull(), // cm
  positionZ: decimal("positionZ", { precision: 10, scale: 2 }).notNull(), // cm
  rotatedLength: decimal("rotatedLength", { precision: 10, scale: 2 }), // cm - actual length after rotation
  rotatedWidth: decimal("rotatedWidth", { precision: 10, scale: 2 }), // cm - actual width after rotation
  height: decimal("height", { precision: 10, scale: 2 }), // cm - item height
  weight: decimal("weight", { precision: 10, scale: 2 }), // kg - item weight
  rotation: int("rotation").default(0), // 0, 90, 180, 270 degrees
  placement: mysqlEnum("placement", ["front", "middle", "back"]).default("middle"), // Front/Middle/Back placement
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoadPlanItem = typeof loadPlan.$inferSelect;
export type InsertLoadPlanItem = typeof loadPlan.$inferInsert;

/**
 * Zipcode zones table - maps zipcodes to delivery zones
 */
export const zipcodeZones = mysqlTable("zipcode_zones", {
  id: int("id").autoincrement().primaryKey(),
  zipcode: varchar("zipcode", { length: 20 }).notNull().unique(),
  zone: mysqlEnum("zone", ["North", "South", "East", "West", "Central"]).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ZipcodeZone = typeof zipcodeZones.$inferSelect;
export type InsertZipcodeZone = typeof zipcodeZones.$inferInsert;
