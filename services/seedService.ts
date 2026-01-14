
import { collection, writeBatch, getDocs } from "firebase/firestore";
import { db } from "../backend/firebase";
import { Department, Employee } from "../types";

const DEPARTMENTS_COL = "departments";
const EMPLOYEES_COL = "employees";

// Sample Data
const sampleDepartments: Omit<Department, 'id'>[] = [
  { name: "Management" },
  { name: "Human Resources" },
  { name: "Engineering" },
  { name: "Sales" },
  { name: "Marketing" },
];

const sampleEmployees: Omit<Employee, 'id' | 'createdAt' | 'qrCodeData'>[] = [
    { name: "Alice Johnson", pin: "1001", department: "Management" },
    { name: "Bob Williams", pin: "1002", department: "Human Resources" },
    { name: "Charlie Brown", pin: "1003", department: "Engineering" },
    { name: "Diana Miller", pin: "1004", department: "Engineering" },
    { name: "Ethan Davis", pin: "1005", department: "Sales" },
    { name: "Fiona Garcia", pin: "1006", department: "Marketing" },
];

export const seedService = {
  seedDatabase: async (): Promise<{success: boolean, message: string}> => {
    console.log("[SeedService] Starting database seed...");

    // Prevent seeding if collections are not empty
    const deptSnap = await getDocs(collection(db, DEPARTMENTS_COL));
    const empSnap = await getDocs(collection(db, EMPLOYEES_COL));

    if (!deptSnap.empty || !empSnap.empty) {
        const message = "Database already contains data. Seed aborted.";
        console.warn(`[SeedService] ${message}`);
        return { success: false, message };
    }

    const batch = writeBatch(db);

    // Seed Departments
    sampleDepartments.forEach(dept => {
      const docRef = collection(db, DEPARTMENTS_COL);
      batch.set(doc(docRef), dept);
    });

    // Seed Employees
    sampleEmployees.forEach(emp => {
      const docRef = collection(db, EMPLOYEES_COL);
      const qrCodeData = `EMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const newEmp = { ...emp, qrCodeData, createdAt: Date.now(), totalDaysWorked: 0 };
      batch.set(doc(docRef), newEmp);
    });

    try {
      await batch.commit();
      const message = `Successfully seeded ${sampleDepartments.length} departments and ${sampleEmployees.length} employees.`;
      console.log(`[SeedService] ${message}`);
      return { success: true, message };
    } catch (error: any) {
      const message = `Error seeding database: ${error.message}`;
      console.error(`[SeedService] ${message}`);
      return { success: false, message };
    }
  }
};
