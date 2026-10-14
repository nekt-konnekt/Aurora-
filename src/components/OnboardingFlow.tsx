import React, { useState } from 'react';
import { UserProfile } from '../types';

interface OnboardingFlowProps {
  initialProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
  onCancel?: () => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialProfile,
  onComplete,
  onCancel,
}) => {
  const [occupation, setOccupation] = useState(initialProfile?.occupation || '');
  const [focus, setFocus] = useState(initialProfile?.focus || '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOccupation = occupation.trim();
    if (!cleanOccupation) {
      setError('Please enter your occupation.');
      return;
    }

    onComplete({
      occupation: cleanOccupation,
      focus: focus.trim(),
      registeredAt: Date.now(),
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center px-6 py-12">
      <div className="max-w-md w-full mx-auto">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-white mb-6 transition-colors cursor-pointer"
          >
            Back
          </button>
        )}

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            What do you do?
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Aurora organizes your voice notes according to your work.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Profession / Role
            </label>
            <input
              type="text"
              autoFocus
              value={occupation}
              onChange={(e) => {
                setOccupation(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Lawyer"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <p className="text-xs text-rose-400 mt-1.5">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Note Focus <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. client facts"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-center cursor-pointer"
          >
            Start Note Taking
          </button>
        </form>
      </div>
    </div>
  );
};
