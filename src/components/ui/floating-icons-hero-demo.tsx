import * as React from 'react';
import {
  FloatingIconsHero,
  type FloatingIconsHeroProps,
} from '@/components/ui/floating-icons-hero-section';

// --- Custom Colorful SVG Components for PDF Editing Services ---

const IconPDF = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="pdfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#pdfGrad)" />
    <path d="M14 2v6h6z" fill="#fca5a5" opacity="0.8" />
    <text x="11" y="16.5" fill="white" fontSize="5" fontWeight="900" fontFamily="system-ui, sans-serif" textAnchor="middle">PDF</text>
  </svg>
);

const IconMerge = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="mergeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f97316" />
        <stop offset="100%" stopColor="#c2410c" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="11" height="11" rx="2" fill="url(#mergeGrad)" />
    <rect x="10" y="10" width="11" height="11" rx="2" fill="url(#mergeGrad)" opacity="0.8" />
    <path d="M11 11h3v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCompress = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="compressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#5b21b6" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#compressGrad)" />
    <path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconConvert = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="convertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#convertGrad)" />
    <path d="M17 12A5 5 0 1 0 8 15.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <polygon points="17 9 20 12 16 14" fill="white" />
  </svg>
);

const IconWord = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="wordGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#wordGrad)" />
    <path d="M14 2v6h6z" fill="#93c5fd" opacity="0.8" />
    <text x="11" y="16.5" fill="white" fontSize="6.5" fontWeight="900" fontFamily="system-ui, sans-serif" textAnchor="middle">W</text>
  </svg>
);

const IconText = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
    </defs>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#textGrad)" />
    <path d="M14 2v6h6z" fill="#a5f3fc" opacity="0.8" />
    <path d="M8 12h8M8 15h6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const IconSplit = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="splitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#14b8a6" />
        <stop offset="100%" stopColor="#0f766e" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#splitGrad)" />
    <line x1="12" y1="2" x2="12" y2="22" stroke="white" strokeWidth="2.5" strokeDasharray="3 3" />
    <path d="M7 12h3M14 12h3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const IconUpload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="uploadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f43f5e" />
        <stop offset="100%" stopColor="#be123c" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#uploadGrad)" />
    <path d="M12 16V8M9 11l3-3 3 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="downloadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#downloadGrad)" />
    <path d="M12 8v8M9 13l3 3 3-3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconOCR = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="ocrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d946ef" />
        <stop offset="100%" stopColor="#a21caf" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ocrGrad)" />
    <path d="M6 6h3M6 6v3M18 6h-3M18 6v3M6 18h3M6 18v-3M18 18h-3M18 18v-3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <text x="12" y="14" fill="white" fontSize="6.5" fontWeight="900" fontFamily="system-ui, sans-serif" textAnchor="middle">OCR</text>
  </svg>
);

const IconLock = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="lockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <rect x="4" y="10" width="16" height="11" rx="2" fill="url(#lockGrad)" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="url(#lockGrad)" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="12" cy="15" r="1.5" fill="white" />
  </svg>
);

const IconEdit = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="editGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#editGrad)" />
    <path d="M14 2v6h6z" fill="#bae6fd" opacity="0.8" />
    <path d="M8 16l5.5-5.5a1.5 1.5 0 1 1 2.1 2.1L10 18H8v-2z" fill="white" />
  </svg>
);

const IconSearch = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="searchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#6d28d9" />
      </linearGradient>
    </defs>
    <circle cx="10" cy="10" r="7" stroke="url(#searchGrad)" strokeWidth="3" fill="none" />
    <line x1="15" y1="15" x2="21" y2="21" stroke="url(#searchGrad)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const IconFolder = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="folderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#a16207" />
      </linearGradient>
    </defs>
    <path d="M20 18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2z" fill="url(#folderGrad)" />
    <path d="M2 9h20" stroke="white" strokeWidth="1" opacity="0.3" />
  </svg>
);

const IconCloud = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    <path d="M17.5 18a5.5 5.5 0 0 0 0-11h-.5a7 7 0 0 0-13 2.15A5.5 5.5 0 0 0 4 20h13.5z" fill="url(#cloudGrad)" />
  </svg>
);

const IconDocument = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="docGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#db2777" />
      </linearGradient>
    </defs>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#docGrad)" />
    <path d="M14 2v6h6z" fill="#fbcfe8" opacity="0.8" />
  </svg>
);

// Define the icons with their unique positions for the demo.
const demoIcons: FloatingIconsHeroProps['icons'] = [
  {
    id: 1,
    icon: IconPDF,
    className: 'top-[10%] left-[10%]'
  },
  {
    id: 2,
    icon: IconMerge,
    className: 'top-[20%] right-[8%]'
  },
  {
    id: 3,
    icon: IconCompress,
    className: 'bottom-[10%] left-[12%]'
  },
  {
    id: 4,
    icon: IconConvert,
    className: 'bottom-[12%] right-[12%]'
  },
  {
    id: 5,
    icon: IconWord,
    className: 'top-[5%] left-[30%]'
  },
  {
    id: 6,
    icon: IconText,
    className: 'top-[5%] right-[30%]'
  },
  {
    id: 7,
    icon: IconSplit,
    className: 'bottom-[8%] left-[25%]'
  },
  {
    id: 8,
    icon: IconUpload,
    className: 'top-[40%] left-[15%]'
  },
  {
    id: 9,
    icon: IconDownload,
    className: 'top-[75%] right-[25%]'
  },
  {
    id: 10,
    icon: IconOCR,
    className: 'top-[90%] left-[70%]'
  },
  {
    id: 11,
    icon: IconLock,
    className: 'top-[50%] right-[5%]'
  },
  {
    id: 12,
    icon: IconEdit,
    className: 'top-[55%] left-[5%]'
  },
  {
    id: 13,
    icon: IconSearch,
    className: 'top-[5%] left-[55%]'
  },
  {
    id: 14,
    icon: IconFolder,
    className: 'bottom-[5%] right-[45%]'
  },
  {
    id: 15,
    icon: IconCloud,
    className: 'top-[25%] right-[20%]'
  },
  {
    id: 16,
    icon: IconDocument,
    className: 'top-[60%] left-[30%]'
  }
];

export default function FloatingIconsHeroDemo() {
  return (
    <FloatingIconsHero
      title="Free Forever & Private"
      subtitle="Edit, convert, merge, split, compress, protect, and OCR your PDF files in one secure place. Fast, easy, and runs entirely in your browser."
      ctaText="Start For Free"
      ctaHref="#"
      icons={demoIcons}
    >
       <img
        src="/src/assets/swami.png"
        alt="PDF Swami"
        className="mx-auto mt-6 w-32 h-32 object-contain"
      />
</FloatingIconsHero>
  );
}
