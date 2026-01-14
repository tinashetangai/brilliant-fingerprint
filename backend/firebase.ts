
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDjMBiH5UuLz01Z6KOusz8CPdtQp1DloZ4",
  authDomain: "brilliant-chemicals.firebaseapp.com",
  projectId: "brilliant-chemicals",
  storageBucket: "brilliant-chemicals.firebasestorage.app",
  messagingSenderId: "908532112327",
  appId: "1:908532112327:web:d7f19e5173c9f7fbd657e2"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
