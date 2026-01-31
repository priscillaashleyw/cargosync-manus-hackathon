import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html, Grid } from "@react-three/drei";
import { useState, useMemo, useRef } from "react";
import * as THREE from "three";

interface PackedItem {
  id: number;
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
}

interface TruckVisualizationProps {
  truck: {
    width: number;
    depth: number;
    height: number;
    name: string;
  };
  packedItems: PackedItem[];
  centerOfGravity?: { x: number; y: number; z: number };
}

// Generate distinct colors for different orders
function getOrderColor(orderId: number): string {
  const colors = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#84cc16", // lime
    "#6366f1", // indigo
  ];
  return colors[orderId % colors.length];
}

// Item box component
function ItemBox({ 
  item, 
  scale,
  onHover,
  onLeave,
  isHovered,
}: { 
  item: PackedItem;
  scale: number;
  onHover: () => void;
  onLeave: () => void;
  isHovered: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = getOrderColor(item.orderId);
  
  // Scale positions and dimensions
  const position: [number, number, number] = [
    (item.x + item.rotatedLength / 2) * scale,
    (item.z + item.height / 2) * scale,
    (item.y + item.rotatedWidth / 2) * scale,
  ];
  
  const size: [number, number, number] = [
    item.rotatedLength * scale,
    item.height * scale,
    item.rotatedWidth * scale,
  ];

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover();
      }}
      onPointerOut={onLeave}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={isHovered ? 1 : 0.85}
        emissive={isHovered ? color : "#000000"}
        emissiveIntensity={isHovered ? 0.3 : 0}
      />
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color="#000000" linewidth={1} />
      </lineSegments>
      {isHovered && (
        <Html
          position={[0, size[1] / 2 + 0.3, 0]}
          center
          style={{
            background: "rgba(0,0,0,0.85)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <div>
            <strong>{item.name}</strong>
            <br />
            Order #{item.orderId}
            <br />
            {item.rotatedLength}×{item.rotatedWidth}×{item.height}cm
            <br />
            {item.weight}kg
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Truck container wireframe
function TruckContainer({ 
  width, 
  depth, 
  height, 
  scale 
}: { 
  width: number; 
  depth: number; 
  height: number;
  scale: number;
}) {
  const scaledWidth = width * scale;
  const scaledDepth = depth * scale;
  const scaledHeight = height * scale;
  
  // Create wireframe box for truck container
  const points = useMemo(() => {
    return [
      // Bottom face
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(scaledWidth, 0, 0),
      new THREE.Vector3(scaledWidth, 0, scaledDepth),
      new THREE.Vector3(0, 0, scaledDepth),
      new THREE.Vector3(0, 0, 0),
      // Up to top
      new THREE.Vector3(0, scaledHeight, 0),
      // Top face
      new THREE.Vector3(scaledWidth, scaledHeight, 0),
      new THREE.Vector3(scaledWidth, scaledHeight, scaledDepth),
      new THREE.Vector3(0, scaledHeight, scaledDepth),
      new THREE.Vector3(0, scaledHeight, 0),
    ];
  }, [scaledWidth, scaledDepth, scaledHeight]);

  const verticalLines = useMemo(() => {
    return [
      [new THREE.Vector3(scaledWidth, 0, 0), new THREE.Vector3(scaledWidth, scaledHeight, 0)],
      [new THREE.Vector3(scaledWidth, 0, scaledDepth), new THREE.Vector3(scaledWidth, scaledHeight, scaledDepth)],
      [new THREE.Vector3(0, 0, scaledDepth), new THREE.Vector3(0, scaledHeight, scaledDepth)],
    ];
  }, [scaledWidth, scaledDepth, scaledHeight]);

  return (
    <group>
      {/* Main wireframe */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(points.flatMap(p => [p.x, p.y, p.z])), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#374151" linewidth={2} />
      </line>
      
      {/* Vertical lines */}
      {verticalLines.map((line, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(line.flatMap(p => [p.x, p.y, p.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#374151" linewidth={2} />
        </line>
      ))}
      
      {/* Floor plane */}
      <mesh position={[scaledWidth / 2, 0.001, scaledDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[scaledWidth, scaledDepth]} />
        <meshStandardMaterial color="#f3f4f6" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Center of gravity marker
function CenterOfGravityMarker({ 
  position, 
  scale,
  truckWidth,
  truckDepth,
}: { 
  position: { x: number; y: number; z: number };
  scale: number;
  truckWidth: number;
  truckDepth: number;
}) {
  const scaledPosition: [number, number, number] = [
    position.x * scale,
    position.z * scale,
    position.y * scale,
  ];
  
  // Check if balanced (within middle 60%)
  const centerX = truckWidth / 2;
  const centerY = truckDepth / 2;
  const toleranceX = truckWidth * 0.3;
  const toleranceY = truckDepth * 0.3;
  
  const isBalanced = 
    Math.abs(position.x - centerX) <= toleranceX &&
    Math.abs(position.y - centerY) <= toleranceY;

  return (
    <group position={scaledPosition}>
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial 
          color={isBalanced ? "#22c55e" : "#ef4444"} 
          emissive={isBalanced ? "#22c55e" : "#ef4444"}
          emissiveIntensity={0.5}
        />
      </mesh>
      <Html
        position={[0, 0.4, 0]}
        center
        style={{
          background: isBalanced ? "rgba(34, 197, 94, 0.9)" : "rgba(239, 68, 68, 0.9)",
          color: "white",
          padding: "4px 8px",
          borderRadius: "4px",
          fontSize: "10px",
          whiteSpace: "nowrap",
        }}
      >
        CoG {isBalanced ? "✓" : "⚠"}
      </Html>
    </group>
  );
}

// Scene component
function Scene({ 
  truck, 
  packedItems, 
  centerOfGravity,
  scale,
}: TruckVisualizationProps & { scale: number }) {
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-10, 10, -5]} intensity={0.4} />
      
      <TruckContainer 
        width={truck.width} 
        depth={truck.depth} 
        height={truck.height} 
        scale={scale}
      />
      
      {packedItems.map((item) => (
        <ItemBox
          key={`${item.orderItemId}-${item.x}-${item.y}-${item.z}`}
          item={item}
          scale={scale}
          onHover={() => setHoveredItem(item.orderItemId)}
          onLeave={() => setHoveredItem(null)}
          isHovered={hoveredItem === item.orderItemId}
        />
      ))}
      
      {centerOfGravity && (
        <CenterOfGravityMarker 
          position={centerOfGravity} 
          scale={scale}
          truckWidth={truck.width}
          truckDepth={truck.depth}
        />
      )}
      
      <Grid 
        args={[20, 20]} 
        position={[truck.width * scale / 2, -0.01, truck.depth * scale / 2]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#9ca3af"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#6b7280"
        fadeDistance={30}
        fadeStrength={1}
      />
    </>
  );
}

export default function TruckVisualization({ 
  truck, 
  packedItems, 
  centerOfGravity 
}: TruckVisualizationProps) {
  // Calculate scale to fit visualization nicely
  const maxDimension = Math.max(truck.width, truck.depth, truck.height);
  const scale = 5 / maxDimension; // Normalize to ~5 units

  return (
    <div className="w-full h-[500px] bg-gradient-to-b from-slate-100 to-slate-200 rounded-lg overflow-hidden">
      <Canvas>
        <PerspectiveCamera 
          makeDefault 
          position={[
            truck.width * scale * 1.5, 
            truck.height * scale * 1.2, 
            truck.depth * scale * 1.5
          ]} 
          fov={50}
        />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2}
          maxDistance={20}
          target={[
            truck.width * scale / 2,
            truck.height * scale / 2,
            truck.depth * scale / 2
          ]}
        />
        <Scene 
          truck={truck} 
          packedItems={packedItems} 
          centerOfGravity={centerOfGravity}
          scale={scale}
        />
      </Canvas>
    </div>
  );
}
