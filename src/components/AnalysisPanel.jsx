import React, { useState, useEffect } from 'react';
import { X, Activity, Dices, Clock, Minus, Maximize2 } from 'lucide-react';

export default function AnalysisPanel({ data, history, dice, onClose }) {
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
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
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
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Main Eval */}
        <div style={{ textAlign: 'center' }}>
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
        
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.4 }}>
          * The engine evaluates the game state using a multidimensional vector heuristic, combining physical distance calculations with deep Threat Map raycasting probability logic.
        </div>
      </div>
    </div>
  );
}
