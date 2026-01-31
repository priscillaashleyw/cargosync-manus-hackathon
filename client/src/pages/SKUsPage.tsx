import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Box, Search, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { BulkImportDialog } from "@/components/BulkImportDialog";

export default function SKUsPage() {
  const utils = trpc.useUtils();
  const { data: skus, isLoading } = trpc.skus.list.useQuery();
  const importSkusMutation = trpc.bulkImport.importSkus.useMutation();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSKUs = skus?.filter((sku) => {
    return sku.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.skuCode.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">SKUs / Products</h1>
            <p className="text-muted-foreground">Product catalog with dimensions and weights</p>
          </div>
          <BulkImportDialog
            title="Import SKUs"
            description="Upload an Excel or CSV file to bulk import products/SKUs."
            templateColumns={["SKU Code", "Name", "Length (cm)", "Width (cm)", "Height (cm)", "Weight (kg)", "Requires Two People"]}
            templateSampleRow={["SKU001", "Office Chair", "60", "60", "100", "15", "no"]}
            onImport={async (fileData, filename) => {
              return await importSkusMutation.mutateAsync({ fileData, filename });
            }}
            onSuccess={() => utils.skus.list.invalidate()}
          />
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or SKU code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* SKUs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Product Catalog
            </CardTitle>
            <CardDescription>
              {filteredSKUs?.length || 0} products
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Dimensions (L × W × H)</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSKUs?.map((sku) => {
                    const length = Number(sku.length) || 0;
                    const width = Number(sku.width) || 0;
                    const height = Number(sku.height) || 0;
                    const weight = Number(sku.weight) || 0;
                    const volume = length * width * height;
                    const hasMissingDimensions = !length || !width || !height;
                    
                    return (
                      <TableRow key={sku.id}>
                        <TableCell className="font-mono text-sm">{sku.skuCode}</TableCell>
                        <TableCell className="font-medium">{sku.name}</TableCell>
                        <TableCell>
                          {hasMissingDimensions ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            `${length} × ${width} × ${height} cm`
                          )}
                        </TableCell>
                        <TableCell>
                          {volume > 0 ? `${(volume / 1000000).toFixed(4)} m³` : "-"}
                        </TableCell>
                        <TableCell>
                          {weight > 0 ? `${weight} kg` : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {sku.requiresTwoPeople && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Heavy
                              </Badge>
                            )}
                            {hasMissingDimensions && (
                              <Badge variant="outline" className="text-yellow-600">
                                Missing dimensions
                              </Badge>
                            )}
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
      </div>
    </DashboardLayout>
  );
}
