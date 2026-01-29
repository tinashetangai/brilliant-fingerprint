
import { collection, writeBatch, getDocs, doc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../backend/firebase";
import { Employee, SystemSettings } from "../types";

const DEPARTMENTS_COL = "departments";
const EMPLOYEES_COL = "employees";

// Data cleared as requested to stop seeding
const rawEmployees: { name: string; pin: string; dept: string }[] = [];

export const seedService = {
  seedDatabase: async (): Promise<{success: boolean, message: string}> => {
    console.log("[SeedService] Starting database seed...");

    // 1. Seed Admin User in Auth
    try {
        await createUserWithEmailAndPassword(auth, "admin@gmail.com", "admin111");
        console.log("[SeedService] Admin user created in Auth.");
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            console.log("[SeedService] Admin user already exists in Auth.");
        } else {
            console.error("[SeedService] Error creating admin user:", error);
        }
    }

    // Check if data already exists
    const deptSnap = await getDocs(collection(db, DEPARTMENTS_COL));
    const empSnap = await getDocs(collection(db, EMPLOYEES_COL));

    if (!deptSnap.empty || !empSnap.empty) {
        const message = "Database collections already contain data. Skipping collection seed.";
        console.log(`[SeedService] ${message}`);
        return { success: true, message };
    }

    const batch = writeBatch(db);

    // 2. Seed System Settings
    const settingsRef = doc(db, "config", "system");
    const defaultSettings: SystemSettings = {
      lateThreshold: "09:00",
      earlyThreshold: "08:00",
      dayStart: "06:00",
      dayEnd: "18:00",
      outsideLogin: "07:00",
      outsideLogout: "17:00",
      companyMotto: "Excellence in Everything",
      companyContact: "admin@company.com",
      adminPassword: "admin", 
      standardDayHours: 8,
      lunchDurationMinutes: 60,
      breakDurationMinutes: 30
    };
    batch.set(settingsRef, defaultSettings);

    // 3. Extract Unique Departments
    const uniqueDepartments = Array.from(new Set(rawEmployees.map(e => e.dept.trim()))).sort();
    
    uniqueDepartments.forEach(deptName => {
      const docRef = doc(collection(db, DEPARTMENTS_COL));
      batch.set(docRef, { name: deptName });
    });

    // 4. Seed Employees
    rawEmployees.forEach(emp => {
      const docRef = doc(collection(db, EMPLOYEES_COL));
      const qrCodeData = `EMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      const sanitizedName = emp.name.toLowerCase().replace(/[^a-z0-9]/g, '.');
      const email = `${sanitizedName}@knockout.com`;

      const newEmp: Omit<Employee, 'id'> = { 
        name: emp.name, 
        pin: emp.pin,
        department: emp.dept.trim(),
        email: email,
        fingerprintHash: "PENDING",
        qrCodeData, 
        createdAt: Date.now(), 
        totalDaysWorked: 0 
      };
      
      batch.set(docRef, newEmp);
    });

    try {
      await batch.commit();
      return { success: true, message: "Database seeded successfully." };
    } catch (error: any) {
      return { success: false, message: `Error seeding database: ${error.message}` };
    }
  }
};
