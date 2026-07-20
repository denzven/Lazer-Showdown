import React from 'react';
import { BLOCK_TYPES } from '../../core/Ruleset';

export default function Piece({ block, r, c, onClick, onDragOver, onDragEnter, onDragLeave, onDrop }) {
  if (!block || block.type === 'mirror') return null;

  const getBlockStyles = () => {
    let coreColor = '#ffffff';
    let text = '';
    switch (block.type) {
      case BLOCK_TYPES.BLOCK_20:
        coreColor = '#00f0ff';
        text = '20';
        break;
      case BLOCK_TYPES.BLOCK_30:
        coreColor = '#ffcc00';
        text = '30';
        break;
      case BLOCK_TYPES.BLOCK_50:
        coreColor = '#b026ff';
        text = '50';
        break;
      case BLOCK_TYPES.BLOCK_LAZER:
        coreColor = '#ff003c';
        text = 'LAZER';
        break;
    }

    let borderColor = block.player === 'red' ? '#ff2a85' : '#00f0ff';
    let borderGlow = block.player === 'red' ? 'rgba(255, 42, 133, 0.5)' : 'rgba(0, 240, 255, 0.5)';
    let opacity = block.isGhost ? 0.4 : 1;

    if (block.isGhost) {
      borderGlow = block.player === 'red' ? 'rgba(255, 42, 133, 1)' : 'rgba(0, 240, 255, 1)';
    }

    return { coreColor, borderColor, borderGlow, text, opacity };
  };

  const { coreColor, borderColor, borderGlow, text, opacity } = getBlockStyles();

  const handleDragStart = (e) => {
    if (block.isGhost) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'board', r, c }));
    window.draggedItem = { source: 'board', r, c };
  };

  return (
    <div
      className="piece-wrapper animate-pop-in"
      draggable={!block.isGhost}
      onDragStart={handleDragStart}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); if (onDragOver) onDragOver(e); }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'absolute',
        top: `${r * 12.5}%`,
        left: `${c * 12.5}%`,
        width: '12.5%',
        height: '12.5%',
        boxSizing: 'border-box',
        opacity,
        transition: 'top 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: 20
      }}
    >
      <svg viewBox="0 0 40 40" className="piece-icon" style={{ width: '100%', height: '100%', transform: `rotate(${block.rotation || 0}deg)`, transition: 'transform 0.3s' }}>
        <rect
          x="6"
          y="6"
          width="28"
          height="28"
          rx="6"
          fill="none"
          stroke={borderColor}
          strokeWidth="3.5"
          filter={`drop-shadow(0 0 4px ${borderGlow})`}
        />
        {block.type === BLOCK_TYPES.BLOCK_LAZER ? (
          <>
            <circle cx="20" cy="20" r="5" fill="none" stroke={coreColor} strokeWidth="2" />
            <line x1="20" y1="15" x2="20" y2="7" stroke={coreColor} strokeWidth="2.5" />
            <polygon points="20,4 16,9 24,9" fill={coreColor} />
          </>
        ) : (
          <>
            <rect x="11" y="11" width="18" height="18" rx="3" fill={coreColor} opacity="0.15" />
            <text
              x="50%"
              y="55%"
              dominantBaseline="middle"
              textAnchor="middle"
              fill={coreColor}
              fontSize="15"
              fontWeight="900"
              fontFamily="monospace"
              letterSpacing="0px"
            >
              {text}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
