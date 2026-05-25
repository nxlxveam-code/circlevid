const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  guestId: {
    type: String,
    required: true,
    index: true,
  },
  // Storage
  storageKey: {
    type: String,
    required: true,
  },
  publicUrl: {
    type: String,
    required: true,
  },
  // Metadata
  comment: {
    type: String,
    default: '',
    maxlength: 200,
  },
  duration: {
    type: Number, // seconds
    required: true,
    min: 1,
    max: 120,
  },
  fileSize: {
    type: Number, // bytes
    required: true,
  },
  mimeType: {
    type: String,
    default: 'video/mp4',
  },
  // Engagement
  views: {
    type: Number,
    default: 0,
    index: true,
  },
  likes: {
    type: Number,
    default: 0,
  },
  dislikes: {
    type: Number,
    default: 0,
  },
  score: {
    type: Number,
    default: 0,
    index: true,
  },
  // Visibility
  isHidden: {
    type: Boolean,
    default: false,
    index: true,
  },
  isBoost: {
    type: Boolean,
    default: true, // New videos get boost
    index: true,
  },
}, {
  timestamps: true,
});

// Auto-calculate score on save
videoSchema.pre('save', function (next) {
  this.score = this.likes - this.dislikes;

  // Remove boost after 10 views
  if (this.views >= parseInt(process.env.BOOST_VIEWS || 10)) {
    this.isBoost = false;
  }

  // Auto-hide if score too low
  const threshold = parseInt(process.env.HIDE_SCORE_THRESHOLD || -10);
  if (this.score <= threshold) {
    this.isHidden = true;
  }

  next();
});

// Weighted score for feed algorithm
videoSchema.methods.getWeight = function () {
  if (this.isBoost) return 5; // Guaranteed high visibility
  if (this.score > 5) return 3;
  if (this.score >= 0) return 1;
  return 0.3; // Rarely shown
};

module.exports = mongoose.model('Video', videoSchema);
