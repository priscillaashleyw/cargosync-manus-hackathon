import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { 
  Truck, 
  Package, 
  Users, 
  ClipboardList, 
  MapPin, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

function DashboardContent() {
  const { data: summary, isLoading } = trpc.dashboard.summary.useQuery();
  const { data: tracker } = trpc.dashboard.deliveryTracker.useQuery();
  const { data: truckUtil } = trpc.dashboard.truckUtilization.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Trucks",
      value: summary?.trucks?.total || 0,
      description: `${summary?.trucks?.available || 0} available`,
      icon: Truck,
      color: "text-blue-600",
    },
    {
      title: "Total Orders",
      value: summary?.orders?.total || 0,
      description: `${summary?.orders?.pending || 0} pending`,
      icon: Package,
      color: "text-green-600",
    },
    {
      title: "Delivery Runs",
      value: summary?.deliveryRuns?.total || 0,
      description: `${summary?.deliveryRuns?.inProgress || 0} in progress`,
      icon: ClipboardList,
      color: "text-purple-600",
    },
    {
      title: "Personnel",
      value: summary?.personnel?.total || 0,
      description: `${summary?.personnel?.available || 0} available`,
      icon: Users,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orders by Zone */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Orders by Zone
            </CardTitle>
            <CardDescription>Distribution of orders across delivery zones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary?.ordersByZone?.map((zone) => {
                const total = summary?.orders?.total || 1;
                const percentage = ((zone.count / total) * 100).toFixed(1);
                const colors: Record<string, string> = {
                  North: "bg-blue-500",
                  South: "bg-green-500",
                  East: "bg-yellow-500",
                  West: "bg-purple-500",
                  Central: "bg-red-500",
                };
                return (
                  <div key={zone.zone} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{zone.zone || "Unknown"}</span>
                      <span className="text-sm text-muted-foreground">
                        {zone.count} orders ({percentage}%)
                      </span>
                    </div>
                    <Progress 
                      value={Number(percentage)} 
                      className="h-2"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Active Deliveries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Active Deliveries
            </CardTitle>
            <CardDescription>Currently in-progress delivery runs</CardDescription>
          </CardHeader>
          <CardContent>
            {tracker && tracker.length > 0 ? (
              <div className="space-y-4">
                {tracker.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Truck className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{run.truckName}</p>
                        <p className="text-sm text-muted-foreground">
                          {run.deliveredOrders}/{run.totalOrders} delivered
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={run.progress === 100 ? "default" : "secondary"}>
                        {run.progress.toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2" />
                <p>No active deliveries</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Truck Utilization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Fleet Status
          </CardTitle>
          <CardDescription>Current status and capacity of all trucks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {truckUtil?.map((truck) => {
              const statusColors: Record<string, string> = {
                available: "bg-green-100 text-green-800",
                in_transit: "bg-blue-100 text-blue-800",
                maintenance: "bg-red-100 text-red-800",
              };
              return (
                <div key={truck.truckId} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">{truck.truckName}</h4>
                    <Badge className={statusColors[truck.status || "available"]}>
                      {truck.status?.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Dimensions:</span>
                      <span>{truck.width} × {truck.depth} × {truck.height} cm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume:</span>
                      <span>{(truck.volume / 1000000).toFixed(2)} m³</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Runs:</span>
                      <span>{truck.totalRuns}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Order Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order Status Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{summary?.orders?.pending || 0}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{summary?.orders?.allocated || 0}</p>
                <p className="text-sm text-muted-foreground">Allocated</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <Truck className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{summary?.orders?.inTransit || 0}</p>
                <p className="text-sm text-muted-foreground">In Transit</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{summary?.orders?.delivered || 0}</p>
                <p className="text-sm text-muted-foreground">Delivered</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{summary?.orders?.cancelled || 0}</p>
                <p className="text-sm text-muted-foreground">Cancelled</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your logistics operations
          </p>
        </div>
        <DashboardContent />
      </div>
    </DashboardLayout>
  );
}
