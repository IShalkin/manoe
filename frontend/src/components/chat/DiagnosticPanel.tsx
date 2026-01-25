/**
 * DiagnosticPanel - Two-pass critic diagnostic analysis display
 */

import type { DiagnosticState } from '../../types/chat';

export interface DiagnosticPanelProps {
  diagnosticResults: Record<number, DiagnosticState>;
  activeDiagnosticScene: number | null;
}

export function DiagnosticPanel({
  diagnosticResults,
  activeDiagnosticScene,
}: DiagnosticPanelProps) {
  if (Object.keys(diagnosticResults).length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-3 sm:py-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <span className="text-xs font-medium text-slate-300">Diagnostic Analysis</span>
        {activeDiagnosticScene && (
          <span className="text-xs text-sky-400 animate-pulse">Analyzing Scene {activeDiagnosticScene}...</span>
        )}
      </div>
      
      <div className="space-y-3">
        {Object.values(diagnosticResults).map(diagnostic => (
          <DiagnosticSceneCard key={diagnostic.scene_number} diagnostic={diagnostic} />
        ))}
      </div>
    </div>
  );
}

interface DiagnosticSceneCardProps {
  diagnostic: DiagnosticState;
}

function getSeverityColors(severity: string): { bg: string; border: string; text: string; badge: string } {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300',
      };
    case 'major':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-300',
      };
    default:
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        text: 'text-yellow-400',
        badge: 'bg-yellow-500/20 text-yellow-300',
      };
  }
}

function DiagnosticSceneCard({ diagnostic }: DiagnosticSceneCardProps) {
  return (
    <div className="rounded-lg overflow-hidden">
      {/* Scene Header */}
      <div className={`px-3 py-2 flex items-center justify-between ${
        diagnostic.status === 'rubric_scanning' ? 'bg-sky-500/20 border border-sky-500/30' :
        diagnostic.status === 'analyzing_weakness' ? 'bg-sky-500/20 border border-sky-500/30' :
        diagnostic.status === 'revision_sent' ? 'bg-amber-500/20 border border-amber-500/30' :
        'bg-emerald-500/20 border border-emerald-500/30'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${
            diagnostic.status === 'rubric_scanning' || diagnostic.status === 'analyzing_weakness' ? 'text-sky-400' :
            diagnostic.status === 'revision_sent' ? 'text-amber-400' :
            'text-emerald-400'
          }`}>
            Scene {diagnostic.scene_number}
          </span>
          {diagnostic.status === 'rubric_scanning' && (
            <span className="text-[10px] text-sky-300 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Rubric Scan
            </span>
          )}
          {diagnostic.status === 'analyzing_weakness' && (
            <span className="text-[10px] text-sky-300 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Finding Weakest Link
            </span>
          )}
          {diagnostic.status === 'revision_sent' && (
            <span className="text-[10px] text-amber-300">Revision Requested</span>
          )}
        </div>
        {diagnostic.rubric && (
          <span className={`text-xs font-bold ${
            diagnostic.rubric.overall_score >= 8 ? 'text-emerald-400' :
            diagnostic.rubric.overall_score >= 6 ? 'text-amber-400' :
            'text-red-400'
          }`}>
            {diagnostic.rubric.overall_score.toFixed(1)}/10
          </span>
        )}
      </div>

      {/* Rubric Details */}
      {diagnostic.rubric && (
        <div className="bg-slate-900/50 px-3 py-2 border-x border-b border-slate-700/50">
          {/* Dimension Scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            {Object.entries(diagnostic.rubric.dimensions).map(([dim, score]) => (
              <div key={dim} className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 truncate" title={dim.replace(/_/g, ' ')}>
                  {dim.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase()).join('')}
                </span>
                <span className={`font-medium ${
                  score >= 8 ? 'text-emerald-400' :
                  score >= 6 ? 'text-amber-400' :
                  'text-red-400'
                }`}>{score}</span>
              </div>
            ))}
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {diagnostic.rubric.didacticism_detected && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">
                Didacticism Detected
              </span>
            )}
            {diagnostic.rubric.cliches_found.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {diagnostic.rubric.cliches_found.length} Cliches
              </span>
            )}
          </div>

          {/* Weakness Candidates */}
          {diagnostic.rubric.weakness_candidates.length > 0 && (
            <div className="text-[10px] text-slate-400">
              <span className="text-slate-500">Weaknesses: </span>
              {diagnostic.rubric.weakness_candidates.map((w, i) => (
                <span key={i} className="text-amber-400">
                  {w.dimension.replace(/_/g, ' ')} ({w.score})
                  {i < diagnostic.rubric!.weakness_candidates.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weakest Link Details */}
      {diagnostic.weakest_link && (() => {
        const colors = getSeverityColors(diagnostic.weakest_link.severity);
        return (
          <div className={`px-3 py-2 border-x border-b rounded-b-lg ${colors.bg} ${colors.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <svg className={`w-3 h-3 ${colors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className={`text-xs font-medium ${colors.text}`}>
                {diagnostic.weakest_link.dimension.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.badge}`}>
                {diagnostic.weakest_link.severity}
              </span>
            </div>
            {diagnostic.weakest_link.revision_issues && (
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {diagnostic.weakest_link.revision_issues}
              </p>
            )}
            {diagnostic.weakest_link.evidence && (
              <p className="text-[10px] text-slate-500 mt-1 italic border-l-2 border-slate-600 pl-2">
                "{diagnostic.weakest_link.evidence.substring(0, 100)}{diagnostic.weakest_link.evidence.length > 100 ? '...' : ''}"
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
