import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export default function InstallPWA({ show = true }) {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsStandalone(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detect iOS for manual install instruction
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIosDevice && !window.navigator.standalone) {
      setIsIOS(true);
    }

    window.addEventListener('appinstalled', () => {
      setSupportsPWA(false);
      setIsStandalone(true);
      setPromptInstall(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClick = async () => {
    if (!promptInstall) return;
    promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    if (outcome === 'accepted') {
      setSupportsPWA(false);
    }
  };

  if (isStandalone) return null;

  if (!supportsPWA && !isIOS) return null;

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 10000,
      background: 'rgba(0, 240, 255, 0.1)',
      border: '1px solid var(--neon-blue)',
      backdropFilter: 'blur(10px)',
      padding: '12px 16px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 0 15px rgba(0, 240, 255, 0.2)'
    }}>
      <div style={{ color: 'white', fontSize: '0.85rem' }}>
        {isIOS ? (
          <span>To install, tap <b>Share</b> then <b>Add to Home Screen</b></span>
        ) : (
          <span>Install App for better experience</span>
        )}
      </div>
      {!isIOS && (
        <button 
          onClick={onClick}
          className="cyber-button"
          style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Download size={14} /> INSTALL
        </button>
      )}
    </div>
  );
}
