import React, { useState } from 'react';
import { Grid, Upload, Download, RefreshCw, Trash2, Activity } from 'lucide-react';
import { CustomCheckbox, CustomSelect } from './DevUI';
import { traceLaserBeam } from '../../core/Ruleset';
import { analyzeBoardAsync } from '../../core/BotEngine';

export default function BoardEditor({ customBoards = [] }) {
  const [editorBoard, setEditorBoard] = useState(() => Array(8).fill(null).map(() => Array(8).fill(null)));
  const [editorBoardName, setEditorBoardName] = useState('my_custom_board');
  const [editorError, setEditorError] = useState(null);
  const [editorSuccess, setEditorSuccess] = useState(null);
  const [editorSymmetry, setEditorSymmetry] = useState('none'); // 'none', 'horizontal', 'vertical', 'radial2', 'radial4', 'both'

  const boardOptions = [
    { id: 'default', name: 'Default Board (Classic)' },
    ...customBoards.map((b, i) => ({ id: `custom_${i}`, name: b.name || `Custom Board ${i+1}` }))
  ];
  const [selectedBoardId, setSelectedBoardId] = useState('default');

  const [simLaserActive, setSimLaserActive] = useState(false);
  const [simLaserR, setSimLaserR] = useState(0);
  const [simLaserC, setSimLaserC] = useState(0);
  const [simLaserDir, setSimLaserDir] = useState(180); // 0 (UP), 90 (RIGHT), 180 (DOWN), 270 (LEFT)

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  const [isDeepAnalysis, setIsDeepAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analyze the board heuristically using 2d6 probability models
  const computeThreatAnalysis = (board, threatMap) => {
    if (!board || !threatMap) return null;

    const shots = [
      { r: 0, c: 0, dir: 90 }, { r: 0, c: 0, dir: 180 },
      { r: 0, c: 7, dir: 270 }, { r: 0, c: 7, dir: 180 },
      { r: 7, c: 0, dir: 90 }, { r: 7, c: 0, dir: 0 },
      { r: 7, c: 7, dir: 270 }, { r: 7, c: 7, dir: 0 }
    ];

    const hitMirrors = new Set();
    let infiniteLoops = 0;

    for (const shot of shots) {
      const trace = traceLaserBeam(board, { r: shot.r, c: shot.c }, shot.dir);
      if (trace.infinite) infiniteLoops++;
      for (const step of trace.path) {
        if (step.type === 'mirror-bounce') {
          hitMirrors.add(`${step.r},${step.c}`);
        }
      }
    }

    let totalMirrors = 0;
    let safeZones = 0;
    let highThreat = 0;
    let medThreat = 0;
    let lowThreat = 0;

    let maxThreat = 0;
    let maxThreatCell = null;
    let totalThreatSum = 0;
    let centerThreatSum = 0;
    let emptyCells = 0;

    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
        if (board[r][c] && board[r][c].type === 'mirror') totalMirrors++;
        if (!isCorner && !board[r][c]) {
           emptyCells++;
           const prob = threatMap[r][c].total;
           
           totalThreatSum += prob;
           if ((r === 3 || r === 4) && (c === 3 || c === 4)) {
             centerThreatSum += prob;
           }
           
           if (prob > maxThreat) {
             maxThreat = prob;
             maxThreatCell = `(${r},${c})`;
           }

           if (prob === 0) safeZones++;
           else if (prob > 0.6) highThreat++;
           else if (prob > 0.15) medThreat++;
           else lowThreat++;
        }
      }
    }

    const avgThreat = emptyCells > 0 ? totalThreatSum / emptyCells : 0;
    const centerControl = centerThreatSum / 4; // 4 center squares
    const deadMirrors = totalMirrors - hitMirrors.size;
    let balance = "Balanced";
    // Tweak heuristics based on new 2d6 threat matrix instead of static shots
    if (safeZones > 8 || avgThreat < 0.2) balance = "Defender Favored";
    if (safeZones < 3 && highThreat > 15) balance = "Attacker Favored";

    return {
      heatmap: threatMap,
      safeZones,
      highThreat,
      medThreat,
      lowThreat,
      totalMirrors,
      deadMirrors,
      infiniteLoops,
      balance,
      avgThreat,
      centerControl,
      maxThreat,
      maxThreatCell
    };
  };

  const handleRefreshAnalysis = async () => {
    setIsAnalyzing(true);
    setEditorError(null);
    try {
      const threatMap = await analyzeBoardAsync(editorBoard, isDeepAnalysis);
      const data = computeThreatAnalysis(editorBoard, threatMap);
      setAnalysisData(data);
      setShowAnalysis(true);
    } catch (err) {
      setEditorError("Analysis failed: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const checkAdjacencyBlocking = (board) => {
    const corners = [
      { cr: 0, cc: 0, a1: [0, 1], a2: [1, 0] },
      { cr: 0, cc: 7, a1: [0, 6], a2: [1, 7] },
      { cr: 7, cc: 0, a1: [7, 1], a2: [6, 0] },
      { cr: 7, cc: 7, a1: [7, 6], a2: [6, 7] }
    ];

    for (const c of corners) {
      const cell1 = board[c.a1[0]][c.a1[1]];
      const cell2 = board[c.a2[0]][c.a2[1]];
      if (cell1 && cell2) {
        return `Corner (${c.cr}, ${c.cc}) cannot be locked in by mirrors on both exit paths (${c.a1[0]}, ${c.a1[1]}) and (${c.a2[0]}, ${c.a2[1]}).`;
      }
    }
    return null;
  };

  const handleCellClick = (r, c) => {
    const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
    if (isCorner) {
      setEditorError("Mirrors cannot be placed in the laser starting coordinates (corner cells).");
      return;
    }

    let blockError = null;

    setEditorBoard(prev => {
      const next = prev.map(row => row.slice());
      const cell = next[r][c];
      
      let nextCell = null;
      if (!cell) {
        nextCell = { type: 'mirror', orientation: '/' };
      } else if (cell.orientation === '/') {
        nextCell = { type: 'mirror', orientation: '\\' };
      } else {
        nextCell = null;
      }

      next[r][c] = nextCell;

      // Apply symmetry reflections
      if (editorSymmetry === 'horizontal') {
        const mr = 7 - r;
        if (mr !== r) {
          next[mr][c] = nextCell ? { ...nextCell, orientation: nextCell.orientation === '/' ? '\\' : '/' } : null;
        }
      } else if (editorSymmetry === 'vertical') {
        const mc = 7 - c;
        if (mc !== c) {
          next[r][mc] = nextCell ? { ...nextCell, orientation: nextCell.orientation === '/' ? '\\' : '/' } : null;
        }
      } else if (editorSymmetry === 'radial2') {
        const mr = 7 - r;
        const mc = 7 - c;
        if (mr !== r || mc !== c) {
          next[mr][mc] = nextCell ? { ...nextCell, orientation: nextCell.orientation } : null;
        }
      } else if (editorSymmetry === 'radial4') {
        const coords = [
          { nr: c, nc: 7 - r, flip: true },
          { nr: 7 - r, nc: 7 - c, flip: false },
          { nr: 7 - c, nc: r, flip: true }
        ];
        coords.forEach(({ nr, nc, flip }) => {
          if (nr !== r || nc !== c) {
            if (nextCell) {
              const targetOrientation = flip 
                ? (nextCell.orientation === '/' ? '\\' : '/')
                : nextCell.orientation;
              next[nr][nc] = { ...nextCell, orientation: targetOrientation };
            } else {
              next[nr][nc] = null;
            }
          }
        });
      } else if (editorSymmetry === 'both') {
        const mr = 7 - r;
        const mc = 7 - c;
        if (mr !== r) {
          next[mr][c] = nextCell ? { ...nextCell, orientation: nextCell.orientation === '/' ? '\\' : '/' } : null;
        }
        if (mc !== c) {
          next[r][mc] = nextCell ? { ...nextCell, orientation: nextCell.orientation === '/' ? '\\' : '/' } : null;
        }
        if (mr !== r && mc !== c) {
          next[mr][mc] = nextCell ? { ...nextCell, orientation: nextCell.orientation } : null;
        }
      }

      blockError = checkAdjacencyBlocking(next);
      if (blockError) {
        return prev; // Revert change!
      }
      return next;
    });

    if (blockError) {
      setEditorError(blockError);
      setEditorSuccess(null);
    } else {
      setEditorError(null);
      setEditorSuccess(null);
    }
  };

  const tracePath = simLaserActive 
    ? traceLaserBeam(editorBoard, { r: simLaserR, c: simLaserC }, simLaserDir).path 
    : [];

  // SVG overlay will be used instead of cell-by-cell rendering.

  const handleClearEditorBoard = () => {
    setEditorBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
    setEditorError(null);
    setEditorSuccess("Grid cleared.");
  };

  const handleLoadSelectedBoard = () => {
    if (selectedBoardId === 'default') {
      const nextBoard = Array(8).fill(null).map(() => Array(8).fill(null));
      const FIXED_MIRRORS = [
        { r: 1, c: 2, orientation: '/' },
        { r: 1, c: 5, orientation: '\\' },
        { r: 3, c: 3, orientation: '\\' },
        { r: 3, c: 4, orientation: '/' },
        { r: 4, c: 3, orientation: '/' },
        { r: 4, c: 4, orientation: '\\' },
        { r: 6, c: 2, orientation: '\\' },
        { r: 6, c: 5, orientation: '/' }
      ];
      for (const m of FIXED_MIRRORS) {
        nextBoard[m.r][m.c] = { type: 'mirror', orientation: m.orientation };
      }
      setEditorBoard(nextBoard);
      setEditorBoardName('default_board');
      setEditorSuccess("Loaded Default Board.");
    } else {
      const idx = parseInt(selectedBoardId.replace('custom_', ''));
      const boardObj = customBoards[idx];
      if (boardObj && boardObj.data) {
        const nextBoard = Array(8).fill(null).map(() => Array(8).fill(null));
        for (const m of boardObj.data) {
          if (m.type === 'mirror' && m.grid_pos) {
            const r = m.grid_pos[0];
            const c = m.grid_pos[1];
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
              const orientation = m.angle === 90 ? '\\' : '/';
              nextBoard[r][c] = { type: 'mirror', orientation };
            }
          }
        }
        setEditorBoard(nextBoard);
        setEditorBoardName(boardObj.name || `custom_board_${idx+1}`);
        setEditorSuccess(`Loaded ${boardObj.name}`);
      } else {
        setEditorError("Could not load board layout data.");
      }
    }
  };


  const handleExportJsonFile = () => {
    const list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = editorBoard[r][c];
        if (cell && cell.type === 'mirror') {
          list.push({
            type: 'mirror',
            grid_pos: [r, c],
            angle: cell.orientation === '\\' ? 90 : 0
          });
        }
      }
    }
    
    const formattedName = editorBoardName.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (!formattedName) {
      setEditorError("Please enter a valid board name.");
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${formattedName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setEditorSuccess(`Successfully exported ${formattedName}.json!`);
  };

  const handleImportJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditorError(null);
    setEditorSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!Array.isArray(data)) {
          throw new Error("JSON file must be an array of objects representing mirrors.");
        }
        
        const nextBoard = Array(8).fill(null).map(() => Array(8).fill(null));
        for (const m of data) {
          if (m.type === 'mirror' && Array.isArray(m.grid_pos) && m.grid_pos.length === 2) {
            const r = m.grid_pos[0];
            const c = m.grid_pos[1];
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
              const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
              if (isCorner) continue; // Skip corner positions (where lasers live)
              const orientation = m.angle === 90 ? '\\' : '/';
              nextBoard[r][c] = { type: 'mirror', orientation };
            }
          }
        }

        const blockError = checkAdjacencyBlocking(nextBoard);
        if (blockError) {
          throw new Error(blockError);
        }

        setEditorBoard(nextBoard);
        setEditorBoardName(file.name.replace('.json', '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
        setEditorSuccess(`Loaded board: ${file.name}`);
      } catch (err) {
        setEditorError(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Explanatory Banner */}
      <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid var(--neon-blue)', background: 'rgba(0, 240, 255, 0.02)' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Grid size={18} style={{ color: 'var(--neon-blue)' }} /> Design Custom Board Maps
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
          Build custom mirror grids! Click on any empty square to place a <strong>/ (0°)</strong> mirror. Click it again to toggle to a <strong>\\ (90°)</strong> mirror. Click a third time to clear the square. Save your layout and import it into the local match board or visual spectator mode.
        </p>
      </div>

      {/* Editor Grid and Info */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        
        {/* The 8x8 Grid Container */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Column Headers */}
          <div style={{ display: 'flex', paddingLeft: '24px', width: '100%', minWidth: '344px', marginBottom: '4px' }}>
            {Array(8).fill(null).map((_, idx) => (
              <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--neon-blue)', opacity: 0.8 }}>
                {idx}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Row Headers */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '320px', justifyContent: 'space-around', paddingRight: '4px' }}>
              {Array(8).fill(null).map((_, idx) => (
                <div key={idx} style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--neon-blue)', opacity: 0.8, height: '40px', display: 'flex', alignItems: 'center' }}>
                  {idx}
                </div>
              ))}
            </div>

            {/* 8x8 Grid Canvas */}
            <div 
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 40px)',
                gridTemplateRows: 'repeat(8, 40px)',
                gap: '2px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '2px solid var(--border-color)',
                boxShadow: '0 0 15px rgba(0, 240, 255, 0.1)',
                borderRadius: '8px',
                padding: '4px'
              }}
            >
              {/* SVG Overlay for Laser Simulation */}
              {simLaserActive && tracePath && tracePath.length > 0 && (
                <svg 
                  viewBox="0 0 342 342"
                  style={{ 
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10
                  }}
                >
                  <polyline
                    points={[{r: simLaserR, c: simLaserC}, ...tracePath].map(pt => `${pt.c * 42 + 24},${pt.r * 42 + 24}`).join(' ')}
                    fill="none"
                    stroke="#ff2a85"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                    style={{ filter: 'drop-shadow(0 0 8px #ff2a85)' }}
                  />
                  <polyline
                    points={[{r: simLaserR, c: simLaserC}, ...tracePath].map(pt => `${pt.c * 42 + 24},${pt.r * 42 + 24}`).join(' ')}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="1"
                  />
                </svg>
              )}
              {Array(8).fill(null).map((_, r) => (
                Array(8).fill(null).map((_, c) => {
                  const cell = editorBoard[r][c];
                  const isCorner = (r === 0 && c === 0) || (r === 0 && c === 7) || (r === 7 && c === 0) || (r === 7 && c === 7);
                  const threatLevel = showAnalysis && analysisData && analysisData.heatmap[r][c] ? analysisData.heatmap[r][c].total : 0;
                  const isSafe = showAnalysis && analysisData && !isCorner && !cell && threatLevel === 0;

                  let cellBg = isCorner ? 'rgba(255, 42, 133, 0.05)' : 'rgba(5, 5, 10, 0.8)';
                  if (showAnalysis && analysisData && !isCorner && !cell) {
                     if (isSafe) {
                        cellBg = 'rgba(0, 255, 128, 0.2)'; // Green safe zone
                     } else if (threatLevel > 0) {
                        // Interpolate Yellow -> Orange -> Red
                        const r = 255;
                        const g = Math.max(0, Math.floor(255 * (1 - threatLevel * 1.5)));
                        cellBg = `rgba(${r}, ${g}, 0, ${0.15 + threatLevel * 0.6})`;
                     }
                  }

                  return (
                    <div 
                      key={`${r}-${c}`}
                      onClick={() => handleCellClick(r, c)}
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        background: cellBg,
                        border: isCorner ? '1px dashed rgba(255, 42, 133, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Threat Probability Text */}
                      {showAnalysis && analysisData && !cell && !isCorner && (
                        <div style={{ position: 'absolute', fontSize: '0.6rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.85)', pointerEvents: 'none', zIndex: 5 }}>
                           {threatLevel > 0 ? `${Math.round(threatLevel * 100)}%` : '0%'}
                        </div>
                      )}
                      {/* Dotted target inside cell */}
                      {!cell && !isCorner && (
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      )}
                      
                      {/* Attacker Corner Marks */}
                      {isCorner && !cell && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--neon-red)', fontWeight: 'bold', opacity: 0.6 }}>LAZR</div>
                      )}

                      {/* Render the block if it exists */}
                      {cell && cell.type !== 'mirror' && (
                        <div style={{
                          position: 'absolute',
                          width: '80%',
                          height: '80%',
                          borderRadius: '50%',
                          background: cell.type === 'block-20' ? '#00f0ff' : cell.type === 'block-30' ? '#ffff00' : cell.type === 'block-50' ? '#b026ff' : '#ff003c',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          color: '#000',
                          fontSize: '0.8rem',
                          boxShadow: `0 0 10px ${cell.type === 'block-20' ? '#00f0ff' : cell.type === 'block-30' ? '#ffff00' : cell.type === 'block-50' ? '#b026ff' : '#ff003c'}`,
                          zIndex: 11
                        }}>
                          {cell.value || 'L'}
                        </div>
                      )}

                      {/* Glowing Slash Mirror preview */}
                      {cell && cell.type === 'mirror' && (
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          width: '28px',
                          height: '3px',
                          background: 'var(--neon-blue)',
                          boxShadow: '0 0 8px var(--neon-blue), 0 0 15px var(--neon-blue)',
                          transform: `translate(-50%, -50%) rotate(${cell.orientation === '/' ? '-45deg' : '45deg'})`,
                          pointerEvents: 'none',
                          zIndex: 11
                        }} />
                      )}

                    </div>
                  );
                })
              ))}

              {/* Horizontal Symmetry Guideline */}
              {(editorSymmetry === 'horizontal' || editorSymmetry === 'both') && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '4px',
                  right: '4px',
                  height: '0px',
                  borderTop: '2px dotted var(--neon-blue)',
                  boxShadow: '0 0 6px var(--neon-blue)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  transform: 'translateY(-50%)',
                  opacity: 0.85
                }} />
              )}

              {/* Vertical Symmetry Guideline */}
              {(editorSymmetry === 'vertical' || editorSymmetry === 'both') && (
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '4px',
                  bottom: '4px',
                  width: '0px',
                  borderLeft: '2px dotted var(--neon-blue)',
                  boxShadow: '0 0 6px var(--neon-blue)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  transform: 'translateX(-50%)',
                  opacity: 0.85
                }} />
              )}

              {/* Radial Center Dot */}
              {(editorSymmetry === 'radial2' || editorSymmetry === 'radial4') && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--neon-blue)',
                  boxShadow: '0 0 8px var(--neon-blue), 0 0 15px var(--neon-blue)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 11
                }} />
              )}

              {/* Radial 4-Way Circular Outline */}
              {editorSymmetry === 'radial4' && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  border: '2px dotted var(--neon-blue)',
                  boxShadow: '0 0 6px var(--neon-blue)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  opacity: 0.65
                }} />
              )}
            </div>
          </div>
        </div>

        {/* Design Controls */}
        <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', zIndex: 10 }}>
            <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0', fontSize: '0.95rem' }}>GRID CONTROLS</h4>
            
            {/* File name inputs */}
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Board Name identifier:</label>
              <input 
                type="text"
                value={editorBoardName}
                onChange={(e) => setEditorBoardName(e.target.value)}
                placeholder="custom_board_name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Symmetry Toggle Selection */}
            <div style={{ position: 'relative', zIndex: 20 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Mirror Symmetry Mode:</label>
              <CustomSelect 
                value={editorSymmetry} 
                onChange={setEditorSymmetry} 
                options={[
                  { id: 'none', name: 'No Symmetry' },
                  { id: 'horizontal', name: 'Horizontal ↔️' },
                  { id: 'vertical', name: 'Vertical ↕️' },
                  { id: 'both', name: 'Horiz + Vert (4-Way)' },
                  { id: 'radial2', name: 'Radial (2-Way) 🔄' },
                  { id: 'radial4', name: 'Radial (4-Way) 🌀' }
                ]} 
                colorTheme="cyan"
              />
            </div>

            {/* Board Analysis Panel */}
            <div style={{ marginTop: '10px', padding: '14px', background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: 'var(--neon-blue)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={16} /> BOARD ANALYSIS
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <CustomCheckbox 
                    checked={isDeepAnalysis} 
                    onChange={(e) => setIsDeepAnalysis(e.target.checked)} 
                    label="Deep (Multi-Turn)" 
                    colorTheme="red"
                  />
                  <button 
                    className="cyber-button"
                    onClick={handleRefreshAnalysis}
                    disabled={isAnalyzing}
                    style={{ fontSize: '0.8rem', padding: '10px 16px', minHeight: '44px', opacity: isAnalyzing ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <RefreshCw size={16} /> {isAnalyzing ? 'ANALYZING...' : 'REFRESH'}
                  </button>
                  <CustomCheckbox 
                    checked={showAnalysis} 
                    onChange={(e) => setShowAnalysis(e.target.checked)} 
                    label="Heatmap" 
                    colorTheme="cyan"
                  />
                </div>
              </div>
              {showAnalysis && analysisData && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Balance:</span>
                    <strong style={{ color: analysisData.balance === 'Balanced' ? 'var(--neon-blue)' : (analysisData.balance === 'Attacker Favored' ? 'var(--neon-red)' : '#00ff80') }}>{analysisData.balance}</strong>
                  </div>
                  
                  {/* Detailed 2d6 Threat Matrix */}
                  <div style={{ marginTop: '6px', marginBottom: '2px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <strong>Turn 1 Threat Matrix (2d6 math)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Avg Board Threat:</span>
                    <strong style={{ color: analysisData.avgThreat > 0.4 ? 'var(--neon-red)' : 'var(--neon-blue)' }}>{Math.round(analysisData.avgThreat * 100)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Center Control Threat:</span>
                    <strong style={{ color: analysisData.centerControl > 0.5 ? 'var(--neon-red)' : 'var(--neon-blue)' }}>{Math.round(analysisData.centerControl * 100)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Max Threat Cell:</span>
                    <strong style={{ color: 'var(--neon-red)' }}>{analysisData.maxThreatCell} ({Math.round(analysisData.maxThreat * 100)}%)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>Safe Zones (0%):</span>
                    <strong style={{ color: analysisData.safeZones > 0 ? '#00ff80' : 'var(--text-primary)' }}>{analysisData.safeZones}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Low Threat (&lt; 15%):</span>
                    <strong style={{ color: '#00ffff' }}>{analysisData.lowThreat}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Med Threat (15% - 60%):</span>
                    <strong style={{ color: '#ffcc00' }}>{analysisData.medThreat}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>High Threat (&gt; 60%):</span>
                    <strong style={{ color: 'var(--neon-red)' }}>{analysisData.highThreat}</strong>
                  </div>

                  <div style={{ marginTop: '6px', marginBottom: '2px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <strong>Mirror Topology</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Mirrors:</span>
                    <strong>{analysisData.totalMirrors}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Dead Mirrors (Never Hit):</span>
                    <strong style={{ color: analysisData.deadMirrors > 0 ? 'var(--neon-red)' : 'var(--text-primary)' }}>{analysisData.deadMirrors}</strong>
                  </div>
                  {analysisData.infiniteLoops > 0 && (
                    <div style={{ marginTop: '4px', color: 'var(--neon-red)', fontWeight: 'bold', fontSize: '0.7rem' }}>
                      ⚠️ WARNING: {analysisData.infiniteLoops} infinite loops detected!
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status Logs */}
            {editorError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255, 42, 133, 0.08)', border: '1px solid var(--neon-red)', borderRadius: '4px', color: 'var(--neon-red)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {editorError}
              </div>
            )}

            {editorSuccess && (
              <div style={{ padding: '8px 12px', background: 'rgba(57, 255, 20, 0.08)', border: '1px solid #39ff14', borderRadius: '4px', color: '#39ff14', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {editorSuccess}
              </div>
            )}

            {/* Actions buttons grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button 
                className="cyber-button blue"
                onClick={handleExportJsonFile}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px' }}
              >
                <Download size={14} style={{ display: 'inline-block' }} /> DOWNLOAD JSON
              </button>
              <label 
                className="cyber-button"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px', cursor: 'pointer' }}
              >
                <Upload size={14} style={{ display: 'inline-block' }} /> IMPORT FILE
                <input type="file" accept=".json" onChange={handleImportJsonFile} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Board Loader */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Load Board Layout:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <CustomSelect 
                    value={selectedBoardId} 
                    onChange={setSelectedBoardId} 
                    options={boardOptions} 
                    colorTheme="cyan"
                  />
                </div>
                <button 
                  className="cyber-button blue"
                  onClick={handleLoadSelectedBoard}
                  disabled={!selectedBoardId}
                  title="Load Selected Board"
                  style={{ flex: '1 1 auto', padding: '12px 16px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <RefreshCw size={18} /> LOAD
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <button 
                className="cyber-button red"
                onClick={handleClearEditorBoard}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px' }}
              >
                <Trash2 size={14} style={{ display: 'inline-block' }} /> CLEAR GRID
              </button>
            </div>
          </div>

          {/* Laser Simulation Controls */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ color: 'var(--text-primary)', margin: '0', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚡ LAZER SIMULATION</span>
              <CustomCheckbox 
                checked={simLaserActive} 
                onChange={(e) => setSimLaserActive(e.target.checked)} 
                label=""
              />
            </h4>

            {simLaserActive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                
                {/* Laser Source Position */}
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Laser Source Corner:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button 
                      className={`cyber-button ${simLaserR === 0 && simLaserC === 0 ? 'blue' : ''}`}
                      onClick={() => { setSimLaserR(0); setSimLaserC(0); }}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      Top-Left (0,0)
                    </button>
                    <button 
                      className={`cyber-button ${simLaserR === 0 && simLaserC === 7 ? 'blue' : ''}`}
                      onClick={() => { setSimLaserR(0); setSimLaserC(7); }}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      Top-Right (0,7)
                    </button>
                    <button 
                      className={`cyber-button ${simLaserR === 7 && simLaserC === 0 ? 'blue' : ''}`}
                      onClick={() => { setSimLaserR(7); setSimLaserC(0); }}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      Bottom-Left (7,0)
                    </button>
                    <button 
                      className={`cyber-button ${simLaserR === 7 && simLaserC === 7 ? 'blue' : ''}`}
                      onClick={() => { setSimLaserR(7); setSimLaserC(7); }}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      Bottom-Right (7,7)
                    </button>
                  </div>
                </div>

                {/* Laser Fire Direction */}
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Firing Direction:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button 
                      className={`cyber-button ${simLaserDir === 0 ? 'blue' : ''}`}
                      onClick={() => setSimLaserDir(0)}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      UP ⬆️
                    </button>
                    <button 
                      className={`cyber-button ${simLaserDir === 90 ? 'blue' : ''}`}
                      onClick={() => setSimLaserDir(90)}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      RIGHT ➡️
                    </button>
                    <button 
                      className={`cyber-button ${simLaserDir === 180 ? 'blue' : ''}`}
                      onClick={() => setSimLaserDir(180)}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      DOWN ⬇️
                    </button>
                    <button 
                      className={`cyber-button ${simLaserDir === 270 ? 'blue' : ''}`}
                      onClick={() => setSimLaserDir(270)}
                      style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                    >
                      LEFT ⬅️
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Import guideline details */}
          <div className="glass-panel" style={{ padding: '15px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            💡 <strong>How to Use Custom JSONs:</strong><br />
            Once downloaded, place the file in the project's <code>src/boards/</code> directory (e.g. <code>src/boards/my_maze.json</code>). Vite will automatically scan and register the new layout. You will then see it selectable under both the Main Menu board options and Dev's Corner visual spectating dropdowns!
          </div>
        </div>

      </div>
    </div>
  );
}
