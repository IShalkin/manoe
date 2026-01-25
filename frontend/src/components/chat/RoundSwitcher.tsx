/**
 * RoundSwitcher - Navigation component for switching between generation rounds
 * Includes round buttons and playback controls
 */

export interface RoundSwitcherProps {
  rounds: number[];
  selectedRound: number | null;
  isPlaying: boolean;
  onSelectRound: (round: number | null) => void;
  onTogglePlayback: () => void;
}

export function RoundSwitcher({
  rounds,
  selectedRound,
  isPlaying,
  onSelectRound,
  onTogglePlayback,
}: RoundSwitcherProps) {
  if (rounds.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-slate-800/50 border-b border-slate-700">
      <span className="text-xs text-slate-400 font-medium">Steps:</span>
      
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onSelectRound(null)}
          className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            selectedRound === null 
              ? 'bg-blue-500 text-white' 
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          All
        </button>
        
        {rounds.map(round => (
          <button
            key={round}
            onClick={() => onSelectRound(round)}
            className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedRound === round 
                ? 'bg-blue-500 text-white' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            {round}
          </button>
        ))}
      </div>
      
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onTogglePlayback}
          className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
            isPlaying 
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {isPlaying ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </>
          )}
        </button>
      </div>
    </div>
  );
}
