const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
  guestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Pending uploads for optimistic view updates
  pendingUploads: [{
    token: String,
    startedAt: { type: Date, default: Date.now }
  }],
  // Uploaded videos
  uploadedVideos: [{
    type: String, // videoId references
  }],
  // Videos seen – reset when new video is uploaded
  viewedVideoIds: [{
    type: String,
  }],
  // Votes cast: { videoId: 'like' | 'dislike' }
  votes: {
    type: Map,
    of: String,
    default: {},
  },
  // View economy
  viewsRemaining: {
    type: Number,
    default: 0,
  },
  totalViewsEarned: {
    type: Number,
    default: 0,
  },
  // Gift economy
  giftsBalance: {
    type: Number,
    default: 0,
  },
  totalLikesReceived: {
    type: Number,
    default: 0,
  },
  maxLikesReceived: {
    type: Number,
    default: 0,
  },
  // Last activity
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Grant views when a video is uploaded
guestSchema.methods.grantViewsForUpload = function () {
  const grant = parseInt(process.env.VIEWS_PER_UPLOAD || 5);
  this.viewsRemaining += grant;
  this.totalViewsEarned += grant;
};

// Consume one view, returns true if successful
guestSchema.methods.consumeView = function () {
  if (this.viewsRemaining <= 0) return false;
  this.viewsRemaining -= 1;
  return true;
};

// Reset viewed list when new video is uploaded
guestSchema.methods.resetViewHistory = function () {
  this.viewedVideoIds = [];
};

// Optimistic upload start
guestSchema.methods.startUploadTx = function (token) {
  this.pendingUploads.push({ token, startedAt: new Date() });
  this.grantViewsForUpload();
};

// Finish an upload successfully
guestSchema.methods.finishUploadTx = function (token) {
  this.pendingUploads = this.pendingUploads.filter(u => u.token !== token);
  this.resetViewHistory();
};

// Cancel an upload with penalty
guestSchema.methods.penalizeTx = function (token) {
  const exists = this.pendingUploads.find(u => u.token === token);
  if (!exists) return false;
  
  this.pendingUploads = this.pendingUploads.filter(u => u.token !== token);
  
  const grant = parseInt(process.env.VIEWS_PER_UPLOAD || 5);
  const penalty = grant + 2; // Soft penalty: clawback the grant + 2
  this.viewsRemaining -= penalty;
  if (this.viewsRemaining < -100) this.viewsRemaining = -100;
  return true;
};

// Sweep for abandoned uploads (e.g. user closed tab)
guestSchema.methods.reapStaleUploadsTx = function () {
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  let changed = false;
  
  const grant = parseInt(process.env.VIEWS_PER_UPLOAD || 5);
  const penalty = grant + 2;
  
  this.pendingUploads = this.pendingUploads.filter(u => {
    if (u.startedAt < fiveMinsAgo) {
      this.viewsRemaining -= penalty;
      changed = true;
      return false; // remove from array
    }
    return true; // keep
  });
  
  if (changed && this.viewsRemaining < -100) this.viewsRemaining = -100;
  return changed;
};

module.exports = mongoose.model('Guest', guestSchema);
