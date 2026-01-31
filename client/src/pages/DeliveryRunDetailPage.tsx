import DashboardLayout from "@/components/DashboardLayout";
import TruckVisualization from "@/components/TruckVisualization";
import DeliveryRouteMap from "@/components/DeliveryRouteMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Truck, 
  Package, 
  User, 
  Calendar,
  Scale,
  Box,
  MapPin,
  Play,
  CheckCircle,
  Eye
} from "lucide-react";
import { useParams, Link } from "wouter";
import { toast } from "sonner";
import { Suspense } from "react";

export default function DeliveryRunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = Number(params.id);
  const utils = trpc.useUtils();
  
  const { data: run, isLoading } = trpc.deliveryRuns.getById.useQuery({ id: runId });
  
  const startMutation = trpc.deliveryRuns.start.useMutation({
    onSuccess: () => {
      utils.deliveryRuns.getById.invalidate({ id: runId });
      toast.success("Delivery run started");
    },
    onError: (error) => toast.error(error.message),
  });
  
  const completeMutation = trpc.deliveryRuns.complete.useMutation({
    onSuccess: () => {
      utils.deliveryRuns.getById.invalidate({ id: runId });
      toast.success("Delivery run completed");
    },
    onError: (error) => toast.error(error.message),
  });

  const statusColors: Record<string, string> = {
    planned: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const zoneColors: Record<string, string> = {
    North: "bg-blue-100 text-blue-800",
    South: "bg-green-100 text-green-800",
    East: "bg-yellow-100 text-yellow-800",
    West: "bg-purple-100 text-purple-800",
    Central: "bg-red-100 text-red-800",
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[500px]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!run) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Delivery run not found</p>
          <Link href="/delivery-runs">
            <Button className="mt-4">Back to Delivery Runs</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Prepare data for 3D visualization
  const truckData = run.truck ? {
    width: Number(run.truck.width),
    depth: Number(run.truck.depth),
    height: Number(run.truck.height),
    name: run.truck.truckName,
  } : { width: 200, depth: 400, height: 200, name: "Unknown" };

  const packedItems = run.loadPlan?.map((item, index) => ({
    id: index,
    orderItemId: item.orderItemId,
    orderId: item.orderId || 0,
    name: item.skuName || "Unknown Item",
    x: Number(item.positionX) || 0,
    y: Number(item.positionY) || 0,
    z: Number(item.positionZ) || 0,
    rotatedLength: Number(item.rotatedLength) || 30,
    rotatedWidth: Number(item.rotatedWidth) || 30,
    height: Number(item.height) || 30,
    weight: Number(item.weight) || 1,
    rotation: item.rotation || 0,
  })) || [];

  // Calculate center of gravity
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  
  packedItems.forEach((item) => {
    const centerX = item.x + item.rotatedLength / 2;
    const centerY = item.y + item.rotatedWidth / 2;
    const centerZ = item.z + item.height / 2;
    
    weightedX += centerX * item.weight;
    weightedY += centerY * item.weight;
    weightedZ += centerZ * item.weight;
    totalWeight += item.weight;
  });

  const centerOfGravity = totalWeight > 0 ? {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight,
    z: weightedZ / totalWeight,
  } : { x: truckData.width / 2, y: truckData.depth / 2, z: 0 };

  // Calculate utilization
  const truckVolume = truckData.width * truckData.depth * truckData.height;
  const itemsVolume = packedItems.reduce((sum, item) => 
    sum + (item.rotatedLength * item.rotatedWidth * item.height), 0);
  const volumeUtilization = truckVolume > 0 ? (itemsVolume / truckVolume) * 100 : 0;
  
  const maxWeight = run.truck?.maxWeight ? Number(run.truck.maxWeight) : 1000;
  const weightUtilization = (totalWeight / maxWeight) * 100;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/delivery-runs">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Delivery Run #{run.id}
              </h1>
              <p className="text-muted-foreground">
                {run.runDate ? new Date(run.runDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }) : "No date set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColors[run.status || "planned"]}>
              {run.status?.replace("_", " ")}
            </Badge>
            {run.status === "planned" && (
              <Button 
                onClick={() => startMutation.mutate({ id: runId })}
                disabled={startMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                Start Run
              </Button>
            )}
            {run.status === "in_progress" && (
              <Button 
                onClick={() => completeMutation.mutate({ id: runId })}
                disabled={completeMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Run
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Truck
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{run.truck?.truckName || "Not assigned"}</p>
              {run.truck && (
                <p className="text-sm text-muted-foreground">
                  {run.truck.width}×{run.truck.depth}×{run.truck.height}cm
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{run.orders?.length || 0}</p>
              <p className="text-sm text-muted-foreground">
                {packedItems.length} items loaded
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Driver
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{run.driver?.fullName || "Not assigned"}</p>
              {run.helper && (
                <p className="text-sm text-muted-foreground">
                  Helper: {run.helper.fullName}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Load
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalWeight.toFixed(1)} kg</p>
              <p className="text-sm text-muted-foreground">
                {(itemsVolume / 1000000).toFixed(3)} m³
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Utilization */}
        <Card>
          <CardHeader>
            <CardTitle>Load Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Volume Utilization
                  </span>
                  <span className="font-medium">{volumeUtilization.toFixed(1)}%</span>
                </div>
                <Progress value={volumeUtilization} className="h-3" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Weight Utilization
                  </span>
                  <span className="font-medium">{weightUtilization.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(weightUtilization, 100)} className="h-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Visualization and Orders */}
        <Tabs defaultValue="3d" className="space-y-4">
          <TabsList>
            <TabsTrigger value="3d">
              <Eye className="h-4 w-4 mr-2" />
              3D Visualization
            </TabsTrigger>
            <TabsTrigger value="orders">
              <Package className="h-4 w-4 mr-2" />
              Orders ({run.orders?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="items">
              <Box className="h-4 w-4 mr-2" />
              Load Plan ({packedItems.length})
            </TabsTrigger>
            <TabsTrigger value="map">
              <MapPin className="h-4 w-4 mr-2" />
              Route Map
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="3d">
            <Card>
              <CardHeader>
                <CardTitle>3D Truck Load Visualization</CardTitle>
                <CardDescription>
                  Interactive view of items loaded in the truck. Drag to rotate, scroll to zoom.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {packedItems.length > 0 ? (
                  <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
                    <TruckVisualization
                      truck={truckData}
                      packedItems={packedItems}
                      centerOfGravity={centerOfGravity}
                    />
                  </Suspense>
                ) : (
                  <div className="h-[500px] flex items-center justify-center bg-slate-100 rounded-lg">
                    <p className="text-muted-foreground">No load plan data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Sequence</CardTitle>
                <CardDescription>
                  Orders in optimized delivery sequence
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seq</TableHead>
                      <TableHead>Order #</TableHead>
                      <TableHead>Zipcode</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.orders?.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Badge variant="outline">{order.sequence}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{order.zipcode}</TableCell>
                        <TableCell>
                          <Badge className={zoneColors[order.deliveryZone || "Central"]}>
                            <MapPin className="h-3 w-3 mr-1" />
                            {order.deliveryZone}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.itemCount} items</TableCell>
                        <TableCell>
                          <Badge variant={order.status === "delivered" ? "default" : "secondary"}>
                            {order.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="items">
            <Card>
              <CardHeader>
                <CardTitle>Load Plan Details</CardTitle>
                <CardDescription>
                  Individual items with their placement coordinates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Position (X, Y, Z)</TableHead>
                      <TableHead>Dimensions</TableHead>
                      <TableHead>Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packedItems.map((item) => (
                      <TableRow key={`${item.orderItemId}-${item.x}-${item.y}`}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>#{item.orderId}</TableCell>
                        <TableCell className="font-mono text-sm">
                          ({item.x}, {item.y}, {item.z})
                        </TableCell>
                        <TableCell>
                          {item.rotatedLength}×{item.rotatedWidth}×{item.height}cm
                        </TableCell>
                        <TableCell>{item.weight}kg</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="map">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Route Map</CardTitle>
                <CardDescription>
                  Visual representation of the delivery route in Singapore
                </CardDescription>
              </CardHeader>
              <CardContent>
                {run.orders && run.orders.length > 0 ? (
                  <DeliveryRouteMap
                    className="h-[500px] rounded-lg"
                    stops={run.orders.map((order) => ({
                      id: order.id,
                      sequence: order.sequence || 0,
                      orderNumber: order.orderNumber,
                      zipcode: order.zipcode,
                      zone: order.deliveryZone || "Central",
                      address: `${order.deliveryZone} Zone - ${order.zipcode}`,
                      lat: order.latitude ? Number(order.latitude) : undefined,
                      lng: order.longitude ? Number(order.longitude) : undefined,
                    }))}
                  />
                ) : (
                  <div className="h-[500px] flex items-center justify-center bg-slate-100 rounded-lg">
                    <p className="text-muted-foreground">No orders to display on map</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
