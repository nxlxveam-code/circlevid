import { useState, useEffect } from 'react';
import { getNotifications, markNotificationsRead } from '../services/api';

export default function NotificationsModal({ onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.notifications || []);
      // Mark as read after a slight delay so they can see the "new" styling if we had any
      setTimeout(() => {
        markNotificationsRead().catch(console.error);
      }, 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Подарки и сообщения</h2>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="sheet-content">
          {loading ? (
            <div className="compress-spinner" style={{ margin: '40px auto' }}></div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-sub">У вас пока нет подарочных сообщений.</div>
            </div>
          ) : (
            <div className="notifications-list">
              {notifications.map(n => (
                <div key={n._id} className={`notification-item ${!n.isRead ? 'unread' : ''}`}>
                  <div className="notif-icon">🎁</div>
                  <div className="notif-body">
                    <p className="notif-msg">"{n.message}"</p>
                    <span className="notif-time">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
