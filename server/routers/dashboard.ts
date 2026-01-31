import { z } from "zod";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  trucks, 
  orders, 
  deliveryRuns, 
  deliveryRunOrders,
  personnel,
  skus,
  orderItems
} from "../../drizzle/schema";

export const dashboardRouter = router({
  // Get dashboard summary statistics
  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Count trucks by status
    const trucksResult = await db.select({
      total: sql<number>`COUNT(*)`,
      available: sql<number>`SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END)`,
      inTransit: sql<number>`SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END)`,
      maintenance: sql<number>`SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END)`,
    }).from(trucks);
    
    // Count orders by status
    const ordersResult = await db.select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      allocated: sql<number>`SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END)`,
      inTransit: sql<number>`SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END)`,
      delivered: sql<number>`SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)`,
      cancelled: sql<number>`SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`,
    }).from(orders);
    
    // Count delivery runs by status
    const runsResult = await db.select({
      total: sql<number>`COUNT(*)`,
      planned: sql<number>`SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)`,
      inProgress: sql<number>`SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    }).from(deliveryRuns);
    
    // Count personnel by status
    const personnelResult = await db.select({
      total: sql<number>`COUNT(*)`,
      available: sql<number>`SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END)`,
      assigned: sql<number>`SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END)`,
      drivers: sql<number>`SUM(CASE WHEN personnelType = 'driver' THEN 1 ELSE 0 END)`,
      helpers: sql<number>`SUM(CASE WHEN personnelType = 'helper' THEN 1 ELSE 0 END)`,
    }).from(personnel);
    
    // Count SKUs
    const skusResult = await db.select({
      total: sql<number>`COUNT(*)`,
    }).from(skus);
    
    // Orders by zone
    const ordersByZone = await db.select({
      zone: orders.deliveryZone,
      count: sql<number>`COUNT(*)`,
    }).from(orders).groupBy(orders.deliveryZone);
    
    return {
      trucks: trucksResult[0],
      orders: ordersResult[0],
      deliveryRuns: runsResult[0],
      personnel: personnelResult[0],
      skus: skusResult[0],
      ordersByZone,
    };
  }),

  // Get truck utilization stats
  truckUtilization: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db
      .select({
        truckId: trucks.id,
        truckName: trucks.truckName,
        width: trucks.width,
        depth: trucks.depth,
        height: trucks.height,
        maxWeight: trucks.maxWeight,
        status: trucks.status,
        totalRuns: sql<number>`(SELECT COUNT(*) FROM delivery_runs WHERE delivery_runs.truckId = ${trucks.id})`,
        completedRuns: sql<number>`(SELECT COUNT(*) FROM delivery_runs WHERE delivery_runs.truckId = ${trucks.id} AND delivery_runs.status = 'completed')`,
      })
      .from(trucks);
    
    return result.map(truck => ({
      ...truck,
      volume: Number(truck.width) * Number(truck.depth) * Number(truck.height),
      utilizationRate: truck.totalRuns > 0 ? (truck.completedRuns / truck.totalRuns) * 100 : 0,
    }));
  }),

  // Get delivery tracker data (active runs)
  deliveryTracker: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Get in-progress delivery runs
    const activeRuns = await db
      .select({
        id: deliveryRuns.id,
        runDate: deliveryRuns.runDate,
        truckId: deliveryRuns.truckId,
        truckName: trucks.truckName,
        status: deliveryRuns.status,
        actualStartTime: deliveryRuns.actualStartTime,
        totalOrders: sql<number>`(SELECT COUNT(*) FROM delivery_run_orders WHERE delivery_run_orders.deliveryRunId = ${deliveryRuns.id})`,
        deliveredOrders: sql<number>`(SELECT COUNT(*) FROM delivery_run_orders WHERE delivery_run_orders.deliveryRunId = ${deliveryRuns.id} AND delivery_run_orders.deliveredAt IS NOT NULL)`,
      })
      .from(deliveryRuns)
      .leftJoin(trucks, eq(deliveryRuns.truckId, trucks.id))
      .where(eq(deliveryRuns.status, "in_progress"));
    
    return activeRuns.map(run => ({
      ...run,
      progress: run.totalOrders > 0 ? (run.deliveredOrders / run.totalOrders) * 100 : 0,
    }));
  }),

  // Get recent activity
  recentActivity: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get recently delivered orders
      const recentDeliveries = await db
        .select({
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          deliveredAt: deliveryRunOrders.deliveredAt,
          zipcode: orders.zipcode,
          zone: orders.deliveryZone,
        })
        .from(deliveryRunOrders)
        .innerJoin(orders, eq(deliveryRunOrders.orderId, orders.id))
        .where(sql`${deliveryRunOrders.deliveredAt} IS NOT NULL`)
        .orderBy(sql`${deliveryRunOrders.deliveredAt} DESC`)
        .limit(input.limit);
      
      return recentDeliveries;
    }),

  // Get orders ready for optimization (pending orders with items)
  ordersForOptimization: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const pendingOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        zipcode: orders.zipcode,
        deliveryZone: orders.deliveryZone,
        latitude: orders.latitude,
        longitude: orders.longitude,
      })
      .from(orders)
      .where(eq(orders.status, "pending"));
    
    // Get items for each order
    const ordersWithItems = await Promise.all(
      pendingOrders.map(async (order) => {
        const items = await db
          .select({
            id: orderItems.id,
            skuId: orderItems.skuId,
            quantity: orderItems.quantity,
            skuName: skus.name,
            length: skus.length,
            width: skus.width,
            height: skus.height,
            weight: skus.weight,
            requiresTwoPeople: skus.requiresTwoPeople,
          })
          .from(orderItems)
          .innerJoin(skus, eq(orderItems.skuId, skus.id))
          .where(eq(orderItems.orderId, order.id));
        
        const totalWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0) * item.quantity, 0);
        const totalVolume = items.reduce((sum, item) => {
          const vol = (Number(item.length) || 0) * (Number(item.width) || 0) * (Number(item.height) || 0);
          return sum + vol * item.quantity;
        }, 0);
        const needsTwoPeople = items.some(item => item.requiresTwoPeople);
        
        return {
          ...order,
          items,
          totalWeight,
          totalVolume,
          needsTwoPeople,
        };
      })
    );
    
    return ordersWithItems;
  }),
});
