import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { AttendanceAction, LogStatus, OvertimeStatus } from "../../types";

admin.initializeApp();

const db = admin.firestore();

export const autoLogout = onSchedule({
  schedule: "every day 04:30",
  timeZone: "Africa/Harare",
}, async (event) => {
  console.log("Running scheduled auto-logout at 04:30 Harare time...");

  const settingsDoc = await db.collection("config").doc("system").get();
  const settings = settingsDoc.data();
  if (!settings) {
    console.error("System settings not found.");
    return;
  }

  const [endHours, endMinutes] = settings.dayEnd.split(":").map(Number);

  // We want to find anyone who is currently ONSITE.
  // A simple way is to check the last action for each employee.
  const employeesSnap = await db.collection("employees").get();

  const batch = db.batch();
  let logoutCount = 0;

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
        // We log them out at the dayEnd of their login day.
        const loginDate = new Date(lastLog.timestamp);

        // Use Harare time to determine the date components
        const formatter = new Intl.DateTimeFormat('en-GB', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          timeZone: 'Africa/Harare'
        });
        const formattedDate = formatter.format(loginDate); // DD/MM/YYYY
        const [d, m, y] = formattedDate.split('/');

        // Construct the logout timestamp (UTC+2 for Harare)
        const logoutDateUTC = new Date(Date.UTC(Number(y), Number(m)-1, Number(d), endHours - 2, endMinutes));
        const logoutTimestamp = logoutDateUTC.getTime();

        const newLog = {
          subjectId: employeeId,
          subjectName: employee.name,
          action: AttendanceAction.LOGOUT,
          timestamp: logoutTimestamp,
          status: LogStatus.SUCCESS,
          confidence: 1.0,
          type: "EMPLOYEE",
          source: "AUTO_SYSTEM_LOGOUT",
          date: formattedDate
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