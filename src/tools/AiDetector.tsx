import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  UploadCloud, 
  X, 
  FileText, 
  Loader2, 
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Eye,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Set up the PDFJS worker build configuration pointer 
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Initialize the Direct Cloud Client correctly from frontend environmental bounds
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

interface TamperedArea {
  description: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] coordinates normalized 0-1000
}

interface AnalysisResult {
  isEdited: boolean;
  confidence: number;
  tamperedAreas: TamperedArea[];
}

function AiDetector() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  
  // Track the actual rendered pixel size of the image on-screen, excluding letterbox space
  const [displayedDimensions, setDisplayedDimensions] = useState({ width: 0, height: 0, top: 0, left: 0 });
  
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  // Monitor layout boundaries and compute active image coordinates dynamically
  useEffect(() => {
    if (!previewDataUrl || !imageRef.current) return;

    const updateDisplayMetrics = () => {
      const img = imageRef.current;
      if (!img) return;

      // Extract raw display dimensions from bounding Client limits
      const rect = img.getBoundingClientRect();
      const parentRect = img.parentElement?.getBoundingClientRect();

      setDisplayedDimensions({
        width: rect.width,
        height: rect.height,
        top: parentRect ? rect.top - parentRect.top : 0,
        left: parentRect ? rect.left - parentRect.left : 0,
      });
    };

    const resizeObserver = new ResizeObserver(() => updateDisplayMetrics());
    if (imageRef.current) {
      resizeObserver.observe(imageRef.current);
    }

    // Trigger initial calculation once layout paint loops settle
    setTimeout(updateDisplayMetrics, 150);

    return () => resizeObserver.disconnect();
  }, [previewDataUrl, analysisResult]);

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf') return;

    setSelectedFile(file);
    setIsLoadingFile(true);
    setAnalysisResult(null);
    setApiError(null);
    setRetryStatus(null);
    setPreviewDataUrl(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setTotalPages(pdf.numPages);
      
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 }); // High resolution upscale for reliable text reading
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ 
          canvasContext: context, 
          viewport,
          canvas: canvas
        }).promise;
        setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.95));
      }
    } catch (err) {
      console.error("Error setting up asset preview layout boundaries:", err);
      setApiError("Failed to render PDF page. Make sure the file isn't encrypted.");
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Resilient retry wrapper with exponential backoff handling temporary 503/429 spikes
  const callWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1500): Promise<any> => {
    try {
      return await fn();
    } catch (error: any) {
      const isServerOverloaded = error?.message?.includes('503') || error?.message?.includes('demand');
      const isRateLimited = error?.message?.includes('429');

      if ((isServerOverloaded || isRateLimited) && retries > 0) {
        setRetryStatus(`Server busy. Retrying automatically in ${(delay / 1000).toFixed(1)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return callWithRetry(fn, retries - 1, delay * 2); // Exponential backoff scaling
      }
      throw error;
    }
  };

  const handleDocumentAnalysis = async () => {
    if (!previewDataUrl) return;
    setIsAnalyzing(true);
    setApiError(null);
    setRetryStatus(null);

    try {
      const base64ImageBytes = previewDataUrl.split(',')[1];
      
      const currentYear = new Date().getFullYear(); 
      const currentFullDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const generativePrompt = `
        You are a highly sensitive expert digital document forensics specialist. Analyze this document image carefully for modifications, forgery, or tampering.
        
        CRITICAL DETECTIVE PRIORITY:
        1. GRAPHICAL TAMPERING (Highest Priority): Scan for any unnatural black silhouettes, icons, stamps, color blocks, or white-out layers covering up text fields or numbers. Look for mismatched fonts, misaligned text rows, or digital overlays. If an unrelated icon or solid element is covering text fields (like 'Payment Date' or 'Status'), flag it immediately as tampered.
        2. CHRONOLOGY AND DATES: The current date is ${currentFullDate}. Dates up to the year ${currentYear} are perfectly normal. Do not flag standard text dates simply because they contain recent timelines. However, if text dates are physically obscured or covered by an added image layer, shape, or silhouette, that is a severe visual modification.
        
        Return a JSON object matching this schema precisely. You must use the 0-1000 coordinate standard for box boundaries.
        
        {
          "isEdited": boolean,
          "confidence": number (from 0.0 to 1.0),
          "tamperedAreas": [
            {
              "description": "Clear explanation of the graphical anomaly, superimposition, or pixel tampering found",
              "box_2d": [ymin, xmin, ymax, xmax] // Values from 0 to 1000 strictly mapping [top, left, bottom, right] relative to the image borders
            }
          ]
        }
      `;

      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      // Execute the request wrapped inside the retry resilience mechanism
      const response = await callWithRetry(() => 
        model.generateContent([
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64ImageBytes
            }
          },
          generativePrompt
        ])
      );

      setRetryStatus(null);
      let rawJsonText = response.response.text();
      
      if (rawJsonText.includes('```')) {
        rawJsonText = rawJsonText.replace(/```json|```/g, '').trim();
      }

      if (rawJsonText) {
        setAnalysisResult(JSON.parse(rawJsonText));
      }
    } catch (error: any) {
      console.error("AI Forensics call execution chain disrupted:", error);
      setRetryStatus(null);
      setApiError(error?.message || "An unexpected error occurred during analysis. Check your console or API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground flex items-center gap-2">
            AI Document Edit Detector
          </h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Scan uploaded PDFs for pixel modifications, font tampering, and structural forge footprints automatically.
          </p>
        </div>

        {!selectedFile ? (
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
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Building virtual viewport grids...
              </div>
            ) : (
              <>
                <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop document here</p>
                <p className="text-xs text-tool-foreground/50 mt-1.5 mb-6">or select from your local device</p>
                <Button 
                  type="button" 
                  className="px-6 py-5 font-semibold shadow-sm bg-tool-primary text-white hover:bg-tool-primary/90 border border-transparent rounded-lg"
                >
                  Select PDF file
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
            
            {/* Left Content Column Layout Viewport */}
            <div className="lg:col-span-2 rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-tool-border pb-4 mb-6">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold truncate max-w-sm sm:max-w-md text-tool-foreground">{selectedFile.name}</span>
                  <span className="text-xs text-tool-primary shrink-0 bg-tool-secondary px-2.5 py-0.5 rounded-full font-semibold">({totalPages} pages indexed)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:bg-tool-border/30"><ZoomIn className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:bg-border/30"><ZoomOut className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="w-8 h-8 rounded-lg text-tool-foreground/60 hover:text-destructive hover:bg-destructive/10"><X className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Viewport Workspace Engine Container */}
              <div className="relative flex justify-center items-start bg-tool-bg rounded-xl border border-tool-border p-4 overflow-auto max-h-[65vh] min-h-[50vh]">
                {previewDataUrl && (
                  <div className="relative w-full h-full flex justify-center items-center">
                    <img 
                      ref={imageRef}
                      src={previewDataUrl} 
                      alt="PDF Target Page" 
                      className="max-w-full max-h-[60vh] object-contain shadow-md rounded-lg border border-tool-border/40"
                    />
                    
                    {/* Render overlays using calculated pixel limits, ignoring letterbox spacing gaps */}
                    {analysisResult?.tamperedAreas?.map((area, idx) => {
                      const [ymin, xmin, ymax, xmax] = area.box_2d;

                      // Automatically normalize coordinate values (0-1 vs 0-1000)
                      const factorY = (ymin > 1 || ymax > 1) ? 1000 : 1;
                      const factorX = (xmin > 1 || xmax > 1) ? 1000 : 1;

                      // Map position calculations cleanly to physical image vectors
                      const top = displayedDimensions.top + (ymin / factorY) * displayedDimensions.height;
                      const left = displayedDimensions.left + (xmin / factorX) * displayedDimensions.width;
                      const height = ((ymax - ymin) / factorY) * displayedDimensions.height;
                      const width = ((xmax - xmin) / factorX) * displayedDimensions.width;

                      return (
                        <div
                          key={idx}
                          title={area.description}
                          className="absolute border-2 border-red-500 bg-red-500/25 transition-all duration-300 animate-pulse cursor-help z-20 rounded"
                          style={{ 
                            top: `${top}px`, 
                            left: `${left}px`, 
                            width: `${width}px`, 
                            height: `${height}px` 
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Options Panel */}
            <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-tool-foreground">AI Diagnostic Console</h3>
                <div className="h-[1px] bg-tool-border w-full mt-3" />
              </div>

              {retryStatus && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-2.5 text-amber-600 text-xs font-semibold leading-normal animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                  <div>{retryStatus}</div>
                </div>
              )}

              {apiError && !retryStatus && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-2.5 text-destructive text-xs leading-normal">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">System Connection Issue</span>
                    <p className="mt-0.5 text-destructive/80">{apiError}</p>
                  </div>
                </div>
              )}

              {analysisResult ? (
                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                  <div className={cn(
                    "rounded-xl border p-4 flex items-start gap-3",
                    analysisResult.isEdited 
                      ? "bg-red-500/5 border-red-500/20 text-red-500" 
                      : "bg-emerald-500/5 border-emerald-500/20 text-emerald-500"
                  )}>
                    {analysisResult.isEdited ? <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" /> : <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div>
                      <h4 className="font-bold text-sm tracking-tight">
                        {analysisResult.isEdited ? "Modifications Detected" : "Clear Signature Matrix"}
                      </h4>
                      <p className="text-xs text-tool-foreground/60 mt-1 leading-normal">
                        {analysisResult.isEdited 
                          ? `This document demonstrates localized structural/pixel mismatch trends with a ${(analysisResult.confidence * 100).toFixed(0)}% verification rating.`
                          : "No standard digital alteration, brush overlay, or mismatched text fragments detected on this index target page."}
                      </p>
                    </div>
                  </div>

                  {analysisResult.tamperedAreas.length > 0 && (
                    <div className="space-y-2.5">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-tool-foreground/50 block">Anomaly Log Entry Breakdowns</span>
                      {analysisResult.tamperedAreas.map((area, index) => (
                        <div key={index} className="p-3 bg-tool-bg border border-tool-border rounded-xl flex gap-2.5 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-tool-foreground">Anomalous Area #{index + 1}</span>
                            <p className="text-tool-foreground/60 mt-1 leading-normal">{area.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-tool-secondary/30 border border-tool-border/60 p-4 text-xs space-y-2.5 text-tool-foreground/60">
                  <div className="flex items-center gap-1.5 text-tool-primary font-bold pb-2 border-b border-tool-border/60 uppercase tracking-wide">
                    System Parameters Ready
                  </div>
                  <p className="leading-relaxed">
                    Press the button below to stream your serialized local page matrix chunk directly to the Gemini Vision system wrapper.
                  </p>
                </div>
              )}

              {/* Execution Action Button Layer */}
              <div className="pt-2 mt-auto">
                <Button
                  size="lg"
                  onClick={handleDocumentAnalysis}
                  disabled={isAnalyzing || !previewDataUrl}
                  className="w-full font-bold text-sm py-6 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 focus:ring-2 focus:ring-tool-primary/40 disabled:bg-tool-border disabled:text-tool-foreground/40 transition-all flex items-center justify-center rounded-lg"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analyzing Page Footprints...</>
                  ) : (
                    <><Eye className="w-4 h-4" />Analyze Document Layout</>
                  )}
                </Button>
                <p className="text-[10px] text-center text-tool-foreground/40 mt-3.5 leading-normal">
                  Your asset data stays safe. Pipeline analysis endpoints execute structural parsing on request instances.
                </p>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default AiDetector;