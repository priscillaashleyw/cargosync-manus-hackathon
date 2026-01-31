import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Zap, 
  Truck, 
  Package, 
  MapPin, 
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Play,
  Clock,
  RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// V3 Algorithm Types
interface TripData {
  tripId: number;
  orders: {
    id: number;
    orderNumber: string;
    zone: string;
    helpersRequired: string;
  }[];
  route: {
    orderId: number;
    orderNumber: string;
    sequence: number;
    zone: string;
    zipcode: string;
    sector: string;
    latitude: number;
    longitude: number;
    weightKg: number;
    volumeM3: number;
    needsTwoPeople: boolean;
  }[];
  loadPlan: {
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
    placement: "front" | "middle" | "back";
  }[];
  volumeUtilization: number;
  weightUtilization: number;
  deliveryTimeMin: number;
  zones: string[];
}

interface TruckAssignment {
  truck: {
    id: number;
    name: string;
    width: number;
    depth: number;
    height: number;
    maxWeight: number;
    volume: number;
  };
  totalTrips: number;
  totalOrders: number;
  totalVolumeM3: number;
  totalWeightKg: number;
  totalRouteTimeMin: number;
  totalRouteTimeHours: number;
  trips: TripData[];
}

interface OptimizationResult {
  success: boolean;
  assignments: TruckAssignment[];
  depot: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  summary: {
    totalOrders: number;
    assignedOrders: number;
    unassignedOrders: number;
    assignmentRate: number;
    totalTrips: number;
    totalElapsedTimeMin: number;
    totalElapsedTimeHours: number;
    fleetVolumeUtilization: number;
    depotReloadTimePerTripMin: number;
  };
  parallelDeployment: {
    deploymentMode: string;
    totalElapsedTimeMin: number;
    totalElapsedTimeHours: number;
    bottleneckTruck: string | null;
    truckCompletionTimes: Record<string, { totalTimeMin: number; totalTimeHours: number; trips: number }>;
  };
  zoneSummary: Record<string, { orders: number; volumeM3: number; weightKg: number }>;
  unassignedOrders: {
    id: number;
    orderNumber: string;
    zone: string;
    volumeM3: number;
    weightKg: number;
    reason: string;
  }[];
}

export default function AutoOptimizePage() {
  const [, setLocation] = useLocation();
  const [runDate, setRunDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<number, string>>({});
  const [selectedHelpers, setSelectedHelpers] = useState<Record<number, { helper1?: string; helper2?: string }>>({});

  const { data: pendingOrders, isLoading: ordersLoading } = trpc.dashboard.ordersForOptimization.useQuery();
  const { data: drivers } = trpc.personnel.drivers.useQuery();
  const { data: helpers } = trpc.personnel.helpers.useQuery();
  const { data: depot } = trpc.globalOptimize.getDepot.useQuery();

  const optimizeMutation = trpc.globalOptimize.autoOptimize.useMutation({
    onSuccess: (data) => {
      setOptimizationResult(data as unknown as OptimizationResult);
      toast.success(`Optimization complete! ${data.assignments.length} trucks assigned.`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createRunsMutation = trpc.globalOptimize.createFromAutoOptimize.useMutation({
    onSuccess: (data) => {
      toast.success(`Created ${data.createdRunIds.length} delivery runs!`);
      setShowConfirmDialog(false);
      setOptimizationResult(null);
      setSelectedOrders(new Set());
      setLocation("/delivery-runs");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSelectAll = () => {
    if (pendingOrders) {
      if (selectedOrders.size === pendingOrders.length) {
        setSelectedOrders(new Set());
      } else {
        setSelectedOrders(new Set(pendingOrders.map(o => o.id)));
      }
    }
  };

  const handleSelectByZone = (zone: string) => {
    if (pendingOrders) {
      const zoneOrders = pendingOrders.filter(o => o.deliveryZone === zone);
      const newSelected = new Set(selectedOrders);
      const allSelected = zoneOrders.every(o => selectedOrders.has(o.id));
      
      if (allSelected) {
        zoneOrders.forEach(o => newSelected.delete(o.id));
      } else {
        zoneOrders.forEach(o => newSelected.add(o.id));
      }
      setSelectedOrders(newSelected);
    }
  };

  const handleOptimize = () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select at least one order");
      return;
    }
    optimizeMutation.mutate({
      runDate,
      orderIds: Array.from(selectedOrders),
    });
  };

  const handleCreateRuns = () => {
    if (!optimizationResult) return;

    // Flatten trips into individual delivery runs
    const assignments: {
      truckId: number;
      tripId: number;
      orderIds: number[];
      route: { orderId: number; sequence: number }[];
      loadPlan: {
        orderItemId: number;
        x: number;
        y: number;
        z: number;
        rotatedLength: number;
        rotatedWidth: number;
        height: number;
        weight: number;
        rotation: number;
        placement: "front" | "middle" | "back";
      }[];
      driverId?: number;
      helperId?: number;
      helper2Id?: number;
    }[] = [];

    for (const truckAssignment of optimizationResult.assignments) {
      for (const trip of truckAssignment.trips) {
        assignments.push({
          truckId: truckAssignment.truck.id,
          tripId: trip.tripId,
          orderIds: trip.orders.map(o => o.id),
          route: trip.route.map(r => ({ orderId: r.orderId, sequence: r.sequence })),
          loadPlan: trip.loadPlan.map(lp => ({
            orderItemId: lp.orderItemId,
            x: lp.x,
            y: lp.y,
            z: lp.z,
            rotatedLength: lp.rotatedLength,
            rotatedWidth: lp.rotatedWidth,
            height: lp.height,
            weight: lp.weight,
            rotation: lp.rotation,
            placement: lp.placement,
          })),
          driverId: selectedDrivers[truckAssignment.truck.id] ? parseInt(selectedDrivers[truckAssignment.truck.id]) : undefined,
          helperId: selectedHelpers[truckAssignment.truck.id]?.helper1 ? parseInt(selectedHelpers[truckAssignment.truck.id].helper1!) : undefined,
          helper2Id: selectedHelpers[truckAssignment.truck.id]?.helper2 ? parseInt(selectedHelpers[truckAssignment.truck.id].helper2!) : undefined,
        });
      }
    }

    createRunsMutation.mutate({
      runDate,
      assignments,
    });
  };

  // Group orders by zone
  const ordersByZone = pendingOrders?.reduce((acc, order) => {
    const zone = order.deliveryZone || "Unassigned";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(order);
    return acc;
  }, {} as Record<string, typeof pendingOrders>) || {};

  const zones = ["North", "South", "East", "West", "Central"];
  const zoneColors: Record<string, string> = {
    North: "bg-blue-100 text-blue-800",
    South: "bg-green-100 text-green-800",
    East: "bg-amber-100 text-amber-800",
    West: "bg-purple-100 text-purple-800",
    Central: "bg-red-100 text-red-800",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Auto Optimize</h1>
            <p className="text-muted-foreground">
              V3 Algorithm: Multi-trip support with parallel deployment
            </p>
          </div>
          {depot && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Depot: {depot.name} ({depot.zipcode})</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Selection */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Select Orders</CardTitle>
                    <CardDescription>
                      Choose orders to include in optimization
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAll}>
                      {selectedOrders.size === pendingOrders?.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Zone Quick Select */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {zones.map(zone => {
                    const zoneOrderCount = ordersByZone[zone]?.length || 0;
                    const selectedCount = ordersByZone[zone]?.filter(o => selectedOrders.has(o.id)).length || 0;
                    return (
                      <Button
                        key={zone}
                        variant={selectedCount === zoneOrderCount && zoneOrderCount > 0 ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSelectByZone(zone)}
                        disabled={zoneOrderCount === 0}
                      >
                        {zone} ({selectedCount}/{zoneOrderCount})
                      </Button>
                    );
                  })}
                </div>

                {/* Orders List */}
                <ScrollArea className="h-[400px]">
                  {ordersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
                  ) : pendingOrders && pendingOrders.length > 0 ? (
                    <div className="space-y-2">
                      {pendingOrders.map(order => (
                        <div
                          key={order.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedOrders.has(order.id) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            const newSelected = new Set(selectedOrders);
                            if (newSelected.has(order.id)) {
                              newSelected.delete(order.id);
                            } else {
                              newSelected.add(order.id);
                            }
                            setSelectedOrders(newSelected);
                          }}
                        >
                          <Checkbox checked={selectedOrders.has(order.id)} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{order.orderNumber}</span>
                              <Badge variant="outline" className={zoneColors[order.deliveryZone || ""] || ""}>
                                {order.deliveryZone || "Unknown"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {order.zipcode} • {order.items?.length || 0} items • {order.totalWeight?.toFixed(1) || "?"} kg
                            </div>
                          </div>
                          {(order as any).helpersRequired !== "none" && (
                            <Badge variant="secondary">
                              <Users className="h-3 w-3 mr-1" />
                              {(order as any).helpersRequired === "one" ? "1" : "2"} helper{(order as any).helpersRequired === "two" ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No pending orders available
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Optimization Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Run Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Delivery Date</Label>
                  <Input
                    type="date"
                    value={runDate}
                    onChange={(e) => setRunDate(e.target.value)}
                  />
                </div>
                <div className="pt-2">
                  <div className="text-sm text-muted-foreground mb-2">
                    Selected: {selectedOrders.size} orders
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleOptimize}
                    disabled={selectedOrders.size === 0 || optimizeMutation.isPending}
                  >
                    {optimizeMutation.isPending ? (
                      <>
                        <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Run Optimization
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Optimization Summary */}
            {optimizationResult && (
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    Optimization Complete
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground">Assigned</div>
                      <div className="font-semibold">{optimizationResult.summary.assignedOrders} orders</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Trips</div>
                      <div className="font-semibold">{optimizationResult.summary.totalTrips}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Time</div>
                      <div className="font-semibold">{optimizationResult.summary.totalElapsedTimeHours} hrs</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Fleet Utilization</div>
                      <div className="font-semibold">{optimizationResult.summary.fleetVolumeUtilization}%</div>
                    </div>
                  </div>
                  
                  {optimizationResult.parallelDeployment.bottleneckTruck && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Bottleneck: {optimizationResult.parallelDeployment.bottleneckTruck}
                    </div>
                  )}

                  {optimizationResult.unassignedOrders.length > 0 && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      {optimizationResult.unassignedOrders.length} orders could not be assigned
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Create Delivery Runs
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Optimization Results */}
        {optimizationResult && (
          <Card>
            <CardHeader>
              <CardTitle>Truck Assignments</CardTitle>
              <CardDescription>
                {optimizationResult.parallelDeployment.deploymentMode}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="trucks">
                <TabsList>
                  <TabsTrigger value="trucks">By Truck</TabsTrigger>
                  <TabsTrigger value="zones">By Zone</TabsTrigger>
                  {optimizationResult.unassignedOrders.length > 0 && (
                    <TabsTrigger value="unassigned">
                      Unassigned ({optimizationResult.unassignedOrders.length})
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="trucks" className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {optimizationResult.assignments.map((assignment) => (
                      <Card key={assignment.truck.id} className="border-2">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Truck className="h-5 w-5" />
                              {assignment.truck.name}
                            </CardTitle>
                            <Badge variant="outline">
                              {assignment.totalTrips} trip{assignment.totalTrips > 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <div className="text-muted-foreground">Orders</div>
                              <div className="font-semibold">{assignment.totalOrders}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Route Time</div>
                              <div className="font-semibold">{assignment.totalRouteTimeHours} hrs</div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Volume</span>
                              <span>{assignment.totalVolumeM3} m³</span>
                            </div>
                            <Progress 
                              value={assignment.trips[0]?.volumeUtilization || 0} 
                              className="h-2"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Weight</span>
                              <span>{assignment.totalWeightKg} kg</span>
                            </div>
                            <Progress 
                              value={assignment.trips[0]?.weightUtilization || 0} 
                              className="h-2"
                            />
                          </div>

                          {/* Trip details */}
                          {assignment.trips.map((trip, idx) => (
                            <div key={trip.tripId} className="border-t pt-2 mt-2">
                              <div className="text-xs font-medium mb-1">
                                Trip {trip.tripId}: {trip.orders.length} orders • {trip.deliveryTimeMin} min
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {trip.zones.map(zone => (
                                  <Badge key={zone} variant="secondary" className={`text-xs ${zoneColors[zone] || ""}`}>
                                    {zone}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="zones" className="mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(optimizationResult.zoneSummary).map(([zone, stats]) => (
                      <Card key={zone}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            <Badge className={zoneColors[zone] || ""}>{zone}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Orders</span>
                            <span className="font-medium">{stats.orders}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Volume</span>
                            <span className="font-medium">{stats.volumeM3} m³</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Weight</span>
                            <span className="font-medium">{stats.weightKg} kg</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {optimizationResult.unassignedOrders.length > 0 && (
                  <TabsContent value="unassigned" className="mt-4">
                    <div className="space-y-2">
                      {optimizationResult.unassignedOrders.map(order => (
                        <div key={order.id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <div className="flex-1">
                            <div className="font-medium">{order.orderNumber}</div>
                            <div className="text-sm text-muted-foreground">
                              {order.zone} • {order.volumeM3} m³ • {order.weightKg} kg
                            </div>
                          </div>
                          <div className="text-sm text-amber-600">{order.reason}</div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Confirm Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Delivery Runs</DialogTitle>
              <DialogDescription>
                Assign drivers and helpers to each truck before creating delivery runs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {optimizationResult?.assignments.map((assignment) => (
                <Card key={assignment.truck.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      {assignment.truck.name}
                      <Badge variant="outline" className="ml-auto">
                        {assignment.totalOrders} orders • {assignment.totalTrips} trip{assignment.totalTrips > 1 ? "s" : ""}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Driver</Label>
                        <Select
                          value={selectedDrivers[assignment.truck.id] || ""}
                          onValueChange={(value) => setSelectedDrivers(prev => ({ ...prev, [assignment.truck.id]: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select driver" />
                          </SelectTrigger>
                          <SelectContent>
                            {drivers?.filter(d => d.status === "available").map(driver => (
                              <SelectItem key={driver.id} value={String(driver.id)}>
                                {driver.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Helper 1</Label>
                        <Select
                          value={selectedHelpers[assignment.truck.id]?.helper1 || ""}
                          onValueChange={(value) => setSelectedHelpers(prev => ({
                            ...prev,
                            [assignment.truck.id]: { ...prev[assignment.truck.id], helper1: value }
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {helpers?.filter(h => h.status === "available").map(helper => (
                              <SelectItem key={helper.id} value={String(helper.id)}>
                                {helper.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Helper 2</Label>
                        <Select
                          value={selectedHelpers[assignment.truck.id]?.helper2 || ""}
                          onValueChange={(value) => setSelectedHelpers(prev => ({
                            ...prev,
                            [assignment.truck.id]: { ...prev[assignment.truck.id], helper2: value }
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {helpers?.filter(h => h.status === "available").map(helper => (
                              <SelectItem key={helper.id} value={String(helper.id)}>
                                {helper.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRuns} disabled={createRunsMutation.isPending}>
                {createRunsMutation.isPending ? "Creating..." : "Create Delivery Runs"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
