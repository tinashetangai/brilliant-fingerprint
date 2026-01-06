/**
=====================================================
KNOCKOUT BIOMETRIC ADMS BRIDGE
ZKTeco F22 – T&A PUSH
ENHANCED GATE PASS & DAILY-AWARE LOGGING
=====================================================
*/
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = 80;

app.use(express.text({ type: () => true, limit: '10mb' }));

// ================= COLORS =================
const C = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    CYAN: '\x1b[36m',
    MAGENTA: '\x1b[35m',
    GRAY: '\x1b[90m'
};

// ================= FIREBASE =================
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://knockout-7d62d-default-rtdb.firebaseio.com'
});

const db = admin.firestore();
const rtdb = admin.database();

// ================= STATE =================
let lastDevicePing = null;
let systemSettings = null;
let settingsLastFetched = 0;

async function getSystemSettings() {
    const now = Date.now();
    if (systemSettings && (now - settingsLastFetched < 300000)) { // 5-minute cache
        return systemSettings;
    }
    const doc = await db.collection('config').doc('system').get();
    if (!doc.exists) {
        console.log(`${C.RED}[SETTINGS] System settings not found! Using defaults.${C.RESET}`);
        return { dayStart: '08:00', dayEnd: '17:00' };
    }
    systemSettings = doc.data();
    settingsLastFetched = now;
    console.log(`${C.GREEN}[SETTINGS] System settings loaded.${C.RESET}`);
    return systemSettings;
}

// ================= BANNER =================
console.log(`${C.CYAN}================================================
KNOCKOUT MASTER BRIDGE - ACTIVE MODE : GATE PASS AWARE
PORT : ${PORT}
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

// ================= ADMS =================

// DEVICE HANDSHAKE
app.get('/iclock/cdata', (req, res) => {
    lastDevicePing = Date.now();
    const sn = req.query.SN || 'UNKNOWN';
    console.log(`${C.CYAN}--> [PING] SN=${sn}${C.RESET}`);
    res.type('text/plain').send('GET OPTION FROM: SERVER\nC:ATTLOG');
});

// ATTENDANCE PUSH
app.post('/iclock/cdata', async (req, res) => {
    if (req.query.table !== 'ATTLOG') return res.send('OK');

    console.log(`${C.YELLOW}📥 ATTLOG RECEIVED${C.RESET}`);
    const lines = (req.body || '').trim().split('\n').filter(Boolean);

    // Start of today (local time)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const settings = await getSystemSettings();

    for (const line of lines) {
        const parts = line.split('\t');
        const pin = parts[0];
        const now = Date.now();

        try {
            // ===== EMPLOYEE LOOKUP =====
            const snap = await db.collection('employees')
                .where('pin', '==', pin)
                .limit(1)
                .get();

            if (snap.empty) {
                console.log(`${C.RED}[UNKNOWN PIN] ${pin}${C.RESET}`);
                continue;
            }

            const empDoc = snap.docs[0];
            const emp = empDoc.data();
            const employeeId = empDoc.id;

            const lastLogSnap = await db.collection('logs')
                .where('subjectId', '==', employeeId)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            let lastAction = 'LOGOUT';
            if (!lastLogSnap.empty) {
                lastAction = lastLogSnap.docs[0].data().action;
            }

            const action = (lastAction === 'LOGOUT') ? 'LOGIN' : 'LOGOUT';

            const logData = {
                subjectId: employeeId,
                subjectName: emp.name,
                timestamp: now,
                action,
                status: 'SUCCESS',
                source: 'F22_HARDWARE',
                date: new Date().toLocaleDateString('en-GB'),
                workedHours: 0,
                overtimeHours: 0
            };

            if (action === 'LOGOUT') {
                const loginLogSnap = await db.collection('logs')
                    .where('subjectId', '==', employeeId)
                    .where('action', '==', 'LOGIN')
                    .where('timestamp', '>=', startOfToday.getTime())
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                if (!loginLogSnap.empty) {
                    const loginTime = loginLogSnap.docs[0].data().timestamp;
                    const logoutTime = now;

                    const dayStart = new Date(startOfToday);
                    const [startHours, startMinutes] = settings.dayStart.split(':');
                    dayStart.setHours(startHours, startMinutes, 0, 0);

                    const dayEnd = new Date(startOfToday);
                    const [endHours, endMinutes] = settings.dayEnd.split(':');
                    dayEnd.setHours(endHours, endMinutes, 0, 0);

                    // Handle night shifts that cross midnight
                    if (dayEnd.getTime() < dayStart.getTime()) {
                        dayEnd.setDate(dayEnd.getDate() + 1);
                        // If login was the previous day, adjust start of day back
                        if (new Date(loginTime).getDate() < new Date(logoutTime).getDate()) {
                            dayStart.setDate(dayStart.getDate() - 1);
                        }
                    }

                    const effectiveLoginTime = Math.max(loginTime, dayStart.getTime());
                    const effectiveLogoutTime = Math.min(logoutTime, dayEnd.getTime());

                    if (effectiveLogoutTime > effectiveLoginTime) {
                        logData.workedHours = (effectiveLogoutTime - effectiveLoginTime) / (1000 * 60 * 60);
                    }

                    if (logoutTime > dayEnd.getTime()) {
                        logData.overtimeHours = (logoutTime - dayEnd.getTime()) / (1000 * 60 * 60);
                        if (logData.overtimeHours > 0) {
                            await db.collection('overtime_requests').add({
                                employeeId,
                                employeeName: emp.name,
                                date: new Date().toLocaleDateString('en-GB'),
                                hours: logData.overtimeHours,
                                status: 'PENDING'
                            });
                        }
                    }
                }
            }

            await db.collection('logs').add(logData);

            // Increment total days worked
            if (action === 'LOGOUT' && logData.workedHours > 0) {
                const dayHours = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
                if (dayHours > 0) {
                    const daysToAdd = logData.workedHours / dayHours;
                    await db.collection('employees').doc(employeeId).update({
                        totalDaysWorked: admin.firestore.FieldValue.increment(daysToAdd)
                    });
                }
            }

            const color = action === 'LOGIN' ? C.GREEN : C.YELLOW;
            console.log(`${color}✔ ${action} → ${emp.name} | Worked: ${logData.workedHours.toFixed(2)}h | Overtime: ${logData.overtimeHours.toFixed(2)}h${C.RESET}`);

            // ===== REALTIME UI =====
            rtdb.ref('live_scans/latest').set({
                subjectId: employeeId,
                subjectName: emp.name,
                name: emp.name,
                action: action,
                timestamp: now
            });

        } catch (err) {
            console.error(`${C.RED}[ERROR] ${err.message}${C.RESET}`);
        }
    }

    res.send('OK');
});

// REQUIRED ADMS ENDPOINTS
app.get('/iclock/getrequest', (req, res) => res.type('text/plain').send('OK'));
app.post('/iclock/registry', (req, res) => res.send('OK'));
app.post('/iclock/devicecmd', (req, res) => res.send('OK'));
app.use((req, res) => res.send('OK'));

// ================= START =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`${C.GREEN}✔ ADMS Bridge listening on port ${PORT}${C.RESET}`);
});
