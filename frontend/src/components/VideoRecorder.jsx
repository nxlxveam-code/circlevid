import { useState, useRef, useEffect, useCallback } from 'react';

const MIN_SEC = 5;
const MAX_SEC = 45;

export default function VideoRecorder({ onRecorded, onCancel }) {
  const videoRef = useRef(null);
  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const [phase, setPhase] = useState('preview'); // preview | recording | review
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [blobData, setBlobData] = useState(null);
  const [error, setError] = useState(null);
  const [mimeType, setMimeType] = useState('video/webm;codecs=vp8,opus');
  const [comment, setComment] = useState('');

  // Start camera preview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play();
        }
      } catch (err) {
        if (!cancelled) setError('Нет доступа к камере. Разрешите доступ в браузере.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    // Pick supported codec
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const supported = types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
    setMimeType(supported);

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: supported, videoBitsPerSecond: 1_000_000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: supported });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setBlobData({ blob, mimeType: supported });
      setPhase('review');
    };

    mediaRecRef.current = recorder;
    recorder.start(250);
    setPhase('recording');
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed(s => {
        const next = s + 1;
        if (next >= MAX_SEC) stopRecording();
        return next;
      });
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    mediaRecRef.current?.stop();
    setPhase('stopped');
  }, []);

  const handleRetake = () => {
    URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlobData(null);
    setElapsed(0);
    setPhase('preview');
    // Restart camera
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play();
        }
      } catch { setError('Нет доступа к камере.'); }
    })();
  };

  const handleUse = () => {
    if (!blobData) return;
    if (elapsed < MIN_SEC) {
      setError(`Видео слишком короткое. Минимум ${MIN_SEC} секунд.`);
      return;
    }
    onRecorded({ blob: blobData.blob, mimeType: blobData.mimeType, duration: elapsed, comment });
  };

  const progress = Math.min((elapsed / MAX_SEC) * 100, 100);

  return (
    <div className="recorder-overlay">
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {phase === 'preview' && 'Нажмите ● для записи'}
            {phase === 'recording' && `Запись… ${MAX_SEC - elapsed}с`}
            {(phase === 'review' || phase === 'stopped') && 'Предпросмотр'}
          </span>
        </div>

        {/* Video viewport */}
        <div className="recorder-viewport">
          <div className="recorder-circle">
            {phase !== 'review' && phase !== 'stopped' ? (
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            ) : (
              <video src={blobUrl} playsInline autoPlay loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <div className={`recorder-ring ${phase === 'recording' ? 'recording' : ''}`} />
        </div>

        {/* Timer */}
        <div className="recorder-timer">
          {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
        </div>

        {/* Progress bar */}
        {phase === 'recording' && (
          <div className="recorder-progress" style={{ marginTop: 12 }}>
            <div className="recorder-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="recorder-hint" style={{ marginTop: 8, marginBottom: 10 }}>
          {phase === 'review' || phase === 'stopped'
            ? `Длительность: ${elapsed}с (мин. ${MIN_SEC}с)`
            : `${MIN_SEC}–${MAX_SEC} секунд`}
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 12, padding: '10px 16px', background: 'rgba(255,77,109,0.12)', border: '1px solid rgba(255,77,109,0.25)', borderRadius: 12, fontSize: 13, color: 'var(--dislike)', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Comment Input */}
        {(phase === 'review' || phase === 'stopped') && (
          <div style={{ width: 282, marginTop: 12 }}>
            <input
              type="text"
              className="preview-comment-input"
              placeholder="Комментарий (необязательно)"
              maxLength={200}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}

        {/* Controls */}
        <div className="recorder-controls" style={{ marginTop: 2 }}>
          {(phase === 'review' || phase === 'stopped') ? (
            <div className="stats-bar" style={{ marginTop: 10 }}>
              <button
                className="stat-badge pill-secondary"
                style={{ padding: 0, cursor: 'pointer', border: '1.5px solid var(--border-bright)', background: 'rgba(255,255,255,0.05)' }}
                onClick={handleRetake}
              >
                Переснять
              </button>
              <button
                className="stat-badge like-stat"
                style={{ padding: 0, cursor: 'pointer' }}
                onClick={handleUse}
                disabled={elapsed < MIN_SEC}
              >
                Использовать
              </button>
            </div>
          ) : (
            <>
              {phase === 'preview' && (
                <button className="record-btn" onClick={startRecording} aria-label="Начать запись">
                  <span className="dot" />
                </button>
              )}
              {phase === 'recording' && (
                <button className="record-btn recording" onClick={stopRecording} aria-label="Остановить запись">
                  <span className="dot" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
