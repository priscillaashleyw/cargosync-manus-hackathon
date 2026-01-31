import { z } from "zod";
import { eq } from "drizzle-orm";
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
  InsertDeliveryRun,
  InsertDeliveryRunOrder,
  InsertLoadPlanItem
} from "../../drizzle/schema";

// Types for bin packing
interface Item {
  id: number;
  orderItemId: number;
  orderId: number;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  volume: number;
}

interface PackedItem extends Item {
  x: number;
  y: number;
  z: number;
  rotation: number; // 0, 90, 180, 270
  rotatedLength: number;
  rotatedWidth: number;
}

interface Bin {
  width: number;
  depth: number;
  height: number;
  maxWeight: number;
  items: PackedItem[];
  usedVolume: number;
  usedWeight: number;
}

interface OptimizationResult {
  success: boolean;
  packedItems: PackedItem[];
  unpackedItems: Item[];
  totalVolume: number;
  usedVolume: number;
  volumeUtilization: number;
  totalWeight: number;
  weightUtilization: number;
  centerOfGravity: { x: number; y: number; z: number };
  isBalanced: boolean;
}

// 3D Bin Packing Algorithm - First Fit Decreasing with Bottom-Left-Back placement
function packItems(items: Item[], bin: Bin): OptimizationResult {
  // Sort items by volume (descending) - First Fit Decreasing
  const sortedItems = [...items].sort((a, b) => b.volume - a.volume);
  
  const packedItems: PackedItem[] = [];
  const unpackedItems: Item[] = [];
  
  // Track occupied spaces using a simple grid approach
  const spaces: { x: number; y: number; z: number; w: number; d: number; h: number }[] = [
    { x: 0, y: 0, z: 0, w: bin.width, d: bin.depth, h: bin.height }
  ];
  
  let totalWeight = 0;
  let totalVolume = 0;
  
  for (const item of sortedItems) {
    // Check weight constraint
    if (totalWeight + item.weight > bin.maxWeight) {
      unpackedItems.push(item);
      continue;
    }
    
    // Try different rotations (0, 90 degrees on horizontal plane)
    const rotations = [
      { rotation: 0, length: item.length, width: item.width },
      { rotation: 90, length: item.width, width: item.length },
    ];
    
    let placed = false;
    
    for (const rot of rotations) {
      if (placed) break;
      
      // Find best position using Bottom-Left-Back heuristic
      let bestSpace: typeof spaces[0] | null = null;
      let bestSpaceIndex = -1;
      
      for (let i = 0; i < spaces.length; i++) {
        const space = spaces[i];
        
        // Check if item fits in this space
        if (rot.length <= space.w && rot.width <= space.d && item.height <= space.h) {
          // Prefer lower positions (bottom), then back (lower y), then left (lower x)
          if (!bestSpace || 
              space.z < bestSpace.z || 
              (space.z === bestSpace.z && space.y < bestSpace.y) ||
              (space.z === bestSpace.z && space.y === bestSpace.y && space.x < bestSpace.x)) {
            bestSpace = space;
            bestSpaceIndex = i;
          }
        }
      }
      
      if (bestSpace && bestSpaceIndex >= 0) {
        // Place item
        const packedItem: PackedItem = {
          ...item,
          x: bestSpace.x,
          y: bestSpace.y,
          z: bestSpace.z,
          rotation: rot.rotation,
          rotatedLength: rot.length,
          rotatedWidth: rot.width,
        };
        
        packedItems.push(packedItem);
        totalWeight += item.weight;
        totalVolume += item.volume;
        placed = true;
        
        // Remove used space and create new spaces
        spaces.splice(bestSpaceIndex, 1);
        
        // Create new spaces around the placed item
        // Space to the right
        if (bestSpace.w - rot.length > 0) {
          spaces.push({
            x: bestSpace.x + rot.length,
            y: bestSpace.y,
            z: bestSpace.z,
            w: bestSpace.w - rot.length,
            d: bestSpace.d,
            h: bestSpace.h,
          });
        }
        
        // Space in front
        if (bestSpace.d - rot.width > 0) {
          spaces.push({
            x: bestSpace.x,
            y: bestSpace.y + rot.width,
            z: bestSpace.z,
            w: rot.length,
            d: bestSpace.d - rot.width,
            h: bestSpace.h,
          });
        }
        
        // Space above
        if (bestSpace.h - item.height > 0) {
          spaces.push({
            x: bestSpace.x,
            y: bestSpace.y,
            z: bestSpace.z + item.height,
            w: rot.length,
            d: rot.width,
            h: bestSpace.h - item.height,
          });
        }
      }
    }
    
    if (!placed) {
      unpackedItems.push(item);
    }
  }
  
  // Calculate center of gravity
  let cogX = 0, cogY = 0, cogZ = 0;
  if (totalWeight > 0) {
    for (const item of packedItems) {
      const itemCenterX = item.x + item.rotatedLength / 2;
      const itemCenterY = item.y + item.rotatedWidth / 2;
      const itemCenterZ = item.z + item.height / 2;
      
      cogX += itemCenterX * item.weight;
      cogY += itemCenterY * item.weight;
      cogZ += itemCenterZ * item.weight;
    }
    
    cogX /= totalWeight;
    cogY /= totalWeight;
    cogZ /= totalWeight;
  }
  
  // Check if load is balanced (center of gravity within middle 60% of truck)
  const binCenterX = bin.width / 2;
  const binCenterY = bin.depth / 2;
  const toleranceX = bin.width * 0.3;
  const toleranceY = bin.depth * 0.3;
  
  const isBalanced = 
    Math.abs(cogX - binCenterX) <= toleranceX &&
    Math.abs(cogY - binCenterY) <= toleranceY;
  
  const binVolume = bin.width * bin.depth * bin.height;
  
  return {
    success: unpackedItems.length === 0,
    packedItems,
    unpackedItems,
    totalVolume: binVolume,
    usedVolume: totalVolume,
    volumeUtilization: (totalVolume / binVolume) * 100,
    totalWeight,
    weightUtilization: (totalWeight / bin.maxWeight) * 100,
    centerOfGravity: { x: cogX, y: cogY, z: cogZ },
    isBalanced,
  };
}

// Optimize delivery sequence based on zones and LIFO loading
function optimizeDeliverySequence(
  orders: { id: number; zone: string | null; zipcode: string }[]
): { id: number; sequence: number }[] {
  // Group by zone
  const zoneOrder = ["Central", "East", "North", "West", "South"];
  
  const sorted = [...orders].sort((a, b) => {
    const zoneA = zoneOrder.indexOf(a.zone || "Central");
    const zoneB = zoneOrder.indexOf(b.zone || "Central");
    
    if (zoneA !== zoneB) return zoneA - zoneB;
    
    // Within same zone, sort by zipcode
    return a.zipcode.localeCompare(b.zipcode);
  });
  
  return sorted.map((order, index) => ({
    id: order.id,
    sequence: index + 1,
  }));
}

export const optimizeRouter = router({
  // Run optimization for selected orders and truck
  run: protectedProcedure
    .input(z.object({
      truckId: z.number(),
      orderIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get truck dimensions
      const truckResult = await db.select().from(trucks).where(eq(trucks.id, input.truckId)).limit(1);
      if (!truckResult[0]) throw new Error("Truck not found");
      
      const truck = truckResult[0];
      const bin: Bin = {
        width: Number(truck.width),
        depth: Number(truck.depth),
        height: Number(truck.height),
        maxWeight: Number(truck.maxWeight),
        items: [],
        usedVolume: 0,
        usedWeight: 0,
      };
      
      // Get all items from selected orders
      const items: Item[] = [];
      const orderData: { id: number; zone: string | null; zipcode: string }[] = [];
      
      for (const orderId of input.orderIds) {
        // Get order info
        const orderResult = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (orderResult[0]) {
          orderData.push({
            id: orderId,
            zone: orderResult[0].deliveryZone,
            zipcode: orderResult[0].zipcode,
          });
        }
        
        // Get order items
        const itemsResult = await db
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
          .where(eq(orderItems.orderId, orderId));
        
        for (const item of itemsResult) {
          // Handle items with missing dimensions
          const length = Number(item.length) || 30;
          const width = Number(item.width) || 30;
          const height = Number(item.height) || 30;
          const weight = Number(item.weight) || 5;
          
          // Add item for each quantity
          for (let i = 0; i < item.quantity; i++) {
            items.push({
              id: item.id,
              orderItemId: item.id,
              orderId: item.orderId,
              name: item.name,
              length,
              width,
              height,
              weight,
              volume: length * width * height,
            });
          }
        }
      }
      
      // Optimize delivery sequence
      const deliverySequence = optimizeDeliverySequence(orderData);
      
      // Run bin packing
      const packingResult = packItems(items, bin);
      
      return {
        ...packingResult,
        deliverySequence,
        truck: {
          id: truck.id,
          name: truck.truckName,
          width: bin.width,
          depth: bin.depth,
          height: bin.height,
          maxWeight: bin.maxWeight,
        },
      };
    }),

  // Create delivery run from optimization result
  createFromOptimization: protectedProcedure
    .input(z.object({
      truckId: z.number(),
      orderIds: z.array(z.number()),
      deliverySequence: z.array(z.object({
        id: z.number(),
        sequence: z.number(),
      })),
      packedItems: z.array(z.object({
        orderItemId: z.number(),
        x: z.number(),
        y: z.number(),
        z: z.number(),
        rotation: z.number(),
      })),
      runDate: z.string(),
      driverId: z.number().optional(),
      helperId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Create delivery run
      const runData: InsertDeliveryRun = {
        runDate: new Date(input.runDate),
        truckId: input.truckId,
        driverId: input.driverId,
        helperId: input.helperId,
        status: "planned",
      };
      
      const runResult = await db.insert(deliveryRuns).values(runData);
      const runId = Number(runResult[0].insertId);
      
      // Add orders with sequence
      for (const seq of input.deliverySequence) {
        const runOrderData: InsertDeliveryRunOrder = {
          deliveryRunId: runId,
          orderId: seq.id,
          sequence: seq.sequence,
        };
        await db.insert(deliveryRunOrders).values(runOrderData);
        
        // Update order status
        await db.update(orders).set({ status: "allocated" }).where(eq(orders.id, seq.id));
      }
      
      // Save load plan
      for (const item of input.packedItems) {
        const loadPlanData: InsertLoadPlanItem = {
          deliveryRunId: runId,
          orderItemId: item.orderItemId,
          positionX: String(item.x),
          positionY: String(item.y),
          positionZ: String(item.z),
          rotation: item.rotation,
        };
        await db.insert(loadPlan).values(loadPlanData);
      }
      
      // Update truck status
      await db.update(trucks).set({ status: "available" }).where(eq(trucks.id, input.truckId));
      
      return { success: true, runId };
    }),

  // Preview optimization without saving
  preview: protectedProcedure
    .input(z.object({
      truckId: z.number(),
      orderIds: z.array(z.number()),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get truck dimensions
      const truckResult = await db.select().from(trucks).where(eq(trucks.id, input.truckId)).limit(1);
      if (!truckResult[0]) throw new Error("Truck not found");
      
      const truck = truckResult[0];
      const bin: Bin = {
        width: Number(truck.width),
        depth: Number(truck.depth),
        height: Number(truck.height),
        maxWeight: Number(truck.maxWeight),
        items: [],
        usedVolume: 0,
        usedWeight: 0,
      };
      
      // Get all items from selected orders
      const items: Item[] = [];
      
      for (const orderId of input.orderIds) {
        const itemsResult = await db
          .select({
            id: orderItems.id,
            orderId: orderItems.orderId,
            name: skus.name,
            length: skus.length,
            width: skus.width,
            height: skus.height,
            weight: skus.weight,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .innerJoin(skus, eq(orderItems.skuId, skus.id))
          .where(eq(orderItems.orderId, orderId));
        
        for (const item of itemsResult) {
          const length = Number(item.length) || 30;
          const width = Number(item.width) || 30;
          const height = Number(item.height) || 30;
          const weight = Number(item.weight) || 5;
          
          for (let i = 0; i < item.quantity; i++) {
            items.push({
              id: item.id,
              orderItemId: item.id,
              orderId: item.orderId,
              name: item.name,
              length,
              width,
              height,
              weight,
              volume: length * width * height,
            });
          }
        }
      }
      
      // Run bin packing
      const packingResult = packItems(items, bin);
      
      return {
        ...packingResult,
        truck: {
          id: truck.id,
          name: truck.truckName,
          width: bin.width,
          depth: bin.depth,
          height: bin.height,
          maxWeight: bin.maxWeight,
        },
      };
    }),
});
