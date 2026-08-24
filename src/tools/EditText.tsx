import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  UploadCloud,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  X,
  CheckCircle2,
  RefreshCw,
  Download,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { matchStandardFont, describeStandardFont } from '@/lib/pdfFontMatch';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * pdfjs-dist doesn't re-export the TextItem/TextContent shapes from the
 * package root, so these mirror the documented public fields we rely on.
 */
interface PdfTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

interface PdfTextStyle {
  ascent: number;
  descent: number;
  vertical: boolean;
  fontFamily: string;
}

interface PdfTextContent {
  items: Array<PdfTextItem | { type: string }>;
  styles: Record<string, PdfTextStyle>;
}

interface SpanRecord {
  element: HTMLSpanElement;
  item: PdfTextItem;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectedRegion {
  pageNumber: number;
  pdfRect: PdfRect;
  rawFontFamily: string;
  detectedFontFamily: string;
  detectedText: string;
}

const ZOOM_LEVELS = [1, 1.5, 2];
const MIN_MARQUEE_PX = 6;

function isTextItem(item: PdfTextItem | { type: string }): item is PdfTextItem {
  return (item as PdfTextItem).str !== undefined;
}

function EditText() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const spansRef = useRef<SpanRecord[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [currentBytes, setCurrentBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.5);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);

  const [selected, setSelected] = useState<SelectedRegion | null>(null);
  const [draftText, setDraftText] = useState('');
  const [overrideBold, setOverrideBold] = useState(false);
  const [overrideItalic, setOverrideItalic] = useState(false);
  const [overrideFontSize, setOverrideFontSize] = useState(12);

  const hideMarquee = useCallback(() => {
    if (highlightRef.current) highlightRef.current.style.opacity = '0';
  }, []);

  const cancelSelection = useCallback(() => {
    setSelected(null);
    hideMarquee();
  }, [hideMarquee]);

  // Renders one PDF page onto the canvas and rebuilds the invisible text
  // overlay layer on top of it. Spans are only used as data (bounding boxes
  // + font info) for whatever the user later marquee-selects - they are not
  // individually clickable, since relying on pdf.js's own run segmentation
  // for hit-testing was unreliable (runs split words inconsistently).
  const renderPage = useCallback(async (docProxy: PDFDocumentProxy, pageNum: number, atScale: number) => {
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!canvas || !textLayerDiv) return;

    setIsRenderingPage(true);
    try {
      const page = await docProxy.getPage(pageNum);
      const viewport = page.getViewport({ scale: atScale });
      viewportRef.current = viewport;

      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport, canvas }).promise;

      textLayerDiv.replaceChildren();
      // TextLayer sizes the container and each span's font-height using
      // raw, unscaled PDF-point values internally, and expects this
      // variable to bring them up to the current on-screen scale - it
      // isn't optional, and leaving it at a fixed value silently renders
      // every span at the wrong size (see the Tailwind classes on
      // textLayerRef below for the formula that consumes it).
      textLayerDiv.style.setProperty('--total-scale-factor', String(atScale));
      textLayerDiv.style.setProperty('--scale-round-x', '1px');
      textLayerDiv.style.setProperty('--scale-round-y', '1px');

      const rawTextContent = await page.getTextContent();
      const textContent = rawTextContent as unknown as PdfTextContent;
      const textItems = textContent.items.filter(isTextItem);

      const layer = new TextLayer({ textContentSource: rawTextContent, container: textLayerDiv, viewport });
      await layer.render();

      // pdf.js wraps tagged/marked-content runs in its own <span
      // class="markedContent"> element with a hardcoded class name we don't
      // control, so it can't be authored with a className prop - it has to
      // be reached and classed after the fact, same as any element a
      // third-party library injects into the DOM.
      textLayerDiv.querySelectorAll<HTMLElement>('.markedContent').forEach((el) => {
        el.classList.add('contents');
      });

      const divs = layer.textDivs;
      const records: SpanRecord[] = [];

      divs.forEach((div, index) => {
        const span = div as HTMLSpanElement;
        // Every text span needs pdf.js's own positioning formula (font-size
        // and transform driven by CSS custom properties it sets per span),
        // reimplemented as Tailwind arbitrary-value/property utilities
        // instead of the removed stylesheet rule.
        span.classList.add(
          'text-transparent',
          'absolute',
          'whitespace-pre',
          'origin-top-left',
          '[--font-height:0]',
          '[--scale-x:1]',
          '[--rotate:0deg]',
          'text-[length:calc(var(--total-scale-factor)*var(--min-font-size)*var(--font-height))]',
          '[transform:rotate(var(--rotate))_scaleX(var(--scale-x))_scale(var(--min-font-size-inv))]',
        );

        const item = textItems[index];
        if (!item || !item.str.trim()) return;

        const style = textContent.styles[item.fontName];
        const rawFamily = style?.fontFamily || 'sans-serif';

        let embeddedFontName = '';
        try {
          const fontObj = (page.commonObjs as unknown as { get: (id: string) => { name?: string } | undefined }).get(item.fontName);
          embeddedFontName = fontObj?.name ?? '';
        } catch {
          // Font object not resolved on the main thread yet; fall back to the style hint.
        }

        const probe = `${embeddedFontName} ${rawFamily}`.toLowerCase();
        const bold = /bold|black|heavy|semibold/.test(probe);
        const italic = /italic|oblique/.test(probe);

        records.push({
          element: span,
          item,
          fontFamily: rawFamily,
          bold,
          italic,
        });
      });

      spansRef.current = records;
    } finally {
      setIsRenderingPage(false);
    }
  }, []);

  const loadAndRenderFromBytes = useCallback(
    async (bytes: Uint8Array, targetPage: number) => {
      // pdf.js may take ownership of the buffer it's given, so hand it a
      // fresh copy and keep `bytes`/currentBytes untouched for pdf-lib.
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
      const docProxy = await loadingTask.promise;
      pdfDocRef.current = docProxy;
      setNumPages(docProxy.numPages);
      const safePage = Math.min(Math.max(1, targetPage), docProxy.numPages);
      setPageNumber(safePage);
      await renderPage(docProxy, safePage, scale);
    },
    [renderPage, scale],
  );

  const handleFileImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf') return;

    setIsLoading(true);
    setErrorMessage(null);
    setSelected(null);
    setEditCount(0);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setFileName(file.name);
      setCurrentBytes(bytes);
      await loadAndRenderFromBytes(bytes, 1);
    } catch (err) {
      console.error('Failed to open PDF for editing:', err);
      setErrorMessage('Could not open that PDF. It may be corrupted or password protected.');
      setFileName(null);
      setCurrentBytes(null);
    } finally {
      setIsLoading(false);
    }
  };

  const goToPage = async (target: number) => {
    if (!pdfDocRef.current) return;
    const clamped = Math.min(Math.max(1, target), numPages);
    if (clamped === pageNumber) return;
    cancelSelection();
    setPageNumber(clamped);
    await renderPage(pdfDocRef.current, clamped, scale);
  };

  // Zoom changes re-render the current page at the new scale; page
  // navigation is handled explicitly by goToPage so this only fires on zoom.
  useEffect(() => {
    if (!pdfDocRef.current) return;
    cancelSelection();
    renderPage(pdfDocRef.current, pageNumber, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Turns a user-drawn screen rectangle into a PDF-point rectangle (via
  // pdf.js's own inverse viewport transform, so it accounts for scale/zoom
  // exactly) and pre-fills the edit panel with whatever text runs the box
  // covers, so a user can see - and correct - what was detected.
  const finalizeMarquee = (clientLeft: number, clientTop: number, width: number, height: number) => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const canvasRect = canvas.getBoundingClientRect();
    const cx0 = clientLeft - canvasRect.left;
    const cy0 = clientTop - canvasRect.top;
    const cx1 = cx0 + width;
    const cy1 = cy0 + height;

    const [px0, py0] = viewport.convertToPdfPoint(cx0, cy0);
    const [px1, py1] = viewport.convertToPdfPoint(cx1, cy1);
    const pdfRect: PdfRect = {
      x: Math.min(px0, px1),
      y: Math.min(py0, py1),
      width: Math.abs(px1 - px0),
      height: Math.abs(py1 - py0),
    };

    // A single PDF text-showing operator can cover a whole line ("Hello
    // World Test" as one run) - if the drawn box only covers part of that
    // run's width, including the run's full string would report text the
    // box doesn't actually reach. Clip each matched run to the fraction of
    // its own width that's inside the box (assuming roughly uniform glyph
    // width - an approximation, not exact per-character measurement, but
    // far closer to "what's under the box" than an all-or-nothing match).
    const dragRight = clientLeft + width;
    const dragBottom = clientTop + height;
    const MIN_OVERLAP_FRACTION = 0.15;

    interface Match {
      record: SpanRecord;
      clippedText: string;
      rect: DOMRect;
    }

    const matches: Match[] = [];
    spansRef.current.forEach((record) => {
      const r = record.element.getBoundingClientRect();
      const midY = r.top + r.height / 2;
      if (r.width <= 0 || midY < clientTop || midY > dragBottom) return;

      const clippedLeft = Math.max(r.left, clientLeft);
      const clippedRight = Math.min(r.right, dragRight);
      const overlapWidth = clippedRight - clippedLeft;
      if (overlapWidth <= 0) return;

      const overlapFraction = overlapWidth / r.width;
      if (overlapFraction < MIN_OVERLAP_FRACTION) return;

      let clippedText = record.item.str;
      if (overlapFraction < 0.97) {
        const len = record.item.str.length;
        const startFrac = (clippedLeft - r.left) / r.width;
        const endFrac = (clippedRight - r.left) / r.width;
        const startIdx = Math.max(0, Math.floor(startFrac * len));
        const endIdx = Math.min(len, Math.max(startIdx + 1, Math.ceil(endFrac * len)));
        clippedText = record.item.str.slice(startIdx, endIdx);
      }

      matches.push({ record, clippedText, rect: r });
    });

    matches.sort((a, b) => {
      if (Math.abs(a.rect.top - b.rect.top) > 4) return a.rect.top - b.rect.top;
      return a.rect.left - b.rect.left;
    });

    const detectedText = matches
      .map((m) => m.clippedText)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const rep = matches[0]?.record;

    const avgSizePt = matches.length
      ? matches.reduce((sum, m) => sum + Math.hypot(m.record.item.transform[2], m.record.item.transform[3]), 0) / matches.length
      : Math.max(6, Math.min(pdfRect.height * 0.72, 96));

    const rawFontFamily = rep?.fontFamily ?? 'sans-serif';
    const bold = rep?.bold ?? false;
    const italic = rep?.italic ?? false;
    const detectedFontFamily = rep ? window.getComputedStyle(rep.element).fontFamily : rawFontFamily;

    setSelected({
      pageNumber,
      pdfRect,
      rawFontFamily,
      detectedFontFamily,
      detectedText,
    });
    setDraftText(detectedText);
    setOverrideBold(bold);
    setOverrideItalic(italic);
    setOverrideFontSize(Math.round(avgSizePt * 10) / 10);
    setErrorMessage(null);
  };

  // Snipping-tool-style marquee: drag a rectangle over the exact area to
  // edit rather than relying on pdf.js's automatic text-run boundaries.
  const handleMarqueeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isSaving || isRenderingPage || !viewportRef.current) return;
    const container = pageContainerRef.current;
    const box = highlightRef.current;
    if (!container || !box) return;

    event.preventDefault();
    setSelected(null);

    const startX = event.clientX;
    const startY = event.clientY;
    const containerRect = container.getBoundingClientRect();

    box.dataset.active = 'true';
    box.style.opacity = '1';
    box.style.left = `${startX - containerRect.left}px`;
    box.style.top = `${startY - containerRect.top}px`;
    box.style.width = '0px';
    box.style.height = '0px';

    const onMove = (moveEvent: MouseEvent) => {
      const x0 = Math.min(startX, moveEvent.clientX);
      const y0 = Math.min(startY, moveEvent.clientY);
      const x1 = Math.max(startX, moveEvent.clientX);
      const y1 = Math.max(startY, moveEvent.clientY);
      box.style.left = `${x0 - containerRect.left}px`;
      box.style.top = `${y0 - containerRect.top}px`;
      box.style.width = `${x1 - x0}px`;
      box.style.height = `${y1 - y0}px`;
    };

    const onUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      box.dataset.active = 'false';

      const x0 = Math.min(startX, upEvent.clientX);
      const y0 = Math.min(startY, upEvent.clientY);
      const x1 = Math.max(startX, upEvent.clientX);
      const y1 = Math.max(startY, upEvent.clientY);
      const width = x1 - x0;
      const height = y1 - y0;

      if (width < MIN_MARQUEE_PX || height < MIN_MARQUEE_PX) {
        box.style.opacity = '0';
        return;
      }
      finalizeMarquee(x0, y0, width, height);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const applyEdit = async () => {
    if (!selected || !currentBytes) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { pdfRect } = selected;
      const fontSizePt = Math.max(4, overrideFontSize);

      const pdfDoc = await PDFDocument.load(currentBytes);
      const page = pdfDoc.getPage(selected.pageNumber - 1);

      // Redact the marked block boundary.
      page.drawRectangle({
        x: pdfRect.x - 1,
        y: pdfRect.y - 1,
        width: pdfRect.width + 2,
        height: pdfRect.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });

      if (draftText.length > 0) {
        const standardFont = matchStandardFont({
          family: selected.rawFontFamily,
          bold: overrideBold,
          italic: overrideItalic,
        });
        const embeddedFont = await pdfDoc.embedFont(standardFont);

        const verticalInset = Math.max(0, (pdfRect.height - fontSizePt) / 2);
        const baselineY = pdfRect.y + verticalInset + fontSizePt * 0.18;

        // Always a single line: wrapping onto a second line inside a fixed
        // marked box risks colliding with whatever content sits just below
        // it on the page. Overflowing sideways past the box when the new
        // text is wider is more predictable - the user can redraw a wider
        // box if that matters.
        page.drawText(draftText, {
          x: pdfRect.x + 2,
          y: baselineY,
          size: fontSizePt,
          font: embeddedFont,
          color: rgb(0, 0, 0),
        });
      }

      const savedBytes = await pdfDoc.save();
      const nextBytes = new Uint8Array(savedBytes);
      const targetPage = selected.pageNumber;

      setCurrentBytes(nextBytes);
      setEditCount((count) => count + 1);
      cancelSelection();
      await loadAndRenderFromBytes(nextBytes, targetPage);
    } catch (err) {
      console.error('Failed to apply text edit:', err);
      setErrorMessage('Could not apply that edit. Try marking a different area.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!currentBytes || !fileName) return;
    const blob = new Blob([currentBytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Edited_${fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetState = () => {
    pdfDocRef.current = null;
    spansRef.current = [];
    setFileName(null);
    setCurrentBytes(null);
    setNumPages(0);
    setPageNumber(1);
    setEditCount(0);
    setErrorMessage(null);
    cancelSelection();
  };

  const matchedFontLabel = selected
    ? describeStandardFont(
        matchStandardFont({
          family: selected.rawFontFamily,
          bold: overrideBold,
          italic: overrideItalic,
        }),
      )
    : '';

  return (
    <div className="min-h-screen bg-tool-bg text-tool-foreground px-6 py-12 md:py-16 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-tool-primary/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-tool-foreground">Edit PDF Text</h1>
          <p className="mt-1.5 text-tool-foreground/60 text-sm">
            Drag a box over the area you want to change - like a snipping tool - then type the replacement text.
          </p>
        </div>

        {!currentBytes ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); handleFileImport(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 bg-tool-card text-center max-w-4xl mx-auto shadow-sm mt-8',
              isDraggingOver ? 'border-tool-primary bg-tool-secondary/40' : 'border-tool-border hover:border-tool-primary',
            )}
          >
            <input type="file" ref={fileInputRef} onChange={(e) => handleFileImport(e.target.files)} accept=".pdf" className="hidden" />

            <div className="w-16 h-16 rounded-full bg-tool-secondary flex items-center justify-center text-tool-primary mb-5 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-tool-foreground font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-tool-primary" /> Preparing document for editing...
              </div>
            ) : (
              <>
                <p className="font-semibold text-tool-foreground text-base tracking-tight">Drag & drop PDF file here</p>
                <p className="text-xs text-tool-foreground/50 mt-1.5 mb-6">or select from your local device</p>
                <Button type="button" size="default" className="px-6 py-5 font-semibold shadow-sm bg-tool-primary text-white hover:bg-tool-primary/90 border border-transparent rounded-lg">
                  Select PDF file
                </Button>
              </>
            )}

            {errorMessage && <p className="mt-6 text-xs font-semibold text-red-500">{errorMessage}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start mt-6">
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between bg-tool-card border border-tool-border rounded-xl px-4 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(pageNumber - 1)}
                    disabled={pageNumber <= 1 || isRenderingPage}
                    className="p-1.5 rounded-lg hover:bg-tool-secondary disabled:opacity-30 text-tool-foreground/70"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-tool-foreground/70 min-w-[90px] text-center">
                    Page {pageNumber} of {numPages}
                  </span>
                  <button
                    onClick={() => goToPage(pageNumber + 1)}
                    disabled={pageNumber >= numPages || isRenderingPage}
                    className="p-1.5 rounded-lg hover:bg-tool-secondary disabled:opacity-30 text-tool-foreground/70"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {ZOOM_LEVELS.map((z) => (
                    <button
                      key={z}
                      onClick={() => setScale(z)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors',
                        scale === z ? 'bg-tool-primary text-white' : 'hover:bg-tool-secondary text-tool-foreground/60',
                      )}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-tool-border rounded-xl bg-tool-card shadow-sm overflow-auto max-h-[720px] p-6 flex justify-center relative">
                {isRenderingPage && (
                  <div className="absolute inset-0 bg-tool-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-tool-primary" />
                  </div>
                )}
                <div
                  ref={pageContainerRef}
                  onMouseDown={handleMarqueeMouseDown}
                  className="relative inline-block shadow-md leading-none cursor-crosshair select-none"
                >
                  <canvas ref={canvasRef} className="block" />
                  <div
                    ref={textLayerRef}
                    // "pdf-text-layer" carries no CSS of its own (styling is
                    // all Tailwind utilities below) - it's kept purely as a
                    // stable selector for devtools/tests.
                    className="pdf-text-layer absolute inset-0 overflow-clip leading-none text-left origin-top-left z-[2] pointer-events-none selection:bg-transparent [--total-scale-factor:1] [--min-font-size:1] [--min-font-size-inv:calc(1/var(--min-font-size))]"
                  />
                  <div
                    ref={highlightRef}
                    className="pdf-highlight-box absolute pointer-events-none border-[1.5px] rounded-sm z-[3] border-tool-primary bg-tool-primary/[0.12] data-[active=true]:border-dashed data-[active=true]:bg-tool-primary/[0.08]"
                    style={{ opacity: 0 }}
                  />
                </div>
              </div>

              <div className="text-xs text-tool-foreground/50 bg-tool-card border border-tool-border rounded-lg px-3 py-2 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-tool-primary shrink-0" />
                Click and drag over the text you want to change, then release to open the edit panel.
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-tool-card border border-tool-border p-6 shadow-sm flex flex-col gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wider font-bold text-tool-foreground/40">Document</h3>
                  <div className="h-[1px] bg-tool-border w-full mt-3" />
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-tool-foreground/60 shrink-0">File</span>
                    <span className="font-semibold text-tool-foreground truncate" title={fileName ?? undefined}>{fileName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Pages</span>
                    <span className="font-bold text-tool-foreground">{numPages}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-tool-foreground/60">Edits Applied</span>
                    <span
                      className={cn(
                        'font-semibold px-2 py-0.5 rounded-full text-[11px]',
                        editCount > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-tool-secondary text-tool-foreground/60',
                      )}
                    >
                      {editCount}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleDownload}
                  disabled={!currentBytes}
                  className="w-full font-bold text-sm py-5 gap-2 shadow-md bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </Button>

                <button onClick={resetState} className="text-xs font-semibold text-tool-foreground/50 hover:text-tool-foreground/80 flex items-center justify-center gap-1.5 py-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Load Different File
                </button>
              </div>

              {selected ? (
                <div className="rounded-2xl bg-tool-card border border-tool-primary/40 p-6 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs uppercase tracking-wider font-bold text-tool-primary">Edit Marked Area</h3>
                    <button onClick={cancelSelection} className="p-1 rounded hover:bg-tool-secondary text-tool-foreground/40">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-[11px] text-tool-foreground/60 space-y-1.5 bg-tool-secondary/40 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span>Detected Font</span>
                      <span className="font-semibold text-tool-foreground truncate max-w-[140px]">{selected.detectedFontFamily.split(',')[0].replace(/["']/g, '')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Size (pt)</span>
                      <input
                        type="number"
                        min={4}
                        max={200}
                        step={0.5}
                        value={overrideFontSize}
                        onChange={(e) => setOverrideFontSize(parseFloat(e.target.value) || 0)}
                        className="w-16 text-right font-semibold text-tool-foreground bg-tool-bg border border-tool-border rounded px-1.5 py-0.5"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Matched Standard Font</span>
                      <span className="font-semibold text-tool-foreground">{matchedFontLabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOverrideBold((v) => !v)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                        overrideBold ? 'bg-tool-primary text-white border-tool-primary' : 'border-tool-border text-tool-foreground/60 hover:bg-tool-secondary',
                      )}
                    >
                      <Bold className="w-3.5 h-3.5" /> Bold
                    </button>
                    <button
                      onClick={() => setOverrideItalic((v) => !v)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                        overrideItalic ? 'bg-tool-primary text-white border-tool-primary' : 'border-tool-border text-tool-foreground/60 hover:bg-tool-secondary',
                      )}
                    >
                      <Italic className="w-3.5 h-3.5" /> Italic
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-tool-foreground/50 uppercase tracking-wide">Detected In Marked Area</label>
                    <p className="text-xs text-tool-foreground/50 bg-tool-secondary/30 rounded-lg px-3 py-2 italic truncate">
                      {selected.detectedText || '(no existing text in this area)'}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-tool-foreground/50 uppercase tracking-wide">New Text</label>
                    <input
                      type="text"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-tool-border bg-tool-bg text-tool-foreground focus:outline-none focus:ring-2 focus:ring-tool-primary/40"
                      autoFocus
                    />
                  </div>

                  <Button
                    onClick={applyEdit}
                    disabled={isSaving}
                    className="w-full font-bold text-sm py-4 gap-2 bg-tool-primary text-white hover:bg-tool-primary/90 rounded-xl"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Rewriting...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Apply Change</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/20 p-4 text-xs text-emerald-800 flex items-start gap-2.5 leading-normal">
                  <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>
                    <span className="font-bold">Tip:</span> Drag a rectangle over any text (or blank area) to mark it, then type the replacement text and apply.
                  </p>
                </div>
              )}

              {errorMessage && currentBytes && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600">{errorMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EditText;
