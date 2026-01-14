
# New Server Setup Guide (ZKTeco Bridge)

This guide provides step-by-step instructions for setting up and running the new ZKTeco bridge server (`server.ts`). This server is responsible for listening for fingerprint scans from the ZKTeco device and forwarding them to the main application.

## Prerequisites

1.  **Node.js and npm:** Ensure you have Node.js (version 16 or later) and npm installed on the machine that will run the server. You can download them from [nodejs.org](https://nodejs.org/).
2.  **Firebase Service Account Key:** You need a `serviceAccountKey.json` file from your Firebase project.

### How to get your `serviceAccountKey.json`

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project (e.g., `brilliant-chemicals`).
3.  Click the gear icon next to "Project Overview" in the sidebar and select **Project settings**.
4.  Go to the **Service accounts** tab.
5.  Click the **Generate new private key** button. A `serviceAccountKey.json` file will be downloaded.

## Setup Steps

### 1. Place the Service Account Key

Place the `serviceAccountKey.json` file you downloaded into the root directory of this project. The `server.ts` file is configured to look for it in the same directory.

**Important:** Keep this file secure and do not commit it to version control. The `.gitignore` file should already be configured to ignore it.

### 2. Install Dependencies

Open a terminal in the root directory of the project and run the following command to install the necessary Node.js packages:

```bash
npm install
```

This will install `express`, `firebase-admin`, and the required TypeScript types.

## Running the Server

The server is a TypeScript file (`server.ts`) and needs to be compiled into JavaScript before it can be run by Node.js.

### 1. Compile the Server

Run the following command in your terminal to compile the server:

```bash
npx tsc server.ts
```

This command will create a `server.js` file in the root directory.

### 2. Start the Server

Now, run the compiled JavaScript file to start the server:

```bash
node server.js
```

## Verification

If the server starts successfully, you will see the following output in your terminal:

```
================================================
KNOCKOUT MASTER BRIDGE - ACTIVE MODE : GATE PASS AWARE
PORT : 80
================================================
✔ Employee cache updated with X entries.
✔ ADMS Bridge listening on port 80
```

You will also see a heartbeat message every 5 seconds, indicating that the server is alive and waiting for a connection from the ZKTeco device.

```
[HEARTBEAT] Waiting for F22 device...
```

Once the device connects and sends a ping, the message will change to:

```
--> [PING] SN=DEVICE_SERIAL_NUMBER
[HEARTBEAT] Device alive (Xs ago)
```

## Troubleshooting

-   **`serviceAccountKey.json` not found:** Make sure the file is in the root directory and named exactly `serviceAccountKey.json`.
-   **Port 80 in use:** On some systems, port 80 requires administrator privileges or may be in use by another application. You can change the port by editing the `PORT` variable at the top of the `server.ts` file and recompiling.
-   **Authentication Errors:** If you see errors related to Firebase authentication, ensure your `serviceAccountKey.json` is valid and has the necessary permissions.
