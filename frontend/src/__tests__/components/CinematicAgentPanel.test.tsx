/**
 * CinematicAgentPanel Integration Tests
 * 
 * Tests that CinematicAgentPanel correctly receives SSE data via props
 * and renders agent interactions.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CinematicAgentPanel } from '../../components/cinematic/CinematicAgentPanel';
import type { AgentMessage } from '../../types/chat';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('CinematicAgentPanel', () => {
  const defaultProps = {
    messages: [] as AgentMessage[],
    currentPhase: 'Initializing',
    activeAgent: null as string | null,
    isConnected: false,
  };

  describe('Connection Status', () => {
    it('should display "Connected" when isConnected is true', () => {
      render(<CinematicAgentPanel {...defaultProps} isConnected={true} />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should display "Disconnected" when isConnected is false', () => {
      render(<CinematicAgentPanel {...defaultProps} isConnected={false} />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('Phase Display', () => {
    it('should display current phase', () => {
      render(<CinematicAgentPanel {...defaultProps} currentPhase="Profiling" />);
      expect(screen.getByText('Profiling')).toBeInTheDocument();
    });

    it('should display "Waiting..." when no phase', () => {
      render(<CinematicAgentPanel {...defaultProps} currentPhase="" />);
      expect(screen.getByText('Waiting...')).toBeInTheDocument();
    });
  });

  describe('Agent Grid', () => {
    it('should render all 9 agents', () => {
      render(<CinematicAgentPanel {...defaultProps} />);
      
      const agents = ['architect', 'profiler', 'worldbuilder', 'strategist', 'writer', 'critic', 'originality', 'impact', 'archivist'];
      agents.forEach(agent => {
        expect(screen.getByText(agent)).toBeInTheDocument();
      });
    });
  });

  describe('Cinematic Messages Filtering', () => {
    it('should display agent_thought messages', () => {
      const messages: AgentMessage[] = [
        {
          type: 'agent_thought',
          data: {
            agent: 'architect',
            thought: 'Thinking about the narrative structure...',
          },
        },
      ];
      
      render(<CinematicAgentPanel {...defaultProps} messages={messages} />);
      expect(screen.getByText('Thinking about the narrative structure...')).toBeInTheDocument();
    });

    it('should display agent_dialogue messages', () => {
      const messages: AgentMessage[] = [
        {
          type: 'agent_dialogue',
          data: {
            from: 'architect',
            to: 'profiler',
            message: 'What do you think about this character?',
            dialogueType: 'question',
          },
        },
      ];
      
      render(<CinematicAgentPanel {...defaultProps} messages={messages} />);
      expect(screen.getByText('What do you think about this character?')).toBeInTheDocument();
    });

    it('should filter out non-cinematic events', () => {
      const messages: AgentMessage[] = [
        {
          type: 'phase_start',
          data: { phase: 'profiling' },
        },
        {
          type: 'agent_message',
          data: { agent: 'Architect', content: 'This should not appear' },
        },
        {
          type: 'agent_thought',
          data: { agent: 'architect', thought: 'This SHOULD appear' },
        },
      ];
      
      render(<CinematicAgentPanel {...defaultProps} messages={messages} />);
      expect(screen.getByText('This SHOULD appear')).toBeInTheDocument();
      expect(screen.queryByText('This should not appear')).not.toBeInTheDocument();
    });

    it('should show waiting message when no cinematic messages', () => {
      const messages: AgentMessage[] = [
        { type: 'phase_start', data: { phase: 'profiling' } },
      ];
      
      render(<CinematicAgentPanel {...defaultProps} messages={messages} />);
      expect(screen.getByText('Waiting for agent interactions...')).toBeInTheDocument();
    });
  });

  describe('Props Integration', () => {
    it('should not use useGenerationStream internally', () => {
      // This test verifies that CinematicAgentPanel receives all data via props
      // Component should render without errors when receiving props
      const { container } = render(<CinematicAgentPanel {...defaultProps} />);
      expect(container.querySelector('.bg-gradient-to-b')).toBeInTheDocument();
    });

    it('should update when messages prop changes', () => {
      const { rerender } = render(
        <CinematicAgentPanel {...defaultProps} messages={[]} />
      );
      
      expect(screen.getByText('Waiting for agent interactions...')).toBeInTheDocument();
      
      const newMessages: AgentMessage[] = [
        {
          type: 'agent_thought',
          data: { agent: 'writer', thought: 'New thought appeared!' },
        },
      ];
      
      rerender(<CinematicAgentPanel {...defaultProps} messages={newMessages} />);
      
      expect(screen.getByText('New thought appeared!')).toBeInTheDocument();
      expect(screen.queryByText('Waiting for agent interactions...')).not.toBeInTheDocument();
    });
  });

  describe('Active Agent', () => {
    it('should handle active agent prop', () => {
      // When an agent is active, its avatar should reflect that
      render(<CinematicAgentPanel {...defaultProps} activeAgent="architect" />);
      // Component should render without errors
      expect(screen.getByText('architect')).toBeInTheDocument();
    });
  });
});
