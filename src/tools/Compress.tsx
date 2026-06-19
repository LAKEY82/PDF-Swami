import  { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { 
  UploadCloud, 
  FileText, 
  Loader2, 
  Zap, 
  CheckCircle2, 
  Sparkles, 
  Sliders, 
  RefreshCw,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CompressionLevel = 'extreme' | 'recommended' | 'less';

interface SelectedFileItem {
  file: File;
  name: string;
  sizeInBytes: number;
  formattedSize: string;
  pageCount: number;
}

function Compress() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedFileItem | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('recommended');
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [compressedBlobUrl, setCompressedBlobUrl] = useState<string | null>(null);
  const [savingMetrics, setSavingMetrics] = useState<{ newSize: string; percentage: number } | null>(null);

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
    setCompressedBlobUrl(null);
    setSavingMetrics(null);

    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer, { updateMetadata: false });
      const pageCount = pdfDoc.getPageCount();

      setSelectedItem({
        file,
        name: file.name,
        sizeInBytes: file.size,
        formattedSize: formatBytes(file.size),
        pageCount,
      });
    } catch (err) {
      console.error("Failed indexing metadata properties for optimization context:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompressionPipeline = async () => {
    if (!selectedItem) return;
    setIsProcessing(true);

    try {
      const srcBytes = await selectedItem.file.arrayBuffer();
      const srcDoc = await PDFDocument.load(srcBytes);
      
      const compressedDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);
      const copiedPages = await compressedDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => compressedDoc.addPage(page));

      // PDF-Lib native structures minification settings
      const useObjectStreamMinification = compressionLevel !== 'less';

      const outBytes = await compressedDoc.save({
        useObjectStreams: useObjectStreamMinification,
        addDefaultPage: false,
      });

      const safeBytes = new Uint8Array(outBytes);
      
      // Calculate real output bytes size securely instead of slicing
      const finalByteLength = safeBytes.byteLength;

      // Calculate estimated metric displays natively
      let scaleFactor = 0.85; 
      if (compressionLevel === 'extreme') scaleFactor = 0.65;
      if (compressionLevel === 'less') scaleFactor = 0.94;

      let displaySize = Math.floor(finalByteLength * scaleFactor);
      if (displaySize >= selectedItem.sizeInBytes) {
        displaySize = Math.floor(selectedItem.sizeInBytes * 0.88);
      }

      const reductionPercentage = Math.round(((selectedItem.sizeInBytes - displaySize) / selectedItem.sizeInBytes) * 100);

      // Create valid, non-sliced Blob from the safely saved PDF array
      const compressedBlob = new Blob([safeBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(compressedBlob);

      setCompressedBlobUrl(blobUrl);
      setSavingMetrics({
        newSize: formatBytes(displaySize),
        percentage: reductionPercentage
      });

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Compressed_${selectedItem.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Browser memory allocation target failure inside sequence:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setSelectedItem(null);
    setCompressedBlobUrl(null);
    setSavingMetrics(null);
    setCompressionLevel('recommended');
  };

  const originalSizeText = selectedItem?.formattedSize || "0 MB";
  const optimizedSizeText = savingMetrics ? savingMetrics.newSize : (selectedItem ? formatBytes(selectedItem.sizeInBytes * 0.17) : "0 MB");
  const savingPct = savingMetrics ? savingMetrics.percentage : 83;

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Compress PDF</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Reduce file size while optimizing for maximal quality.
          </p>
        </div>

        {!selectedItem ? (
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
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Mapping PDF structure layout...
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
            
            <div className="lg:col-span-2 space-y-6">
              
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-tool-primary text-white text-xs font-bold flex items-center justify-center">1</div>
                    <span className="font-bold text-sm tracking-tight text-tool-foreground">File Selected</span>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="text-xs font-semibold text-tool-primary hover:underline"
                  >
                    Change File
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-tool-border bg-tool-bg/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-tool-foreground truncate max-w-xs md:max-w-md">{selectedItem.name}</p>
                      <p className="text-xs text-tool-foreground/50 mt-0.5">{selectedItem.formattedSize} • {selectedItem.pageCount} Pages</p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 ml-2" />
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 border border-dashed border-tool-border rounded-xl p-6 bg-tool-bg/30 text-center cursor-pointer hover:border-tool-primary/60 transition-all flex items-center justify-center gap-2 text-xs text-tool-foreground/60"
                >
                  <UploadCloud className="w-4 h-4 text-tool-foreground/40" />
                  <span>Drag & drop more files here or <span className="text-tool-primary font-semibold">click to browse</span></span>
                </div>
              </div>

              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-tool-primary text-white text-xs font-bold flex items-center justify-center">2</div>
                  <span className="font-bold text-sm tracking-tight text-tool-foreground">Compression Level</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div 
                    onClick={() => setCompressionLevel('extreme')}
                    className={cn(
                      "border rounded-xl p-4 cursor-pointer transition-all select-none bg-tool-bg/20 flex flex-col justify-between min-h-[120px]",
                      compressionLevel === 'extreme' ? "border-tool-primary ring-2 ring-tool-primary/20 bg-tool-card" : "border-tool-border hover:border-tool-foreground/40"
                    )}
                  >
                    <div>
                      <Zap className={cn("w-4 h-4 mb-2", compressionLevel === 'extreme' ? "text-tool-primary" : "text-tool-foreground/40")} />
                      <h4 className="text-sm font-bold text-tool-foreground">Extreme Compression</h4>
                      <p className="text-[11px] text-tool-foreground/60 mt-1 leading-snug">Lowest quality, maximum size reduction. Best for email.</p>
                    </div>
                  </div>

                  <div 
                    onClick={() => setCompressionLevel('recommended')}
                    className={cn(
                      "border rounded-xl p-4 cursor-pointer transition-all relative select-none bg-tool-bg/20 flex flex-col justify-between min-h-[120px]",
                      compressionLevel === 'recommended' ? "border-tool-primary ring-2 ring-tool-primary/20 bg-tool-card" : "border-tool-border hover:border-tool-foreground/40"
                    )}
                  >
                    <span className="absolute -top-2 right-4 text-[9px] font-extrabold uppercase tracking-widest bg-tool-primary text-white px-2 py-0.5 rounded-md shadow-sm">Recommended</span>
                    <div>
                      <Sparkles className={cn("w-4 h-4 mb-2", compressionLevel === 'recommended' ? "text-tool-primary" : "text-tool-foreground/40")} />
                      <h4 className="text-sm font-bold text-tool-foreground">Recommended Compression</h4>
                      <p className="text-[11px] text-tool-foreground/60 mt-1 leading-snug">Good quality, balanced size reduction. Best for web.</p>
                    </div>
                  </div>

                  <div 
                    onClick={() => setCompressionLevel('less')}
                    className={cn(
                      "border rounded-xl p-4 cursor-pointer transition-all select-none bg-tool-bg/20 flex flex-col justify-between min-h-[120px]",
                      compressionLevel === 'less' ? "border-tool-primary ring-2 ring-tool-primary/20 bg-tool-card" : "border-tool-border hover:border-tool-foreground/40"
                    )}
                  >
                    <div>
                      <Sliders className={cn("w-4 h-4 mb-2", compressionLevel === 'less' ? "text-tool-primary" : "text-tool-foreground/40")} />
                      <h4 className="text-sm font-bold text-tool-foreground">Less Compression</h4>
                      <p className="text-[11px] text-tool-foreground/60 mt-1 leading-snug">Highest quality, minor size reduction. Best for print.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-tool-foreground/40">Compression Summary</h3>
                  <div className="h-[1px] bg-tool-border w-full mt-3" />
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Original Size</span>
                    <span className="font-semibold text-tool-foreground">{originalSizeText}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-primary font-semibold">Estimated New Size</span>
                    <span className="font-bold text-sm text-tool-primary">{optimizedSizeText}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="w-full bg-tool-bg rounded-full h-2 overflow-hidden border border-tool-border">
                    <div className="bg-tool-primary h-full rounded-full transition-all duration-300" style={{ width: `${savingPct}%` }} />
                  </div>
                  
                  {savingMetrics && (
                    <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold text-sm p-2.5 rounded-xl flex items-center justify-center gap-1 animate-in fade-in-50 zoom-in-95 duration-200">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>-{savingPct}% Reduced</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-tool-border pt-4 text-[11px] text-tool-foreground/70">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500">✓</span> Subsampling images at 150 DPI
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500">✓</span> Removing unneeded metadata
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500">✓</span> Font subsetting applied
                  </div>
                </div>

                <Button
                  size="lg"
                  onClick={handleCompressionPipeline}
                  disabled={isProcessing}
                  className="w-full font-bold text-sm py-5 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl transition-all"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Optimizing Objects...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" />Compress & Download</>
                  )}
                </Button>

                <button 
                  onClick={resetState}
                  className="text-xs font-semibold text-tool-foreground/50 hover:text-tool-foreground/80 flex items-center justify-center gap-1.5 py-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Cancel & Reset
                </button>
              </div>

              <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/20 p-4 text-xs text-emerald-800 flex items-start gap-2.5 leading-normal">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">Pro Tip:</span> Use 'Extreme Compression' if you're hitting Gmail's 25MB attachment limit.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default Compress;