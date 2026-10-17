'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

export interface TriageQuickRepliesProps {
  quickReplies: string[];
  onSelectReply: (reply: string) => void;
  onRunBrowserProbe?: () => void;
  isRunningProbe?: boolean;
}

export function TriageQuickReplies({
  quickReplies,
  onSelectReply,
  onRunBrowserProbe,
  isRunningProbe = false,
}: TriageQuickRepliesProps): React.ReactElement | null {
  if (!quickReplies || quickReplies.length === 0) return null;

  return (
    <div className="quick-replies-container">
      <span className="quick-replies-label">Suggested replies:</span>
      <div className="quick-replies-list">
        {quickReplies.map((reply, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-reply-chip"
            onClick={() => onSelectReply(reply)}
          >
            {reply}
          </button>
        ))}
        {onRunBrowserProbe && (
          <button
            type="button"
            className="quick-reply-chip"
            style={{
              background: '#fbf2eb',
              borderColor: '#e6cfbf',
              color: '#a44526',
              fontWeight: 600,
            }}
            onClick={onRunBrowserProbe}
            disabled={isRunningProbe}
          >
            <Sparkles size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Run Instant Browser Diagnostic (No Download)
          </button>
        )}
      </div>
    </div>
  );
}
