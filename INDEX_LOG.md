# Firestore Index Log

This file documents the Firestore queries used in `services/dataService.ts` and the composite indexes required for them to function correctly.

---

### 1. `getLogs`

*   **Query:** `query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(max))`
*   **Index Required:** A single-field index on `timestamp` (descending) in the `logs` collection. This is usually created automatically by Firestore.

---

### 2. `getVisitorLogs`

*   **Query:** `query(collection(db, "visitor_logs"), orderBy("timestamp", "desc"), limit(max))`
*   **Index Required:** A single-field index on `timestamp` (descending) in the `visitor_logs` collection. Also likely created automatically.

---

### 3. `getUserLastAction`

*   **Query:** `query(collection(db, "logs"), where("subjectId", "==", subjectId), where("status", "==", "SUCCESS"), orderBy("timestamp", "desc"), limit(1))`
*   **Composite Index Required:**
    *   **Collection:** `logs`
    *   **Fields:**
        1.  `subjectId` (Ascending)
        2.  `status` (Ascending)
        3.  `timestamp` (Descending)
*   **Note:** This is a critical query for determining the real-time status of an employee. The absence of this index is the most likely cause of the dashboard statistics being incorrect.

---

### 4. `getActiveVisitors`

*   **Query:** `query(collection(db, "visitor_logs"), where("timestamp", ">=", today.getTime()), orderBy("timestamp", "asc"))`
*   **Composite Index Required:**
    *   **Collection:** `visitor_logs`
    *   **Fields:**
        1.  `timestamp` (Ascending)
*   **Note:** The screenshot provided by the user does not show any indexes for the `visitor_logs` collection. This is a likely cause for the active visitor count being zero.

---

### 5. `processInformalLog`

*   **Query:** `query(collection(db, "informal_logs"), where("employeeId", "==", employee.id), where("date", "==", todayStr), where("timeIn", "==", null), limit(1))`
*   **Composite Index Required:**
    *   **Collection:** `informal_logs`
    *   **Fields:**
        1.  `employeeId` (Ascending)
        2.  `date` (Ascending)
        3.  `timeIn` (Ascending)
