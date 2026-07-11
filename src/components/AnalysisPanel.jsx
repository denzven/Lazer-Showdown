import React, { useState, useEffect } from 'react';
import { X, Activity, Dices, Clock, Minus, Maximize2, Target } from 'lucide-react';

export default function AnalysisPanel({ 
  data, history, dice, threatMap, lazerPos, engineLines, pieceThreats, 
  showHeatmap, setShowHeatmap, showGhostRays, setShowGhostRays, 
  showPieceThreats, setShowPieceThreats, onClose,
  reviewIndex, stepForward, stepBackward, moveClassification, maxHistoryIndex,
  onHighlightMove, phase, challengeRecommendation
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 450 : 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!data) return null;

  const { totalScore, cautiousness, difficulty, role } = data;
  const { values = [1, 1], lastRoller } = dice || {};

  const getStyleForScore = (score) => {
    if (score > 1000) return 'text-green-400';
    if (score > 0) return 'text-green-200';
    if (score < -1000) return 'text-red-400';
    if (score < 0) return 'text-red-200';
    return 'text-gray-300';
  };

  const getBarWidth = (score) => {
    const maxVal = 5000;
    let percentage = (Math.abs(score) / maxVal) * 100;
    if (percentage > 100) percentage = 100;
    return `${percentage}%`;
  };

  const barColor = totalScore >= 0 ? '#39ff14' : '#ff003c';

  const handleMouseDown = (e) => {
    setIsDragging(true);
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    setDragOffset({
      x: clientX - position.x,
      y: clientY - position.y
    });
  };

  const handleTouchMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragOffset.x,
        y: e.touches[0].clientY - dragOffset.y
      });
    }
  };

  const handleTouchEnd = () => setIsDragging(false);

  const getThreatBreakdown = () => {
    if (!threatMap) return null;
    const totals = {};
    let grandTotal = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = threatMap[r][c];
        if (cell && cell.sources) {
          Object.entries(cell.sources).forEach(([source, prob]) => {
            if (!totals[source]) totals[source] = 0;
            totals[source] += prob;
            grandTotal += prob;
          });
        }
      }
    }

    if (grandTotal === 0) return null;

    const sources = !lazerPos ? [
      { id: 'TL', label: 'Top-Left Corner', color: '#00ffff' },
      { id: 'TR', label: 'Top-Right Corner', color: '#ff00ff' },
      { id: 'BL', label: 'Bottom-Left Corner', color: '#ffff00' },
      { id: 'BR', label: 'Bottom-Right Corner', color: '#00ff00' }
    ] : [
      { id: '0', label: 'Right (0°)', color: '#00ffff' },
      { id: '90', label: 'Down (90°)', color: '#ff00ff' },
      { id: '180', label: 'Left (180°)', color: '#ffff00' },
      { id: '270', label: 'Up (270°)', color: '#00ff00' }
    ];

    return (
      <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Activity size={10} /> SUPERPOSITIONAL THREAT BREAKDOWN
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sources.map(src => {
            const val = totals[src.id] || 0;
            const pct = Math.round((val / grandTotal) * 100);
            return (
              <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: src.color, boxShadow: `0 0 6px ${src.color}` }} />
                  <span style={{ color: 'var(--text-muted)' }}>{src.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '60px', height: '4px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: src.color }} />
                  </div>
                  <span style={{ fontWeight: 'bold', width: '25px', textAlign: 'right' }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isMinimized) {
    return (
      <div 
        style={{ 
          position: 'fixed', 
          left: position.x, 
          top: position.y, 
          zIndex: 1000,
          width: '280px',
          boxShadow: '0 0 15px rgba(0, 0, 0, 0.8)',
          cursor: isDragging ? 'grabbing' : 'auto'
        }}
        className="glass-panel"
      >
        <div 
          onMouseDown={handleMouseDown}
          style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="var(--neon-blue)" />
            <span className="font-display" style={{ fontSize: '0.9rem', color: 'var(--neon-blue)' }}>ENGINE</span>
          </div>

          <div style={{ flex: 1, margin: '0 15px', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: totalScore < 0 ? 'auto' : '50%', right: totalScore < 0 ? '50%' : 'auto', width: getBarWidth(totalScore), backgroundColor: barColor, transition: 'width 0.3s ease' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', backgroundColor: 'rgba(255,255,255,0.5)' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsMinimized(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
              <Maximize2 size={16} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer', padding: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        left: position.x, 
        top: position.y, 
        zIndex: 1000,
        width: '320px',
        padding: '0', 
        overflow: 'hidden', 
        boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)'
      }}
      className="glass-panel"
    >
      {/* Header (Draggable) */}
      <div 
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--neon-blue)" />
          <h3 className="font-display" style={{ margin: 0, fontSize: '1.1rem', color: 'var(--neon-blue)', letterSpacing: '0.1em' }}>ENGINE ANALYSIS</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setIsMinimized(true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
            <Minus size={18} />
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div 
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
        
        {/* Main Eval */}
        <div style={{ textAlign: 'center' }}>
          {reviewIndex !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
              <button 
                onClick={stepBackward} 
                disabled={reviewIndex === 0}
                style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', cursor: reviewIndex === 0 ? 'not-allowed' : 'pointer', opacity: reviewIndex === 0 ? 0.3 : 1 }}
              >
                &larr; Prev
              </button>
              <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#00f0ff' }}>
                REVIEW MODE: Turn {reviewIndex + 1} / {maxHistoryIndex}
              </div>
              <button 
                onClick={stepForward} 
                style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer' }}
              >
                {reviewIndex === maxHistoryIndex - 1 ? 'Live \u2192' : 'Next \u2192'}
              </button>
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Evaluation (Bot Perspective)
          </div>
          <div className={getStyleForScore(totalScore)} style={{ fontSize: '2.5rem', fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1 }}>
            {totalScore > 0 ? '+' : ''}{Math.round(totalScore)}
          </div>
          
          {/* Visual Bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', marginTop: '12px', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: totalScore < 0 ? 'auto' : '50%', right: totalScore < 0 ? '50%' : 'auto', width: getBarWidth(totalScore), backgroundColor: barColor, transition: 'width 0.3s ease' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '2px', backgroundColor: 'rgba(255,255,255,0.5)' }} />
          </div>

          {moveClassification && (
            <div style={{ marginTop: '12px', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.4)', border: `1px solid ${moveClassification.color}`, display: 'inline-block', boxShadow: `0 0 10px ${moveClassification.color}40` }}>
              <span style={{ color: moveClassification.color, fontWeight: 'bold', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {moveClassification.label}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Context Box */}
          <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={10} /> BOT CONTEXT
            </div>
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Difficulty:</span>
                <span style={{ color: '#ffcc00', fontWeight: 'bold', textTransform: 'uppercase' }}>{difficulty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Role:</span>
                <span style={{ textTransform: 'uppercase' }}>{role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cautiousness:</span>
                <span>{cautiousness.toFixed(2)}x</span>
              </div>
            </div>
          </div>

          {/* Game Stats Box */}
          <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> MATCH STATS
            </div>
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}><Dices size={10} style={{display:'inline'}}/> Last Roll:</span>
                <span>{values[0]} + {values[1]} = {values[0] + values[1]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Last Roller:</span>
                <span style={{ textTransform: 'capitalize' }}>{lastRoller || 'None'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Moves Played:</span>
                <span>{history?.past?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Toggles */}
        <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={10} /> VISIBILITY TOGGLES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
              <span style={{ color: showHeatmap ? '#fff' : 'var(--text-muted)' }}>Show Threat Heatmap (Board)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showGhostRays} onChange={(e) => setShowGhostRays(e.target.checked)} />
              <span style={{ color: showGhostRays ? '#fff' : 'var(--text-muted)' }}>Show Possibility Web (Rays)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showPieceThreats} onChange={(e) => setShowPieceThreats(e.target.checked)} />
              <span style={{ color: showPieceThreats ? '#fff' : 'var(--text-muted)' }}>Show Piece Threat Levels</span>
            </label>
          </div>
        </div>

        {/* Piece Threats */}
        {showPieceThreats && pieceThreats && pieceThreats.length > 0 && (
          <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={10} /> PIECE THREAT LEVELS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pieceThreats.map((pt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{pt.type.replace('block-', '')}pt Piece at ({pt.r}, {pt.c})</span>
                  <span style={{ fontWeight: 'bold', color: pt.threatLevel > 0.5 ? 'var(--neon-red)' : '#fff' }}>
                    {Math.round(pt.threatLevel * 100)}% Danger
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Engine Lines */}
        {engineLines && engineLines.length > 0 && (
          <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={10} /> BEST MOVES (PROJECTED)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {engineLines.map((line, i) => {
                let r = null, c = null;
                const match = line.text.match(/\((\d+),\s*(\d+)\)/);
                if (match) {
                  r = parseInt(match[1]);
                  c = parseInt(match[2]);
                }
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {i + 1}. {line.text}
                      {r !== null && c !== null && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onHighlightMove(r, c); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--neon-blue)', display: 'flex' }}
                          title="Highlight on board"
                        >
                          <Target size={12} />
                        </button>
                      )}
                    </span>
                    <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: line.score > 0 ? '#39ff14' : 'var(--text-secondary)' }}>
                      {line.score > 0 ? '+' : ''}{line.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Challenge Recommendation */}
        {phase === 'challenge-declaration' && challengeRecommendation && (
          <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: challengeRecommendation.recommend ? '1px solid #39ff14' : '1px solid var(--text-secondary)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Target size={10} /> CHALLENGE ANALYSIS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: challengeRecommendation.recommend ? '#39ff14' : 'var(--text-secondary)' }}>
                {challengeRecommendation.recommend ? 'CHALLENGE RECOMMENDED' : 'DO NOT CHALLENGE'} ({challengeRecommendation.probability}%)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {challengeRecommendation.reason}
              </div>
            </div>
          </div>
        )}

        {getThreatBreakdown()}
        
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.4 }}>
          * The engine evaluates the game state using a multidimensional vector heuristic, combining physical distance calculations with deep Threat Map raycasting probability logic.
        </div>
      </div>
    </div>
  );
}
