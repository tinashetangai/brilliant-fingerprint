import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { AttendanceAction, LogStatus, OvertimeStatus } from "../../types";

admin.initializeApp();

const db = admin.firestore();

export const autoLogout = onSchedule("every day 00:00", async (event) => {
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

  const logsRef = db.collection("logs");
  const snapshot = await logsRef
    .where("status", "==", LogStatus.SUCCESS)
    .where("action", "==", AttendanceAction.LOGIN)
    .where("timestamp", ">=", twoDaysAgo.getTime())
    .get();

  if (snapshot.empty) {
    console.log("No active logins found.");
    return;
  }

  const batch = db.batch();
  let logoutCount = 0;

  for (const doc of snapshot.docs) {
    const log = doc.data();
    const employeeId = log.subjectId;
    const logDate = new Date(log.timestamp).toLocaleDateString("en-GB");

    const otSnapshot = await db.collection("overtime_decisions")
      .where("employeeId", "==", employeeId)
      .where("date", "==", logDate)
      .where("status", "==", OvertimeStatus.APPROVED)
      .get();

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