// Logistics configuration constants

// Default depot location - Tuas, Singapore
export const DEPOT: {
  name: string;
  address: string;
  zipcode: string;
  latitude: number;
  longitude: number;
} = {
  name: "Tuas Depot",
  address: "Tuas, Singapore 639405",
  zipcode: "639405",
  latitude: 1.3187,
  longitude: 103.6390,
};

// Zone definitions with approximate center coordinates
export const ZONES = {
  North: { latitude: 1.4320, longitude: 103.7860, color: "#3b82f6" },
  South: { latitude: 1.2700, longitude: 103.8200, color: "#22c55e" },
  East: { latitude: 1.3500, longitude: 103.9400, color: "#f59e0b" },
  West: { latitude: 1.3500, longitude: 103.7000, color: "#8b5cf6" },
  Central: { latitude: 1.3000, longitude: 103.8500, color: "#ef4444" },
} as const;

// Helper requirement options
export const HELPER_OPTIONS = {
  none: { label: "No Helper", count: 0 },
  one: { label: "1 Helper", count: 1 },
  two: { label: "2 Helpers", count: 2 },
} as const;

// Load placement sections
export const PLACEMENT_SECTIONS = {
  front: { label: "Front", description: "Near cab, load last, unload first" },
  middle: { label: "Middle", description: "Center of truck" },
  back: { label: "Back", description: "Near door, load first, unload last" },
} as const;

// Unit standards
export const UNITS = {
  dimensions: "cm", // All dimensions in centimeters
  weight: "kg",     // All weights in kilograms
  volume: "m³",     // Display volume in cubic meters
} as const;

// Validation limits
export const VALIDATION = {
  minDimension: 1,      // Minimum 1 cm
  maxDimension: 10000,  // Maximum 100 meters
  minWeight: 0.01,      // Minimum 10 grams
  maxWeight: 50000,     // Maximum 50 tons
} as const;
