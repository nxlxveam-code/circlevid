const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const Video = require('../models/Video');
const Guest = require('../models/Guest');
const Notification = require('../models/Notification');
const { uploadFile } = require('../utils/storage');
const { weightedRandom } = require('../utils/weightedRandom');

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  },
});

// ─── POST /api/register ───────────────────────────────────────────────────────
// Create or retrieve a guest session
router.post('/register', async (req, res) => {
  try {
    let { guestId } = req.body;

    if (guestId) {
      const existing = await Guest.findOne({ guestId });
      if (existing) {
        existing.lastSeenAt = new Date();
        await existing.save();
        return res.json({
          guestId: existing.guestId,
          viewsRemaining: existing.viewsRemaining,
          hasUploaded: existing.uploadedVideos.length > 0,
        });
      }
    }

    // Create new guest
    const newGuest = new Guest({ guestId: uuidv4() });
    await newGuest.save();

    return res.json({
      guestId: newGuest.guestId,
      viewsRemaining: 0,
      hasUploaded: false,
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/upload/start ───────────────────────────────────────────────────
// Start an upload optimistically, giving the user views instantly
router.post('/upload/start', async (req, res) => {
  try {
    const { guestId } = req.body;
    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    const token = uuidv4();
    guest.startUploadTx(token);
    await guest.save();

    return res.json({ token, viewsRemaining: guest.viewsRemaining });
  } catch (err) {
    console.error('[upload/start]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/upload/cancel ──────────────────────────────────────────────────
// Front-end explicitly cancels an upload (e.g. compression failed)
router.post('/upload/cancel', async (req, res) => {
  try {
    const { guestId, token } = req.body;
    if (!guestId || !token) return res.status(400).json({ error: 'Missing params' });

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    const penalized = guest.penalizeTx(token);
    if (penalized) await guest.save();

    return res.json({ success: true, viewsRemaining: guest.viewsRemaining });
  } catch (err) {
    console.error('[upload/cancel]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/upload ─────────────────────────────────────────────────────────
// Upload a compressed video file
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const { guestId, duration, comment, token } = req.body;

    if (!guestId || !req.file) {
      return res.status(400).json({ error: 'Missing guestId or video file' });
    }

    const dur = parseFloat(duration);
    const minDur = parseInt(process.env.MIN_DURATION || 15);
    const maxDur = parseInt(process.env.MAX_DURATION || 45);

    if (isNaN(dur) || dur < minDur || dur > maxDur) {
      return res.status(400).json({
        error: `Video duration must be between ${minDur} and ${maxDur} seconds`,
      });
    }

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    // Upload to cloud storage
    const videoId = uuidv4();
    const ext = req.file.mimetype === 'video/webm' ? 'webm' : 'mp4';
    const storageKey = `videos/${videoId}.${ext}`;
    const publicUrl = await uploadFile(storageKey, req.file.buffer, req.file.mimetype);

    // Save video record
    const video = new Video({
      videoId,
      guestId,
      storageKey,
      publicUrl,
      duration: dur,
      comment: (comment || '').substring(0, 200),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
    await video.save();

    // Finalize upload transaction (removes pending, resets history)
    guest.uploadedVideos.push(videoId);
    if (token) {
      guest.finishUploadTx(token);
    } else {
      // Fallback if token wasn't provided (e.g. old client)
      guest.grantViewsForUpload();
      guest.resetViewHistory();
    }
    await guest.save();

    return res.json({
      videoId,
      publicUrl,
      viewsRemaining: guest.viewsRemaining,
      message: `Video uploaded! You earned ${process.env.VIEWS_PER_UPLOAD || 5} views.`,
    });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ─── GET /api/get-video ───────────────────────────────────────────────────────
// Get next video for the feed (weighted random, no repeats)
router.get('/get-video', async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    // Mark active and reap any stale pending uploads
    guest.lastSeenAt = new Date();
    guest.reapStaleUploadsTx();
    await guest.save();

    const totalVideos = await Video.countDocuments();
    // Активные пользователи за последние 15 минут
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    let online = await Guest.countDocuments({ lastSeenAt: { $gte: fifteenMinsAgo } });
    if (online < 1) online = 1;
    
    const globalStats = { totalVideos, online };

    if (guest.viewsRemaining <= 0) {
      return res.status(403).json({
        error: 'No views remaining. Upload a video to earn more views.',
        code: 'NO_VIEWS',
        globalStats
      });
    }

    // Fetch eligible videos: not hidden, not from this guest, not yet viewed
    const excludeIds = [
      ...guest.viewedVideoIds,
      ...guest.uploadedVideos,
    ];

    let candidates = await Video.find({
      isHidden: false,
      videoId: { $nin: excludeIds },
    }).lean();

    // Self-healing: if file was manually deleted from uploads folder, remove from DB
    const fs = require('fs').promises;
    const path = require('path');
    
    // Evaluate candidates in parallel asynchronously
    const validCandidates = (await Promise.all(
      candidates.map(async (c) => {
        if ((!process.env.STORAGE_PROVIDER || process.env.STORAGE_PROVIDER === 'local') && c.storageKey) {
          const fp = path.join(__dirname, '../../uploads', c.storageKey);
          try {
            await fs.access(fp);
            return c;
          } catch (e) {
            await Video.deleteOne({ videoId: c.videoId });
            return null;
          }
        }
        return c;
      })
    )).filter(Boolean);

    candidates = validCandidates;

    if (candidates.length === 0) {
      // If all watched, reset history and try again
      if (guest.viewedVideoIds.length > 0) {
        guest.viewedVideoIds = [];
        await guest.save();
        return res.json({ code: 'RESET', message: 'Feed reset, try again', globalStats });
      }
      return res.status(404).json({ error: 'No videos available yet', code: 'EMPTY', globalStats });
    }

    // Weighted selection
    const weighted = candidates.map((v) => {
      let weight;
      if (v.isBoost) weight = 5;
      else if (v.score > 5) weight = 3;
      else if (v.score >= 0) weight = 1;
      else weight = 0.3;
      return { item: v, weight };
    });

    const selected = weightedRandom(weighted);

    // Consume one view
    guest.consumeView();
    guest.viewedVideoIds.push(selected.videoId);
    await guest.save();

    // Increment view count on video
    await Video.updateOne({ videoId: selected.videoId }, { $inc: { views: 1 } });

    // Check if boost should be removed
    if (selected.isBoost && selected.views + 1 >= parseInt(process.env.BOOST_VIEWS || 10)) {
      await Video.updateOne({ videoId: selected.videoId }, { isBoost: false });
    }

    return res.json({
      video: {
        videoId: selected.videoId,
        url: selected.publicUrl,
        duration: selected.duration,
        comment: selected.comment,
        score: selected.score,
        likes: selected.likes || 0,
        dislikes: selected.dislikes || 0,
      },
      viewsRemaining: guest.viewsRemaining,
      giftsBalance: guest.giftsBalance,
      totalLikesReceived: guest.totalLikesReceived,
      globalStats,
    });
  } catch (err) {
    console.error('[get-video]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/vote ───────────────────────────────────────────────────────────
// Like or dislike a video
router.post('/vote', async (req, res) => {
  try {
    const { guestId, videoId, vote } = req.body;

    if (!guestId || !videoId || !['like', 'dislike'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    let update = {};
    const existingVote = guest.votes.get(videoId);

    if (existingVote) {
      if (existingVote === vote) {
        // User swiped the same way again (e.g. repeated encounter). Silently accept.
        const v = await Video.findOne({ videoId });
        return res.json({
          score: v.score,
          likes: v.likes,
          dislikes: v.dislikes,
          isHidden: v.isHidden,
        });
      }
      
      // User changed their vote
      update = vote === 'like'
        ? { $inc: { likes: 1, dislikes: -1 } }
        : { $inc: { likes: -1, dislikes: 1 } };
        
    } else {
      // First time voting
      update = vote === 'like'
        ? { $inc: { likes: 1 } }
        : { $inc: { dislikes: 1 } };
    }

    // Record vote on guest
    guest.votes.set(videoId, vote);
    await guest.save();

    const video = await Video.findOneAndUpdate({ videoId }, update, { new: true });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Gift economy: Award gifts if likes reach threshold
    if (vote === 'like' && existingVote !== 'like') {
      // A new like was added
      const author = await Guest.findOne({ guestId: video.guestId });
      if (author) {
        author.totalLikesReceived += 1;
        if (author.totalLikesReceived > author.maxLikesReceived) {
          author.maxLikesReceived = author.totalLikesReceived;
          if (author.maxLikesReceived > 0 && author.maxLikesReceived % 300 === 0) {
            author.giftsBalance += 1;
          }
        }
        await author.save();
      }
    } else if (vote === 'dislike' && existingVote === 'like') {
      // Like was removed
      const author = await Guest.findOne({ guestId: video.guestId });
      if (author) {
        author.totalLikesReceived -= 1;
        await author.save();
      }
    }

    // Recalculate score and check visibility
    video.score = video.likes - video.dislikes;
    const threshold = parseInt(process.env.HIDE_SCORE_THRESHOLD || -10);
    if (video.score <= threshold) video.isHidden = true;
    await video.save();

    return res.json({
      score: video.score,
      likes: video.likes,
      dislikes: video.dislikes,
      isHidden: video.isHidden,
    });
  } catch (err) {
    console.error('[vote]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/stats ───────────────────────────────────────────────────────────
// Get guest stats
router.get('/stats', async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    const guest = await Guest.findOne({ guestId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    if (guest.reapStaleUploadsTx()) {
      await guest.save();
    }

    const unreadCount = await Notification.countDocuments({ recipientId: guestId, isRead: false });

    return res.json({
      viewsRemaining: guest.viewsRemaining,
      totalViewsEarned: guest.totalViewsEarned,
      uploadedCount: guest.uploadedVideos.length,
      viewedCount: guest.viewedVideoIds.length,
      giftsBalance: guest.giftsBalance,
      totalLikesReceived: guest.totalLikesReceived,
      unreadCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/gift ───────────────────────────────────────────────────────────
// Send a gift with a message
router.post('/gift', async (req, res) => {
  try {
    const { guestId, videoId, message } = req.body;
    if (!guestId || !videoId || !message) return res.status(400).json({ error: 'Missing parameters' });

    const sender = await Guest.findOne({ guestId });
    if (!sender) return res.status(404).json({ error: 'Sender not found' });
    
    if (sender.giftsBalance <= 0) {
      return res.status(403).json({ error: 'No gifts available' });
    }

    const video = await Video.findOne({ videoId });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Deduct gift
    sender.giftsBalance -= 1;
    await sender.save();

    // Create notification
    const notification = new Notification({
      recipientId: video.guestId,
      senderId: guestId,
      videoId: videoId,
      message: message.substring(0, 200),
    });
    await notification.save();

    return res.json({ success: true, giftsBalance: sender.giftsBalance });
  } catch (err) {
    console.error('[gift]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/notifications ───────────────────────────────────────────────────
// Get all notifications for a guest
router.get('/notifications', async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    const notifications = await Notification.find({ recipientId: guestId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ notifications });
  } catch (err) {
    console.error('[notifications]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/notifications/read ─────────────────────────────────────────────
// Mark notifications as read
router.post('/notifications/read', async (req, res) => {
  try {
    const { guestId } = req.body;
    if (!guestId) return res.status(400).json({ error: 'Missing guestId' });

    await Notification.updateMany({ recipientId: guestId, isRead: false }, { isRead: true });
    return res.json({ success: true });
  } catch (err) {
    console.error('[notifications/read]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
