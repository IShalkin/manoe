/**
 * Cinematic Agent Panel
 * 
 * Main component for visualizing agent interactions in real-time
 * Inspired by Quentin Tarantino dialogue films
 */

import { useMemo } from "react";
import { AgentAvatar } from "./AgentAvatar";
import { DialogueBubble } from "./DialogueBubble";
import { useGenerationStream } from "../../hooks/useGenerationStream";
import { AgentType } from "../../types/agent";

interface CinematicAgentPanelProps {
  runId: string | null;
}

const ALL_AGENTS: AgentType[] = [
  "architect",
  "profiler",
  "worldbuilder",
  "strategist",
  "writer",
  "critic",
  "originality",
  "impact",
  "archivist",
];

export function CinematicAgentPanel({ runId }: CinematicAgentPanelProps) {
  const { messages, currentPhase, activeAgent, isConnected } = useGenerationStream({
    runId,
  });

  // Filter cinematic events
  const cinematicMessages = useMemo(() => {
    return messages.filter(
      (msg) =>
        msg.type === "agent_thought" ||
        msg.type === "agent_dialogue" ||
        msg.type === "agent_conflict" ||
        msg.type === "agent_consensus"
    );
  }, [messages]);

  // Get agent statuses
  const agentStatuses = useMemo(() => {
    const statuses: Record<AgentType, "idle" | "active" | "speaking" | "listening"> = {} as any;
    
    ALL_AGENTS.forEach((agent) => {
      if (agent === activeAgent) {
        statuses[agent] = "active";
      } else {
        // Check if agent is involved in recent dialogue
        const recentDialogue = cinematicMessages
          .slice(-5)
          .find((msg) => {
            if (msg.type === "agent_dialogue") {
              const data = msg.data as any;
              return data.from === agent || data.to === agent;
            }
            return false;
          });
        
        if (recentDialogue) {
          const data = (recentDialogue.data as any);
          if (data.from === agent) {
            statuses[agent] = "speaking";
          } else if (data.to === agent) {
            statuses[agent] = "listening";
          } else {
            statuses[agent] = "idle";
          }
        } else {
          statuses[agent] = "idle";
        }
      }
    });

    return statuses;
  }, [activeAgent, cinematicMessages]);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-gray-900 to-gray-800 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{currentPhase || "Waiting..."}</h2>
        <div className={`px-3 py-1 rounded ${isConnected ? "bg-green-500" : "bg-red-500"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {ALL_AGENTS.map((agent) => (
          <div key={agent} className="flex flex-col items-center">
            <AgentAvatar
              agentType={agent}
              status={agentStatuses[agent]}
              size="md"
            />
            <span className="text-xs mt-2 text-gray-400 capitalize">{agent}</span>
          </div>
        ))}
      </div>

      {/* Dialogue Area */}
      <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Agent Interactions</h3>
        <div className="space-y-2">
          {cinematicMessages.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              Waiting for agent interactions...
            </div>
          ) : (
            cinematicMessages.map((msg, idx) => {
              if (msg.type === "agent_thought") {
                const data = msg.data as any;
                return (
                  <DialogueBubble
                    key={idx}
                    from={data.agent}
                    message={data.thought}
                    type="thought"
                    timestamp={msg.timestamp}
                  />
                );
              }
              if (msg.type === "agent_dialogue") {
                const data = msg.data as any;
                return (
                  <DialogueBubble
                    key={idx}
                    from={data.from}
                    to={data.to}
                    message={data.message}
                    type={data.dialogueType || "suggestion"}
                    timestamp={msg.timestamp}
                  />
                );
              }
              return null;
            })
          )}
        </div>
      </div>
    </div>
  );
}

