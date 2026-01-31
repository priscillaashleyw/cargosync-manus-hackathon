import { relations } from "drizzle-orm";
import {
  users,
  trucks,
  skus,
  orders,
  orderItems,
  personnel,
  deliveryRuns,
  deliveryRunOrders,
  loadPlan,
  zipcodeZones,
} from "./schema";

// Order relations
export const ordersRelations = relations(orders, ({ many }) => ({
  orderItems: many(orderItems),
  deliveryRunOrders: many(deliveryRunOrders),
}));

// Order items relations
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  sku: one(skus, {
    fields: [orderItems.skuId],
    references: [skus.id],
  }),
}));

// SKU relations
export const skusRelations = relations(skus, ({ many }) => ({
  orderItems: many(orderItems),
}));

// Delivery run relations
export const deliveryRunsRelations = relations(deliveryRuns, ({ one, many }) => ({
  truck: one(trucks, {
    fields: [deliveryRuns.truckId],
    references: [trucks.id],
  }),
  driver: one(personnel, {
    fields: [deliveryRuns.driverId],
    references: [personnel.id],
    relationName: "driver",
  }),
  helper: one(personnel, {
    fields: [deliveryRuns.helperId],
    references: [personnel.id],
    relationName: "helper",
  }),
  deliveryRunOrders: many(deliveryRunOrders),
  loadPlanItems: many(loadPlan),
}));

// Delivery run orders relations
export const deliveryRunOrdersRelations = relations(deliveryRunOrders, ({ one }) => ({
  deliveryRun: one(deliveryRuns, {
    fields: [deliveryRunOrders.deliveryRunId],
    references: [deliveryRuns.id],
  }),
  order: one(orders, {
    fields: [deliveryRunOrders.orderId],
    references: [orders.id],
  }),
}));

// Load plan relations
export const loadPlanRelations = relations(loadPlan, ({ one }) => ({
  deliveryRun: one(deliveryRuns, {
    fields: [loadPlan.deliveryRunId],
    references: [deliveryRuns.id],
  }),
  orderItem: one(orderItems, {
    fields: [loadPlan.orderItemId],
    references: [orderItems.id],
  }),
}));

// Truck relations
export const trucksRelations = relations(trucks, ({ many }) => ({
  deliveryRuns: many(deliveryRuns),
}));

// Personnel relations
export const personnelRelations = relations(personnel, ({ many }) => ({
  driverRuns: many(deliveryRuns, { relationName: "driver" }),
  helperRuns: many(deliveryRuns, { relationName: "helper" }),
}));
