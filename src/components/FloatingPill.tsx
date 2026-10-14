import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, VoiceNote } from '../types';
import { voiceRecorder, blobToBase64 } from '../utils/audio';
import { saveVoiceNote } from '../utils/storage';

interface FloatingPillProps {
  userProfile: UserProfile;
  onNoteCreated: (note: VoiceNote) => void;
}

export const FloatingPill: React.FC<FloatingPillProps> = ({
  userProfile,
  onNoteCreated,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth / 2 - 140) : 100,
    y: typeof window !== 'undefined' ? window.innerHeight - 80 : 500,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Side minimization state: null | 'left' | 'right'
  const [isDocked, setIsDocked] = useState<'left' | 'right' | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeNotice, setTranscribeNotice] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<any>(null);

  const [liveTranscript, setLiveTranscript] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);

  // Equalizer visualizer
  const [waveLevels, setWaveLevels] = useState<number[]>([4, 6, 8, 6, 4]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => ({
        x: isDocked === 'left' ? 0 : isDocked === 'right' ? window.innerWidth : Math.max(16, Math.min(prev.x, window.innerWidth - 300)),
        y: Math.max(16, Math.min(prev.y, window.innerHeight - 70)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDocked]);

  useEffect(() => {
    if (isRecording) {
      const updateWave = () => {
        const freqData = voiceRecorder.getAudioFrequencyData();
        const b1 = Math.max(4, Math.round((freqData[2] || 10) / 12));
        const b2 = Math.max(6, Math.round((freqData[6] || 25) / 10));
        const b3 = Math.max(8, Math.round((freqData[12] || 40) / 8));
        const b4 = Math.max(6, Math.round((freqData[18] || 25) / 10));
        const b5 = Math.max(4, Math.round((freqData[24] || 10) / 12));
        setWaveLevels([b1, b2, b3, b4, b5]);
        animRef.current = requestAnimationFrame(updateWave);
      };
      animRef.current = requestAnimationFrame(updateWave);
    } else {
      setWaveLevels([4, 6, 8, 6, 4]);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('textarea')) return;
    setIsDragging(true);
    dragStartOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rawX = e.clientX - dragStartOffset.current.x;
    const rawY = e.clientY - dragStartOffset.current.y;
    const x = Math.max(0, Math.min(window.innerWidth - 80, rawX));
    const y = Math.max(16, Math.min(window.innerHeight - 70, rawY));
    setPosition({ x, y });

    // Undock if user starts dragging out into screen center
    if (isDocked === 'left' && rawX > 80) {
      setIsDocked(null);
    } else if (isDocked === 'right' && rawX < window.innerWidth - 180) {
      setIsDocked(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      // Check edge snapping for minimization
      const screenWidth = window.innerWidth;
      if (position.x <= 70) {
        setIsDocked('left');
        setPosition((p) => ({ ...p, x: 0 }));
        setIsExpanded(false);
      } else if (position.x >= screenWidth - 220) {
        setIsDocked('right');
        setPosition((p) => ({ ...p, x: screenWidth }));
        setIsExpanded(false);
      } else {
        setIsDocked(null);
      }
    }
  };

  const undockPill = () => {
    setIsDocked(null);
    if (isDocked === 'left') {
      setPosition((p) => ({ ...p, x: 30 }));
    } else {
      setPosition((p) => ({ ...p, x: Math.max(30, window.innerWidth - 320) }));
    }
  };

  const dockToSide = (side: 'left' | 'right') => {
    setIsDocked(side);
    setIsExpanded(false);
    setPosition((p) => ({
      ...p,
      x: side === 'left' ? 0 : window.innerWidth,
    }));
  };

  const startRecord = async () => {
    try {
      setLiveTranscript('');
      setAudioBlob(null);
      setElapsedSeconds(0);
      setTranscribeNotice(null);
      if (!isDocked) {
        setIsExpanded(true);
      }

      await voiceRecorder.startRecording({
        onTranscriptUpdate: (text) => {
          setLiveTranscript(text);
          setTranscribeNotice(null);
        },
        onError: () => setIsRecording(false),
      });
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecord = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    try {
      const { audioBlob: blob, duration } = await voiceRecorder.stopRecording();
      setAudioBlob(blob);
      setAudioDuration(duration);

      // Auto undock and open editor drawer so user can inspect or save
      if (isDocked) {
        undockPill();
      }
      setIsExpanded(true);

      // If browser speech recognition did not capture words, transcribe via server
      if (blob && blob.size > 0 && (!liveTranscript || liveTranscript.trim().length < 2)) {
        setIsTranscribing(true);
        setTranscribeNotice('Transcribing audio with AI...');
        try {
          const base64 = await blobToBase64(blob);
          const res = await fetch('/api/ai/transcribe-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.transcript && data.transcript.trim()) {
              setLiveTranscript(data.transcript.trim());
              setTranscribeNotice(null);
            } else {
              setTranscribeNotice(
                'Audio recorded (' +
                  Math.round(duration) +
                  's). No speech transcript detected. You can type notes here or save raw audio.'
              );
            }
          } else {
            setTranscribeNotice(
              'Audio recorded (' +
                Math.round(duration) +
                's). You can type notes here or save the audio directly.'
            );
          }
        } catch (err) {
          console.warn('AI audio transcription error:', err);
          setTranscribeNotice('Audio recorded. You can type notes here or save the audio directly.');
        } finally {
          setIsTranscribing(false);
        }
      }
    } catch (err) {
      console.warn('Stop recording error:', err);
    }
  };

  const discardRecord = () => {
    voiceRecorder.cancelRecording();
    setIsRecording(false);
    setIsTranscribing(false);
    setLiveTranscript('');
    setTranscribeNotice(null);
    setAudioBlob(null);
    setElapsedSeconds(0);
    setIsExpanded(false);
  };

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const text = liveTranscript.trim();
      let audioBase64: string | undefined = undefined;

      if (audioBlob && audioBlob.size > 0) {
        try {
          audioBase64 = await blobToBase64(audioBlob);
        } catch {
          // ignore
        }
      }

      let aiResult: any = null;

      // Only attempt AI structured formatting if we have genuine transcribed text
      if (text) {
        try {
          const res = await fetch('/api/ai/transform-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: text,
              audioBase64,
              mimeType: audioBlob?.type || 'audio/webm',
              userOccupation: userProfile.occupation,
              userFocus: userProfile.focus,
              audioDuration: audioDuration || elapsedSeconds,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            aiResult = data.result;
          }
        } catch (e) {
          console.warn('AI transform call error:', e);
        }
      }

      const durationSec = Math.round(audioDuration || elapsedSeconds);
      const dateStr = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      // Reliable heuristic fallback: never invent fake projects or mock tasks
      if (!aiResult) {
        if (text) {
          const words = text.split(/\s+/);
          const titleCandidate = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
          aiResult = {
            title: titleCandidate || `Voice Note - ${dateStr}`,
            summary: text.slice(0, 160) + (text.length > 160 ? '...' : ''),
            intent: userProfile.occupation || 'Note',
            sections: [{ title: 'Notes', content: text }],
            actionItems: [],
          };
        } else {
          aiResult = {
            title: `Voice Recording (${durationSec}s)`,
            summary: `Spoken audio recording (${durationSec}s) captured on ${dateStr}.`,
            intent: 'Voice Note',
            sections: [
              {
                title: 'Audio Recording',
                content: `Recorded ${durationSec} seconds of audio. Listen using the audio player above or edit to add transcript notes.`,
              },
            ],
            actionItems: [],
          };
        }
      }

      const newNote: VoiceNote = {
        id: `note-${Date.now()}`,
        title: aiResult.title || `Voice Note (${durationSec}s)`,
        transcript: text || '',
        summary: aiResult.summary || '',
        intent: aiResult.intent || 'Voice Note',
        sections: aiResult.sections || [{ title: 'Notes', content: text || 'Audio recording captured.' }],
        actionItems: aiResult.actionItems || [],
        duration: durationSec,
        audioBlob: audioBlob || undefined,
        audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
        createdAt: Date.now(),
      };

      // Save locally to IndexedDB & fallback
      await saveVoiceNote(newNote);

      // Notify parent to render immediately in list
      onNoteCreated(newNote);

      // Background cloud sync
      fetch('/api/sync/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: [
            {
              id: newNote.id,
              title: newNote.title,
              rawTranscript: newNote.transcript,
              structuredNote: {
                title: newNote.title,
                summary: newNote.summary,
                detectedIntent: newNote.intent,
                structuredSections: newNote.sections.map((s) => ({
                  title: s.title,
                  content: s.content,
                  type: 'notes',
                })),
                actionItems: newNote.actionItems.map((a) => ({
                  text: a.text,
                  status: a.done ? 'completed' : 'pending',
                  priority: 'medium',
                })),
                tags: [userProfile.occupation],
                suggestedFollowUps: [],
              },
              personaId: 'custom',
              personaName: userProfile.occupation,
              audioDuration: newNote.duration,
              createdAt: newNote.createdAt,
              updatedAt: newNote.createdAt,
            },
          ],
        }),
      }).catch(() => {});

      // Reset editor state
      setLiveTranscript('');
      setTranscribeNotice(null);
      setAudioBlob(null);
      setElapsedSeconds(0);
      setIsExpanded(false);
    } catch (e) {
      console.error('Error saving voice note:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Minimized side tab view when docked to Left or Right
  if (isDocked) {
    const isLeft = isDocked === 'left';
    return (
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          top: `${position.y}px`,
          left: isLeft ? 0 : 'auto',
          right: isLeft ? 'auto' : 0,
          touchAction: 'none',
        }}
        className={`fixed z-40 select-none ${
          isDragging ? 'cursor-grabbing scale-[1.02]' : 'cursor-grab'
        }`}
      >
        <div
          className={`flex items-center gap-2 py-2 px-3 bg-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md text-slate-100 ${
            isLeft ? 'rounded-r-2xl border-l-0 pl-3.5' : 'rounded-l-2xl border-r-0 pr-3.5'
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-mono text-xs text-rose-400 font-medium tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
              <button
                type="button"
                onClick={stopRecord}
                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startRecord}
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer"
              >
                Rec
              </button>
            </>
          )}

          <button
            type="button"
            onClick={undockPill}
            className="text-[11px] text-slate-400 hover:text-white px-1.5 py-1 rounded cursor-pointer"
            title="Expand to full modal"
          >
            Expand
          </button>
        </div>
      </div>
    );
  }

  // Full floating capsule & drawer
  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
      }}
      className={`fixed top-0 left-0 z-40 select-none ${
        isDragging ? 'cursor-grabbing scale-[1.01]' : 'cursor-grab'
      }`}
    >
      <div className="flex flex-col items-center">
        {/* Transcript & Correction Drawer */}
        {isExpanded && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="w-72 sm:w-84 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3.5 mb-2 backdrop-blur-md text-slate-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-medium text-slate-300">
                {isRecording
                  ? 'Listening...'
                  : isTranscribing
                  ? 'Transcribing voice with AI...'
                  : 'Transcript Editor'}
              </span>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
              >
                Hide
              </button>
            </div>

            <div className="my-2.5">
              <textarea
                value={liveTranscript}
                onChange={(e) => setLiveTranscript(e.target.value)}
                placeholder={
                  isRecording
                    ? 'Listening to speech...'
                    : isTranscribing
                    ? 'Transcribing audio with Gemini...'
                    : 'Type note or speak into microphone...'
                }
                rows={3}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans resize-none"
              />
              {transcribeNotice && (
                <p className="mt-1.5 text-[11px] text-indigo-300/90 leading-tight">
                  {transcribeNotice}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={discardRecord}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
              >
                Discard
              </button>

              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecord}
                  className="px-3.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessing || isTranscribing || (!liveTranscript.trim() && !audioBlob)}
                  onClick={handleSave}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {isProcessing
                    ? 'Saving...'
                    : isTranscribing
                    ? 'Transcribing...'
                    : 'Save Note'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Floating Capsule */}
        <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-full shadow-lg backdrop-blur-md text-slate-100">
          {/* Equalizer */}
          <div className="flex items-center gap-0.5 h-4 px-0.5">
            {waveLevels.map((lvl, idx) => (
              <span
                key={idx}
                style={{ height: `${lvl}px` }}
                className={`w-0.5 rounded-full transition-all duration-75 ${
                  isRecording ? 'bg-indigo-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          {isRecording && (
            <span className="font-mono text-xs text-rose-400 font-medium tabular-nums">
              {formatTime(elapsedSeconds)}
            </span>
          )}

          {isRecording ? (
            <button
              type="button"
              onClick={stopRecord}
              className="px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecord}
              className="px-2.5 py-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Rec
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-0.5 text-xs text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
          >
            {isExpanded ? 'Hide' : 'Edit'}
          </button>

          <button
            type="button"
            onClick={() => dockToSide('right')}
            className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-300 rounded-full transition-colors cursor-pointer"
            title="Minimize to side"
          >
            Dock
          </button>
        </div>
      </div>
    </div>
  );
};
