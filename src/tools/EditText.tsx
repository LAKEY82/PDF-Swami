import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer, OPS } from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
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
  Plus,
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

// A page text run that sits below the edited paragraph, captured with its
// own original PDF-space position/font/size so it can be redrawn shifted
// down if the edit makes the paragraph grow taller than it was.
interface BelowSpan {
  text: string;
  x: number;
  y: number;
  size: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

// A simple straight rule line detected in the page's own drawing
// operations (table borders, underlines, divider rules) - these are
// vector graphics, not text, so pdf.js's text extraction never sees them.
// Redacting a region only ever re-detects and redraws text, so without
// capturing these separately, any rule line inside a whited-out region
// is simply gone - it isn't text that could be "missed", it's a different
// kind of content the redaction step didn't know to preserve at all.
interface RuleLine {
  x0: number;
  x1: number;
  y: number;
  thickness: number;
  color: { r: number; g: number; b: number };
}

// A small filled vector shape - the other common way PDF generators draw
// bullet-list markers (Word, PowerPoint, Google Docs, Canva routinely
// draw a tiny filled circle/square rather than an actual "•" character,
// for precise control over its size and vertical alignment). Same
// underlying problem as RuleLine: it's not text, so redacting a region
// erases it with nothing to notice or redraw it. Detected as a filled
// shape whose bounding box is small and roughly square, which cleanly
// distinguishes it from a rule (thin and wide) or ordinary text.
interface BulletDot {
  x: number;
  y: number;
  width: number;
  height: number;
  color: { r: number; g: number; b: number };
}

// 'paragraph': merge every line into one flowing, word-wrapped block.
// 'line': just the single line the drag touches.
// 'points': keep each line the drag touches as its own separately
// editable/addable/removable item (for bullet lists, table cells, etc.)
// instead of merging them into one string.
type SelectionMode = 'paragraph' | 'points' | 'line';

interface SelectedRegion {
  pageNumber: number;
  pdfRect: PdfRect;
  rawFontFamily: string;
  detectedFontFamily: string;
  mode: SelectionMode;
  items: string[];
  lineHeightPt: number;
  belowSpans: BelowSpan[];
  belowRules: RuleLine[];
  belowDots: BulletDot[];
}

const ZOOM_LEVELS = [1, 1.5, 2];
const MIN_MARQUEE_PX = 6;
const SELECTION_MODES: { value: SelectionMode; label: string }[] = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'points', label: 'Points' },
  { value: 'line', label: 'Line' },
];

// If every existing item starts with the same bullet-like marker (•, -, *,
// etc.), a newly added point is prefilled with it so the list stays
// visually consistent without the user having to retype it.
function guessBulletPrefix(items: string[]): string {
  const nonEmpty = items.filter((t) => t.trim().length > 0);
  if (nonEmpty.length < 1) return '';
  const match = nonEmpty[0].match(/^\s*[•\-*◦▪‣·]\s+/);
  if (!match) return '';
  const prefix = match[0];
  return nonEmpty.every((t) => t.startsWith(prefix)) ? prefix : '';
}

function isTextItem(item: PdfTextItem | { type: string }): item is PdfTextItem {
  return (item as PdfTextItem).str !== undefined;
}

// PDF 2x3 affine matrix as [a,b,c,d,e,f]: x' = a*x + c*y + e, y' = b*x + d*y + f.
type Mat = [number, number, number, number, number, number];
const IDENTITY_MATRIX: Mat = [1, 0, 0, 1, 0, 0];
function multiplyMatrix(m2: Mat, m1: Mat): Mat {
  // Applies m2 first, then m1 - matches the PDF `cm` operator's semantics
  // for prepending a transform onto the current one.
  return [
    m2[0] * m1[0] + m2[1] * m1[2],
    m2[0] * m1[1] + m2[1] * m1[3],
    m2[2] * m1[0] + m2[3] * m1[2],
    m2[2] * m1[1] + m2[3] * m1[3],
    m2[4] * m1[0] + m2[5] * m1[2] + m1[4],
    m2[4] * m1[1] + m2[5] * m1[3] + m1[5],
  ];
}
function applyMatrix(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const STROKE_PAINT_OPS = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

// Walks a page's raw drawing operations looking for two kinds of small
// vector marks that pdf.js's text extraction has no way to see:
//
// - Rule lines (table borders, underlines, divider rules): an actual
//   stroked line, or a very thin filled rectangle used to fake one.
//   Deliberately narrow in scope to near-horizontal, axis-aligned rules -
//   curves, rotated content, and vertical dividers are left alone (a
//   vertical divider would need to change LENGTH rather than just shift
//   when content below it moves, a different problem than this tool
//   currently solves).
// - Bullet dots: many PDF generators (Word, PowerPoint, Google Docs,
//   Canva) draw list bullets as a tiny filled circle/square rather than
//   an actual "•" character. Distinguished from a rule by shape - small
//   and roughly square/round instead of thin and wide - so the two
//   categories never overlap.
function extractVectorMarks(fnArray: number[], argsArray: unknown[][]): { rules: RuleLine[]; dots: BulletDot[] } {
  const rules: RuleLine[] = [];
  const dots: BulletDot[] = [];
  const matrixStack: Mat[] = [];
  let ctm: Mat = IDENTITY_MATRIX;
  let strokeColor = { r: 0, g: 0, b: 0 };
  let fillColor = { r: 0, g: 0, b: 0 };
  let lineWidth = 1;

  const toColor = (args: unknown[]): { r: number; g: number; b: number } => {
    // pdf.js's operator list represents colors as a ready-to-use CSS hex
    // string (it feeds its own canvas renderer's fillStyle/strokeStyle
    // directly), not raw numeric channels.
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('#') && first.length >= 7) {
      const r = parseInt(first.slice(1, 3), 16) / 255;
      const g = parseInt(first.slice(3, 5), 16) / 255;
      const b = parseInt(first.slice(5, 7), 16) / 255;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return { r, g, b };
    }
    if (args.length >= 3 && typeof args[0] === 'number') {
      return { r: Number(args[0]), g: Number(args[1]), b: Number(args[2]) };
    }
    if (args.length === 1 && typeof args[0] === 'number') {
      const gray = Number(args[0]);
      return { r: gray, g: gray, b: gray };
    }
    return { r: 0, g: 0, b: 0 };
  };

  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i];

    if (op === OPS.save) {
      matrixStack.push(ctm);
    } else if (op === OPS.restore) {
      ctm = matrixStack.pop() ?? IDENTITY_MATRIX;
    } else if (op === OPS.transform) {
      const m = args as number[];
      ctm = multiplyMatrix([m[0], m[1], m[2], m[3], m[4], m[5]], ctm);
    } else if (op === OPS.setLineWidth) {
      lineWidth = Number((args as number[])[0]);
    } else if (op === OPS.setStrokeRGBColor || op === OPS.setStrokeGray || op === OPS.setStrokeColorN || op === OPS.setStrokeColor) {
      strokeColor = toColor(args as unknown[]);
    } else if (op === OPS.setFillRGBColor || op === OPS.setFillGray || op === OPS.setFillColorN || op === OPS.setFillColor) {
      fillColor = toColor(args as unknown[]);
    } else if (op === OPS.constructPath) {
      const [paintOp, , bbox] = args as [number, unknown, ArrayLike<number>];
      if (!bbox || bbox.length < 4) continue;
      const corners: [number, number][] = [
        applyMatrix(ctm, bbox[0], bbox[1]),
        applyMatrix(ctm, bbox[2], bbox[1]),
        applyMatrix(ctm, bbox[0], bbox[3]),
        applyMatrix(ctm, bbox[2], bbox[3]),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const w = x1 - x0;
      const h = y1 - y0;
      // A real rule: thin (near-zero height, or a hairline fill) and wide
      // enough not to be a stray dot or a text-adjacent artifact.
      if (h <= 2.5 && w >= 8) {
        const scale = Math.hypot(ctm[0], ctm[1]);
        rules.push({
          x0,
          x1,
          y: (y0 + y1) / 2,
          thickness: Math.max(h, lineWidth * scale, 0.5),
          color: STROKE_PAINT_OPS.has(paintOp) ? strokeColor : fillColor,
        });
      } else if (w >= 1.2 && w <= 9 && h >= 1.2 && h <= 9 && w / h >= 0.4 && w / h <= 2.5) {
        // Small and roughly square/round - a bullet marker, not a rule or
        // stray text-rendering artifact.
        dots.push({
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          width: w,
          height: h,
          color: STROKE_PAINT_OPS.has(paintOp) ? strokeColor : fillColor,
        });
      }
    }
  }

  return { rules, dots };
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
  const rulesRef = useRef<RuleLine[]>([]);
  // Unlike text spans, rules carry no unique identity beyond their own
  // (x0, x1, y) - and a table's borders routinely share the exact same
  // (x0, x1) span across many different rows at different y, so "same
  // key recurs, keep the last" can't safely tell a ghost duplicate apart
  // from a second, entirely legitimate row's border. So rules are
  // extracted from the PDF's operators only ONCE per page, the first
  // time it's genuinely opened - after that, applyEdit maintains this
  // cache directly (removing rules an edit's own block superseded,
  // shifting the ones below it), so it never needs to be re-derived from
  // the ever-more-ghost-laden accumulated PDF bytes.
  const rulesCacheRef = useRef<Map<number, RuleLine[]>>(new Map());
  const dotsRef = useRef<BulletDot[]>([]);
  // Same reasoning and same cache-once-per-page treatment as rulesCacheRef
  // - see BulletDot for what these are and why they need it.
  const dotsCacheRef = useRef<Map<number, BulletDot[]>>(new Map());
  // Every Y-range this tool has ever whited out on a page, across the
  // whole edit session - see the dedup step in renderPage for why text
  // needs this too, not just a (text, x) coincidence check: two
  // different resume entries can legitimately share identical bullet
  // wording (people reuse phrasing across jobs), and content-matching
  // alone can't tell that apart from this tool's own redraw ghosts.
  const erasedRegionsRef = useRef<Map<number, { y0: number; y1: number }[]>>(new Map());

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

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('paragraph');
  const [selected, setSelected] = useState<SelectedRegion | null>(null);
  const [draftItems, setDraftItems] = useState<string[]>(['']);
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

      // Table borders and bullet dots are vector graphics, not text -
      // getTextContent() never sees them, so they need their own pass
      // over the page's raw drawing operations (see extractVectorMarks)
      // to be captured and later preserved when a redaction whites out
      // the region they're sitting in. Only done once per page - see
      // rulesCacheRef/dotsCacheRef for why re-deriving this after this
      // tool's own edits would reintroduce the exact ghost-duplication
      // problem they exist to avoid.
      let pageRules = rulesCacheRef.current.get(pageNum);
      let pageDots = dotsCacheRef.current.get(pageNum);
      if (!pageRules || !pageDots) {
        const opList = await page.getOperatorList();
        const marks = extractVectorMarks(opList.fnArray, opList.argsArray);
        pageRules = marks.rules;
        pageDots = marks.dots;
        rulesCacheRef.current.set(pageNum, pageRules);
        dotsCacheRef.current.set(pageNum, pageDots);
      }
      rulesRef.current = pageRules;
      dotsRef.current = pageDots;

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

      // A whiteout only ever visually covers old content - it can't
      // remove the underlying text-showing operators, so getTextContent()
      // still reports them. After this tool's own edits accumulate, the
      // SAME text at the SAME x can appear more than once: an original,
      // now-hidden copy plus whichever redraw(s) actually shifted it into
      // view. But (text, x) matching alone can't be trusted as the sole
      // signal - two different resume entries can legitimately share
      // identical bullet wording (people reuse phrasing across jobs), and
      // that looks exactly like a ghost/redraw pair by content alone. So
      // an earlier occurrence is only dropped as a ghost if its position
      // also falls inside a region THIS tool has actually whited out at
      // some point (see erasedRegionsRef) - genuine duplicate content was
      // never touched by an edit, so it never matches that second check.
      const erasedRegions = erasedRegionsRef.current.get(pageNum) ?? [];
      const wasErased = (y: number) => erasedRegions.some((r) => y >= r.y0 && y <= r.y1);

      const occurrencesByKey = new Map<string, number[]>();
      records.forEach((r, idx) => {
        const key = `${r.item.str}|${Math.round(r.item.transform[4])}`;
        const list = occurrencesByKey.get(key);
        if (list) list.push(idx);
        else occurrencesByKey.set(key, [idx]);
      });

      const toDrop = new Set<number>();
      occurrencesByKey.forEach((indices) => {
        if (indices.length < 2) return;
        // Every occurrence except the last (most recently drawn, i.e.
        // currently visible) one is a ghost candidate.
        indices.slice(0, -1).forEach((idx) => {
          if (wasErased(records[idx].item.transform[5])) toDrop.add(idx);
        });
      });

      spansRef.current = records.filter((_, idx) => !toDrop.has(idx));
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
    rulesCacheRef.current = new Map();
    dotsCacheRef.current = new Map();
    erasedRegionsRef.current = new Map();

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
  // exactly) and pre-fills the edit panel with whatever text the box
  // touches. What counts as "the edit unit" depends on selectionMode:
  //
  // - line: just the single line closest to the drag.
  // - paragraph / points: every line the drag box actually covers - no
  //   auto-expansion beyond the drag. An earlier version of paragraph
  //   mode tried to guess the rest of the paragraph from line spacing
  //   alone, expanding outward while gaps looked "consistent enough" -
  //   but that guess had no reliable way to tell a genuine paragraph
  //   continuation apart from an unrelated adjacent block (a resume's
  //   job-title/date header sitting directly above its description, a
  //   table's next row, a list's items) whenever the gap between them
  //   wasn't clearly larger than normal line spacing. Tying the selection
  //   to the drag itself means what ends up in the edit box is always
  //   exactly what was marked. The only remaining difference between the
  //   two modes is how the selected lines are edited: paragraph merges
  //   them into one flowing, word-wrapped string; points keeps each line
  //   as its own separately addable/removable item.
  //
  // Either way, if the redrawn block ends up taller or shorter than the
  // original, every other text run below it on the page is redrawn
  // shifted by the difference (see applyEdit / belowSpans), so edits don't
  // overlap - or leave a gap behind - whatever came after them.
  const finalizeMarquee = (clientLeft: number, clientTop: number, width: number, height: number) => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const canvasRect = canvas.getBoundingClientRect();
    const toPdfRect = (left: number, top: number, right: number, bottom: number): PdfRect => {
      const [px0, py0] = viewport.convertToPdfPoint(left - canvasRect.left, top - canvasRect.top);
      const [px1, py1] = viewport.convertToPdfPoint(right - canvasRect.left, bottom - canvasRect.top);
      return {
        x: Math.min(px0, px1),
        y: Math.min(py0, py1),
        width: Math.abs(px1 - px0),
        height: Math.abs(py1 - py0),
      };
    };

    const dragBottom = clientTop + height;
    const dragMidY = (clientTop + dragBottom) / 2;
    const dragRight = clientLeft + width;

    // Cluster spans into visual lines (top-to-bottom, left-to-right within
    // each line). Restricted to spans that horizontally overlap the drag
    // (with slack for an imprecise drag) so a table row's OTHER columns -
    // sharing the same y-position as the column actually dragged over,
    // but nowhere near it horizontally - don't get pulled into the same
    // "line" just because line-clustering only looked at vertical
    // position.
    const HORIZONTAL_SLACK_PX = 30;
    interface LineGroup {
      spans: { record: SpanRecord; rect: DOMRect }[];
      top: number;
      bottom: number;
      left: number;
      right: number;
      midY: number;
    }
    const lines: LineGroup[] = [];
    spansRef.current
      .map((record) => ({ record, rect: record.element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right >= clientLeft - HORIZONTAL_SLACK_PX && rect.left <= dragRight + HORIZONTAL_SLACK_PX)
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .forEach(({ record, rect }) => {
        const midY = rect.top + rect.height / 2;
        const line = lines.find((l) => Math.abs(l.midY - midY) <= rect.height * 0.5);
        if (line) {
          line.spans.push({ record, rect });
          line.top = Math.min(line.top, rect.top);
          line.bottom = Math.max(line.bottom, rect.bottom);
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.midY = (line.top + line.bottom) / 2;
        } else {
          lines.push({ spans: [{ record, rect }], top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, midY });
        }
      });
    lines.sort((a, b) => a.top - b.top);
    lines.forEach((l) => l.spans.sort((a, b) => a.rect.left - b.rect.left));

    const lineText = (line: LineGroup): string => {
      let text = '';
      line.spans.forEach(({ record, rect }, i) => {
        if (i > 0) {
          const prevRect = line.spans[i - 1].rect;
          const gap = rect.left - prevRect.right;
          // A small gap is almost certainly a mid-word split (kerning-
          // driven), not a real space between words.
          if (gap > prevRect.height * 0.15) text += ' ';
        }
        text += record.item.str;
      });
      return text;
    };

    // Find the line closest to the drag's vertical center, if the drag
    // touches one vertically at all (horizontal position doesn't matter).
    let touchedIdx = -1;
    let touchedDist = Infinity;
    lines.forEach((line, idx) => {
      if (line.midY < clientTop || line.midY > dragBottom) return;
      const dist = Math.abs(line.midY - dragMidY);
      if (dist < touchedDist) {
        touchedDist = dist;
        touchedIdx = idx;
      }
    });

    // What counts as "selected" is always exactly what the drag box
    // vertically covers - line mode narrows that to just the closest
    // line. Paragraph mode used to expand outward from the touched line
    // on its own (guessing where a paragraph "really" started/ended from
    // line-spacing alone), but that guess had no reliable way to
    // distinguish a genuine paragraph continuation from an unrelated
    // adjacent block - a resume's job-title/date header sitting directly
    // above its description, a table's next row, etc. - whenever the gap
    // between them wasn't clearly larger than normal line spacing. Tying
    // the selection to the drag itself, the same way Points mode already
    // works, means what ends up in the edit box is always exactly what
    // was marked - Paragraph mode's only remaining job is merging those
    // lines into one flowing, word-wrapped string instead of keeping them
    // as separate items.
    let selectedLines: LineGroup[];
    if (touchedIdx < 0) {
      selectedLines = [];
    } else if (selectionMode === 'line') {
      selectedLines = [lines[touchedIdx]];
    } else {
      selectedLines = lines.filter((l) => l.midY >= clientTop && l.midY <= dragBottom);
    }

    let pdfRect: PdfRect;
    let items: string[] = [''];
    let rawFontFamily = 'sans-serif';
    let bold = false;
    let italic = false;
    let detectedFontFamily = 'sans-serif';
    let avgSizePt: number;
    let lineHeightPt: number;
    let belowSpans: BelowSpan[] = [];
    let belowRules: RuleLine[] = [];
    let belowDots: BulletDot[] = [];

    if (selectedLines.length > 0) {
      items =
        selectionMode === 'paragraph'
          ? [selectedLines.map(lineText).join(' ').replace(/\s+/g, ' ').trim()]
          : selectedLines.map(lineText);

      const left = Math.min(...selectedLines.map((l) => l.left));
      const right = Math.max(...selectedLines.map((l) => l.right));
      const top = Math.min(...selectedLines.map((l) => l.top));
      const bottom = Math.max(...selectedLines.map((l) => l.bottom));
      pdfRect = toPdfRect(left, top, right, bottom);

      // Style: whichever run covers the most characters across the whole
      // selection wins, so one emphasized word doesn't make the entire
      // redrawn block inherit its bold/italic.
      const allSpans = selectedLines.flatMap((l) => l.spans);
      const styleVotes = new Map<string, { fontFamily: string; bold: boolean; italic: boolean; chars: number }>();
      allSpans.forEach(({ record }) => {
        const key = `${record.fontFamily}|${record.bold}|${record.italic}`;
        const entry = styleVotes.get(key);
        const chars = record.item.str.length;
        if (entry) {
          entry.chars += chars;
        } else {
          styleVotes.set(key, { fontFamily: record.fontFamily, bold: record.bold, italic: record.italic, chars });
        }
      });
      const anchorRecord = lines[touchedIdx].spans[0]?.record ?? allSpans[0].record;
      let dominant = { fontFamily: anchorRecord.fontFamily, bold: anchorRecord.bold, italic: anchorRecord.italic, chars: -1 };
      styleVotes.forEach((entry) => {
        if (entry.chars > dominant.chars) dominant = entry;
      });

      rawFontFamily = dominant.fontFamily;
      bold = dominant.bold;
      italic = dominant.italic;
      detectedFontFamily = window.getComputedStyle(anchorRecord.element).fontFamily;
      avgSizePt =
        allSpans.reduce((sum, s) => sum + Math.hypot(s.record.item.transform[2], s.record.item.transform[3]), 0) /
        allSpans.length;

      // Convert the screen-space line stride to PDF points via the
      // viewport's own scale, so wrapped/re-laid-out lines use this
      // block's actual original leading instead of a guessed value.
      const gaps: number[] = [];
      for (let i = 1; i < selectedLines.length; i++) gaps.push(selectedLines[i].midY - selectedLines[i - 1].midY);
      const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
      lineHeightPt = (avgGap ?? avgSizePt * 1.15 * viewport.scale) / viewport.scale;

      // Every other text run on the page that sits below this block's
      // original position, captured at its own true PDF-space baseline
      // (item.transform[4]/[5] are already absolute page coordinates, no
      // conversion needed) - if the edit changes the block's height,
      // these get redrawn shifted by the difference so nothing overlaps
      // or leaves a gap.
      const selectedSpanSet = new Set(allSpans.map((s) => s.record));
      belowSpans = spansRef.current
        .filter((record) => !selectedSpanSet.has(record) && record.item.transform[5] < pdfRect.y + 1)
        .map((record) => ({
          text: record.item.str,
          x: record.item.transform[4],
          y: record.item.transform[5],
          size: Math.hypot(record.item.transform[2], record.item.transform[3]),
          fontFamily: record.fontFamily,
          bold: record.bold,
          italic: record.italic,
        }));
      // Same idea, but for non-text vector marks (table border rules,
      // bullet dots) - see extractVectorMarks/RuleLine/BulletDot for why
      // these need their own separate capture.
      belowRules = rulesRef.current.filter((rule) => rule.y < pdfRect.y + 1);
      belowDots = dotsRef.current.filter((dot) => dot.y < pdfRect.y + 1);
    } else {
      // No existing line touched - treat the literal drawn box as a blank
      // area to add new content into.
      pdfRect = toPdfRect(clientLeft, clientTop, clientLeft + width, dragBottom);
      avgSizePt = Math.max(6, Math.min(pdfRect.height * 0.72, 96));
      lineHeightPt = avgSizePt * 1.15;
    }

    setSelected({
      pageNumber,
      pdfRect,
      rawFontFamily,
      detectedFontFamily,
      mode: selectionMode,
      items,
      lineHeightPt,
      belowSpans,
      belowRules,
      belowDots,
    });
    setDraftItems(items);
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

  // Greedy word-wrap, matching the algorithm pdf-lib's own drawText uses
  // internally for its maxWidth option - reimplemented here (rather than
  // just calling drawText with maxWidth and trusting it) so the exact line
  // count is known in advance, to size the whiteout box correctly instead
  // of guessing.
  const wrapLineCount = (text: string, font: PDFFont, size: number, maxWidth: number): number => {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return 1;
    let lines = 1;
    let currentWidth = 0;
    const spaceWidth = font.widthOfTextAtSize(' ', size);
    words.forEach((word) => {
      const wordWidth = font.widthOfTextAtSize(word, size);
      const needed = currentWidth === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth;
      if (needed > maxWidth && currentWidth > 0) {
        lines++;
        currentWidth = wordWidth;
      } else {
        currentWidth = needed;
      }
    });
    return lines;
  };

  const applyEdit = async () => {
    if (!selected || !currentBytes) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { pdfRect, lineHeightPt } = selected;
      const fontSizePt = Math.max(4, overrideFontSize);

      const pdfDoc = await PDFDocument.load(currentBytes);
      const page = pdfDoc.getPage(selected.pageNumber - 1);
      const blockTopY = pdfRect.y + pdfRect.height;
      const textStartX = pdfRect.x + 2;
      // A few points wider than the original box, not narrower: the
      // redraw uses a standard substitute font whose glyph widths won't
      // exactly match the original embedded font's, so a line that
      // exactly filled the box before could be measured a hair wider now
      // - padding inward here would wrap lines that were never meant to.
      const maxWidth = Math.max(20, pdfRect.width + 6);

      const hasContent = draftItems.some((t) => t.trim().length > 0);
      const standardFont = matchStandardFont({
        family: selected.rawFontFamily,
        bold: overrideBold,
        italic: overrideItalic,
      });
      const embeddedFont = hasContent ? await pdfDoc.embedFont(standardFont) : null;

      // In 'points' mode each array item is its own line (blank items
      // still take up a line, so removing a point - not just blanking it -
      // is what actually shrinks the block); in 'paragraph'/'line' mode
      // there's a single item that word-wraps as one block. Either way,
      // summing each item's own wrapped line count gives the exact total
      // height the redrawn block will need.
      const itemLineCounts = embeddedFont
        ? draftItems.map((t) => (t.trim() ? wrapLineCount(t, embeddedFont, fontSizePt, maxWidth) : 1))
        : draftItems.map(() => 1);
      const newBlockHeight = itemLineCounts.reduce((a, b) => a + b, 0) * lineHeightPt;
      // Positive when the edit needs more room than the block had before,
      // negative when it needs less (e.g. a point was removed).
      const heightDelta = newBlockHeight - pdfRect.height;

      // Keep the rule-line cache in sync with what this edit is about to
      // do to the actual PDF, rather than ever re-deriving it from the
      // PDF's own (increasingly ghost-laden) drawing operators: drop any
      // rule that sat inside the edited block's own footprint (it's been
      // superseded by the new content, same as the original text there),
      // and shift every rule below by the same amount the text below is
      // about to be shifted by.
      const cachedPageRules = rulesCacheRef.current.get(selected.pageNumber) ?? [];
      rulesCacheRef.current.set(
        selected.pageNumber,
        cachedPageRules
          .filter((r) => r.y < pdfRect.y - 4 || r.y > pdfRect.y + pdfRect.height + 6)
          .map((r) => (r.y < pdfRect.y + 1 ? { ...r, y: r.y - heightDelta } : r)),
      );
      // Same treatment for bullet dots.
      const cachedPageDots = dotsCacheRef.current.get(selected.pageNumber) ?? [];
      dotsCacheRef.current.set(
        selected.pageNumber,
        cachedPageDots
          .filter((d) => d.y < pdfRect.y - 4 || d.y > pdfRect.y + pdfRect.height + 6)
          .map((d) => (d.y < pdfRect.y + 1 ? { ...d, y: d.y - heightDelta } : d)),
      );

      // Record exactly which Y-ranges are about to be whited out, so a
      // future render's text-dedup pass can tell a genuine ghost (which
      // sits inside a region this tool itself erased) apart from
      // coincidentally identical content elsewhere on the page that was
      // never touched (see the dedup step in renderPage).
      const pageErasedRegions = erasedRegionsRef.current.get(selected.pageNumber) ?? [];
      pageErasedRegions.push({ y0: pdfRect.y - 2, y1: pdfRect.y + pdfRect.height + 2 });

      // Redact the block's original footprint.
      page.drawRectangle({
        x: pdfRect.x - 2,
        y: pdfRect.y - 2,
        width: pdfRect.width + 4,
        height: pdfRect.height + 4,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });

      const hasBelowContent =
        selected.belowSpans.length > 0 || selected.belowRules.length > 0 || selected.belowDots.length > 0;

      if (heightDelta !== 0 && hasBelowContent) {
        // The block's height changed - clear everything below its
        // original position (full page width, down to the bottom) so
        // redrawing it shifted by heightDelta doesn't leave old glyphs
        // behind or draw over anything; also covers the case where the
        // new block is taller and needs room past its old footprint.
        pageErasedRegions.push({ y0: 0, y1: Math.max(0, pdfRect.y + 2) });
        page.drawRectangle({
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: Math.max(0, pdfRect.y + 2),
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      erasedRegionsRef.current.set(selected.pageNumber, pageErasedRegions);

      if (embeddedFont) {
        let cursorY = blockTopY;
        draftItems.forEach((text, i) => {
          const lineCount = itemLineCounts[i];
          if (text.trim()) {
            const verticalInset = Math.max(0, (lineHeightPt - fontSizePt) / 2);
            const baselineY = cursorY - lineHeightPt + verticalInset + fontSizePt * 0.18;
            page.drawText(text, {
              x: textStartX,
              y: baselineY,
              size: fontSizePt,
              font: embeddedFont,
              color: rgb(0, 0, 0),
              maxWidth,
              lineHeight: lineHeightPt,
            });
          }
          cursorY -= lineCount * lineHeightPt;
        });
      }

      if (heightDelta !== 0 && hasBelowContent) {
        const fontCache = new Map<string, PDFFont>();
        for (const span of selected.belowSpans) {
          if (!span.text.trim()) continue;
          const key = `${span.fontFamily}|${span.bold}|${span.italic}`;
          let belowFont = fontCache.get(key);
          if (!belowFont) {
            belowFont = await pdfDoc.embedFont(
              matchStandardFont({ family: span.fontFamily, bold: span.bold, italic: span.italic }),
            );
            fontCache.set(key, belowFont);
          }
          page.drawText(span.text, {
            x: span.x,
            y: span.y - heightDelta,
            size: span.size,
            font: belowFont,
            color: rgb(0, 0, 0),
          });
        }

        // Table borders/rule lines below the edit point, put back in
        // place shifted by the same amount as the text around them.
        for (const rule of selected.belowRules) {
          page.drawLine({
            start: { x: rule.x0, y: rule.y - heightDelta },
            end: { x: rule.x1, y: rule.y - heightDelta },
            thickness: rule.thickness,
            color: rgb(rule.color.r, rule.color.g, rule.color.b),
          });
        }

        // Bullet dots below the edit point, same shift. Redrawn as a
        // filled ellipse regardless of the original shape (circle,
        // square, etc.) - a close enough visual match for a small marker,
        // and far better than the alternative of having none at all.
        for (const dot of selected.belowDots) {
          page.drawEllipse({
            x: dot.x,
            y: dot.y - heightDelta,
            xScale: dot.width / 2,
            yScale: dot.height / 2,
            color: rgb(dot.color.r, dot.color.g, dot.color.b),
          });
        }
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
    rulesCacheRef.current = new Map();
    dotsCacheRef.current = new Map();
    erasedRegionsRef.current = new Map();
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
            Pick what a drag should select, then mark the area - like a snipping tool - to edit it, or drag over blank space to add new text.
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
              <div className="flex items-center justify-between gap-3 flex-wrap bg-tool-card border border-tool-border rounded-xl px-4 py-2.5 shadow-sm">
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

                <div className="flex items-center gap-1 bg-tool-secondary/40 rounded-lg p-0.5">
                  {SELECTION_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setSelectionMode(m.value)}
                      title={
                        m.value === 'paragraph'
                          ? 'Merge every line the drag covers into one flowing, word-wrapped block'
                          : m.value === 'points'
                            ? 'Select each line as its own point you can add or remove'
                            : 'Select just a single line'
                      }
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-bold transition-colors',
                        selectionMode === m.value ? 'bg-tool-primary text-white' : 'text-tool-foreground/60 hover:bg-tool-secondary',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
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
                {selectionMode === 'paragraph' && 'Click and drag across the lines you want, then release to edit them together as one flowing paragraph.'}
                {selectionMode === 'points' && 'Click and drag across the lines you want as points, then release to add, remove, or edit them individually.'}
                {selectionMode === 'line' && 'Click and drag across a single line, then release to edit just that line.'}
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
                    <label className="text-[11px] font-bold text-tool-foreground/50 uppercase tracking-wide">
                      {selected.mode === 'points' ? 'Original Points' : selected.mode === 'line' ? 'Original Line' : 'Original Paragraph'}
                    </label>
                    <p className="text-xs text-tool-foreground/50 bg-tool-secondary/30 rounded-lg px-3 py-2 italic truncate">
                      {selected.items.join(selected.mode === 'points' ? ' / ' : ' ').trim() ||
                        `(blank area - no existing ${selected.mode === 'points' ? 'points' : selected.mode === 'line' ? 'line' : 'paragraph'} here)`}
                    </p>
                  </div>

                  {selected.mode === 'points' ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-tool-foreground/50 uppercase tracking-wide">Points</label>
                      <div className="space-y-1.5">
                        {draftItems.map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={item}
                              onChange={(e) =>
                                setDraftItems((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                              }
                              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-tool-border bg-tool-bg text-tool-foreground focus:outline-none focus:ring-2 focus:ring-tool-primary/40"
                              autoFocus={i === 0}
                            />
                            <button
                              onClick={() => setDraftItems((arr) => arr.filter((_, idx) => idx !== i))}
                              title="Remove this point"
                              className="p-2 rounded-lg hover:bg-tool-secondary text-tool-foreground/40 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setDraftItems((arr) => [...arr, guessBulletPrefix(arr)])}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border border-dashed border-tool-border text-tool-foreground/60 hover:bg-tool-secondary"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add point
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-tool-foreground/50 uppercase tracking-wide">New Text</label>
                      <textarea
                        value={draftItems[0] ?? ''}
                        onChange={(e) => setDraftItems([e.target.value])}
                        rows={5}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-tool-border bg-tool-bg text-tool-foreground focus:outline-none focus:ring-2 focus:ring-tool-primary/40 resize-y"
                        autoFocus
                      />
                    </div>
                  )}

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
                    <span className="font-bold">Tip:</span> Pick Paragraph, Points, or Line above, then drag across the area to edit - it reflows like a document editor, shifting everything below it up or down the page if the edit changes its height.
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
