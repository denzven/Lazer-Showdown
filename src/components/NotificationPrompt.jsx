import React, { useState, useEffect } from 'react';
import { BellRing } from 'lucide-react';

export default function NotificationPrompt({ show = true }) {
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestAndTrigger = async () => {
    if (!('Notification' in window)) return;
    
    let currentPerm = Notification.permission;
    if (currentPerm === 'default') {
      currentPerm = await Notification.requestPermission();
      setPermission(currentPerm);
    }

    if (currentPerm === 'granted') {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        // Show a rich notification immediately as a test/demo
        // In a real game with a backend, this would be pushed from the server.
        registration.showNotification("Time for a Lazer Showdown! ⚡", {
          body: "Your alien rivals are waiting. Come play a quick match!",
          icon: "/pwa-192x192.png",
          image: "/Banner.png",
          badge: "/pwa-64x64.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          tag: "engagement-reminder",
          renotify: true,
          requireInteraction: true,
          actions: [
            { action: "play", title: "🤖 Play Match" }
          ]
        });
      }
    }
  };

  // Only show if we haven't asked yet and the browser supports it
  if (!show || permission === 'denied' || permission === 'granted' || !('Notification' in window)) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 10000,
      background: 'rgba(0, 255, 136, 0.1)',
      border: '1px solid var(--neon-green)',
      backdropFilter: 'blur(10px)',
      padding: '12px 16px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 0 15px rgba(0, 255, 136, 0.2)'
    }}>
      <div style={{ color: 'white', fontSize: '0.85rem' }}>
        <span>Enable match reminders?</span>
      </div>
      <button 
        onClick={requestAndTrigger}
        className="cyber-button"
        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}
      >
        <BellRing size={14} /> ENABLE
      </button>
    </div>
  );
}
