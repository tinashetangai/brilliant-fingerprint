
# Cloudflare Worker Deployment Guide

This server handles all attendance logic, overtime calculation, and auto-logout in the cloud.

## 1. Prerequisites
- **Node.js** installed.
- **Service Account Key**: Your `serviceAccountKey.json` from Firebase.

## 2. Setup Wrangler (The CLI)
Open a terminal in the root folder:
```bash
npm install -g wrangler
wrangler login
```
*A browser window will open. Authorize Cloudflare.*

## 3. Configuration File
Ensure the file `workers/wrangler.toml` exists and contains the following code. 
**Copy and paste this into `workers/wrangler.toml`:**

```toml
name = "knockout-attendance-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Cron Trigger: Runs every day at 00:00 UTC
[triggers]
crons = ["0 0 * * *"]

[vars]
FIREBASE_PROJECT_ID = "brilliant-chemicals"
```

## 4. Configure Secrets
Open `serviceAccountKey.json`. You need the `client_email` and the `private_key`.

Run these commands to securely store them in Cloudflare:
```bash
cd workers
wrangler secret put FIREBASE_CLIENT_EMAIL
# (Paste the client_email value when prompted)

wrangler secret put FIREBASE_PRIVATE_KEY
# (Paste the ENTIRE private_key value, including -----BEGIN PRIVATE KEY-----)
```

## 5. Deploy the Worker
From the `workers` folder:
```bash
npm install
wrangler deploy
```
*You will get a URL like `https://knockout-attendance-worker.your-name.workers.dev`.*

## 6. Connect the System
1. **Frontend**: Open `services/dataService.ts`. Find `WORKER_URL` (near the top) and paste your new Worker URL.
2. **Local Bridge**: Open `server.ts`. Find `CLOUDFLARE_WORKER_URL` and paste the URL.
   - Run `npm install node-fetch@2` in the root if you haven't.
   - Restart the bridge: `node server.js`.

## 7. Testing
1. **PIN Login**: Go to the web app. Use "Gate Pass" or "Visitor" -> "Login". Enter a valid PIN.
   - It should say "Identity Verified" via the new server.
2. **Auto-Logout**: Wait for 00:00 UTC (or trigger the cron manually in Cloudflare Dashboard -> Workers -> Triggers).
3. **Overtime**: Log out a user after the `dayEnd` time set in Admin Settings. Check `Overtime Manager` in Admin Dashboard.
