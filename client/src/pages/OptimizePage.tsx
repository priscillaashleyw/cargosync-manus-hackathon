import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { 
  Truck, 
  Package, 
  Zap, 
  CheckCircle2, 
  AlertTriangle,
  Scale,
  Box,
  MapPin,
  Calendar
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function OptimizePage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  
  const { data: trucks, isLoading: trucksLoading } = trpc.trucks.list.useQuery();
  const { data: pendingOrders, isLoading: ordersLoading } = trpc.dashboard.ordersForOptimization.useQuery();
  const { data: drivers } = trpc.personnel.drivers.useQuery();
  const { data: helpers } = trpc.personnel.helpers.useQuery();
  
  const [selectedTruck, setSelectedTruck] = useState<string>("");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [runDate, setRunDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [selectedHelper, setSelectedHelper] = useState<string>("");
  
  const optimizeMutation = trpc.optimize.run.useMutation({
    onSuccess: (result) => {
      setOptimizationResult(result);
      setIsOptimizing(false);
      if (result.success) {
        toast.success("Optimization completed successfully!");
      } else {
        toast.warning(`Optimization completed with ${result.unpackedItems.length} items that don't fit`);
      }
    },
    onError: (error) => {
      setIsOptimizing(false);
      toast.error(error.message);
    },
  });
  
  const createRunMutation = trpc.optimize.createFromOptimization.useMutation({
    onSuccess: (result) => {
      toast.success("Delivery run created successfully!");
      utils.deliveryRuns.list.invalidate();
      utils.orders.list.invalidate();
      navigate(`/delivery-runs/${result.runId}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const availableTrucks = trucks?.filter((t) => t.status === "available") || [];
  
  const selectedOrdersData = useMemo(() => {
    return pendingOrders?.filter((o) => selectedOrders.has(o.id)) || [];
  }, [pendingOrders, selectedOrders]);
  
  const totalWeight = useMemo(() => {
    return selectedOrdersData.reduce((sum, o) => sum + o.totalWeight, 0);
  }, [selectedOrdersData]);
  
  const totalVolume = useMemo(() => {
    return selectedOrdersData.reduce((sum, o) => sum + o.totalVolume, 0);
  }, [selectedOrdersData]);

  const handleSelectAll = () => {
    if (selectedOrders.size === pendingOrders?.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(pendingOrders?.map((o) => o.id) || []));
    }
  };

  const handleOptimize = () => {
    if (!selectedTruck || selectedOrders.size === 0) {
      toast.error("Please select a truck and at least one order");
      return;
    }
    
    setIsOptimizing(true);
    optimizeMutation.mutate({
      truckId: Number(selectedTruck),
      orderIds: Array.from(selectedOrders),
    });
  };

  const handleCreateRun = () => {
    if (!optimizationResult) return;
    
    createRunMutation.mutate({
      truckId: Number(selectedTruck),
      orderIds: Array.from(selectedOrders),
      deliverySequence: optimizationResult.deliverySequence,
      packedItems: optimizationResult.packedItems.map((item: any) => ({
        orderItemId: item.orderItemId,
        x: item.x,
        y: item.y,
        z: item.z,
        rotation: item.rotation,
      })),
      runDate,
      driverId: selectedDriver ? Number(selectedDriver) : undefined,
      helperId: selectedHelper ? Number(selectedHelper) : undefined,
    });
  };

  const zoneColors: Record<string, string> = {
    North: "bg-blue-100 text-blue-800",
    South: "bg-green-100 text-green-800",
    East: "bg-yellow-100 text-yellow-800",
    West: "bg-purple-100 text-purple-800",
    Central: "bg-red-100 text-red-800",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Load Optimization</h1>
          <p className="text-muted-foreground">
            Optimize truck loading with 3D bin packing algorithm
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Truck Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Select Truck
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trucksLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a truck" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTrucks.map((truck) => {
                        const volume = Number(truck.width) * Number(truck.depth) * Number(truck.height);
                        return (
                          <SelectItem key={truck.id} value={String(truck.id)}>
                            {truck.truckName} - {truck.width}×{truck.depth}×{truck.height}cm ({(volume / 1000000).toFixed(2)}m³)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            {/* Order Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Select Orders
                    </CardTitle>
                    <CardDescription>
                      {pendingOrders?.length || 0} pending orders available
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    {selectedOrders.size === pendingOrders?.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {pendingOrders?.map((order) => (
                      <div
                        key={order.id}
                        className={`flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedOrders.has(order.id) ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"
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
                            <span className="font-medium">#{order.orderNumber}</span>
                            <Badge className={zoneColors[order.deliveryZone || "Central"]}>
                              <MapPin className="h-3 w-3 mr-1" />
                              {order.deliveryZone}
                            </Badge>
                            {order.needsTwoPeople && (
                              <Badge variant="destructive">Heavy</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {order.items.length} items • {order.totalWeight.toFixed(1)}kg • {(order.totalVolume / 1000000).toFixed(3)}m³
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Summary & Results */}
          <div className="space-y-6">
            {/* Selection Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Selection Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Selected Orders</span>
                  <span className="font-bold">{selectedOrders.size}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Scale className="h-4 w-4" /> Total Weight
                  </span>
                  <span className="font-bold">{totalWeight.toFixed(1)} kg</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Box className="h-4 w-4" /> Total Volume
                  </span>
                  <span className="font-bold">{(totalVolume / 1000000).toFixed(3)} m³</span>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={handleOptimize}
                  disabled={!selectedTruck || selectedOrders.size === 0 || isOptimizing}
                >
                  {isOptimizing ? (
                    <>Optimizing...</>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Run Optimization
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Optimization Results */}
            {optimizationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {optimizationResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    Optimization Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Volume Utilization</span>
                      <span>{optimizationResult.volumeUtilization.toFixed(1)}%</span>
                    </div>
                    <Progress value={optimizationResult.volumeUtilization} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Weight Utilization</span>
                      <span>{optimizationResult.weightUtilization.toFixed(1)}%</span>
                    </div>
                    <Progress value={optimizationResult.weightUtilization} />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Items Packed</span>
                    <span className="font-bold">{optimizationResult.packedItems.length}</span>
                  </div>
                  
                  {optimizationResult.unpackedItems.length > 0 && (
                    <div className="flex items-center justify-between text-yellow-600">
                      <span>Items Not Fitting</span>
                      <span className="font-bold">{optimizationResult.unpackedItems.length}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Load Balanced</span>
                    <Badge variant={optimizationResult.isBalanced ? "default" : "destructive"}>
                      {optimizationResult.isBalanced ? "Yes" : "No"}
                    </Badge>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p>Center of Gravity:</p>
                    <p className="font-mono">
                      X: {optimizationResult.centerOfGravity.x.toFixed(1)}cm, 
                      Y: {optimizationResult.centerOfGravity.y.toFixed(1)}cm, 
                      Z: {optimizationResult.centerOfGravity.z.toFixed(1)}cm
                    </p>
                  </div>
                  
                  <Button 
                    className="w-full" 
                    onClick={() => setShowCreateDialog(true)}
                    disabled={!optimizationResult.success}
                  >
                    Create Delivery Run
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create Delivery Run Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Delivery Run</DialogTitle>
              <DialogDescription>
                Assign personnel and schedule the delivery run
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="runDate">
                  <Calendar className="h-4 w-4 inline mr-2" />
                  Delivery Date
                </Label>
                <Input
                  id="runDate"
                  type="date"
                  value={runDate}
                  onChange={(e) => setRunDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driver">Driver</Label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers?.filter((d) => d.status === "available").map((driver) => (
                      <SelectItem key={driver.id} value={String(driver.id)}>
                        {driver.fullName} ({driver.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="helper">Helper</Label>
                <Select value={selectedHelper} onValueChange={setSelectedHelper}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select helper (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {helpers?.filter((h) => h.status === "available").map((helper) => (
                      <SelectItem key={helper.id} value={String(helper.id)}>
                        {helper.fullName} ({helper.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRun} disabled={createRunMutation.isPending}>
                {createRunMutation.isPending ? "Creating..." : "Create Run"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
