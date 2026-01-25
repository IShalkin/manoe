/**
 * CheckpointsPanel - Structural checkpoints status display
 */

export interface CheckpointResult {
  scene_number: number;
  overall_score: number;
  passed: boolean;
}

export interface CheckpointsPanelProps {
  checkpointResults: Record<string, CheckpointResult>;
  activeCheckpoint: string | null;
}

const CHECKPOINT_TYPES = ['inciting_incident', 'midpoint', 'climax', 'resolution'] as const;

export function CheckpointsPanel({
  checkpointResults,
  activeCheckpoint,
}: CheckpointsPanelProps) {
  if (Object.keys(checkpointResults).length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-medium text-slate-300">Structural Checkpoints</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {CHECKPOINT_TYPES.map(checkpointType => {
          const result = checkpointResults[checkpointType];
          const isActive = activeCheckpoint === checkpointType;
          const isPending = result && result.overall_score === 0;
          const passed = result?.passed;
          const score = result?.overall_score;
          
          return (
            <div
              key={checkpointType}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all
                ${isActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse' : ''}
                ${!isActive && result && passed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : ''}
                ${!isActive && result && !passed && !isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''}
                ${!result ? 'bg-slate-700/50 text-slate-500 border border-slate-600/30' : ''}
                ${isPending && !isActive ? 'bg-slate-700/50 text-slate-400 border border-slate-600/30' : ''}
              `}
              title={result ? `Scene ${result.scene_number}: ${passed ? 'Passed' : 'Needs Revision'} (${score?.toFixed(1)}/10)` : 'Not yet evaluated'}
            >
              {isActive && (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {!isActive && result && passed && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {!isActive && result && !passed && !isPending && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              <span className="capitalize">{checkpointType.replace(/_/g, ' ')}</span>
              {result && !isPending && (
                <span className="text-[10px] opacity-75">({score?.toFixed(1)})</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
