import React from 'react';

type Props = {
  value: unknown | string;
  maxHeight?: number | string;
};

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightJson(json: string) {
  const escaped = escapeHtml(json);
  const regex = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(escaped)) !== null) {
    const [token] = match;
    const index = match.index;
    if (index > lastIndex) {
      parts.push(escaped.slice(lastIndex, index));
    }

    let className = '';
    if (match[1]) className = 'token-key';
    else if (match[2]) className = 'token-string';
    else if (match[3]) className = 'token-boolean';
    else className = 'token-number';

    parts.push(<span key={index} className={className} dangerouslySetInnerHTML={{ __html: token }} />);
    lastIndex = index + token.length;
  }
  if (lastIndex < escaped.length) parts.push(escaped.slice(lastIndex));
  return parts;
}

export default function JsonCode({ value, maxHeight = 260 }: Props) {
  const jsonStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  return (
    <pre
      style={{
        margin: 0,
        padding: '10px 12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.5,
        background: 'var(--mantine-color-gray-1, #f8f9fa)',
        border: '1px solid var(--mantine-color-gray-3, #dee2e6)',
        borderRadius: 6,
        overflow: 'auto',
        maxHeight,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <style>{`
        .token-key { color: #1f6feb; font-weight: 600; }
        .token-string { color: #0a7f2e; }
        .token-number { color: #b46900; }
        .token-boolean { color: #9a32cd; }
      `}</style>
      {highlightJson(jsonStr)}
    </pre>
  );
}

