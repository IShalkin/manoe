import { useState, useEffect, useRef, useMemo } from 'react';

// Helper function to format JSON content as readable text
function formatAgentContent(content: string): string {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content);
    return formatJsonAsReadable(parsed);
  } catch {
    // If not JSON, check for markdown code blocks
    if (content.includes('```json')) {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          return formatJsonAsReadable(parsed);
        } catch {
          // Fall through to return original
        }
      }
    }
    // Return as-is if not JSON
    return content;
  }
}

function formatJsonAsReadable(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    if (Array.isArray(value)) {
      lines.push(`**${formattedKey}:**`);
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          lines.push(`  ${i + 1}. ${formatObjectBrief(item as Record<string, unknown>)}`);
        } else {
          lines.push(`  - ${item}`);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`**${formattedKey}:**`);
      lines.push(formatObjectBrief(value as Record<string, unknown>));
    } else if (typeof value === 'boolean') {
      lines.push(`**${formattedKey}:** ${value ? 'Yes' : 'No'}`);
    } else if (typeof value === 'number') {
      lines.push(`**${formattedKey}:** ${value}`);
    } else if (value) {
      lines.push(`**${formattedKey}:** ${value}`);
    }
  }
  
  return lines.join('\n');
}

function formatObjectBrief(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length < 100) {
      parts.push(`${key}: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.slice(0, 3).join(' | ');
}

interface AgentMessage {
  id: string;
  type: string;
  timestamp: string;
  data: {
    agent?: string;
    message_type?: string;
    content?: string;
    to_agent?: string;
    phase?: string;
    status?: string;
    error?: string;
    result?: Record<string, unknown>;
    result_summary?: string;
  };
}

interface GenerationResult {
  narrative_possibility?: Record<string, unknown>;
  error?: string;
}

interface AgentChatProps {
  runId: string | null;
  orchestratorUrl: string;
  onComplete?: (result: GenerationResult) => void;
  onClose?: () => void;
}

const AGENTS = ['Architect', 'Profiler', 'Strategist', 'Writer', 'Critic'] as const;

const AGENT_COLORS: Record<string, string> = {
  Architect: 'bg-blue-500',
  Profiler: 'bg-cyan-500',
  Strategist: 'bg-green-500',
  Writer: 'bg-amber-500',
  Critic: 'bg-red-500',
  System: 'bg-neutral-500',
};

const AGENT_BORDER_COLORS: Record<string, string> = {
  Architect: 'border-blue-500',
  Profiler: 'border-cyan-500',
  Strategist: 'border-green-500',
  Writer: 'border-amber-500',
  Critic: 'border-red-500',
  System: 'border-neutral-500',
};

const AGENT_TEXT_COLORS: Record<string, string> = {
  Architect: 'text-blue-400',
  Profiler: 'text-cyan-400',
  Strategist: 'text-green-400',
  Writer: 'text-amber-400',
  Critic: 'text-red-400',
  System: 'text-neutral-400',
};

const AGENT_ICONS: Record<string, string> = {
  Architect: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  Profiler: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  Strategist: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  Writer: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  Critic: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  System: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
};

interface AgentState {
  status: 'idle' | 'thinking' | 'complete';
  messages: string[];
  lastUpdate: string;
}

export function AgentChat({ runId, orchestratorUrl, onComplete, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('Initializing');
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Connect to SSE endpoint
    const eventSource = new EventSource(`${orchestratorUrl}/runs/${runId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        
        // Update current phase
        if (data.type === 'phase_start' && data.data.phase) {
          setCurrentPhase(data.data.phase.charAt(0).toUpperCase() + data.data.phase.slice(1));
        }
        
        // Add message to list
        setMessages((prev) => [...prev, data]);
        
        // Close connection when generation is complete or errored
        if (data.type === 'generation_complete' || data.type === 'generation_error') {
          setCurrentPhase(data.type === 'generation_complete' ? 'Complete' : 'Error');
          setIsComplete(true);
          eventSource.close();
          setIsConnected(false);
          
          // Call onComplete callback with result
          if (onComplete) {
            if (data.type === 'generation_error') {
              onComplete({ error: data.data.error || 'Unknown error' });
            } else {
              // Extract narrative_possibility from phase_complete event
              const phaseCompleteEvent = [...messages, data].find(
                m => m.type === 'phase_complete' && m.data.phase === 'genesis'
              );
              onComplete({
                narrative_possibility: phaseCompleteEvent?.data?.result || data.data,
              });
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost. Reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, [runId, orchestratorUrl]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Compute agent states from messages
  const agentStates = useMemo(() => {
    const states: Record<string, AgentState> = {};
    
    // Initialize all agents
    AGENTS.forEach(agent => {
      states[agent] = { status: 'idle', messages: [], lastUpdate: '' };
    });
    
    // Process messages to build agent states
    messages.forEach(msg => {
      const agent = msg.data.agent;
      if (!agent || !states[agent]) return;
      
      if (msg.type === 'agent_start') {
        states[agent].status = 'thinking';
        states[agent].lastUpdate = msg.timestamp;
      } else if (msg.type === 'agent_complete') {
        states[agent].status = 'complete';
        states[agent].lastUpdate = msg.timestamp;
      } else if (msg.type === 'agent_message' && msg.data.content) {
        states[agent].messages.push(msg.data.content);
        states[agent].lastUpdate = msg.timestamp;
      }
    });
    
    return states;
  }, [messages]);

  // Extract final result from messages
  const finalResult = useMemo(() => {
    const completeEvent = messages.find(m => m.type === 'generation_complete');
    if (completeEvent?.data.result_summary) {
      return completeEvent.data.result_summary;
    }
    
    // Try to get from phase_complete
    const phaseComplete = messages.find(m => m.type === 'phase_complete' && m.data.phase === 'genesis');
    if (phaseComplete?.data.result) {
      const result = phaseComplete.data.result;
      if (typeof result === 'object' && result !== null) {
        return JSON.stringify(result, null, 2);
      }
      return String(result);
    }
    
    // Get the last substantial agent message as fallback
    const agentMessages = messages.filter(m => m.type === 'agent_message' && m.data.content);
    if (agentMessages.length > 0) {
      const lastMsg = agentMessages[agentMessages.length - 1];
      return lastMsg.data.content || '';
    }
    
    return '';
  }, [messages]);

  // Check for errors
  const generationError = useMemo(() => {
    const errorEvent = messages.find(m => m.type === 'generation_error' || m.type === 'error');
    return errorEvent?.data.error || null;
  }, [messages]);

  if (!runId) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
        <p className="text-slate-400">Start a generation to see agent communication</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-slate-900/50 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Multi-Agent Orchestration</h3>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
            isConnected ? 'bg-green-500/20 text-green-400' : isComplete ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : isComplete ? 'bg-blue-400' : 'bg-red-400'}`} />
            {isConnected ? 'Processing' : isComplete ? 'Complete' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Phase: {currentPhase}</span>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {(error || generationError) && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-3">
          <p className="text-sm text-red-400">{error || generationError}</p>
        </div>
      )}

      {/* Agent Grid */}
      <div className="p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-slate-400">Initializing agents...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map(agent => {
              const state = agentStates[agent];
              const color = AGENT_COLORS[agent];
              const borderColor = AGENT_BORDER_COLORS[agent];
              const textColor = AGENT_TEXT_COLORS[agent];
              const icon = AGENT_ICONS[agent];
              const latestMessage = state.messages[state.messages.length - 1] || '';
              
              return (
                <div 
                  key={agent}
                  className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                    state.status === 'thinking' 
                      ? `${borderColor} border-2 shadow-lg` 
                      : state.status === 'complete'
                        ? 'border-slate-600'
                        : 'border-slate-700 opacity-50'
                  }`}
                >
                  {/* Agent Header */}
                  <div className={`px-3 py-2 flex items-center gap-2 ${
                    state.status === 'thinking' ? `${color} bg-opacity-20` : 'bg-slate-800/50'
                  }`}>
                    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                    </div>
                    <span className={`font-medium ${textColor}`}>{agent}</span>
                    {state.status === 'thinking' && (
                      <div className="ml-auto flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${color} animate-pulse`} />
                        <span className="text-xs text-slate-400">thinking</span>
                      </div>
                    )}
                    {state.status === 'complete' && (
                      <div className="ml-auto">
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Agent Content */}
                  <div className="p-3 bg-slate-900/30 min-h-[100px] max-h-[200px] overflow-y-auto">
                    {state.messages.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        {state.status === 'thinking' ? 'Processing...' : 'Waiting...'}
                      </p>
                    ) : (
                      <div className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                        {(() => {
                          const formattedContent = formatAgentContent(latestMessage);
                          return formattedContent.length > 400 ? (
                            <details>
                              <summary className="cursor-pointer text-blue-400 hover:text-blue-300 mb-2">
                                {formattedContent.substring(0, 200)}... (expand)
                              </summary>
                              <div className="mt-2">{formattedContent}</div>
                            </details>
                          ) : (
                            formattedContent
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation Flow - Shows all agent messages in order */}
      {messages.filter(m => m.type === 'agent_message' && m.data.content).length > 0 && (
        <div className="border-t border-slate-700">
          <details className="group">
            <summary className="bg-slate-900/50 px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 transition-colors">
              <svg className="w-5 h-5 text-purple-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h4 className="font-medium text-purple-400">Conversation Flow</h4>
              <span className="text-xs text-slate-500 ml-auto">
                {messages.filter(m => m.type === 'agent_message').length} messages
              </span>
            </summary>
            <div className="p-4 bg-slate-900/20 max-h-[400px] overflow-y-auto space-y-3">
              {messages
                .filter(m => m.type === 'agent_message' && m.data.content)
                .map((msg, idx) => {
                  const agent = msg.data.agent || 'System';
                  const color = AGENT_COLORS[agent] || AGENT_COLORS.System;
                  const textColor = AGENT_TEXT_COLORS[agent] || AGENT_TEXT_COLORS.System;
                  const content = msg.data.content || '';
                  
                  return (
                    <div key={msg.id || idx} className="flex gap-3 p-3 bg-slate-800/30 rounded-lg">
                      <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-xs font-bold text-white">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium text-sm ${textColor}`}>{agent}</span>
                          <span className="text-xs text-slate-500">Step {idx + 1}</span>
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                          {(() => {
                            const formatted = formatAgentContent(content);
                            return formatted.length > 300 ? (
                              <details>
                                <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
                                  {formatted.substring(0, 200)}... (expand)
                                </summary>
                                <div className="mt-2">{formatted}</div>
                              </details>
                            ) : formatted;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </details>
        </div>
      )}

      {/* Result Section */}
      {(isComplete || finalResult) && (
        <div className="border-t border-slate-700">
          <div className="bg-slate-900/50 px-4 py-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h4 className="font-medium text-green-400">Generated Result</h4>
          </div>
          <div className="p-4 bg-slate-900/20 max-h-[300px] overflow-y-auto">
            {finalResult ? (
              <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                {formatAgentContent(finalResult)}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Processing result...</p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Run ID: {runId.substring(0, 8)}...</span>
        <span>{messages.length} events</span>
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
