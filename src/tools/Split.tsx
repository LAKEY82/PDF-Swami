import React, { useState, useRef, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  UploadCloud, 
  X, 
  FileText, 
//   ArrowLeft, 
  Loader2, 
  Scissors, 
  Plus, 
  Trash2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Set up pdfjs worker globally using a reliable unpkg CDN link
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PageThumbnail {
  pageNumber: number;
  dataUrl: string | null;
}

interface PageRange {
  id: string;
  from: string;
  to: string;
}

function Split() {
//   const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File state variables
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  
  // UI and logic processing flags
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isProcessingSplit, setIsProcessingSplit] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  
  // Splitting control state variables
  const [ranges, setRanges] = useState<PageRange[]>([
    { id: 'initial-range-id-1', from: '1', to: '3' }
  ]);

  // Compute targeted individual page numbers derived from structural input fields
  const getSelectedPageNumbers = (): Set<number> => {
    const selected = new Set<number>();
    ranges.forEach(range => {
      const start = parseInt(range.from, 10);
      const end = parseInt(range.to, 10);
      if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          selected.add(i);
        }
      }
    });
    return selected;
  };

  const selectedPageNumbers = getSelectedPageNumbers();

  // Reset page ranges intelligently if user scales past upper limitations
  useEffect(() => {
    if (totalPages > 0) {
      setRanges([{ id: 'range-1', from: '1', to: '3' }]);
    }
  }, [totalPages]);

  // Render text page canvases inside browser worker pools locally
  const generateThumbnails = async (file: File, total: number) => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const initialThumbnails: PageThumbnail[] = Array.from({ length: total }, (_, i) => ({
      pageNumber: i + 1,
      dataUrl: null
    }));
    setThumbnails(initialThumbnails);

    // Limit automatic text container extraction pools to protect standard mobile memory bounds
    for (let i = 1; i <= Math.min(total, 12); i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 }); // Small crisp scale matching standard card slots
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          // FIXED: Passed 'canvas' alongside canvasContext to satisfy modern pdfjs-dist parameter rules
          await page.render({ 
            canvasContext: context, 
            viewport,
            canvas
          }).promise;
          
          const dataUrl = canvas.toDataURL('image/png');
          setThumbnails(prev => prev.map(t => t.pageNumber === i ? { ...t, dataUrl } : t));
        }
      } catch (err) {
        console.error(`Failed rendering matrix canvas block for page ${i}:`, err);
      }
    }
  };

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf') return;

    setSelectedFile(file);
    setIsLoadingFile(true);

    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
      const count = pdfDoc.getPageCount();
      setTotalPages(count);
      
      // Async render process running down background thread strings
      generateThumbnails(file, count);
    } catch (err) {
      console.error("Critical error mapping document boundaries:", err);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Add / Modify splitting page blocks array sets
  const addRangeRow = () => {
    const lastRange = ranges[ranges.length - 1];
    let nextFrom = '1';
    let nextTo = '1';
    
    if (lastRange) {
      const lastTo = parseInt(lastRange.to, 10);
      if (!isNaN(lastTo) && lastTo < totalPages) {
        nextFrom = String(lastTo + 1);
        nextTo = String(Math.min(lastTo + 3, totalPages));
      }
    }
    
    setRanges([...ranges, { id: `range-${Date.now()}`, from: nextFrom, to: nextTo }]);
  };

  const updateRangeValue = (id: string, field: 'from' | 'to', value: string) => {
    setRanges(ranges.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRangeRow = (id: string) => {
    if (ranges.length === 1) return;
    setRanges(ranges.filter(r => r.id !== id));
  };

  // Extract selected page nodes safely inside client context
  const handleSplitAndDownload = async () => {
    if (!selectedFile || selectedPageNumbers.size === 0) return;
    setIsProcessingSplit(true);

    try {
      const fileBytes = await selectedFile.arrayBuffer();
      const sourcePdf = await PDFDocument.load(fileBytes);
      const outputPdf = await PDFDocument.create();
      
      // Convert to 0-indexed values required by pdf-lib framework mapping calls
      const indicesToCopy = Array.from(selectedPageNumbers)
        .map(num => num - 1)
        .sort((a, b) => a - b);
      
      const copiedPages = await outputPdf.copyPages(sourcePdf, indicesToCopy);
      copiedPages.forEach((page) => outputPdf.addPage(page));
      
      const outputBytes = await outputPdf.save();
      
      // Binary clean-pass compiler configuration workaround
      const safeBytes = new Uint8Array(outputBytes);
      const blob = new Blob([safeBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Split_${selectedFile.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Splitting pipeline crashed down compiler boundaries:", error);
    } finally {
      setIsProcessingSplit(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[250px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* <Button 
          variant="ghost" 
          size="sm" 
          className="mb-6 group text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/selection')}
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to tools
        </Button> */}

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Split PDF File</h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            Extract pages or split your PDF into multiple files with ease.
          </p>
        </div>

        {!selectedFile ? (
          /* Initial File Drop Area Container */
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); handleFileImport(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 bg-card/20 backdrop-blur-sm text-center max-w-4xl mx-auto",
              isDraggingOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-border hover:bg-card/40"
            )}
          >
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept=".pdf" className="hidden" />
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <UploadCloud className="w-7 h-7" />
            </div>
            {isLoadingFile ? (
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-primary" /> Reading metadata layouts...
              </div>
            ) : (
              <>
                <p className="font-medium text-foreground text-base">Drag & drop PDF file here</p>
                <p className="text-xs text-muted-foreground mt-1 mb-5">or select from your local device</p>
                <Button type="button" size="sm" className="px-6 font-semibold shadow-sm">Select PDF file</Button>
              </>
            )}
          </div>
        ) : (
          /* Dual Column Layout Matching Uploaded Specifications Diagram */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
            
            {/* Left Box Display Column containing Page Tiles */}
            <div className="lg:col-span-2 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/60 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-6">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold truncate max-w-sm sm:max-w-md">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 bg-muted px-2 py-0.5 rounded-full font-medium">({totalPages} pages)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-muted-foreground"><ZoomIn className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-muted-foreground"><ZoomOut className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="w-8 h-8 rounded-lg text-muted-foreground hover:text-red-500"><X className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Grid Wrapper Container Mapping */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                {thumbnails.map((thumb) => {
                  const isSelected = selectedPageNumbers.has(thumb.pageNumber);
                  return (
                    <div 
                      key={thumb.pageNumber}
                      className={cn(
                        "group relative flex flex-col items-center p-3 rounded-xl border transition-all duration-200 bg-background/50",
                        isSelected 
                          ? "border-primary ring-2 ring-primary/20 bg-background shadow-sm" 
                          : "border-border/50 hover:border-border"
                      )}
                    >
                      {/* Selection Badge Index Bubble Component */}
                      <div className={cn(
                        "absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border transition-all",
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-muted border-border/80 text-muted-foreground group-hover:border-muted-foreground"
                      )}>
                        {thumb.pageNumber}
                      </div>

                      {/* Display Box Area Container Block */}
                      <div className="aspect-[3/4] w-full rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center overflow-hidden relative shadow-sm">
                        {thumb.dataUrl ? (
                          <img src={thumb.dataUrl} alt={`Page ${thumb.pageNumber}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 p-4 text-center">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Page {thumb.pageNumber}</span>
                            <span className="text-[9px] text-muted-foreground/40 leading-tight">Content Preview</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground mt-2">Page {thumb.pageNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Interactive Sidebar Column */}
            <div className="rounded-2xl bg-card border border-border/60 p-6 shadow-sm flex flex-col gap-6">
              <div>
                <h3 className="text-base font-bold tracking-tight text-foreground">Split Mode</h3>
                <div className="h-[1px] bg-border/40 w-full mt-3" />
              </div>

              {/* Dynamic Range Rows Input Blocks */}
              <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-1">
                <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80">Page Range</span>
                
                {ranges.map((range, index) => (
                  <div key={range.id} className="flex items-center gap-2 group animate-in fade-in-50 duration-150">
                    <div className="grid grid-cols-2 gap-2 flex-grow">
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">From</label>
                        <input 
                          type="number" 
                          min="1" 
                          max={totalPages}
                          value={range.from}
                          onChange={(e) => updateRangeValue(range.id, 'from', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-primary text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">To</label>
                        <input 
                          type="number" 
                          min={range.from}
                          max={totalPages}
                          value={range.to}
                          onChange={(e) => updateRangeValue(range.id, 'to', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-primary text-center"
                        />
                      </div>
                    </div>
                    {ranges.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 rounded-lg self-end text-muted-foreground/60 hover:text-red-500 shrink-0"
                        onClick={() => removeRangeRow(range.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="w-full font-semibold border-dashed mt-2 text-xs gap-1 py-4"
                  onClick={addRangeRow}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Range
                </Button>
              </div>

              {/* Selection Summary Block Box */}
              <div className="rounded-xl bg-muted/40 border border-border/40 p-4 text-sm space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium pb-1.5 border-b border-border/40">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Selection Details
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Pages Selected</span>
                  <span className="font-bold text-foreground">{selectedPageNumbers.size} {selectedPageNumbers.size === 1 ? 'page' : 'pages'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Estimated Output</span>
                  <span className="font-bold text-foreground">1 PDF file</span>
                </div>
              </div>

              {/* Trigger Operation Action */}
              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={handleSplitAndDownload}
                  disabled={isProcessingSplit || selectedPageNumbers.size === 0}
                  className="w-full font-semibold text-sm py-5 gap-2 shadow-sm"
                >
                  {isProcessingSplit ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Processing Split...</>
                  ) : (
                    <><Scissors className="w-4 h-4" />Split & Download</>
                  )}
                </Button>
                <p className="text-[10px] text-center text-muted-foreground mt-3 leading-normal">
                  Processing is done locally in your browser for maximum security.
                </p>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default Split;