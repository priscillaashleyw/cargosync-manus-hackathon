import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Truck, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function TrucksPage() {
  const utils = trpc.useUtils();
  const { data: trucks, isLoading } = trpc.trucks.list.useQuery();
  const createMutation = trpc.trucks.create.useMutation({
    onSuccess: () => {
      utils.trucks.list.invalidate();
      toast.success("Truck created successfully");
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateMutation = trpc.trucks.update.useMutation({
    onSuccess: () => {
      utils.trucks.list.invalidate();
      toast.success("Truck updated successfully");
      setIsEditOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deleteMutation = trpc.trucks.delete.useMutation({
    onSuccess: () => {
      utils.trucks.list.invalidate();
      toast.success("Truck deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateStatusMutation = trpc.trucks.updateStatus.useMutation({
    onSuccess: () => {
      utils.trucks.list.invalidate();
      toast.success("Status updated");
    },
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  type TruckType = { id: number; truckName: string; width: string; depth: string; height: string; maxWeight: string | null; status: "available" | "on_route" | "in_transit" | "maintenance"; createdAt: Date; updatedAt: Date; };
  const [editingTruck, setEditingTruck] = useState<TruckType | null>(null);
  const [formData, setFormData] = useState({
    truckName: "",
    width: "",
    depth: "",
    height: "",
    maxWeight: "1000",
  });

  const resetForm = () => {
    setFormData({
      truckName: "",
      width: "",
      depth: "",
      height: "",
      maxWeight: "1000",
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      truckName: formData.truckName,
      width: Number(formData.width),
      depth: Number(formData.depth),
      height: Number(formData.height),
      maxWeight: Number(formData.maxWeight),
    });
  };

  const handleEdit = (truck: NonNullable<typeof editingTruck>) => {
    setEditingTruck(truck);
    setFormData({
      truckName: truck.truckName,
      width: String(truck.width),
      depth: String(truck.depth),
      height: String(truck.height),
      maxWeight: String(truck.maxWeight),
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingTruck) return;
    updateMutation.mutate({
      id: editingTruck.id,
      data: {
        truckName: formData.truckName,
        width: Number(formData.width),
        depth: Number(formData.depth),
        height: Number(formData.height),
        maxWeight: Number(formData.maxWeight),
      },
    });
  };

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    in_transit: "bg-blue-100 text-blue-800",
    maintenance: "bg-red-100 text-red-800",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trucks</h1>
            <p className="text-muted-foreground">Manage your fleet of trucks</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Truck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Truck</DialogTitle>
                <DialogDescription>Enter the truck details below</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="truckName">Truck Name</Label>
                  <Input
                    id="truckName"
                    value={formData.truckName}
                    onChange={(e) => setFormData({ ...formData, truckName: e.target.value })}
                    placeholder="e.g., Truck 6"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="width">Width (cm)</Label>
                    <Input
                      id="width"
                      type="number"
                      value={formData.width}
                      onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="depth">Depth (cm)</Label>
                    <Input
                      id="depth"
                      type="number"
                      value={formData.depth}
                      onChange={(e) => setFormData({ ...formData, depth: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="height">Height (cm)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={formData.height}
                      onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxWeight">Max Weight (kg)</Label>
                  <Input
                    id="maxWeight"
                    type="number"
                    value={formData.maxWeight}
                    onChange={(e) => setFormData({ ...formData, maxWeight: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Fleet Overview
            </CardTitle>
            <CardDescription>
              {trucks?.length || 0} trucks in your fleet
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Dimensions (W × D × H)</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Max Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trucks?.map((truck) => {
                    const volume = Number(truck.width) * Number(truck.depth) * Number(truck.height);
                    return (
                      <TableRow key={truck.id}>
                        <TableCell className="font-medium">{truck.truckName}</TableCell>
                        <TableCell>
                          {truck.width} × {truck.depth} × {truck.height} cm
                        </TableCell>
                        <TableCell>{(volume / 1000000).toFixed(2)} m³</TableCell>
                        <TableCell>{truck.maxWeight} kg</TableCell>
                        <TableCell>
                          <Select
                            value={truck.status}
                            onValueChange={(value) => {
                              updateStatusMutation.mutate({
                                id: truck.id,
                                status: value as "available" | "in_transit" | "maintenance",
                              });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <Badge className={statusColors[truck.status]}>
                                {truck.status.replace("_", " ")}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="in_transit">In Transit</SelectItem>
                              <SelectItem value="maintenance">Maintenance</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(truck)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this truck?")) {
                                  deleteMutation.mutate({ id: truck.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Truck</DialogTitle>
              <DialogDescription>Update the truck details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-truckName">Truck Name</Label>
                <Input
                  id="edit-truckName"
                  value={formData.truckName}
                  onChange={(e) => setFormData({ ...formData, truckName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-width">Width (cm)</Label>
                  <Input
                    id="edit-width"
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-depth">Depth (cm)</Label>
                  <Input
                    id="edit-depth"
                    type="number"
                    value={formData.depth}
                    onChange={(e) => setFormData({ ...formData, depth: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-height">Height (cm)</Label>
                  <Input
                    id="edit-height"
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-maxWeight">Max Weight (kg)</Label>
                <Input
                  id="edit-maxWeight"
                  type="number"
                  value={formData.maxWeight}
                  onChange={(e) => setFormData({ ...formData, maxWeight: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
