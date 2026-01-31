import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { trucks, skus, personnel } from "../../drizzle/schema";
import * as XLSX from "xlsx";

// Helper to parse Excel/CSV from base64
function parseSpreadsheet(base64Data: string, filename: string): Record<string, unknown>[] {
  // Remove data URL prefix if present
  const base64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const buffer = Buffer.from(base64, "base64");
  
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with header row
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return data as Record<string, unknown>[];
}

// Normalize column names (handle variations)
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(row: Record<string, unknown>, possibleKeys: string[]): unknown {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(key);
    if (possibleKeys.some(pk => normalizedKey.includes(normalizeKey(pk)))) {
      return value;
    }
  }
  return null;
}

export const bulkImportRouter = router({
  // Import trucks from Excel/CSV
  importTrucks: protectedProcedure
    .input(z.object({
      fileData: z.string(), // Base64 encoded file
      filename: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const rows = parseSpreadsheet(input.fileData, input.filename);
      
      if (rows.length === 0) {
        throw new Error("No data found in file");
      }
      
      const imported: string[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 for header row and 1-indexing
        
        try {
          const truckName = findValue(row, ["truckname", "name", "truck"]) as string;
          const width = findValue(row, ["width", "w"]);
          const depth = findValue(row, ["depth", "length", "d", "l"]);
          const height = findValue(row, ["height", "h"]);
          const maxWeight = findValue(row, ["maxweight", "weight", "capacity", "weightcapacity"]);
          const status = findValue(row, ["status"]) as string || "available";
          
          if (!truckName) {
            errors.push(`Row ${rowNum}: Missing truck name`);
            continue;
          }
          
          // Normalize status to valid enum values
          let normalizedStatus: "available" | "on_route" | "in_transit" | "maintenance" = "available";
          if (status) {
            const statusLower = String(status).toLowerCase();
            if (statusLower.includes("route")) normalizedStatus = "on_route";
            else if (statusLower.includes("transit")) normalizedStatus = "in_transit";
            else if (statusLower.includes("maintenance")) normalizedStatus = "maintenance";
          }
          
          await db.insert(trucks).values({
            truckName: String(truckName),
            width: width ? String(width) : "200",
            depth: depth ? String(depth) : "400",
            height: height ? String(height) : "200",
            maxWeight: maxWeight ? String(maxWeight) : "1000",
            status: normalizedStatus,
          });
          
          imported.push(String(truckName));
        } catch (err) {
          errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      
      return {
        success: true,
        imported: imported.length,
        errors: errors.length,
        importedItems: imported,
        errorDetails: errors,
      };
    }),

  // Import SKUs from Excel/CSV
  importSkus: protectedProcedure
    .input(z.object({
      fileData: z.string(),
      filename: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const rows = parseSpreadsheet(input.fileData, input.filename);
      
      if (rows.length === 0) {
        throw new Error("No data found in file");
      }
      
      const imported: string[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        
        try {
          const skuCode = findValue(row, ["skucode", "sku", "code", "productcode", "itemcode"]) as string;
          const name = findValue(row, ["name", "productname", "itemname", "description"]) as string;
          const length = findValue(row, ["length", "l"]);
          const width = findValue(row, ["width", "w"]);
          const height = findValue(row, ["height", "h"]);
          const weight = findValue(row, ["weight", "wt", "kg"]);
          const requiresTwoPeople = findValue(row, ["requirestwoperson", "twoperson", "twoppl", "requireshelper"]);
          
          if (!skuCode && !name) {
            errors.push(`Row ${rowNum}: Missing SKU code and name`);
            continue;
          }
          
          await db.insert(skus).values({
            skuCode: skuCode ? String(skuCode) : `SKU-${Date.now()}-${i}`,
            name: name ? String(name) : String(skuCode),
            length: length ? String(length) : null,
            width: width ? String(width) : null,
            height: height ? String(height) : null,
            weight: weight ? String(weight) : null,
            requiresTwoPeople: requiresTwoPeople === true || requiresTwoPeople === "yes" || requiresTwoPeople === "1" || requiresTwoPeople === 1,
          });
          
          imported.push(String(name || skuCode));
        } catch (err) {
          errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      
      return {
        success: true,
        imported: imported.length,
        errors: errors.length,
        importedItems: imported,
        errorDetails: errors,
      };
    }),

  // Import personnel from Excel/CSV
  importPersonnel: protectedProcedure
    .input(z.object({
      fileData: z.string(),
      filename: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const rows = parseSpreadsheet(input.fileData, input.filename);
      
      if (rows.length === 0) {
        throw new Error("No data found in file");
      }
      
      const imported: string[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        
        try {
          const fullName = findValue(row, ["fullname", "name", "employeename", "worker"]) as string;
          const employeeId = findValue(row, ["employeeid", "id", "empid", "staffid"]) as string;
          const role = findValue(row, ["role", "position", "jobtitle", "type", "personneltype"]) as string;
          const phone = findValue(row, ["phone", "phonenumber", "mobile", "contact"]) as string;
          const status = findValue(row, ["status"]) as string || "available";
          
          if (!fullName) {
            errors.push(`Row ${rowNum}: Missing name`);
            continue;
          }
          
          // Determine role
          let normalizedRole: "driver" | "helper" = "helper";
          if (role) {
            const roleLower = String(role).toLowerCase();
            if (roleLower.includes("driver")) {
              normalizedRole = "driver";
            }
          }
          
          // Normalize status to valid enum values
          let normalizedStatus: "available" | "assigned" | "on_route" | "off_duty" = "available";
          if (status) {
            const statusLower = String(status).toLowerCase();
            if (statusLower.includes("assigned")) normalizedStatus = "assigned";
            else if (statusLower.includes("route")) normalizedStatus = "on_route";
            else if (statusLower.includes("off") || statusLower.includes("leave")) normalizedStatus = "off_duty";
          }
          
          await db.insert(personnel).values({
            employeeId: employeeId ? String(employeeId) : `EMP-${Date.now()}-${i}`,
            fullName: String(fullName),
            personnelType: normalizedRole,
            phone: phone ? String(phone) : null,
            status: normalizedStatus,
          });
          
          imported.push(String(fullName));
        } catch (err) {
          errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      
      return {
        success: true,
        imported: imported.length,
        errors: errors.length,
        importedItems: imported,
        errorDetails: errors,
      };
    }),

  // Import orders from Excel/CSV
  importOrders: protectedProcedure
    .input(z.object({
      fileData: z.string(),
      filename: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const rows = parseSpreadsheet(input.fileData, input.filename);
      
      if (rows.length === 0) {
        throw new Error("No data found in file");
      }
      
      // Import orders - this is more complex as it may need to create order items
      // For now, just return info about what was parsed
      return {
        success: true,
        rowCount: rows.length,
        sampleColumns: rows.length > 0 ? Object.keys(rows[0]) : [],
        message: "Order import requires matching SKUs. Please use the Orders page to add orders with items.",
      };
    }),

  // Get sample template info
  getTemplates: protectedProcedure.query(() => {
    return {
      trucks: {
        columns: ["Truck Name", "Width (cm)", "Depth (cm)", "Height (cm)", "Max Weight (kg)", "Status"],
        sampleRow: ["Truck A", "200", "400", "200", "1000", "available"],
      },
      skus: {
        columns: ["SKU Code", "Name", "Length (cm)", "Width (cm)", "Height (cm)", "Weight (kg)", "Requires Two People"],
        sampleRow: ["SKU001", "Office Chair", "60", "60", "100", "15", "no"],
      },
      personnel: {
        columns: ["Full Name", "Role", "Phone", "Email", "Status"],
        sampleRow: ["John Doe", "driver", "+65 9123 4567", "john@example.com", "available"],
      },
    };
  }),
});
