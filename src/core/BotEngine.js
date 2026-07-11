import { EasyStrategy, MediumStrategy, HardStrategy, generateThreatMap, getBoardAnalysis } from './BotStrategies';

// --- MAIN ROUTERS ---

export function getBotSetupAction(board, phase, playerColor, difficulty = 'medium', challengedPiece = null) {
  if (difficulty === 'easy') return EasyStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  if (difficulty === 'medium') return MediumStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  if (difficulty === 'hard') return HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  
  return null;
}

export function getBotPlayAction(board, role, actionPoints, difficulty = 'medium', gameState = null, botPlayer = null) {
  if (actionPoints <= 0) return null;

  if (difficulty === 'easy') return EasyStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'medium') return MediumStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'hard') return HardStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);

  return null;
}

export { generateThreatMap, getBoardAnalysis };
