import { z } from "zod";
import { eq, sql, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  deliveryRuns, 
  deliveryRunOrders, 
  loadPlan, 
  orders, 
  orderItems,
  skus,
  trucks,
  personnel,
  InsertDeliveryRun,
  InsertDeliveryRunOrder,
  InsertLoadPlanItem
} from "../../drizzle/schema";

const deliveryRunSchema = z.object({
  runDate: z.string(), // ISO date string
  truckId: z.number(),
  driverId: z.number().optional(),
  helperId: z.number().optional(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional().default("planned"),
});

export const deliveryRunsRouter = router({
  // List all delivery runs
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db
      .select({
        id: deliveryRuns.id,
        runDate: deliveryRuns.runDate,
        truckId: deliveryRuns.truckId,
        truckName: trucks.truckName,
        driverId: deliveryRuns.driverId,
        helperId: deliveryRuns.helperId,
        status: deliveryRuns.status,
        totalWeight: deliveryRuns.totalWeight,
        totalVolume: deliveryRuns.totalVolume,
        estimatedDuration: deliveryRuns.estimatedDuration,
        createdAt: deliveryRuns.createdAt,
        orderCount: sql<number>`(SELECT COUNT(*) FROM delivery_run_orders WHERE delivery_run_orders.deliveryRunId = ${deliveryRuns.id})`,
      })
      .from(deliveryRuns)
      .leftJoin(trucks, eq(deliveryRuns.truckId, trucks.id));
    
    return result;
  }),

  // Get single delivery run by ID (alias for get)
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get delivery run
      const runResult = await db
        .select({
          id: deliveryRuns.id,
          runDate: deliveryRuns.runDate,
          status: deliveryRuns.status,
          totalWeight: deliveryRuns.totalWeight,
          totalVolume: deliveryRuns.totalVolume,
        })
        .from(deliveryRuns)
        .where(eq(deliveryRuns.id, input.id))
        .limit(1);
      
      if (!runResult[0]) return null;
      
      // Get truck info
      const truckResult = await db
        .select()
        .from(trucks)
        .where(eq(trucks.id, sql`(SELECT truckId FROM delivery_runs WHERE id = ${input.id})`))
        .limit(1);
      
      // Get driver info
      const driverResult = await db
        .select()
        .from(personnel)
        .where(eq(personnel.id, sql`(SELECT driverId FROM delivery_runs WHERE id = ${input.id})`))
        .limit(1);
      
      // Get helper info
      const helperResult = await db
        .select()
        .from(personnel)
        .where(eq(personnel.id, sql`(SELECT helperId FROM delivery_runs WHERE id = ${input.id})`))
        .limit(1);
      
      // Get assigned orders with item counts
      const ordersResult = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          zipcode: orders.zipcode,
          deliveryZone: orders.deliveryZone,
          address: orders.address,
          status: orders.status,
          sequence: deliveryRunOrders.sequence,
          itemCount: sql<number>`(SELECT COUNT(*) FROM order_items WHERE order_items.orderId = ${orders.id})`,
        })
        .from(deliveryRunOrders)
        .innerJoin(orders, eq(deliveryRunOrders.orderId, orders.id))
        .where(eq(deliveryRunOrders.deliveryRunId, input.id))
        .orderBy(deliveryRunOrders.sequence);
      
      // Get load plan with SKU details
      const loadPlanResult = await db
        .select({
          id: loadPlan.id,
          orderItemId: loadPlan.orderItemId,
          positionX: loadPlan.positionX,
          positionY: loadPlan.positionY,
          positionZ: loadPlan.positionZ,
          rotatedLength: loadPlan.rotatedLength,
          rotatedWidth: loadPlan.rotatedWidth,
          height: loadPlan.height,
          weight: loadPlan.weight,
          rotation: loadPlan.rotation,
          skuName: skus.name,
          orderId: orderItems.orderId,
        })
        .from(loadPlan)
        .innerJoin(orderItems, eq(loadPlan.orderItemId, orderItems.id))
        .innerJoin(skus, eq(orderItems.skuId, skus.id))
        .where(eq(loadPlan.deliveryRunId, input.id));
      
      return {
        ...runResult[0],
        truck: truckResult[0] || null,
        driver: driverResult[0] || null,
        helper: helperResult[0] || null,
        orders: ordersResult,
        loadPlan: loadPlanResult,
      };
    }),

  // Get single delivery run with full details
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get delivery run
      const runResult = await db
        .select({
          id: deliveryRuns.id,
          runDate: deliveryRuns.runDate,
          truckId: deliveryRuns.truckId,
          truckName: trucks.truckName,
          truckWidth: trucks.width,
          truckDepth: trucks.depth,
          truckHeight: trucks.height,
          driverId: deliveryRuns.driverId,
          helperId: deliveryRuns.helperId,
          status: deliveryRuns.status,
          totalWeight: deliveryRuns.totalWeight,
          totalVolume: deliveryRuns.totalVolume,
          estimatedDuration: deliveryRuns.estimatedDuration,
          actualStartTime: deliveryRuns.actualStartTime,
          actualEndTime: deliveryRuns.actualEndTime,
        })
        .from(deliveryRuns)
        .leftJoin(trucks, eq(deliveryRuns.truckId, trucks.id))
        .where(eq(deliveryRuns.id, input.id))
        .limit(1);
      
      if (!runResult[0]) return null;
      
      // Get assigned orders
      const ordersResult = await db
        .select({
          id: deliveryRunOrders.id,
          orderId: deliveryRunOrders.orderId,
          sequence: deliveryRunOrders.sequence,
          estimatedArrival: deliveryRunOrders.estimatedArrival,
          actualArrival: deliveryRunOrders.actualArrival,
          deliveredAt: deliveryRunOrders.deliveredAt,
          orderNumber: orders.orderNumber,
          zipcode: orders.zipcode,
          deliveryZone: orders.deliveryZone,
          address: orders.address,
          orderStatus: orders.status,
        })
        .from(deliveryRunOrders)
        .innerJoin(orders, eq(deliveryRunOrders.orderId, orders.id))
        .where(eq(deliveryRunOrders.deliveryRunId, input.id))
        .orderBy(deliveryRunOrders.sequence);
      
      // Get load plan (3D positions)
      const loadPlanResult = await db
        .select({
          id: loadPlan.id,
          orderItemId: loadPlan.orderItemId,
          positionX: loadPlan.positionX,
          positionY: loadPlan.positionY,
          positionZ: loadPlan.positionZ,
          rotation: loadPlan.rotation,
          skuName: skus.name,
          skuLength: skus.length,
          skuWidth: skus.width,
          skuHeight: skus.height,
          skuWeight: skus.weight,
          orderId: orderItems.orderId,
        })
        .from(loadPlan)
        .innerJoin(orderItems, eq(loadPlan.orderItemId, orderItems.id))
        .innerJoin(skus, eq(orderItems.skuId, skus.id))
        .where(eq(loadPlan.deliveryRunId, input.id));
      
      // Get driver and helper info
      let driverInfo = null;
      let helperInfo = null;
      
      if (runResult[0].driverId) {
        const driverResult = await db.select().from(personnel).where(eq(personnel.id, runResult[0].driverId)).limit(1);
        driverInfo = driverResult[0] || null;
      }
      
      if (runResult[0].helperId) {
        const helperResult = await db.select().from(personnel).where(eq(personnel.id, runResult[0].helperId)).limit(1);
        helperInfo = helperResult[0] || null;
      }
      
      return {
        ...runResult[0],
        driver: driverInfo,
        helper: helperInfo,
        orders: ordersResult,
        loadPlan: loadPlanResult,
      };
    }),

  // Create new delivery run
  create: protectedProcedure
    .input(z.object({
      run: deliveryRunSchema,
      orderIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const insertData: InsertDeliveryRun = {
        runDate: new Date(input.run.runDate),
        truckId: input.run.truckId,
        driverId: input.run.driverId,
        helperId: input.run.helperId,
        status: input.run.status,
      };
      
      const result = await db.insert(deliveryRuns).values(insertData);
      const runId = Number(result[0].insertId);
      
      // Add orders if provided
      if (input.orderIds && input.orderIds.length > 0) {
        const runOrdersData: InsertDeliveryRunOrder[] = input.orderIds.map((orderId, index) => ({
          deliveryRunId: runId,
          orderId,
          sequence: index + 1,
        }));
        await db.insert(deliveryRunOrders).values(runOrdersData);
        
        // Update order statuses to allocated
        for (const orderId of input.orderIds) {
          await db.update(orders).set({ status: "allocated" }).where(eq(orders.id, orderId));
        }
      }
      
      return { success: true, runId };
    }),

  // Update delivery run
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: deliveryRunSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const updateData: Partial<InsertDeliveryRun> = {};
      if (input.data.runDate) updateData.runDate = new Date(input.data.runDate);
      if (input.data.truckId) updateData.truckId = input.data.truckId;
      if (input.data.driverId !== undefined) updateData.driverId = input.data.driverId;
      if (input.data.helperId !== undefined) updateData.helperId = input.data.helperId;
      if (input.data.status) updateData.status = input.data.status;
      
      await db.update(deliveryRuns).set(updateData).where(eq(deliveryRuns.id, input.id));
      return { success: true };
    }),

  // Delete delivery run
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get order IDs to reset their status
      const runOrders = await db.select({ orderId: deliveryRunOrders.orderId })
        .from(deliveryRunOrders)
        .where(eq(deliveryRunOrders.deliveryRunId, input.id));
      
      // Delete load plan
      await db.delete(loadPlan).where(eq(loadPlan.deliveryRunId, input.id));
      // Delete run orders
      await db.delete(deliveryRunOrders).where(eq(deliveryRunOrders.deliveryRunId, input.id));
      // Delete run
      await db.delete(deliveryRuns).where(eq(deliveryRuns.id, input.id));
      
      // Reset order statuses to pending
      for (const { orderId } of runOrders) {
        await db.update(orders).set({ status: "pending" }).where(eq(orders.id, orderId));
      }
      
      return { success: true };
    }),

  // Add order to delivery run
  addOrder: protectedProcedure
    .input(z.object({
      runId: z.number(),
      orderId: z.number(),
      sequence: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get current max sequence
      const maxSeq = await db
        .select({ max: sql<number>`MAX(sequence)` })
        .from(deliveryRunOrders)
        .where(eq(deliveryRunOrders.deliveryRunId, input.runId));
      
      const sequence = input.sequence || (maxSeq[0]?.max || 0) + 1;
      
      await db.insert(deliveryRunOrders).values({
        deliveryRunId: input.runId,
        orderId: input.orderId,
        sequence,
      });
      
      // Update order status
      await db.update(orders).set({ status: "allocated" }).where(eq(orders.id, input.orderId));
      
      return { success: true };
    }),

  // Remove order from delivery run
  removeOrder: protectedProcedure
    .input(z.object({
      runId: z.number(),
      orderId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.delete(deliveryRunOrders).where(
        and(
          eq(deliveryRunOrders.deliveryRunId, input.runId),
          eq(deliveryRunOrders.orderId, input.orderId)
        )
      );
      
      // Reset order status
      await db.update(orders).set({ status: "pending" }).where(eq(orders.id, input.orderId));
      
      return { success: true };
    }),

  // Update order sequence in delivery run
  updateOrderSequence: protectedProcedure
    .input(z.object({
      runId: z.number(),
      orderSequences: z.array(z.object({
        orderId: z.number(),
        sequence: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      for (const { orderId, sequence } of input.orderSequences) {
        await db.update(deliveryRunOrders)
          .set({ sequence })
          .where(
            and(
              eq(deliveryRunOrders.deliveryRunId, input.runId),
              eq(deliveryRunOrders.orderId, orderId)
            )
          );
      }
      
      return { success: true };
    }),

  // Mark order as delivered
  markDelivered: protectedProcedure
    .input(z.object({
      runId: z.number(),
      orderId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const now = new Date();
      
      await db.update(deliveryRunOrders)
        .set({ deliveredAt: now, actualArrival: now })
        .where(
          and(
            eq(deliveryRunOrders.deliveryRunId, input.runId),
            eq(deliveryRunOrders.orderId, input.orderId)
          )
        );
      
      await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, input.orderId));
      
      return { success: true };
    }),

  // Start delivery run
  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get run details
      const run = await db.select()
        .from(deliveryRuns)
        .where(eq(deliveryRuns.id, input.id))
        .limit(1);
      
      if (!run[0]) throw new Error("Delivery run not found");
      
      await db.update(deliveryRuns)
        .set({ status: "in_progress", actualStartTime: new Date(), currentStopIndex: 1 })
        .where(eq(deliveryRuns.id, input.id));
      
      // Update truck status to on_route
      await db.update(trucks).set({ status: "on_route" }).where(eq(trucks.id, run[0].truckId));
      
      // Update personnel status to on_route
      if (run[0].driverId) {
        await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, run[0].driverId));
      }
      if (run[0].helperId) {
        await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, run[0].helperId));
      }
      if (run[0].helper2Id) {
        await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, run[0].helper2Id));
      }
      
      // Update all orders to in_transit
      const runOrders = await db.select({ orderId: deliveryRunOrders.orderId })
        .from(deliveryRunOrders)
        .where(eq(deliveryRunOrders.deliveryRunId, input.id));
      
      for (const { orderId } of runOrders) {
        await db.update(orders).set({ status: "in_transit" }).where(eq(orders.id, orderId));
      }
      
      return { success: true };
    }),

  // Complete delivery run
  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get run details
      const run = await db.select()
        .from(deliveryRuns)
        .where(eq(deliveryRuns.id, input.id))
        .limit(1);
      
      if (!run[0]) throw new Error("Delivery run not found");
      
      await db.update(deliveryRuns)
        .set({ status: "completed", actualEndTime: new Date() })
        .where(eq(deliveryRuns.id, input.id));
      
      // Update truck status to available
      await db.update(trucks).set({ status: "available" }).where(eq(trucks.id, run[0].truckId));
      
      // Update personnel status to available
      if (run[0].driverId) {
        await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].driverId));
      }
      if (run[0].helperId) {
        await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].helperId));
      }
      if (run[0].helper2Id) {
        await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].helper2Id));
      }
      
      return { success: true };
    }),

  // Save load plan (3D positions)
  saveLoadPlan: protectedProcedure
    .input(z.object({
      runId: z.number(),
      items: z.array(z.object({
        orderItemId: z.number(),
        positionX: z.number(),
        positionY: z.number(),
        positionZ: z.number(),
        rotation: z.number().optional().default(0),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Clear existing load plan
      await db.delete(loadPlan).where(eq(loadPlan.deliveryRunId, input.runId));
      
      // Insert new load plan
      if (input.items.length > 0) {
        const loadPlanData: InsertLoadPlanItem[] = input.items.map(item => ({
          deliveryRunId: input.runId,
          orderItemId: item.orderItemId,
          positionX: String(item.positionX),
          positionY: String(item.positionY),
          positionZ: String(item.positionZ),
          rotation: item.rotation,
        }));
        await db.insert(loadPlan).values(loadPlanData);
      }
      
      return { success: true };
    }),
});
