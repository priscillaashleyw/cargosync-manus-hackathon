import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { personnel, InsertPersonnel } from "../../drizzle/schema";

const personnelSchema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  personnelType: z.enum(["driver", "helper"]).default("driver"),
  status: z.enum(["available", "assigned", "on_route", "off_duty"]).optional().default("available"),
});

export const personnelRouter = router({
  // List all personnel
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(personnel);
    return result;
  }),

  // Get single personnel by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.select().from(personnel).where(eq(personnel.id, input.id)).limit(1);
      return result[0] || null;
    }),

  // Get available personnel
  available: protectedProcedure
    .input(z.object({ type: z.enum(["driver", "helper"]).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let query = db.select().from(personnel).where(eq(personnel.status, "available"));
      
      const result = await query;
      
      if (input.type) {
        return result.filter(p => p.personnelType === input.type);
      }
      return result;
    }),

  // Get drivers
  drivers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(personnel).where(eq(personnel.personnelType, "driver"));
    return result;
  }),

  // Get helpers
  helpers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(personnel).where(eq(personnel.personnelType, "helper"));
    return result;
  }),

  // Create new personnel
  create: protectedProcedure
    .input(personnelSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const insertData: InsertPersonnel = {
        employeeId: input.employeeId,
        fullName: input.fullName,
        phone: input.phone,
        personnelType: input.personnelType,
        status: input.status,
      };
      
      await db.insert(personnel).values(insertData);
      return { success: true };
    }),

  // Update personnel
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: personnelSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const updateData: Partial<InsertPersonnel> = {};
      if (input.data.employeeId) updateData.employeeId = input.data.employeeId;
      if (input.data.fullName) updateData.fullName = input.data.fullName;
      if (input.data.phone !== undefined) updateData.phone = input.data.phone;
      if (input.data.personnelType) updateData.personnelType = input.data.personnelType;
      if (input.data.status) updateData.status = input.data.status;
      
      await db.update(personnel).set(updateData).where(eq(personnel.id, input.id));
      return { success: true };
    }),

  // Delete personnel
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.delete(personnel).where(eq(personnel.id, input.id));
      return { success: true };
    }),

  // Update personnel status
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["available", "assigned", "on_route", "off_duty"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(personnel).set({ status: input.status }).where(eq(personnel.id, input.id));
      return { success: true };
    }),
});
