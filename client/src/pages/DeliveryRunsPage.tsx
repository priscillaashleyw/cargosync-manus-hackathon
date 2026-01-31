import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Eye, Play, CheckCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function DeliveryRunsPage() {
  const utils = trpc.useUtils();
  const { data: runs, isLoading } = trpc.deliveryRuns.list.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const startMutation = trpc.deliveryRuns.start.useMutation({
    onSuccess: () => {
      utils.deliveryRuns.list.invalidate();
      toast.success("Delivery run started");
    },
    onError: (error) => toast.error(error.message),
  });
  
  const completeMutation = trpc.deliveryRuns.complete.useMutation({
    onSuccess: () => {
      utils.deliveryRuns.list.invalidate();
      toast.success("Delivery run completed");
    },
    onError: (error) => toast.error(error.message),
  });
  
  const deleteMutation = trpc.deliveryRuns.delete.useMutation({
    onSuccess: () => {
      utils.deliveryRuns.list.invalidate();
      toast.success("Delivery run deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const filteredRuns = runs?.filter((run) => {
    return statusFilter === "all" || run.status === statusFilter;
  });

  const statusColors: Record<string, string> = {
    planned: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Delivery Runs</h1>
            <p className="text-muted-foreground">Manage and track delivery runs</p>
          </div>
          <Link href="/optimize">
            <Button>
              Create New Run
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Runs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Delivery Runs
            </CardTitle>
            <CardDescription>
              {filteredRuns?.length || 0} delivery runs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredRuns && filteredRuns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">#{run.id}</TableCell>
                      <TableCell>
                        {run.runDate ? new Date(run.runDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>{run.truckName || "-"}</TableCell>
                      <TableCell>{run.orderCount} orders</TableCell>
                      <TableCell>
                        <Badge className={statusColors[run.status || "planned"]}>
                          {run.status?.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/delivery-runs/${run.id}`}>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {run.status === "planned" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startMutation.mutate({ id: run.id })}
                              disabled={startMutation.isPending}
                            >
                              <Play className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {run.status === "in_progress" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => completeMutation.mutate({ id: run.id })}
                              disabled={completeMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {run.status === "planned" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this delivery run?")) {
                                  deleteMutation.mutate({ id: run.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No delivery runs found</p>
                <p className="text-sm mt-2">Create a new delivery run from the Optimize page</p>
                <Link href="/optimize">
                  <Button className="mt-4">Go to Optimize</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
