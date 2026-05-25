# 🚀 Деплой CircleVid на Render.com

## Шаг 1: MongoDB Atlas (база данных)

1. Зайдите на [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Создайте бесплатный аккаунт
3. Создайте кластер:
   - Выберите **FREE tier** (M0 Sandbox)
   - Регион: выберите ближайший (например, Frankfurt)
4. Создайте пользователя базы данных:
   - Database Access → Add New Database User
   - Запомните username и password
5. Разрешите доступ:
   - Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)
6. Получите connection string:
   - Clusters → Connect → Connect your application
   - Скопируйте строку вида: `mongodb+srv://username:password@cluster.mongodb.net/circlevid`

## Шаг 2: Cloudflare R2 (хранилище видео)

1. Зайдите на [dash.cloudflare.com](https://dash.cloudflare.com)
2. Создайте аккаунт (если нет)
3. Перейдите в **R2 Object Storage**
4. Создайте bucket:
   - Имя: `circlevid-videos`
   - Регион: Automatic
5. Настройте публичный доступ:
   - Settings → Public Access → Allow Access
   - Скопируйте **Public Bucket URL** (например: `https://pub-xxxxx.r2.dev`)
6. Создайте API токен:
   - R2 → Manage R2 API Tokens → Create API Token
   - Permissions: Object Read & Write
   - Скопируйте:
     - Access Key ID
     - Secret Access Key
     - Account ID (из URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/r2`)

## Шаг 3: Подготовка кода

1. Создайте файл `frontend/.env.production`:
```env
VITE_API_URL=https://circlevid-backend.onrender.com
```

2. Убедитесь, что в `frontend/src/App.jsx` используется переменная окружения:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
```

3. Закоммитьте изменения в Git:
```bash
git add .
git commit -m "Add Render deployment config"
git push
```

## Шаг 4: Деплой на Render.com

### Вариант A: Автоматический деплой (через render.yaml)

1. Зайдите на [render.com](https://render.com)
2. Создайте аккаунт и подключите GitHub
3. Нажмите **New** → **Blueprint**
4. Выберите ваш репозиторий `Circlevid`
5. Render автоматически найдет `render.yaml`
6. Настройте environment variables (см. ниже)
7. Нажмите **Apply**

### Вариант B: Ручной деплой

#### Backend:
1. Dashboard → **New** → **Web Service**
2. Подключите GitHub репозиторий
3. Настройки:
   - Name: `circlevid-backend`
   - Runtime: `Node`
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Plan: **Free**

#### Frontend:
1. Dashboard → **New** → **Static Site**
2. Подключите тот же репозиторий
3. Настройки:
   - Name: `circlevid-frontend`
   - Build Command: `cd frontend && npm install && npm run build`
   - Publish Directory: `frontend/dist`

## Шаг 5: Настройка Environment Variables

### Backend (circlevid-backend):
```
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/circlevid
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=<ваш account id>
R2_ACCESS_KEY_ID=<ваш access key>
R2_SECRET_ACCESS_KEY=<ваш secret key>
R2_BUCKET_NAME=circlevid-videos
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
FRONTEND_URL=https://circlevid-frontend.onrender.com
VIEWS_PER_UPLOAD=5
BOOST_VIEWS=10
MAX_FILE_SIZE_MB=10
MIN_DURATION=5
MAX_DURATION=45
HIDE_SCORE_THRESHOLD=-10
```

### Frontend (circlevid-frontend):
```
VITE_API_URL=https://circlevid-backend.onrender.com
```

## Шаг 6: Проверка

1. Дождитесь завершения деплоя (5-10 минут)
2. Откройте URL frontend: `https://circlevid-frontend.onrender.com`
3. Проверьте health check backend: `https://circlevid-backend.onrender.com/health`

## ⚠️ Важные замечания

### Бесплатный план Render.com:
- Backend **засыпает** после 15 минут неактивности
- Первый запрос после сна занимает ~30-60 секунд (cold start)
- 750 часов работы в месяц (достаточно для одного сервиса)

### Решение проблемы cold start:
Используйте бесплатный сервис для пинга (например, UptimeRobot):
1. Зайдите на [uptimerobot.com](https://uptimerobot.com)
2. Создайте монитор для `https://circlevid-backend.onrender.com/health`
3. Интервал проверки: каждые 5 минут
4. Это будет держать backend активным

### Лимиты бесплатных планов:
- **Render**: 750 часов/месяц на сервис
- **MongoDB Atlas**: 512MB хранилища
- **Cloudflare R2**: 10GB хранилища, 1M запросов/месяц

## 🔧 Troubleshooting

### Backend не запускается:
- Проверьте логи в Render Dashboard
- Убедитесь, что все environment variables заданы
- Проверьте MONGODB_URI (правильный пароль, IP разрешен)

### Frontend не подключается к backend:
- Проверьте CORS в `backend/src/index.js`
- Убедитесь, что FRONTEND_URL в backend совпадает с URL frontend
- Проверьте VITE_API_URL в frontend

### Видео не загружаются:
- Проверьте R2 credentials
- Убедитесь, что bucket публичный
- Проверьте R2_PUBLIC_URL

### 502 Bad Gateway:
- Backend еще запускается (подождите 1-2 минуты)
- Или backend упал (проверьте логи)

## 📊 Мониторинг

- **Render Dashboard**: логи и метрики
- **MongoDB Atlas**: Database → Metrics
- **Cloudflare R2**: Analytics

## 🔄 Обновления

После изменений в коде:
```bash
git add .
git commit -m "Update feature"
git push
```

Render автоматически задеплоит изменения.

## 💰 Апгрейд (если нужно)

Если бесплатного плана не хватает:
- **Render Starter**: $7/месяц (без cold start)
- **MongoDB Atlas M10**: $0.08/час (~$57/месяц)
- **Cloudflare R2**: $0.015/GB после 10GB

## 🆘 Поддержка

- Render Docs: [render.com/docs](https://render.com/docs)
- MongoDB Atlas Docs: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- Cloudflare R2 Docs: [developers.cloudflare.com/r2](https://developers.cloudflare.com/r2)
