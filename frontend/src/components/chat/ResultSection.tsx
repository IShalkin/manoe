/**
 * ResultSection - Displays the final generated result
 */

import { MarkdownContent } from './MarkdownContent';
import { formatAgentContent } from '../../utils/formatting';

export interface ResultSectionProps {
  isComplete: boolean;
  finalResult: string | null;
}

export function ResultSection({ isComplete, finalResult }: ResultSectionProps) {
  if (!isComplete && !finalResult) {
    return null;
  }

  return (
    <div className="border-t border-slate-700">
      <div className="bg-slate-800/50 px-4 py-3 flex items-center gap-3">
        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h4 className="font-semibold text-green-400">Generated Result</h4>
      </div>
      <div className="p-4 bg-slate-900/30 max-h-[300px] overflow-y-auto">
        {finalResult ? (
          <MarkdownContent content={formatAgentContent(finalResult)} />
        ) : (
          <p className="text-sm text-slate-500 italic">Processing result...</p>
        )}
      </div>
    </div>
  );
}
