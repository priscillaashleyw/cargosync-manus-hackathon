import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { orders, orderItems, skus, InsertOrder, InsertOrderItem } from "../../drizzle/schema";

const orderSchema = z.object({
  orderNumber: z.string().min(1),
  zipcode: z.string().min(1),
  deliveryZone: z.enum(["North", "South", "East", "West", "Central"]).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  helpersRequired: z.enum(["none", "one", "two"]).optional().default("none"),
  status: z.enum(["pending", "allocated", "in_transit", "delivered", "cancelled"]).optional().default("pending"),
});

const orderItemSchema = z.object({
  skuId: z.number(),
  quantity: z.number().positive().default(1),
});

export const ordersRouter = router({
  // List all orders with item count
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      zipcode: orders.zipcode,
      deliveryZone: orders.deliveryZone,
      helpersRequired: orders.helpersRequired,
      status: orders.status,
      createdAt: orders.createdAt,
      itemCount: sql<number>`(SELECT COUNT(*) FROM order_items WHERE order_items.orderId = ${orders.id})`,
    }).from(orders);
    
    return result;
  }),

  // Get single order with items
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const orderResult = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!orderResult[0]) return null;
      
      const itemsResult = await db
        .select({
          id: orderItems.id,
          skuId: orderItems.skuId,
          quantity: orderItems.quantity,
          skuCode: skus.skuCode,
          skuName: skus.name,
          length: skus.length,
          width: skus.width,
          height: skus.height,
          weight: skus.weight,
          requiresTwoPeople: skus.requiresTwoPeople,
        })
        .from(orderItems)
        .innerJoin(skus, eq(orderItems.skuId, skus.id))
        .where(eq(orderItems.orderId, input.id));
      
      return {
        ...orderResult[0],
        items: itemsResult,
      };
    }),

  // Create new order
  create: protectedProcedure
    .input(z.object({
      order: orderSchema,
      items: z.array(orderItemSchema).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const insertData: InsertOrder = {
        orderNumber: input.order.orderNumber,
        zipcode: input.order.zipcode,
        deliveryZone: input.order.deliveryZone,
        latitude: input.order.latitude !== undefined ? String(input.order.latitude) : null,
        longitude: input.order.longitude !== undefined ? String(input.order.longitude) : null,
        helpersRequired: input.order.helpersRequired,
        status: input.order.status,
      };
      
      const result = await db.insert(orders).values(insertData);
      const orderId = Number(result[0].insertId);
      
      // Add items if provided
      if (input.items && input.items.length > 0) {
        const itemsData: InsertOrderItem[] = input.items.map(item => ({
          orderId,
          skuId: item.skuId,
          quantity: item.quantity,
        }));
        await db.insert(orderItems).values(itemsData);
      }
      
      return { success: true, orderId };
    }),

  // Update order
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: orderSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const updateData: Partial<InsertOrder> = {};
      if (input.data.orderNumber) updateData.orderNumber = input.data.orderNumber;
      if (input.data.zipcode) updateData.zipcode = input.data.zipcode;
      if (input.data.deliveryZone) updateData.deliveryZone = input.data.deliveryZone;
      if (input.data.latitude !== undefined) updateData.latitude = String(input.data.latitude);
      if (input.data.longitude !== undefined) updateData.longitude = String(input.data.longitude);
      if (input.data.helpersRequired) updateData.helpersRequired = input.data.helpersRequired;
      if (input.data.status) updateData.status = input.data.status;
      
      await db.update(orders).set(updateData).where(eq(orders.id, input.id));
      return { success: true };
    }),

  // Delete order
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Delete order items first
      await db.delete(orderItems).where(eq(orderItems.orderId, input.id));
      // Then delete order
      await db.delete(orders).where(eq(orders.id, input.id));
      return { success: true };
    }),

  // Update order status
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "allocated", "in_transit", "delivered", "cancelled"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(orders).set({ status: input.status }).where(eq(orders.id, input.id));
      return { success: true };
    }),

  // Add item to order
  addItem: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      item: orderItemSchema,
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.insert(orderItems).values({
        orderId: input.orderId,
        skuId: input.item.skuId,
        quantity: input.item.quantity,
      });
      return { success: true };
    }),

  // Remove item from order
  removeItem: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.delete(orderItems).where(eq(orderItems.id, input.itemId));
      return { success: true };
    }),

  // Get orders by zone
  byZone: protectedProcedure
    .input(z.object({ zone: z.enum(["North", "South", "East", "West", "Central"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.select().from(orders).where(eq(orders.deliveryZone, input.zone));
      return result;
    }),

  // Get pending orders (for optimization)
  pending: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(orders).where(eq(orders.status, "pending"));
    return result;
  }),
});
