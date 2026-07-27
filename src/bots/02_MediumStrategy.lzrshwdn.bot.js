// NAME: "Lizbishmir"
// AUTHOR: "LazerAI"
// STRAT: "Medium Evaluator"

import { 
  genericSetupAction,
  getDefenderCautiousness,
  getCautiousness,
  evaluateMediumAttacker,
  evaluateMediumDefender,
  findBestActionSequence,
  calculateMobility,
  applyLightweightAction
} from "../core/BotHelpers.js";

export function getSetupAction(board, phase, playerColor, challengedPiece, boardHeatmap) {
  return genericSetupAction(board, phase, playerColor, 'medium', challengedPiece, boardHeatmap);
}

export function getPlayAction(board, role, actionPoints, gameState, botPlayer) {
  const cautiousness = role === 'defender'
    ? getDefenderCautiousness(board)
    : getCautiousness(gameState, botPlayer);
  const evalFn = role === 'attacker' ? evaluateMediumAttacker : evaluateMediumDefender;
  const currentScore = evalFn(board, cautiousness);
  
  // Depth-1 optimal search
  const { bestAction, bestScore } = findBestActionSequence(board, role, 1, evalFn, cautiousness);
  
  if (bestAction && bestScore >= currentScore) {
    return bestAction;
  }
  
  // Accept up to -500 points move if it increases mobility (breaks local optima)
  if (bestAction && bestScore >= currentScore - 500) {
    const resultBoard = applyLightweightAction(board, bestAction);
    if (calculateMobility(resultBoard, role) > calculateMobility(board, role)) {
      return bestAction;
    }
  }
  return null;
}

export function getChallengeAction(board, gameState, playerColor) {
  const captured = gameState.capturedPieces || [];
  if (captured.length === 0) return { type: 'declare-challenge', declare: false };
  const roll = Math.random();
  if (roll < 0.15) return { type: 'declare-challenge', declare: false };
  let target = 'block-50';
  if (roll > 0.7) {
    const subOptimal = captured.filter(c => c !== 'block-50');
    target = subOptimal.length > 0 ? subOptimal[Math.floor(Math.random() * subOptimal.length)] : captured[0];
  } else {
    target = captured.includes('block-50') ? 'block-50' : captured.includes('block-30') ? 'block-30' : 'block-20';
  }
  return { type: 'declare-challenge', declare: true, pieceType: target };
}
