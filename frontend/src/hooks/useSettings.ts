import { useState, useEffect } from 'react';
import { UserSettings, ProviderConfig, AgentConfig, LLMProvider, AGENTS, MODELS } from '../types';

const STORAGE_KEY = 'manoe_settings';

const defaultAgentConfigs: AgentConfig[] = AGENTS.map(agent => ({
  agent: agent.id,
  provider: 'openai' as LLMProvider,
  model: 'gpt-4o',
}));

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>({
    providers: [],
    agents: defaultAgentConfigs,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    setLoading(false);
  }, []);

  const saveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
  };

  const updateProvider = (provider: LLMProvider, apiKey: string) => {
    const existing = settings.providers.find(p => p.provider === provider);
    let newProviders: ProviderConfig[];
    
    if (existing) {
      newProviders = settings.providers.map(p => 
        p.provider === provider ? { ...p, apiKey, isValid: undefined } : p
      );
    } else {
      newProviders = [...settings.providers, { provider, apiKey }];
    }
    
    saveSettings({ ...settings, providers: newProviders });
  };

  const updateAgentConfig = (agentId: string, provider: LLMProvider, model: string) => {
    const newAgents = settings.agents.map(a =>
      a.agent === agentId ? { ...a, provider, model } : a
    );
    saveSettings({ ...settings, agents: newAgents });
  };

  const getProviderKey = (provider: LLMProvider): string | undefined => {
    return settings.providers.find(p => p.provider === provider)?.apiKey;
  };

  const getAgentConfig = (agentId: string): AgentConfig | undefined => {
    return settings.agents.find(a => a.agent === agentId);
  };

  const hasAnyApiKey = (): boolean => {
    return settings.providers.some(p => p.apiKey && p.apiKey.length > 0);
  };

  const getAvailableModels = (provider: LLMProvider) => {
    return MODELS[provider] || [];
  };

  return {
    settings,
    loading,
    updateProvider,
    updateAgentConfig,
    getProviderKey,
    getAgentConfig,
    hasAnyApiKey,
    getAvailableModels,
  };
}
