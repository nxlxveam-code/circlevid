# CircleVid

Платформа для коротких круговых видео.
circlevid-frontend.onrender.com

## Структура проекта

- `backend/` - Node.js/Express API + MongoDB
- `frontend/` - React + Vite

## Локальная разработка

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Настройте .env (MongoDB, R2/S3)
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Деплой

См. [DEPLOYMENT.md](./DEPLOYMENT.md) для инструкций по деплою на Render.com.

## Технологии

- **Backend**: Express, MongoDB, Mongoose, AWS SDK (S3/R2), Multer
- **Frontend**: React, Vite, FFmpeg.wasm
- **Хостинг**: Render.com, MongoDB Atlas, Cloudflare R2
