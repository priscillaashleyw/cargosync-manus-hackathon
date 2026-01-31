import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  trucks, 
  orders, 
  orderItems, 
  skus,
  deliveryRuns,
  deliveryRunOrders,
  loadPlan,
  personnel,
  InsertDeliveryRun,
  InsertDeliveryRunOrder,
  InsertLoadPlanItem
} from "../../drizzle/schema";
import { DEPOT, ZONES, HELPER_OPTIONS } from "../../shared/logistics";

// Types
interface OrderData {
  id: number;
  orderNumber: string;
  zipcode: string;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  helpersRequired: "none" | "one" | "two";
  totalWeight: number;
  totalVolume: number;
  items: ItemData[];
}

interface ItemData {
  id: number;
  orderId: number;
  skuId: number;
  quantity: number;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}

interface TruckData {
  id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
  maxWeight: number;
  volume: number;
}

interface TruckAssignment {
  truck: TruckData;
  orders: OrderData[];
  totalWeight: number;
  totalVolume: number;
  helpersNeeded: number;
  route: RouteStop[];
  loadPlan: LoadPlanItem[];
}

interface RouteStop {
  orderId: number;
  sequence: number;
  latitude: number;
  longitude: number;
  address: string;
  estimatedArrivalMinutes: number;
}

interface LoadPlanItem {
  orderItemId: number;
  orderId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  rotatedLength: number;
  rotatedWidth: number;
  height: number;
  weight: number;
  rotation: number;
  placement: "front" | "middle" | "back";
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get coordinates for an order (use zone center if no specific coords)
function getOrderCoordinates(order: OrderData): { lat: number; lon: number } {
  if (order.latitude && order.longitude) {
    return { lat: Number(order.latitude), lon: Number(order.longitude) };
  }
  // Use zone center as fallback
  const zone = order.zone as keyof typeof ZONES || "Central";
  return { lat: ZONES[zone].latitude, lon: ZONES[zone].longitude };
}

// Stage A: Auto-assign orders to trucks by zone clustering
function assignOrdersToTrucks(
  orders: OrderData[],
  trucks: TruckData[],
  availableHelpers: number
): TruckAssignment[] {
  const assignments: TruckAssignment[] = [];
  const unassignedOrders = [...orders];
  const availableTrucks = [...trucks];
  
  // Sort trucks by capacity (largest first for efficiency)
  availableTrucks.sort((a, b) => b.volume - a.volume);
  
  // Group orders by zone
  const ordersByZone: Record<string, OrderData[]> = {};
  for (const order of unassignedOrders) {
    const zone = order.zone || "Central";
    if (!ordersByZone[zone]) ordersByZone[zone] = [];
    ordersByZone[zone].push(order);
  }
  
  // Process zones in order of distance from depot (closest first)
  const zoneDistances = Object.entries(ZONES).map(([zone, coords]) => ({
    zone,
    distance: calculateDistance(DEPOT.latitude, DEPOT.longitude, coords.latitude, coords.longitude)
  })).sort((a, b) => a.distance - b.distance);
  
  let remainingHelpers = availableHelpers;
  
  for (const { zone } of zoneDistances) {
    const zoneOrders = ordersByZone[zone] || [];
    if (zoneOrders.length === 0) continue;
    
    // Sort orders by weight (heaviest first for better packing)
    zoneOrders.sort((a, b) => b.totalWeight - a.totalWeight);
    
    for (const order of zoneOrders) {
      // Find best truck for this order
      let bestTruck: TruckData | null = null;
      let bestAssignment: TruckAssignment | null = null;
      
      // Check helper availability
      const helpersNeeded = HELPER_OPTIONS[order.helpersRequired].count;
      if (helpersNeeded > remainingHelpers && order.helpersRequired !== "none") {
        // Skip orders requiring more helpers than available
        continue;
      }
      
      // First try to add to existing assignment in same zone
      for (const assignment of assignments) {
        const sameZone = assignment.orders.some(o => o.zone === order.zone);
        if (!sameZone) continue;
        
        const newWeight = assignment.totalWeight + order.totalWeight;
        const newVolume = assignment.totalVolume + order.totalVolume;
        
        if (newWeight <= assignment.truck.maxWeight && newVolume <= assignment.truck.volume) {
          bestAssignment = assignment;
          break;
        }
      }
      
      if (bestAssignment) {
        bestAssignment.orders.push(order);
        bestAssignment.totalWeight += order.totalWeight;
        bestAssignment.totalVolume += order.totalVolume;
        bestAssignment.helpersNeeded = Math.max(bestAssignment.helpersNeeded, helpersNeeded);
      } else {
        // Find available truck with enough capacity
        for (const truck of availableTrucks) {
          if (order.totalWeight <= truck.maxWeight && order.totalVolume <= truck.volume) {
            bestTruck = truck;
            break;
          }
        }
        
        if (bestTruck) {
          // Remove truck from available pool
          const truckIndex = availableTrucks.findIndex(t => t.id === bestTruck!.id);
          if (truckIndex >= 0) availableTrucks.splice(truckIndex, 1);
          
          assignments.push({
            truck: bestTruck,
            orders: [order],
            totalWeight: order.totalWeight,
            totalVolume: order.totalVolume,
            helpersNeeded: helpersNeeded,
            route: [],
            loadPlan: [],
          });
          
          remainingHelpers -= helpersNeeded;
        }
      }
    }
  }
  
  return assignments;
}

// Stage B: Optimize route within each truck (nearest neighbor TSP)
function optimizeRoute(assignment: TruckAssignment): RouteStop[] {
  const stops: RouteStop[] = [];
  const unvisited = [...assignment.orders];
  
  // Start from depot
  let currentLat = DEPOT.latitude;
  let currentLon = DEPOT.longitude;
  let totalTime = 0;
  let sequence = 1;
  
  while (unvisited.length > 0) {
    // Find nearest unvisited order
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    
    for (let i = 0; i < unvisited.length; i++) {
      const coords = getOrderCoordinates(unvisited[i]);
      const distance = calculateDistance(currentLat, currentLon, coords.lat, coords.lon);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    
    const order = unvisited.splice(nearestIndex, 1)[0];
    const coords = getOrderCoordinates(order);
    
    // Estimate travel time (assume 30 km/h average in Singapore)
    const travelTime = (nearestDistance / 30) * 60; // minutes
    const deliveryTime = 10; // 10 minutes per stop
    totalTime += travelTime + deliveryTime;
    
    stops.push({
      orderId: order.id,
      sequence,
      latitude: coords.lat,
      longitude: coords.lon,
      address: `${order.zone} Zone - ${order.zipcode}`,
      estimatedArrivalMinutes: Math.round(totalTime),
    });
    
    currentLat = coords.lat;
    currentLon = coords.lon;
    sequence++;
  }
  
  return stops;
}

// 3D Bin Packing with Front/Middle/Back placement
function generateLoadPlan(assignment: TruckAssignment): LoadPlanItem[] {
  const loadPlan: LoadPlanItem[] = [];
  const truck = assignment.truck;
  
  // Collect all items from all orders
  const allItems: (ItemData & { orderId: number; sequence: number })[] = [];
  
  for (const order of assignment.orders) {
    const routeStop = assignment.route.find(r => r.orderId === order.id);
    const sequence = routeStop?.sequence || 999;
    
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        allItems.push({ ...item, orderId: order.id, sequence });
      }
    }
  }
  
  // Sort items: earlier deliveries (higher sequence) load first (go to back)
  // Later deliveries load last (go to front)
  allItems.sort((a, b) => b.sequence - a.sequence);
  
  // Divide truck into 3 sections
  const sectionDepth = truck.depth / 3;
  const sections = {
    back: { startY: 0, endY: sectionDepth, items: [] as typeof allItems },
    middle: { startY: sectionDepth, endY: sectionDepth * 2, items: [] as typeof allItems },
    front: { startY: sectionDepth * 2, endY: truck.depth, items: [] as typeof allItems },
  };
  
  // Assign items to sections based on delivery sequence
  // First 1/3 of deliveries go to back, last 1/3 to front
  const itemsPerSection = Math.ceil(allItems.length / 3);
  
  for (let i = 0; i < allItems.length; i++) {
    if (i < itemsPerSection) {
      sections.back.items.push(allItems[i]);
    } else if (i < itemsPerSection * 2) {
      sections.middle.items.push(allItems[i]);
    } else {
      sections.front.items.push(allItems[i]);
    }
  }
  
  // Pack items within each section
  for (const [sectionName, section] of Object.entries(sections)) {
    let currentX = 0;
    let currentY = section.startY;
    let currentZ = 0;
    let layerHeight = 0;
    let rowWidth = 0;
    
    // Sort by weight (heavy items at bottom)
    section.items.sort((a, b) => b.weight - a.weight);
    
    for (const item of section.items) {
      const length = item.length || 30;
      const width = item.width || 30;
      const height = item.height || 30;
      
      // Try to fit in current position
      if (currentX + length > truck.width) {
        // Move to next row
        currentX = 0;
        currentY += rowWidth;
        rowWidth = 0;
      }
      
      if (currentY + width > section.endY) {
        // Move to next layer
        currentX = 0;
        currentY = section.startY;
        currentZ += layerHeight;
        layerHeight = 0;
        rowWidth = 0;
      }
      
      if (currentZ + height > truck.height) {
        // Can't fit, skip item
        continue;
      }
      
      loadPlan.push({
        orderItemId: item.id,
        orderId: item.orderId,
        name: item.name,
        x: currentX,
        y: currentY,
        z: currentZ,
        rotatedLength: length,
        rotatedWidth: width,
        height: height,
        weight: item.weight || 5,
        rotation: 0,
        placement: sectionName as "front" | "middle" | "back",
      });
      
      currentX += length;
      layerHeight = Math.max(layerHeight, height);
      rowWidth = Math.max(rowWidth, width);
    }
  }
  
  return loadPlan;
}

export const globalOptimizeRouter = router({
  // Run global optimization across all trucks
  autoOptimize: protectedProcedure
    .input(z.object({
      runDate: z.string(),
      orderIds: z.array(z.number()).optional(), // If not provided, use all pending orders
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get available trucks
      const availableTrucks = await db
        .select()
        .from(trucks)
        .where(eq(trucks.status, "available"));
      
      if (availableTrucks.length === 0) {
        throw new Error("No available trucks");
      }
      
      // Get available helpers count
      const helpersResult = await db
        .select()
        .from(personnel)
        .where(and(
          eq(personnel.personnelType, "helper"),
          eq(personnel.status, "available")
        ));
      const availableHelpers = helpersResult.length;
      
      // Get pending orders (or specified orders)
      let pendingOrders;
      if (input.orderIds && input.orderIds.length > 0) {
        pendingOrders = await db
          .select()
          .from(orders)
          .where(inArray(orders.id, input.orderIds));
      } else {
        pendingOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.status, "pending"));
      }
      
      if (pendingOrders.length === 0) {
        throw new Error("No pending orders to optimize");
      }
      
      // Get items for each order
      const ordersWithItems: OrderData[] = await Promise.all(
        pendingOrders.map(async (order) => {
          const items = await db
            .select({
              id: orderItems.id,
              orderId: orderItems.orderId,
              skuId: orderItems.skuId,
              quantity: orderItems.quantity,
              name: skus.name,
              length: skus.length,
              width: skus.width,
              height: skus.height,
              weight: skus.weight,
            })
            .from(orderItems)
            .innerJoin(skus, eq(orderItems.skuId, skus.id))
            .where(eq(orderItems.orderId, order.id));
          
          const totalWeight = items.reduce((sum, item) => 
            sum + (Number(item.weight) || 5) * item.quantity, 0);
          const totalVolume = items.reduce((sum, item) => {
            const vol = (Number(item.length) || 30) * (Number(item.width) || 30) * (Number(item.height) || 30);
            return sum + vol * item.quantity;
          }, 0);
          
          return {
            id: order.id,
            orderNumber: order.orderNumber,
            zipcode: order.zipcode,
            zone: order.deliveryZone,
            latitude: order.latitude ? Number(order.latitude) : null,
            longitude: order.longitude ? Number(order.longitude) : null,
            helpersRequired: (order.helpersRequired || "none") as "none" | "one" | "two",
            totalWeight,
            totalVolume,
            items: items.map(item => ({
              id: item.id,
              orderId: item.orderId,
              skuId: item.skuId,
              quantity: item.quantity,
              name: item.name,
              length: Number(item.length) || 30,
              width: Number(item.width) || 30,
              height: Number(item.height) || 30,
              weight: Number(item.weight) || 5,
            })),
          };
        })
      );
      
      // Convert trucks to TruckData
      const truckData: TruckData[] = availableTrucks.map(t => ({
        id: t.id,
        name: t.truckName,
        width: Number(t.width),
        depth: Number(t.depth),
        height: Number(t.height),
        maxWeight: Number(t.maxWeight),
        volume: Number(t.width) * Number(t.depth) * Number(t.height),
      }));
      
      // Stage A: Assign orders to trucks
      const assignments = assignOrdersToTrucks(ordersWithItems, truckData, availableHelpers);
      
      // Stage B: Optimize routes and generate load plans
      for (const assignment of assignments) {
        assignment.route = optimizeRoute(assignment);
        assignment.loadPlan = generateLoadPlan(assignment);
      }
      
      return {
        success: true,
        assignments: assignments.map(a => ({
          truck: a.truck,
          orders: a.orders.map(o => ({
            id: o.id,
            orderNumber: o.orderNumber,
            zone: o.zone,
            helpersRequired: o.helpersRequired,
          })),
          totalWeight: a.totalWeight,
          totalVolume: a.totalVolume,
          helpersNeeded: a.helpersNeeded,
          route: a.route,
          loadPlan: a.loadPlan,
          volumeUtilization: (a.totalVolume / a.truck.volume) * 100,
          weightUtilization: (a.totalWeight / a.truck.maxWeight) * 100,
        })),
        depot: DEPOT,
        unassignedOrders: ordersWithItems
          .filter(o => !assignments.some(a => a.orders.some(ao => ao.id === o.id)))
          .map(o => ({ id: o.id, orderNumber: o.orderNumber, reason: "No available truck with capacity" })),
      };
    }),

  // Create delivery runs from optimization result
  createFromAutoOptimize: protectedProcedure
    .input(z.object({
      runDate: z.string(),
      assignments: z.array(z.object({
        truckId: z.number(),
        orderIds: z.array(z.number()),
        route: z.array(z.object({
          orderId: z.number(),
          sequence: z.number(),
          estimatedArrivalMinutes: z.number(),
        })),
        loadPlan: z.array(z.object({
          orderItemId: z.number(),
          x: z.number(),
          y: z.number(),
          z: z.number(),
          rotatedLength: z.number(),
          rotatedWidth: z.number(),
          height: z.number(),
          weight: z.number(),
          rotation: z.number(),
          placement: z.enum(["front", "middle", "back"]),
        })),
        driverId: z.number().optional(),
        helperId: z.number().optional(),
        helper2Id: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const createdRuns: number[] = [];
      
      for (const assignment of input.assignments) {
        // Create delivery run
        const runData: InsertDeliveryRun = {
          runDate: new Date(input.runDate),
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          helperId: assignment.helperId,
          helper2Id: assignment.helper2Id,
          status: "planned",
        };
        
        const runResult = await db.insert(deliveryRuns).values(runData);
        const runId = Number(runResult[0].insertId);
        createdRuns.push(runId);
        
        // Add orders with sequence
        for (const routeStop of assignment.route) {
          const runOrderData: InsertDeliveryRunOrder = {
            deliveryRunId: runId,
            orderId: routeStop.orderId,
            sequence: routeStop.sequence,
          };
          await db.insert(deliveryRunOrders).values(runOrderData);
          
          // Update order status
          await db.update(orders).set({ status: "allocated" }).where(eq(orders.id, routeStop.orderId));
        }
        
        // Save load plan
        for (const item of assignment.loadPlan) {
          const loadPlanData: InsertLoadPlanItem = {
            deliveryRunId: runId,
            orderItemId: item.orderItemId,
            positionX: String(item.x),
            positionY: String(item.y),
            positionZ: String(item.z),
            rotatedLength: String(item.rotatedLength),
            rotatedWidth: String(item.rotatedWidth),
            height: String(item.height),
            weight: String(item.weight),
            rotation: item.rotation,
            placement: item.placement,
          };
          await db.insert(loadPlan).values(loadPlanData);
        }
        
        // Update truck status to in_transit
        await db.update(trucks).set({ status: "in_transit" }).where(eq(trucks.id, assignment.truckId));
        
        // Update driver status
        if (assignment.driverId) {
          await db.update(personnel).set({ status: "assigned" }).where(eq(personnel.id, assignment.driverId));
        }
        
        // Update helper statuses
        if (assignment.helperId) {
          await db.update(personnel).set({ status: "assigned" }).where(eq(personnel.id, assignment.helperId));
        }
        if (assignment.helper2Id) {
          await db.update(personnel).set({ status: "assigned" }).where(eq(personnel.id, assignment.helper2Id));
        }
      }
      
      return { success: true, runIds: createdRuns };
    }),

  // Get depot info
  getDepot: protectedProcedure.query(() => {
    return DEPOT;
  }),
});
