import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { 
  UploadCloud, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  RefreshCw,
  Info,
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Undo2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PDFPageItem {
  id: string;
  originalIndex: number;
  currentPageNumber: number;
}

interface LoadedPDFMetadata {
  file: File;
  name: string;
  sizeInBytes: number;
  formattedSize: string;
}

function Organize() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfMetadata, setPdfMetadata] = useState<LoadedPDFMetadata | null>(null);
  const [pages, setPages] = useState<PDFPageItem[]>([]);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [hasChanged, setHasChanged] = useState<boolean>(false);
  const [successBlobUrl, setSuccessBlobUrl] = useState<string | null>(null);

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf') return;

    setIsProcessing(true);
    setSuccessBlobUrl(null);
    setHasChanged(false);

    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
      const totalPagesCount = pdfDoc.getPageCount();

      const pageItems: PDFPageItem[] = Array.from({ length: totalPagesCount }, (_, index) => ({
        id: crypto.randomUUID(),
        originalIndex: index,
        currentPageNumber: index + 1,
      }));

      setPages(pageItems);
      setPdfMetadata({
        file,
        name: file.name,
        sizeInBytes: file.size,
        formattedSize: formatBytes(file.size),
      });
    } catch (err) {
      console.error("Failed unpacking PDF layout structure mapping:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const movePage = (currentIndex: number, direction: 'left' | 'right') => {
    if (direction === 'left' && currentIndex === 0) return;
    if (direction === 'right' && currentIndex === pages.length - 1) return;

    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    const reorderedPages = [...pages];

    // Swap positions
    const temp = reorderedPages[currentIndex];
    reorderedPages[currentIndex] = reorderedPages[targetIndex];
    reorderedPages[targetIndex] = temp;

    // Dynamically update human-readable sequential tracking index numbers
    const updatedSequence = reorderedPages.map((page, idx) => ({
      ...page,
      currentPageNumber: idx + 1
    }));

    setPages(updatedSequence);
    setHasChanged(true);
    setSuccessBlobUrl(null);
  };

  const removePage = (currentIndex: number) => {
    const updatedPages = pages
      .filter((_, idx) => idx !== currentIndex)
      .map((page, idx) => ({
        ...page,
        currentPageNumber: idx + 1
      }));

    setPages(updatedPages);
    setHasChanged(true);
    setSuccessBlobUrl(null);
  };

  // Reverts sequence structure back to initial array chronological states
  const handleRevertToOriginalOrder = () => {
    if (pages.length === 0) return;
    
    const restoredSequence = [...pages]
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map((page, idx) => ({
        ...page,
        currentPageNumber: idx + 1
      }));
      
    setPages(restoredSequence);
    setHasChanged(false);
    setSuccessBlobUrl(null);
  };

  const handleSaveAndDownload = async () => {
    if (!pdfMetadata || pages.length === 0) return;
    setIsProcessing(true);

    try {
      const srcBytes = await pdfMetadata.file.arrayBuffer();
      const srcDoc = await PDFDocument.load(srcBytes);
      const outputDoc = await PDFDocument.create();

      // Pluck out targeted original raw indices mapping arrays sequentially
      const pageMappingIndices = pages.map(p => p.originalIndex);
      const copiedPages = await outputDoc.copyPages(srcDoc, pageMappingIndices);
      
      copiedPages.forEach((page) => outputDoc.addPage(page));

      const finalBytes = await outputDoc.save();
      
      // Explicitly cast the buffer to ArrayBuffer to prevent SharedArrayBuffer warnings
      const rawBuffer = finalBytes.buffer as ArrayBuffer;
      const blob = new Blob([rawBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      setSuccessBlobUrl(blobUrl);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Organized_${pdfMetadata.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Failed compiled pipeline file save script:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setPdfMetadata(null);
    setPages([]);
    setHasChanged(false);
    setSuccessBlobUrl(null);
  };

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Organize PDF</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Reorder, rotate, or remove pages from your PDF documents with clinical precision.
          </p>
        </div>

        {!pdfMetadata ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); handleFileImport(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 bg-tool-card text-center max-w-4xl mx-auto shadow-sm mt-8",
              isDraggingOver ? "border-tool-primary bg-tool-secondary/40" : "border-tool-border hover:border-tool-primary"
            )}
          >
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept=".pdf" className="hidden" />
            
            <div className="w-16 h-16 rounded-full bg-tool-secondary flex items-center justify-center text-tool-primary mb-5 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            {isProcessing ? (
              <div className="flex items-center gap-2 text-tool-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Decomposing PDF layers...
              </div>
            ) : (
              <>
                <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop PDF file here</p>
                <p className="text-xs text-tool-foreground/50 mt-1.5 mb-6">or select from your local device</p>
                
                <Button 
                  type="button" 
                  size="default" 
                  className="px-6 py-5 font-semibold shadow-sm bg-tool-primary text-white hover:bg-tool-primary/90 border border-transparent rounded-lg"
                >
                  Select PDF file
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start mt-6">
            
            {/* Grid Workspace Area */}
            <div className="lg:col-span-3 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[680px] overflow-y-auto p-1 pr-2">
                {pages.map((page, index) => (
                  <div 
                    key={page.id} 
                    className="group border border-tool-border bg-tool-card rounded-xl p-3 flex flex-col justify-between items-center text-center shadow-sm relative transition-all duration-200 hover:border-tool-primary hover:shadow"
                  >
                    {/* Visual Blueprint/Thumbnail Placeholder Container Box */}
                    <div className="w-full aspect-[3/4] rounded-lg bg-slate-900/10 dark:bg-slate-100/10 flex flex-col items-center justify-center border border-tool-border/60 relative overflow-hidden mb-3">
                      <div className="absolute top-2 left-2 bg-tool-bg/80 backdrop-blur text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-tool-border">
                        Orig: #{page.originalIndex + 1}
                      </div>
                      <FileText className="w-8 h-8 text-tool-primary/40 group-hover:scale-110 transition-transform duration-200" />
                    </div>

                    {/* Footer Row Controls */}
                    <div className="w-full flex items-center justify-between border-t border-tool-border/60 pt-2 text-xs">
                      <span className="font-bold text-tool-foreground/70">Page {page.currentPageNumber}</span>
                      
                      <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          disabled={index === 0}
                          onClick={() => movePage(index, 'left')}
                          className="p-1 rounded hover:bg-tool-secondary text-tool-foreground/60 disabled:opacity-20"
                          title="Move Back"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={index === pages.length - 1}
                          onClick={() => movePage(index, 'right')}
                          className="p-1 rounded hover:bg-tool-secondary text-tool-foreground/60 disabled:opacity-20"
                          title="Move Forward"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removePage(index)}
                          className="p-1 rounded hover:bg-red-500/10 text-tool-foreground/40 hover:text-red-500"
                          title="Delete Page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Document Sidebar Summary panel */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-tool-foreground/40">Document Summary</h3>
                  <div className="h-[1px] bg-tool-border w-full mt-3" />
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Total Pages</span>
                    <span className="font-bold text-sm text-tool-foreground">{pages.length}</span>
                  </div>
                  <div className="flex justify-between items-start flex-col gap-1.5 border-b border-tool-border/40 pb-3">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-tool-foreground/60">Original Order</span>
                      <span className={cn(
                        "font-semibold text-xs px-2 py-0.5 rounded-full flex items-center gap-1",
                        hasChanged ? "bg-amber-500/10 text-amber-600" : "bg-tool-secondary text-tool-foreground/70"
                      )}>
                        {hasChanged ? (
                          <><ArrowLeftRight className="w-3 h-3" /> Changed</>
                        ) : (
                          "Unchanged"
                        )}
                      </span>
                    </div>
                    {/* NEW: Revert action row option rendered underneath status indicators */}
                    {hasChanged && (
                      <button
                        type="button"
                        onClick={handleRevertToOriginalOrder}
                        className="text-[11px] font-bold text-tool-primary hover:text-tool-primary/80 flex items-center gap-1 mt-0.5 transition-colors self-end"
                      >
                        <Undo2 className="w-3 h-3" /> Reset Order
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-tool-foreground/60">File Size</span>
                    <span className="font-semibold text-tool-foreground">{pdfMetadata.formattedSize}</span>
                  </div>
                </div>

                {successBlobUrl && (
                  <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold text-xs p-2.5 rounded-xl flex items-center justify-center gap-1 animate-in fade-in-50 zoom-in-95 duration-200">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Layout Saved & Compiled</span>
                  </div>
                )}

                <Button
                  size="lg"
                  onClick={handleSaveAndDownload}
                  disabled={isProcessing || pages.length === 0}
                  className="w-full font-bold text-sm py-5 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl transition-all"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Assembling Pages...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" />Save & Download</>
                  )}
                </Button>

                <button 
                  onClick={resetState}
                  className="text-xs font-semibold text-tool-foreground/50 hover:text-tool-foreground/80 flex items-center justify-center gap-1.5 py-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Document
                </button>
              </div>

              <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/20 p-4 text-xs text-emerald-800 flex items-start gap-2.5 leading-normal">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">Pro Tip:</span> Use the micro alignment inline navigation buttons under each workspace panel card to cycle arrangements instantly.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default Organize;