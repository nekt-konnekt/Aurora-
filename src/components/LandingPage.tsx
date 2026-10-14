import React from 'react';

interface LandingPageProps {
  hasProfile: boolean;
  userOccupation?: string;
  onGetStarted: () => void;
  onOpenApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  hasProfile,
  userOccupation,
  onGetStarted,
  onOpenApp,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30">
      {/* Top Navbar */}
      <header className="px-6 py-5 border-b border-slate-900/80 flex items-center justify-between">
        <span className="font-bold text-lg text-white tracking-tight">Aurora</span>

        <div>
          {hasProfile ? (
            <button
              onClick={onOpenApp}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer"
            >
              Open Notes
            </button>
          ) : (
            <button
              onClick={onGetStarted}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer"
            >
              Get Started
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-3xl mx-auto px-6 flex flex-col items-center justify-center text-center py-16 sm:py-24">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.15] mb-5">
          Voice notes tailored to your craft.
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-lg mb-8 leading-relaxed font-normal">
          Aurora transcribes your voice, adapts to your profession, and shapes spoken ideas into clear, structured notes.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {hasProfile ? (
            <button
              onClick={onOpenApp}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              Continue as {userOccupation}
            </button>
          ) : (
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-7 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              Get Started
            </button>
          )}
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="px-6 py-6 border-t border-slate-900/80 text-center text-xs text-slate-600">
        Aurora · Ambient Voice Notes
      </footer>
    </div>
  );
};
