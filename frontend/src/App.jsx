import { useState, useEffect } from 'react';
import { registerGuest, getStats, uploadVideo, startUploadTx, cancelUploadTx } from './services/api';
import { compressVideo } from './utils/compress';
import { useToast } from './hooks/useToast';
import UploadGate from './components/UploadGate';
import VideoFeed from './components/VideoFeed';
import NotificationsModal from './components/NotificationsModal';
import './index.css';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [viewsRemaining, setViewsRemaining] = useState(0);
  const [viewState, setViewState] = useState('loading'); // loading | gate | feed
  const { toasts, show } = useToast();

  const [bgUploadTask, setBgUploadTask] = useState({ status: 'idle', progress: 0, msg: '' });
  const [feedKey, setFeedKey] = useState(0); 

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    initApp();

    // Live update polling for notifications and views balance
    const pollInterval = setInterval(refreshStats, 20000); // every 20 seconds
    return () => clearInterval(pollInterval);
  }, []);

  const refreshStats = async () => {
    try {
       const stats = await getStats();
       setViewsRemaining(stats.viewsRemaining);
       setUnreadCount(stats.unreadCount || 0);
    } catch (e) {
       console.error('Polling error:', e);
    }
  };

  const initApp = async () => {
    try {
      const data = await registerGuest();
      const stats = await getStats();
      
      setViewsRemaining(stats.viewsRemaining);
      setUnreadCount(stats.unreadCount || 0);

      if (stats.viewsRemaining > 0) {
        setViewState('feed');
      } else {
        setViewState('gate');
      }
    } catch (err) {
      show('Ошибка подключения к серверу. Сервер запущен?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const startBackgroundUpload = async (blob, duration, comment) => {
    let token = null;
    try {
      // 1. Optimistic start - instant views & feed access
      const tx = await startUploadTx();
      token = tx.token;
      setViewsRemaining(tx.viewsRemaining);
      setViewState('feed');
      setFeedKey(prev => prev + 1); // trigger feed reload to fetch videos

      setBgUploadTask({ status: 'compressing', progress: 0, msg: 'Сжатие...' });
      
      const { blob: compressedBlob } = await compressVideo(
        blob, 
        (p) => setBgUploadTask(prev => ({ ...prev, progress: Math.round(p) })),
        (msg) => setBgUploadTask(prev => ({ ...prev, msg }))
      );

      setBgUploadTask({ status: 'uploading', progress: 0, msg: 'Загрузка...' });
      
      const file = new File([compressedBlob], 'video.mp4', { type: 'video/mp4' });
      await uploadVideo(file, duration, comment, token, (p) => setBgUploadTask(prev => ({ ...prev, progress: Math.round(p) })));

      show('Кружочек успешно загружен! 🔥', 'success');
      
      const stats = await getStats();
      setViewsRemaining(stats.viewsRemaining);
      setBgUploadTask({ status: 'idle', progress: 0, msg: '' });

    } catch (err) {
      if (token) {
        try {
          const cancel = await cancelUploadTx(token);
          setViewsRemaining(cancel.viewsRemaining); // apply penalty
        } catch (e) {
          console.error(e);
        }
      }
      show(err.message || 'Сбой загрузки! Выписан штраф 😢', 'error');
      setBgUploadTask({ status: 'idle', progress: 0, msg: '' });
    }
  };

  if (loading || viewState === 'loading') {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="compress-spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <div className="logo-dot" />
          CircleVid
        </div>
        
        <div className="header-actions">
           <button className="bell-btn" onClick={() => setShowNotifs(true)}>
             <span className="bell-icon">🔔</span>
             {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
           </button>
        </div>
      </header>

      {/* Main Area */}
      <main className="main">
        {viewState === 'gate' ? (
          <UploadGate 
            onVideoSelected={(blob, duration, comment) => {
              startBackgroundUpload(blob, duration, comment);
            }} 
            showToast={show} 
          />
        ) : (
          <VideoFeed 
            key={feedKey}
            viewsRemaining={viewsRemaining}
            showToast={show} 
            setViewsRemaining={setViewsRemaining} 
            onRequestUpload={() => setViewState('gate')} 
          />
        )}

        {/* Фоновый индикатор загрузки */}
        {bgUploadTask.status !== 'idle' && (
          <div className="bg-upload-toast">
            <div className="bg-upload-info">
              <div className="compress-spinner" style={{width: 14, height: 14, borderWidth: 2, marginRight: 8}}></div>
              <span>{bgUploadTask.msg} {bgUploadTask.progress}%</span>
            </div>
            <div className="bg-upload-bar-wrap">
              <div className="bg-upload-bar" style={{ width: `${bgUploadTask.progress}%` }}></div>
            </div>
          </div>
        )}
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
             {t.message}
          </div>
        ))}
      </div>

      {showNotifs && (
        <NotificationsModal 
          onClose={() => {
            setShowNotifs(false);
            setUnreadCount(0); // optimistically update
          }} 
        />
      )}
    </div>
  );
}
