import React from 'react';
import type { GlobalConfig } from '../../types';

export interface EngineSettingsProps {
  value: GlobalConfig['engine'];
  onChange: (patch: Partial<GlobalConfig['engine']>) => void;
}

export function EngineSettings({ value, onChange }: EngineSettingsProps) {
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={value.autoGenerateNpcCards}
          onChange={(e) => onChange({ autoGenerateNpcCards: e.target.checked })}
          className="mt-0.5"
        />
        <div>
          <div className="text-sm text-text-primary">Auto-generate NPC cards</div>
          <div className="text-xs text-text-muted">
            Automatically create character cards when new NPCs appear in the story.
          </div>
        </div>
      </label>

      <div>
        <div className="flex items-baseline justify-between text-xs mb-1">
          <span className="text-text-muted">Summary threshold</span>
          <span className="mono text-text-primary">{value.summaryThreshold}</span>
        </div>
        <input
          type="range"
          min={10}
          max={200}
          step={1}
          value={value.summaryThreshold}
          onChange={(e) => onChange({ summaryThreshold: Number(e.target.value) })}
        />
        <div className="text-[10px] text-text-muted mt-1">
          Number of messages before older history is summarized into long-term memory.
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-xs mb-1">
          <span className="text-text-muted">Context window budget (tokens)</span>
          <span className="mono text-text-primary">{value.contextWindowBudget.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={2048}
          max={2000000}
          step={1024}
          value={value.contextWindowBudget}
          onChange={(e) => onChange({ contextWindowBudget: Number(e.target.value) })}
        />
        <div className="text-[10px] text-text-muted mt-1">
          Target token budget when assembling prompts. Keep below your model's context window.
        </div>
      </div>

      {value.dataDirectory && (
        <div>
          <span className="text-xs text-text-muted mb-1 block">Data directory</span>
          <div className="mono text-xs bg-surface-2 border border-border p-2 rounded text-text-primary break-all">
            {value.dataDirectory}
          </div>
        </div>
      )}
    </div>
  );
}
