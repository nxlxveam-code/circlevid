import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

let ffmpegInstance = null;
let ffmpegLoaded = false;

async function getFFmpeg(onLog) {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    if (onLog) ffmpegInstance.on('log', ({ message }) => onLog(message));
  }
  if (!ffmpegLoaded) {
    // Load from local public folder (bypasses CDN CORS errors)
    const baseURL = '/ffmpeg';
    await ffmpegInstance.load({
      coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });
    ffmpegLoaded = true;
  }
  return ffmpegInstance;
}

/**
 * Compress a video blob to H.264 MP4, max 10 MB.
 * Returns { blob, duration }.
 */
export async function compressVideo(inputBlob, onProgress, onStatusMsg) {
  // If already small enough and is mp4, skip compression
  if (inputBlob.size <= MAX_BYTES && inputBlob.type === 'video/mp4') {
    onProgress?.(100);
    return { blob: inputBlob };
  }

  onStatusMsg?.('Загрузка компрессора…');
  const ffmpeg = await getFFmpeg();

  // Connect progress event so user sees 1%..99% instead of 0% freezing
  const progressCallback = ({ progress, time }) => {
    const p = Math.max(0, Math.min(Math.round(progress * 100), 100));
    onProgress?.(p);
  };
  ffmpeg.on('progress', progressCallback);

  try {
    const ext  = inputBlob.type.includes('webm') ? 'webm' : 'mp4';
    const inFile  = `input.${ext}`;
    const outFile = 'output.mp4';

    onStatusMsg?.('Обработка видео…');
    await ffmpeg.writeFile(inFile, await fetchFile(inputBlob));

    // Preset 'ultrafast' works significantly faster on WebAssembly!
    await ffmpeg.exec([
      '-i', inFile,
      '-vcodec', 'libx264',
      '-crf',    '28',
      '-preset', 'ultrafast',
      '-vf',     'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2',
      '-acodec', 'aac',
      '-b:a',    '96k',
      '-movflags', '+faststart',
      '-y', outFile,
    ]);

    onStatusMsg?.('Финализация…');
    const data = await ffmpeg.readFile(outFile);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    await ffmpeg.deleteFile(inFile);
    await ffmpeg.deleteFile(outFile);

    if (blob.size > MAX_BYTES) {
      throw new Error(`Видео всё ещё больше ${MAX_MB} MB после сжатия. Сократите длину.`);
    }

    onProgress?.(100);
    return { blob };
  } finally {
    // Release event listener
    ffmpeg.off('progress', progressCallback);
  }
}
