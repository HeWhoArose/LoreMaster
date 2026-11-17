import React from 'react';
import type { GlobalConfig } from '../../types';
import { ColorPicker } from '../common/ColorPicker';

export interface AppearanceSettingsProps {
  value: GlobalConfig['appearance'];
  onChange: (patch: Partial<GlobalConfig['appearance']>) => void;
}

// Default colors used by the CSS theme (see :root.dark in index.css).
// These are what the picker shows as the "default" preview chip when no
// explicit override is set.
const DEFAULT_NARRATOR = '#c4b5fd';
const DEFAULT_ACTION = '#c4b5fd';

export function AppearanceSettings({ value, onChange }: AppearanceSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Chat colors</h3>
        <p className="text-xs text-text-muted mb-4">
          Customize how speakers and stylized text appear in the story view.
          Each character also has its own chat color, configurable from the
          character card.
        </p>
      </div>

      <ColorPicker
        label="Narrator color"
        value={value.narratorColor}
        onChange={(v) => onChange({ narratorColor: v })}
        onReset={() => onChange({ narratorColor: null })}
        defaultColor={DEFAULT_NARRATOR}
        hint="Used for the &quot;Narrator&quot; speaker label and any narrator-tagged text."
      />

      <ColorPicker
        label="Action color"
        value={value.actionColor}
        onChange={(v) => onChange({ actionColor: v })}
        onReset={() => onChange({ actionColor: null })}
        defaultColor={DEFAULT_ACTION}
        hint="Used for italicized *action* text (anything wrapped in asterisks) inside any message."
      />

      {/* Live preview */}
      <div className="border border-border rounded p-3 bg-surface-2">
        <div className="text-xs text-text-muted mb-2">Preview</div>
        <div className="space-y-2 text-sm">
          <div>
            <div
              className="text-xs font-semibold mb-1"
              style={value.narratorColor ? { color: value.narratorColor } : undefined}
            >
              <span className={value.narratorColor ? '' : 'narrator-text'}>Narrator</span>
            </div>
            <div
              style={value.narratorColor ? { color: value.narratorColor, fontStyle: 'italic' } : undefined}
              className={value.narratorColor ? '' : 'narrator-text'}
            >
              The wind carries the smell of rain and woodsmoke down the alley.
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold character-text mb-1">Character</div>
            <div>
              <span className="character-text">&quot;You really shouldn&apos;t be here,&quot;</span>{' '}
              <em
                style={value.actionColor ? { color: value.actionColor, fontStyle: 'italic' } : undefined}
                className={value.actionColor ? '' : 'action-text'}
              >
                she said, eyes never leaving the door
              </em>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
