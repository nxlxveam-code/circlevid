const fs = require('fs');
const https = require('https');
const path = require('path');

const urls = [
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.worker.js'
];

const dir = path.join(__dirname, '../public', 'ffmpeg');
fs.mkdirSync(dir, { recursive: true });

console.log('Начинаю загрузку файлов ffmpeg (примерно 30 MB)...');
let completed = 0;

urls.forEach(url => {
  const filename = path.basename(url);
  const file = fs.createWriteStream(path.join(dir, filename));
  https.get(url, response => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Handle redirect
        https.get(response.headers.location, resRedirect => {
            resRedirect.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Скачан: ${filename}`);
                completed++;
                if (completed === urls.length) console.log('✅ Все файлы успешно загружены!');
            });
        });
    } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Скачан: ${filename}`);
          completed++;
          if (completed === urls.length) console.log('✅ Все файлы успешно загружены!');
        });
    }
  }).on('error', err => {
    console.error(`Ошибка скачивания ${filename}:`, err);
  });
});
