/**
 * ErrorDisplay - Error and interruption status with resume functionality
 */

export interface ErrorDisplayProps {
  error: string | null;
  generationError: string | null;
  isInterrupted: boolean;
  lastCompletedPhase: string | null;
  resumeFromPhase: string | null;
  canResume: boolean;
  isLoadingResumeState: boolean;
  onResume?: (runId: string, fromPhase: string) => void;
  onResumeInterrupted: () => void;
}

export function ErrorDisplay({
  error,
  generationError,
  isInterrupted,
  lastCompletedPhase,
  resumeFromPhase,
  canResume,
  isLoadingResumeState,
  onResume,
  onResumeInterrupted,
}: ErrorDisplayProps) {
  if (!error && !generationError) {
    return null;
  }

  return (
    <div className={`border-b px-4 py-3 ${isInterrupted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className={`text-sm ${isInterrupted ? 'text-amber-400' : 'text-red-400'}`}>
            {error || generationError}
          </p>
          {isInterrupted && lastCompletedPhase && (
            <p className="text-xs text-slate-400 mt-1">
              Last completed phase: <span className="text-amber-300 font-medium">{lastCompletedPhase}</span>
              {resumeFromPhase && (
                <span> - Will resume from: <span className="text-emerald-300 font-medium">{resumeFromPhase}</span></span>
              )}
            </p>
          )}
        </div>
        {isInterrupted && canResume && onResume && (
          <button
            onClick={onResumeInterrupted}
            disabled={isLoadingResumeState}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isLoadingResumeState ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Resume</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
