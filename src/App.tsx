import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FloatingIconsHeroDemo from '@/components/ui/floating-icons-hero-demo';
import Selection from './Pages/Selection'; 
// 1. Updated to a capitalized name
import Merge from './tools/Merge'; 
import Split from './tools/Split';
import Compress from './tools/Compress';
import Convert from './tools/Convert';
import Organize from './tools/Organize';
import WordConvert from './tools/WordConvert';
import AIEditDetector from './tools/AiDetector';

function App() {
  return (
    <BrowserRouter>
      <main className="w-full min-h-screen bg-background">
        <Routes>
          {/* Home Route containing your floating icons hero */}
          <Route path="/" element={<FloatingIconsHeroDemo />} />
          
          {/* Selection Route that the button navigates to */}
          <Route path="/selection" element={<Selection />} />
          
          {/* 2. Updated the element to use the capitalized component */}
          <Route path="/tools/merge" element={<Merge />} />
          <Route path="/tools/split" element={<Split />} />
          <Route path="/tools/compress" element={<Compress />} />
          <Route path="/tools/convert-images" element={<Convert />} />
          <Route path="/tools/organize" element={<Organize />} />
          <Route path="/tools/pdf-to-word" element={<WordConvert />} />
          <Route path="/tools/ai-editdetector" element={<AIEditDetector />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;