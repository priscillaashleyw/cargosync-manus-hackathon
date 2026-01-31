/**
 * Geocode Singapore postal codes using OneMap API
 * This script fetches lat/lng for all unique zipcodes in the orders table
 */

import mysql from 'mysql2/promise';

// OneMap API endpoint (no auth required for basic search)
const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;

async function geocodePostalCode(postalCode) {
  try {
    const url = `${ONEMAP_SEARCH_URL}?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.log(`  API returned ${response.status} for ${postalCode}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.found > 0 && data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        latitude: parseFloat(result.LATITUDE),
        longitude: parseFloat(result.LONGITUDE),
        address: result.ADDRESS,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`  Error geocoding ${postalCode}:`, error.message);
    return null;
  }
}

// Fallback coordinates based on zone centroids
const ZONE_FALLBACK = {
  North: { latitude: 1.4270, longitude: 103.8350 },
  South: { latitude: 1.2700, longitude: 103.8200 },
  East: { latitude: 1.3400, longitude: 103.9500 },
  West: { latitude: 1.3500, longitude: 103.7000 },
  Central: { latitude: 1.3000, longitude: 103.8500 },
};

async function main() {
  console.log('Starting geocoding process...\n');
  
  // Connect to database
  const connection = await mysql.createConnection(DATABASE_URL);
  console.log('Connected to database\n');
  
  // Get all unique zipcodes from orders
  const [orders] = await connection.execute(
    'SELECT DISTINCT id, zipcode, deliveryZone FROM orders WHERE latitude IS NULL OR longitude IS NULL ORDER BY id'
  );
  
  console.log(`Found ${orders.length} orders without coordinates\n`);
  
  // Also get orders with coordinates to update all
  const [allOrders] = await connection.execute(
    'SELECT id, zipcode, deliveryZone FROM orders ORDER BY id'
  );
  
  console.log(`Total orders to process: ${allOrders.length}\n`);
  
  // Cache for already geocoded zipcodes
  const geocodeCache = new Map();
  
  let successCount = 0;
  let fallbackCount = 0;
  let failCount = 0;
  
  for (const order of allOrders) {
    const { id, zipcode, deliveryZone } = order;
    
    // Check cache first
    if (geocodeCache.has(zipcode)) {
      const cached = geocodeCache.get(zipcode);
      await connection.execute(
        'UPDATE orders SET latitude = ?, longitude = ? WHERE id = ?',
        [cached.latitude, cached.longitude, id]
      );
      console.log(`[${id}] ${zipcode} -> ${cached.latitude}, ${cached.longitude} (cached)`);
      successCount++;
      continue;
    }
    
    // Try OneMap API
    console.log(`[${id}] Geocoding ${zipcode}...`);
    const result = await geocodePostalCode(zipcode);
    
    if (result) {
      geocodeCache.set(zipcode, result);
      await connection.execute(
        'UPDATE orders SET latitude = ?, longitude = ? WHERE id = ?',
        [result.latitude, result.longitude, id]
      );
      console.log(`  -> ${result.latitude}, ${result.longitude}`);
      successCount++;
    } else {
      // Use zone fallback
      const zone = deliveryZone || 'Central';
      const fallback = ZONE_FALLBACK[zone];
      
      // Add small random offset to prevent all fallbacks being at exact same point
      const latOffset = (Math.random() - 0.5) * 0.02;
      const lonOffset = (Math.random() - 0.5) * 0.02;
      
      const lat = fallback.latitude + latOffset;
      const lon = fallback.longitude + lonOffset;
      
      geocodeCache.set(zipcode, { latitude: lat, longitude: lon });
      await connection.execute(
        'UPDATE orders SET latitude = ?, longitude = ? WHERE id = ?',
        [lat, lon, id]
      );
      console.log(`  -> ${lat.toFixed(6)}, ${lon.toFixed(6)} (fallback: ${zone})`);
      fallbackCount++;
    }
    
    // Rate limiting - wait 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n--- Summary ---');
  console.log(`Successfully geocoded: ${successCount}`);
  console.log(`Used fallback: ${fallbackCount}`);
  console.log(`Failed: ${failCount}`);
  
  await connection.end();
  console.log('\nDone!');
}

main().catch(console.error);
