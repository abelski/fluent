import React from 'react';

export function renderAccented(text: string): React.ReactNode {
  const parts = text.split('*');
  if (parts.length < 3 || parts.length % 2 === 0) return text;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}
