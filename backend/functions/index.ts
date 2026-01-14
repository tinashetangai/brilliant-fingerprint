
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { collection, getDocs, query, where, writeBatch } from "firebase-firestore";
import { AttendanceAction, LogStatus, OvertimeStatus } from "../../types";

admin.initializeApp();

const db = admin.firestore();

exports.autoLogout = functions.pubsub.schedule("every day 00:00").onRun(async (context) => {
  console.log("Running auto-logout function...");

  const settingsDoc = await db.collection("config").doc("system").get();
  const settings = settingsDoc.data();
  if (!settings) {
    console.error("System settings not found.");
    return;
  }

  const dayEnd = settings.dayEnd;
  const [endHours, endMinutes] = dayEnd.split(":").map(Number);

  const today = new Date();
  today.setHours(endHours, endMinutes, 0, 0);
  const dayEndTimestamp = today.getTime();
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const q = query(
    collection(db, "logs"),
    where("status", "==", LogStatus.SUCCESS),
    where("action", "==", AttendanceAction.LOGIN),
    where("timestamp", ">=", twoDaysAgo.getTime())
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.log("No active logins found.");
    return;
  }

  const batch = writeBatch(db);
  let logoutCount = 0;

  for (const doc of snapshot.docs) {
    const log = doc.data();
    const employeeId = log.subjectId;
    const logDate = new Date(log.timestamp).toLocaleDateString("en-GB");

    const otq = query(
      collection(db, "overtime_decisions"),
      where("employeeId", "==", employeeId),
      where("date", "==", logDate),
      where("status", "==", OvertimeStatus.APPROVED)
    );
    const otSnapshot = await getDocs(otq);

    if (otSnapshot.empty) {
      const newLog = {
        ...log,
        action: AttendanceAction.LOGOUT,
        timestamp: dayEndTimestamp,
        status: LogStatus.SUCCESS,
        confidence: 1.0,
        type: "EMPLOYEE",
      };
      const newLogRef = db.collection("logs").doc();
      batch.set(newLogRef, newLog);
      logoutCount++;
    }
  }

  if (logoutCount > 0) {
    await batch.commit();
    console.log(`Successfully logged out ${logoutCount} users.`);
  } else {
    console.log("No users needed to be logged out.");
  }
});
