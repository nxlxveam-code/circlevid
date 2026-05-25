import { useState, useRef } from 'react';
import VideoRecorder from './VideoRecorder';

export default function UploadGate({ onVideoSelected, showToast }) {
  const [showRecorder, setShowRecorder] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [comment, setComment] = useState('');
  const fileInputRef = useRef(null);

  const handleProcessVideo = (blob, duration, textComment) => {
    onVideoSelected(blob, duration, textComment);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) { 
      showToast('Файл слишком большой (> 100 MB). Выберите файл поменьше.', 'error');
      return;
    }

    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const dur = Math.round(video.duration);
      if (dur < 5 || dur > 45) {
        window.URL.revokeObjectURL(objectUrl);
        showToast(`Длительность: ${dur}с. Разрешено от 5 до 45 секунд.`, 'error');
        return;
      }
      setPreviewFile({ file, dur });
      setPreviewUrl(objectUrl);
      setComment('');
    };
    video.src = objectUrl;
    e.target.value = ''; 
  };

  if (showRecorder) {
    return <VideoRecorder 
             onCancel={() => setShowRecorder(false)} 
             onRecorded={({ blob, duration, comment: recComment }) => {
               setShowRecorder(false);
               handleProcessVideo(blob, duration, recComment);
             }} 
           />;
  }

  if (previewFile) {
    return (
      <div className="recorder-overlay">
        <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          {/* Removed top back button and replaced with cleaner label */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Предпросмотр</span>
          </div>

          <div className="recorder-viewport">
            <div className="recorder-circle">
              <video src={previewUrl} playsInline autoPlay loop style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            </div>
          </div>
          
          <div style={{ width: 282, marginTop: 16 }}>
            <input 
              type="text" 
              placeholder="Комментарий (необязательно)" 
              maxLength={200}
              className="preview-comment-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div style={{ width: 282, marginTop: 12 }}>
            <input 
              type="text" 
              placeholder="Комментарий (необязательно)" 
              maxLength={200}
              className="preview-comment-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="stats-bar" style={{ marginTop: 2 }}>
            <button 
              className="stat-badge pill-secondary" 
              style={{ padding: 0, cursor: 'pointer', border: '1.5px solid var(--border-bright)', background: 'rgba(255,255,255,0.05)' }}
              onClick={() => { setPreviewFile(null); window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
            >
              Переснять
            </button>
            <button 
              className="stat-badge like-stat" 
              style={{ padding: 0, cursor: 'pointer' }}
              onClick={() => handleProcessVideo(previewFile.file, previewFile.dur, comment)}
            >
              Использовать
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-gate">
      <div className="gate-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </div>
      
      <h1 className="gate-title">Вход по видео</h1>
      <p className="gate-subtitle">
        Запиши кружочек, чтобы попасть в ленту и смотреть видео других пользователей
      </p>

      <div className="gate-rule">
        <span className="gate-rule-icon">👁️</span>
        <div>1 загруженное видео = 7 просмотров в ленте</div>
      </div>

      <div className="gate-actions">
        <button className="btn btn-primary" onClick={() => setShowRecorder(true)}>
          Записать кружочек (5–45 сек)
        </button>
        
        <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
          Выбрать из галереи
        </button>
        <input 
          type="file" 
          accept="video/*" 
          className="hidden-input" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
        />
      </div>
    </div>
  );
}
