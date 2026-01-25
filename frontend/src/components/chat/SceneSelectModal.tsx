/**
 * SceneSelectModal - Modal for selecting scenes to regenerate
 */

export interface SceneSelectModalProps {
  sceneCount: number;
  selectedScenes: number[];
  onToggleScene: (sceneNum: number) => void;
  onSelectAll: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SceneSelectModal({
  sceneCount,
  selectedScenes,
  onToggleScene,
  onSelectAll,
  onConfirm,
  onCancel,
}: SceneSelectModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">Regenerate Selected Scenes</h3>
          <p className="text-sm text-slate-400 mt-1">
            Select which scenes you want to regenerate. Unselected scenes will be kept as-is.
          </p>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">{sceneCount} scenes available</span>
            <button
              onClick={onSelectAll}
              className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {selectedScenes.length === sceneCount ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: sceneCount }, (_, i) => i + 1).map(sceneNum => (
              <button
                key={sceneNum}
                onClick={() => onToggleScene(sceneNum)}
                className={`
                  p-3 rounded-lg border transition-all text-sm font-medium
                  ${selectedScenes.includes(sceneNum)
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }
                `}
              >
                Scene {sceneNum}
              </button>
            ))}
          </div>
          
          {selectedScenes.length > 0 && (
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="text-xs text-cyan-300">
                <strong>{selectedScenes.length}</strong> scene{selectedScenes.length !== 1 ? 's' : ''} selected for regeneration.
                The AI will maintain continuity with adjacent unchanged scenes.
              </p>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={selectedScenes.length === 0}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate {selectedScenes.length} Scene{selectedScenes.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
