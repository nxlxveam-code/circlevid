const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  videoId: { type: String, required: true },
  message: { type: String, required: true, maxlength: 200 },
  isRead: { type: Boolean, default: false },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Notification', notificationSchema);
