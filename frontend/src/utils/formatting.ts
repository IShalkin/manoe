/**
 * Content formatting utilities for agent output
 * Converts JSON and structured data to readable Markdown
 */

import { tolerantJsonParse, extractJsonFromString } from './jsonParser';

/**
 * Format any value as Markdown
 * Handles strings, numbers, booleans, arrays, and objects
 */
export function formatAnyAsMarkdown(parsed: unknown): string {
  if (parsed === null || parsed === undefined) {
    return '';
  }
  if (typeof parsed === 'string') {
    // Check if the string itself is JSON (double-encoded)
    const trimmed = parsed.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const innerParsed = JSON.parse(trimmed);
        return formatAnyAsMarkdown(innerParsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  }
  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        return `${i + 1}. ${formatObjectInline(item as Record<string, unknown>)}`;
      }
      return `${i + 1}. ${item}`;
    }).join('\n');
  }
  if (typeof parsed === 'object') {
    return formatJsonAsMarkdown(parsed as Record<string, unknown>);
  }
  return String(parsed);
}

/**
 * Extract clean story text from agent content (Polish or Writer)
 */
export function extractStoryText(content: string, agentType: 'Polish' | 'Writer' | 'other'): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  const trimmed = content.trim();
  
  // Try to parse as JSON first
  let parsed: unknown = null;
  
  // Check for ```json code blocks
  if (trimmed.includes('```json')) {
    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) {
      parsed = tolerantJsonParse(jsonMatch[1]);
    }
  }
  
  // Try direct JSON parse
  if (parsed === null) {
    parsed = tolerantJsonParse(trimmed);
  }
  
  // Try to extract JSON from string
  if (parsed === null && (trimmed.includes('{') || trimmed.includes('['))) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      parsed = tolerantJsonParse(extracted);
    }
  }
  
  // If we have a parsed object, extract the story text
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    
    // For Polish agent, prefer polished_content
    if (agentType === 'Polish') {
      if (typeof obj.polished_content === 'string' && obj.polished_content.trim()) {
        return obj.polished_content;
      }
      // Fallback fields for Polish
      if (typeof obj.content === 'string' && obj.content.trim()) {
        return obj.content;
      }
    }
    
    // For Writer agent, prefer narrative_content
    if (agentType === 'Writer') {
      if (typeof obj.narrative_content === 'string' && obj.narrative_content.trim()) {
        return obj.narrative_content;
      }
      if (typeof obj.scene_content === 'string' && obj.scene_content.trim()) {
        return obj.scene_content;
      }
      if (typeof obj.content === 'string' && obj.content.trim()) {
        return obj.content;
      }
    }
    
    // Generic fallbacks for any agent
    if (typeof obj.polished_content === 'string' && obj.polished_content.trim()) {
      return obj.polished_content;
    }
    if (typeof obj.narrative_content === 'string' && obj.narrative_content.trim()) {
      return obj.narrative_content;
    }
    if (typeof obj.scene_content === 'string' && obj.scene_content.trim()) {
      return obj.scene_content;
    }
    if (typeof obj.content === 'string' && obj.content.trim()) {
      return obj.content;
    }
  }
  
  // If content doesn't look like JSON, return as-is (might be plain text)
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.includes('```json')) {
    return trimmed;
  }
  
  // Last resort: return the formatted content (will show JSON as markdown)
  return '';
}

/**
 * Format agent content for display
 * Attempts JSON parsing and falls back to raw content
 */
export function formatAgentContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  const trimmed = content.trim();
  
  // Check for ```json code blocks first
  if (content.includes('```json') || content.includes('```')) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) {
      const blockParsed = tolerantJsonParse(jsonMatch[1]);
      if (blockParsed !== null) {
        return formatAnyAsMarkdown(blockParsed);
      }
    }
  }
  
  // Try tolerant JSON parse (handles common LLM issues)
  const parsed = tolerantJsonParse(trimmed);
  if (parsed !== null && typeof parsed === 'object') {
    return formatAnyAsMarkdown(parsed);
  }
  
  // Try to extract JSON from string (handles prefix/suffix text)
  if (trimmed.includes('{') || trimmed.includes('[')) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      const extractedParsed = tolerantJsonParse(extracted);
      if (extractedParsed !== null && typeof extractedParsed === 'object') {
        return formatAnyAsMarkdown(extractedParsed);
      }
    }
  }
  
  // Return original content if nothing worked
  return content;
}

/**
 * Strategist-specific formatter for outline data
 */
export function formatStrategistContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  const trimmed = content.trim();
  let parsed: unknown = null;
  
  // Try to parse JSON
  if (trimmed.includes('```json')) {
    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) {
      parsed = tolerantJsonParse(jsonMatch[1]);
    }
  }
  if (parsed === null) {
    parsed = tolerantJsonParse(trimmed);
  }
  if (parsed === null && trimmed.includes('{')) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      parsed = tolerantJsonParse(extracted);
    }
  }
  
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return formatAgentContent(content);
  }
  
  const obj = parsed as Record<string, unknown>;
  const lines: string[] = [];
  
  // Structure overview
  if (obj.structure_type) {
    const structureNames: Record<string, string> = {
      'ThreeAct': 'Three Act Structure',
      'HeroJourney': "Hero's Journey",
      'FiveAct': 'Five Act Structure',
      'SevenPoint': 'Seven Point Story Structure',
      'SaveTheCat': 'Save the Cat Beat Sheet',
    };
    lines.push(`**Structure:** ${structureNames[obj.structure_type as string] || obj.structure_type}`);
  }
  
  if (obj.total_scenes) {
    lines.push(`**Total Scenes:** ${obj.total_scenes}`);
  }
  
  // Key structural points
  const keyPoints: string[] = [];
  if (obj.inciting_incident_scene) keyPoints.push(`Inciting Incident: Scene ${obj.inciting_incident_scene}`);
  if (obj.midpoint_scene) keyPoints.push(`Midpoint: Scene ${obj.midpoint_scene}`);
  if (obj.climax_scene) keyPoints.push(`Climax: Scene ${obj.climax_scene}`);
  if (obj.resolution_scene) keyPoints.push(`Resolution: Scene ${obj.resolution_scene}`);
  
  if (keyPoints.length > 0) {
    lines.push('');
    lines.push('**Key Story Beats:**');
    keyPoints.forEach(point => lines.push(`- ${point}`));
  }
  
  // Scenes summary (compact view)
  if (Array.isArray(obj.scenes) && obj.scenes.length > 0) {
    lines.push('');
    lines.push('**Scene Outline:**');
    const scenesToShow = obj.scenes.slice(0, 10) as Array<Record<string, unknown>>;
    scenesToShow.forEach((scene, idx) => {
      const sceneNum = scene.scene_number || idx + 1;
      const title = scene.title || `Scene ${sceneNum}`;
      const conflict = scene.conflict_type ? ` (${scene.conflict_type})` : '';
      lines.push(`${sceneNum}. **${title}**${conflict}`);
      if (scene.setting && typeof scene.setting === 'string' && scene.setting.length < 80) {
        lines.push(`   *${scene.setting}*`);
      }
    });
    if (obj.scenes.length > 10) {
      lines.push(`... and ${obj.scenes.length - 10} more scenes`);
    }
  }
  
  // Demo mode fields (opening_hook, turning_points, etc.)
  if (obj.opening_hook) {
    lines.push('');
    lines.push(`**Opening Hook:** ${obj.opening_hook}`);
  }
  if (Array.isArray(obj.turning_points) && obj.turning_points.length > 0) {
    lines.push('');
    lines.push('**Turning Points:**');
    obj.turning_points.forEach((point, idx) => {
      lines.push(`${idx + 1}. ${point}`);
    });
  }
  if (obj.climax && typeof obj.climax === 'string') {
    lines.push('');
    lines.push(`**Climax:** ${obj.climax}`);
  }
  if (obj.resolution && typeof obj.resolution === 'string') {
    lines.push('');
    lines.push(`**Resolution:** ${obj.resolution}`);
  }
  
  return lines.length > 0 ? lines.join('\n') : formatAgentContent(content);
}

/**
 * Format JSON object as readable Markdown
 */
export function formatJsonAsMarkdown(obj: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  
  for (const [key, value] of Object.entries(obj)) {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    if (Array.isArray(value)) {
      // Filter out empty/null items before rendering
      const filteredItems = value.filter(item => {
        if (item === null || item === undefined) return false;
        if (typeof item === 'string' && item.trim() === '') return false;
        if (typeof item === 'object' && Object.keys(item).length === 0) return false;
        return true;
      });
      
      if (filteredItems.length > 0) {
        lines.push(`${indent}**${formattedKey}:**`);
        lines.push('');  // Add blank line before list for proper markdown
        filteredItems.forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            // Format each field on its own line for better readability
            const itemLines: string[] = [];
            for (const [itemKey, itemValue] of Object.entries(item as Record<string, unknown>)) {
              const formattedItemKey = itemKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              if (itemValue !== null && itemValue !== undefined && itemValue !== '') {
                // Stringify objects/arrays to prevent [object Object]
                const displayValue = typeof itemValue === 'object' 
                  ? JSON.stringify(itemValue, null, 2)
                  : String(itemValue);
                itemLines.push(`**${formattedItemKey}**: ${displayValue}`);
              }
            }
            if (itemLines.length > 0) {
              lines.push(`${indent}${i + 1}. ${itemLines.join(', ')}`);
            }
          } else {
            const itemText = String(item).trim();
            if (itemText) {
              lines.push(`${indent}${i + 1}. ${itemText}`);
            }
          }
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}**${formattedKey}:**`);
      lines.push(formatJsonAsMarkdown(value as Record<string, unknown>, depth + 1));
    } else if (typeof value === 'boolean') {
      lines.push(`${indent}**${formattedKey}:** ${value ? 'Yes' : 'No'}`);
    } else if (typeof value === 'number') {
      lines.push(`${indent}**${formattedKey}:** ${value}`);
    } else if (value) {
      const strValue = String(value);
      if (strValue.length > 100) {
        lines.push(`${indent}**${formattedKey}:**\n${indent}> ${strValue}`);
      } else {
        lines.push(`${indent}**${formattedKey}:** ${strValue}`);
      }
    }
  }
  
  // Use double newlines for proper markdown paragraph breaks
  return lines.join('\n\n');
}

/**
 * Format object fields inline (for compact display)
 */
export function formatObjectInline(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    // Format key: replace underscores with spaces and capitalize
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (typeof value === 'string' && value.length < 80) {
      parts.push(`**${formattedKey}**: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`**${formattedKey}**: ${value}`);
    }
  }
  // Join with line breaks for better readability
  return parts.join(', ');
}
