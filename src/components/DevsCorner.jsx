import React from 'react';
import { ChevronLeft, Terminal, Grid } from 'lucide-react';
import BotDeveloperHub from './devs-corner/BotDeveloperHub';
import BoardEditor from './devs-corner/BoardEditor';

export default function DevsCorner({ 
  onBack, 
  onStartSpectate, 
  customBoards = [], 
  onImportBoard, 
  subMode = 'bot', 
  onSubModeChange, 
  activeTab = 'contract', 
  onTabChange 
}) {
  return (
    <div className="lobby-container" style={{ alignItems: 'flex-start', padding: '40px 20px', minHeight: '100vh', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '950px', margin: '0 auto', padding: '30px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ paddingBottom: '24px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button 
            className="cyber-button red" 
            onClick={onBack}
            style={{ padding: '8px', minHeight: 'auto' }}
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="glitch-text" style={{ margin: 0, fontSize: '1.4rem' }} data-text="DEV'S CORNER">DEV'S CORNER</h2>
        </div>

        {/* Top Navigation Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => onSubModeChange('bot')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: subMode === 'bot' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              color: subMode === 'bot' ? 'var(--neon-blue)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              boxShadow: subMode === 'bot' ? '0 0 10px rgba(0,240,255,0.2)' : 'none'
            }}
          >
            <Terminal size={16} /> BOT DEVELOPER HUB
          </button>
          
          <button
            onClick={() => onSubModeChange('editor')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: subMode === 'editor' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              color: subMode === 'editor' ? 'var(--neon-blue)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              boxShadow: subMode === 'editor' ? '0 0 10px rgba(0,240,255,0.2)' : 'none'
            }}
          >
            <Grid size={16} /> BOARD EDITOR
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '10px' }}>
        
        {/* SUB MODE: Bot Developer Hub */}
        {subMode === 'bot' && (
          <BotDeveloperHub 
            customBoards={customBoards}
            onImportBoard={onImportBoard}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onStartSpectate={onStartSpectate}
          />
        )}

        {/* SUB MODE: Board Layout Editor */}
        {subMode === 'editor' && (
          <BoardEditor customBoards={customBoards} />
        )}

      </div>
    </div>
    </div>
  );
}
