import React, { useState, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { 
  UploadCloud, 
  X, 
  FileText, 
  // ArrowLeft, 
  Loader2, 
  Combine,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MergeFileItem {
  id: string;
  file: File;
  name: string;
  size: string;
  pageCount: number;
}

function Merge() {
  // const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<MergeFileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const processNewFiles = async (selectedFiles: FileList) => {
    const newItems: MergeFileItem[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.type !== 'application/pdf') continue;

      try {
        const buffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
        const pageCount = pdfDoc.getPageCount();

        newItems.push({
          id: `${file.name}-${Date.now()}-${i}`,
          file,
          name: file.name,
          size: formatBytes(file.size),
          pageCount,
        });
      } catch (err) {
        console.error("Error reading PDF metadata structures:", err);
      }
    }
    setFiles((prev) => [...prev, ...newItems]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processNewFiles(e.target.files);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    const updatedFiles = [...files];
    const temp = updatedFiles[index];
    updatedFiles[index] = updatedFiles[targetIndex];
    updatedFiles[targetIndex] = temp;
    setFiles(updatedFiles);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMergeAndDownload = async () => {
    if (files.length === 0) return;
    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const item of files) {
        const fileBytes = await item.file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      
      const mergedPdfBytes = await mergedPdf.save();
      const safeBytes = new Uint8Array(mergedPdfBytes);
      
      const blob = new Blob([safeBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Merged_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Merge client sequence failed:", error);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-4 py-12 md:py-16 relative overflow-hidden">
      {/* Background Accent Gradient Glow mapped to tool blue accent alpha channel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* <Button 
          variant="ghost" 
          size="sm" 
          className="mb-6 group text-tool-foreground/60 hover:text-tool-foreground hover:bg-tool-border/30 transition-colors"
          onClick={() => navigate('/selection')}
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform text-tool-primary" />
          Back to tools
        </Button> */}

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Merge PDF Files</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Combine multiple PDF documents into a single professional file in seconds.
          </p>
        </div>

        {/* Upload Slot Area adjusted to match split layout theme */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files) processNewFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 bg-tool-card text-center mb-8 shadow-sm",
            isDraggingOver ? "border-tool-primary bg-tool-secondary/40" : "border-tool-border hover:border-tool-primary"
          )}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept=".pdf" className="hidden" />
          <div className="w-14 h-14 rounded-full bg-tool-secondary flex items-center justify-center text-tool-primary mb-4 shadow-sm">
            <UploadCloud className="w-7 h-7" />
          </div>
          <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop PDF files here</p>
          <p className="text-xs text-tool-foreground/50 mt-1.5 mb-5">or select from your local device</p>
          <Button type="button" size="sm" className="px-6 font-semibold shadow-sm bg-tool-primary text-white hover:bg-tool-primary/90 border border-transparent rounded-lg">Select PDF files</Button>
        </div>

        {/* Selected View List Layout */}
        {files.length > 0 && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between border-b border-tool-border pb-2 text-sm text-tool-foreground/70">
              <div className="flex items-center gap-2">
                <span>Files to merge</span>
                <span className="text-xs text-tool-primary bg-tool-secondary px-2.5 py-0.5 rounded-full font-semibold">{files.length}</span>
              </div>
              <span className="text-xs text-tool-foreground/40 font-medium">Adjust order sequence using control triggers</span>
            </div>

            <div className="space-y-2.5">
              {files.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-tool-card border border-tool-border shadow-sm transition-all hover:border-tool-foreground/60">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Control Shift Handles */}
                    <div className="flex flex-col gap-0.5">
                      <button 
                        disabled={index === 0}
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'up'); }}
                        className="p-1 text-tool-foreground/40 hover:text-tool-primary disabled:opacity-20 disabled:hover:text-tool-foreground/40 transition-colors rounded-md hover:bg-tool-bg"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button 
                        disabled={index === files.length - 1}
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'down'); }}
                        className="p-1 text-tool-foreground/40 hover:text-tool-primary disabled:opacity-20 disabled:hover:text-tool-foreground/40 transition-colors rounded-md hover:bg-tool-bg"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Document Icon Placeholder Box */}
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0 shadow-inner">
                      <FileText className="w-5 h-5" />
                    </div>
                    
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-tool-foreground truncate max-w-sm md:max-w-lg">{item.name}</p>
                      <p className="text-xs text-tool-foreground/60 font-medium mt-0.5">{item.size} • {item.pageCount} {item.pageCount === 1 ? 'Page' : 'Pages'}</p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-tool-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors rounded-lg"
                    onClick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Merge Action Submission Block */}
            <div className="mt-8 pt-4 flex justify-end">
              <Button 
                size="lg" 
                onClick={handleMergeAndDownload} 
                disabled={isMerging} 
                className="px-8 py-5 font-bold text-sm gap-2 bg-tool-primary text-white hover:bg-tool-primary/90 shadow-md transition-all focus:ring-2 focus:ring-tool-primary/40 disabled:bg-tool-border disabled:text-tool-foreground/40 flex items-center justify-center rounded-lg"
              >
                {isMerging ? (
                  <><Loader2 className="w-5 h-5 animate-spin text-white" />Merging Files...</>
                ) : (
                  <><Combine className="w-5 h-5 text-white" />Merge and Download</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Merge;