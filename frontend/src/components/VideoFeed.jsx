import { useState, useEffect, useRef } from 'react';
import { getNextVideo, castVote } from '../services/api';
import { useSwipe } from '../hooks/useSwipe';
import SendGiftModal from './SendGiftModal';

export default function VideoFeed({ showToast, viewsRemaining, setViewsRemaining, onRequestUpload }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Interaction state
  const [isMuted, setIsMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const [locked, setLocked] = useState(true); // Swipe lock for first 2 seconds
  const [globalStats, setGlobalStats] = useState({ online: 0, totalVideos: 0 });
  
  const [giftStats, setGiftStats] = useState({ balance: 0, likes: 0 });
  const [showGiftModal, setShowGiftModal] = useState(false);

  const videoElRef = useRef(null);

  // Fetch initial video
  useEffect(() => {
    loadNextVideo();
  }, []);

  const loadNextVideo = async () => {
    try {
      setLoading(true);
      setError(null);
      setLocked(true);
      const res = await getNextVideo();
      
      if (res.code === 'RESET') {
        if (res.globalStats) setGlobalStats(res.globalStats);
        return loadNextVideo();
      }

      setVideo(res.video);
      setViewsRemaining(res.viewsRemaining);
      if (res.globalStats) setGlobalStats(res.globalStats);
      if (res.giftsBalance !== undefined) {
        setGiftStats({ balance: res.giftsBalance, likes: res.totalLikesReceived });
      }
      
      // Auto-unlock swipe after 2 seconds
      setTimeout(() => setLocked(false), 2000);

    } catch (err) {
      setVideo(null);
      if (err.globalStats) {
        setGlobalStats(err.globalStats);
      }
      if (err.code === 'NO_VIEWS') {
        showToast('Просмотры закончились 😢', 'error');
        onRequestUpload(); // Out of views
      } else {
        setError(err.message || 'Ошибка загрузки видео');
      }
    } finally {
      setLoading(false);
      resetCard(false);
    }
  };

  const handleVote = async (voteType) => {
    if (!video) return;
    try {
      // Optimistic transition
      const currentVideoId = video.videoId;
      loadNextVideo(); // start loading next immediately
      
      // Send vote in background
      await castVote(currentVideoId, voteType);
    } catch (err) {
      showToast(err.message || 'Ошибка голосования', 'error');
    }
  };

  const { cardRef, handlers, flyOut, resetCard } = useSwipe({
    onLike: () => handleVote('like'),
    onDislike: () => handleVote('dislike'),
    locked,
  });

  useEffect(() => {
    const card = cardRef.current;
    const videoEl = videoElRef.current;
    if (!card || !videoEl) return;

    let scrubStartX = 0;
    let initialTime = 0;
    let isScrubbing = false;

    const updateRing = (ratio) => {
      const ring = document.getElementById('scrub-ring');
      if (ring) {
        ring.style.strokeDashoffset = 301.59 * (1 - ratio);
      }
    };

    const handleTimeUpdate = () => {
      if (!isScrubbing && videoEl.duration) {
        updateRing(videoEl.currentTime / videoEl.duration);
      }
    };

    const handleScrubStart = (e) => {
      isScrubbing = true;
      scrubStartX = e.detail.clientX;
      initialTime = videoEl.currentTime;
      videoEl.pause();
      card.classList.add('scrubbing-mode');
    };

    const handleScrubMove = (e) => {
      if (!isScrubbing || !videoEl.duration) return;
      const dx = e.detail.clientX - scrubStartX;
      const duration = videoEl.duration;
      const dragScale = 150;
      // Инвертированное направление перемотки
      let newTime = initialTime - (dx / dragScale) * duration;
      newTime = Math.max(0, Math.min(newTime, duration));
      videoEl.currentTime = newTime;
      updateRing(newTime / duration);
      
      const timeEl = document.getElementById('scrub-time');
      if (timeEl) {
        const s = Math.floor(newTime);
        timeEl.textContent = `0:${s.toString().padStart(2, '0')}`;
      }
    };

    const handleScrubEnd = () => {
      isScrubbing = false;
      card.classList.remove('scrubbing-mode');
      videoEl.play().catch(()=>{});
    };

    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    card.addEventListener('scrubstart', handleScrubStart);
    card.addEventListener('scrubmove', handleScrubMove);
    card.addEventListener('scrubend', handleScrubEnd);

    return () => {
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      card.removeEventListener('scrubstart', handleScrubStart);
      card.removeEventListener('scrubmove', handleScrubMove);
      card.removeEventListener('scrubend', handleScrubEnd);
    };
  }, [video, cardRef]);
  const toggleMute = () => {
    if (!videoElRef.current) return;
    const nextState = !videoElRef.current.muted;
    videoElRef.current.muted = nextState;
    setIsMuted(nextState);
    
    setShowMuteIcon(true);
    setTimeout(() => setShowMuteIcon(false), 800);
  };

  const renderStatsHeader = () => (
    <div className="global-stats-header">
      <div className="stat-item">
        <span className="live-dot"></span> Онлайн: {globalStats.online}
      </div>
      <div className="stat-divider">•</div>
      <div className="stat-item desc-item">
        Кружочков: {globalStats.totalVideos}
      </div>
      <div className="stat-divider">•</div>
      <div className="stat-item view-item" style={{ color: 'var(--accent-light)', fontWeight: 700 }} title="Доступные просмотры">
        👁️ {viewsRemaining}
      </div>
    </div>
  );

  if (error && error !== 'No videos available yet') {
    return (
      <div className="feed-container">
        {renderStatsHeader()}
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <div className="empty-title">Упс, ошибка</div>
          <div className="empty-sub">{error}</div>
          <button className="btn btn-outline" onClick={loadNextVideo}>Попробовать снова</button>
        </div>
      </div>
    );
  }

  if (!video && !loading) {
     return (
      <div className="feed-container">
        {renderStatsHeader()}
        <div className="empty-state">
          <div className="empty-icon">🏜️</div>
          <div className="empty-title">Видео закончились</div>
          <div className="empty-sub">Вы посмотрели все доступные видео. Загрузите новое видео, чтобы алгоритм обновился, или зайдите позже.</div>
          <button className="btn btn-primary" onClick={onRequestUpload}>Загрузить видео</button>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      {renderStatsHeader()}

      {/* Card Area */}
      <div className="card-stack">
        <div className="card-shadow" />
        
        {loading && !video && (
           <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <div className="compress-spinner" style={{ width: 40, height: 40 }} />
           </div>
        )}

        {video && (
          <div 
            className="swipe-card" 
            ref={cardRef} 
            {...handlers}
            onClick={(e) => {
              // Only toggle mute if not actively dragging
              if (!cardRef.current?.classList.contains('dragging')) {
                toggleMute();
              }
            }}
            style={{ overflow: 'visible' }}
          >
            <div className="video-inner-container" style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative' }}>
              <video 
                ref={videoElRef}
                src={video.url} 
                autoPlay 
                loop 
                muted={isMuted}
                playsInline
              />
              
              <svg className="scrub-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="48" className="scrub-bg" />
                <circle cx="50" cy="50" r="48" className="scrub-progress" id="scrub-ring" />
              </svg>

              <div className="scrub-time-overlay">
                <span id="scrub-time">0:00</span>
              </div>

              <div className="vote-overlay like">💚</div>
              <div className="vote-overlay dislike">👎</div>

              <div className={`mute-indicator ${showMuteIcon ? 'visible' : ''}`}>
                {isMuted ? '🔇' : '🔊'}
              </div>
            </div>


          </div>
        )}
      </div>

      {/* Video Comment (Stationary) */}
      {video && video.comment && (
        <div className="video-comment-block">
          <div className="comment-quote">“</div>
          <p>{video.comment}</p>
        </div>
      )}

      {/* Counters & Upload */}
      <div className="feed-actions-container">
        <div className="stats-bar">
          <div className="stat-badge like-stat">
            <span className="stat-icon">♡</span>
            {video ? video.likes : 0}
          </div>

          <div className="stat-badge dislike-stat">
            {video ? video.dislikes : 0}
            <span className="stat-icon">✕</span>
          </div>
        </div>

        <div className="bottom-actions-row">
          <button 
            className="feed-upload-btn" 
            onClick={onRequestUpload}
            title="Загрузить новое видео"
          >
            <span className="upload-icon">+</span> Загрузить кружочек
          </button>

          <button 
            className="feed-action-circle gift-btn" 
            onClick={() => setShowGiftModal(true)}
            title="Отправить подарок"
          >
            🎁
          </button>
        </div>
      </div>

      {showGiftModal && (
        <SendGiftModal 
          videoId={video.videoId}
          giftsBalance={giftStats.balance}
          totalLikesReceived={giftStats.likes}
          onClose={() => setShowGiftModal(false)}
          onSuccess={(newBalance) => {
            setShowGiftModal(false);
            setGiftStats(prev => ({ ...prev, balance: newBalance }));
            showToast('Подарок успешно отправлен!', 'success');
          }}
        />
      )}
    </div>
  );
}
