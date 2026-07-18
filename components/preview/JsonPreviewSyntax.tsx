import React from 'react';

export const JsonValue: React.FC<{ value: string }> = ({ value }) => {
  const segments = value.split(/("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/gi);
  return (
    <>
      {segments.map((segment, index) => {
        if (!segment) return null;
        let className = 'aad-json-punctuation';
        if (/^"/.test(segment)) className = 'aad-json-string';
        else if (/^-?\d/.test(segment)) className = 'aad-json-number';
        else if (/^(true|false)$/i.test(segment)) className = 'aad-json-boolean';
        else if (/^null$/i.test(segment)) className = 'aad-json-null';
        return (
          <span className={className} key={`${index}-${segment}`}>
            {segment}
          </span>
        );
      })}
    </>
  );
};

export const renderJsonLine = (line: string, index: number) => {
  const leading = line.match(/^\s*/)?.[0] ?? '';
  const rest = line.slice(leading.length);
  const keyMatch = rest.match(/^("[^"]+":)(.*)$/);

  return (
    <div className="aad-json-line" key={`${index}-${line}`}>
      <span className="aad-json-indent">{leading.replace(/ /g, '\u00a0')}</span>
      {keyMatch ? (
        <>
          <span className="aad-json-key">{keyMatch[1]}</span>
          <JsonValue value={keyMatch[2]} />
        </>
      ) : (
        <JsonValue value={rest} />
      )}
    </div>
  );
};
