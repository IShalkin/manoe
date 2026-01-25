import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AgentMessage } from '../../types/chat'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}))

import { useChatEditor } from '../../hooks/useChatEditor'

function createAgentMessage(agent: string, content: string): AgentMessage {
  return {
    type: 'agent_message',
    timestamp: new Date().toISOString(),
    data: { agent, content },
  }
}

describe('useChatEditor', () => {
  describe('initialization', () => {
    it('initializes with null editState', () => {
      const { result } = renderHook(() => useChatEditor({ runId: null, messages: [] }))
      expect(result.current.editState).toBeNull()
    })

    it('initializes with empty lockedAgents', () => {
      const { result } = renderHook(() => useChatEditor({ runId: null, messages: [] }))
      expect(result.current.lockedAgents).toEqual({})
    })

    it('initializes modals as closed', () => {
      const { result } = renderHook(() => useChatEditor({ runId: null, messages: [] }))
      expect(result.current.showConfirmModal).toBe(false)
      expect(result.current.showSceneModal).toBe(false)
    })

    it('syncs lockedAgents from projectResult', () => {
      const projectResult = { locks: { Writer: true } }
      const messages: AgentMessage[] = []
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, projectResult }))
      expect(result.current.lockedAgents).toEqual({ Writer: true })
    })
  })

  describe('edit state', () => {
    it('starts edit with content from messages', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      expect(result.current.editState?.agent).toBe('Architect')
      expect(result.current.editState?.content).toBe('Content')
    })

    it('cancels edit', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleCancelEdit())
      expect(result.current.editState).toBeNull()
    })

    it('updates edit content', () => {
      const messages = [createAgentMessage('Architect', 'Original')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleEditContentChange('Modified'))
      expect(result.current.editState?.content).toBe('Modified')
      expect(result.current.editState?.originalContent).toBe('Original')
    })

    it('gets content from edits first', () => {
      const projectResult = { edits: { Architect: { content: 'Edited', comment: '', updatedAt: '' } } }
      const messages: AgentMessage[] = []
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, projectResult }))
      expect(result.current.getAgentContent('Architect')).toBe('Edited')
    })

    it('gets content from agentOutputs second', () => {
      const projectResult = { agentOutputs: { Architect: 'Output' } }
      const messages: AgentMessage[] = []
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, projectResult }))
      expect(result.current.getAgentContent('Architect')).toBe('Output')
    })

    it('gets content from messages third', () => {
      const messages = [createAgentMessage('Architect', 'Message')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      expect(result.current.getAgentContent('Architect')).toBe('Message')
    })
  })

  describe('agent locking', () => {
    it('toggles lock on and off', () => {
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages: [] }))
      expect(result.current.lockedAgents['Writer']).toBeFalsy()
      act(() => result.current.handleToggleLock('Writer'))
      expect(result.current.lockedAgents['Writer']).toBe(true)
      act(() => result.current.handleToggleLock('Writer'))
      expect(result.current.lockedAgents['Writer']).toBe(false)
    })

    it('calls onUpdateResult when toggling lock', () => {
      const onUpdateResult = vi.fn()
      const projectResult = {}
      const messages: AgentMessage[] = []
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, projectResult, onUpdateResult }))
      act(() => result.current.handleToggleLock('Writer'))
      expect(onUpdateResult).toHaveBeenCalledWith(expect.objectContaining({ locks: { Writer: true } }))
    })
  })

  describe('apply edit flow', () => {
    it('shows confirm modal when applying edit', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      expect(result.current.showConfirmModal).toBe(true)
      expect(result.current.pendingEdit).toEqual({ agent: 'Architect', content: 'Content' })
    })

    it('populates agentsToRegenerate from dependencies', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      expect(result.current.agentsToRegenerate.length).toBeGreaterThan(0)
    })

    it('cancels confirm modal', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      act(() => result.current.handleCancelConfirm())
      expect(result.current.showConfirmModal).toBe(false)
      expect(result.current.pendingEdit).toBeNull()
    })

    it('toggles agent in regenerate list', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      act(() => result.current.handleToggleAgentRegenerate('TestAgent'))
      expect(result.current.agentsToRegenerate).toContain('TestAgent')
      act(() => result.current.handleToggleAgentRegenerate('TestAgent'))
      expect(result.current.agentsToRegenerate).not.toContain('TestAgent')
    })

    it('requires comment to confirm regeneration', () => {
      const onRegenerate = vi.fn()
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, onRegenerate }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      act(() => result.current.handleConfirmRegenerate())
      expect(onRegenerate).not.toHaveBeenCalled()
    })

    it('calls onRegenerate with correct params', () => {
      const onRegenerate = vi.fn()
      const onUpdateResult = vi.fn()
      const projectResult = {}
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, projectResult, onRegenerate, onUpdateResult }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleEditContentChange('New content'))
      act(() => result.current.handleApplyEdit())
      act(() => result.current.setEditComment('Fix typo'))
      act(() => result.current.handleConfirmRegenerate())
      expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({
        editComment: 'Fix typo',
        editedAgent: 'Architect',
        editedContent: 'New content',
      }))
      expect(result.current.showConfirmModal).toBe(false)
    })
  })

  describe('scene modal', () => {
    it('opens scene modal with correct count', () => {
      const messages = [createAgentMessage('Writer', 'S1'), createAgentMessage('Writer', 'S2')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleOpenSceneModal())
      expect(result.current.showSceneModal).toBe(true)
      expect(result.current.sceneCount).toBe(2)
    })

    it('toggles scene selection', () => {
      const messages = [createAgentMessage('Writer', 'S1')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleOpenSceneModal())
      act(() => result.current.handleToggleScene(1))
      expect(result.current.selectedScenes).toContain(1)
      act(() => result.current.handleToggleScene(1))
      expect(result.current.selectedScenes).not.toContain(1)
    })

    it('selects all scenes', () => {
      const messages = [createAgentMessage('Writer', 'S1'), createAgentMessage('Writer', 'S2')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleOpenSceneModal())
      act(() => result.current.handleSelectAllScenes())
      expect(result.current.selectedScenes).toEqual([1, 2])
      act(() => result.current.handleSelectAllScenes())
      expect(result.current.selectedScenes).toEqual([])
    })

    it('cancels scene modal', () => {
      const messages = [createAgentMessage('Writer', 'S1')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleOpenSceneModal())
      act(() => result.current.handleToggleScene(1))
      act(() => result.current.handleCancelSceneModal())
      expect(result.current.showSceneModal).toBe(false)
      expect(result.current.selectedScenes).toEqual([])
    })

    it('calls onRegenerate for scene regeneration', () => {
      const onRegenerate = vi.fn()
      const messages = [createAgentMessage('Writer', 'S1'), createAgentMessage('Writer', 'S2')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, onRegenerate }))
      act(() => result.current.handleOpenSceneModal())
      act(() => result.current.handleToggleScene(1))
      act(() => result.current.handleToggleScene(2))
      act(() => result.current.handleConfirmSceneRegenerate())
      expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({
        editedAgent: 'Writer',
        scenesToRegenerate: [1, 2],
        agentsToRegenerate: ['Writer', 'Critic'],
      }))
    })

    it('does not call onRegenerate if no scenes selected', () => {
      const onRegenerate = vi.fn()
      const messages = [createAgentMessage('Writer', 'S1')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages, onRegenerate }))
      act(() => result.current.handleOpenSceneModal())
      act(() => result.current.handleConfirmSceneRegenerate())
      expect(onRegenerate).not.toHaveBeenCalled()
    })
  })

  describe('reset state', () => {
    it('resets all edit state', () => {
      const messages = [createAgentMessage('Architect', 'Content')]
      const { result } = renderHook(() => useChatEditor({ runId: 'run-1', messages }))
      act(() => result.current.handleStartEdit('Architect'))
      act(() => result.current.handleApplyEdit())
      act(() => result.current.resetEditState())
      expect(result.current.editState).toBeNull()
      expect(result.current.showConfirmModal).toBe(false)
      expect(result.current.pendingEdit).toBeNull()
    })
  })
})
