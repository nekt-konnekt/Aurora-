import React, { useState, useEffect } from 'react';
import { VoiceNote, UserProfile } from './types';
import {
  getUserProfile,
  saveUserProfile,
  getVoiceNotes,
  deleteVoiceNote,
  saveVoiceNote,
} from './utils/storage';
import { LandingPage } from './components/LandingPage';
import { OnboardingFlow } from './components/OnboardingFlow';
import { FloatingPill } from './components/FloatingPill';
import { NoteViewModal } from './components/NoteViewModal';

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<'landing' | 'onboarding' | 'app'>('landing');

  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);

  useEffect(() => {
    const saved = getUserProfile();
    if (saved) {
      setProfile(saved);
      setCurrentView('app');
    } else {
      setCurrentView('landing');
    }
    loadNotes();
  }, []);

  const loadNotes = async () => {
    const list = await getVoiceNotes();
    setNotes(list);
  };

  const handleOnboardingComplete = (newProfile: UserProfile) => {
    saveUserProfile(newProfile);
    setProfile(newProfile);
    setCurrentView('app');
  };

  const handleNoteCreated = (newNote: VoiceNote) => {
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNote(newNote);
  };

  const handleUpdateNote = async (updated: VoiceNote) => {
    await saveVoiceNote(updated);
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    if (selectedNote?.id === updated.id) {
      setSelectedNote(updated);
    }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteVoiceNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
  };

  // Screen 1: Landing Page
  if (currentView === 'landing') {
    return (
      <LandingPage
        hasProfile={Boolean(profile)}
        userOccupation={profile?.occupation}
        onGetStarted={() => setCurrentView('onboarding')}
        onOpenApp={() => setCurrentView('app')}
      />
    );
  }

  // Screen 2: Onboarding Flow
  if (currentView === 'onboarding') {
    return (
      <OnboardingFlow
        initialProfile={profile}
        onComplete={handleOnboardingComplete}
        onCancel={() => setCurrentView(profile ? 'app' : 'landing')}
      />
    );
  }

  // Screen 3: Core Workspace App
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView('landing')}
            className="flex items-center gap-2 text-white hover:text-slate-300 transition-colors cursor-pointer"
          >
            <span className="font-bold text-base tracking-tight">Aurora</span>
          </button>

          {profile && (
            <span className="text-xs text-slate-400 font-medium bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 truncate max-w-[140px] sm:max-w-none">
              {profile.occupation}
            </span>
          )}
        </div>

        {/* Right side: Home button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentView('landing')}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-100 hover:text-white bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700/80 hover:border-slate-600 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Home
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-8">
        {notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer flex items-center justify-between gap-4 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-mono text-[11px] tabular-nums">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {Math.round(note.duration)}s
                    </span>
                    {note.intent && (
                      <>
                        <span>·</span>
                        <span className="text-[11px] text-indigo-400 truncate max-w-[120px]">
                          {note.intent}
                        </span>
                      </>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                    {note.title}
                  </h3>

                  {note.summary && (
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                      {note.summary}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-900 max-w-sm mx-auto my-12">
            <h3 className="text-sm font-semibold text-white mb-1">No notes yet</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Use the floating recorder to capture your thoughts.
            </p>
          </div>
        )}
      </main>

      {/* Floating Ambient Recorder Pill */}
      {profile && (
        <FloatingPill
          userProfile={profile}
          onNoteCreated={handleNoteCreated}
        />
      )}

      {/* Note Inspection Modal */}
      <NoteViewModal
        note={selectedNote}
        isOpen={Boolean(selectedNote)}
        onClose={() => setSelectedNote(null)}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
      />
    </div>
  );
}
