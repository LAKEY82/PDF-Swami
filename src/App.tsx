import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FloatingIconsHeroDemo from '@/components/ui/floating-icons-hero-demo';
import Selection from './Pages/Selection'; 
// 1. Updated to a capitalized name
import Merge from './tools/Merge'; 

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
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;