
# Local Bridge Setup Guide (ZKTeco -> Cloudflare)

This guide explains how to run the local bridge that connects your ZKTeco F22 biometric device to the Cloudflare Worker server.

**Architecture:**
`[ZKTeco F22]` --(Ethernet)--> `[Local PC (Bridge)]` --(Internet)--> `[Cloudflare Worker]` --(API)--> `[Firebase]`

## 1. Prerequisites
- **Node.js** (Version 18 or higher is required for native `fetch` support).
- **Internet Connection**: The PC running this bridge must be online.
- **Deployed Cloudflare Worker**: You must have the URL from the previous step (e.g., `https://knockout-attendance-worker.xyz.workers.dev`).

## 2. Prepare the Bridge Code
1.  Open `server.js` in your code editor.
2.  Find the line:
    ```javascript
    const CLOUDFLARE_WORKER_URL = "https://knockout-attendance-worker.YOUR_SUBDOMAIN.workers.dev";
    ```
3.  Replace the URL with your **actual** Cloudflare Worker URL.

## 3. Install Dependencies
Open a terminal in the project root folder and run:

```bash
npm install
```
*This installs `express` which is required for the server to run.*

## 4. Network Configuration
Your computer needs a static IP so the ZKTeco device knows where to send data.

1.  **Set PC IP**:
    - Go to Network Settings -> Ethernet -> IPv4.
    - Set **IP Address**: `192.168.137.1` (or any static IP like `192.168.1.100`).
    - Set **Subnet Mask**: `255.255.255.0`.
    - *Note: If you are on a router, just ensure your PC's IP doesn't change.*

2.  **Configure ZKTeco F22**:
    - On the device, go to **Comm. Settings** -> **Cloud Server**.
    - **Server Address**: Enter your PC's IP (e.g., `192.168.137.1`).
    - **Server Port**: `80`.
    - **HTTPS**: `OFF`.

## 5. Run the Bridge
In your terminal, simply run:

```bash
node server.js
```

**Success Indicators:**
- Console output: `✔ Bridge listening on port 80`
- Console output: `TARGET: https://knockout-attendance-worker....`
- When the device connects: `[HEARTBEAT] Device alive`

## 6. Testing
1.  Scan a finger on the ZKTeco device.
2.  Watch the terminal on your PC. You should see:
    - `📥 ATTLOG RECEIVED`
    - `--> Forwarding PIN [123] to Cloudflare...`
    - `✔ VERIFIED: John Doe (LOGIN)`
3.  Check the web application. The log should appear instantly.

## Troubleshooting
- **Error: `fetch is not defined`**: You are using an old version of Node.js. Update to Node 18 or higher.
- **EADDRINUSE: address already in use**: Another program is using Port 80 (often Skype or IIS). Change `PORT = 80` in `server.js` to `8080` and update the Port setting on the ZKTeco device to 8080.
- **Connection Refused**: Check Windows Firewall. Allow Node.js through the firewall for Private/Public networks.
