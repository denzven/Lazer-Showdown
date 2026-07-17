/**
 * BotEngine.js — Main thread router for all bot actions (Phase 4b)
 *
 * Architecture:
 *  - Easy / Medium / Hard / GA play actions → dispatched to BotWorker (Web Worker)
 *    keeping the main React thread free during depth-3 search.
 *  - Setup actions → remain synchronous (called inside 2500ms timeouts, not time-critical).
 *  - If the Worker fails or is unavailable, a synchronous fallback is used transparently.
 */

import { EasyStrategy, MediumStrategy, HardStrategy, GAStrategy, CUSTOM_STRATEGIES, generateThreatMap, generateExpectiminimaxThreatMap, getBoardAnalysis, generatePossibilityWeb } from './BotStrategies.js';

// --- WEB WORKER SINGLETON ---
// Created once, reused for the entire session. Destroyed and recreated on fatal errors.

let _botWorker = null;
let _pendingRequests = new Map(); // requestId → { resolve, reject }
let _requestId = 0;

function getBotWorker() {
  if (!_botWorker) {
    try {
      _botWorker = new Worker(new URL('./BotWorker.js', import.meta.url), { type: 'module' });

      _botWorker.onmessage = (e) => {
        const { requestId, result, error } = e.data;
        const pending = _pendingRequests.get(requestId);
        if (!pending) return;
        _pendingRequests.delete(requestId);
        if (error) pending.reject(new Error(error));
        else pending.resolve(result);
      };

      _botWorker.onerror = (e) => {
        console.error('[BotWorker] Fatal error:', e.message);
        // Reject all in-flight requests so callers can fall back synchronously
        for (const [, pending] of _pendingRequests) {
          pending.reject(new Error(`BotWorker crashed: ${e.message}`));
        }
        _pendingRequests.clear();
        _botWorker = null; // Force recreation on next call
      };
    } catch (err) {
      // Web Workers may be unavailable in some environments (e.g. restricted iframes)
      console.warn('[BotEngine] Could not create Web Worker, using main-thread fallback.', err);
      return null;
    }
  }
  return _botWorker;
}

/**
 * Sends a message to the Worker and returns a Promise that resolves with the result.
 * If the Worker is unavailable, returns null so callers know to fall back.
 */
function dispatchToWorker(type, payload) {
  const worker = getBotWorker();
  if (!worker) return null; // Signal: worker unavailable, use sync fallback

  const id = ++_requestId;
  return new Promise((resolve, reject) => {
    _pendingRequests.set(id, { resolve, reject });
    try {
      worker.postMessage({ type, requestId: id, ...payload });
    } catch (err) {
      _pendingRequests.delete(id);
      reject(err);
    }
  });
}

// --- SYNCHRONOUS FALLBACK HELPERS ---

function syncPlayAction(board, role, actionPoints, difficulty, gameState, botPlayer) {
  if (difficulty === 'easy')   return EasyStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'medium') return MediumStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'hard')   return HardStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'ga')     return GAStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (CUSTOM_STRATEGIES[difficulty]) {
    return CUSTOM_STRATEGIES[difficulty].getPlayAction(board, role, actionPoints, gameState, botPlayer);
  }
  return null;
}

// --- MAIN ROUTERS ---

/**
 * Setup actions are synchronous. They run inside 2500ms setTimeout delays in useGame.js
 * which gives ample headroom even for Hard's threat-map-aware placement.
 *
 * Phase 1f fix: Easy correctly uses EasyStrategy (was incorrectly using HardStrategy on L7).
 */
export function getBotSetupAction(board, phase, playerColor, difficulty = 'medium', challengedPiece = null, boardHeatmap = null) {
  if (difficulty === 'easy')   return EasyStrategy.getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap);
  if (difficulty === 'medium') return MediumStrategy.getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap);
  if (difficulty === 'hard')   return HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap);
  if (difficulty === 'ga')     return GAStrategy.getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap);
  if (CUSTOM_STRATEGIES[difficulty]) {
    return CUSTOM_STRATEGIES[difficulty].getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap);
  }
  return null;
}

/**
 * Play actions for math bots are dispatched to the Web Worker (Phase 4b).
 * The existing `await getBotPlayAction(...)` call in useGame.js L269 handles this transparently —
 * no changes needed to the hook.
 *
 * Fallback chain: Worker → sync main thread → null (end-turn)
 */
export async function getBotPlayAction(board, role, actionPoints, difficulty = 'medium', gameState = null, botPlayer = null) {
  if (actionPoints <= 0) return null;

  // Bypass Web Worker for dynamically registered custom bots
  if (!['easy', 'medium', 'hard', 'ga'].includes(difficulty)) {
    return syncPlayAction(board, role, actionPoints, difficulty, gameState, botPlayer);
  }

  // Dispatch to Worker for math bots (Easy / Medium / Hard)
  const workerPromise = dispatchToWorker('PLAY_ACTION', { board, role, actionPoints, difficulty, gameState, botPlayer });

  if (workerPromise) {
    try {
      return await workerPromise;
    } catch (err) {
      console.warn('[BotEngine] Worker dispatch failed, falling back to main thread:', err.message);
      return syncPlayAction(board, role, actionPoints, difficulty, gameState, botPlayer);
    }
  }

  // Worker unavailable — run synchronously on main thread
  return syncPlayAction(board, role, actionPoints, difficulty, gameState, botPlayer);
}

export async function getBoardAnalysisAsync(board, role, difficulty, gameState, botPlayer) {
  const diffToUse = difficulty === 'ga' ? 'hard' : difficulty;
  const attackerMathAnalysis = getBoardAnalysis(board, 'attacker', diffToUse, gameState, botPlayer);
  const defenderMathAnalysis = getBoardAnalysis(board, 'defender', diffToUse, gameState, botPlayer);
  
  const res = role === 'attacker' ? attackerMathAnalysis : defenderMathAnalysis;
  return { 
    ...res, 
    attackerMathScore: attackerMathAnalysis.totalScore,
    defenderMathScore: defenderMathAnalysis.totalScore
  };
}

export async function getBotEngineLinesAsync(board, role, actionPoints, difficulty, gameState) {
  const { getEngineLines } = await import('./BotStrategies');
  const diffToUse = difficulty === 'ga' ? 'hard' : difficulty;
  return getEngineLines(board, role, diffToUse, gameState);
}

export function getBotChallengeAction(board, gameState, botPlayer, difficulty) {
  if (difficulty === 'easy')   return EasyStrategy.getChallengeAction ? EasyStrategy.getChallengeAction(board, gameState, botPlayer) : null;
  if (difficulty === 'medium') return MediumStrategy.getChallengeAction ? MediumStrategy.getChallengeAction(board, gameState, botPlayer) : null;
  if (difficulty === 'hard')   return HardStrategy.getChallengeAction ? HardStrategy.getChallengeAction(board, gameState, botPlayer) : null;
  if (difficulty === 'ga')     return GAStrategy.getChallengeAction ? GAStrategy.getChallengeAction(board, gameState, botPlayer) : null;
  if (CUSTOM_STRATEGIES[difficulty]) {
    return CUSTOM_STRATEGIES[difficulty].getChallengeAction ? CUSTOM_STRATEGIES[difficulty].getChallengeAction(board, gameState, botPlayer) : null;
  }
  return null;
}

export async function analyzeBoardAsync(board, deep = false) {
  const promise = dispatchToWorker('ANALYZE_BOARD', { board, deep });
  if (promise) {
    try {
      const result = await promise;
      return result.heatmap;
    } catch (e) {
      console.error('[BotEngine] Async board analysis failed, falling back to sync', e);
    }
  }
  // Sync fallback
  return deep ? generateExpectiminimaxThreatMap(board, 1) : generateThreatMap(board, true);
}

export { generateThreatMap, getBoardAnalysis, generatePossibilityWeb };
