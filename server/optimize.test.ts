import { describe, expect, it } from "vitest";

// Test the bin packing algorithm logic
describe("3D Bin Packing Algorithm", () => {
  // Helper function to simulate the bin packing algorithm
  function packItems(
    truckDimensions: { width: number; depth: number; height: number; maxWeight: number },
    items: Array<{ id: number; length: number; width: number; height: number; weight: number }>
  ) {
    const packed: Array<{
      id: number;
      x: number;
      y: number;
      z: number;
      rotatedLength: number;
      rotatedWidth: number;
      height: number;
      weight: number;
    }> = [];
    const unpacked: number[] = [];
    
    // Sort items by volume (largest first)
    const sortedItems = [...items].sort((a, b) => {
      const volA = a.length * a.width * a.height;
      const volB = b.length * b.width * b.height;
      return volB - volA;
    });
    
    // Simple layer-based packing
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let layerHeight = 0;
    let rowWidth = 0;
    let totalWeight = 0;
    
    for (const item of sortedItems) {
      // Check weight constraint
      if (totalWeight + item.weight > truckDimensions.maxWeight) {
        unpacked.push(item.id);
        continue;
      }
      
      // Try to fit in current position
      let placed = false;
      
      // Try original orientation
      if (currentX + item.length <= truckDimensions.width &&
          currentY + item.width <= truckDimensions.depth &&
          currentZ + item.height <= truckDimensions.height) {
        packed.push({
          id: item.id,
          x: currentX,
          y: currentY,
          z: currentZ,
          rotatedLength: item.length,
          rotatedWidth: item.width,
          height: item.height,
          weight: item.weight,
        });
        currentX += item.length;
        layerHeight = Math.max(layerHeight, item.height);
        rowWidth = Math.max(rowWidth, item.width);
        totalWeight += item.weight;
        placed = true;
      }
      // Try rotated orientation
      else if (currentX + item.width <= truckDimensions.width &&
               currentY + item.length <= truckDimensions.depth &&
               currentZ + item.height <= truckDimensions.height) {
        packed.push({
          id: item.id,
          x: currentX,
          y: currentY,
          z: currentZ,
          rotatedLength: item.width,
          rotatedWidth: item.length,
          height: item.height,
          weight: item.weight,
        });
        currentX += item.width;
        layerHeight = Math.max(layerHeight, item.height);
        rowWidth = Math.max(rowWidth, item.length);
        totalWeight += item.weight;
        placed = true;
      }
      // Start new row
      else if (currentY + rowWidth + item.width <= truckDimensions.depth) {
        currentX = 0;
        currentY += rowWidth;
        rowWidth = 0;
        
        if (currentX + item.length <= truckDimensions.width &&
            currentZ + item.height <= truckDimensions.height) {
          packed.push({
            id: item.id,
            x: currentX,
            y: currentY,
            z: currentZ,
            rotatedLength: item.length,
            rotatedWidth: item.width,
            height: item.height,
            weight: item.weight,
          });
          currentX += item.length;
          layerHeight = Math.max(layerHeight, item.height);
          rowWidth = Math.max(rowWidth, item.width);
          totalWeight += item.weight;
          placed = true;
        }
      }
      // Start new layer
      else if (currentZ + layerHeight + item.height <= truckDimensions.height) {
        currentX = 0;
        currentY = 0;
        currentZ += layerHeight;
        layerHeight = 0;
        rowWidth = 0;
        
        if (currentX + item.length <= truckDimensions.width &&
            currentY + item.width <= truckDimensions.depth) {
          packed.push({
            id: item.id,
            x: currentX,
            y: currentY,
            z: currentZ,
            rotatedLength: item.length,
            rotatedWidth: item.width,
            height: item.height,
            weight: item.weight,
          });
          currentX += item.length;
          layerHeight = Math.max(layerHeight, item.height);
          rowWidth = Math.max(rowWidth, item.width);
          totalWeight += item.weight;
          placed = true;
        }
      }
      
      if (!placed) {
        unpacked.push(item.id);
      }
    }
    
    return { packed, unpacked, totalWeight };
  }

  it("should pack items that fit within truck dimensions", () => {
    const truck = { width: 200, depth: 400, height: 200, maxWeight: 1000 };
    const items = [
      { id: 1, length: 50, width: 50, height: 50, weight: 10 },
      { id: 2, length: 50, width: 50, height: 50, weight: 10 },
      { id: 3, length: 50, width: 50, height: 50, weight: 10 },
    ];
    
    const result = packItems(truck, items);
    
    expect(result.packed.length).toBe(3);
    expect(result.unpacked.length).toBe(0);
    expect(result.totalWeight).toBe(30);
  });

  it("should reject items that exceed truck dimensions", () => {
    const truck = { width: 100, depth: 100, height: 100, maxWeight: 1000 };
    const items = [
      { id: 1, length: 150, width: 50, height: 50, weight: 10 }, // Too long
    ];
    
    const result = packItems(truck, items);
    
    expect(result.packed.length).toBe(0);
    expect(result.unpacked.length).toBe(1);
  });

  it("should respect weight constraints", () => {
    const truck = { width: 200, depth: 400, height: 200, maxWeight: 25 };
    const items = [
      { id: 1, length: 50, width: 50, height: 50, weight: 10 },
      { id: 2, length: 50, width: 50, height: 50, weight: 10 },
      { id: 3, length: 50, width: 50, height: 50, weight: 10 }, // Exceeds weight
    ];
    
    const result = packItems(truck, items);
    
    expect(result.packed.length).toBe(2);
    expect(result.unpacked.length).toBe(1);
    expect(result.totalWeight).toBeLessThanOrEqual(25);
  });

  it("should calculate correct positions for packed items", () => {
    const truck = { width: 200, depth: 400, height: 200, maxWeight: 1000 };
    const items = [
      { id: 1, length: 100, width: 100, height: 50, weight: 10 },
      { id: 2, length: 100, width: 100, height: 50, weight: 10 },
    ];
    
    const result = packItems(truck, items);
    
    expect(result.packed.length).toBe(2);
    // First item at origin
    expect(result.packed[0].x).toBe(0);
    expect(result.packed[0].y).toBe(0);
    expect(result.packed[0].z).toBe(0);
    // Second item next to first
    expect(result.packed[1].x).toBe(100);
    expect(result.packed[1].y).toBe(0);
    expect(result.packed[1].z).toBe(0);
  });

  it("should handle empty items list", () => {
    const truck = { width: 200, depth: 400, height: 200, maxWeight: 1000 };
    const items: Array<{ id: number; length: number; width: number; height: number; weight: number }> = [];
    
    const result = packItems(truck, items);
    
    expect(result.packed.length).toBe(0);
    expect(result.unpacked.length).toBe(0);
    expect(result.totalWeight).toBe(0);
  });
});

describe("Center of Gravity Calculation", () => {
  function calculateCenterOfGravity(
    items: Array<{ x: number; y: number; z: number; length: number; width: number; height: number; weight: number }>
  ) {
    if (items.length === 0) {
      return { x: 0, y: 0, z: 0 };
    }
    
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;
    
    for (const item of items) {
      const centerX = item.x + item.length / 2;
      const centerY = item.y + item.width / 2;
      const centerZ = item.z + item.height / 2;
      
      weightedX += centerX * item.weight;
      weightedY += centerY * item.weight;
      weightedZ += centerZ * item.weight;
      totalWeight += item.weight;
    }
    
    return {
      x: weightedX / totalWeight,
      y: weightedY / totalWeight,
      z: weightedZ / totalWeight,
    };
  }

  it("should calculate center of gravity for single item", () => {
    const items = [
      { x: 0, y: 0, z: 0, length: 100, width: 100, height: 50, weight: 10 },
    ];
    
    const cog = calculateCenterOfGravity(items);
    
    expect(cog.x).toBe(50);
    expect(cog.y).toBe(50);
    expect(cog.z).toBe(25);
  });

  it("should calculate weighted center of gravity for multiple items", () => {
    const items = [
      { x: 0, y: 0, z: 0, length: 100, width: 100, height: 50, weight: 10 },
      { x: 100, y: 0, z: 0, length: 100, width: 100, height: 50, weight: 10 },
    ];
    
    const cog = calculateCenterOfGravity(items);
    
    // Center should be between the two items
    expect(cog.x).toBe(100);
    expect(cog.y).toBe(50);
    expect(cog.z).toBe(25);
  });

  it("should weight heavier items more in center calculation", () => {
    const items = [
      { x: 0, y: 0, z: 0, length: 100, width: 100, height: 50, weight: 30 }, // Heavy
      { x: 100, y: 0, z: 0, length: 100, width: 100, height: 50, weight: 10 }, // Light
    ];
    
    const cog = calculateCenterOfGravity(items);
    
    // Center should be closer to the heavier item
    expect(cog.x).toBeLessThan(100);
    expect(cog.x).toBeGreaterThan(50);
  });

  it("should return zero for empty items", () => {
    const items: Array<{ x: number; y: number; z: number; length: number; width: number; height: number; weight: number }> = [];
    
    const cog = calculateCenterOfGravity(items);
    
    expect(cog.x).toBe(0);
    expect(cog.y).toBe(0);
    expect(cog.z).toBe(0);
  });
});

describe("Load Balance Check", () => {
  function isLoadBalanced(
    centerOfGravity: { x: number; y: number },
    truckDimensions: { width: number; depth: number }
  ) {
    const centerX = truckDimensions.width / 2;
    const centerY = truckDimensions.depth / 2;
    const toleranceX = truckDimensions.width * 0.3;
    const toleranceY = truckDimensions.depth * 0.3;
    
    return (
      Math.abs(centerOfGravity.x - centerX) <= toleranceX &&
      Math.abs(centerOfGravity.y - centerY) <= toleranceY
    );
  }

  it("should return true for centered load", () => {
    const cog = { x: 100, y: 200 };
    const truck = { width: 200, depth: 400 };
    
    expect(isLoadBalanced(cog, truck)).toBe(true);
  });

  it("should return true for load within tolerance", () => {
    const cog = { x: 120, y: 220 }; // Slightly off-center
    const truck = { width: 200, depth: 400 };
    
    expect(isLoadBalanced(cog, truck)).toBe(true);
  });

  it("should return false for unbalanced load", () => {
    const cog = { x: 10, y: 10 }; // Far from center
    const truck = { width: 200, depth: 400 };
    
    expect(isLoadBalanced(cog, truck)).toBe(false);
  });
});
