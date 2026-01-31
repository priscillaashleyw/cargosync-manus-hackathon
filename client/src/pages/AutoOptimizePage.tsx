import { useState } from "react";
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
  Play
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface Assignment {
  truck: {
    id: number;
    name: string;
    width: number;
    depth: number;
    height: number;
    maxWeight: number;
    volume: number;
  };
  orders: {
    id: number;
    orderNumber: string;
    zone: string | null;
    helpersRequired: string;
  }[];
  totalWeight: number;
  totalVolume: number;
  helpersNeeded: number;
  route: {
    orderId: number;
    sequence: number;
    estimatedArrivalMinutes: number;
  }[];
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
  volumeUtilization: number;
  weightUtilization: number;
}

interface OptimizationResult {
  success: boolean;
  assignments: Assignment[];
  depot: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  unassignedOrders: {
    id: number;
    orderNumber: string;
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
      setOptimizationResult(data as OptimizationResult);
      toast.success(`Optimization complete! ${data.assignments.length} trucks assigned.`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createRunsMutation = trpc.globalOptimize.createFromAutoOptimize.useMutation({
    onSuccess: (data) => {
      toast.success(`Created ${data.runIds.length} delivery runs!`);
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

    const assignments = optimizationResult.assignments.map(a => ({
      truckId: a.truck.id,
      orderIds: a.orders.map(o => o.id),
      route: a.route,
      loadPlan: a.loadPlan,
      driverId: selectedDrivers[a.truck.id] ? parseInt(selectedDrivers[a.truck.id]) : undefined,
      helperId: selectedHelpers[a.truck.id]?.helper1 ? parseInt(selectedHelpers[a.truck.id].helper1!) : undefined,
      helper2Id: selectedHelpers[a.truck.id]?.helper2 ? parseInt(selectedHelpers[a.truck.id].helper2!) : undefined,
    }));

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
              Automatically assign orders to trucks and optimize routes
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

                {/* Orders by Zone */}
                <Tabs defaultValue="all">
                  <TabsList>
                    <TabsTrigger value="all">All ({pendingOrders?.length || 0})</TabsTrigger>
                    {zones.map(zone => (
                      <TabsTrigger key={zone} value={zone}>
                        {zone} ({ordersByZone[zone]?.length || 0})
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="all">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {pendingOrders?.map(order => (
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
                                <Badge className={zoneColors[order.deliveryZone || ""] || "bg-gray-100"}>
                                  {order.deliveryZone || "N/A"}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {order.items.length} items • {order.totalWeight.toFixed(1)} kg • {(order.totalVolume / 1000000).toFixed(2)} m³
                              </div>
                            </div>
                            {order.needsTwoPeople && (
                              <Badge variant="secondary">
                                <Users className="h-3 w-3 mr-1" />
                                2 People
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  {zones.map(zone => (
                    <TabsContent key={zone} value={zone}>
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {ordersByZone[zone]?.map(order => (
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
                                <span className="font-medium">{order.orderNumber}</span>
                                <div className="text-sm text-muted-foreground">
                                  {order.items.length} items • {order.totalWeight.toFixed(1)} kg
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Optimization Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Optimization Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>
                    <Calendar className="h-4 w-4 inline mr-2" />
                    Delivery Date
                  </Label>
                  <Input
                    type="date"
                    value={runDate}
                    onChange={(e) => setRunDate(e.target.value)}
                  />
                </div>

                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Selected Orders</span>
                    <span className="font-bold">{selectedOrders.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Weight</span>
                    <span className="font-bold">
                      {pendingOrders
                        ?.filter(o => selectedOrders.has(o.id))
                        .reduce((sum, o) => sum + o.totalWeight, 0)
                        .toFixed(1)} kg
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Volume</span>
                    <span className="font-bold">
                      {((pendingOrders
                        ?.filter(o => selectedOrders.has(o.id))
                        .reduce((sum, o) => sum + o.totalVolume, 0) ?? 0) / 1000000)
                        .toFixed(2)} m³
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleOptimize}
                  disabled={selectedOrders.size === 0 || optimizeMutation.isPending}
                >
                  {optimizeMutation.isPending ? (
                    <>Optimizing...</>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Run Auto-Optimization
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results Summary */}
            {optimizationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Optimization Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {optimizationResult.assignments.map((assignment, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            <span className="font-medium">{assignment.truck.name}</span>
                          </div>
                          <Badge>{assignment.orders.length} orders</Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Volume</span>
                            <span>{assignment.volumeUtilization.toFixed(1)}%</span>
                          </div>
                          <Progress value={assignment.volumeUtilization} className="h-2" />
                          <div className="flex justify-between text-sm">
                            <span>Weight</span>
                            <span>{assignment.weightUtilization.toFixed(1)}%</span>
                          </div>
                          <Progress value={assignment.weightUtilization} className="h-2" />
                        </div>
                        {assignment.helpersNeeded > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <Users className="h-3 w-3 inline mr-1" />
                            {assignment.helpersNeeded} helper(s) needed
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {optimizationResult.unassignedOrders.length > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-800 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">
                          {optimizationResult.unassignedOrders.length} orders not assigned
                        </span>
                      </div>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {optimizationResult.unassignedOrders.map(o => (
                          <li key={o.id}>{o.orderNumber}: {o.reason}</li>
                        ))}
                      </ul>
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

        {/* Confirm Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Personnel & Create Runs</DialogTitle>
              <DialogDescription>
                Assign drivers and helpers to each truck before creating delivery runs
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 p-1">
                {optimizationResult?.assignments.map((assignment) => (
                  <Card key={assignment.truck.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Truck className="h-5 w-5" />
                        <span className="font-semibold">{assignment.truck.name}</span>
                        <Badge variant="outline">{assignment.orders.length} orders</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Driver</Label>
                          <Select
                            value={selectedDrivers[assignment.truck.id] || ""}
                            onValueChange={(v) => setSelectedDrivers(prev => ({
                              ...prev,
                              [assignment.truck.id]: v
                            }))}
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
                          <Label>Helper 1</Label>
                          <Select
                            value={selectedHelpers[assignment.truck.id]?.helper1 || "none"}
                            onValueChange={(v) => setSelectedHelpers(prev => ({
                              ...prev,
                              [assignment.truck.id]: { ...prev[assignment.truck.id], helper1: v }
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select helper" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No helper</SelectItem>
                              {helpers?.filter(h => h.status === "available").map(helper => (
                                <SelectItem key={helper.id} value={String(helper.id)}>
                                  {helper.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {assignment.helpersNeeded >= 2 && (
                          <div>
                            <Label>Helper 2</Label>
                            <Select
                              value={selectedHelpers[assignment.truck.id]?.helper2 || "none"}
                              onValueChange={(v) => setSelectedHelpers(prev => ({
                                ...prev,
                                [assignment.truck.id]: { ...prev[assignment.truck.id], helper2: v }
                              }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select helper" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No helper</SelectItem>
                                {helpers?.filter(h => h.status === "available").map(helper => (
                                  <SelectItem key={helper.id} value={String(helper.id)}>
                                    {helper.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
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
