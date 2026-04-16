# Cat Care Tracker

Full-stack cat care app — accounts, litter reminders (vet-researched), food & water tracking.  
Backend: Node.js + Express. Database: PostgreSQL. Auth: JWT.

---

## Deploy to Railway (~10 minutes)

### Step 1 — Create a GitHub account (skip if you have one)
Go to **github.com** and sign up for free.

### Step 2 — Push the code to GitHub
1. On GitHub, click **+** → **New repository**
2. Name it `cat-care-tracker`, keep it Public, click **Create repository**
3. On the next screen, click **uploading an existing file**
4. Upload these files (keep the folder structure):
   ```
   server.js
   package.json
   .gitignore
   README.md
   public/
     index.html
   ```
5. Click **Commit changes**

### Step 3 — Create a Railway project
1. Go to **railway.app** → click **Start a New Project**
2. Sign up with your GitHub account
3. Click **Deploy from GitHub repo** → select `cat-care-tracker`
4. Railway detects Node.js and starts deploying — takes ~1 minute

### Step 4 — Add a PostgreSQL database (one click)
1. Inside your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway creates the database and automatically sets the `DATABASE_URL` environment variable — you don't need to do anything else

### Step 5 — Add your secret key
1. Click your **web service** (not the database) → **Variables** tab
2. Click **+ New Variable**:
   - Key: `JWT_SECRET`
   - Value: any random string, e.g. `daisy-secret-key-2025-xk39`
3. Railway redeploys automatically

### Step 6 — Get your app URL
1. Click your web service → **Settings** → **Networking** → **Generate Domain**
2. You get a URL like `cat-care.up.railway.app` — that's your live app

### Add to your iPhone home screen
1. Open the URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share** icon (box with arrow) → **Add to Home Screen**
3. Tap **Add** — it now lives on your home screen like a native app

---

## Local development

```bash
# Requires a local PostgreSQL instance
# Set DATABASE_URL in a .env file or in your shell:
export DATABASE_URL=postgresql://localhost/catcare
export JWT_SECRET=local-dev-secret

npm install
npm run dev
# → http://localhost:3000
```

---

## Environment variables

| Variable       | Required | Description                                          |
|----------------|----------|------------------------------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL connection string (Railway sets this auto) |
| `JWT_SECRET`   | Yes      | Secret key for signing auth tokens — keep this private|
| `PORT`         | No       | Port to listen on (Railway sets this automatically)  |
