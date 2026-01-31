#!/usr/bin/env node
/**
 * Data Import Script
 * Imports truck, order, and SKU data from the truckingorders.xlsx file
 */

import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2/promise";
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Singapore zipcode to zone mapping (approximate based on postal districts)
function getZoneFromZipcode(zipcode) {
  const zip = String(zipcode).padStart(6, "0");
  const prefix = parseInt(zip.substring(0, 2));
  
  // Singapore postal district mapping
  if (prefix >= 1 && prefix <= 6) return "Central";
  if (prefix >= 7 && prefix <= 8) return "Central";
  if (prefix >= 9 && prefix <= 10) return "Central";
  if (prefix >= 11 && prefix <= 13) return "Central";
  if (prefix >= 14 && prefix <= 16) return "Central";
  if (prefix === 17) return "Central";
  if (prefix >= 18 && prefix <= 19) return "East";
  if (prefix >= 20 && prefix <= 21) return "Central";
  if (prefix >= 22 && prefix <= 23) return "West";
  if (prefix >= 24 && prefix <= 27) return "North";
  if (prefix >= 28 && prefix <= 30) return "North";
  if (prefix >= 31 && prefix <= 33) return "East";
  if (prefix >= 34 && prefix <= 37) return "East";
  if (prefix >= 38 && prefix <= 41) return "East";
  if (prefix >= 42 && prefix <= 45) return "East";
  if (prefix >= 46 && prefix <= 48) return "East";
  if (prefix >= 49 && prefix <= 51) return "East";
  if (prefix >= 52 && prefix <= 53) return "East";
  if (prefix >= 54 && prefix <= 57) return "North";
  if (prefix >= 58 && prefix <= 59) return "Central";
  if (prefix >= 60 && prefix <= 64) return "West";
  if (prefix >= 65 && prefix <= 68) return "West";
  if (prefix >= 69 && prefix <= 71) return "West";
  if (prefix >= 72 && prefix <= 73) return "North";
  if (prefix >= 75 && prefix <= 76) return "North";
  if (prefix >= 77 && prefix <= 78) return "North";
  if (prefix >= 79 && prefix <= 80) return "North";
  if (prefix >= 81 && prefix <= 82) return "East";
  
  // Default to Central for unknown
  return "Central";
}

async function importData() {
  console.log("Starting data import...");
  
  // Connect to database
  const connection = await createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);
  
  // Read Excel file
  const workbook = XLSX.readFile(join(__dirname, "../../upload/truckingorders.xlsx"));
  
  // Import Trucks
  console.log("\n1. Importing trucks...");
  const trucksSheet = workbook.Sheets["Truck"];
  const trucksData = XLSX.utils.sheet_to_json(trucksSheet);
  
  console.log("  Raw trucks data:", JSON.stringify(trucksData, null, 2));
  
  for (const row of trucksData) {
    const truckName = row["Unnamed: 0"] || row["__EMPTY"] || `Truck ${trucksData.indexOf(row) + 1}`;
    const width = row.width || row.Width || 0;
    const depth = row.depth || row.Depth || 0;
    const height = row.height || row.Height || 0;
    
    if (!truckName || width === 0 || depth === 0 || height === 0) {
      console.log(`  ⚠ Skipping invalid row:`, row);
      continue;
    }
    
    await connection.execute(
      `INSERT INTO trucks (truckName, width, depth, height, maxWeight, status) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE width=VALUES(width), depth=VALUES(depth), height=VALUES(height)`,
      [String(truckName), Number(width), Number(depth), Number(height), 1000, "available"]
    );
    console.log(`  ✓ Imported ${truckName}`);
  }
  
  // Import SKUs (Products)
  console.log("\n2. Importing SKUs...");
  const productsSheet = workbook.Sheets["Orders Products"];
  const productsData = XLSX.utils.sheet_to_json(productsSheet);
  
  // Get unique products
  const uniqueProducts = new Map();
  for (const row of productsData) {
    const partName = row.PARTNAME;
    if (!uniqueProducts.has(partName)) {
      uniqueProducts.set(partName, {
        name: partName,
        length: row.LENGTH || 0,
        width: row.WIDTH || 0,
        height: row.HEIGHT || 0,
        weight: row.Weight || 0,
      });
    }
  }
  
  for (const [name, product] of uniqueProducts) {
    const skuCode = name.replace(/\s+/g, "-").toUpperCase();
    // Determine if heavy item (needs 2 people) - threshold: 50kg
    const requiresTwoPeople = product.weight >= 50;
    
    await connection.execute(
      `INSERT INTO skus (skuCode, name, length, width, height, weight, requiresTwoPeople) 
       VALUES (?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE name=VALUES(name), length=VALUES(length), width=VALUES(width), height=VALUES(height), weight=VALUES(weight)`,
      [skuCode, name, product.length, product.width, product.height, product.weight, requiresTwoPeople]
    );
    console.log(`  ✓ Imported SKU: ${name}`);
  }
  
  // Import Orders
  console.log("\n3. Importing orders...");
  const ordersSheet = workbook.Sheets["Orders"];
  const ordersData = XLSX.utils.sheet_to_json(ordersSheet);
  
  for (const row of ordersData) {
    const orderNumber = String(row.orderid);
    const zipcode = String(row.ZIPCODE);
    const zone = getZoneFromZipcode(zipcode);
    
    await connection.execute(
      `INSERT INTO orders (orderNumber, zipcode, deliveryZone, status) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE zipcode=VALUES(zipcode), deliveryZone=VALUES(deliveryZone)`,
      [orderNumber, zipcode, zone, "pending"]
    );
    console.log(`  ✓ Imported Order: ${orderNumber} (Zone: ${zone})`);
  }
  
  // Import Order Items
  console.log("\n4. Importing order items...");
  
  // Get SKU ID mapping
  const [skuRows] = await connection.execute("SELECT id, skuCode FROM skus");
  const skuMap = new Map();
  for (const row of skuRows) {
    skuMap.set(row.skuCode, row.id);
  }
  
  // Get Order ID mapping
  const [orderRows] = await connection.execute("SELECT id, orderNumber FROM orders");
  const orderMap = new Map();
  for (const row of orderRows) {
    orderMap.set(row.orderNumber, row.id);
  }
  
  for (const row of productsData) {
    const orderNumber = String(row.OrderId);
    const partName = row.PARTNAME;
    const skuCode = partName.replace(/\s+/g, "-").toUpperCase();
    
    const orderId = orderMap.get(orderNumber);
    const skuId = skuMap.get(skuCode);
    
    if (orderId && skuId) {
      await connection.execute(
        `INSERT INTO order_items (orderId, skuId, quantity) VALUES (?, ?, ?)`,
        [orderId, skuId, 1]
      );
      console.log(`  ✓ Linked ${partName} to Order ${orderNumber}`);
    }
  }
  
  // Import sample personnel
  console.log("\n5. Creating sample personnel...");
  const samplePersonnel = [
    { employeeId: "DRV001", fullName: "Ahmad bin Hassan", phone: "+65 9123 4567", type: "driver" },
    { employeeId: "DRV002", fullName: "Kumar Rajan", phone: "+65 9234 5678", type: "driver" },
    { employeeId: "DRV003", fullName: "Tan Wei Ming", phone: "+65 9345 6789", type: "driver" },
    { employeeId: "HLP001", fullName: "Mohammad Ali", phone: "+65 9456 7890", type: "helper" },
    { employeeId: "HLP002", fullName: "Lee Jia Wei", phone: "+65 9567 8901", type: "helper" },
  ];
  
  for (const person of samplePersonnel) {
    await connection.execute(
      `INSERT INTO personnel (employeeId, fullName, phone, personnelType, status) 
       VALUES (?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE fullName=VALUES(fullName), phone=VALUES(phone)`,
      [person.employeeId, person.fullName, person.phone, person.type, "available"]
    );
    console.log(`  ✓ Created ${person.type}: ${person.fullName}`);
  }
  
  // Import zipcode zones
  console.log("\n6. Creating zipcode zone mappings...");
  const uniqueZipcodes = new Set();
  for (const row of ordersData) {
    uniqueZipcodes.add(String(row.ZIPCODE));
  }
  
  for (const zipcode of uniqueZipcodes) {
    const zone = getZoneFromZipcode(zipcode);
    await connection.execute(
      `INSERT INTO zipcode_zones (zipcode, zone) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE zone=VALUES(zone)`,
      [zipcode, zone]
    );
  }
  console.log(`  ✓ Created ${uniqueZipcodes.size} zipcode mappings`);
  
  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(50));
  
  const [truckCount] = await connection.execute("SELECT COUNT(*) as count FROM trucks");
  const [skuCount] = await connection.execute("SELECT COUNT(*) as count FROM skus");
  const [orderCount] = await connection.execute("SELECT COUNT(*) as count FROM orders");
  const [orderItemCount] = await connection.execute("SELECT COUNT(*) as count FROM order_items");
  const [personnelCount] = await connection.execute("SELECT COUNT(*) as count FROM personnel");
  
  console.log(`Trucks: ${truckCount[0].count}`);
  console.log(`SKUs: ${skuCount[0].count}`);
  console.log(`Orders: ${orderCount[0].count}`);
  console.log(`Order Items: ${orderItemCount[0].count}`);
  console.log(`Personnel: ${personnelCount[0].count}`);
  console.log("=".repeat(50));
  
  await connection.end();
  console.log("\n✅ Data import completed successfully!");
}

importData().catch(console.error);
