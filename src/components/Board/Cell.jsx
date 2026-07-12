import React, { useState } from 'react';
import { RotateCw, Trash2 } from 'lucide-react';
import { BLOCK_TYPES } from '../../core/Ruleset';

export default function Cell({
  r,
  c,
  block,
  isSelected,
  onClick,
  onDragOver,
  onDrop,
  rotateBlock,
  removeBlock,
  showControls,
  blockState = 'neutral',
  isReachable = false,
  reachableDist = 0,
  threatObj = null,
  isHighlighted = false
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const getBlockStyles = () => {
    if (!block || block.type === 'mirror') return {};
    
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
    let opacity = 1;
    let badge = null;

    return { coreColor, borderColor, borderGlow, text, opacity, badge };
  };

  const handleDragStart = (e) => {
    if (!block || block.type === 'mirror') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'board', r, c }));
    window.draggedItem = { source: 'board', r, c };
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (block && block.type === 'mirror') return;
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleLocalDrop = (e) => {
    setIsDragOver(false);
    if (block && block.type === 'mirror') return;
    onDrop(e, r, c);
  };

  const renderBlockSvg = () => {
    if (!block) return null;

    if (block.type === 'mirror') {
      const isSlash = block.orientation === '/';
      return (
        <div className="mirror-wrapper" style={{ width: '100%', height: '100%', padding: '4px', boxSizing: 'border-box' }}>
          <svg viewBox="0 0 40 40" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Mirror mounting stands */}
            <circle cx={isSlash ? 6 : 6} cy={isSlash ? 34 : 6} r="3" fill="#5c6285" stroke="#1d1e2c" strokeWidth="1.5" />
            <circle cx={isSlash ? 34 : 34} cy={isSlash ? 6 : 34} r="3" fill="#5c6285" stroke="#1d1e2c" strokeWidth="1.5" />

            {/* Glowing neon purple edge backing */}
            <line 
              x1={isSlash ? 6 : 6} 
              y1={isSlash ? 34 : 6} 
              x2={isSlash ? 34 : 34} 
              y2={isSlash ? 6 : 34} 
              stroke="#b026ff" 
              strokeWidth="5.5" 
              strokeLinecap="round"
              opacity="0.8"
              style={{ filter: 'drop-shadow(0 0 6px #b026ff)' }}
            />
            {/* Shiny double-sided silver-blue mirror surface */}
            <line 
              x1={isSlash ? 6 : 6} 
              y1={isSlash ? 34 : 6} 
              x2={isSlash ? 34 : 34} 
              y2={isSlash ? 6 : 34} 
              stroke="#e0f7ff" 
              strokeWidth="2.2" 
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }

    const { coreColor, borderColor, borderGlow, text, opacity, badge } = getBlockStyles();

    return (
      <div
        className="piece-wrapper"
        style={{ transform: `rotate(${block.rotation}deg)`, opacity }}
      >
        <svg viewBox="0 0 40 40" className="piece-icon">
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
  };

  const isEven = (r + c) % 2 === 0;

  return (
    <div
      className={`board-cell ${isEven ? 'cell-even' : 'cell-odd'} ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onClick={onClick}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e);
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleLocalDrop}
      draggable={!!block && block.type !== 'mirror'}
      onDragStart={handleDragStart}
    >
      {renderBlockSvg()}

      {/* Rotation control overlay for LAZER pieces */}
      {showControls && block && block.type === BLOCK_TYPES.BLOCK_LAZER && (
        <div className="cell-controls" style={{ gap: '4px' }}>
          <button
            className="control-btn"
            title="Rotate CCW"
            onClick={(e) => {
              e.stopPropagation();
              rotateBlock(r, c, 'ccw');
            }}
            style={{ width: '22px', height: '22px' }}
          >
            <RotateCw size={12} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <button
            className="control-btn"
            title="Rotate CW"
            onClick={(e) => {
              e.stopPropagation();
              rotateBlock(r, c, 'cw');
            }}
            style={{ width: '22px', height: '22px' }}
          >
            <RotateCw size={12} />
          </button>
        </div>
      )}

      {/* Threat Map Overlay */}
      {(() => {
        const threatTotal = threatObj ? threatObj.total : 0;
        if (!threatObj || threatTotal === 0 || block) return null;

        const colors = {
          'TL': '0, 255, 255',    // Cyan
          'TR': '255, 0, 255',    // Magenta
          'BL': '255, 255, 0',    // Yellow
          'BR': '0, 255, 0',      // Green
          '0': '0, 255, 255',     // Cyan
          '90': '255, 0, 255',    // Magenta
          '180': '255, 255, 0',   // Yellow
          '270': '0, 255, 0'      // Green
        };

        return (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'none', zIndex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden'
          }}>
            {Object.entries(threatObj.sources).map(([source, prob]) => (
              <div key={source} style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: `rgba(${colors[source] || '255,255,255'}, ${prob * 0.45})`,
                mixBlendMode: 'screen'
              }} />
            ))}
            <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 'bold', opacity: 0.9, zIndex: 2, textShadow: '0 0 4px black' }}>
              {threatTotal.toFixed(6)}
            </span>
          </div>
        );
      })()}

      {/* Reachable overlay displaying Action Point cost */}
      {isReachable && (
        <div 
          className="reachable-dot"
          style={{ 
            position: 'absolute', 
            width: '24px', 
            height: '24px', 
            borderRadius: '50%', 
            background: 'rgba(57, 255, 20, 0.15)', 
            border: '1.5px dashed #39ff14', 
            color: '#39ff14', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '9px', 
            fontWeight: 'bold', 
            pointerEvents: 'none', 
            boxShadow: '0 0 6px rgba(57, 255, 20, 0.3)',
            zIndex: 5
          }}
        >
          {reachableDist}
        </div>
      )}
      {/* Highlight Target Overlay */}
      {isHighlighted && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          border: '3px solid #00f0ff', borderRadius: '4px',
          boxShadow: '0 0 15px #00f0ff, inset 0 0 15px #00f0ff',
          animation: 'afkPulse 1.5s infinite', zIndex: 10, pointerEvents: 'none'
        }} />
      )}
    </div>
  );
}
