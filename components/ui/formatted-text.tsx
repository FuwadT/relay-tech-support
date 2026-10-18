'use client';
/**
 * FormattedMessage — renders inline Markdown safely without dangerouslySetInnerHTML.
 * Supports: **bold**, `code`, and newlines (converted to <br />).
 * Single source of truth for inline markdown rendering across Relay UI components.
 */
import React from 'react';

interface FormattedMessageProps {
  text: string;
}

/** Renders inline Markdown (**bold** and `code`) safely without dangerouslySetInnerHTML. */
export function FormattedMessage({ text }: FormattedMessageProps): React.ReactElement {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, lineIndex) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <React.Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                return (
                  <strong key={partIndex} style={{ fontWeight: 600, color: '#242424' }}>
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
                return (
                  <code
                    key={partIndex}
                    style={{
                      padding: '2px 5px',
                      borderRadius: '3px',
                      background: '#ecebe8',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: '12px',
                      color: '#343330',
                    }}
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              return part;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

export const FormattedText = FormattedMessage;
