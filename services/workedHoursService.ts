
import { collection, writeBatch, query, where, getDocs, doc } from "firebase/firestore";
import { db } from "./firebase";
import { DailyWorkRecord, Employee, AttendanceLog, OvertimeDecision, SystemSettings } from "../types";
import { attendanceCalculator } from "./attendanceCalculator";

const WORKED_HOURS_COL = "daily_work_records";

export const workedHoursService = {
  /**
   * Calculates and saves the daily work records for a given employee.
   * This should be called periodically or after significant events (like logout).
   */
  updateWorkedHours: async (
    employee: Employee,
    logs: AttendanceLog[],
    decisions: OvertimeDecision[],
    settings: SystemSettings
  ): Promise<void> => {
    const records = attendanceCalculator.calculateEmployeeRecords(
      employee.id,
      logs,
      decisions,
      settings
    );

    if (!records.length) {
      console.log(`[WorkedHoursService] No new records to update for ${employee.name}`);
      return;
    }

    const batch = writeBatch(db);

    // We create a unique ID for each record based on employeeId and date
    // to make the records idempotent. This prevents duplicate entries.
    for (const record of records) {
        const recordId = `${record.employeeId}_${record.date.replace(/\//g, '-')}`;
        const docRef = doc(db, WORKED_HOURS_COL, recordId);
        // Using set with merge: true to create or update the record.
        batch.set(docRef, record, { merge: true });
    }

    try {
      await batch.commit();
      console.log(`[WorkedHoursService] Successfully updated ${records.length} daily work records for ${employee.name}.`);
    } catch (error) {
      console.error(`[WorkedHoursService] Error committing batch for ${employee.name}:`, error);
    }
  },

  /**
   * Retrieves all calculated daily work records for a specific employee.
   */
  getWorkedHoursForEmployee: async (employeeId: string): Promise<DailyWorkRecord[]> => {
    const q = query(
        collection(db, WORKED_HOURS_COL),
        where("employeeId", "==", employeeId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as DailyWorkRecord);
  }
};
