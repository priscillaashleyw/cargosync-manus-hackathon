import { MapView } from "./Map";
import { useRef, useCallback } from "react";

interface DeliveryStop {
  id: number;
  sequence: number;
  orderNumber: string;
  zipcode: string;
  zone: string;
  address?: string;
  lat?: number;
  lng?: number;
}

interface DeliveryRouteMapProps {
  stops: DeliveryStop[];
  className?: string;
}

// Singapore zipcode to approximate coordinates mapping
// In production, this would use a geocoding service
function getCoordinatesFromZipcode(zipcode: string): { lat: number; lng: number } {
  // Singapore postal codes are 6 digits
  // First 2 digits indicate the district
  const district = parseInt(zipcode.substring(0, 2), 10);
  
  // Approximate coordinates based on Singapore postal districts
  const districtCoords: Record<number, { lat: number; lng: number }> = {
    // Central
    1: { lat: 1.2830, lng: 103.8450 },
    2: { lat: 1.2850, lng: 103.8480 },
    3: { lat: 1.2880, lng: 103.8420 },
    4: { lat: 1.2750, lng: 103.8380 },
    5: { lat: 1.2720, lng: 103.8320 },
    6: { lat: 1.2800, lng: 103.8500 },
    7: { lat: 1.3020, lng: 103.8550 },
    8: { lat: 1.3050, lng: 103.8600 },
    9: { lat: 1.3100, lng: 103.8500 },
    10: { lat: 1.3150, lng: 103.8450 },
    // North
    11: { lat: 1.3250, lng: 103.8350 },
    12: { lat: 1.3300, lng: 103.8400 },
    13: { lat: 1.3350, lng: 103.8450 },
    14: { lat: 1.3100, lng: 103.8650 },
    15: { lat: 1.3050, lng: 103.8700 },
    16: { lat: 1.3200, lng: 103.8750 },
    17: { lat: 1.3350, lng: 103.8800 },
    // East
    18: { lat: 1.3250, lng: 103.9100 },
    19: { lat: 1.3400, lng: 103.8900 },
    20: { lat: 1.3550, lng: 103.8850 },
    21: { lat: 1.3400, lng: 103.8200 },
    22: { lat: 1.3450, lng: 103.8100 },
    23: { lat: 1.3500, lng: 103.8000 },
    // West
    24: { lat: 1.3400, lng: 103.7400 },
    25: { lat: 1.3350, lng: 103.7500 },
    26: { lat: 1.3300, lng: 103.7600 },
    27: { lat: 1.3650, lng: 103.7050 },
    28: { lat: 1.3550, lng: 103.7100 },
    29: { lat: 1.3700, lng: 103.7500 },
    30: { lat: 1.3750, lng: 103.7600 },
    // South
    31: { lat: 1.2950, lng: 103.7850 },
    32: { lat: 1.3000, lng: 103.7900 },
    33: { lat: 1.3050, lng: 103.7950 },
    34: { lat: 1.3100, lng: 103.8000 },
    35: { lat: 1.3150, lng: 103.8050 },
    36: { lat: 1.2900, lng: 103.8100 },
    37: { lat: 1.2850, lng: 103.8150 },
    38: { lat: 1.2800, lng: 103.8200 },
    39: { lat: 1.2750, lng: 103.8250 },
    40: { lat: 1.2700, lng: 103.8300 },
    // More districts
    41: { lat: 1.3300, lng: 103.9200 },
    42: { lat: 1.3350, lng: 103.9300 },
    43: { lat: 1.3400, lng: 103.9400 },
    44: { lat: 1.3450, lng: 103.9500 },
    45: { lat: 1.3500, lng: 103.9600 },
    46: { lat: 1.3550, lng: 103.9700 },
    47: { lat: 1.3600, lng: 103.9800 },
    48: { lat: 1.3650, lng: 103.9900 },
    49: { lat: 1.3700, lng: 104.0000 },
    50: { lat: 1.3750, lng: 103.9500 },
    51: { lat: 1.3800, lng: 103.9400 },
    52: { lat: 1.3850, lng: 103.9300 },
    53: { lat: 1.3900, lng: 103.9200 },
    54: { lat: 1.3950, lng: 103.9100 },
    55: { lat: 1.4000, lng: 103.9000 },
    56: { lat: 1.4050, lng: 103.8900 },
    57: { lat: 1.4100, lng: 103.8800 },
    58: { lat: 1.4150, lng: 103.8700 },
    59: { lat: 1.4200, lng: 103.8600 },
    60: { lat: 1.4250, lng: 103.8500 },
    61: { lat: 1.4300, lng: 103.8400 },
    62: { lat: 1.4350, lng: 103.8300 },
    63: { lat: 1.4400, lng: 103.8200 },
    64: { lat: 1.4450, lng: 103.8100 },
    65: { lat: 1.4500, lng: 103.8000 },
    66: { lat: 1.4550, lng: 103.7900 },
    67: { lat: 1.4600, lng: 103.7800 },
    68: { lat: 1.4650, lng: 103.7700 },
    69: { lat: 1.4700, lng: 103.7600 },
    70: { lat: 1.4750, lng: 103.7500 },
    71: { lat: 1.4800, lng: 103.7400 },
    72: { lat: 1.4850, lng: 103.7300 },
    73: { lat: 1.4900, lng: 103.7200 },
    74: { lat: 1.4950, lng: 103.7100 },
    75: { lat: 1.5000, lng: 103.7000 },
    76: { lat: 1.4450, lng: 103.7800 },
    77: { lat: 1.4400, lng: 103.7700 },
    78: { lat: 1.4350, lng: 103.7600 },
    79: { lat: 1.4300, lng: 103.7500 },
    80: { lat: 1.4250, lng: 103.7400 },
  };
  
  // Add some randomness to avoid exact overlapping
  const base = districtCoords[district] || { lat: 1.3521, lng: 103.8198 };
  const jitter = 0.005;
  
  return {
    lat: base.lat + (Math.random() - 0.5) * jitter,
    lng: base.lng + (Math.random() - 0.5) * jitter,
  };
}

// Zone colors
const zoneColors: Record<string, string> = {
  North: "#3b82f6",   // blue
  South: "#22c55e",   // green
  East: "#f59e0b",    // amber
  West: "#8b5cf6",    // violet
  Central: "#ef4444", // red
};

export default function DeliveryRouteMap({ stops, className }: DeliveryRouteMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    
    // Clear existing markers
    markersRef.current.forEach(marker => marker.map = null);
    markersRef.current = [];
    
    // Clear existing polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }
    
    if (stops.length === 0) return;
    
    // Create markers for each stop
    const coordinates: google.maps.LatLngLiteral[] = [];
    const bounds = new google.maps.LatLngBounds();
    
    stops.forEach((stop) => {
      const coords = stop.lat && stop.lng 
        ? { lat: stop.lat, lng: stop.lng }
        : getCoordinatesFromZipcode(stop.zipcode);
      
      coordinates.push(coords);
      bounds.extend(coords);
      
      // Create custom marker element
      const markerContent = document.createElement("div");
      markerContent.className = "flex flex-col items-center";
      markerContent.innerHTML = `
        <div style="
          background-color: ${zoneColors[stop.zone] || "#6b7280"};
          color: white;
          font-weight: bold;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">${stop.sequence}</div>
        <div style="
          background-color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          margin-top: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          white-space: nowrap;
        ">${stop.orderNumber}</div>
      `;
      
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: coords,
        title: `${stop.sequence}. ${stop.orderNumber} - ${stop.zipcode}`,
        content: markerContent,
      });
      
      markersRef.current.push(marker);
    });
    
    // Draw route polyline
    if (coordinates.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        path: coordinates,
        geodesic: true,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map,
      });
    }
    
    // Fit map to show all markers
    if (stops.length > 0) {
      map.fitBounds(bounds, 50);
    }
  }, [stops]);

  return (
    <MapView
      className={className}
      initialCenter={{ lat: 1.3521, lng: 103.8198 }} // Singapore center
      initialZoom={11}
      onMapReady={handleMapReady}
    />
  );
}
