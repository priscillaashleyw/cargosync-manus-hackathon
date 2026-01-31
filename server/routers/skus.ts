import { z } from "zod";
import { eq, like } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { skus, InsertSku } from "../../drizzle/schema";

const skuSchema = z.object({
  skuCode: z.string().min(1),
  name: z.string().min(1),
  length: z.number().nonnegative().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
  requiresTwoPeople: z.boolean().optional().default(false),
});

export const skusRouter = router({
  // List all SKUs
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.select().from(skus);
    return result;
  }),

  // Get single SKU by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.select().from(skus).where(eq(skus.id, input.id)).limit(1);
      return result[0] || null;
    }),

  // Search SKUs by name
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.select().from(skus).where(like(skus.name, `%${input.query}%`));
      return result;
    }),

  // Create new SKU
  create: protectedProcedure
    .input(skuSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const insertData: InsertSku = {
        skuCode: input.skuCode,
        name: input.name,
        length: input.length !== undefined ? String(input.length) : null,
        width: input.width !== undefined ? String(input.width) : null,
        height: input.height !== undefined ? String(input.height) : null,
        weight: input.weight !== undefined ? String(input.weight) : null,
        requiresTwoPeople: input.requiresTwoPeople,
      };
      
      await db.insert(skus).values(insertData);
      return { success: true };
    }),

  // Update SKU
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: skuSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const updateData: Partial<InsertSku> = {};
      if (input.data.skuCode) updateData.skuCode = input.data.skuCode;
      if (input.data.name) updateData.name = input.data.name;
      if (input.data.length !== undefined) updateData.length = String(input.data.length);
      if (input.data.width !== undefined) updateData.width = String(input.data.width);
      if (input.data.height !== undefined) updateData.height = String(input.data.height);
      if (input.data.weight !== undefined) updateData.weight = String(input.data.weight);
      if (input.data.requiresTwoPeople !== undefined) updateData.requiresTwoPeople = input.data.requiresTwoPeople;
      
      await db.update(skus).set(updateData).where(eq(skus.id, input.id));
      return { success: true };
    }),

  // Delete SKU
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.delete(skus).where(eq(skus.id, input.id));
      return { success: true };
    }),
});
