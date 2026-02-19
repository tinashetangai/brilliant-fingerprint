<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1FHjTJK0O0LhPDJ8idxmXUj5yO9orzCn7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cloudflare Worker Setup

The project uses a Cloudflare Worker for backend tasks such as PIN authentication and auto-logout.

### 1. Deployment
- Navigate to the `workers/` directory.
- Run `npm install`.
- Use Wrangler to deploy: `npx wrangler deploy`.

### 2. Configuration
In the Cloudflare Dashboard for your worker, set the following Environment Variables (Secret):
- `FIREBASE_PROJECT_ID`: Your Firebase project ID (e.g., `brilliant-chemicals`).
- `FIREBASE_CLIENT_EMAIL`: Service account email from Firebase.
- `FIREBASE_PRIVATE_KEY`: Service account private key from Firebase.

### 3. Auto-Logout (Cron Trigger)
The worker is configured with a Cron trigger in `wrangler.toml` to run daily.
- Schedule: `0 22 * * *` (22:00 UTC, which is 00:00 CAT).
- This task automatically logs out any employees who are still "ONSITE" at the end of the day.
- Ensure "Triggers" are enabled in the Cloudflare Worker settings.

## Attendance Log Editing
Log editing is now fully functional. Admins can edit both "Time In" and "Time Out" directly from the **Staff Logs** tab.
- Edits are automatically adjusted to the **Africa/Harare** timezone.
- If a logout time is removed, the employee status reverts to **ONSITE**.
