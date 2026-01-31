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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Users, Plus, Pencil, Trash2, Car, HardHat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PersonnelType = {
  id: number;
  employeeId: string;
  fullName: string;
  phone: string | null;
  personnelType: "driver" | "helper";
  status: "available" | "assigned" | "on_route" | "off_duty";
  createdAt: Date;
  updatedAt: Date;
};

export default function PersonnelPage() {
  const utils = trpc.useUtils();
  const { data: personnel, isLoading } = trpc.personnel.list.useQuery();
  const createMutation = trpc.personnel.create.useMutation({
    onSuccess: () => {
      utils.personnel.list.invalidate();
      toast.success("Personnel created successfully");
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.personnel.update.useMutation({
    onSuccess: () => {
      utils.personnel.list.invalidate();
      toast.success("Personnel updated successfully");
      setIsEditOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = trpc.personnel.delete.useMutation({
    onSuccess: () => {
      utils.personnel.list.invalidate();
      toast.success("Personnel deleted successfully");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatusMutation = trpc.personnel.updateStatus.useMutation({
    onSuccess: () => {
      utils.personnel.list.invalidate();
      toast.success("Status updated");
    },
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonnelType | null>(null);
  const [formData, setFormData] = useState({
    employeeId: "",
    fullName: "",
    phone: "",
    personnelType: "driver" as "driver" | "helper",
  });

  const resetForm = () => {
    setFormData({
      employeeId: "",
      fullName: "",
      phone: "",
      personnelType: "driver",
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      employeeId: formData.employeeId,
      fullName: formData.fullName,
      phone: formData.phone || undefined,
      personnelType: formData.personnelType,
    });
  };

  const handleEdit = (person: PersonnelType) => {
    setEditingPerson(person);
    setFormData({
      employeeId: person.employeeId,
      fullName: person.fullName,
      phone: person.phone || "",
      personnelType: person.personnelType,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingPerson) return;
    updateMutation.mutate({
      id: editingPerson.id,
      data: {
        employeeId: formData.employeeId,
        fullName: formData.fullName,
        phone: formData.phone || undefined,
        personnelType: formData.personnelType,
      },
    });
  };

  const drivers = personnel?.filter((p) => p.personnelType === "driver") || [];
  const helpers = personnel?.filter((p) => p.personnelType === "helper") || [];

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    assigned: "bg-blue-100 text-blue-800",
    off_duty: "bg-gray-100 text-gray-800",
  };

  const PersonnelTable = ({ data }: { data: PersonnelType[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((person) => (
          <TableRow key={person.id}>
            <TableCell className="font-medium">{person.employeeId}</TableCell>
            <TableCell>{person.fullName}</TableCell>
            <TableCell>{person.phone || "-"}</TableCell>
            <TableCell>
              <Select
                value={person.status}
                onValueChange={(value) => {
                  updateStatusMutation.mutate({
                    id: person.id,
                    status: value as "available" | "assigned" | "off_duty",
                  });
                }}
              >
                <SelectTrigger className="w-32">
                  <Badge className={statusColors[person.status]}>
                    {person.status.replace("_", " ")}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="off_duty">Off Duty</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(person)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this person?")) {
                      deleteMutation.mutate({ id: person.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Personnel</h1>
            <p className="text-muted-foreground">Manage drivers and helpers</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Personnel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Personnel</DialogTitle>
                <DialogDescription>Enter the personnel details below</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    placeholder="e.g., DRV004"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+65 9xxx xxxx"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.personnelType}
                    onValueChange={(value) => setFormData({ ...formData, personnelType: value as "driver" | "helper" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="helper">Helper</SelectItem>
                    </SelectContent>
                  </Select>
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

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Drivers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-blue-600" />
                <span className="text-3xl font-bold">{drivers.length}</span>
                <span className="text-sm text-muted-foreground">
                  ({drivers.filter((d) => d.status === "available").length} available)
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Helpers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <HardHat className="h-5 w-5 text-orange-600" />
                <span className="text-3xl font-bold">{helpers.length}</span>
                <span className="text-sm text-muted-foreground">
                  ({helpers.filter((h) => h.status === "available").length} available)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Personnel List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="drivers">
                <TabsList>
                  <TabsTrigger value="drivers">
                    <Car className="h-4 w-4 mr-2" />
                    Drivers ({drivers.length})
                  </TabsTrigger>
                  <TabsTrigger value="helpers">
                    <HardHat className="h-4 w-4 mr-2" />
                    Helpers ({helpers.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="drivers" className="mt-4">
                  <PersonnelTable data={drivers} />
                </TabsContent>
                <TabsContent value="helpers" className="mt-4">
                  <PersonnelTable data={helpers} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Personnel</DialogTitle>
              <DialogDescription>Update the personnel details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-employeeId">Employee ID</Label>
                <Input
                  id="edit-employeeId"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-fullName">Full Name</Label>
                <Input
                  id="edit-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select
                  value={formData.personnelType}
                  onValueChange={(value) => setFormData({ ...formData, personnelType: value as "driver" | "helper" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="helper">Helper</SelectItem>
                  </SelectContent>
                </Select>
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
