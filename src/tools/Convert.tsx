import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { 
  UploadCloud, 
  Loader2, 
  CheckCircle2, 
  RefreshCw,
  Info,
  ArrowUp,
  ArrowDown,
  Trash2,
  ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageFileItem {
  id: string;
  file: File;
  name: string;
  sizeInBytes: number;
  formattedSize: string;
  previewUrl: string;
}

function Convert() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageItems, setImageItems] = useState<ImageFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleFileImport = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validExtensions = ['image/jpeg', 'image/png', 'image/webp'];
    const newItems: ImageFileItem[] = [];

    Array.from(files).forEach((file) => {
      if (!validExtensions.includes(file.type)) return;

      newItems.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        sizeInBytes: file.size,
        formattedSize: formatBytes(file.size),
        previewUrl: URL.createObjectURL(file),
      });
    });

    if (newItems.length > 0) {
      setImageItems((prev) => [...prev, ...newItems]);
      setPdfBlobUrl(null); 
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === imageItems.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updatedItems = [...imageItems];
    
    const temp = updatedItems[index];
    updatedItems[index] = updatedItems[targetIndex];
    updatedItems[targetIndex] = temp;

    setImageItems(updatedItems);
    setPdfBlobUrl(null);
  };

  const removeItem = (id: string, previewUrl: string) => {
    URL.revokeObjectURL(previewUrl); 
    setImageItems((prev) => prev.filter((item) => item.id !== id));
    setPdfBlobUrl(null);
  };

const handlePdfGenerationPipeline = async () => {
    if (imageItems.length === 0) return;
    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const item of imageItems) {
        const imageBytes = await item.file.arrayBuffer();
        let embeddedImage;

        if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        } else if (item.file.type === 'image/png') {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } else if (item.file.type === 'image/webp') {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        }

        if (embeddedImage) {
          const { width, height } = embeddedImage.scale(1);
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width,
            height,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      
      // FIX: Explicitly cast the buffer to ArrayBuffer to clear the SharedArrayBuffer warning
      const rawBuffer = pdfBytes.buffer as ArrayBuffer;
      const blob = new Blob([rawBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      setPdfBlobUrl(blobUrl);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Compiled_Images_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Failed assembling images pipeline matrix context:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    imageItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setImageItems([]);
    setPdfBlobUrl(null);
  };

  const totalSizeSum = imageItems.reduce((acc, curr) => acc + curr.sizeInBytes, 0);

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Convert Image to PDF</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Convert JPG, PNG, and WEBP files into clean, beautifully formatted PDFs.
          </p>
        </div>

        {imageItems.length === 0 ? (
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
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept="image/png, image/jpeg, image/jpg, image/webp" multiple className="hidden" />
            
            <div className="w-16 h-16 rounded-full bg-tool-secondary flex items-center justify-center text-tool-primary mb-5 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop images here</p>
            <p className="text-xs text-tool-foreground/50 mt-1.5 mb-6">Supports multiple PNG, JPEG, and WEBP files</p>
            
            <Button 
              type="button" 
              size="default" 
              className="px-6 py-5 font-semibold shadow-sm bg-tool-primary text-white hover:bg-tool-primary/90 border border-transparent rounded-lg"
            >
              Select Images
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
            
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-tool-primary text-white text-xs font-bold flex items-center justify-center">1</div>
                    <span className="font-bold text-sm tracking-tight text-tool-foreground">Arrange Sequence Order</span>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept="image/png, image/jpeg, image/jpg, image/webp" multiple className="hidden" />
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="text-xs font-semibold text-tool-primary hover:underline"
                  >
                    + Add More Images
                  </button>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {imageItems.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-tool-border bg-tool-bg/40 hover:bg-tool-bg/80 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-tool-secondary overflow-hidden border border-tool-border shrink-0 flex items-center justify-center">
                          <img src={item.previewUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-tool-foreground truncate max-w-xs md:max-w-md">{item.name}</p>
                          <p className="text-xs text-tool-foreground/50 mt-0.5">Page {index + 1} • {item.formattedSize}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={index === 0}
                          onClick={() => moveItem(index, 'up')}
                          className="p-1.5 rounded-md hover:bg-tool-secondary text-tool-foreground/60 hover:text-tool-primary disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          disabled={index === imageItems.length - 1}
                          onClick={() => moveItem(index, 'down')}
                          className="p-1.5 rounded-md hover:bg-tool-secondary text-tool-foreground/60 hover:text-tool-primary disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <div className="h-4 w-[1px] bg-tool-border mx-1" />
                        <button
                          onClick={() => removeItem(item.id, item.previewUrl)}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-tool-foreground/40 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-tool-foreground/40">Conversion Summary</h3>
                  <div className="h-[1px] bg-tool-border w-full mt-3" />
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Total Images</span>
                    <span className="font-semibold text-tool-foreground">{imageItems.length} Files</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Total Payload Size</span>
                    <span className="font-semibold text-tool-foreground">{formatBytes(totalSizeSum)}</span>
                  </div>
                </div>

                {pdfBlobUrl && (
                  <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold text-sm p-2.5 rounded-xl flex items-center justify-center gap-1 animate-in fade-in-50 zoom-in-95 duration-200">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>PDF Compiled Successfully</span>
                  </div>
                )}

                <Button
                  size="lg"
                  onClick={handlePdfGenerationPipeline}
                  disabled={isProcessing}
                  className="w-full font-bold text-sm py-5 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl transition-all"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Building Pages...</>
                  ) : (
                    <><ImageIcon className="w-4 h-4" />Convert to PDF</>
                  )}
                </Button>

                <button 
                  onClick={resetState}
                  className="text-xs font-semibold text-tool-foreground/50 hover:text-tool-foreground/80 flex items-center justify-center gap-1.5 py-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Clear Queue
                </button>
              </div>

              <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/20 p-4 text-xs text-emerald-800 flex items-start gap-2.5 leading-normal">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">Pro Tip:</span> Use the arrow buttons to arrange images into sequence order before running the compile script.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default Convert;