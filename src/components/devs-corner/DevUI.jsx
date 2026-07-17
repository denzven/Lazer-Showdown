import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, CheckCircle, Download } from 'lucide-react';

// Custom Javascript Syntax Highlighter Tokenizer
export function highlightJsCode(code) {
  const tokens = [];
  const rules = [
    { type: 'comment', regex: /^\/\/.*$/ },
    { type: 'string', regex: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'|^`(?:[^`\\]|\\.)*`/ },
    { type: 'keyword', regex: /^(?:const|let|var|export|function|return|if|else|import|typeof|null|true|false)\b/ },
    { type: 'builtin', regex: /^(?:LazerAI|Math|random|floor|length|includes|BLOCK_TYPES|getBoardState|getPossibleActions|applyLightweightAction|traceLaserBeam|lazerPos|lazerDir|hitPiece)\b/ },
    { type: 'number', regex: /^\b\d+\b/ },
    { type: 'operator', regex: /^[+\-*\/%&|^!=<>:~?]+/ },
    { type: 'punctuation', regex: /^[{}()\[\],.;]+/ },
    { type: 'identifier', regex: /^[a-zA-Z_$][a-zA-Z0-9_$]*/ },
    { type: 'whitespace', regex: /^\s+/ },
    { type: 'text', regex: /^./ }
  ];

  let remaining = code;
  while (remaining.length > 0) {
    let matched = false;
    for (const rule of rules) {
      const match = remaining.match(rule.regex);
      if (match) {
        tokens.push({ type: rule.type, text: match[0] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ type: 'text', text: remaining.charAt(0) });
      remaining = remaining.substring(1);
    }
  }

  return tokens.map((token, idx) => {
    let color = 'var(--text-primary)';
    let fontWeight = 'normal';
    if (token.type === 'comment') {
      color = '#6a9955';
    } else if (token.type === 'string') {
      color = '#ce9178';
    } else if (token.type === 'keyword') {
      color = '#c586c0';
      fontWeight = 'bold';
    } else if (token.type === 'builtin') {
      color = '#4fc1ff';
    } else if (token.type === 'number') {
      color = '#b5cea8';
    } else if (token.type === 'operator') {
      color = '#d4d4d4';
    } else if (token.type === 'punctuation') {
      color = '#ffd700';
    } else if (token.type === 'identifier') {
      color = '#9cdcfe';
    }
    return (
      <span key={idx} style={{ color, fontWeight }}>
        {token.text}
      </span>
    );
  });
}

// Custom Markdown Code Block component with highlighting and copy capability
export function MarkdownCodeBlock({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  const isInline = !className;
  
  if (isInline) {
    return (
      <code 
        style={{ 
          backgroundColor: 'rgba(255,255,255,0.05)', 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontFamily: 'monospace',
          fontSize: '0.85em',
          color: 'var(--neon-blue)'
        }} 
        {...props}
      >
        {children}
      </code>
    );
  }

  const codeText = String(children).replace(/\n$/, '');
  const language = match ? match[1] : '';
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ position: 'relative', margin: '16px 0' }}>
      <button 
        className="cyber-button"
        onClick={() => {
          navigator.clipboard.writeText(codeText);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '4px 10px',
          fontSize: '0.68rem',
          zIndex: 5,
          minHeight: 'auto'
        }}
      >
        {copied ? 'COPIED! ✓' : 'COPY'}
      </button>
      <pre style={{ 
        padding: '16px', 
        backgroundColor: '#07080e', 
        border: '1px solid var(--border-color)', 
        borderRadius: '8px', 
        overflowX: 'auto', 
        fontSize: '0.78rem', 
        fontFamily: 'monospace', 
        tabSize: 2,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
        lineHeight: '1.5',
        textAlign: 'left'
      }}>
        <code>
          {language === 'javascript' || language === 'js'
            ? highlightJsCode(codeText)
            : codeText
          }
        </code>
      </pre>
    </div>
  );
}

// Custom Cyberpunk Styled Checkbox Component
export function CustomCheckbox({ checked, onChange, label, disabled = false }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, userSelect: 'none', padding: '10px 4px' }}>
      <input 
        type="checkbox" 
        checked={checked} 
        disabled={disabled}
        onChange={onChange} 
        style={{ display: 'none' }} 
      />
      <div style={{
        width: '28px',
        height: '28px',
        border: checked ? '2px solid var(--neon-blue)' : '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: checked ? 'rgba(0, 240, 255, 0.15)' : 'rgba(0, 0, 0, 0.4)',
        boxShadow: checked ? '0 0 8px rgba(0, 240, 255, 0.4)' : 'none',
        transition: 'all 0.2s ease',
        flexShrink: 0
      }}>
        {checked && (
          <div style={{
            width: '14px',
            height: '14px',
            backgroundColor: 'var(--neon-blue)',
            borderRadius: '3px',
            boxShadow: '0 0 6px var(--neon-blue)'
          }} />
        )}
      </div>
      <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', fontSize: '1rem', color: checked ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 0.2s', lineHeight: '1.2' }}>
        {label}
      </span>
    </label>
  );
}

// Custom Cyberpunk Styled Dropdown Component
export function CustomSelect({ value, onChange, options, colorTheme = 'blue' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeThemeColor = colorTheme === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)';
  const activeBgColor = colorTheme === 'red' ? 'rgba(255, 42, 133, 0.12)' : 'rgba(0, 240, 255, 0.12)';

  const selectedOption = options.find(o => o.id === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', zIndex: isOpen ? 100 : 1 }}>
      {/* Toggle bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'rgba(5, 5, 10, 0.9)',
          border: `1px solid ${activeThemeColor}`,
          color: '#fff',
          borderRadius: '6px',
          fontWeight: 'bold',
          fontSize: '0.85rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isOpen ? `0 0 10px ${activeThemeColor}40` : 'none',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span>{selectedOption ? selectedOption.name : 'Select Bot...'}</span>
        <ChevronDown 
          size={16} 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s ease',
            color: activeThemeColor
          }} 
        />
      </div>

      {/* Options list */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '100%',
            background: 'rgba(5, 5, 10, 0.95)',
            border: `1px solid ${activeThemeColor}`,
            borderRadius: '6px',
            boxShadow: `0 4px 20px rgba(0, 0, 0, 0.8), 0 0 15px ${activeThemeColor}20`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 0',
            zIndex: 100
          }}
        >
          {options.map(opt => {
            const isSelected = opt.id === value;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: isSelected ? activeThemeColor : 'var(--text-primary)',
                  backgroundColor: isSelected ? activeBgColor : 'transparent',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  transition: 'all 0.15s ease',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {opt.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
