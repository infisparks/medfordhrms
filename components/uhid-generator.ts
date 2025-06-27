import { ref, runTransaction } from "firebase/database"
import { db } from "@/lib/firebase" // Assuming db is initialized Firebase Realtime Database instance

/**
 * Generates a new UHID in the format GMH-YYMMDD-00001 and atomically increments the counter in Firebase.
 * @returns A promise that resolves to the newly generated UHID string.
 */
export async function generateNextUHID(): Promise<string> {
  const date = new Date()
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")

  let nextCounter = 0
  const counterRef = ref(db, "ipdcounter/lastappoinment")

  try {
    await runTransaction(counterRef, (currentData) => {
      if (currentData === null) {
        nextCounter = 1
        return 1 // Initialize to 1 if not exists
      } else {
        nextCounter = currentData + 1
        return nextCounter // Increment
      }
    })
  } catch (error) {
    console.error("UHID counter transaction failed:", error)
    // Fallback: If transaction fails, generate a unique ID to prevent blocking,
    // though this might lead to non-sequential UHIDs in rare cases.
    // For a robust solution, consider server-side generation or retry logic.
    nextCounter = Date.now() % 100000 // Simple fallback, not ideal for production
  }

  const formattedCounter = String(nextCounter).padStart(5, "0")
  return `GMH-${yy}${mm}${dd}-${formattedCounter}`
}
