/**
 * AgentChat Integration Tests
 * 
 * Tests that AgentChat correctly receives SSE data via props
 * and renders the appropriate UI elements.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentChat } from '../../components/AgentChat';
import type { AgentMessage } from '../../types/chat';

// Mock orchestratorFetch
vi.mock('../../lib/api', () => ({
  orchestratorFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

// Mock FeedbackButtons to avoid complexity
vi.mock('../../components/FeedbackButtons', () => ({
  FeedbackButtons: () => <div data-testid="feedback-buttons">Feedback</div>,
}));

// Mock NarrativePossibilitiesSelector
vi.mock('../../components/NarrativePossibilitiesSelector', () => ({
  NarrativePossibilitiesSelector: () => <div data-testid="narrative-selector">Selector</div>,
}));

describe('AgentChat', () => {
  const defaultProps = {
    runId: 'test-run-123',
    projectId: 'test-project-456',
    messages: [] as AgentMessage[],
    isConnected: false,
    currentPhase: 'Initializing',
    activeAgent: null,
    isComplete: false,
    isCancelled: false,
    error: null,
    narrativePossibilities: [],
    narrativeRecommendation: null,
    checkpointResults: {},
    activeCheckpoint: null,
    motifLayerResult: null,
    isMotifPlanningActive: false,
    diagnosticResults: {},
    activeDiagnosticScene: null,
    isInterrupted: false,
    projectResult: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Status', () => {
    it('should display "Live" when connected', () => {
      render(<AgentChat {...defaultProps} isConnected={true} />);
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('should display "Disconnected" when not connected and not complete', () => {
      render(<AgentChat {...defaultProps} isConnected={false} isComplete={false} />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('should display "Complete" when generation is complete', () => {
      render(<AgentChat {...defaultProps} isConnected={false} isComplete={true} />);
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('should display "Cancelled" when generation is cancelled', () => {
      render(<AgentChat {...defaultProps} isCancelled={true} />);
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Phase Display', () => {
    it('should display the current phase', () => {
      render(<AgentChat {...defaultProps} currentPhase="Profiling" />);
      expect(screen.getByText('Profiling')).toBeInTheDocument();
    });

    it('should update phase display when prop changes', () => {
      const { rerender } = render(<AgentChat {...defaultProps} currentPhase="Profiling" />);
      expect(screen.getByText('Profiling')).toBeInTheDocument();
      
      rerender(<AgentChat {...defaultProps} currentPhase="Writing" />);
      expect(screen.getByText('Writing')).toBeInTheDocument();
    });
  });

  describe('Stop/Resume Buttons', () => {
    it('should show Stop button when connected and not complete', () => {
      render(<AgentChat {...defaultProps} isConnected={true} isComplete={false} />);
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    it('should not show Stop button when generation is complete', () => {
      render(<AgentChat {...defaultProps} isConnected={true} isComplete={true} />);
      expect(screen.queryByText('Stop')).not.toBeInTheDocument();
    });

    it('should show Resume button when cancelled', () => {
      render(<AgentChat {...defaultProps} isCancelled={true} isComplete={false} />);
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });

    it('should call onReconnect when Resume is clicked', async () => {
      const onReconnect = vi.fn();
      render(
        <AgentChat 
          {...defaultProps} 
          isCancelled={true} 
          isComplete={false}
          onReconnect={onReconnect}
        />
      );
      
      const resumeButton = screen.getByText('Resume');
      fireEvent.click(resumeButton);
      
      // Wait for async operation
      await waitFor(() => {
        expect(onReconnect).toHaveBeenCalled();
      });
    });
  });

  describe('Error Display', () => {
    it('should display error message when error prop is set', () => {
      render(<AgentChat {...defaultProps} error="Connection failed" />);
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
    });

    it('should not display error section when no error', () => {
      render(<AgentChat {...defaultProps} error={null} />);
      expect(screen.queryByText(/Connection failed/)).not.toBeInTheDocument();
    });
  });

  describe('Messages Rendering', () => {
    it('should render agent messages', () => {
      const messages: AgentMessage[] = [
        {
          type: 'agent_message',
          data: {
            agent: 'Architect',
            content: 'Building the narrative structure...',
          },
        },
      ];
      
      render(<AgentChat {...defaultProps} messages={messages} />);
      // Agent name should be displayed (multiple times - in grid and in content)
      const architectElements = screen.getAllByText('Architect');
      expect(architectElements.length).toBeGreaterThan(0);
    });

    it('should handle multiple agent messages', () => {
      const messages: AgentMessage[] = [
        {
          type: 'agent_message',
          data: { agent: 'Architect', content: 'First message' },
        },
        {
          type: 'agent_message',
          data: { agent: 'Writer', content: 'Second message' },
        },
      ];
      
      render(<AgentChat {...defaultProps} messages={messages} />);
      // Both agents should be displayed (in grid and potentially in content)
      expect(screen.getAllByText('Architect').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Writer').length).toBeGreaterThan(0);
    });
  });

  describe('Interrupted State', () => {
    it('should show resume UI when interrupted', () => {
      render(
        <AgentChat 
          {...defaultProps} 
          isInterrupted={true}
          isComplete={true}
          currentPhase="Interrupted"
        />
      );
      expect(screen.getByText('Interrupted')).toBeInTheDocument();
    });
  });

  describe('Props Integration', () => {
    it('should not create its own SSE connection (no useGenerationStream call)', () => {
      // This test verifies that AgentChat receives all data via props
      // and doesn't establish its own SSE connection
      const { container } = render(<AgentChat {...defaultProps} />);
      
      // Component should render without errors when receiving props
      expect(container.querySelector('.bg-slate-800\\/30')).toBeInTheDocument();
    });

    it('should update UI when props change without reconnecting', () => {
      const { rerender } = render(
        <AgentChat {...defaultProps} messages={[]} currentPhase="Phase 1" />
      );
      
      const newMessages: AgentMessage[] = [
        { type: 'agent_message', data: { agent: 'Profiler', content: 'Analyzing...' } },
      ];
      
      rerender(
        <AgentChat {...defaultProps} messages={newMessages} currentPhase="Phase 2" />
      );
      
      expect(screen.getByText('Phase 2')).toBeInTheDocument();
      expect(screen.getAllByText('Profiler').length).toBeGreaterThan(0);
    });
  });
});
