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

// ============================================================================
// ROUTE OPTIMIZATION ALGORITHM V3
// Based on route_optimizer_v3.py with:
// 1. Multi-trip support with RETURN-TO-DEPOT time between trips
// 2. Parallel truck deployment (total time = max time across all trucks)
// 3. Improved load balancing with Best-Fit Decreasing
// 4. Better zone-based optimization
// 5. Detailed route scheduling with reload times
// ============================================================================

// Singapore postal district to zone mapping
const ZONE_MAPPING: Record<string, string> = {
  '01': 'Central', '02': 'Central', '03': 'Central', '04': 'Central',
  '05': 'Central', '06': 'Central', '07': 'Central', '08': 'Central',
  '14': 'Central', '15': 'Central', '16': 'Central', '17': 'Central',
  '18': 'Central', '19': 'Central', '20': 'Central', '21': 'Central',
  '38': 'East', '39': 'East', '40': 'East', '41': 'East', '42': 'East',
  '43': 'East', '44': 'East', '45': 'East', '46': 'East', '47': 'East',
  '48': 'East', '49': 'East', '50': 'East', '51': 'East', '52': 'East',
  '53': 'North', '54': 'North', '55': 'North', '56': 'North', '57': 'North',
  '72': 'North', '73': 'North', '75': 'North', '76': 'North', '77': 'North',
  '78': 'North', '79': 'North', '80': 'North', '81': 'North', '82': 'North',
  '22': 'West', '23': 'West',
  '58': 'West', '59': 'West', '60': 'West', '61': 'West', '62': 'West',
  '63': 'West', '64': 'West', '65': 'West', '66': 'West', '67': 'West',
  '68': 'West', '69': 'West', '70': 'West', '71': 'West',
  '09': 'South', '10': 'South', '11': 'South', '12': 'South', '13': 'South',
  '24': 'South', '25': 'South', '26': 'South', '27': 'South', '28': 'South',
  '29': 'South', '30': 'South', '31': 'South', '32': 'South', '33': 'South',
  '34': 'South', '35': 'South', '36': 'South', '37': 'South',
};

// Estimated travel times from depot (Tuas) to each zone in minutes
const ZONE_TRAVEL_TIMES: Record<string, number> = {
  'West': 15,
  'Central': 30,
  'South': 35,
  'East': 45,
  'North': 40,
};

// Inter-zone travel times (minutes)
const INTER_ZONE_TIMES: Record<string, number> = {
  'Central-East': 25, 'Central-North': 20, 'Central-South': 15,
  'Central-West': 20, 'East-North': 25, 'East-South': 30,
  'East-West': 40, 'North-South': 35, 'North-West': 35,
  'South-West': 25,
};

// Reload time at depot (minutes)
const DEPOT_RELOAD_TIME = 30;

function getInterZoneTime(zone1: string, zone2: string): number {
  if (zone1 === zone2) return 5;
  const key = [zone1, zone2].sort().join('-');
  return INTER_ZONE_TIMES[key] || 30;
}

function getZoneFromZipcode(zipcode: string): string {
  const sector = zipcode.toString().padStart(6, '0').substring(0, 2);
  return ZONE_MAPPING[sector] || 'Central';
}

// Types
interface OrderData {
  id: number;
  orderNumber: string;
  zipcode: string;
  zone: string;
  sector: string;
  latitude: number | null;
  longitude: number | null;
  helpersRequired: "none" | "one" | "two";
  totalWeight: number;
  totalVolume: number;
  maxLength: number;
  maxWidth: number;
  maxHeight: number;
  needsTwoPeople: boolean;
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

interface TruckTrip {
  tripId: number;
  truckId: number;
  maxVolume: number;
  maxWeight: number;
  truckDims: [number, number, number];
  loadedOrders: OrderData[];
  currentVolume: number;
  currentWeight: number;
  assignedZones: string[];
}

interface TruckWithTrips {
  truck: TruckData;
  trips: TruckTrip[];
  totalOrders: number;
  totalVolumeUsed: number;
  totalWeightUsed: number;
  totalRouteTime: number;
}

interface RouteStop {
  orderId: number;
  orderNumber: string;
  sequence: number;
  zone: string;
  zipcode: string;
  sector: string;
  latitude: number;
  longitude: number;
  weightKg: number;
  volumeM3: number;
  needsTwoPeople: boolean;
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

// Trip helper functions
function canFitInTrip(trip: TruckTrip, order: OrderData): boolean {
  if (trip.currentVolume + order.totalVolume > trip.maxVolume) return false;
  if (trip.currentWeight + order.totalWeight > trip.maxWeight) return false;
  
  const dims = [...trip.truckDims].sort((a, b) => b - a);
  const orderDims = [order.maxLength, order.maxWidth, order.maxHeight].sort((a, b) => b - a);
  
  for (let i = 0; i < 3; i++) {
    if (orderDims[i] > dims[i]) return false;
  }
  return true;
}

function loadOrderIntoTrip(trip: TruckTrip, order: OrderData): void {
  trip.loadedOrders.push(order);
  trip.currentVolume += order.totalVolume;
  trip.currentWeight += order.totalWeight;
  if (!trip.assignedZones.includes(order.zone)) {
    trip.assignedZones.push(order.zone);
  }
}

function optimizeZoneOrder(zones: string[]): string[] {
  const uniqueZones = Array.from(new Set(zones));
  if (uniqueZones.length <= 1) return uniqueZones;
  return uniqueZones.sort((a, b) => (ZONE_TRAVEL_TIMES[a] || 30) - (ZONE_TRAVEL_TIMES[b] || 30));
}

function getTripRouteTime(trip: TruckTrip, includeReturn: boolean = true): number {
  if (trip.loadedOrders.length === 0) return 0;
  
  const zones = optimizeZoneOrder(trip.assignedZones);
  if (zones.length === 0) return 0;
  
  // Time from depot to first zone
  let totalTime = ZONE_TRAVEL_TIMES[zones[0]] || 30;
  
  // Time between zones
  for (let i = 0; i < zones.length - 1; i++) {
    totalTime += getInterZoneTime(zones[i], zones[i + 1]);
  }
  
  // Delivery time per stop (10 min average, 15 for heavy items)
  for (const order of trip.loadedOrders) {
    totalTime += order.needsTwoPeople ? 15 : 10;
  }
  
  // Return to depot
  if (includeReturn) {
    totalTime += ZONE_TRAVEL_TIMES[zones[zones.length - 1]] || 30;
  }
  
  return totalTime;
}

function getOptimizedRoute(trip: TruckTrip): RouteStop[] {
  if (trip.loadedOrders.length === 0) return [];
  
  const zoneOrders: Record<string, OrderData[]> = {};
  for (const order of trip.loadedOrders) {
    if (!zoneOrders[order.zone]) zoneOrders[order.zone] = [];
    zoneOrders[order.zone].push(order);
  }
  
  const zoneSequence = optimizeZoneOrder(trip.assignedZones);
  const route: RouteStop[] = [];
  let stopNumber = 1;
  
  for (const zone of zoneSequence) {
    const orders = zoneOrders[zone] || [];
    orders.sort((a, b) => a.sector.localeCompare(b.sector));
    
    for (const order of orders) {
      route.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        sequence: stopNumber,
        zone: order.zone,
        zipcode: order.zipcode,
        sector: order.sector,
        latitude: order.latitude || ZONES[order.zone as keyof typeof ZONES]?.latitude || DEPOT.latitude,
        longitude: order.longitude || ZONES[order.zone as keyof typeof ZONES]?.longitude || DEPOT.longitude,
        weightKg: Math.round(order.totalWeight * 100) / 100,
        volumeM3: Math.round(order.totalVolume / 1000000 * 1000) / 1000,
        needsTwoPeople: order.needsTwoPeople,
      });
      stopNumber++;
    }
  }
  
  return route;
}

function getTruckTotalRouteTime(trips: TruckTrip[]): number {
  if (trips.length === 0) return 0;
  
  let totalTime = 0;
  for (let i = 0; i < trips.length; i++) {
    totalTime += getTripRouteTime(trips[i], true);
    if (i < trips.length - 1) {
      totalTime += DEPOT_RELOAD_TIME;
    }
  }
  return totalTime;
}

// Main optimization algorithm (Best-Fit Decreasing with zone-based assignment)
function runOptimizationV3(
  ordersData: OrderData[],
  trucksData: TruckData[]
): {
  trucksWithTrips: TruckWithTrips[];
  unassignedOrders: OrderData[];
  summary: {
    totalOrders: number;
    assignedOrders: number;
    unassignedOrders: number;
    assignmentRate: number;
    totalTrips: number;
    totalElapsedTimeMin: number;
    totalElapsedTimeHours: number;
    fleetVolumeUtilization: number;
    depotReloadTimePerTripMin: number;
  };
  parallelDeployment: {
    deploymentMode: string;
    totalElapsedTimeMin: number;
    totalElapsedTimeHours: number;
    bottleneckTruck: string | null;
    truckCompletionTimes: Record<string, { totalTimeMin: number; totalTimeHours: number; trips: number }>;
  };
  zoneSummary: Record<string, { orders: number; volumeM3: number; weightKg: number }>;
} {
  // Initialize trucks with trips
  const trucksWithTrips: TruckWithTrips[] = trucksData.map(truck => ({
    truck,
    trips: [{
      tripId: 1,
      truckId: truck.id,
      maxVolume: truck.volume,
      maxWeight: truck.maxWeight,
      truckDims: [truck.width, truck.depth, truck.height] as [number, number, number],
      loadedOrders: [],
      currentVolume: 0,
      currentWeight: 0,
      assignedZones: [],
    }],
    totalOrders: 0,
    totalVolumeUsed: 0,
    totalWeightUsed: 0,
    totalRouteTime: 0,
  }));
  
  const unassignedOrders: OrderData[] = [];
  
  // Step 1: Group orders by zone
  const zoneOrders: Record<string, OrderData[]> = {};
  for (const order of ordersData) {
    if (!zoneOrders[order.zone]) zoneOrders[order.zone] = [];
    zoneOrders[order.zone].push(order);
  }
  
  // Sort orders within each zone by volume (descending) for BFD
  for (const zone of Object.keys(zoneOrders)) {
    zoneOrders[zone].sort((a, b) => b.totalVolume - a.totalVolume);
  }
  
  // Step 2: Calculate zone demands and assign trucks to zones
  const zoneDemands: Record<string, { volume: number; weight: number; count: number }> = {};
  for (const [zone, orders] of Object.entries(zoneOrders)) {
    zoneDemands[zone] = {
      volume: orders.reduce((sum, o) => sum + o.totalVolume, 0),
      weight: orders.reduce((sum, o) => sum + o.totalWeight, 0),
      count: orders.length,
    };
  }
  
  // Sort zones by demand (highest first)
  const sortedZones = Object.entries(zoneDemands)
    .sort((a, b) => b[1].volume - a[1].volume)
    .map(([zone]) => zone);
  
  // Sort trucks by capacity (largest first)
  trucksWithTrips.sort((a, b) => b.truck.volume - a.truck.volume);
  
  // Assign trucks to zones based on demand
  const zoneTruckMap: Record<string, TruckWithTrips[]> = {};
  const usedTrucks = new Set<number>();
  
  for (const zone of sortedZones) {
    zoneTruckMap[zone] = [];
    const neededVolume = zoneDemands[zone].volume;
    let assignedVolume = 0;
    
    for (const truckWithTrips of trucksWithTrips) {
      if (usedTrucks.has(truckWithTrips.truck.id)) continue;
      if (assignedVolume >= neededVolume) break;
      
      zoneTruckMap[zone].push(truckWithTrips);
      assignedVolume += truckWithTrips.truck.volume;
      usedTrucks.add(truckWithTrips.truck.id);
    }
  }
  
  // Assign remaining trucks to highest demand zone
  for (const truckWithTrips of trucksWithTrips) {
    if (!usedTrucks.has(truckWithTrips.truck.id)) {
      const bestZone = sortedZones[0] || 'Central';
      if (!zoneTruckMap[bestZone]) zoneTruckMap[bestZone] = [];
      zoneTruckMap[bestZone].push(truckWithTrips);
      usedTrucks.add(truckWithTrips.truck.id);
    }
  }
  
  // Step 3: Pack orders using Best-Fit Decreasing
  for (const zone of sortedZones) {
    const orders = zoneOrders[zone] || [];
    const assignedTrucks = zoneTruckMap[zone] || [];
    
    for (const order of orders) {
      let packed = false;
      
      // Try to find best fit in assigned zone trucks
      let bestTruck: TruckWithTrips | null = null;
      let bestRemaining = Infinity;
      
      for (const truckWithTrips of assignedTrucks) {
        const currentTrip = truckWithTrips.trips[truckWithTrips.trips.length - 1];
        if (canFitInTrip(currentTrip, order)) {
          const remaining = currentTrip.maxVolume - currentTrip.currentVolume - order.totalVolume;
          if (remaining < bestRemaining) {
            bestRemaining = remaining;
            bestTruck = truckWithTrips;
          }
        }
      }
      
      if (bestTruck) {
        const currentTrip = bestTruck.trips[bestTruck.trips.length - 1];
        loadOrderIntoTrip(currentTrip, order);
        packed = true;
      } else {
        // Try any truck
        for (const truckWithTrips of trucksWithTrips) {
          const currentTrip = truckWithTrips.trips[truckWithTrips.trips.length - 1];
          if (canFitInTrip(currentTrip, order)) {
            loadOrderIntoTrip(currentTrip, order);
            packed = true;
            break;
          }
        }
      }
      
      if (!packed) {
        unassignedOrders.push(order);
      }
    }
  }
  
  // Step 4: Handle remaining orders with multi-trip support
  const remainingOrders = [...unassignedOrders];
  unassignedOrders.length = 0;
  remainingOrders.sort((a, b) => b.totalVolume - a.totalVolume);
  
  for (const order of remainingOrders) {
    let packed = false;
    
    // Sort trucks by capacity for better packing
    const sortedTrucks = [...trucksWithTrips].sort((a, b) => b.truck.volume - a.truck.volume);
    
    for (const truckWithTrips of sortedTrucks) {
      let currentTrip = truckWithTrips.trips[truckWithTrips.trips.length - 1];
      
      if (!canFitInTrip(currentTrip, order)) {
        // Create new trip
        const newTrip: TruckTrip = {
          tripId: truckWithTrips.trips.length + 1,
          truckId: truckWithTrips.truck.id,
          maxVolume: truckWithTrips.truck.volume,
          maxWeight: truckWithTrips.truck.maxWeight,
          truckDims: [truckWithTrips.truck.width, truckWithTrips.truck.depth, truckWithTrips.truck.height],
          loadedOrders: [],
          currentVolume: 0,
          currentWeight: 0,
          assignedZones: [],
        };
        truckWithTrips.trips.push(newTrip);
        currentTrip = newTrip;
      }
      
      if (canFitInTrip(currentTrip, order)) {
        loadOrderIntoTrip(currentTrip, order);
        packed = true;
        break;
      }
    }
    
    if (!packed) {
      unassignedOrders.push(order);
    }
  }
  
  // Calculate totals for each truck
  for (const truckWithTrips of trucksWithTrips) {
    truckWithTrips.totalOrders = truckWithTrips.trips.reduce((sum, t) => sum + t.loadedOrders.length, 0);
    truckWithTrips.totalVolumeUsed = truckWithTrips.trips.reduce((sum, t) => sum + t.currentVolume, 0);
    truckWithTrips.totalWeightUsed = truckWithTrips.trips.reduce((sum, t) => sum + t.currentWeight, 0);
    truckWithTrips.totalRouteTime = getTruckTotalRouteTime(truckWithTrips.trips);
  }
  
  // Calculate summary statistics
  const totalAssigned = trucksWithTrips.reduce((sum, t) => sum + t.totalOrders, 0);
  const truckTotalTimes = trucksWithTrips.map(t => t.totalRouteTime);
  const maxTruckTime = Math.max(...truckTotalTimes, 0);
  const totalFleetVolume = trucksData.reduce((sum, t) => sum + t.volume, 0);
  const totalVolumeUsed = trucksWithTrips.reduce((sum, t) => sum + t.totalVolumeUsed, 0);
  
  // Zone summary
  const zoneSummary: Record<string, { orders: number; volumeM3: number; weightKg: number }> = {};
  for (const truckWithTrips of trucksWithTrips) {
    for (const trip of truckWithTrips.trips) {
      for (const order of trip.loadedOrders) {
        if (!zoneSummary[order.zone]) {
          zoneSummary[order.zone] = { orders: 0, volumeM3: 0, weightKg: 0 };
        }
        zoneSummary[order.zone].orders++;
        zoneSummary[order.zone].volumeM3 += order.totalVolume / 1000000;
        zoneSummary[order.zone].weightKg += order.totalWeight;
      }
    }
  }
  
  // Round zone summary values
  for (const zone of Object.keys(zoneSummary)) {
    zoneSummary[zone].volumeM3 = Math.round(zoneSummary[zone].volumeM3 * 100) / 100;
    zoneSummary[zone].weightKg = Math.round(zoneSummary[zone].weightKg * 100) / 100;
  }
  
  // Find bottleneck truck
  const bottleneckTruck = trucksWithTrips.reduce((max, t) => 
    t.totalRouteTime > max.totalRouteTime ? t : max, trucksWithTrips[0]);
  
  return {
    trucksWithTrips,
    unassignedOrders,
    summary: {
      totalOrders: ordersData.length,
      assignedOrders: totalAssigned,
      unassignedOrders: unassignedOrders.length,
      assignmentRate: Math.round((totalAssigned / ordersData.length) * 1000) / 10,
      totalTrips: trucksWithTrips.reduce((sum, t) => sum + t.trips.length, 0),
      totalElapsedTimeMin: maxTruckTime,
      totalElapsedTimeHours: Math.round(maxTruckTime / 60 * 100) / 100,
      fleetVolumeUtilization: totalFleetVolume > 0 
        ? Math.round((totalVolumeUsed / totalFleetVolume) * 1000) / 10 
        : 0,
      depotReloadTimePerTripMin: DEPOT_RELOAD_TIME,
    },
    parallelDeployment: {
      deploymentMode: 'PARALLEL - All trucks deployed simultaneously',
      totalElapsedTimeMin: maxTruckTime,
      totalElapsedTimeHours: Math.round(maxTruckTime / 60 * 100) / 100,
      bottleneckTruck: bottleneckTruck?.truck.name || null,
      truckCompletionTimes: Object.fromEntries(
        trucksWithTrips.map(t => [
          t.truck.name,
          {
            totalTimeMin: t.totalRouteTime,
            totalTimeHours: Math.round(t.totalRouteTime / 60 * 100) / 100,
            trips: t.trips.length,
          }
        ])
      ),
    },
    zoneSummary,
  };
}

// 3D Bin Packing with Front/Middle/Back placement
function generateLoadPlan(trip: TruckTrip, route: RouteStop[], truck: TruckData): LoadPlanItem[] {
  const loadPlan: LoadPlanItem[] = [];
  
  // Collect all items from all orders with their sequence
  const allItems: (ItemData & { orderId: number; sequence: number })[] = [];
  
  for (const order of trip.loadedOrders) {
    const routeStop = route.find(r => r.orderId === order.id);
    const sequence = routeStop?.sequence || 999;
    
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        allItems.push({ ...item, orderId: order.id, sequence });
      }
    }
  }
  
  // Sort items: earlier deliveries (lower sequence) should be accessible first
  // So they go to the BACK (loaded first, unloaded last... wait, that's wrong)
  // Actually: LIFO - Last In, First Out
  // Items for FIRST delivery should be loaded LAST (near the door/front)
  // Items for LAST delivery should be loaded FIRST (at the back)
  allItems.sort((a, b) => b.sequence - a.sequence);
  
  // Divide truck into 3 sections
  const sectionDepth = truck.depth / 3;
  const sections = {
    back: { startY: 0, endY: sectionDepth, items: [] as typeof allItems },
    middle: { startY: sectionDepth, endY: sectionDepth * 2, items: [] as typeof allItems },
    front: { startY: sectionDepth * 2, endY: truck.depth, items: [] as typeof allItems },
  };
  
  // Assign items to sections based on delivery sequence
  const itemsPerSection = Math.ceil(allItems.length / 3);
  
  for (let i = 0; i < allItems.length; i++) {
    if (i < itemsPerSection) {
      sections.back.items.push(allItems[i]); // Last deliveries go to back
    } else if (i < itemsPerSection * 2) {
      sections.middle.items.push(allItems[i]);
    } else {
      sections.front.items.push(allItems[i]); // First deliveries go to front
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
        currentX = 0;
        currentY += rowWidth;
        rowWidth = 0;
      }
      
      if (currentY + width > section.endY) {
        currentX = 0;
        currentY = section.startY;
        currentZ += layerHeight;
        layerHeight = 0;
        rowWidth = 0;
      }
      
      if (currentZ + height > truck.height) {
        continue; // Can't fit
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
  // Get depot information
  getDepot: protectedProcedure.query(() => {
    return {
      name: DEPOT.name,
      address: DEPOT.address,
      zipcode: DEPOT.zipcode,
      latitude: DEPOT.latitude,
      longitude: DEPOT.longitude,
    };
  }),

  // Run global optimization across all trucks using V3 algorithm
  autoOptimize: protectedProcedure
    .input(z.object({
      runDate: z.string(),
      orderIds: z.array(z.number()).optional(),
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
      
      // Get pending orders
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
      
      // Get items for each order and build OrderData
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
          
          const maxLength = Math.max(...items.map(i => Number(i.length) || 30));
          const maxWidth = Math.max(...items.map(i => Number(i.width) || 30));
          const maxHeight = Math.max(...items.map(i => Number(i.height) || 30));
          
          const zipcode = order.zipcode.toString().padStart(6, '0');
          const sector = zipcode.substring(0, 2);
          const zone = order.deliveryZone || getZoneFromZipcode(zipcode);
          
          return {
            id: order.id,
            orderNumber: order.orderNumber,
            zipcode: order.zipcode,
            zone,
            sector,
            latitude: order.latitude ? Number(order.latitude) : null,
            longitude: order.longitude ? Number(order.longitude) : null,
            helpersRequired: (order.helpersRequired || "none") as "none" | "one" | "two",
            totalWeight,
            totalVolume,
            maxLength,
            maxWidth,
            maxHeight,
            needsTwoPeople: totalWeight > 50,
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
      
      // Run V3 optimization
      const result = runOptimizationV3(ordersWithItems, truckData);
      
      // Generate routes and load plans for each truck/trip
      const assignments = result.trucksWithTrips.map(truckWithTrips => {
        const tripsData = truckWithTrips.trips.map(trip => {
          const route = getOptimizedRoute(trip);
          const loadPlanItems = generateLoadPlan(trip, route, truckWithTrips.truck);
          
          return {
            tripId: trip.tripId,
            orders: trip.loadedOrders.map(o => ({
              id: o.id,
              orderNumber: o.orderNumber,
              zone: o.zone,
              helpersRequired: o.helpersRequired,
            })),
            route,
            loadPlan: loadPlanItems,
            volumeUtilization: trip.maxVolume > 0 ? (trip.currentVolume / trip.maxVolume) * 100 : 0,
            weightUtilization: trip.maxWeight > 0 ? (trip.currentWeight / trip.maxWeight) * 100 : 0,
            deliveryTimeMin: getTripRouteTime(trip, true),
            zones: trip.assignedZones,
          };
        });
        
        return {
          truck: truckWithTrips.truck,
          totalTrips: truckWithTrips.trips.length,
          totalOrders: truckWithTrips.totalOrders,
          totalVolumeM3: Math.round(truckWithTrips.totalVolumeUsed / 1000000 * 100) / 100,
          totalWeightKg: Math.round(truckWithTrips.totalWeightUsed * 100) / 100,
          totalRouteTimeMin: truckWithTrips.totalRouteTime,
          totalRouteTimeHours: Math.round(truckWithTrips.totalRouteTime / 60 * 100) / 100,
          trips: tripsData,
        };
      });
      
      return {
        success: true,
        assignments,
        depot: DEPOT,
        summary: result.summary,
        parallelDeployment: result.parallelDeployment,
        zoneSummary: result.zoneSummary,
        unassignedOrders: result.unassignedOrders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          zone: o.zone,
          volumeM3: Math.round(o.totalVolume / 1000000 * 1000) / 1000,
          weightKg: Math.round(o.totalWeight * 100) / 100,
          reason: "No available truck with capacity",
        })),
      };
    }),

  // Create delivery runs from optimization result
  createFromAutoOptimize: protectedProcedure
    .input(z.object({
      runDate: z.string(),
      assignments: z.array(z.object({
        truckId: z.number(),
        tripId: z.number().optional(),
        orderIds: z.array(z.number()),
        route: z.array(z.object({
          orderId: z.number(),
          sequence: z.number(),
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
        
        // Update truck status
        await db.update(trucks).set({ status: "in_transit" }).where(eq(trucks.id, assignment.truckId));
        
        // Update personnel status
        if (assignment.driverId) {
          await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, assignment.driverId));
        }
        if (assignment.helperId) {
          await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, assignment.helperId));
        }
        if (assignment.helper2Id) {
          await db.update(personnel).set({ status: "on_route" }).where(eq(personnel.id, assignment.helper2Id));
        }
      }
      
      return {
        success: true,
        createdRunIds: createdRuns,
        message: `Created ${createdRuns.length} delivery runs`,
      };
    }),
});
