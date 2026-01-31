import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapView } from "@/components/Map";
import { 
  Truck, 
  MapPin, 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock,
  Navigation,
  RefreshCw,
  Package
} from "lucide-react";
import { toast } from "sonner";

export default function LiveTrackingPage() {
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [polylines, setPolylines] = useState<google.maps.Polyline[]>([]);

  const { data: trackingData, refetch, isLoading } = trpc.liveTracking.getActiveRuns.useQuery(
    undefined,
    { refetchInterval: isSimulating ? 3000 : false }
  );

  const simulateMutation = trpc.liveTracking.simulateMovement.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const deliverMutation = trpc.liveTracking.deliverCurrentStop.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data.completed) {
        toast.success("Delivery run completed!");
        setIsSimulating(false);
      } else {
        toast.success(data.message);
      }
    },
  });

  // Update map markers when data changes
  const updateMapMarkers = useCallback(() => {
    if (!map || !trackingData) return;

    // Clear existing markers and polylines
    markers.forEach(m => m.setMap(null));
    polylines.forEach(p => p.setMap(null));

    const newMarkers: google.maps.Marker[] = [];
    const newPolylines: google.maps.Polyline[] = [];

    // Add depot marker
    const depotMarker = new google.maps.Marker({
      position: { lat: trackingData.depot.latitude, lng: trackingData.depot.longitude },
      map,
      title: "Tuas Depot",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#1f2937",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      label: {
        text: "D",
        color: "#ffffff",
        fontWeight: "bold",
      },
    });
    newMarkers.push(depotMarker);

    // Add markers for each active run
    for (const run of trackingData.activeRuns) {
      // Truck marker (current position)
      const truckMarker = new google.maps.Marker({
        position: { lat: run.currentLatitude, lng: run.currentLongitude },
        map,
        title: run.truckName,
        icon: {
          path: "M 0,-10 L 5,-5 L 5,8 L -5,8 L -5,-5 Z",
          scale: 2,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#1e40af",
          strokeWeight: 2,
          rotation: 0,
        },
        zIndex: 100,
      });
      newMarkers.push(truckMarker);

      // Route stops
      const routeCoords: google.maps.LatLngLiteral[] = [
        { lat: trackingData.depot.latitude, lng: trackingData.depot.longitude },
      ];

      for (const stop of run.route) {
        const stopColor = stop.status === "delivered" 
          ? "#22c55e" 
          : stop.status === "current" 
            ? "#f59e0b" 
            : "#6b7280";

        const stopMarker = new google.maps.Marker({
          position: { lat: stop.latitude, lng: stop.longitude },
          map,
          title: `${stop.orderNumber} - ${stop.address}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: stopColor,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          label: {
            text: String(stop.sequence),
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: "bold",
          },
        });
        newMarkers.push(stopMarker);
        routeCoords.push({ lat: stop.latitude, lng: stop.longitude });
      }

      // Route polyline
      const routeLine = new google.maps.Polyline({
        path: routeCoords,
        geodesic: true,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map,
      });
      newPolylines.push(routeLine);
    }

    setMarkers(newMarkers);
    setPolylines(newPolylines);

    // Fit bounds to show all markers
    if (newMarkers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      newMarkers.forEach(m => {
        const pos = m.getPosition();
        if (pos) bounds.extend(pos);
      });
      map.fitBounds(bounds, 50);
    }
  }, [map, trackingData, markers, polylines]);

  useEffect(() => {
    updateMapMarkers();
  }, [trackingData, map]);

  // Simulation loop
  useEffect(() => {
    if (!isSimulating || !selectedRun) return;

    const interval = setInterval(() => {
      simulateMutation.mutate({ runId: selectedRun });
    }, 2000);

    return () => clearInterval(interval);
  }, [isSimulating, selectedRun]);

  const handleMapReady = (mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    // Center on Singapore
    mapInstance.setCenter({ lat: 1.3521, lng: 103.8198 });
    mapInstance.setZoom(11);
  };

  const selectedRunData = trackingData?.activeRuns.find(r => r.runId === selectedRun);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live Tracking</h1>
            <p className="text-muted-foreground">
              Monitor active deliveries in real-time
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !trackingData?.activeRuns.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-96">
              <Truck className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Active Deliveries</h3>
              <p className="text-muted-foreground text-center max-w-md mt-2">
                There are no delivery runs currently in progress. Start a delivery run from the Delivery Runs page to see live tracking.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Runs List */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Runs</h2>
              {trackingData.activeRuns.map((run) => (
                <Card 
                  key={run.runId}
                  className={`cursor-pointer transition-all ${
                    selectedRun === run.runId ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSelectedRun(run.runId)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-primary" />
                        <span className="font-semibold">{run.truckName}</span>
                      </div>
                      <Badge variant="default">In Progress</Badge>
                    </div>
                    {run.driverName && (
                      <p className="text-sm text-muted-foreground mb-2">
                        Driver: {run.driverName}
                      </p>
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{run.progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={run.progress} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Stop {run.currentStopIndex} of {run.totalStops}</span>
                        <span>{run.route.filter(r => r.status === "delivered").length} delivered</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Map and Details */}
            <div className="lg:col-span-2 space-y-4">
              {/* Map */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Navigation className="h-5 w-5" />
                    Live Map
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] rounded-lg overflow-hidden">
                    <MapView onMapReady={handleMapReady} />
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-800" />
                      <span>Depot</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-blue-500" />
                      <span>Truck</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-green-500" />
                      <span>Delivered</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-amber-500" />
                      <span>Current</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gray-500" />
                      <span>Pending</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Selected Run Details */}
              {selectedRunData && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{selectedRunData.truckName} - Route Details</CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant={isSimulating ? "destructive" : "default"}
                          size="sm"
                          onClick={() => setIsSimulating(!isSimulating)}
                        >
                          {isSimulating ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Stop Simulation
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Simulate Movement
                            </>
                          )}
                        </Button>
                        {selectedRunData.currentStopIndex > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deliverMutation.mutate({ runId: selectedRun! })}
                            disabled={deliverMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Mark Delivered
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedRunData.route.map((stop) => (
                        <div 
                          key={stop.orderId}
                          className={`flex items-center gap-4 p-3 rounded-lg ${
                            stop.status === "current" 
                              ? "bg-amber-50 border border-amber-200" 
                              : stop.status === "delivered"
                                ? "bg-green-50 border border-green-200"
                                : "bg-gray-50"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                            stop.status === "delivered" 
                              ? "bg-green-500" 
                              : stop.status === "current"
                                ? "bg-amber-500"
                                : "bg-gray-400"
                          }`}>
                            {stop.status === "delivered" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              stop.sequence
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{stop.orderNumber}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span>{stop.address}</span>
                            </div>
                          </div>
                          <Badge variant={
                            stop.status === "delivered" 
                              ? "default" 
                              : stop.status === "current"
                                ? "secondary"
                                : "outline"
                          }>
                            {stop.status === "delivered" 
                              ? "Delivered" 
                              : stop.status === "current"
                                ? "In Progress"
                                : "Pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
