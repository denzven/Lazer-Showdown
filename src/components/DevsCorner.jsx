import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, Award, HelpCircle, Terminal, 
  RefreshCw, ChevronLeft, ArrowRight, Info, AlertTriangle, CheckCircle 
} from 'lucide-react';
import { 
  EasyStrategy, MediumStrategy, HardStrategy, GAStrategy, CUSTOM_STRATEGIES,
  getBoardState, getPossibleActions, applyLightweightAction, getPieceThreatLevels,
  generateThreatMap, computeSafetySteps, bfsToNearestFiringCell, getReverseFiringCells,
  getChallengeRecommendation
} from '../core/BotStrategies';
import { BLOCK_TYPES, traceLaserBeam, validatePlacement, validateMovement } from '../core/Ruleset';
import { getInitialState, applySandboxAction } from '../core/GameState';
import { getBotSetupAction } from '../core/BotEngine';

export default function DevsCorner({ onBack, onStartSpectate, customBoards = [] }) {
  const [activeTab, setActiveTab] = useState('contract'); // 'contract', 'simulator', 'spectate'
  const [customBots, setCustomBots] = useState({ a: null, b: null });
  const [uploadStatus, setUploadStatus] = useState({ a: 'idle', b: 'idle' });
  const [error, setError] = useState(null);
  
  // Headless Tournament States
  const [selectedBots, setSelectedBots] = useState({
    easy: true,
    medium: true,
    hard: true,
    ga: true,
    customA: false,
    customB: false
  });
  const [gameCount, setGameCount] = useState(10);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Spectating Config
  const [specRed, setSpecRed] = useState('easy');
  const [specBlue, setSpecBlue] = useState('hard');

  const consoleEndRef = useRef(null);
  const simCancelRef = useRef(false);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Update selection availability based on custom bots upload
  useEffect(() => {
    setSelectedBots(prev => ({
      ...prev,
      customA: customBots.a ? prev.customA : false,
      customB: customBots.b ? prev.customB : false
    }));
  }, [customBots]);

  // Expose custom bots to spectating dropdowns
  useEffect(() => {
    if (customBots.a && specRed === 'easy') setSpecRed(customBots.a.id);
    if (customBots.b && specBlue === 'hard') setSpecBlue(customBots.b.id);
  }, [customBots]);

  const handleBotUpload = async (e, slot) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadStatus(prev => ({ ...prev, [slot]: 'parsing' }));

    try {
      const content = await file.text();

      // Expose LazerAI globally so the uploaded bot can resolve imports
      window.LazerAI = {
        BLOCK_TYPES,
        getBoardState,
        getPossibleActions,
        applyLightweightAction,
        traceLaserBeam,
        validatePlacement,
        validateMovement,
        generateThreatMap,
        getPieceThreatLevels,
        computeSafetySteps,
        bfsToNearestFiringCell,
        getReverseFiringCells
      };

      // Create a Blob from the Javascript code
      const blob = new Blob([content], { type: 'application/javascript' });
      const objectUrl = URL.createObjectURL(blob);

      // Dynamically import the module
      const module = await import(objectUrl);

      if (typeof module.getPlayAction !== 'function') {
        throw new Error("Module must export a 'getPlayAction(board, role, actionPoints, gameState, botPlayer)' function.");
      }

      const botName = file.name.replace('.js', '').substring(0, 15);
      const strategyId = `custom_${slot}_${Date.now()}`;

      // Write into the strategies registry
      CUSTOM_STRATEGIES[strategyId] = {
        getPlayAction: module.getPlayAction,
        getSetupAction: module.getSetupAction || ((board, phase, playerColor, challengedPiece) => {
          return HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
        })
      };

      setCustomBots(prev => ({
        ...prev,
        [slot]: { id: strategyId, name: botName, file }
      }));
      setUploadStatus(prev => ({ ...prev, [slot]: 'success' }));
    } catch (err) {
      console.error(err);
      setError(`Verification failed for Slot ${slot.toUpperCase()}: ${err.message}`);
      setUploadStatus(prev => ({ ...prev, [slot]: 'error' }));
    }
  };

  // Headless game simulation
  const simulateHeadlessGame = (bot1, bot2, gameIndex) => {
    const boards = customBoards.length > 0 ? customBoards.map(b => b.data) : [null];
    const boardData = boards[gameIndex % boards.length];
    
    let state = getInitialState(boardData);
    
    // Assign colors
    const color1 = Math.random() > 0.5 ? 'red' : 'blue';
    const color2 = color1 === 'red' ? 'blue' : 'red';
    
    const role1 = gameIndex % 2 === 0 ? 'attacker' : 'defender';
    
    state.roleRed = (role1 === 'attacker')
      ? (color1 === 'red' ? 'attacker' : 'defender')
      : (color1 === 'red' ? 'defender' : 'attacker');
    state.roleBlue = state.roleRed === 'attacker' ? 'defender' : 'attacker';
    
    const rollDie = () => Math.floor(Math.random() * 6) + 1;
    let turns = 0;
    const MAX_TURNS = 1000;
    
    const getBotPlay = (stratId, board, role, ap, s) => {
      if (stratId === 'easy') return EasyStrategy.getPlayAction(board, role, ap, s, 'easy');
      if (stratId === 'medium') return MediumStrategy.getPlayAction(board, role, ap, s, 'medium');
      if (stratId === 'hard') return HardStrategy.getPlayAction(board, role, ap, s, 'hard');
      if (stratId === 'ga') return GAStrategy.getPlayAction(board, role, ap, s, 'ga');
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getPlayAction(board, role, ap, s, stratId);
      return null;
    };
    
    const getBotSetup = (stratId, board, phase, color, chal) => {
      if (stratId === 'easy') return EasyStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'medium') return MediumStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'hard') return HardStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'ga') return GAStrategy.getSetupAction(board, phase, color, chal);
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getSetupAction(board, phase, color, chal);
      return null;
    };

    const getBotChallenge = (stratId, board, s, color) => {
      if (stratId === 'easy') return EasyStrategy.getChallengeAction ? EasyStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'medium') return MediumStrategy.getChallengeAction ? MediumStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'hard') return HardStrategy.getChallengeAction ? HardStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'ga') return GAStrategy.getChallengeAction ? GAStrategy.getChallengeAction(board, s, color) : null;
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getChallengeAction ? CUSTOM_STRATEGIES[stratId].getChallengeAction(board, s, color) : null;
      return null;
    };

    while (!state.winner && turns < MAX_TURNS) {
      turns++;
      
      if (state.phase === 'toss') {
        state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'red', state);
        state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'blue', state);
        if (state.phase === 'toss') continue;
      }
      if (state.phase === 'toss-result') {
        state = applySandboxAction(state.board, { type: 'toss-resolve' }, 'SYSTEM', state);
        continue;
      }
      if (state.phase === 'role-selection') {
        const tossWinnerColor = state.tossWinner.toLowerCase();
        const tossWinnerTargetRole = tossWinnerColor === color1 ? role1 : (role1 === 'attacker' ? 'defender' : 'attacker');
        state = applySandboxAction(state.board, { type: 'toss-select-role', role: tossWinnerTargetRole }, tossWinnerColor, state);
        continue;
      }
      if (state.phase === 'challenge-toss') {
        state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'red', state);
        state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'blue', state);
        state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'red', state);
        state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'blue', state);
        continue;
      }
      if (state.phase === 'challenge-toss-result') {
        state = applySandboxAction(state.board, { type: 'challenge-toss-resolve' }, 'system', state);
        continue;
      }
      
      const activeRole = state.phase === 'setup-defender' || state.phase === 'challenge-setup' ? 'defender' :
                         state.phase === 'setup-attacker' ? 'attacker' : state.turnPlayer;
      const activeColor = state.roleRed === activeRole ? 'red' : 'blue';
      const activeStrategy = activeColor === color1 ? bot1.id : bot2.id;
      
      if (state.phase === 'setup-defender' || state.phase === 'challenge-setup' || state.phase === 'setup-attacker') {
        let action = getBotSetup(activeStrategy, state.board, state.phase, activeColor, state.challengedPiece);
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'confirm-setup' }, activeColor.toLowerCase(), state);
        }
        continue;
      }
      
      if (state.phase === 'playing') {
        if (!state.hasRolledDice) {
          state = applySandboxAction(state.board, { type: 'end-roll', values: [rollDie(), rollDie()] }, activeColor.toLowerCase(), state);
          continue;
        }
        let action = null;
        if (state.actionPoints > 0) {
          action = getBotPlay(activeStrategy, state.board, activeRole, state.actionPoints, state);
        }
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'end-turn' }, activeColor.toLowerCase(), state);
        }
        continue;
      }
      
      if (state.phase === 'challenge-declaration') {
        const action = getBotChallenge(activeStrategy, state.board, state, activeColor);
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'declare-challenge', declare: false }, activeColor.toLowerCase(), state);
        }
        continue;
      }
    }
    
    if (!state.winner && turns >= MAX_TURNS) {
      const redScore = state.scores?.red || 0;
      const blueScore = state.scores?.blue || 0;
      if (redScore > blueScore) state.winner = 'red';
      else if (blueScore > redScore) state.winner = 'blue';
      else state.winner = 'draw';
    }
    
    const win1 = state.winner === color1;
    const win2 = state.winner === color2;
    const isDraw = state.winner === 'draw' || (!win1 && !win2);
    const score1 = state.scores?.[color1] || 0;
    const score2 = state.scores?.[color2] || 0;
    
    return { win1, win2, isDraw, score1, score2, turns };
  };

  const startHeadlessTournament = () => {
    // Collect checked bots
    const botsToRun = [];
    if (selectedBots.easy) botsToRun.push({ id: 'easy', name: 'Zlorooklp (Easy)' });
    if (selectedBots.medium) botsToRun.push({ id: 'medium', name: 'Lizbishmir (Medium)' });
    if (selectedBots.hard) botsToRun.push({ id: 'hard', name: 'Shahlzrmir (Hard)' });
    if (selectedBots.ga) botsToRun.push({ id: 'ga', name: 'GA-Bot (Tuned)' });
    if (selectedBots.customA && customBots.a) botsToRun.push({ id: customBots.a.id, name: `${customBots.a.name} (Custom A)` });
    if (selectedBots.customB && customBots.b) botsToRun.push({ id: customBots.b.id, name: `${customBots.b.name} (Custom B)` });

    if (botsToRun.length < 2) {
      setError('Select at least 2 bots to hold a tournament.');
      return;
    }

    setError(null);
    setIsSimulating(true);
    setSimProgress(0);
    setConsoleLogs([`🚀 INITIATING HEADLESS CHALLENGE TOURNAMENT: ${botsToRun.length} BOTS...`]);
    setLeaderboard([]);
    simCancelRef.current = false;

    // Create match pairs (round-robin)
    const matches = [];
    for (let i = 0; i < botsToRun.length; i++) {
      for (let j = i + 1; j < botsToRun.length; j++) {
        matches.push({ bot1: botsToRun[i], bot2: botsToRun[j] });
      }
    }

    // Init statistics
    const stats = {};
    for (const b of botsToRun) {
      stats[b.id] = { id: b.id, name: b.name, matchesPlayed: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, totalTurns: 0 };
    }

    const queue = [];
    for (const match of matches) {
      for (let g = 0; g < gameCount; g++) {
        queue.push({ match, gameIndex: g });
      }
    }

    let completed = 0;

    const runBatch = () => {
      if (simCancelRef.current) {
        setConsoleLogs(prev => [...prev, '⚠️ Simulation canceled by user.']);
        setIsSimulating(false);
        return;
      }

      if (completed >= queue.length) {
        // Tournament Finished - Generate Leaderboard
        const result = Object.values(stats).map(b => {
          const winRate = ((b.wins / b.matchesPlayed) * 100).toFixed(1);
          const avgScore = (b.totalScore / b.matchesPlayed).toFixed(1);
          const avgTurns = (b.totalTurns / b.matchesPlayed).toFixed(1);
          return {
            id: b.id,
            name: b.name,
            wins: b.wins,
            losses: b.losses,
            draws: b.draws,
            winRate: `${winRate}%`,
            avgScore,
            avgTurns
          };
        }).sort((a, b) => b.wins - a.wins);

        setLeaderboard(result);
        setConsoleLogs(prev => [...prev, '🎉 Headless tournament complete! Check the leaderboard below.']);
        setIsSimulating(false);
        return;
      }

      const task = queue[completed];
      const { bot1, bot2 } = task.match;
      
      const res = simulateHeadlessGame(bot1, bot2, task.gameIndex);

      // Update statistics
      stats[bot1.id].matchesPlayed++;
      stats[bot2.id].matchesPlayed++;
      stats[bot1.id].totalScore += res.score1;
      stats[bot2.id].totalScore += res.score2;
      stats[bot1.id].totalTurns += res.turns;
      stats[bot2.id].totalTurns += res.turns;

      let logMsg = '';
      if (res.win1) {
        stats[bot1.id].wins++;
        stats[bot2.id].losses++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] ${bot1.name} wins vs ${bot2.name} (Attacker: ${task.gameIndex % 2 === 0 ? bot1.name : bot2.name}, ${res.turns} turns, ${res.score1} vs ${res.score2} pts)`;
      } else if (res.win2) {
        stats[bot2.id].wins++;
        stats[bot1.id].losses++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] ${bot2.name} wins vs ${bot1.name} (Attacker: ${task.gameIndex % 2 === 0 ? bot1.name : bot2.name}, ${res.turns} turns, ${res.score2} vs ${res.score1} pts)`;
      } else {
        stats[bot1.id].draws++;
        stats[bot2.id].draws++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] DRAW: ${bot1.name} vs ${bot2.name} (${res.turns} turns, ${res.score1} vs ${res.score2} pts)`;
      }

      setConsoleLogs(prev => [...prev, logMsg]);
      completed++;
      setSimProgress(Math.round((completed / queue.length) * 100));

      setTimeout(runBatch, 5); // 5ms delay to let React paint
    };

    runBatch();
  };

  const getSelectableBots = () => {
    const list = [
      { id: 'easy', name: 'Zlorooklp (Easy)' },
      { id: 'medium', name: 'Lizbishmir (Medium)' },
      { id: 'hard', name: 'Shahlzrmir (Hard)' },
      { id: 'ga', name: 'GA-Bot (Tuned)' }
    ];
    if (customBots.a) list.push({ id: customBots.a.id, name: `${customBots.a.name} (Custom A)` });
    if (customBots.b) list.push({ id: customBots.b.id, name: `${customBots.b.name} (Custom B)` });
    return list;
  };

  return (
    <div className="lobby-container" style={{ alignItems: 'flex-start', padding: '40px 20px', minHeight: '100vh', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '850px', margin: '0 auto', padding: '40px 30px', position: 'relative' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button className="cyber-button" onClick={onBack} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ChevronLeft size={16} /> BACK TO CREDITS
          </button>
          <div style={{ textAlign: 'right' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '1.8rem', margin: 0 }}>DEV'S CORNER</h1>
            <p style={{ color: 'var(--neon-blue)', fontSize: '0.75rem', fontWeight: 'bold', margin: '2px 0 0 0', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Bot Arena & Sandbox</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', gap: '8px' }}>
          <button 
            className={`cyber-button ${activeTab === 'contract' ? 'blue' : ''}`}
            onClick={() => setActiveTab('contract')}
            style={{ borderBottom: activeTab === 'contract' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 20px', flex: 1 }}
          >
            <HelpCircle size={16} style={{ marginRight: '6px', display: 'inline' }} /> Bot Contract
          </button>
          <button 
            className={`cyber-button ${activeTab === 'simulator' ? 'blue' : ''}`}
            onClick={() => setActiveTab('simulator')}
            style={{ borderBottom: activeTab === 'simulator' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 20px', flex: 1 }}
          >
            <Terminal size={16} style={{ marginRight: '6px', display: 'inline' }} /> Headless Tournament
          </button>
          <button 
            className={`cyber-button ${activeTab === 'spectate' ? 'blue' : ''}`}
            onClick={() => setActiveTab('spectate')}
            style={{ borderBottom: activeTab === 'spectate' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 20px', flex: 1 }}
          >
            <Play size={16} style={{ marginRight: '6px', display: 'inline' }} /> Visual Spectator
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255, 42, 133, 0.08)', border: '1px solid var(--neon-red)', borderRadius: '8px', color: 'var(--neon-red)', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: Bot Contract & Guide */}
        {activeTab === 'contract' && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid var(--neon-blue)', background: 'rgba(0, 240, 255, 0.02)' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>🤖 Dynamic Custom Bot Loading</h3>
              <p>
                You can write your own bot strategies in JavaScript and upload them directly below! Custom bots run in a secure ES module context on the main thread and can access Lazer Showdown's physical evaluation and raycasting logic via a global helper namespace named <strong>LazerAI</strong>.
              </p>
            </div>

            {/* Upload Slots */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {/* Slot A */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CUSTOM BOT (SLOT A)</span>
                  {uploadStatus.a === 'success' && <span style={{ color: '#39ff14', fontSize: '0.75rem', fontWeight: 'bold' }}>VERIFIED</span>}
                </h4>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {customBots.a ? `Loaded: ${customBots.a.name}` : 'No custom bot uploaded.'}
                </div>
                <label className="cyber-button blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', justifySelf: 'flex-start', padding: '8px 16px', fontSize: '0.8rem', width: 'fit-content' }}>
                  <Upload size={14} /> UPLOAD JS FILE
                  <input type="file" accept=".js" onChange={(e) => handleBotUpload(e, 'a')} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Slot B */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CUSTOM BOT (SLOT B)</span>
                  {uploadStatus.b === 'success' && <span style={{ color: '#39ff14', fontSize: '0.75rem', fontWeight: 'bold' }}>VERIFIED</span>}
                </h4>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {customBots.b ? `Loaded: ${customBots.b.name}` : 'No custom bot uploaded.'}
                </div>
                <label className="cyber-button blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', justifySelf: 'flex-start', padding: '8px 16px', fontSize: '0.8rem', width: 'fit-content' }}>
                  <Upload size={14} /> UPLOAD JS FILE
                  <input type="file" accept=".js" onChange={(e) => handleBotUpload(e, 'b')} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Terminal size={18} /> API Skeleton & Contract Structure
              </h3>
              <p style={{ marginBottom: '12px' }}>
                Write your script as an ES module file and export the required functions. Access board parsing helpers, distance computations, and laser beam tracers directly from the global <code>LazerAI</code> object:
              </p>
              <pre style={{ padding: '16px', backgroundColor: '#07080e', border: '1px solid var(--border-color)', borderRadius: '8px', overflowX: 'auto', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--neon-blue)', tabSize: 2 }}>
{`// Example simple custom bot (MyBot.js)
const { getBoardState, getPossibleActions, applyLightweightAction, traceLaserBeam } = LazerAI;

export function getPlayAction(board, role, actionPoints, gameState, botPlayer) {
  const actions = getPossibleActions(board, role);
  if (actions.length === 0) return null;
  
  // Example heuristic: If Attacker, fire laser immediately if aligned, otherwise select a random move
  if (role === 'attacker') {
    const { lazerPos, lazerDir } = getBoardState(board);
    if (lazerPos) {
      const trace = traceLaserBeam(board, lazerPos, lazerDir);
      if (trace.hitPiece && ['block-20', 'block-30', 'block-50'].includes(trace.hitPiece.cell.type)) {
        return { type: 'laser-press' };
      }
    }
  }
  
  // Fallback: return a random legal action
  return actions[Math.floor(Math.random() * actions.length)];
}

export function getSetupAction(board, phase, playerColor, challengedPiece) {
  // Option to customize piece setup placement logic (optional)
  return null; // returning null falls back to the default placement evaluator
}`}
              </pre>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid #b15cff', background: 'rgba(177, 92, 255, 0.02)' }}>
              <h3 style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Info size={18} /> Submit Your Bot to the Galactic Leaderboard!
              </h3>
              <p>
                Think your strategy can beat the Expectiminimax GA bot? Fork our GitHub repository, register your bot file in `src/core/BotStrategies.js`, test it, and submit a <strong>Pull Request</strong>! If verified, your bot will be added as a selectable boss character in the official online release.
              </p>
              <a 
                href="https://github.com/denzven/Lazer-Showdown" 
                target="_blank" 
                rel="noreferrer" 
                className="cyber-button"
                style={{ marginTop: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: '#b15cff', color: '#b15cff' }}
              >
                GITHUB REPOSITORY <ArrowRight size={14} />
              </a>
            </div>
          </div>
        )}

        {/* TAB 2: Headless Tournament Simulator */}
        {activeTab === 'simulator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              
              {/* Bot Checklist */}
              <div className="glass-panel" style={{ flex: 1.5, minWidth: '300px', padding: '20px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', marginBottom: '12px' }}>1. CHOOSE PARTICIPANTS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedBots.easy} onChange={(e) => setSelectedBots(curr => ({ ...curr, easy: e.target.checked }))} />
                    <span>Zlorooklp (Easy Heuristic)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedBots.medium} onChange={(e) => setSelectedBots(curr => ({ ...curr, medium: e.target.checked }))} />
                    <span>Lizbishmir (Medium Evaluator)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedBots.hard} onChange={(e) => setSelectedBots(curr => ({ ...curr, hard: e.target.checked }))} />
                    <span>Shahlzrmir (Hard Depth-3)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedBots.ga} onChange={(e) => setSelectedBots(curr => ({ ...curr, ga: e.target.checked }))} />
                    <span>GA-Bot (Tuned Expectiminimax)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: customBots.a ? 'pointer' : 'not-allowed', opacity: customBots.a ? 1 : 0.5 }}>
                    <input type="checkbox" checked={selectedBots.customA} disabled={!customBots.a} onChange={(e) => setSelectedBots(curr => ({ ...curr, customA: e.target.checked }))} />
                    <span>Custom Bot A: {customBots.a ? customBots.a.name : '[Upload a file in Tab 1]'}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: customBots.b ? 'pointer' : 'not-allowed', opacity: customBots.b ? 1 : 0.5 }}>
                    <input type="checkbox" checked={selectedBots.customB} disabled={!customBots.b} onChange={(e) => setSelectedBots(curr => ({ ...curr, customB: e.target.checked }))} />
                    <span>Custom Bot B: {customBots.b ? customBots.b.name : '[Upload a file in Tab 1]'}</span>
                  </label>
                </div>
              </div>

              {/* Tournament Settings */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '220px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>2. CONFIGURATION</h3>
                
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Games per Matchup (even count):</label>
                  <input 
                    type="number" 
                    value={gameCount} 
                    onChange={(e) => setGameCount(Math.max(2, parseInt(e.target.value, 10) || 2))}
                    style={{ width: '100%', marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Bots alternate Attacker/Defender roles for fairness.</div>
                </div>

                {!isSimulating ? (
                  <button className="cyber-button blue" onClick={startHeadlessTournament} style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}>
                    <Play size={16} /> START CHALLENGE
                  </button>
                ) : (
                  <button className="cyber-button red" onClick={() => { simCancelRef.current = true; }} style={{ marginTop: 'auto', padding: '12px' }}>
                    ABORT SIMULATION
                  </button>
                )}
              </div>
            </div>

            {/* Simulation Log Console */}
            {(isSimulating || consoleLogs.length > 0) && (
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>TERMINAL OUTPUT LOG</span>
                  {isSimulating && <span style={{ color: 'var(--neon-blue)', fontSize: '0.8rem', animation: 'afkPulse 1s infinite' }}>SIMULATING: {simProgress}%</span>}
                </h3>
                
                {/* Progress bar */}
                {isSimulating && (
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${simProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--neon-red), var(--neon-blue))', transition: 'width 0.1s ease' }} />
                  </div>
                )}

                <div style={{ height: '220px', overflowY: 'auto', background: '#05060b', border: '1px solid rgba(0,240,255,0.15)', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#39ff14', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {consoleLogs.map((log, idx) => (
                    <div key={idx} style={{ opacity: log.includes('wins') || log.includes('complete') ? 1 : 0.7 }}>
                      {log}
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            )}

            {/* Leaderboard Result */}
            {leaderboard.length > 0 && (
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={18} /> TOURNAMENT FINAL LEADERBOARD
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>POS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>BOT NAME</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>WINS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>LOSSES</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>DRAWS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>WIN RATE</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>AVG SCORE</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>AVG TURNS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, idx) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: idx === 0 ? 'rgba(0,240,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold', color: idx === 0 ? 'var(--neon-blue)' : 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{row.name}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', color: '#39ff14', fontWeight: 'bold' }}>{row.wins}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--neon-red)' }}>{row.losses}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.7 }}>{row.draws}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', color: 'var(--neon-blue)' }}>{row.winRate}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.9 }}>{row.avgScore}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.7 }}>{row.avgTurns}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Visual Spectator Launcher */}
        {activeTab === 'spectate' && (
          <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', marginBottom: '10px', textAlign: 'center' }}>
              LAUNCH VISUAL SPECTATOR MODE
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center', maxWidth: '500px', lineHeight: '1.5' }}>
              Load the game board UI and watch the bots fight! Both players (Red & Blue) are controlled by AI, automatically rolling dice, deploying defensive blocks, rotating and firing the laser.
            </p>

            <div style={{ display: 'flex', gap: '24px', width: '100%', maxWidth: '550px', alignItems: 'center', margin: '15px 0' }}>
              {/* Red Bot selection */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--neon-red)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>RED PLAYER BOT:</label>
                <select 
                  value={specRed} 
                  onChange={(e) => setSpecRed(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--neon-red)', color: '#fff', borderRadius: '6px', fontWeight: 'bold' }}
                >
                  {getSelectableBots().map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '20px' }}>VS</div>

              {/* Blue Bot selection */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>BLUE PLAYER BOT:</label>
                <select 
                  value={specBlue} 
                  onChange={(e) => setSpecBlue(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--neon-blue)', color: '#fff', borderRadius: '6px', fontWeight: 'bold' }}
                >
                  {getSelectableBots().map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button 
              className="cyber-button blue" 
              onClick={() => onStartSpectate(specRed, specBlue)}
              style={{ padding: '16px 36px', fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '1px', marginTop: '10px', animation: 'afkPulse 1.5s infinite' }}
            >
              LAUNCH LIVE SPECTATE <ArrowRight size={18} style={{ marginLeft: '8px', display: 'inline' }} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
