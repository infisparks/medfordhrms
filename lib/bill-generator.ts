// lib/bill-generator.ts
import { db } from "@/lib/firebase"; // Ensure this path is correct for your Firebase config
import { ref, runTransaction } from "firebase/database";
// import { format } from "date-fns"; // No longer needed for bill number formatting itself

/**
 * Generates the next sequential bill number globally.
 * Uses a Firebase transaction to ensure atomicity and prevent race conditions.
 * Format: B[XXXX], e.g., B0001
 * @returns {Promise<string>} The formatted bill number.
 */
export async function generateNextBillNumber(): Promise<string> {
  const billCounterRef = ref(db, `billCounters/lastnumber`); // Point to the single global counter

  let nextCounterValue: number = 0;

  await runTransaction(billCounterRef, (currentData) => {
    if (currentData === null) {
      nextCounterValue = 1; // Start from 1 if no counter exists
      return 1;
    } else {
      nextCounterValue = currentData + 1;
      return nextCounterValue;
    }
  });

  // Removed the datePrefix
  const formattedCounter = String(nextCounterValue).padStart(4, "0"); // e.g., 0001

  return `B${formattedCounter}`; // Simplified format
}