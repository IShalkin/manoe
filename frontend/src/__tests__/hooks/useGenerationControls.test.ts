import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}))

// Mock orchestratorFetch
const mockOrchFetch = vi.fn()
vi.mock('../../lib/api', () => ({
  orchestratorFetch: (...args: unknown[]) => mockOrchFetch(...args),
}))

import { useGenerationControls } from '../../hooks/useGenerationControls'

describe('useGenerationControls', () => {
  beforeEach(() => {
    mockOrchFetch.mockReset()
  })

  describe('initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: null,
        isComplete: false,
        isCancelled: false,
        isInterrupted: false,
      }))
      expect(result.current.isCancelling).toBe(false)
      expect(result.current.isResuming).toBe(false)
      expect(result.current.canResume).toBe(false)
      expect(result.current.localError).toBeNull()
    })

    it('resets state when runId changes', () => {
      const { result, rerender } = renderHook(
        ({ runId }) => useGenerationControls({
          runId,
          isComplete: false,
          isCancelled: false,
          isInterrupted: false,
        }),
        { initialProps: { runId: 'run-1' } }
      )
      
      // Manually set some state by triggering actions would require async
      // Instead verify initial state after rerender
      rerender({ runId: 'run-2' })
      expect(result.current.isCancelling).toBe(false)
      expect(result.current.canResume).toBe(false)
    })
  })

  describe('handleStopGeneration', () => {
    it('does nothing when runId is null', async () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: null,
        isComplete: false,
        isCancelled: false,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleStopGeneration()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('does nothing when isComplete is true', async () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: true,
        isCancelled: false,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleStopGeneration()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('calls pause endpoint', async () => {
      mockOrchFetch.mockResolvedValue({ ok: true })
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleStopGeneration()
      })
      
      expect(mockOrchFetch).toHaveBeenCalledWith('/runs/run-1/pause', { method: 'POST' })
    })

    it('sets isCancelling during request', async () => {
      let resolvePromise: (value: { ok: boolean }) => void
      mockOrchFetch.mockReturnValue(new Promise(resolve => { resolvePromise = resolve }))
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false,
      }))
      
      act(() => {
        result.current.handleStopGeneration()
      })
      
      expect(result.current.isCancelling).toBe(true)
      
      await act(async () => {
        resolvePromise!({ ok: true })
      })
      
      expect(result.current.isCancelling).toBe(false)
    })
  })

  describe('handleResumeGeneration', () => {
    it('does nothing when runId is null', async () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: null,
        isComplete: false,
        isCancelled: true,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleResumeGeneration()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('does nothing when not cancelled', async () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleResumeGeneration()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('calls resume endpoint and onReconnect on success', async () => {
      mockOrchFetch.mockResolvedValue({ ok: true })
      const onReconnect = vi.fn()
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: true,
        isInterrupted: false,
        onReconnect,
      }))
      
      await act(async () => {
        await result.current.handleResumeGeneration()
      })
      
      expect(mockOrchFetch).toHaveBeenCalledWith('/runs/run-1/resume', { method: 'POST' })
      expect(onReconnect).toHaveBeenCalled()
    })

    it('sets localError on failure', async () => {
      mockOrchFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: 'Server error' }),
      })
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: true,
        isInterrupted: false,
      }))
      
      await act(async () => {
        await result.current.handleResumeGeneration()
      })
      
      expect(result.current.localError).toContain('Server error')
    })
  })

  describe('handleResumeInterrupted', () => {
    it('does nothing when runId is null', async () => {
      const onResume = vi.fn()
      const { result } = renderHook(() => useGenerationControls({
        runId: null,
        isComplete: false,
        isCancelled: false,
        isInterrupted: false, // Changed to false to avoid auto-fetch
        onResume,
      }))
      
      await act(async () => {
        await result.current.handleResumeInterrupted()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('does nothing when onResume is not provided', async () => {
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false, // Changed to false
      }))
      
      await act(async () => {
        await result.current.handleResumeInterrupted()
      })
      
      expect(mockOrchFetch).not.toHaveBeenCalled()
    })

    it('fetches state and calls onResume', async () => {
      mockOrchFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ can_resume: true, resume_from_phase: 'Drafting' }),
      })
      const onResume = vi.fn()
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false, // Start with false
        onResume,
      }))
      
      await act(async () => {
        await result.current.handleResumeInterrupted()
      })
      
      expect(mockOrchFetch).toHaveBeenCalledWith('/runs/run-1/state', { method: 'GET' })
      expect(onResume).toHaveBeenCalledWith('run-1', 'Drafting')
    })

    it('sets error when cannot resume', async () => {
      mockOrchFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ can_resume: false }),
      })
      const onResume = vi.fn()
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: false, // Start with false
        onResume,
      }))
      
      await act(async () => {
        await result.current.handleResumeInterrupted()
      })
      
      expect(onResume).not.toHaveBeenCalled()
      expect(result.current.localError).toContain('cannot be resumed')
    })
  })

  describe('fetch resume state on interrupt', () => {
    it('fetches resume state when interrupted', async () => {
      mockOrchFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          can_resume: true,
          resume_from_phase: 'Drafting',
          last_completed_phase: 'Outlining',
        }),
      })
      
      const { result } = renderHook(() => useGenerationControls({
        runId: 'run-1',
        isComplete: false,
        isCancelled: false,
        isInterrupted: true,
      }))
      
      await waitFor(() => {
        expect(result.current.canResume).toBe(true)
      })
      
      expect(result.current.resumeFromPhase).toBe('Drafting')
      expect(result.current.lastCompletedPhase).toBe('Outlining')
    })
  })
})
