"use client";

import React, { useEffect, useState, useRef, useMemo, Fragment } from "react";
import { db } from "@/lib/firebase" // Assuming this is correctly configured for Firebase Realtime Database
import { ref, onValue } from "firebase/database"
import { ToastContainer, toast } from "react-toastify"
import { format, isSameDay, parseISO, subDays } from "date-fns"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import "react-toastify/dist/ReactToastify.css"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// =============== INTERFACES ===============

interface Doctor {
  id: string
  name: string
  department: string
  specialist: string
  opdCharge: number
  ipdCharges: Record<string, number>
}

interface Bed {
  bedNumber: string
  status: string
  type: string
}

interface OPDAppointment {
  amount: number
  createdAt: string
  date: string
  doctor: string
  gender: string
  message?: string
  name: string
  paymentMethod?: string
  phone: string
  serviceName?: string
  time: string
  referredBy?: string
  appointmentType: string
}

interface MortalityReport {
  admissionDate: string
  dateOfDeath: string
  medicalFindings: string
  timeSpanDays: number
  createdAt: string
  enteredBy: string
  patientId: string
  patientName: string
}

interface PatientInfo {
  name: string
  gender: string
  age: string
  phone: string
  address?: string
  uhid: string
}

interface OTData {
  date: string
  time: string
  message: string
  createdAt: string
  updatedAt: string
  patientId: string
  ipdId: string
  patientName?: string
  patientGender?: string
}

interface IPDAdmission {
  admitDate: string
  admissionSource: string
  admissionTime: string
  admissionType: string
  bed: string
  createdAt: string
  dischargeDate?: string
  doctor: string
  name: string
  phone: string
  referDoctor?: string
  relativeAddress: string
  relativeName: string
  relativePhone: string
  roomType: string
  status: string
  uhid: string
  id?: string
}

// =============== MAIN COMPONENT ===============

export default function DailyPerformanceReport() {
  // ---- Date state for date picker ----
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [beds, setBeds] = useState<Record<string, Record<string, Bed>>>({})
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [mortalityReports, setMortalityReports] = useState<MortalityReport[]>([])
  const [otRecords, setOtRecords] = useState<OTData[]>([])
  const [patientInfo, setPatientInfo] = useState<Record<string, PatientInfo>>({})
  const [ipdActive, setIpdActive] = useState<Record<string, IPDAdmission>>({})
  const [allOpdModalities, setAllOpdModalities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalOPD: 0,
    totalCasualty: 0,
    totalMortality: 0,
    totalOT: 0,
    totalBeds: 0,
    bedsOccupied: 0,
    bedsAvailable: 0,
  })
  const reportRef = useRef<HTMLDivElement>(null)

  // ---- Fetches not tied to date ----
  useEffect(() => {
    const doctorsRef = ref(db as any, "doctors")
    const unsub = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      const doctorsList: Doctor[] = []
      if (data) {
        Object.entries(data).forEach(([id, doctorData]: [string, any]) => {
          doctorsList.push({
            id,
            name: doctorData.name || "",
            department: doctorData.department || "",
            specialist: doctorData.specialist || "",
            opdCharge: Number(doctorData.opdCharge) || 0,
            ipdCharges: doctorData.ipdCharges || {},
          })
        })
      }
      setDoctors(doctorsList)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const bedsRef = ref(db as any, "beds")
    const unsub = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      setBeds(data || {})
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const patientInfoRef = ref(db as any, "patients/patientinfo")
    const unsub = onValue(patientInfoRef, (snapshot) => {
      const data = snapshot.val()
      setPatientInfo(data || {})
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const ipdActiveRef = ref(db as any, "patients/ipdactive")
    const unsub = onValue(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      setIpdActive(data || {})
    })
    return () => unsub()
  }, [])

  // ---- Fetches tied to selectedDate ----
  useEffect(() => {
    const today = selectedDate
    const todayStr = format(today, "yyyy-MM-dd")
    const fetchedAppointments: OPDAppointment[] = []
    const opdByDateRef = ref(db as any, `patients/opddetail/${todayStr}`)
    const unsub = onValue(
      opdByDateRef,
      (snapshot) => {
        const data = snapshot.val()
        fetchedAppointments.length = 0
        if (data) {
          Object.entries(data).forEach(([patientId, appointments]: [string, any]) => {
            Object.entries(appointments).forEach(([appointmentId, appt]: [string, any]) => {
              const apptCreatedAt = appt.createdAt ? parseISO(appt.createdAt) : null
              if (apptCreatedAt && isSameDay(apptCreatedAt, today)) {
                const isCasualtyFromModalities = appt.modalities?.some(
                  (mod: any) => mod.type?.toLowerCase() === "casualty",
                )
                const isCasualtyFromAppointmentType = appt.appointmentType?.toLowerCase() === "casualty"
                const appointmentType =
                  isCasualtyFromAppointmentType || isCasualtyFromModalities
                    ? "casualty"
                    : appt.appointmentType || "visithospital"
                fetchedAppointments.push({
                  amount: Number(appt.payment?.totalPaid) || 0,
                  appointmentType: appointmentType,
                  createdAt: appt.createdAt || "",
                  date: appt.date || "",
                  doctor: appt.doctor || "",
                  gender: patientInfo[patientId]?.gender || "N/A",
                  message: appt.message || "",
                  name: appt.name || patientInfo[patientId]?.name || "N/A",
                  paymentMethod: appt.payment?.paymentMethod || "cash",
                  phone: appt.phone || patientInfo[patientId]?.phone || "N/A",
                  serviceName: appt.modalities?.[0]?.service || appt.modalities?.[0]?.type || "",
                  time: appt.time || "",
                  referredBy: appt.referredBy || appt.referBy || "",
                })
              }
            })
          })
        }
        setOpdAppointments(fetchedAppointments)
        // Flatten all modalities for summary
        const allModalities: any[] = []
        if (data) {
          Object.entries(data).forEach(([patientId, appointments]: [string, any]) => {
            Object.entries(appointments).forEach(([appointmentId, appt]: [string, any]) => {
              if (appt.modalities && Array.isArray(appt.modalities)) {
                appt.modalities.forEach((mod: any) => allModalities.push(mod))
              }
            })
          })
        }
        setAllOpdModalities(allModalities)
      },
      (error) => {
        console.error("Error fetching OPD records:", error)
        toast.error("Failed to load OPD records.", { position: "top-right" })
      },
    )
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientInfo, selectedDate])

  useEffect(() => {
    const today = selectedDate
    const todayStr = format(today, "yyyy-MM-dd")
    const mortalityList: MortalityReport[] = []
    const mortalityByDateRef = ref(db as any, `patients/mortalitydetail/${todayStr}`)
    const unsub = onValue(
      mortalityByDateRef,
      (snapshot) => {
        const data = snapshot.val()
        mortalityList.length = 0
        if (data) {
          Object.entries(data).forEach(([patientId, reports]: [string, any]) => {
            Object.entries(reports).forEach(([mortalityId, report]: [string, any]) => {
              const reportCreatedAt = report.createdAt ? parseISO(report.createdAt) : null
              if (reportCreatedAt && isSameDay(reportCreatedAt, today)) {
                mortalityList.push({
                  admissionDate: report.admissionDate || "",
                  dateOfDeath: report.dateOfDeath || "",
                  medicalFindings: report.medicalFindings || "",
                  timeSpanDays: report.timeSpanDays || 0,
                  createdAt: report.createdAt || "",
                  enteredBy: report.enteredBy || "",
                  patientId,
                  patientName: patientInfo[patientId]?.name || "N/A",
                })
              }
            })
          })
        }
        setMortalityReports(mortalityList)
      },
      (error) => {
        console.error("Error fetching mortality reports:", error)
        toast.error("Failed to load mortality reports.", { position: "top-right" })
      },
    )
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientInfo, selectedDate])

  useEffect(() => {
    const today = selectedDate
    const todayStr = format(today, "yyyy-MM-dd")
    const yesterday = subDays(today, 1)
    const yesterdayStr = format(yesterday, "yyyy-MM-dd")
    const fetchedOtList: OTData[] = []
    const dateKeysToFetch = [todayStr]
    if (yesterdayStr !== todayStr) {
      dateKeysToFetch.push(yesterdayStr)
    }
    const activeUnsubs: (() => void)[] = []
    let completedFetches = 0
    dateKeysToFetch.forEach((dateKey) => {
      const otByDateRef = ref(db as any, `patients/ot/${dateKey}`)
      const unsub = onValue(
        otByDateRef,
        (snapshot) => {
          const data = snapshot.val()
          completedFetches++
          if (data) {
            Object.entries(data).forEach(([patientId, ipdEntries]: [string, any]) => {
              Object.entries(ipdEntries).forEach(([ipdId, otRecord]: [string, any]) => {
                const recordCreatedAt = otRecord.createdAt ? parseISO(otRecord.createdAt) : null
                if (recordCreatedAt && isSameDay(recordCreatedAt, today)) {
                  fetchedOtList.push({
                    date: otRecord.date || "",
                    time: otRecord.time || "",
                    message: otRecord.message || "",
                    createdAt: otRecord.createdAt || new Date().toISOString(),
                    updatedAt: otRecord.updatedAt || new Date().toISOString(),
                    patientId,
                    ipdId,
                  })
                }
              })
            })
          }
          if (completedFetches === dateKeysToFetch.length) {
            const uniqueRecords = Array.from(
              new Map(
                fetchedOtList.map((item) => [`${item.patientId}-${item.ipdId}-${item.createdAt}`, item]),
              ).values(),
            )
            setOtRecords(uniqueRecords)
          }
        },
        (error) => {
          console.error(`Error fetching OT records for date key ${dateKey}:`, error)
          toast.error(`Failed to load OT records for ${dateKey}.`, { position: "top-right" })
          completedFetches++
          if (completedFetches === dateKeysToFetch.length) {
            const uniqueRecords = Array.from(
              new Map(
                fetchedOtList.map((item) => [`${item.patientId}-${item.ipdId}-${item.createdAt}`, item]),
              ).values(),
            )
            setOtRecords(uniqueRecords)
          }
        },
      )
      activeUnsubs.push(unsub)
    })
    return () => activeUnsubs.forEach((unsub) => unsub())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // ---------- Metrics ----------
  useEffect(() => {
    const totalOPD = opdAppointments.filter((appt) => appt.appointmentType !== "casualty").length
    const totalCasualty = opdAppointments.filter((appt) => appt.appointmentType === "casualty").length
    const totalMortality = mortalityReports.length
    const totalOT = otRecords.length
    let totalBeds = 0
    let bedsOccupied = 0
    let bedsAvailable = 0
    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        totalBeds++
        if (beds[ward][bedKey].status?.toLowerCase() === "occupied") {
          bedsOccupied++
        } else {
          bedsAvailable++
        }
      })
    })
    setMetrics({
      totalOPD,
      totalCasualty,
      totalMortality,
      totalOT,
      totalBeds,
      bedsOccupied,
      bedsAvailable,
    })
    setLoading(false)
  }, [opdAppointments, mortalityReports, otRecords, beds])

  // ---------- Derived Data ----------
  const bedDetails = useMemo(() => {
    const details: Array<{ ward: string; bedNumber: string; bedKey: string; status: string; type: string }> = []
    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        details.push({
          ward,
          bedNumber: beds[ward][bedKey].bedNumber || "",
          bedKey,
          status: beds[ward][bedKey].status || "Available",
          type: beds[ward][bedKey].type || "standard",
        })
      })
    })
    return details
  }, [beds])

  const bedSummary = useMemo(() => getBedSummary(beds), [beds])
  const serviceSummary = useMemo(() => getServiceSummary(allOpdModalities), [allOpdModalities])

  const wardKeys = Object.keys(beds)
  const wardSummary = wardKeys.map((ward) => {
    const bedList = Object.values(beds[ward] || {})
    const total = bedList.length
    const available = bedList.filter((bed) => (bed.status || "").toLowerCase() === "available").length
    return { ward, total, available }
  })

  // ---------- Table/Counts for current date ----------
  const todayStr = format(selectedDate, "yyyy-MM-dd")
  const otToday = Object.values(otRecords || []).filter(
    (ot: any) => ot.createdAt && ot.createdAt.slice(0, 10) === todayStr,
  ).length
  const ipdActiveList = Object.values(ipdActive || {})
  const ipdToday = ipdActiveList.filter((adm: any) => adm.admitDate && adm.admitDate.slice(0, 10) === todayStr).length
  let xrayCount = 0
  allOpdModalities.forEach((mod: any) => {
    if ((mod.type || "").toLowerCase() === "xray") xrayCount++
  })

  // ---------- PDF ----------
  const handleDownloadReport = async () => {
    if (!reportRef.current) return

    // Add 'pdf-mode' class for compact PDF styling
    reportRef.current.classList.add("pdf-mode")

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" })
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    // Temporarily adjust styles for PDF generation if needed (e.g., remove gradients for cleaner print)
    const originalStyles = reportRef.current.style.cssText
    reportRef.current.style.background = "none" // Remove background gradient for PDF
    reportRef.current.style.boxShadow = "none" // Remove shadow for PDF

    const canvas = await html2canvas(reportRef.current, { scale: 2 })
    const imgData = canvas.toDataURL("image/png")

    // Restore original styles and remove 'pdf-mode' class
    reportRef.current.style.cssText = originalStyles
    reportRef.current.classList.remove("pdf-mode")

    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight
    }

    pdf.save(`Daily_Report_${todayStr}.pdf`)
    toast.success("Report downloaded successfully!", { position: "top-right" })
  }

  // ---------- RENDER ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white p-4 sm:p-6">
      <ToastContainer />
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* ------------ HEADER & DATE PICKER ------------- */}
        <div className="flex flex-col md:flex-row items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-blue-100 to-white">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <label htmlFor="date-picker" className="font-semibold text-gray-700 text-lg">
              Select Date:
            </label>
            <DatePicker
              id="date-picker"
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date || new Date())}
              dateFormat="yyyy-MM-dd"
              maxDate={new Date()}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200 shadow-sm text-base"
            />
          </div>
          <Button
            onClick={handleDownloadReport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg shadow-lg text-lg font-semibold transition-colors duration-200"
          >
            Download PDF
          </Button>
        </div>

        <div ref={reportRef} className="space-y-8 p-6 sm:p-8 report-content">
          {/* ------------ DAILY HOSPITAL REPORT ------------- */}
          <Card className="shadow-lg border border-gray-100 rounded-xl">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-blue-800 tracking-tight">Daily Hospital Report ({todayStr})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50 hover:bg-blue-50">
                    <TableHead className="w-[50px] text-blue-700">Sr</TableHead>
                    <TableHead className="text-blue-700">Description</TableHead>
                    <TableHead className="text-center text-blue-700">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>1</TableCell>
                    <TableCell>Total No. of Patients in OPD</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{serviceSummary.OPD}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>2</TableCell>
                    <TableCell>No. of Patients in Casualty</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{serviceSummary.Casualty}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>3</TableCell>
                    <TableCell>Total OT Today</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{otToday}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>4</TableCell>
                    <TableCell>Total IPD Today</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{ipdToday}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>5</TableCell>
                    <TableCell>No. of Patients Sent for X-Ray</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{xrayCount}</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell>6</TableCell>
                    <TableCell className="font-medium">No. of Other Investigations</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell className="pl-8">- Echo</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{serviceSummary.Echo}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell className="pl-8">- Sonography</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">
                      {serviceSummary.Sonography}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell className="pl-8">- ECG</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{serviceSummary.ECG}</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell>7</TableCell>
                    <TableCell>No. of Dialysis</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{serviceSummary.Dialysis}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ------------ WARD/ROOM BED AVAILABILITY ------------- */}
          <Card className="shadow-lg border border-gray-100 rounded-xl">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-blue-800 tracking-tight">Ward/Room Bed Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 bg-white rounded-lg">
                  <tbody>
                    {chunkArray(wardSummary, 5).map((chunk, rowIdx) => (
                      <Fragment key={rowIdx}>
                        <tr className="bg-blue-50">
                          {chunk.map(({ ward }) => (
                            <th
                              key={ward}
                              className="px-4 py-2 text-center text-blue-700 font-semibold text-base border-b border-gray-200 capitalize whitespace-nowrap"
                            >
                              {ward.replace(/_/g, " ")}
                            </th>
                          ))}
                          {/* Pad with empty headers if less than 5 */}
                          {Array.from({ length: 5 - chunk.length }).map((_, i) => (
                            <th key={`empty-header-${i}`} className="px-4 py-2 border-b border-gray-200"></th>
                          ))}
                        </tr>
                        <tr>
                          {chunk.map(({ ward, total, available }) => (
                            <td
                              key={ward}
                              className={
                                "px-4 py-3 text-center font-bold text-lg border-b border-gray-100 " +
                                (available > 0 ? "text-green-700" : "text-red-700")
                              }
                            >
                              {total} / {available}
                            </td>
                          ))}
                          {/* Pad with empty cells if less than 5 */}
                          {Array.from({ length: 5 - chunk.length }).map((_, i) => (
                            <td key={`empty-cell-${i}`}></td>
                          ))}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <style jsx global>{`
        .report-content.pdf-mode .grid > div,
        .report-content.pdf-mode .grid {
          min-width: 60px !important;
          min-height: 40px !important;
          padding: 4px !important;
          font-size: 10px !important;
        }
        .report-content.pdf-mode .text-lg {
          font-size: 12px !important;
        }
        .report-content.pdf-mode .text-base {
          font-size: 10px !important;
        }
        .report-content.pdf-mode .text-2xl {
          font-size: 16px !important;
        }
        .report-content.pdf-mode .p-4,
        .report-content.pdf-mode .p-6,
        .report-content.pdf-mode .p-8 {
          padding: 4px !important;
        }
      `}</style>
    </div>
  )
}

// =============== UTILITY FUNCTIONS ===============

function getBedSummary(beds: Record<string, Record<string, Bed>>) {
  const summary: Record<string, { total: number; occupied: number; available: number }> = {}
  Object.entries(beds).forEach(([ward, bedMap]) => {
    if (!summary[ward]) summary[ward] = { total: 0, occupied: 0, available: 0 }
    Object.values(bedMap).forEach((bed) => {
      summary[ward].total++
      if ((bed.status || "").toLowerCase().trim() === "occupied") summary[ward].occupied++
      else summary[ward].available++
    })
  })
  return summary
}

function getServiceSummary(modalities: any[]) {
  let OPD = 0,
    Casualty = 0,
    Echo = 0,
    Sonography = 0,
    ECG = 0,
    Dialysis = 0
  modalities.forEach((mod) => {
    const type = (mod.type || "").toLowerCase()
    const service = (mod.service || "").toLowerCase()
    if (type === "consultation") {
      OPD++
    } else if (type === "casualty") {
      if (service.includes("ecg")) ECG++
      else if (service.includes("dialysis")) Dialysis++
      else Casualty++
    } else if (type === "cardiology") {
      Echo++
    } else if (type === "radiology") {
      Sonography++
    }
  })
  return { OPD, Casualty, Echo, Sonography, ECG, Dialysis }
}

// Utility to chunk array into subarrays of given size
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
