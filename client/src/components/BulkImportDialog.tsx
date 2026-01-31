import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Download, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BulkImportDialogProps {
  title: string;
  description: string;
  templateColumns: string[];
  templateSampleRow: string[];
  onImport: (fileData: string, filename: string) => Promise<{
    success: boolean;
    imported: number;
    errors: number;
    importedItems: string[];
    errorDetails: string[];
  }>;
  onSuccess?: () => void;
}

export function BulkImportDialog({
  title,
  description,
  templateColumns,
  templateSampleRow,
  onImport,
  onSuccess,
}: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    imported: number;
    errors: number;
    importedItems: string[];
    errorDetails: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
      ];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith(".csv") && !selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
        toast.error("Please select an Excel (.xlsx, .xls) or CSV file");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        try {
          const importResult = await onImport(base64, file.name);
          setResult(importResult);
          if (importResult.imported > 0) {
            toast.success(`Successfully imported ${importResult.imported} items`);
            onSuccess?.();
          }
          if (importResult.errors > 0) {
            toast.warning(`${importResult.errors} rows had errors`);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Import failed");
          setResult({
            success: false,
            imported: 0,
            errors: 1,
            importedItems: [],
            errorDetails: [err instanceof Error ? err.message : "Unknown error"],
          });
        }
        setImporting(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Failed to read file");
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    // Create CSV content
    const csvContent = [
      templateColumns.join(","),
      templateSampleRow.join(","),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const resetDialog = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetDialog();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import Excel/CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Download */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Download Template</p>
                <p className="text-xs text-muted-foreground">
                  Use this template to ensure correct column format
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Expected columns:</p>
              <p className="font-mono bg-background rounded px-2 py-1 overflow-x-auto">
                {templateColumns.join(" | ")}
              </p>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {file ? file.name : "Click to select file"}
              </span>
              <span className="text-xs text-muted-foreground">
                Supports .xlsx, .xls, .csv
              </span>
            </label>
          </div>

          {/* Import Result */}
          {result && (
            <div className={`rounded-lg p-4 ${result.imported > 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.imported > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">
                  {result.imported > 0
                    ? `Successfully imported ${result.imported} items`
                    : "Import failed"}
                </span>
              </div>
              {result.errors > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-600 mb-1">
                    {result.errors} errors:
                  </p>
                  <ul className="text-xs text-red-600 list-disc list-inside max-h-32 overflow-y-auto">
                    {result.errorDetails.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errorDetails.length > 10 && (
                      <li>...and {result.errorDetails.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
              {result.imported > 0 && result.importedItems.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-green-600 mb-1">Imported:</p>
                  <p className="text-xs text-green-600 max-h-20 overflow-y-auto">
                    {result.importedItems.slice(0, 10).join(", ")}
                    {result.importedItems.length > 10 && ` ...and ${result.importedItems.length - 10} more`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {result?.imported ? "Done" : "Cancel"}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || importing}
            className="gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
