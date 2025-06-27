import { jsPDF } from "jspdf"
import letterhead from "@/public/letterhead.png"
import type { IPDFormInput } from "./page" // Import the interface from the main component

/**
 * Helper function to initialize jsPDF document with letterhead.
 */
const initializeDoc = () => {
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "A4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight)
  return { doc, pageWidth, pageHeight }
}

/**
 * Generates and downloads an English PDF letterhead with IPD admission details.
 * This function is designed for automatic download after successful registration.
 * @param data The IPD form input data.
 * @param uhid The generated Universal Health ID.
 */
export function generateAndDownloadEnglishLetterhead(data: IPDFormInput, uhid: string) {
  const { doc, pageWidth, pageHeight } = initializeDoc()
  let y = 120
  const left = 50
  const right = pageWidth - 50
  const lh = 14

  const newPageIfNeeded = () => {
    if (y > pageHeight - 50) {
      doc.addPage()
      doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight)
      y = 120
    }
  }

  const sep = () => {
    doc.setDrawColor(180)
    doc.setLineWidth(0.6)
    doc.line(left, y, right, y)
    y += lh
    newPageIfNeeded()
  }

  const addField = (label: string, value?: string) => {
    doc.setFont("Helvetica", "bold").setFontSize(10).text(label, left, y)
    doc.setFont("Helvetica", "normal").text(value || "N/A", left + 120, y)
    y += lh
    newPageIfNeeded()
  }

  const addSection = (title: string) => {
    y += 20
    newPageIfNeeded()
    doc.setFont("Helvetica", "bold").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
    y += 4
    sep()
    doc.setFont("Helvetica", "normal").setFontSize(10).setTextColor(0)
  }

  /* ---------- Title ---------- */
  doc
    .setFont("Helvetica", "bold")
    .setFontSize(14)
    .setTextColor(0, 0, 128)
    .text("Patient's Admission Summary", pageWidth / 2, y, { align: "center" })
  y += lh + 8
  sep()

  /* ---------- Patient details ---------- */
  addSection("Patient Details")
  addField("UHID", uhid || "NA") // Use the passed UHID
  addField("Patient Name", data.name || "NA")
  addField("Age / Sex", `${data.age || "NA"} Yrs / ${data.gender?.label || "NA"}`)
  addField("Under Care of Doctor", data.doctor?.label || "NA")
  addField("Address", data.address || "NA")
  addField("Number", data.phone || "NA")

  /* ---------- Admission ---------- */
  addSection("Admission Details")
  const adDate = data.date ? data.date.toLocaleDateString() : "N/A"
  const adTime =
    data.time || (data.date ? data.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A")
  addField("Admission Date / Time", `${adDate} - ${adTime}`)
  addField("Referral Doctor", data.referDoctor || "NA")

  /* ---------- Room / Ward ---------- */
  addSection("Room / Ward")
  addField("Room / Ward", data.roomType?.label || "NA")
  addField("Bed No", data.bed?.label || "NA")

  /* ---------- Instructions ---------- */
  addSection("Instructions")
  const instructions = [
    "Please have an attendant to accompany you till discharge.",
    "Billing Cycle will be of 24 hours from the date and time of admission.",
    "Consultant Visit charges will be charged as per their visits.",
    "All other services like Oxygen, Nebulizer, Monitor, Syringe pump, Ventilator, BiPAP, etc., are chargeable.",
    "Any other visiting consultants other than the treating doctor will be charged extra.",
    "Normal delivery basic package consists of 1 induction; if more than that, it will be charged.",
    "Normal delivery basic package includes 1 pediatric visit.",
    "Consumption of alcohol, smoking, chewing gum, and spitting are strictly prohibited.",
    "Patients are advised not to carry cash or wear/keep any jewelry during hospitalization. The hospital is not responsible for any kind of loss.",
    "Photography is prohibited on hospital premises.",
    "If the patient is required to be transferred to the ICU/Room/Ward, the room/bed they were occupying prior to transfer is to be vacated by the attendants.",
    "For any further assistance, you may reach us on 9769000091 / 9769000092",
  ]
  instructions.forEach((txt) => {
    doc.setFont("Helvetica", "bold").setTextColor(0, 0, 128).text("•", left, y)
    doc
      .setFont("Helvetica", "normal")
      .setTextColor(60)
      .splitTextToSize(txt, right - left - 15)
      .forEach((line: string | string[]) => {
        doc.text(line, left + 15, y)
        y += lh
        newPageIfNeeded()
      })
  })

  /* ---------- Acknowledgment & Sign ---------- */
  y += lh
  newPageIfNeeded()
  doc
    .setFont("Helvetica", "bold")
    .setTextColor(0)
    .text("I have read all the information mentioned above and hereby acknowledge and confirm:", left, y)
  y += lh * 2
  newPageIfNeeded()

  doc
    .setFont("Helvetica", "normal")
    .text("Signature: ______________", left, y)
    .text("Billing Executive: ______________", right, y, { align: "right" })
  y += lh * 2
  newPageIfNeeded()
  doc.text("Name: ______________", left, y)
  y += lh * 1.5
  newPageIfNeeded()
  doc.text("Relation with Patient: ______________", left, y)

  doc.save(`IPD_Admission_Letter_${data.name || "Patient"}.pdf`)
}
