import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { PROVIDERS, AGENTS, LLMProvider } from '../types';

export function SettingsPage() {
  const { updateProvider, updateAgentConfig, getProviderKey, getAgentConfig, getAvailableModels } = useSettings();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-slate-400 mb-8">Configure your LLM providers and agent models</p>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 text-sm">1</span>
          API Keys (BYOK)
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Enter your API keys for the providers you want to use. Keys are stored locally in your browser.
        </p>
        
        <div className="grid gap-4">
          {PROVIDERS.map(provider => {
            const currentKey = getProviderKey(provider.id) || '';
            const isVisible = showKeys[provider.id];
            
            return (
              <div key={provider.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center font-bold text-white">
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      <p className="text-xs text-slate-500">
                        {provider.id === 'openai' && 'sk-...'}
                        {provider.id === 'openrouter' && 'sk-or-...'}
                        {provider.id === 'gemini' && 'AI...'}
                        {provider.id === 'anthropic' && 'sk-ant-...'}
                      </p>
                    </div>
                  </div>
                  {currentKey && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                      Configured
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={currentKey}
                      onChange={(e) => updateProvider(provider.id, e.target.value)}
                      placeholder={`Enter your ${provider.name} API key`}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => toggleShowKey(provider.id)}
                    className="px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm"
                  >
                    {isVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center text-accent-400 text-sm">2</span>
          Agent Configuration
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Assign a provider and model to each agent. Different agents may benefit from different models.
        </p>

        <div className="grid gap-4">
          {AGENTS.map(agent => {
            const config = getAgentConfig(agent.id);
            const currentProvider = config?.provider || 'openai';
            const currentModel = config?.model || '';
            const availableModels = getAvailableModels(currentProvider);
            
            return (
              <div key={agent.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium capitalize">{agent.name}</h3>
                    <p className="text-xs text-slate-500">{agent.description}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Provider</label>
                    <select
                      value={currentProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value as LLMProvider;
                        const models = getAvailableModels(newProvider);
                        const defaultModel = models[0]?.id || '';
                        updateAgentConfig(agent.id, newProvider, defaultModel);
                      }}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                    >
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Model</label>
                    <select
                      value={currentModel}
                      onChange={(e) => updateAgentConfig(agent.id, currentProvider, e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                    >
                      {availableModels.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.contextWindow >= 1000000 ? `${m.contextWindow / 1000000}M` : `${m.contextWindow / 1000}K`})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {availableModels.find(m => m.id === currentModel)?.recommended?.includes(agent.id) && (
                  <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Recommended for this agent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
