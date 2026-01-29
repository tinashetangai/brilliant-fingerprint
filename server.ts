import express from 'express';

const app = express();
const PORT = 80;

// ================= CONFIGURATION =================
// *** REPLACE THIS WITH YOUR DEPLOYED CLOUDFLARE WORKER URL ***
const CLOUDFLARE_WORKER_URL = "https://knockout-attendance-worker.mordenfarm1677.workers.dev";

// ================= SETUP =================
app.use('/', express.text({ type: () => true, limit: '10mb' }) as any);

const C = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    CYAN: '\x1b[36m',
    GRAY: '\x1b[90m'
};

let lastDevicePing: number | null = null;

// ================= BANNER =================
console.log(`${C.CYAN}================================================
KNOCKOUT CLOUDFLARE BRIDGE (INTELLIGENT MODE)
PORT : ${PORT}
TARGET: ${CLOUDFLARE_WORKER_URL}
================================================${C.RESET}`);

// ================= HEARTBEAT =================
setInterval(() => {
    if (!lastDevicePing) {
        console.log(`${C.GRAY}[HEARTBEAT] Waiting for F22 device...${C.RESET}`);
    } else {
        const sec = Math.floor((Date.now() - lastDevicePing) / 1000);
        console.log(`${C.GREEN}[HEARTBEAT] Device alive (${sec}s ago)${C.RESET}`);
    }
}, 5000);

// ================= ADMS HANDLERS =================

// 1. Device Handshake
app.get('/iclock/cdata', (req, res) => {
    lastDevicePing = Date.now();
    const sn = req.query.SN || 'UNKNOWN';
    res.type('text/plain').send('GET OPTION FROM: SERVER\nC:ATTLOG');
});

// 2. Attendance Log Push
app.post('/iclock/cdata', async (req, res) => {
    // Only process attendance logs (ATTLOG)
    if (req.query.table !== 'ATTLOG') return res.send('OK');

    console.log(`${C.YELLOW}📥 ATTLOG RECEIVED${C.RESET}`);
    const body = req.body || '';
    const lines = body.toString().trim().split('\n').filter(Boolean);

    for (const line of lines) {
        // Format: PIN \t Time \t Status ...
        const parts = line.split('\t');
        const pin = parts[0];
        
        console.log(`${C.CYAN}--> Forwarding PIN [${pin}] to Cloudflare...${C.RESET}`);

        try {
            // Forward to Cloudflare Worker
            // The Worker now handles ALL logic (Login vs Logout decision)
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/api/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pin: pin,
                    source: 'ZK_F22_BRIDGE'
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server ${response.status}: ${text}`);
            }

            const json: any = await response.json();
            
            if (json.success) {
                const actionColor = json.action === 'LOGIN' ? C.GREEN : C.YELLOW;
                console.log(`${actionColor}✔ VERIFIED: ${json.employee.name} (${json.action})${C.RESET}`);
                if (json.overtime > 0) {
                    console.log(`${C.YELLOW}  ⚠ Overtime Request Generated: ${json.overtime.toFixed(2)} hrs${C.RESET}`);
                }
            } else {
                console.error(`${C.RED}✘ REJECTED: ${json.error}${C.RESET}`);
            }

        } catch (err: any) {
            console.error(`${C.RED}[ERROR] Forwarding failed: ${err.message}${C.RESET}`);
        }
    }

    // Acknowledge receipt to device so it doesn't resend
    res.send('OK');
});

// 3. Other Required Endpoints (Stubbed)
app.get('/iclock/getrequest', (req, res) => res.type('text/plain').send('OK'));
app.post('/iclock/registry', (req, res) => res.send('OK'));
app.post('/iclock/devicecmd', (req, res) => res.send('OK'));
app.use((req, res) => res.send('OK'));

// ================= START =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`${C.GREEN}✔ Bridge listening on port ${PORT}${C.RESET}`);
    console.log(`${C.GRAY}  Ensure your ZKTeco device is pointing to this computer's IP address.${C.RESET}`);
});