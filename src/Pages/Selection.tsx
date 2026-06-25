import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Combine, 
  Scissors, 
  FileArchive, 
  FileImage, 
  Layers, 
  FileText,
  Sparkles // Unique icon for AI feature
} from 'lucide-react';

// Structure for our PDF services
interface ServiceItem {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  path: string;
  badge?: string; // Added optional badge support
}

const services: ServiceItem[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDF files into a single document in your preferred order.',
    icon: Combine,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    path: '/tools/merge',
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract specific page ranges or separate every page into individual files.',
    icon: Scissors,
    color: 'text-red-500 bg-red-500/10 border-red-500/20',
    path: '/tools/split',
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce file size while preserving maximum document quality.',
    icon: FileArchive,
    color: 'text-green-500 bg-green-500/10 border-green-500/20',
    path: '/tools/compress',
  },
  {
    id: 'convert',
    title: 'Convert Images ↔ PDF',
    description: 'Convert JPG, PNG images to PDF layouts, or extract images from a PDF.',
    icon: FileImage,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    path: '/tools/convert-images',
  },
  {
    id: 'organize',
    title: 'Organize Pages',
    description: 'Sort, add, or arrange the structural layout of pages within your PDF.',
    icon: Layers,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    path: '/tools/organize',
  },
  {
    id: 'pdf-to-word',
    title: 'PDF to Word Converter',
    description: 'Convert document formatting layout seamlessly into editable DOCX files.',
    icon: FileText,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    path: '/tools/pdf-to-word',
  },
  {
    id: 'ai-editdetector',
    title: 'AI Edit Detector',
    description: 'Identify and highlight potential edits or inconsistencies in your PDF documents.',
    icon: Sparkles, // Changed to Sparkles icon
    color: 'text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/20', // Custom unique color theme
    path: '/tools/ai-editdetector',
    badge: 'Beta', // Added badge property
  },
];

function Selection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 md:py-20 relative overflow-hidden">
      {/* Background radial soft ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
        {/* Header Block */}
        <div className="text-center md:text-left mb-12 md:mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/80 text-transparent bg-clip-text">
            Choose a PDF Tool
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-xl">
            Streamlined, secure cloud processing features to organize, edit, and convert your documents instantly.
          </p>
        </div>

        {/* Tools Dynamic Layout Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {services.map((service) => {
            const IconComponent = service.icon;
            return (
              <button
                key={service.id}
                onClick={() => navigate(service.path)}
                className="group relative flex flex-col text-left p-6 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/50 hover:border-border hover:bg-card transition-all duration-300 shadow-sm hover:shadow-md"
              >
                {/* Dynamic Beta Notification Badge */}
                {service.badge && (
                  <span className="absolute -top-2.5 right-4 z-20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-fuchsia-600 rounded-full shadow-sm border border-fuchsia-400">
                    {service.badge}
                  </span>
                )}

                {/* Accent Highlight Wrapper */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${service.color} transition-transform duration-300 group-hover:scale-105`}>
                  <IconComponent className="w-6 h-6" />
                </div>

                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {service.title}
                </h3>
                
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-grow">
                  {service.description}
                </p>
                
                {/* Inline structural decorator */}
                <div className="mt-4 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0">
                  Launch tool &rarr;
                </div>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default Selection;