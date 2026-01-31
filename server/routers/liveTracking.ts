import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  deliveryRuns, 
  deliveryRunOrders, 
  orders, 
  trucks,
  personnel
} from "../../drizzle/schema";
import { DEPOT } from "../../shared/logistics";

interface TrackingData {
  runId: number;
  truckName: string;
  driverName: string | null;
  status: string;
  currentLatitude: number;
  currentLongitude: number;
  currentStopIndex: number;
  totalStops: number;
  progress: number;
  route: {
    orderId: number;
    orderNumber: string;
    sequence: number;
    latitude: number;
    longitude: number;
    address: string;
    status: "pending" | "current" | "delivered";
  }[];
}

export const liveTrackingRouter = router({
  // Get all active delivery runs with current positions
  getActiveRuns: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Get in-progress runs
    const activeRuns = await db
      .select({
        id: deliveryRuns.id,
        truckId: deliveryRuns.truckId,
        driverId: deliveryRuns.driverId,
        status: deliveryRuns.status,
        currentLatitude: deliveryRuns.currentLatitude,
        currentLongitude: deliveryRuns.currentLongitude,
        currentStopIndex: deliveryRuns.currentStopIndex,
        truckName: trucks.truckName,
      })
      .from(deliveryRuns)
      .leftJoin(trucks, eq(deliveryRuns.truckId, trucks.id))
      .where(eq(deliveryRuns.status, "in_progress"));
    
    const trackingData: TrackingData[] = [];
    
    for (const run of activeRuns) {
      // Get driver name
      let driverName: string | null = null;
      if (run.driverId) {
        const driver = await db
          .select({ fullName: personnel.fullName })
          .from(personnel)
          .where(eq(personnel.id, run.driverId))
          .limit(1);
        driverName = driver[0]?.fullName || null;
      }
      
      // Get route stops
      const stops = await db
        .select({
          orderId: deliveryRunOrders.orderId,
          sequence: deliveryRunOrders.sequence,
          deliveredAt: deliveryRunOrders.deliveredAt,
          orderNumber: orders.orderNumber,
          latitude: orders.latitude,
          longitude: orders.longitude,
          zone: orders.deliveryZone,
          zipcode: orders.zipcode,
        })
        .from(deliveryRunOrders)
        .innerJoin(orders, eq(deliveryRunOrders.orderId, orders.id))
        .where(eq(deliveryRunOrders.deliveryRunId, run.id))
        .orderBy(deliveryRunOrders.sequence);
      
      const currentStopIndex = run.currentStopIndex || 0;
      const deliveredCount = stops.filter(s => s.deliveredAt !== null).length;
      
      // Calculate current position (simulate movement between stops)
      let currentLat = run.currentLatitude ? Number(run.currentLatitude) : DEPOT.latitude;
      let currentLon = run.currentLongitude ? Number(run.currentLongitude) : DEPOT.longitude;
      
      // If no stored position, estimate based on current stop
      if (!run.currentLatitude || !run.currentLongitude) {
        if (currentStopIndex > 0 && currentStopIndex <= stops.length) {
          const prevStop = currentStopIndex > 1 ? stops[currentStopIndex - 2] : null;
          const currentStop = stops[currentStopIndex - 1];
          
          if (currentStop) {
            // Simulate being partway to current stop
            const prevLat = prevStop ? Number(prevStop.latitude) : DEPOT.latitude;
            const prevLon = prevStop ? Number(prevStop.longitude) : DEPOT.longitude;
            const targetLat = Number(currentStop.latitude) || DEPOT.latitude;
            const targetLon = Number(currentStop.longitude) || DEPOT.longitude;
            
            // Random progress between stops (0.3 to 0.9)
            const progress = 0.3 + Math.random() * 0.6;
            currentLat = prevLat + (targetLat - prevLat) * progress;
            currentLon = prevLon + (targetLon - prevLon) * progress;
          }
        }
      }
      
      trackingData.push({
        runId: run.id,
        truckName: run.truckName || `Truck ${run.truckId}`,
        driverName,
        status: run.status,
        currentLatitude: currentLat,
        currentLongitude: currentLon,
        currentStopIndex,
        totalStops: stops.length,
        progress: stops.length > 0 ? (deliveredCount / stops.length) * 100 : 0,
        route: stops.map((stop, index) => ({
          orderId: stop.orderId,
          orderNumber: stop.orderNumber,
          sequence: stop.sequence,
          latitude: Number(stop.latitude) || DEPOT.latitude,
          longitude: Number(stop.longitude) || DEPOT.longitude,
          address: `${stop.zone} Zone - ${stop.zipcode}`,
          status: stop.deliveredAt 
            ? "delivered" 
            : index + 1 === currentStopIndex 
              ? "current" 
              : "pending",
        })),
      });
    }
    
    return {
      depot: DEPOT,
      activeRuns: trackingData,
    };
  }),

  // Simulate truck movement (for demo purposes)
  simulateMovement: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get current run state
      const run = await db
        .select()
        .from(deliveryRuns)
        .where(eq(deliveryRuns.id, input.runId))
        .limit(1);
      
      if (!run[0] || run[0].status !== "in_progress") {
        throw new Error("Run not found or not in progress");
      }
      
      // Get route stops
      const stops = await db
        .select({
          orderId: deliveryRunOrders.orderId,
          sequence: deliveryRunOrders.sequence,
          latitude: orders.latitude,
          longitude: orders.longitude,
        })
        .from(deliveryRunOrders)
        .innerJoin(orders, eq(deliveryRunOrders.orderId, orders.id))
        .where(eq(deliveryRunOrders.deliveryRunId, input.runId))
        .orderBy(deliveryRunOrders.sequence);
      
      const currentIndex = run[0].currentStopIndex || 0;
      
      if (currentIndex >= stops.length) {
        // All stops visited, return to depot
        await db.update(deliveryRuns).set({
          currentLatitude: String(DEPOT.latitude),
          currentLongitude: String(DEPOT.longitude),
        }).where(eq(deliveryRuns.id, input.runId));
        
        return { message: "Returning to depot" };
      }
      
      // Move towards next stop
      const targetStop = stops[currentIndex];
      const prevLat = currentIndex > 0 
        ? Number(stops[currentIndex - 1].latitude) 
        : DEPOT.latitude;
      const prevLon = currentIndex > 0 
        ? Number(stops[currentIndex - 1].longitude) 
        : DEPOT.longitude;
      
      const targetLat = Number(targetStop.latitude) || DEPOT.latitude;
      const targetLon = Number(targetStop.longitude) || DEPOT.longitude;
      
      // Simulate 20% progress towards target
      const currentLat = Number(run[0].currentLatitude) || prevLat;
      const currentLon = Number(run[0].currentLongitude) || prevLon;
      
      const newLat = currentLat + (targetLat - currentLat) * 0.2;
      const newLon = currentLon + (targetLon - currentLon) * 0.2;
      
      // Check if arrived (within ~100m)
      const distance = Math.sqrt(
        Math.pow(newLat - targetLat, 2) + Math.pow(newLon - targetLon, 2)
      );
      
      if (distance < 0.001) {
        // Arrived at stop
        await db.update(deliveryRuns).set({
          currentLatitude: String(targetLat),
          currentLongitude: String(targetLon),
          currentStopIndex: currentIndex + 1,
        }).where(eq(deliveryRuns.id, input.runId));
        
        return { 
          message: `Arrived at stop ${currentIndex + 1}`,
          arrived: true,
          stopIndex: currentIndex + 1,
        };
      }
      
      // Update position
      await db.update(deliveryRuns).set({
        currentLatitude: String(newLat),
        currentLongitude: String(newLon),
      }).where(eq(deliveryRuns.id, input.runId));
      
      return { 
        message: "Moving",
        latitude: newLat,
        longitude: newLon,
      };
    }),

  // Mark current stop as delivered and move to next
  deliverCurrentStop: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get current run
      const run = await db
        .select()
        .from(deliveryRuns)
        .where(eq(deliveryRuns.id, input.runId))
        .limit(1);
      
      if (!run[0] || run[0].status !== "in_progress") {
        throw new Error("Run not found or not in progress");
      }
      
      const currentIndex = run[0].currentStopIndex || 0;
      
      // Get current stop
      const stops = await db
        .select()
        .from(deliveryRunOrders)
        .where(eq(deliveryRunOrders.deliveryRunId, input.runId))
        .orderBy(deliveryRunOrders.sequence);
      
      if (currentIndex === 0 || currentIndex > stops.length) {
        throw new Error("No current stop to deliver");
      }
      
      const currentStop = stops[currentIndex - 1];
      
      // Mark as delivered
      await db.update(deliveryRunOrders).set({
        deliveredAt: new Date(),
      }).where(eq(deliveryRunOrders.id, currentStop.id));
      
      // Update order status
      await db.update(orders).set({
        status: "delivered",
      }).where(eq(orders.id, currentStop.orderId));
      
      // Check if all stops delivered
      if (currentIndex >= stops.length) {
        // Complete the run
        await db.update(deliveryRuns).set({
          status: "completed",
          actualEndTime: new Date(),
          currentLatitude: String(DEPOT.latitude),
          currentLongitude: String(DEPOT.longitude),
        }).where(eq(deliveryRuns.id, input.runId));
        
        // Release truck
        await db.update(trucks).set({
          status: "available",
        }).where(eq(trucks.id, run[0].truckId));
        
        // Release personnel
        if (run[0].driverId) {
          await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].driverId));
        }
        if (run[0].helperId) {
          await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].helperId));
        }
        if (run[0].helper2Id) {
          await db.update(personnel).set({ status: "available" }).where(eq(personnel.id, run[0].helper2Id));
        }
        
        return { 
          message: "Run completed",
          completed: true,
        };
      }
      
      return { 
        message: `Stop ${currentIndex} delivered`,
        nextStop: currentIndex + 1,
      };
    }),
});
