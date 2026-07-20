/**
 * BotWorker.js — Dedicated Web Worker for bot computation (Phase 4a)
 *
 * Runs Easy / Medium / Hard strategy computation entirely off the main thread.
 * The main thread stays responsive during heavy Depth-3 searches (12-AP Hard turns
 * can involve ~512+ node evaluations, each with a full threat-map lookup).
 *
 * Message protocol:
 *   IN  → { type: 'PLAY_ACTION',  requestId, board, role, actionPoints, difficulty, gameState, botPlayer }
 *   IN  → { type: 'SETUP_ACTION', requestId, board, phase, playerColor, difficulty, challengedPiece }
 *   OUT ← { requestId, result: action | null }
 *   OUT ← { requestId, error: string }  (on failure)
 *
 * Both BotStrategies.js and Ruleset.js are pure JS with zero DOM dependencies — safe for workers.
 */

import { BUILTIN_STRATEGIES, generateThreatMap, generateExpectiminimaxThreatMap } from './BotStrategies.js';

self.onmessage = function (e) {
  const { type, requestId } = e.data;

  try {
    if (type === 'PLAY_ACTION') {
      const { board, role, actionPoints, difficulty, gameState, botPlayer } = e.data;
      let action = null;

      if (BUILTIN_STRATEGIES[difficulty]) {
        action = BUILTIN_STRATEGIES[difficulty].getPlayAction(board, role, actionPoints, gameState, botPlayer);
      }

      self.postMessage({ requestId, result: action });

    } else if (type === 'ANALYZE_BOARD') {
      const { board, deep } = e.data;
      
      let threatMap;
      if (deep) {
        threatMap = generateExpectiminimaxThreatMap(board, 1);
      } else {
        threatMap = generateThreatMap(board, true);
      }
      
      self.postMessage({ requestId, result: { heatmap: threatMap } });
      
    } else if (type === 'SETUP_ACTION') {
      const { board, phase, playerColor, difficulty, challengedPiece } = e.data;
      let action = null;

      if (BUILTIN_STRATEGIES[difficulty]) {
        action = BUILTIN_STRATEGIES[difficulty].getSetupAction(board, phase, playerColor, challengedPiece);
      }

      self.postMessage({ requestId, result: action });

    } else {
      self.postMessage({ requestId, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ requestId, error: err.message || 'Unknown BotWorker error' });
  }
};
