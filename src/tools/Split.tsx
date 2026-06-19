import  { useState, useRef, useEffect } from 'react';
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
  ZoomOut,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isProcessingSplit, setIsProcessingSplit] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  
  const [ranges, setRanges] = useState<PageRange[]>([
    { id: 'initial-range-id-1', from: '1', to: '3' }
  ]);

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

  useEffect(() => {
    if (totalPages > 0) {
      setRanges([{ id: 'range-1', from: '1', to: '3' }]);
    }
  }, [totalPages]);

  const generateThumbnails = async (file: File, total: number) => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const initialThumbnails: PageThumbnail[] = Array.from({ length: total }, (_, i) => ({
      pageNumber: i + 1,
      dataUrl: null
    }));
    setThumbnails(initialThumbnails);

    for (let i = 1; i <= Math.min(total, 12); i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ 
            canvasContext: context, 
            viewport,
            canvas
          }).promise;
          
          const dataUrl = canvas.toDataURL('image/png');
          setThumbnails(prev => prev.map(t => t.pageNumber === i ? { ...t, dataUrl } : t));
        }
      } catch (err) {
        console.error(`Failed rendering thumbnail layout for page ${i}:`, err);
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
      
      generateThumbnails(file, count);
    } catch (err) {
      console.error("Error standardizing target document:", err);
    } finally {
      setIsLoadingFile(false);
    }
  };

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

  const handleSplitAndDownload = async () => {
    if (!selectedFile || ranges.length === 0) return;
    setIsProcessingSplit(true);

    try {
      const fileBytes = await selectedFile.arrayBuffer();
      const baseName = selectedFile.name.replace(/\.pdf$/i, '');
      
      // Iterate through each discrete range configured by the user
      for (const range of ranges) {
        const start = parseInt(range.from, 10);
        const end = parseInt(range.to, 10);

        // Sanity validation checking
        if (isNaN(start) || isNaN(end) || start > totalPages || end < start) {
          console.warn(`Skipping invalid split window range setup: ${range.from}-${range.to}`);
          continue;
        }

        const validStart = Math.max(1, start);
        const validEnd = Math.min(totalPages, end);

        // Create independent clean scopes per file loop
        const sourcePdf = await PDFDocument.load(fileBytes);
        const outputPdf = await PDFDocument.create();
        
        const indicesToCopy: number[] = [];
        for (let i = validStart; i <= validEnd; i++) {
          indicesToCopy.push(i - 1); // 0-indexed alignment for pdf-lib API 
        }

        if (indicesToCopy.length === 0) continue;

        const copiedPages = await outputPdf.copyPages(sourcePdf, indicesToCopy);
        copiedPages.forEach((page) => outputPdf.addPage(page));
        
        const outputBytes = await outputPdf.save();
        const safeBytes = new Uint8Array(outputBytes);
        const blob = new Blob([safeBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Dynamic file label descriptor format construction
        const labelSuffix = validStart === validEnd ? `${validStart}` : `${validStart}-${validEnd}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${baseName}_pages_${labelSuffix}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Splitting action failed execution chains:", error);
    } finally {
      setIsProcessingSplit(false);
    }
  };

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      {/* Background Accent Radial Burst Gradient Glow using your vivid tool blue */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
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
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Split PDF File</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Extract pages or split your PDF into multiple files with ease.
          </p>
        </div>

        {!selectedFile ? (
          /* File Import Drop Slot */
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

            {isLoadingFile ? (
              <div className="flex items-center gap-2 text-tool-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Indexing layout boundaries...
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
          /* Operational Split Layout Workspace Layout */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
            
            {/* Left Content Column holding page grids */}
            <div className="lg:col-span-2 rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-tool-border pb-4 mb-6">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold truncate max-w-sm sm:max-w-md text-tool-foreground">{selectedFile.name}</span>
                  <span className="text-xs text-tool-primary shrink-0 bg-tool-secondary px-2.5 py-0.5 rounded-full font-semibold">({totalPages} pages)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:bg-tool-border/30"><ZoomIn className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:bg-border/30"><ZoomOut className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:text-destructive hover:bg-destructive/10"><X className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Grid System Holder for Page Items */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                {thumbnails.map((thumb) => {
                  const isSelected = selectedPageNumbers.has(thumb.pageNumber);
                  return (
                    <div 
                      key={thumb.pageNumber}
                      className={cn(
                        "group relative flex flex-col items-center p-3 rounded-xl border transition-all duration-200 bg-tool-bg cursor-pointer select-none",
                        isSelected 
                          ? "border-tool-primary ring-2 ring-tool-primary/20 bg-tool-card shadow-sm" 
                          : "border-tool-border hover:border-tool-foreground/60"
                      )}
                    >
                      {/* Selection Tracker Badge Bubble Element */}
                      <div className={cn(
                        "absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border transition-all shadow-sm",
                        isSelected 
                          ? "bg-tool-primary text-white border-tool-primary" 
                          : "bg-tool-card border-tool-border text-tool-foreground/60 group-hover:border-tool-foreground"
                      )}>
                        {thumb.pageNumber}
                      </div>

                      {/* Document Image View Container */}
                      <div className={cn(
                        "aspect-[3/4] w-full rounded-lg flex items-center justify-center overflow-hidden relative shadow-inner transition-colors border",
                        isSelected ? "bg-tool-secondary/40 border-tool-primary/30" : "bg-tool-card border-tool-border"
                      )}>
                        {thumb.dataUrl ? (
                          <img src={thumb.dataUrl} alt={`Page ${thumb.pageNumber}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 p-4 text-center">
                            <span className="text-[10px] uppercase tracking-wider text-tool-foreground/50 font-semibold">Page {thumb.pageNumber}</span>
                            <span className="text-[9px] text-tool-foreground/40 leading-tight">Content Preview</span>
                          </div>
                        )}
                      </div>
                      <span className={cn(
                        "text-xs font-semibold mt-2 transition-colors",
                        isSelected ? "text-tool-primary" : "text-tool-foreground/70"
                      )}>Page {thumb.pageNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Side Options Panel Container */}
            <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-tool-foreground">Split Mode</h3>
                <div className="h-[1px] bg-tool-border w-full mt-3" />
              </div>

              {/* Dynamic Range Inserter Rows Section */}
              <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-1">
                <span className="text-xs uppercase tracking-wider font-bold text-tool-foreground/50 block mb-1">Page Range</span>
                
                {ranges.map((range) => (
                  <div key={range.id} className="flex items-center gap-2 group animate-in fade-in-50 duration-150">
                    <div className="grid grid-cols-2 gap-3 flex-grow">
                      <div>
                        <label className="text-[11px] font-semibold text-tool-foreground/50 block mb-1">From</label>
                        <input 
                          type="number" 
                          min="1" 
                          max={totalPages}
                          value={range.from}
                          onChange={(e) => updateRangeValue(range.id, 'from', e.target.value)}
                          className="w-full bg-tool-bg border border-tool-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-tool-primary focus:ring-1 focus:ring-tool-primary/30 text-center text-tool-foreground transition-all shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-tool-foreground/50 block mb-1">To</label>
                        <input 
                          type="number" 
                          min={range.from}
                          max={totalPages}
                          value={range.to}
                          onChange={(e) => updateRangeValue(range.id, 'to', e.target.value)}
                          className="w-full bg-tool-bg border border-tool-border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-tool-primary focus:ring-1 focus:ring-tool-primary/30 text-center text-tool-foreground transition-all shadow-sm"
                        />
                      </div>
                    </div>
                    {ranges.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-9 h-9 rounded-lg self-end text-tool-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0 mb-0.5"
                        onClick={() => removeRangeRow(range.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="w-full font-bold border-dashed border-tool-border text-tool-foreground hover:text-tool-primary hover:border-tool-primary hover:bg-tool-secondary/40 mt-3 text-xs gap-1.5 py-4 transition-all"
                  onClick={addRangeRow}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Range
                </Button>
                <p className="text-[11px] italic text-tool-foreground/40 mt-1 pl-0.5">Example: 1-5, 8, 11-12</p>
              </div>

              {/* Selection Summary details box segment */}
              <div className="rounded-xl bg-tool-secondary/30 border border-tool-border/60 p-4 text-sm space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs text-tool-primary font-bold pb-2 border-b border-tool-border/60">
                  <span className="inline-block w-2 h-2 rounded-full bg-tool-primary animate-pulse" /> Selection Details
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-tool-foreground/70">Pages Selected</span>
                  <span className="font-bold text-tool-foreground">{selectedPageNumbers.size} {selectedPageNumbers.size === 1 ? 'page' : 'pages'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-tool-foreground/70">Estimated Output</span>
                  <span className="font-bold text-tool-foreground">
                    {ranges.length} {ranges.length === 1 ? 'PDF file' : 'PDF files'}
                  </span>
                </div>
              </div>

              {/* Primary Processing Action Operator buttons */}
              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={handleSplitAndDownload}
                  disabled={isProcessingSplit || selectedPageNumbers.size === 0}
                  className="w-full font-bold text-sm py-6 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 focus:ring-2 focus:ring-tool-primary/40 disabled:bg-tool-border disabled:text-tool-foreground/40 transition-all flex items-center justify-center rounded-lg"
                >
                  {isProcessingSplit ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Processing Split...</>
                  ) : (
                    <><Scissors className="w-4 h-4" />Split & Download <Download className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
                <p className="text-[10px] text-center text-tool-foreground/40 mt-3.5 leading-normal">
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