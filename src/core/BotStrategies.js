/**
 * BotStrategies.js — Re-export portal facade aggregating all strategy engines and helpers (Phase 4b)
 */

import { EasyStrategy } from './EasyStrategy.js';
import { MediumStrategy } from './MediumStrategy.js';
import { HardStrategy } from './HardStrategy.js';
import { GAStrategy } from './GAStrategy.js';
import {
  DEFAULT_WEIGHTS,
  getBoardState,
  getPossibleActions,
  applyLightweightAction,
  getPieceValue,
  calculateMobility,
  calculateCenterControl,
  calculateMirrorUtilization,
  getPrimaryTarget,
  computeSafetySteps,
  getReverseFiringCells,
  bfsToNearestFiringCell,
  evaluateMediumAttacker,
  evaluateBoardAttacker,
  get2d6CumulativeProbability,
  get2d6ExactProbability,
  findOpponentMinScore,
  findBestActionSequenceExpectiminimax,
  evaluateMediumDefender,
  evaluateBoardDefender,
  findBestActionSequence,
  getCautiousness,
  getDefenderCautiousness,
  planReverseAttack,
  generatePossibilityWeb,
  generateThreatMap,
  generateExpectiminimaxThreatMap,
  classifyMove,
  getChallengeRecommendation,
  getPieceThreatLevels,
  classifyPlay,
  formatActionText,
  getEngineLines,
  getBoardAnalysis,
  genericSetupAction
} from './BotHelpers.js';

// Custom dynamic strategy registry
export const CUSTOM_STRATEGIES = {};

export {
  EasyStrategy,
  MediumStrategy,
  HardStrategy,
  GAStrategy,
  DEFAULT_WEIGHTS,
  getBoardState,
  getPossibleActions,
  applyLightweightAction,
  getPieceValue,
  calculateMobility,
  calculateCenterControl,
  calculateMirrorUtilization,
  getPrimaryTarget,
  computeSafetySteps,
  getReverseFiringCells,
  bfsToNearestFiringCell,
  evaluateMediumAttacker,
  evaluateBoardAttacker,
  get2d6CumulativeProbability,
  get2d6ExactProbability,
  findOpponentMinScore,
  findBestActionSequenceExpectiminimax,
  evaluateMediumDefender,
  evaluateBoardDefender,
  findBestActionSequence,
  getCautiousness,
  getDefenderCautiousness,
  planReverseAttack,
  generatePossibilityWeb,
  generateThreatMap,
  generateExpectiminimaxThreatMap,
  classifyMove,
  getChallengeRecommendation,
  getPieceThreatLevels,
  classifyPlay,
  formatActionText,
  getEngineLines,
  getBoardAnalysis,
  genericSetupAction
};
