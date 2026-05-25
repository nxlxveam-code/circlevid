const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

function getGuestId() {
  return localStorage.getItem('circlevid_guest_id');
}

function setGuestId(id) {
  localStorage.setItem('circlevid_guest_id', id);
}

async function request(method, path, body = null, isFormData = false) {
  const opts = {
    method,
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    body: body
      ? isFormData
        ? body
        : JSON.stringify(body)
      : undefined,
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code, status: res.status, globalStats: data.globalStats });
  return data;
}

export async function registerGuest() {
  const existing = getGuestId();
  const data = await request('POST', '/register', { guestId: existing });
  setGuestId(data.guestId);
  return data;
}

export async function startUploadTx() {
  const guestId = getGuestId();
  return request('POST', '/upload/start', { guestId });
}

export async function cancelUploadTx(token) {
  const guestId = getGuestId();
  return request('POST', '/upload/cancel', { guestId, token });
}

export async function uploadVideo(file, duration, comment, token, onProgress) {
  const guestId = getGuestId();
  const form = new FormData();
  form.append('video', file);
  form.append('guestId', guestId);
  form.append('duration', String(duration));
  if (comment) form.append('comment', comment);
  if (token) form.append('token', token);

  // Use XMLHttpRequest for upload progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}

export async function getNextVideo() {
  const guestId = getGuestId();
  return request('GET', `/get-video?guestId=${guestId}`);
}

export async function castVote(videoId, vote) {
  const guestId = getGuestId();
  return request('POST', '/vote', { guestId, videoId, vote });
}

export async function getStats() {
  const guestId = getGuestId();
  return request('GET', `/stats?guestId=${guestId}`);
}

export async function sendGift(videoId, message) {
  const guestId = getGuestId();
  return request('POST', '/gift', { guestId, videoId, message });
}

export async function getNotifications() {
  const guestId = getGuestId();
  return request('GET', `/notifications?guestId=${guestId}`);
}

export async function markNotificationsRead() {
  const guestId = getGuestId();
  return request('POST', '/notifications/read', { guestId });
}
