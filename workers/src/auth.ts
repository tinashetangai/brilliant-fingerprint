
// A lightweight JWT signer for Service Accounts compatible with Cloudflare Workers
import { Env } from './index';

function importKey(pem: string): Promise<CryptoKey> {
  if (!pem || typeof pem !== 'string') {
      throw new Error("Invalid PEM: Key is empty or not a string");
  }

  // 1. Handle literal "\n" characters (common in env vars) and normal newlines
  let cleanPem = pem.replace(/\\n/g, '\n').trim();

  // 2. Remove Headers/Footers if present
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  
  if (cleanPem.includes(pemHeader)) {
    cleanPem = cleanPem.substring(
      cleanPem.indexOf(pemHeader) + pemHeader.length,
      cleanPem.lastIndexOf(pemFooter)
    );
  } else {
      // It might be a raw base64 string, continue but log a warning if needed
      // console.warn("No PEM header found, assuming raw base64");
  }

  // 3. Remove all whitespace (newlines, spaces) to get pure Base64
  const base64 = cleanPem.replace(/\s/g, '');

  try {
    const binaryDerString = atob(base64);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    return crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
  } catch (e: any) {
      throw new Error(`Key Import Failed: ${e.message} (Base64 length: ${base64.length})`);
  }
}

function base64url(source: Uint8Array | ArrayBuffer): string {
  let encoded = btoa(String.fromCharCode(...new Uint8Array(source)));
  encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return encoded;
}

export async function getToken(env: Env): Promise<string> {
  try {
    console.log(`[Auth] Attempting auth for: ${env.FIREBASE_CLIENT_EMAIL}`);
    
    if (!env.FIREBASE_PRIVATE_KEY) throw new Error("Private key is missing in environment");
    
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
    const encodedClaim = base64url(new TextEncoder().encode(JSON.stringify(claim)));
    const data = `${encodedHeader}.${encodedClaim}`;

    const key = await importKey(env.FIREBASE_PRIVATE_KEY);
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(data)
    );

    const jwt = `${data}.${base64url(signature)}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResp.ok) {
        const text = await tokenResp.text();
        throw new Error(`Google Token API returned ${tokenResp.status}: ${text}`);
    }

    const tokenData: any = await tokenResp.json();
    return tokenData.access_token;
  } catch (error: any) {
    console.error("Auth Error:", error);
    throw new Error(`Authentication failed: ${error.message}`);
  }
}
