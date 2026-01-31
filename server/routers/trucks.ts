import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { trucks, InsertTruck } from "../../drizzle/schema";

const truckSchema = z.object({
  truckName: z.string().min(1),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  maxWeight: z.number().positive().optional().default(1000),
  status: z.enum(["available", "in_transit", "maintenance"]).optional().default("available"),
});

export const trucksRouter = router({
  // List all trucks
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(trucks);
    return result;
  }),

  // Get single truck by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.select().from(trucks).where(eq(trucks.id, input.id)).limit(1);
      return result[0] || null;
    }),

  // Create new truck
  create: protectedProcedure
    .input(truckSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const insertData: InsertTruck = {
        truckName: input.truckName,
        width: String(input.width),
        depth: String(input.depth),
        height: String(input.height),
        maxWeight: String(input.maxWeight),
        status: input.status,
      };
      
      await db.insert(trucks).values(insertData);
      return { success: true };
    }),

  // Update truck
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: truckSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const updateData: Partial<InsertTruck> = {};
      if (input.data.truckName) updateData.truckName = input.data.truckName;
      if (input.data.width) updateData.width = String(input.data.width);
      if (input.data.depth) updateData.depth = String(input.data.depth);
      if (input.data.height) updateData.height = String(input.data.height);
      if (input.data.maxWeight) updateData.maxWeight = String(input.data.maxWeight);
      if (input.data.status) updateData.status = input.data.status;
      
      await db.update(trucks).set(updateData).where(eq(trucks.id, input.id));
      return { success: true };
    }),

  // Delete truck
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.delete(trucks).where(eq(trucks.id, input.id));
      return { success: true };
    }),

  // Update truck status
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["available", "in_transit", "maintenance"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(trucks).set({ status: input.status }).where(eq(trucks.id, input.id));
      return { success: true };
    }),
});
