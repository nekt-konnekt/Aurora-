import React, { useState, useRef } from 'react';
import { VoiceNote } from '../types';
import { exportToMarkdown, exportToWordDoc, exportAudioFile } from '../utils/export';

interface NoteViewModalProps {
  note: VoiceNote | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateNote: (note: VoiceNote) => void;
  onDeleteNote: (id: string) => void;
}

export const NoteViewModal: React.FC<NoteViewModalProps> = ({
  note,
  isOpen,
  onClose,
  onUpdateNote,
  onDeleteNote,
}) => {
  if (!isOpen || !note) return null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState(note.transcript);
  const [copied, setCopied] = useState(false);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleTask = (index: number) => {
    const updatedTasks = [...note.actionItems];
    updatedTasks[index].done = !updatedTasks[index].done;
    onUpdateNote({
      ...note,
      actionItems: updatedTasks,
    });
  };

  const handleSaveTranscript = () => {
    onUpdateNote({
      ...note,
      transcript: editedTranscript,
    });
    setIsEditing(false);
  };

  const copyNote = () => {
    const text = `${note.title}\n\n${note.summary}\n\n${note.sections
      .map((s) => `${s.title}:\n${s.content}`)
      .join('\n\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] text-slate-100 overflow-hidden my-auto">
        {note.audioUrl && (
          <audio
            ref={audioRef}
            src={note.audioUrl}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
          />
        )}

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/60">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-indigo-400 block mb-0.5">
              {note.intent || 'Note'}
            </span>
            <h2 className="text-base font-bold text-white truncate">{note.title}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onDeleteNote(note.id)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Audio Bar (if recorded) */}
        {note.audioUrl && (
          <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
            <button
              onClick={toggleAudio}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shrink-0 cursor-pointer"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {Math.floor(currentTime)}s / {Math.round(note.duration)}s
            </span>

            <div className="flex-1" />

            <button
              onClick={() => exportAudioFile(note)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition-colors cursor-pointer"
            >
              Audio
            </button>
          </div>
        )}

        {/* Note Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm">
          {/* Summary */}
          {note.summary && (
            <div className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl text-slate-300 leading-relaxed">
              {note.summary}
            </div>
          )}

          {/* Structured Sections */}
          {note.sections &&
            note.sections.map((sec, idx) => (
              <div key={idx} className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {sec.title}
                </h4>
                <div className="p-3.5 bg-slate-950/60 border border-slate-800/60 rounded-xl text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {sec.content}
                </div>
              </div>
            ))}

          {/* Action Tasks */}
          {note.actionItems && note.actionItems.length > 0 && (
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Tasks
              </h4>
              <div className="space-y-1.5">
                {note.actionItems.map((item, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl cursor-pointer hover:bg-slate-950"
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleTask(idx)}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span className={item.done ? 'line-through text-slate-500' : 'text-slate-200'}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Transcript / Error Correction Editor */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Transcript & Corrections
              </h4>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {isEditing ? 'Cancel' : 'Edit Text'}
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={editedTranscript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans"
                />
                <button
                  onClick={handleSaveTranscript}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            ) : (
              <p className="p-3 bg-slate-950/40 border border-slate-800/40 rounded-xl text-slate-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {note.transcript || '(No speech transcript detected. Click "Edit Text" above to add your notes.)'}
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions: Markdown, Word .doc, Copy */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToMarkdown(note)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Markdown
            </button>
            <button
              onClick={() => exportToWordDoc(note)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Word .doc
            </button>
          </div>

          <button
            onClick={copyNote}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};
