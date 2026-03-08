# Fluent — Learn Lithuanian

## Stack
- **Frontend**: Next.js 14 + Tailwind + next-intl (EN/RU) → Vercel
- **Backend**: FastAPI (Python) → Render
- **Database**: PostgreSQL → Neon

---

## Local Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # fill in values
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`

### 2. Frontend

```bash
cd frontend
npm install

cp .env.example .env.local      # fill in NEXT_PUBLIC_BACKEND_URL
npm run dev
```

Frontend runs at `http://localhost:3000`

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Credentials**
3. Create **OAuth 2.0 Client ID** (Web application)
4. Add Authorized redirect URIs:
   - Local: `http://localhost:8000/api/auth/callback`
   - Production: `https://your-render-url.onrender.com/api/auth/callback`
5. Copy **Client ID** and **Client Secret** into `.env`

---

## Neon Database Setup

1. Sign up at [neon.tech](https://neon.tech)
2. Create a project → copy the connection string
3. Paste into `DATABASE_URL` in backend `.env`
4. Tables are created automatically on first run

---

## Deploy

### Backend → Render
1. Push to GitHub
2. [render.com](https://render.com) → New Web Service → connect repo
3. Set **Root Directory** to `backend`
4. Add env vars (from `.env.example`) in Render dashboard
5. Set `GOOGLE_REDIRECT_URI` = `https://your-render-url.onrender.com/api/auth/callback`

### Frontend → Vercel
1. [vercel.com](https://vercel.com) → New Project → connect repo
2. Set **Root Directory** to `frontend`
3. Add env var: `NEXT_PUBLIC_BACKEND_URL` = your Render URL
4. Deploy

---

## Auth Flow

```
User → "Continue with Google" → backend /api/auth/google
     → Google consent screen
     → backend /api/auth/callback
     → User saved to Neon DB
     → JWT created
     → Redirect to frontend /dashboard?token=xxx
     → Token stored in localStorage
     → Dashboard shows user info
```
