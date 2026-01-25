/**
 * ChatHeader - Header component for the AgentChat panel
 * Displays connection status, current phase, and control buttons
 */

export interface ChatHeaderProps {
  currentPhase: string;
  isConnected: boolean;
  isComplete: boolean;
  isCancelled: boolean;
  isCancelling: boolean;
  isResuming: boolean;
  onStop: () => void;
  onResume: () => void;
  onClose?: (() => void) | undefined;
}

export function ChatHeader({
  currentPhase,
  isConnected,
  isComplete,
  isCancelled,
  isCancelling,
  isResuming,
  onStop,
  onResume,
  onClose,
}: ChatHeaderProps) {
  const getStatusStyle = () => {
    if (isCancelled) return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    if (isConnected) return 'bg-green-500/20 text-green-400 border border-green-500/30';
    if (isComplete) return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    return 'bg-red-500/20 text-red-400 border border-red-500/30';
  };

  const getIndicatorStyle = () => {
    if (isCancelled) return 'bg-amber-400';
    if (isConnected) return 'bg-green-400 animate-pulse';
    if (isComplete) return 'bg-blue-400';
    return 'bg-red-400';
  };

  const getStatusText = () => {
    if (isCancelled) return 'Cancelled';
    if (isConnected) return 'Live';
    if (isComplete) return 'Complete';
    return 'Disconnected';
  };

  return (
    <div className="bg-slate-900/80 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        <h3 className="font-bold text-base sm:text-lg">Multi-Agent Orchestration</h3>
        <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium ${getStatusStyle()}`}>
          <div className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${getIndicatorStyle()}`} />
          {getStatusText()}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-xs sm:text-sm text-slate-400">
          Phase: <span className="text-white font-medium">{currentPhase}</span>
        </span>
        
        {/* Stop button - shown when connected and running */}
        {isConnected && !isComplete && !isCancelled && (
          <button 
            onClick={onStop}
            disabled={isCancelling}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isCancelling 
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            }`}
          >
            {isCancelling ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Stopping...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop
              </>
            )}
          </button>
        )}
        
        {/* Resume button - shown when cancelled */}
        {isCancelled && !isComplete && (
          <button 
            onClick={onResume}
            disabled={isResuming}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isResuming 
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            }`}
          >
            {isResuming ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Resuming...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Resume
              </>
            )}
          </button>
        )}
        
        {/* Close button */}
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
