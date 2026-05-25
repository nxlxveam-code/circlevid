import { useState } from 'react';
import { sendGift } from '../services/api';

export default function SendGiftModal({ videoId, giftsBalance, totalLikesReceived, onClose, onSuccess }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSend = giftsBalance > 0;
  const likesNeeded = 300 - (totalLikesReceived % 300);

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Напишите сообщение');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await sendGift(videoId, message);
      onSuccess(res.giftsBalance);
    } catch (err) {
      setError(err.message || 'Ошибка отправки подарка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Отправить Подарок 🎁</h2>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="sheet-content">
          {!canSend ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon" style={{ fontSize: 48 }}>🔒</div>
              <div className="empty-title">Нет доступных подарков</div>
              <div className="empty-sub" style={{ fontSize: 15, marginTop: 10 }}>
                Подарки выдаются за каждые 300 лайков на ваших видео.
                <br /><br />
                Вам нужно еще <b>{likesNeeded}</b> лайков для получения следующего подарка!
                <br /><br />
                Всего получено лайков: {totalLikesReceived}
              </div>
            </div>
          ) : (
            <div className="gift-form">
              <div className="gift-balance">
                Доступно подарков: <b>{giftsBalance}</b>
              </div>
              <p className="gift-desc">
                Подарок будет отправлен автору этого кружочка вместе с вашим личным сообщением.
              </p>
              
              <textarea
                className="gift-textarea"
                placeholder="Напишите приятное сообщение..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={200}
                disabled={loading}
              />
              
              {error && <div className="gift-error">{error}</div>}
              
              <button 
                className="btn btn-primary gift-submit-btn" 
                onClick={handleSend}
                disabled={loading || !message.trim()}
              >
                {loading ? 'Отправка...' : 'Подарить 🎁'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
