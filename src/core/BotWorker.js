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

import { EasyStrategy, MediumStrategy, HardStrategy, GAStrategy } from './BotStrategies.js';

self.onmessage = function (e) {
  const { type, requestId } = e.data;

  try {
    if (type === 'PLAY_ACTION') {
      const { board, role, actionPoints, difficulty, gameState, botPlayer } = e.data;
      let action = null;

      if (difficulty === 'easy') {
        action = EasyStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
      } else if (difficulty === 'medium') {
        action = MediumStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
      } else if (difficulty === 'hard') {
        action = HardStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
      } else if (difficulty === 'ga') {
        action = GAStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
      }

      self.postMessage({ requestId, result: action });

    } else if (type === 'SETUP_ACTION') {
      const { board, phase, playerColor, difficulty, challengedPiece } = e.data;
      let action = null;

      if (difficulty === 'easy') {
        action = EasyStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
      } else if (difficulty === 'medium') {
        action = MediumStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
      } else if (difficulty === 'hard') {
        action = HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
      } else if (difficulty === 'ga') {
        action = GAStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
      }

      self.postMessage({ requestId, result: action });

    } else {
      self.postMessage({ requestId, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ requestId, error: err.message || 'Unknown BotWorker error' });
  }
};
