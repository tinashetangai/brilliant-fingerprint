import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { AttendanceAction, LogStatus, OvertimeStatus } from "../../types";

admin.initializeApp();

const db = admin.firestore();

export const autoLogout = onSchedule({
  schedule: "every day 00:00",
  timeZone: "Africa/Harare",
}, async (event) => {
  console.log("Running scheduled auto-logout at Midnight Harare time...");

  const settingsDoc = await db.collection("config").doc("system").get();
  const settings = settingsDoc.data();
  if (!settings) {
    console.error("System settings not found.");
    return;
  }

  const [endHours, endMinutes] = settings.dayEnd.split(":").map(Number);

  // We want to find anyone who is currently ONSITE.
  const employeesSnap = await db.collection("employees").get();

  const batch = db.batch();
  let logoutCount = 0;

  const harareFormatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Africa/Harare'
  });

  for (const empDoc of employeesSnap.docs) {
    const employeeId = empDoc.id;
    const employee = empDoc.data();

    const lastLogSnap = await db.collection("logs")
      .where("subjectId", "==", employeeId)
      .where("status", "==", LogStatus.SUCCESS)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (!lastLogSnap.empty) {
      const lastLog = lastLogSnap.docs[0].data();
      if (lastLog.action === AttendanceAction.LOGIN) {
        // Employee is still logged in.
        const loginDate = new Date(lastLog.timestamp);
        const formattedDate = harareFormatter.format(loginDate);
        const [d, m, y] = formattedDate.split('/');

        // Calculate theoretical logout time at dayEnd
        // Harare is UTC+2
        let logoutTimestamp = new Date(Date.UTC(Number(y), Number(m)-1, Number(d), endHours - 2, endMinutes)).getTime();

        // If login was after dayEnd, or if logoutTimestamp is before login, logout at login + 1 minute
        if (logoutTimestamp <= lastLog.timestamp) {
          logoutTimestamp = lastLog.timestamp + 60000;
        }

        const newLog = {
          subjectId: employeeId,
          subjectName: employee.name,
          action: AttendanceAction.LOGOUT,
          timestamp: logoutTimestamp,
          status: LogStatus.SUCCESS,
          confidence: 1.0,
          type: "EMPLOYEE",
          source: "AUTO_SYSTEM_LOGOUT",
          date: harareFormatter.format(new Date(logoutTimestamp))
        };

        const newLogRef = db.collection("logs").doc();
        batch.set(newLogRef, newLog);
        logoutCount++;
      }
    }
  }

  if (logoutCount > 0) {
    await batch.commit();
    console.log(`Successfully auto-logged out ${logoutCount} employees.`);
  } else {
    console.log("No employees needed auto-logout.");
  }
});