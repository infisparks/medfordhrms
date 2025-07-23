// components/InvoiceDownload.tsx
"use client"

import type React from "react"
import { useRef } from "react"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import { Download, FileText } from "lucide-react"
import letterhead from "@/public/letterhead.png"
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"

/** ========== Data model interfaces ========== **/

interface ServiceItem {
  serviceName: string
  doctorName?: string
  type: "service" | "doctorvisit"
  amount: number
  createdAt?: string
}

interface Payment {
  id?: string
  amount: number
  paymentType: string
  type: "advance" | "refund" // Kept for consistency, though 'amountType' is new primary
  amountType: "advance" | "deposit" | "settlement" // NEW: amountType
  date: string
  through?: string // Added 'through' field
  remark?: string // Added 'remark' field
}

export interface BillingRecord {
  patientId: string
  ipdId: string
  uhid: string
  name: string
  mobileNumber: string
  address?: string // Ensure address is part of the interface
  age?: string | number
  ageUnit?: string // ADDED: ageUnit to BillingRecord interface
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string
  amount: number
  paymentType: string // This appears to be a leftover/duplicate, payments array is primary
  roomType?: string
  bed?: string
  admitDate?: string
  createdAt?: string
  time?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  doctor?: string // NEW: Add doctor ID from IPD info
  billNumber?: string // <-- Add bill number to BillingRecord
}

interface IDoctor {
  id: string
  name: string
  specialist: string
  department: "OPD" | "IPD" | "Both"
  opdCharge?: number
  ipdCharges?: Record<string, number>
}

type InvoiceDownloadProps = {
  record: BillingRecord
  beds: any
  doctors: IDoctor[] // NEW: Add doctors prop
  children?: React.ReactNode
}

export default function InvoiceDownload({ record, beds, doctors, children }: InvoiceDownloadProps) {
  const invoiceRef = useRef<HTMLDivElement>(null)

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
    return new Date(dateString).toLocaleDateString(undefined, options)
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const calculateDaysBetween = (startDate: string, endDate: string | Date) => {
    const start = new Date(startDate)
    const end = endDate instanceof Date ? endDate : new Date(endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  function convertNumberToWords(num: number): string {
    const a = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ]
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    if ((num = Math.floor(num)) === 0) return "Zero"
    if (num < 20) return a[num]
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "")
    if (num < 1000)
      return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convertNumberToWords(num % 100) : "")
    if (num < 1000000)
      return (
        convertNumberToWords(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + convertNumberToWords(num % 1000) : "")
      )
    if (num < 1000000000)
      return (
        convertNumberToWords(Math.floor(num / 1000000)) +
        " Million" +
        (num % 1000000 ? " " + convertNumberToWords(num % 1000000) : "")
      )
    return (
      convertNumberToWords(Math.floor(num / 1000000000)) +
      " Billion" +
      (num % 1000000000 ? " " + convertNumberToWords(num % 1000000000) : "")
    )
  }

  const billDate = new Date().toISOString()

  const generatePDF = async (): Promise<jsPDF> => {
    if (!invoiceRef.current) throw new Error("Invoice element not found.")
    await new Promise((resolve) => setTimeout(resolve, 100))
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 4, // Increased scale for better resolution and text clarity
      useCORS: true,
      backgroundColor: null,
    })
    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    })
    const pdfWidth = 595
    const pdfHeight = 842
    const topMargin = 120
    const bottomMargin = 80
    const sideMargin = 20
    const contentHeight = pdfHeight - topMargin - bottomMargin
    const scaleRatio = pdfWidth / canvas.width
    const fullContentHeightPts = canvas.height * scaleRatio
    let currentPos = 0
    let pageCount = 0
    while (currentPos < fullContentHeightPts) {
      pageCount += 1
      if (pageCount > 1) pdf.addPage()
      pdf.addImage(letterhead.src, "PNG", 0, 0, pdfWidth, pdfHeight, "", "FAST")
      const sourceY = Math.floor(currentPos / scaleRatio)
      const sourceHeight = Math.floor(contentHeight / scaleRatio)
      const pageCanvas = document.createElement("canvas")
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight
      const pageCtx = pageCanvas.getContext("2d")
      if (pageCtx) {
        pageCtx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)
      }
      const chunkImgData = pageCanvas.toDataURL("image/png")
      const chunkHeightPts = sourceHeight * scaleRatio
      pdf.addImage(chunkImgData, "PNG", sideMargin, topMargin, pdfWidth - 2 * sideMargin, chunkHeightPts, "", "FAST")
      currentPos += contentHeight
    }
    return pdf
  }

  const handleSendPdfOnWhatsapp = async () => {
    try {
      const pdf = await generatePDF()
      const pdfBlob = pdf.output("blob")
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.")
      const storage = getStorage()
      const storagePath = `invoices/invoice-${record.ipdId}-${Date.now()}.pdf`
      const fileRef = storageRef(storage, storagePath)
      await uploadBytes(fileRef, pdfBlob)
      const downloadUrl = await getDownloadURL(fileRef)
      const formattedNumber = record.mobileNumber.startsWith("91") ? record.mobileNumber : `91${record.mobileNumber}`
      const payload = {
        token: "99583991573",
        number: formattedNumber,
        imageUrl: downloadUrl,
        caption:
          "Dear Patient, please find attached your invoice PDF for your recent visit. Thank you for choosing our services.",
      }
      const response = await fetch("https://a.infispark.in/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error("Failed to send the invoice on WhatsApp.")
      }
      alert("Invoice PDF sent successfully on WhatsApp!")
    } catch (error) {
      console.error(error)
      alert("An error occurred while sending the invoice PDF on WhatsApp.")
    }
  }

  const handlePreviewInvoice = async () => {
    try {
      const pdf = await generatePDF()
      const blob = pdf.output("blob")
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } catch (error) {
      console.error(error)
      alert("Failed to preview the invoice PDF.")
    }
  }

  // Group Hospital Services
  const groupedHospitalServices = Object.values(
    record.services
      .filter((s) => s.type === "service")
      .reduce(
        (acc, service) => {
          const key = service.serviceName
          if (!acc[key]) {
            acc[key] = {
              serviceName: service.serviceName,
              quantity: 1,
              unitAmount: service.amount,
              totalAmount: service.amount,
            }
          } else {
            acc[key].quantity += 1
            acc[key].totalAmount = acc[key].unitAmount * acc[key].quantity
          }
          return acc
        },
        {} as {
          [key: string]: {
            serviceName: string
            quantity: number
            unitAmount: number
            totalAmount: number
          }
        },
      ),
  )

  // Group Consultant Charges by Doctor Name
  const groupedConsultantServices = Object.values(
    record.services
      .filter((s) => s.type === "doctorvisit")
      .reduce(
        (acc, service) => {
          const key = service.doctorName || "NoName"
          if (!acc[key]) {
            acc[key] = {
              doctorName: service.doctorName || "",
              quantity: 1,
              unitAmount: service.amount,
              totalAmount: service.amount,
            }
          } else {
            acc[key].quantity += 1
            acc[key].totalAmount = acc[key].unitAmount * acc[key].quantity
          }
          return acc
        },
        {} as {
          [key: string]: {
            doctorName: string
            quantity: number
            unitAmount: number
            totalAmount: number
          }
        },
      ),
  )

  // Determine the primary doctor for "Under care of Dr."
  const primaryDoctorName = record.doctor
    ? doctors.find((doc) => doc.id === record.doctor)?.name || "N/A"
    : groupedConsultantServices.length > 0
      ? groupedConsultantServices[0].doctorName
      : "N/A"
  // Get room and bed details
  const roomName = record.roomType || "N/A"
  const bedNumber =
    record.roomType && record.bed && beds[record.roomType]?.[record.bed]?.bedNumber
      ? beds[record.roomType][record.bed].bedNumber
      : "N/A"
  const bedType =
    record.roomType && record.bed && beds[record.roomType]?.[record.bed]?.type
      ? beds[record.roomType][record.bed].type
      : "N/A"

  // Totals Calculation
  const hospitalServiceTotal = record.services.filter((s) => s.type === "service").reduce((sum, s) => sum + s.amount, 0)
  const consultantChargeTotal = record.services
    .filter((s) => s.type === "doctorvisit")
    .reduce((sum, s) => sum + s.amount, 0)
  const discount = record.discount || 0
  const subtotal = hospitalServiceTotal + consultantChargeTotal
  const netTotal = subtotal - discount
  const deposit = record.amount
  const dueAmount = netTotal - deposit

  // Calculate day count
  const startDate = record.admitDate || record.createdAt || new Date().toISOString()
  const endDate = record.dischargeDate ? new Date(record.dischargeDate) : new Date()
  const dayCount = calculateDaysBetween(startDate, endDate)
  const showConsultantTable = groupedConsultantServices.length > 0

  /** ========== Render ========== **/
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleSendPdfOnWhatsapp}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition duration-300 flex items-center mb-4 text-xs"
      >
        Send Invoice PDF on WhatsApp
      </button>

      <button
        onClick={handlePreviewInvoice}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition duration-300 flex items-center mb-4 text-xs"
      >
        <FileText size={16} className="mr-1" />
        Preview Bill
      </button>

      <div
        ref={invoiceRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "520px",
          backgroundColor: "transparent",
        }}
      >
        <div className="text-[10px] text-gray-800 p-2 bg-transparent max-w-[520px]">
          {/* Header */}

          <div className="flex justify-between mb-2">
            {/* Left Column - Patient Details */}
            <div className="flex flex-col flex-1 text-left pr-2">
              {" "}
              {/* Added flex-1 and pr-2 for spacing */}
              <p>
                <strong>Patient Name:</strong> {record.name} ({record.uhid})
              </p>
              <p>
                <strong>Mobile No.:</strong> {record.mobileNumber}
              </p>
              <p>
                <strong>Address:</strong> {record.address || "Not provided"}
              </p>
              <p>
                <strong>Age:</strong> {record.age || "N/A"} {record.ageUnit || "years"}
              </p>
              <p>
                <strong>Under care of Dr.:</strong> {primaryDoctorName}
              </p>
              <p>
                <strong>Room:</strong> {roomName} / <strong>Bed:</strong> {bedNumber} ({bedType})
              </p>
            </div>

            {/* Right Column - Dates and Other Info */}
            <div className="text-right flex flex-col flex-1 pl-2">
              {" "}
              {/* Added flex-1 and pl-2 for spacing */}
              <p>
                <strong>Admit Date:</strong>{" "}
                {record.admitDate ? (
                  <>
                    {formatDate(record.admitDate)} / {record.time || formatTime(record.admitDate)}
                  </>
                ) : record.createdAt ? (
                  <>
                    {formatDate(record.createdAt)} / {formatTime(record.createdAt)}
                  </>
                ) : (
                  "N/A"
                )}
              </p>
              {record.dischargeDate && (
                <p>
                  <strong>Discharge Date:</strong> {formatDate(record.dischargeDate)} /{" "}
                  {formatTime(record.dischargeDate)}
                </p>
              )}
              <p>
                <strong>Bill Date:</strong> {formatDate(billDate)} / {formatTime(billDate)}
              </p>
              <p>
                <strong>Stay Duration:</strong> {dayCount} {dayCount === 1 ? "day" : "days"}
              </p>
              {/* Bill Number below Stay Duration */}
              {(record.billNumber || record.billNumber) && (
                <p>
                  <strong>Bill Number:</strong> {record.billNumber || record.billNumber}
                </p>
              )}
            </div>
          </div>

          {/* Consultant Charges Table (Conditional) */}
          {showConsultantTable && (
            <div className="my-2">
              <h3 className="font-semibold mb-1 text-[10px]">Consultant Charges</h3>
              <table className="w-full text-[7px] max-w-[520px]">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="pt-0.5 pb-1 px-1 text-left min-w-[70px]">Doctor Name</th>
                    <th className="pt-0.5 pb-1 px-1 text-center w-[25px]">Visited</th>
                    <th className="pt-0.5 pb-1 px-1 text-right w-[40px]">Unit (Rs)</th>
                    <th className="pt-0.5 pb-1 px-1 text-right w-[50px]">Total (Rs)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedConsultantServices.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-0.5 px-1">{item.doctorName}</td>
                      <td className="py-0.5 px-1 text-center">{item.quantity}</td>
                      <td className="py-0.5 px-1 text-right">{item.unitAmount.toLocaleString()}</td>
                      <td className="py-0.5 px-1 text-right">{item.totalAmount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1 text-right font-semibold text-[9px]">
                Consultant Charges Total: Rs. {consultantChargeTotal.toLocaleString()}
              </div>
            </div>
          )}

          {/* Hospital Service Charges Table */}
          <div className="my-2">
            <h3 className="font-semibold mb-1 text-[10px]">Hospital Service</h3>
            <table className="w-full text-[7px] max-w-[520px]">
              <thead>
                <tr className="bg-blue-100">
                  <th className="pt-1 pb-2 px-1 text-left min-w-[100px]">Service</th>
                  <th className="pt-1 pb-2 px-1 text-center w-[25px]">Qnty</th>
                  <th className="pt-1 pb-2 px-1 text-right w-[40px]">Unit (Rs)</th>
                  <th className="pt-1 pb-2 px-1 text-right w-[50px]">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {groupedHospitalServices.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-0 px-1">{item.serviceName}</td>
                    <td className="py-0 px-1 text-center">{item.quantity}</td>
                    <td className="py-0 px-1 text-right">{item.unitAmount.toLocaleString()}</td>
                    <td className="py-0 px-1 text-right">{item.totalAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-right font-semibold text-[9px]">
              Hospital Services Total: Rs. {hospitalServiceTotal.toLocaleString()}
            </div>
          </div>

          {/* Final Summary Section */}
          <div className="flex flex-col items-start mt-2 text-[8px] max-w-[520px] w-full">
            <div className="grid grid-cols-2 gap-x-4 w-full">
              <div className="flex flex-col space-y-0.5">
                {" "}
                {/* Left side for amounts in words */}
                {dueAmount > 0 && (
                  <p>
                    <strong>Due Amount in Words:</strong> {convertNumberToWords(dueAmount)} Rupees Only
                  </p>
                )}
                {dueAmount < 0 && (
                  <p>
                    <strong>Refund Amount in Words:</strong> {convertNumberToWords(Math.abs(dueAmount))} Rupees Only
                  </p>
                )}
              </div>

              <div className="flex flex-col space-y-0.5 text-right">
                {" "}
                {/* Right side for numerical summary */}
                <p className="flex justify-between w-full">
                  <span>Total Amount:</span>
                  <span>Rs. {subtotal.toLocaleString()}</span>
                </p>
                {discount > 0 && (
                  <p className="flex justify-between w-full text-green-600 font-bold">
                    <span>Discount:</span>
                    <span>- Rs. {discount.toLocaleString()}</span>
                  </p>
                )}
                <hr className="my-0.5 border-gray-300" />
                <p className="flex justify-between w-full font-bold">
                  <span>Net Total:</span>
                  <span>Rs. {netTotal.toLocaleString()}</span>
                </p>
                <p className="flex justify-between w-full">
                  <span>Total Amount:</span>
                  <span>Rs. {deposit.toLocaleString()}</span>
                </p>
                <p
                  className={`flex justify-between w-full font-semibold ${
                    dueAmount < 0 ? "text-blue-600" : "text-red-600"
                  }`}
                >
                  <span>{dueAmount < 0 ? "Refund Amount:" : "Due Amount:"}</span>
                  <span>
                    {dueAmount < 0 ? "Rs. " + Math.abs(dueAmount).toLocaleString() : "Rs. " + dueAmount.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Payment History Section - Moved below Final Summary */}
          {record.payments && record.payments.length > 0 && (
            <div className="my-2 max-w-[520px] w-full">
              <h3 className="font-semibold mb-1 text-[10px]">Payment History</h3>
              <div className="flex">
                <table className="w-full text-[7px]">
                  {" "}
                  {/* Full width like service tables */}
                  <thead>
                    <tr className="bg-blue-100">
                      {" "}
                      {/* MODIFIED: Added background color */}
                      {/* The vertical alignment should be on the <th> elements for table cells */}
                      <th className="pt-0.5 pb-1 px-1 text-left w-[120px]" style={{ verticalAlign: "middle" }}>
                        Remarks
                      </th>
                      <th className="pt-0.5 pb-1 px-1 text-left" style={{ verticalAlign: "middle" }}>
                        Date
                      </th>
                      <th className="pt-0.5 pb-1 px-1 text-left" style={{ verticalAlign: "middle" }}>
                        Type
                      </th>
                      <th className="pt-0.5 pb-1 px-1 text-left" style={{ verticalAlign: "middle" }}>
                        Through
                      </th>
                      <th className="pt-0.5 pb-1 px-1 text-right" style={{ verticalAlign: "middle" }}>
                        Amount (Rs)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.payments.map((payment, idx) => {
                      // Determine 'through' value if missing
                      let displayThrough = payment.through
                      if (!displayThrough) {
                        if (payment.paymentType === "cash") {
                          displayThrough = "Cash"
                        } else if (payment.paymentType === "online" || payment.paymentType === "card") {
                          displayThrough = "Online"
                        } else {
                          displayThrough = "N/A"
                        }
                      }

                      return (
                        <tr key={idx}>
                          <td className="py-0.5 px-1">{payment.remark ? payment.remark : "-"}</td>
                          <td className="py-0.5 px-1">{formatDate(payment.date)}</td>
                          <td className="py-0.5 px-1 capitalize">{payment.amountType}</td>
                          <td className="py-0.5 px-1 capitalize">{displayThrough}</td>
                          <td className="py-0.5 px-1 text-right">{payment.amount.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className=" font-bold">
                      <td colSpan={4} className="py-1 px-1 text-right">
                        Total Paid:
                      </td>{" "}
                      {/* Increased padding for total row */}
                      <td className="py-1 px-1 text-right text-red-600">Rs. {record.amount.toLocaleString()}</td>{" "}
                      {/* Increased padding */}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}