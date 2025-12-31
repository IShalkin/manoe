/**
 * FeedbackButtons Component for MANOE
 * Provides thumbs up/down feedback buttons for agent outputs
 * 
 * Features:
 * - Thumbs up/down buttons for explicit user feedback
 * - Visual feedback state (selected, loading)
 * - Integration with feedback API
 * - Compact and inline design for agent cards
 */

import { useState } from 'react';
import { orchestratorFetch } from '../lib/api';

interface FeedbackButtonsProps {
  runId: string;
  projectId: string;
  agentName: string;
  sceneNumber?: number;
  size?: 'sm' | 'md';
  className?: string;
}

type FeedbackState = 'none' | 'thumbs_up' | 'thumbs_down';

export function FeedbackButtons({
  runId,
  projectId,
  agentName,
  sceneNumber,
  size = 'sm',
  className = '',
}: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<FeedbackState>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitFeedback = async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await orchestratorFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          runId,
          projectId,
          agentName,
          feedbackType,
          sceneNumber,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setFeedback(feedbackType);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback');
    } finally {
      setIsLoading(false);
    }
  };

  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const buttonPadding = size === 'sm' ? 'p-1' : 'p-1.5';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={() => submitFeedback('thumbs_up')}
        disabled={isLoading || feedback !== 'none'}
        className={`
          ${buttonPadding} rounded transition-all duration-200
          ${feedback === 'thumbs_up'
            ? 'bg-green-500/20 text-green-400'
            : feedback === 'none'
              ? 'text-slate-500 hover:text-green-400 hover:bg-green-500/10'
              : 'text-slate-600 cursor-not-allowed'
          }
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
        `}
        title="Good output"
        aria-label="Thumbs up"
      >
        <svg
          className={iconSize}
          fill={feedback === 'thumbs_up' ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
          />
        </svg>
      </button>

      <button
        onClick={() => submitFeedback('thumbs_down')}
        disabled={isLoading || feedback !== 'none'}
        className={`
          ${buttonPadding} rounded transition-all duration-200
          ${feedback === 'thumbs_down'
            ? 'bg-red-500/20 text-red-400'
            : feedback === 'none'
              ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
              : 'text-slate-600 cursor-not-allowed'
          }
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
        `}
        title="Poor output"
        aria-label="Thumbs down"
      >
        <svg
          className={iconSize}
          fill={feedback === 'thumbs_down' ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
          />
        </svg>
      </button>

      {error && (
        <span className="text-xs text-red-400 ml-1" title={error}>
          !
        </span>
      )}
    </div>
  );
}

export default FeedbackButtons;
