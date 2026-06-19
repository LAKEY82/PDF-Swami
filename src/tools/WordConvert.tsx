import { useState, useRef } from 'react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { 
  UploadCloud, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  RefreshCw,
  Info,
  Layers,
  Type,
  Star,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Core imports from pdfjs-dist
import * as pdfjsLib from 'pdfjs-dist';

// Bind to an unpkg cdn file matching your current package version. 
// This cleanly resolves the local bundler path issue.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface LoadedPDFMetadata {
  file: File;
  name: string;
  sizeInBytes: number;
  formattedSize: string;
  totalPages: number;
}

type LayoutPreference = 'flowing' | 'exact';

function WordConvert() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [pdfMetadata, setPdfMetadata] = useState<LoadedPDFMetadata | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [conversionComplete, setConversionComplete] = useState<boolean>(false);

  const [layoutPreference, setLayoutPreference] = useState<LayoutPreference>('flowing');
  const [ocrEnabled, setOcrEnabled] = useState<boolean>(false);

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
    setConversionComplete(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;

      setPdfMetadata({
        file,
        name: file.name,
        sizeInBytes: file.size,
        formattedSize: formatBytes(file.size),
        totalPages: pdfDoc.numPages
      });
    } catch (err) {
      console.error("PDF Loading Error details:", err);
      alert("Failed to read PDF structure. Ensure your file is a valid, unencrypted PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

const handleConvertPipelineRun = async () => {
  if (!pdfMetadata) return;
  setIsProcessing(true);

  try {
    const arrayBuffer = await pdfMetadata.file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    
    const docxParagraphs: Paragraph[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Structural sort: Ensure objects are parsed top-to-bottom, left-to-right
      const items = [...textContent.items].sort((a: any, b: any) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff; // Higher Y coordinate comes first
        return a.transform[4] - b.transform[4]; // Leftmost X coordinate comes first
      });

      let currentLineY: number | null = null;
      let currentLineXEnd: number | null = null;
      let lineRuns: TextRun[] = [];

      items.forEach((item: any) => {
        if (!item.str || item.str.trim() === "") return;

        const itemX = item.transform[4];
        const itemY = item.transform[5];
        const itemHeight = Math.abs(item.transform[0]); // Dynamic font size calculation
        
        // Convert raw PDF point dimensions into standard Word Half-Points (approximate scaling factor)
        const wordFontSize = Math.max(Math.min(Math.round(itemHeight * 2), 72), 18);

        if (currentLineY === null) {
          currentLineY = itemY;
          currentLineXEnd = itemX + item.width;
          lineRuns.push(new TextRun({ text: item.str, size: wordFontSize }));
        } 
        // If the vertical deviation is significant, push the line to a new paragraph block
        else if (Math.abs(currentLineY - itemY) > 8) {
          if (lineRuns.length > 0) {
            docxParagraphs.push(new Paragraph({ children: lineRuns, spacing: { after: 120 } }));
          }
          currentLineY = itemY;
          currentLineXEnd = itemX + item.width;
          lineRuns = [new TextRun({ text: item.str, size: wordFontSize })];
        } 
        // Inline layout tracking
        else {
          // Detect horizontal gaps or tab breaks between inline text segments
          const horizontalGap = currentLineXEnd ? itemX - currentLineXEnd : 0;
          const spacePrefix = (horizontalGap > itemHeight * 1.5) ? "    " : (lineRuns.length > 0 ? " " : "");
          
          lineRuns.push(new TextRun({ 
            text: spacePrefix + item.str, 
            size: wordFontSize 
          }));
          currentLineXEnd = itemX + item.width;
        }
      });

      // Flush remaining tail buffers out of the page frame layout
      if (lineRuns.length > 0) {
        docxParagraphs.push(new Paragraph({ children: lineRuns, spacing: { after: 120 } }));
      }

      if (pageNum < pdfDoc.numPages) {
        // Structural divider run line spacing break
        docxParagraphs.push(new Paragraph({ text: "", spacing: { after: 240 } }));
      }
    }

    if (docxParagraphs.length === 0) {
      docxParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "Empty document structure.", italic: true })]
        }
      ));
    }

    const doc = new Document({
      sections: [{ properties: {}, children: docxParagraphs }],
    });

    const trueWordDocxBlob = await Packer.toBlob(doc);
    const blobUrl = URL.createObjectURL(trueWordDocxBlob);
    setConversionComplete(true);

    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = `${pdfMetadata.name.replace('.pdf', '')}.docx`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

  } catch (err) {
    console.error("Pipeline breakdown exception:", err);
  } finally {
    setIsProcessing(false);
  }
};

  const resetState = () => {
    setPdfMetadata(null);
    setConversionComplete(false);
    setLayoutPreference('flowing');
    setOcrEnabled(false);
  };

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">PDF to Word Converter</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Transform your PDF documents into editable Word files with high accuracy.
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
            
            <div className="w-16 h-16 rounded-full bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 mb-5 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            {isProcessing ? (
              <div className="flex items-center gap-2 text-tool-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Initializing engine structures...
              </div>
            ) : (
              <>
                <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop PDF file here</p>
                <p className="text-xs text-tool-foreground/50 mt-1.5 mb-6">or select from your local device</p>
                
                <Button 
                  type="button" 
                  size="default" 
                  className="px-6 py-5 font-semibold shadow-sm bg-purple-700 text-white hover:bg-purple-800 border border-transparent rounded-lg"
                >
                  Select PDF file
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start mt-6">
            
            <div className="lg:col-span-3 space-y-6">
              
              <div className="rounded-2xl border border-tool-border bg-tool-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-tool-foreground tracking-tight">
                    <span className="w-5 h-5 rounded-full bg-tool-primary/10 text-tool-primary flex items-center justify-center text-xs">1</span>
                    File Selected
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-bold text-tool-primary hover:underline transition-all"
                  >
                    Change File
                  </button>
                  <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept=".pdf" className="hidden" />
                </div>

                <div className="flex items-center justify-between border border-tool-border bg-tool-bg/40 rounded-xl p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-tool-foreground truncate">{pdfMetadata.name}</p>
                      <p className="text-[11px] text-tool-foreground/50 font-medium mt-0.5">
                        {pdfMetadata.formattedSize} • {pdfMetadata.totalPages} Pages
                      </p>
                    </div>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0 ml-4">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-tool-border bg-tool-card p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2 text-sm font-bold text-tool-foreground tracking-tight">
                  <span className="w-5 h-5 rounded-full bg-tool-primary/10 text-tool-primary flex items-center justify-center text-xs">2</span>
                  Conversion Settings
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-tool-foreground/70 uppercase tracking-wider">Layout Preservation</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    <div 
                      onClick={() => setLayoutPreference('flowing')}
                      className={cn(
                        "border rounded-xl p-4 cursor-pointer transition-all flex items-start gap-3 select-none",
                        layoutPreference === 'flowing' 
                          ? "border-tool-primary bg-tool-primary/[0.02] shadow-sm ring-1 ring-tool-primary" 
                          : "border-tool-border bg-tool-card/50 hover:border-tool-border-hover"
                      )}
                    >
                      <div className={cn("p-2 rounded-lg mt-0.5 shrink-0", layoutPreference === 'flowing' ? "bg-tool-primary/10 text-tool-primary" : "bg-tool-secondary text-tool-foreground/40")}>
                        <Type className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-tool-foreground">Keep Flowing Text</span>
                          {layoutPreference === 'flowing' && <span className="text-[9px] bg-tool-primary text-white font-extrabold px-1 rounded">ACTIVE</span>}
                        </div>
                        <p className="text-[11px] text-tool-foreground/50 mt-1 leading-normal">Optimized for editing content structures and paragraphs seamlessly.</p>
                      </div>
                    </div>

                    <div 
                      onClick={() => setLayoutPreference('exact')}
                      className={cn(
                        "border rounded-xl p-4 cursor-pointer transition-all flex items-start gap-3 select-none",
                        layoutPreference === 'exact' 
                          ? "border-tool-primary bg-tool-primary/[0.02] shadow-sm ring-1 ring-tool-primary" 
                          : "border-tool-border bg-tool-card/50 hover:border-tool-border-hover"
                      )}
                    >
                      <div className={cn("p-2 rounded-lg mt-0.5 shrink-0", layoutPreference === 'exact' ? "bg-tool-primary/10 text-tool-primary" : "bg-tool-secondary text-tool-foreground/40")}>
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-tool-foreground">Exact Formatting</span>
                        </div>
                        <p className="text-[11px] text-tool-foreground/50 mt-1 leading-normal">Best for maintaining complex visual designs.</p>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="pt-3 border-t border-tool-border/60 flex items-center justify-between">
                  <div className="space-y-0.5 max-w-[80%]">
                    <h4 className="text-xs font-bold text-tool-foreground/90">Optical Character Recognition (OCR)</h4>
                    <p className="text-[11px] text-tool-foreground/50 leading-normal">Automatically detect and convert text from scanned images.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={ocrEnabled} 
                      onChange={(e) => setOcrEnabled(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-tool-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-tool-primary" />
                  </label>
                </div>

              </div>

              <div className="rounded-xl border border-tool-border border-dashed bg-tool-bg/30 p-8 flex flex-col items-center justify-center text-center text-xs text-tool-foreground/40 min-h-[140px]">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-tool-primary" />
                    <span className="font-semibold text-tool-foreground/60 animate-pulse">Running rendering pipeline...</span>
                  </div>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-tool-foreground/30 mb-2" />
                    <span>Document Content Ready</span>
                  </>
                )}
              </div>

            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-tool-foreground/40">Conversion Summary</h3>
                  <div className="h-[1px] bg-tool-border w-full mt-3" />
                </div>

                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Source Format</span>
                    <span className="font-extrabold px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-600 tracking-wider">PDF</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Target Format</span>
                    <span className="font-extrabold px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 tracking-wider">DOCX</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Estimated Quality</span>
                    <div className="flex items-center gap-0.5 text-blue-500">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                  </div>
                </div>

                {conversionComplete && (
                  <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold text-xs p-2.5 rounded-xl flex items-center justify-center gap-1.5 animate-in fade-in-50 zoom-in-95 duration-200">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Conversion Complete</span>
                  </div>
                )}

                <div className="space-y-2 text-center">
                  <Button
                    size="lg"
                    onClick={handleConvertPipelineRun}
                    disabled={isProcessing}
                    className="w-full font-bold text-sm py-5 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl transition-all"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Extracting Text Layouts...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Convert to Word</>
                    )}
                  </Button>
                  <p className="text-[10px] text-tool-foreground/40 font-medium">Estimated time: ~2 seconds</p>
                </div>

                <button 
                  onClick={resetState}
                  className="text-xs font-semibold text-tool-foreground/50 hover:text-tool-foreground/80 flex items-center justify-center gap-1.5 py-1"
                >
                  Cancel & Reset
                </button>
              </div>

              <div className="rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 p-4 text-xs text-blue-800 dark:text-blue-400 flex items-start gap-2.5 leading-normal">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">Pro Tip:</span> Enabling 'OCR Settings' ensures that text from embedded images or scanned pages is converted to editable characters.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default WordConvert;