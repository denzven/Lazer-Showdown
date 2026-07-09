import React from 'react';
import Cell from './Cell';

export default function Grid({
  board,
  selectedCell,
  setSelectedCell,
  selectedPaletteBlock,
  setSelectedPaletteBlock,
  placeBlock,
  moveBlock,
  rotateBlock,
  removeBlock,
  laserPath = [],
  lazerPos = null,
  mode,
  phase,
  isLocalTurn,
  roleRed,
  role,
  activePlayerColor,
  reachableCells = [],
  showLaserBeam = false
}) {
  const handleCellClick = (r, c) => {
    // Disable interaction if it's not the local player's turn
    if (!isLocalTurn) return;

    const block = board[r][c];

    // Setup placing phase interaction
    if (phase !== 'playing') {
      if (selectedPaletteBlock) {
        if (!block) {
          // If placing Lazer, default rotation pointing inside
          let rotation = 0;
          if (selectedPaletteBlock === 'block-lazer') {
            if (r === 0 && c === 0) rotation = 90;
            else if (r === 0 && c === 7) rotation = 180;
            else if (r === 7 && c === 0) rotation = 0;
            else if (r === 7 && c === 7) rotation = 270;
          }
          placeBlock(selectedPaletteBlock, r, c, rotation);
          setSelectedPaletteBlock(null);
        }
      } else if (block && block.type !== 'mirror') {
        // Allow tap rotation during placement for Attacker setup
        if (phase === 'setup-attacker' && block.type === 'block-lazer') {
          rotateBlock(r, c, 'cw');
        }
      }
      return;
    }

    // Gameplay playing phase interaction
    if (block) {
      if (block.type === 'mirror') return; // Cannot select fixed mirrors
      if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        setSelectedCell(null);
      } else {
        setSelectedCell({ r, c });
      }
    } else {
      if (selectedCell) {
        // Multi-step movement along path if cell is reachable
        const target = reachableCells.find(cell => cell.r === r && cell.c === c);
        if (target) {
          let currentFrom = { r: selectedCell.r, c: selectedCell.c };
          for (const step of target.path) {
            moveBlock(currentFrom.r, currentFrom.c, step.r, step.c);
            currentFrom = step;
          }
        }
        setSelectedCell(null);
      }
    }
  };

  const handleDragOver = (e) => {
    if (!isLocalTurn) return;
    e.preventDefault();
  };

  const handleDrop = (e, r, c) => {
    if (!isLocalTurn) return;
    e.preventDefault();
    
    let data = null;
    const dataStr = e.dataTransfer.getData('text/plain');
    
    if (dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch (err) {
        console.warn('[Grid] handleDrop JSON parse error, using fallback:', err);
      }
    }

    if (!data && window.draggedItem) {
      data = window.draggedItem;
    }

    if (!data) {
      console.error('[Grid] No drop data found.');
      return;
    }

    try {
      if (phase === 'playing') {
        if (data.source === 'board') {
          // Multi-step movement along path if target is reachable
          const target = reachableCells.find(cell => cell.r === r && cell.c === c);
          if (target) {
            let currentFrom = { r: data.r, c: data.c };
            for (const step of target.path) {
              moveBlock(currentFrom.r, currentFrom.c, step.r, step.c);
              currentFrom = step;
            }
          }
        }
      } else {
        if (data.source === 'palette') {
          const blockType = data.blockType;
          let rotation = 0;
          if (blockType === 'block-lazer') {
            if (r === 0 && c === 0) rotation = 90;
            else if (r === 0 && c === 7) rotation = 180;
            else if (r === 7 && c === 0) rotation = 0;
            else if (r === 7 && c === 7) rotation = 270;
          }
          placeBlock(blockType, r, c, rotation);
        }
      }
    } catch (err) {
      console.error('[Grid] handleDrop execution error:', err);
    }

    window.draggedItem = null;
  };

  const laserColor = roleRed === 'attacker' ? 'var(--neon-red)' : 'var(--neon-blue)';

  return (
    <div className="board-container glass-panel">
      <div className="grid-wrapper" style={{ position: 'relative', zIndex: 1 }}>
        {/* Bouncing Laser SVG Overlay */}
        {showLaserBeam && lazerPos && laserPath.length > 0 && (
          <svg 
            viewBox="0 0 800 800"
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              pointerEvents: 'none', 
              zIndex: 10 
            }}
          >
            {/* Outer Thick Glowing Beam */}
            <polyline
              points={[lazerPos, ...laserPath].map(pt => `${pt.c * 100 + 50},${pt.r * 100 + 50}`).join(' ')}
              fill="none"
              stroke={laserColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.55"
              style={{ filter: `drop-shadow(0 0 8px ${laserColor})` }}
            />
            {/* Core Bright Beam Line */}
            <polyline
              points={[lazerPos, ...laserPath].map(pt => `${pt.c * 100 + 50},${pt.r * 100 + 50}`).join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
          </svg>
        )}

        {board.map((row, r) =>
          row.map((block, c) => {
            const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
            const reachableInfo = reachableCells.find(cell => cell.r === r && cell.c === c);

            return (
              <Cell
                key={`${r}-${c}`}
                r={r}
                c={c}
                block={block}
                isSelected={isSelected}
                onClick={() => handleCellClick(r, c)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, r, c)}
                rotateBlock={rotateBlock}
                removeBlock={removeBlock}
                showControls={isSelected && isLocalTurn && phase === 'playing'}
                blockState="neutral"
                isReachable={!!reachableInfo}
                reachableDist={reachableInfo ? reachableInfo.dist : 0}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
