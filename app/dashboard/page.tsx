"use client"

import type React from "react"
import { useEffect, useState, useMemo, useCallback } from "react"
import { db } from "@/lib/firebase"
import { ref, get, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database"
import { format, differenceInDays, addDays } from "date-fns"
import { Bar } from "react-chartjs-2"
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Dialog } from "@headlessui/react"
import {
  Search,
  Activity,
  X,
  DollarSign,
  Layers,
  Stethoscope,
  Filter,
  RefreshCw,
  CalendarDays,
  Clock,
  User,
  FileText,
  CreditCard,
  UserCheck,
} from "lucide-react"

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ----- Type Definitions -----

interface Doctor {
  name: string
  opdCharge?: number
  department?: string
  specialist?: string
}

interface IModality {
  charges: number
  doctor?: string
  specialist?: string
  type: "consultation" | "casualty" | "xray" | "pathology" | "ipd" | "radiology" | "custom"
  visitType?: string
  service?: string
}

interface IPayment {
  cashAmount: number
  createdAt: string
  discount: number
  onlineAmount: number
  paymentMethod: string
  totalCharges: number
  totalPaid: number
}

interface OPDAppointment {
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  appointmentType: string
  createdAt: string
  enteredBy: string
  message: string
  modalities: IModality[]
  opdType: string
  payment: IPayment
  referredBy: string
  study: string
  visitType: string
  type: "OPD"
}

interface IPDService {
  amount: number
  serviceName: string
  type: string
  doctorName?: string
  createdAt: string
}

interface IPDPayment {
  amount: number
  paymentType: "cash" | "online"
  type: "advance" | "refund"
  date: string
}

interface IPDAppointment {
  id: string
  patientId: string
  uhid: string
  name: string
  phone: string
  admissionDate: string
  admissionTime: string
  doctor: string
  doctorId: string
  roomType: string
  status: string
  services: IPDService[]
  totalAmount: number // This is total service amount (gross)
  totalDeposit: number // This is net deposit (advances - refunds)
  totalRefunds: number
  discount: number // NEW: Discount amount for IPD
  payments: IPDPayment[]
  createdAt: string
  remainingAmount?: number // This will be (totalAmount - discount) - totalDeposit
  type: "IPD"
  details?: any
}

interface OTAppointment {
  id: string
  patientId: string
  uhid: string
  name: string
  phone: string
  date: string
  time: string
  message: string
  createdAt: string
  ipdId: string
  type: "OT"
}

type CombinedAppointment = OPDAppointment | IPDAppointment | OTAppointment

interface PatientInfo {
  uhid: string
  name: string
  phone: string
  age: number
  address: string
  gender: string
}

interface FilterState {
  searchQuery: string
  filterType: "week" | "today" | "month" | "dateRange"
  selectedMonth: string
  startDate: string
  endDate: string
}

// ----- Helpers -----

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const getThisWeekRange = () => {
  const now = new Date()
  return {
    start: format(addDays(now, -6), "yyyy-MM-dd"),
    end: format(now, "yyyy-MM-dd"),
  }
}

const getTodayDate = () => format(new Date(), "yyyy-MM-dd")

const getMonthRange = (monthYear: string) => {
  if (!monthYear) return { start: "", end: "" }
  const [year, month] = monthYear.split("-").map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

// ----- Dashboard Component -----

const DashboardPage: React.FC = () => {
  // State
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [ipdAppointments, setIpdAppointments] = useState<IPDAppointment[]>([])
  const [otAppointments, setOtAppointments] = useState<OTAppointment[]>([])
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({})
  const [patientCache, setPatientCache] = useState<{ [key: string]: PatientInfo }>({})
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: "",
    filterType: "today", // Set default to 'today'
    selectedMonth: format(new Date(), "yyyy-MM"),
    startDate: "",
    endDate: "",
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [selectedAppointment, setSelectedAppointment] = useState<CombinedAppointment | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [modalLoading, setModalLoading] = useState<boolean>(false)

  // New states for patient search and appointments modal
  const [searchedPatients, setSearchedPatients] = useState<PatientInfo[]>([])
  const [selectedPatientForAppointments, setSelectedPatientForAppointments] = useState<PatientInfo | null>(null)
  const [patientAppointmentsModalOpen, setPatientAppointmentsModalOpen] = useState<boolean>(false)
  const [patientAppointmentsLoading, setPatientAppointmentsLoading] = useState<boolean>(false)
  const [patientAllAppointments, setPatientAllAppointments] = useState<CombinedAppointment[]>([])

  // Data download size tracking
  const [totalDownloadedBytes, setTotalDownloadedBytes] = useState(0)
  const [searchDownloadedBytes, setSearchDownloadedBytes] = useState(0)

  // Compute current date range
  const currentDateRange = useMemo(() => {
    switch (filters.filterType) {
      case "today":
        return { start: getTodayDate(), end: getTodayDate() }
      case "month":
        return getMonthRange(filters.selectedMonth)
      case "dateRange":
        return { start: filters.startDate, end: filters.endDate }
      default:
        return getThisWeekRange()
    }
  }, [filters])

  // Fetch doctors once
  useEffect(() => {
    get(ref(db, "doctors")).then((snap) => {
      if (snap.exists()) setDoctors(snap.val() as any)
    })
  }, [])

  // Cache patient info
  const fetchPatientInfo = useCallback(
    async (id: string): Promise<PatientInfo | null> => {
      if (patientCache[id]) return patientCache[id]
      try {
        const snap = await get(ref(db, `patients/patientinfo/${id}`))
        if (snap.exists()) {
          const d = snap.val()
          const info: PatientInfo = {
            uhid: d.uhid,
            name: d.name,
            phone: d.phone,
            age: d.age || 0,
            address: d.address || "",
            gender: d.gender || "",
          }
          setPatientCache((prev) => ({ ...prev, [id]: info }))
          return info
        }
      } catch {}
      return null
    },
    [patientCache],
  )

  // Main data fetching logic (combines initial load and filter changes)
  useEffect(() => {
    const fetchAndListen = async () => {
      setIsLoading(true)
      setOpdAppointments([])
      setIpdAppointments([])
      setOtAppointments([])
      setSearchedPatients([])
      setTotalDownloadedBytes(0) // Reset total downloaded bytes

      if (filters.searchQuery) {
        // Search mode: Query patientinfo
        if (filters.searchQuery.length < 6) {
          setIsLoading(false)
          setSearchedPatients([])
          setSearchDownloadedBytes(0)
          return // Don't search until 6 characters
        }

        const q = filters.searchQuery.toLowerCase()
        const patientInfoRef = ref(db, "patients/patientinfo")
        try {
          const patientSnap = await get(patientInfoRef)
          let currentSearchBytes = 0
          if (patientSnap.exists()) {
            const allPatients: PatientInfo[] = []
            const rawData = patientSnap.val()
            currentSearchBytes = JSON.stringify(rawData).length // Size of all patientinfo
            Object.values(rawData).forEach((data: any) => {
              allPatients.push({
                uhid: data.uhid,
                name: data.name,
                phone: data.phone,
                age: data.age || 0,
                address: data.address || "",
                gender: data.gender || "",
              })
            })

            const matchingPatients = allPatients.filter(
              (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.uhid.toLowerCase().includes(q),
            )
            // Limit to 10 for display
            setSearchedPatients(matchingPatients.slice(0, 10))
          } else {
            setSearchedPatients([])
          }
          setSearchDownloadedBytes(currentSearchBytes)
        } catch (err) {
          console.error("Error searching patients:", err)
          toast.error("Failed to search patients.")
          setSearchedPatients([])
          setSearchDownloadedBytes(0)
        } finally {
          setIsLoading(false)
        }
        return // Exit, as we are in search mode
      }

      // Default mode: Fetch appointments by date range or listen for today's data
      const { start, end } = currentDateRange
      if (!start || !end) {
        setIsLoading(false)
        return
      }

      const tempOpd: OPDAppointment[] = []
      const tempIpd: IPDAppointment[] = []
      const tempOt: OTAppointment[] = []
      const currentTotalBytes = 0

      const todayDate = getTodayDate()

      // If filtering for today, fetch all today's data once (not listeners)
      if (filters.filterType === "today") {
        try {
          // OPD
          const opdSnap = await get(ref(db, `patients/opddetail/${todayDate}`))
          if (opdSnap.exists()) {
            const data = opdSnap.val()
            let opdBytes = JSON.stringify(data).length
            for (const pid in data) {
              for (const aid in data[pid]) {
                const ap = data[pid][aid]
                const info =
                  ap.name && ap.phone
                    ? { name: ap.name, phone: ap.phone, uhid: pid, age: 0, address: "", gender: "" }
                    : await fetchPatientInfo(pid)
                if (info) {
                  tempOpd.push({
                    id: `${pid}_${aid}`,
                    patientId: pid,
                    name: info.name,
                    phone: info.phone,
                    date: todayDate,
                    time: ap.time || "",
                    appointmentType: ap.appointmentType || "",
                    createdAt: ap.createdAt,
                    enteredBy: ap.enteredBy || "",
                    message: ap.message || "",
                    modalities: ap.modalities || [],
                    opdType: ap.opdType || "",
                    payment: ap.payment || {
                      cashAmount: 0,
                      createdAt: "",
                      discount: 0,
                      onlineAmount: 0,
                      paymentMethod: "cash",
                      totalCharges: 0,
                      totalPaid: 0,
                    },
                    referredBy: ap.referredBy || "",
                    study: ap.study || "",
                    visitType: ap.visitType || "",
                    type: "OPD",
                  })
                }
              }
            }
            setTotalDownloadedBytes((prev) => prev + opdBytes)
          }

          // IPD
          const ipdInfoSnap = await get(ref(db, `patients/ipddetail/userinfoipd/${todayDate}`))
          const billingSnap = await get(ref(db, `patients/ipddetail/userbillinginfoipd/${todayDate}`))
          let ipdBytes = 0
          const billingByPid: Record<string, any> = billingSnap.exists() ? billingSnap.val() : {}
          if (billingSnap.exists()) ipdBytes += JSON.stringify(billingSnap.val()).length
          if (ipdInfoSnap.exists()) {
            const ipdData = ipdInfoSnap.val()
            ipdBytes += JSON.stringify(ipdData).length
            for (const pid in ipdData) {
              for (const ipdid in ipdData[pid]) {
                const rec = ipdData[pid][ipdid]
                const info = await fetchPatientInfo(pid)
                const bill = billingByPid[pid]?.[ipdid] || {}

                const payments: IPDPayment[] = []
                let netDep = 0
                let totalRe = 0
                if (bill.payments) {
                  Object.values(bill.payments).forEach((p: any) => {
                    payments.push(p)
                    if (p.type === "advance") netDep += +p.amount
                    else {
                      netDep -= +p.amount
                      totalRe += +p.amount
                    }
                  })
                }
                const services: IPDService[] = (bill.services || []).map((s: any) => ({
                  amount: +s.amount || 0,
                  serviceName: s.serviceName || "",
                  type: s.type || "",
                  doctorName: s.doctorName,
                  createdAt: s.createdAt,
                }))
                const totalSvc = services.reduce((sum, s) => sum + s.amount, 0)
                const discountAmount = Number(bill.discount) || 0
                const remaining = totalSvc - discountAmount - netDep

                if (info) {
                  tempIpd.push({
                    id: `${pid}_${ipdid}`,
                    patientId: pid,
                    uhid: info.uhid,
                    name: info.name,
                    phone: info.phone,
                    admissionDate: todayDate,
                    admissionTime: rec.admissionTime,
                    doctor: doctors[rec.doctor]?.name || "Unknown",
                    doctorId: rec.doctor,
                    roomType: rec.roomType,
                    status: rec.status,
                    services,
                    totalAmount: totalSvc,
                    totalDeposit: netDep,
                    totalRefunds: totalRe,
                    discount: discountAmount,
                    payments,
                    remainingAmount: remaining,
                    createdAt: rec.createdAt,
                    type: "IPD",
                  })
                }
              }
            }
            setTotalDownloadedBytes((prev) => prev + ipdBytes)
          }

          // OT
          const otSnap = await get(ref(db, `patients/ot/${todayDate}`))
          if (otSnap.exists()) {
            const otData = otSnap.val()
            let otBytes = JSON.stringify(otData).length
            for (const pid in otData) {
              for (const ipdid in otData[pid]) {
                const od = otData[pid][ipdid]
                const info = await fetchPatientInfo(pid)
                if (info) {
                  tempOt.push({
                    id: `${pid}_${ipdid}_${od.createdAt}`,
                    patientId: pid,
                    uhid: info.uhid,
                    name: info.name,
                    phone: info.phone,
                    date: od.date || todayDate,
                    time: od.time || "",
                    message: od.message || "",
                    createdAt: od.createdAt,
                    ipdId: ipdid,
                    type: "OT",
                  })
                }
              }
            }
            setTotalDownloadedBytes((prev) => prev + otBytes)
          }

          setOpdAppointments(tempOpd)
          setIpdAppointments(tempIpd)
          setOtAppointments(tempOt)
        } catch (err) {
          console.error("Error fetching today's data:", err)
          toast.error("Failed to load today's data.")
          setOpdAppointments([])
          setIpdAppointments([])
          setOtAppointments([])
        } finally {
          setIsLoading(false)
        }
        return
      } else {
        // For historical ranges, fetch data once
        const tasks: Promise<void>[] = []
        const dt = new Date(start)
        const endDt = new Date(end)

        while (dt <= endDt) {
          const dateStr = format(dt, "yyyy-MM-dd")
          tasks.push(
            (async () => {
              const [opSnap, ipdInfoSnap, billingSnap, otSnap] = await Promise.all([
                get(ref(db, `patients/opddetail/${dateStr}`)),
                get(ref(db, `patients/ipddetail/userinfoipd/${dateStr}`)),
                get(ref(db, `patients/ipddetail/userbillinginfoipd/${dateStr}`)),
                get(ref(db, `patients/ot/${dateStr}`)),
              ])

              let dateBytes = 0

              // OPD
              if (opSnap.exists()) {
                const data = opSnap.val()
                dateBytes += JSON.stringify(data).length
                for (const pid in data) {
                  for (const aid in data[pid]) {
                    const ap = data[pid][aid]
                    const info =
                      ap.name && ap.phone
                        ? { name: ap.name, phone: ap.phone, uhid: pid, age: 0, address: "", gender: "" }
                        : await fetchPatientInfo(pid)
                    if (info) {
                      tempOpd.push({
                        id: `${pid}_${aid}`,
                        patientId: pid,
                        name: info.name,
                        phone: info.phone,
                        date: dateStr,
                        time: ap.time || "",
                        appointmentType: ap.appointmentType || "",
                        createdAt: ap.createdAt,
                        enteredBy: ap.enteredBy || "",
                        message: ap.message || "",
                        modalities: ap.modalities || [],
                        opdType: ap.opdType || "",
                        payment: ap.payment || {
                          cashAmount: 0,
                          createdAt: "",
                          discount: 0,
                          onlineAmount: 0,
                          paymentMethod: "cash",
                          totalCharges: 0,
                          totalPaid: 0,
                        },
                        referredBy: ap.referredBy || "",
                        study: ap.study || "",
                        visitType: ap.visitType || "",
                        type: "OPD",
                      })
                    }
                  }
                }
              }

              // IPD
              const billingByPid: Record<string, any> = billingSnap.exists() ? billingSnap.val() : {}
              if (billingSnap.exists()) dateBytes += JSON.stringify(billingSnap.val()).length
              if (ipdInfoSnap.exists()) {
                const ipdData = ipdInfoSnap.val()
                dateBytes += JSON.stringify(ipdData).length
                for (const pid in ipdData) {
                  for (const ipdid in ipdData[pid]) {
                    const rec = ipdData[pid][ipdid]
                    const info = await fetchPatientInfo(pid)
                    const bill = billingByPid[pid]?.[ipdid] || {}

                    const payments: IPDPayment[] = []
                    let netDep = 0
                    let totalRe = 0
                    if (bill.payments) {
                      Object.values(bill.payments).forEach((p: any) => {
                        payments.push(p)
                        if (p.type === "advance") netDep += +p.amount
                        else {
                          netDep -= +p.amount
                          totalRe += +p.amount
                        }
                      })
                    }
                    const services: IPDService[] = (bill.services || []).map((s: any) => ({
                      amount: +s.amount || 0,
                      serviceName: s.serviceName || "",
                      type: s.type || "",
                      doctorName: s.doctorName,
                      createdAt: s.createdAt,
                    }))
                    const totalSvc = services.reduce((sum, s) => sum + s.amount, 0)
                    const discountAmount = Number(bill.discount) || 0
                    const remaining = totalSvc - discountAmount - netDep

                    if (info) {
                      tempIpd.push({
                        id: `${pid}_${ipdid}`,
                        patientId: pid,
                        uhid: info.uhid,
                        name: info.name,
                        phone: info.phone,
                        admissionDate: dateStr,
                        admissionTime: rec.admissionTime,
                        doctor: doctors[rec.doctor]?.name || "Unknown",
                        doctorId: rec.doctor,
                        roomType: rec.roomType,
                        status: rec.status,
                        services,
                        totalAmount: totalSvc,
                        totalDeposit: netDep,
                        totalRefunds: totalRe,
                        discount: discountAmount,
                        payments,
                        remainingAmount: remaining,
                        createdAt: rec.createdAt,
                        type: "IPD",
                      })
                    }
                  }
                }
              }

              // OT
              if (otSnap.exists()) {
                const otData = otSnap.val()
                dateBytes += JSON.stringify(otData).length
                for (const pid in otData) {
                  for (const ipdid in otData[pid]) {
                    const od = otData[pid][ipdid]
                    const info = await fetchPatientInfo(pid)
                    if (info) {
                      tempOt.push({
                        id: `${pid}_${ipdid}_${od.createdAt}`,
                        patientId: pid,
                        uhid: info.uhid,
                        name: info.name,
                        phone: info.phone,
                        date: od.date || dateStr,
                        time: od.time || "",
                        message: od.message || "",
                        createdAt: od.createdAt,
                        ipdId: ipdid,
                        type: "OT",
                      })
                    }
                  }
                }
              }
              setTotalDownloadedBytes((prev) => prev + dateBytes)
            })(),
          )
          dt.setDate(dt.getDate() + 1)
        }

        await Promise.all(tasks)
        setOpdAppointments(tempOpd)
        setIpdAppointments(tempIpd)
        setOtAppointments(tempOt)
        setIsLoading(false)
      }
    }

    fetchAndListen()
  }, [filters.searchQuery, currentDateRange, doctors, fetchPatientInfo, filters.filterType])

  // Statistics
  const statistics = useMemo(() => {
    const totalOpdAmt = opdAppointments.reduce((sum, a) => sum + (a.payment.totalPaid || 0), 0)
    const totalIpdDep = ipdAppointments.reduce((sum, a) => sum + a.totalDeposit, 0)
    const totalIpdRef = ipdAppointments.reduce((sum, a) => sum + a.totalRefunds, 0)
    const opdCash = opdAppointments.reduce((sum, a) => sum + a.payment.cashAmount, 0)
    const opdOnline = opdAppointments.reduce((sum, a) => sum + a.payment.onlineAmount, 0)
    const ipdCash = ipdAppointments.reduce(
      (sum, a) =>
        sum +
        a.payments
          .filter((p) => p.paymentType === "cash" && p.type === "advance")
          .reduce((s, p) => s + Number(p.amount), 0),
      0,
    )

    const ipdOnline = ipdAppointments.reduce(
      (sum, a) =>
        sum +
        a.payments
          .filter((p) => p.paymentType === "online" && p.type === "advance")
          .reduce((s, p) => s + Number(p.amount), 0),
      0,
    )

    return {
      totalOpdCount: opdAppointments.length,
      totalOpdAmount: totalOpdAmt,
      totalIpdCount: ipdAppointments.length,
      totalIpdAmount: totalIpdDep,
      overallIpdRefunds: totalIpdRef,
      totalOtCount: otAppointments.length,
      opdCash,
      opdOnline,
      ipdCash,
      ipdOnline,
      totalRevenue: totalOpdAmt + totalIpdDep,
    }
  }, [opdAppointments, ipdAppointments, otAppointments])

  // Combined & filter by date range (search is handled by fetching patientinfo directly)
  const filteredAppointments = useMemo(() => {
    if (filters.searchQuery) {
      return [] // In search mode, this memo is not used for display
    }
    const all: CombinedAppointment[] = [...opdAppointments, ...ipdAppointments, ...otAppointments]
    const list = all

    // Sorting by date (most recent first)
    list.sort((a, b) => {
      const dateA = new Date(a.type === "IPD" ? (a as IPDAppointment).admissionDate : a.date)
      const dateB = new Date(b.type === "IPD" ? (b as IPDAppointment).admissionDate : b.date)
      return dateB.getTime() - dateA.getTime()
    })

    return list
  }, [opdAppointments, ipdAppointments, otAppointments, filters.searchQuery])

  // Doctor consultations
  const doctorConsultations = useMemo(() => {
    const map = new Map<string, number>()
    opdAppointments.forEach((a) =>
      a.modalities
        .filter((m) => m.type === "consultation" && m.doctor)
        .forEach((m) => map.set(m.doctor!, (map.get(m.doctor!) || 0) + 1)),
    )
    return Array.from(map.entries())
      .map(([doctorName, count]) => ({ doctorName, count }))
      .sort((a, b) => b.count - a.count)
  }, [opdAppointments])

  const doctorConsultChartData = useMemo(() => {
    const top = doctorConsultations.slice(0, 10)
    return {
      labels: top.map((d) => d.doctorName),
      datasets: [
        {
          label: "Consultations",
          data: top.map((d) => d.count),
          backgroundColor: "rgba(75,192,192,0.6)",
          borderWidth: 1,
        },
      ],
    }
  }, [doctorConsultations])

  // Last 3 days chart
  const chartData = useMemo(() => {
    const today = getTodayDate()
    const y = format(addDays(new Date(), -1), "yyyy-MM-dd")
    const dby = format(addDays(new Date(), -2), "yyyy-MM-dd")

    const opdCounts: Record<string, number> = { [dby]: 0, [y]: 0, [today]: 0 }
    opdAppointments.forEach((a) => {
      if (opdCounts[a.date] !== undefined) opdCounts[a.date]++
    })

    const ipdCounts: Record<string, number> = { [dby]: 0, [y]: 0, [today]: 0 }
    ipdAppointments.forEach((a) => {
      if (ipdCounts[a.admissionDate] !== undefined) ipdCounts[a.admissionDate]++
    })

    return {
      labels: [dby, y, today],
      datasets: [
        {
          label: "OPD Appointments",
          data: [opdCounts[dby], opdCounts[y], opdCounts[today]],
          backgroundColor: "rgba(54,162,235,0.6)",
        },
        {
          label: "IPD Admissions",
          data: [ipdCounts[dby], ipdCounts[y], ipdCounts[today]],
          backgroundColor: "rgba(255,99,132,0.6)",
        },
      ],
    }
  }, [opdAppointments, ipdAppointments])

  // Handlers
  const handleDateRangeChange = (start: string, end: string) => {
    if (start && end) {
      const diff = differenceInDays(new Date(end), new Date(start))
      if (diff > 30) {
        toast.error("Date range cannot exceed 30 days")
        const maxEnd = format(addDays(new Date(start), 30), "yyyy-MM-dd")
        setFilters((p) => ({ ...p, startDate: start, endDate: maxEnd, filterType: "dateRange" }))
      } else {
        setFilters((p) => ({ ...p, startDate: start, endDate: end, filterType: "dateRange" }))
      }
    } else {
      setFilters((p) => ({ ...p, startDate: start, endDate: end }))
    }
  }

  // Fix: Always set filterType to 'today' and clear custom dates when clicking Today quick filter
  const handleFilterChange = (upd: Partial<FilterState>) => {
    if (upd.filterType === "today") {
      setFilters((p) => ({
        ...p,
        filterType: "today",
        startDate: "",
        endDate: "",
        selectedMonth: format(new Date(), "yyyy-MM"),
      }))
    } else if (upd.filterType === "week") {
      setFilters((p) => ({
        ...p,
        filterType: "week",
        startDate: "",
        endDate: "",
        selectedMonth: format(new Date(), "yyyy-MM"),
      }))
    } else if (upd.filterType === "month") {
      setFilters((p) => ({
        ...p,
        filterType: "month",
        startDate: "",
        endDate: "",
        selectedMonth: upd.selectedMonth || format(new Date(), "yyyy-MM"),
      }))
    } else {
      setFilters((p) => ({ ...p, ...upd }))
    }
  }

  const resetFilters = () =>
    setFilters({
      searchQuery: "",
      filterType: "week",
      selectedMonth: format(new Date(), "yyyy-MM"),
      startDate: "",
      endDate: "",
    })

  // Modal for individual appointment details
  const openModal = async (app: CombinedAppointment) => {
    setModalLoading(true)
    setIsModalOpen(true)
    if (app.type === "IPD") {
      try {
        const [pid, ipdid] = app.id.split("_")
        const snap = await get(
          ref(db, `patients/ipddetail/userdetailipd/${(app as IPDAppointment).admissionDate}/${pid}/${ipdid}`),
        )
        setSelectedAppointment({ ...app, details: snap.exists() ? snap.val() : null })
      } catch {
        setSelectedAppointment(app)
      }
    } else {
      setSelectedAppointment(app)
    }
    setModalLoading(false)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedAppointment(null)
  }

  // New: Fetch all appointments for a specific patient (for patient search modal)
  const fetchAllAppointmentsForPatient = useCallback(
    async (patientId: string) => {
      setPatientAppointmentsLoading(true)
      const allPatientApps: CombinedAppointment[] = []

      // Fetch appointments for the last year as a compromise for "all"
      const now = new Date()
      const oneYearAgo = addDays(now, -365)
      const dt = oneYearAgo
      const endDt = now

      const tasks: Promise<void>[] = []

      while (dt <= endDt) {
        const dateStr = format(dt, "yyyy-MM-dd")
        tasks.push(
          (async () => {
            const [opSnap, ipdInfoSnap, billingSnap, otSnap] = await Promise.all([
              get(ref(db, `patients/opddetail/${dateStr}`)),
              get(ref(db, `patients/ipddetail/userinfoipd/${dateStr}`)),
              get(ref(db, `patients/ipddetail/userbillinginfoipd/${dateStr}`)),
              get(ref(db, `patients/ot/${dateStr}`)),
            ])

            // OPD
            if (opSnap.exists()) {
              const data = opSnap.val()
              for (const pid in data) {
                if (pid === patientId) {
                  for (const aid in data[pid]) {
                    const ap = data[pid][aid]
                    allPatientApps.push({
                      id: `${pid}_${aid}`,
                      patientId: pid,
                      name: selectedPatientForAppointments?.name || "",
                      phone: selectedPatientForAppointments?.phone || "",
                      date: dateStr,
                      time: ap.time || "",
                      appointmentType: ap.appointmentType || "",
                      createdAt: ap.createdAt,
                      enteredBy: ap.enteredBy || "",
                      message: ap.message || "",
                      modalities: ap.modalities || [],
                      opdType: ap.opdType || "",
                      payment: ap.payment || {
                        cashAmount: 0,
                        createdAt: "",
                        discount: 0,
                        onlineAmount: 0,
                        paymentMethod: "cash",
                        totalCharges: 0,
                        totalPaid: 0,
                      },
                      referredBy: ap.referredBy || "",
                      study: ap.study || "",
                      visitType: ap.visitType || "",
                      type: "OPD",
                    })
                  }
                }
              }
            }

            // IPD
            const billingByPid: Record<string, any> = billingSnap.exists() ? billingSnap.val() : {}
            if (ipdInfoSnap.exists()) {
              const ipdData = ipdInfoSnap.val()
              for (const pid in ipdData) {
                if (pid === patientId) {
                  for (const ipdid in ipdData[pid]) {
                    const rec = ipdData[pid][ipdid]
                    const bill = billingByPid[pid]?.[ipdid] || {}

                    const payments: IPDPayment[] = []
                    let netDep = 0
                    let totalRe = 0
                    if (bill.payments) {
                      Object.values(bill.payments).forEach((p: any) => {
                        payments.push(p)
                        if (p.type === "advance") netDep += +p.amount
                        else {
                          netDep -= +p.amount
                          totalRe += +p.amount
                        }
                      })
                    }
                    const services: IPDService[] = (bill.services || []).map((s: any) => ({
                      amount: +s.amount || 0,
                      serviceName: s.serviceName || "",
                      type: s.type || "",
                      doctorName: s.doctorName,
                      createdAt: s.createdAt,
                    }))
                    const totalSvc = services.reduce((sum, s) => sum + s.amount, 0)
                    const discountAmount = Number(bill.discount) || 0
                    const remaining = totalSvc - discountAmount - netDep

                    allPatientApps.push({
                      id: `${pid}_${ipdid}`,
                      patientId: pid,
                      uhid: selectedPatientForAppointments?.uhid || "",
                      name: selectedPatientForAppointments?.name || "",
                      phone: selectedPatientForAppointments?.phone || "",
                      admissionDate: dateStr,
                      admissionTime: rec.admissionTime,
                      doctor: doctors[rec.doctor]?.name || "Unknown",
                      doctorId: rec.doctor,
                      roomType: rec.roomType,
                      status: rec.status,
                      services,
                      totalAmount: totalSvc,
                      totalDeposit: netDep,
                      totalRefunds: totalRe,
                      discount: discountAmount,
                      payments,
                      remainingAmount: remaining,
                      createdAt: rec.createdAt,
                      type: "IPD",
                    })
                  }
                }
              }
            }

            // OT
            if (otSnap.exists()) {
              const otData = otSnap.val()
              for (const pid in otData) {
                if (pid === patientId) {
                  for (const ipdid in otData[pid]) {
                    const od = otData[pid][ipdid]
                    allPatientApps.push({
                      id: `${pid}_${ipdid}_${od.createdAt}`,
                      patientId: pid,
                      uhid: selectedPatientForAppointments?.uhid || "",
                      name: selectedPatientForAppointments?.name || "",
                      phone: selectedPatientForAppointments?.phone || "",
                      date: od.date || dateStr,
                      time: od.time || "",
                      message: od.message || "",
                      createdAt: od.createdAt,
                      ipdId: ipdid,
                      type: "OT",
                    })
                  }
                }
              }
            }
          })(),
        )
        dt.setDate(dt.getDate() + 1)
      }

      await Promise.all(tasks)

      setPatientAllAppointments(
        allPatientApps.sort((a, b) => {
          const dateA = new Date(a.type === "IPD" ? (a as IPDAppointment).admissionDate : a.date)
          const dateB = new Date(b.type === "IPD" ? (b as IPDAppointment).admissionDate : b.date)
          return dateB.getTime() - dateA.getTime() // Sort by most recent first
        }),
      )

      setPatientAppointmentsLoading(false)
    },
    [selectedPatientForAppointments, doctors],
  )

  // New: Open modal for patient's appointments
  const openPatientAppointmentsModal = async (patient: PatientInfo) => {
    setSelectedPatientForAppointments(patient)
    setPatientAppointmentsModalOpen(true)
    await fetchAllAppointmentsForPatient(patient.uhid)
  }

  // New: Close modal for patient's appointments
  const closePatientAppointmentsModal = () => {
    setPatientAppointmentsModalOpen(false)
    setSelectedPatientForAppointments(null)
    setPatientAllAppointments([])
  }

  const getBadgeColor = (t: string) => {
    switch (t) {
      case "OPD":
        return "bg-sky-100 text-sky-800"
      case "IPD":
        return "bg-orange-100 text-orange-800"
      case "OT":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getFilterTitle = () => {
    switch (filters.filterType) {
      case "today":
        return "Today's Data"
      case "month":
        return `${format(new Date(filters.selectedMonth + "-01"), "MMMM yyyy")} Data`
      case "dateRange":
        if (!filters.startDate || !filters.endDate) return "Select date range"
        return `${format(new Date(filters.startDate), "MMM dd")} - ${format(new Date(filters.endDate), "MMM dd, yyyy")}`
      default:
        const { start, end } = currentDateRange
        return `Week: ${format(new Date(start), "MMM dd")} - ${format(new Date(end), "MMM dd, yyyy")}`
    }
  }

  const getModalitiesSummary = (mods: IModality[]) => {
    const counts = {
      consultation: mods.filter((m) => m.type === "consultation").length,
      casualty: mods.filter((m) => m.type === "casualty").length,
      xray: mods.filter((m) => m.type === "xray").length,
      custom: mods.filter((m) => m.type === "custom").length,
    }
    const parts: string[] = []
    if (counts.consultation) parts.push(`${counts.consultation} Consultation${counts.consultation > 1 ? "s" : ""}`)
    if (counts.casualty) parts.push(`${counts.casualty} Casualty`)
    if (counts.xray) parts.push(`${counts.xray} X-ray${counts.xray > 1 ? "s" : ""}`)
    if (counts.custom) parts.push(`${counts.custom} Custom Service${counts.custom > 1 ? "s" : ""}`)
    return parts.join(", ") || "No services"
  }

  return (
    <>
      <ToastContainer />
      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-[1600px] mx-auto">
          {/* Header & Search */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center">
              <div className="flex items-center mb-4 md:mb-0">
                <div className="p-2 bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg mr-3">
                  <Activity className="text-white h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                 G-MEDFORD-NX HOSPITAL
                </h1>
              </div>
              <div className="relative w-full md:w-1/3">
                <Search className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search by name, phone, or UHID"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 transition shadow-sm"
                />
                {filters.searchQuery.length >= 6 && searchDownloadedBytes > 0 && (
                  <p className="absolute -bottom-5 right-0 text-xs text-gray-500">
                    Downloaded: {formatBytes(searchDownloadedBytes)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Advanced Filters (Hidden when searching) */}
            {!filters.searchQuery && (
              <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-gray-100">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center mb-4 lg:mb-0">
                    <Filter className="mr-2 h-5 w-5 text-sky-500" /> Advanced Filters
                  </h2>
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reset All
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Quick Filters */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Quick Filters</label>
                    <div className="flex flex-wrap gap-2">
                      {["week", "today", "month"].map((mode) => {
                        const label = mode === "week" ? "This Week" : mode === "today" ? "Today" : "This Month"
                        return (
                          <button
                            key={mode}
                            onClick={() =>
                              handleFilterChange({
                                filterType: mode as any,
                                ...(mode === "month" ? { selectedMonth: format(new Date(), "yyyy-MM") } : {}),
                              })
                            }
                            className={`px-3 py-2 rounded-lg text-sm font-medium ${
                              filters.filterType === mode
                                ? "bg-sky-600 text-white shadow-md"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Month Filter */}
                  <div>
                    <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Month
                    </label>
                    <input
                      type="month"
                      id="month"
                      value={filters.selectedMonth}
                      onChange={(e) => handleFilterChange({ selectedMonth: e.target.value, filterType: "month" })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Date Range Filter */}
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      value={filters.startDate}
                      onChange={(e) => handleDateRangeChange(e.target.value, filters.endDate)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                      End Date (Max 30 days)
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      value={filters.endDate}
                      onChange={(e) => handleDateRangeChange(filters.startDate, e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div className="mt-4 p-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg border border-sky-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CalendarDays className="mr-2 h-5 w-5 text-sky-600" />
                      <span className="text-sky-800 font-medium">{getFilterTitle()}</span>
                    </div>
                    {totalDownloadedBytes > 0 && (
                      <span className="text-xs text-gray-500">
                        Total Data Downloaded: <b>{formatBytes(totalDownloadedBytes)}</b>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Statistics (Hidden when searching) */}
            {!filters.searchQuery && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                  {/* OPD */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-sky-100 to-blue-100 rounded-full">
                        <Activity className="text-sky-600 h-6 w-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-sm">OPD</p>
                        <p className="text-2xl font-bold text-gray-900">{statistics.totalOpdCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Revenue</span>
                      <span className="text-lg font-semibold text-sky-600">
                        {formatCurrency(statistics.totalOpdAmount)}
                      </span>
                    </div>
                  </div>

                  {/* IPD */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-orange-100 to-red-100 rounded-full">
                        <Layers className="text-orange-600 h-6 w-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-sm">IPD</p>
                        <p className="text-2xl font-bold text-gray-900">{statistics.totalIpdCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Net Deposit</span>
                      <span className="text-lg font-semibold text-orange-600">
                        {formatCurrency(statistics.totalIpdAmount)}
                      </span>
                    </div>
                    {statistics.overallIpdRefunds > 0 && (
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-gray-600">Total Refunds</span>
                        <span className="text-lg font-semibold text-blue-600">
                          {formatCurrency(statistics.overallIpdRefunds)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* OT */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full">
                        <Stethoscope className="text-purple-600 h-6 w-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-sm">OT</p>
                        <p className="text-2xl font-bold text-gray-900">{statistics.totalOtCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Procedures</span>
                      <span className="text-lg font-semibold text-purple-600">{statistics.totalOtCount}</span>
                    </div>
                  </div>

                  {/* Total Revenue */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full">
                        <DollarSign className="text-emerald-600 h-6 w-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-sm">Total</p>
                        <p className="text-2xl font-bold text-gray-900">Revenue</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Amount</span>
                      <span className="text-lg font-semibold text-emerald-600">
                        {formatCurrency(statistics.totalRevenue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Breakdown & Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Payment Breakdown */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <CreditCard className="mr-2 h-5 w-5 text-gray-600" /> Payment Breakdown
                    </h2>
                    <div className="space-y-6">
                      <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-4">
                        <h3 className="font-medium text-sky-800 mb-3">OPD Payments</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">💵 Cash</span>
                            <span className="font-semibold text-sky-600">{formatCurrency(statistics.opdCash)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">💳 Online</span>
                            <span className="font-semibold text-sky-600">{formatCurrency(statistics.opdOnline)}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-sky-200">
                            <span className="text-sky-700 font-medium">Total OPD</span>
                            <span className="font-bold text-sky-700">{formatCurrency(statistics.totalOpdAmount)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-4">
                        <h3 className="font-medium text-orange-800 mb-3">IPD Payments</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">💵 Cash</span>
                            <span className="font-semibold text-orange-600">{formatCurrency(statistics.ipdCash)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">💳 Online</span>
                            <span className="font-semibold text-orange-600">
                              {formatCurrency(statistics.ipdOnline)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                            <span className="text-orange-700 font-medium">Total IPD (Net Deposit)</span>
                            <span className="font-bold text-orange-700">
                              {formatCurrency(statistics.totalIpdAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-800 font-semibold">💰 Grand Total</span>
                          <span className="font-bold text-xl text-emerald-600">
                            {formatCurrency(statistics.totalRevenue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Appointments Overview Chart */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <Activity className="mr-2 h-5 w-5 text-gray-600" /> Appointments Overview
                    </h2>
                    <Bar
                      data={chartData}
                      options={{
                        responsive: true,
                        plugins: { legend: { position: "top" } },
                        scales: {
                          y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        },
                      }}
                    />
                  </div>
                </div>

                {/* Doctor Consultations List & Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* List */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <UserCheck className="mr-2 h-5 w-5 text-gray-600" /> Doctor Consultations
                    </h2>
                    {doctorConsultations.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Doctor Name
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Consultations
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {doctorConsultations.map((doc) => (
                              <tr key={doc.doctorName} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {doc.doctorName}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{doc.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <p>No consultation data for the selected period.</p>
                      </div>
                    )}
                  </div>

                  {/* Chart */}
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <UserCheck className="mr-2 h-5 w-5 text-gray-600" /> Top Doctors by Consultations
                    </h2>
                    {doctorConsultChartData.labels.length > 0 ? (
                      <Bar
                        data={doctorConsultChartData}
                        options={{
                          responsive: true,
                          plugins: { legend: { position: "top" } },
                          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                        }}
                      />
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <p>No data to display chart for the selected period.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Appointments/Patients Table */}
            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-gray-600" />{" "}
                  {filters.searchQuery ? "Patient Search Results" : "Appointments List"}
                </h2>
              </div>
              {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
                  <span className="ml-3 text-gray-600">Loading data...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {filters.searchQuery ? (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              UHID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Patient Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Phone
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Age / Gender
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Action
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Patient
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Contact
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Date & Time
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Services/Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Action
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filters.searchQuery ? (
                        searchedPatients.length > 0 ? (
                          searchedPatients.map((patient) => (
                            <tr key={patient.uhid} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {patient.uhid}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="p-2 bg-gray-100 rounded-full mr-3">
                                    <User className="h-4 w-4 text-gray-600" />
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{patient.phone}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{patient.age || "N/A"}</div>
                                <div className="text-xs text-gray-500">{patient.gender || "N/A"}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <button
                                  onClick={() => openPatientAppointmentsModal(patient)}
                                  className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                                >
                                  View Appointments
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center">
                              <div className="flex flex-col items-center">
                                <FileText className="h-12 w-12 text-gray-300 mb-4" />
                                <p className="text-gray-500 text-lg">No patients found matching your search.</p>
                                <p className="text-gray-400 text-sm">Try a different name or phone number.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      ) : filteredAppointments.length > 0 ? (
                        filteredAppointments.map((app) => (
                          <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="p-2 bg-gray-100 rounded-full mr-3">
                                  <User className="h-4 w-4 text-gray-600" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{app.name}</div>
                                  {(app.type === "IPD" || app.type === "OT") && (
                                    <div className="text-xs text-gray-500">UHID: {app.uhid}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{app.phone}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {format(
                                  new Date(
                                    app.type === "OPD" || app.type === "OT"
                                      ? app.date
                                      : (app as IPDAppointment).admissionDate,
                                  ),
                                  "dd MMM, yyyy",
                                )}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {app.type === "OPD" || app.type === "OT"
                                  ? app.time
                                  : (app as IPDAppointment).admissionTime}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(app.type)}`}>
                                {app.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {app.type === "OPD" && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">
                                    {getModalitiesSummary((app as OPDAppointment).modalities)}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency((app as OPDAppointment).payment.totalPaid)}
                                  </div>
                                </div>
                              )}
                              {app.type === "IPD" && (
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency((app as IPDAppointment).totalDeposit)}
                                  </div>
                                  {((app as IPDAppointment).remainingAmount ?? 0) > 0 && (
                                    <div className="text-xs text-red-500">
                                      Pending: {formatCurrency((app as IPDAppointment).remainingAmount!)}
                                    </div>
                                  )}
                                </div>
                              )}
                              {app.type === "OT" && <div className="text-sm text-gray-500">Procedure</div>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => openModal(app)}
                                className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center">
                              <FileText className="h-12 w-12 text-gray-300 mb-4" />
                              <p className="text-gray-500 text-lg">No appointments found</p>
                              <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appointment Details Modal */}
        <Dialog open={isModalOpen} onClose={closeModal} className="fixed z-50 inset-0 overflow-y-auto">
          {isModalOpen && selectedAppointment && (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true" />
              <Dialog.Panel className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-screen overflow-y-auto">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
                {modalLoading ? (
                  <div className="flex justify-center items-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
                    <span className="ml-3 text-gray-600">Loading details...</span>
                  </div>
                ) : (
                  <>
                    <Dialog.Title className="text-2xl font-bold mb-6 flex items-center">
                      <div
                        className={`p-3 rounded-full mr-4 ${
                          selectedAppointment.type === "OPD"
                            ? "bg-gradient-to-r from-sky-100 to-blue-100"
                            : selectedAppointment.type === "IPD"
                              ? "bg-gradient-to-r from-orange-100 to-red-100"
                              : "bg-gradient-to-r from-purple-100 to-pink-100"
                        }`}
                      >
                        {selectedAppointment.type === "OPD" && <Activity className="text-sky-600 h-6 w-6" />}
                        {selectedAppointment.type === "IPD" && <Layers className="text-orange-600 h-6 w-6" />}
                        {selectedAppointment.type === "OT" && <Stethoscope className="text-purple-600 h-6 w-6" />}
                      </div>
                      {selectedAppointment.type} Appointment Details
                    </Dialog.Title>
                    {/* Patient Info */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                        <User className="mr-2 h-5 w-5 text-gray-600" /> Patient Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Patient Name</p>
                            <p className="font-medium text-lg">{selectedAppointment.name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Phone</p>
                            <p className="font-medium">{selectedAppointment.phone}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Date</p>
                            <p className="font-medium">
                              {format(
                                new Date(
                                  selectedAppointment.type === "IPD"
                                    ? (selectedAppointment as IPDAppointment).admissionDate
                                    : selectedAppointment.date,
                                ),
                                "dd MMM, yyyy",
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Patient ID</p>
                            <p className="font-medium">{selectedAppointment.patientId}</p>
                          </div>
                          {(selectedAppointment.type === "IPD" || selectedAppointment.type === "OT") && (
                            <div>
                              <p className="text-sm text-gray-500">UHID</p>
                              <p className="font-medium">{selectedAppointment.uhid}</p>
                            </div>
                          )}
                          {selectedAppointment.type === "IPD" && (
                            <div>
                              <p className="text-sm text-gray-500">Room Type</p>
                              <p className="font-medium">{(selectedAppointment as IPDAppointment).roomType}</p>
                            </div>
                          )}
                          {selectedAppointment.type === "OT" && (
                            <div>
                              <p className="text-sm text-gray-500">IPD ID</p>
                              <p className="font-medium">{(selectedAppointment as OTAppointment).ipdId}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* OPD Details */}
                    {selectedAppointment.type === "OPD" && (
                      <div className="space-y-6">
                        <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-sky-800 mb-4">OPD Details</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Time</p>
                                <p className="font-medium">{(selectedAppointment as OPDAppointment).time}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Appointment Type</p>
                                <p className="font-medium capitalize">
                                  {(selectedAppointment as OPDAppointment).appointmentType}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Visit Type</p>
                                <p className="font-medium capitalize">
                                  {(selectedAppointment as OPDAppointment).visitType}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Payment Method</p>
                                <p className="font-medium capitalize">
                                  {(selectedAppointment as OPDAppointment).payment.paymentMethod}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Total Amount</p>
                                <p className="font-bold text-xl text-sky-600">
                                  {formatCurrency((selectedAppointment as OPDAppointment).payment.totalPaid)}
                                </p>
                              </div>
                              {(selectedAppointment as OPDAppointment).payment.discount > 0 && (
                                <div>
                                  <p className="text-sm text-gray-500">Discount</p>
                                </div>
                              )}
                            </div>
                          </div>
                          {(selectedAppointment as OPDAppointment).message && (
                            <div className="mt-4 p-3 bg-white rounded-lg border border-sky-200">
                              <p className="text-sm text-gray-500">Notes</p>
                              <p className="font-medium">{(selectedAppointment as OPDAppointment).message}</p>
                            </div>
                          )}
                        </div>
                        {(selectedAppointment as OPDAppointment).modalities.length > 0 && (
                          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                              <FileText className="mr-2 h-5 w-5" /> Services & Modalities
                            </h3>
                            <div className="space-y-3">
                              {(selectedAppointment as OPDAppointment).modalities.map((m: IModality, i: number) => (
                                <div key={i} className="border border-purple-200 rounded p-3 bg-white">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium capitalize">
                                      {m.type}
                                    </span>
                                    <span className="font-semibold text-purple-700">₹{m.charges}</span>
                                  </div>
                                  {m.doctor && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Doctor:</strong> {m.doctor}
                                    </div>
                                  )}
                                  {m.specialist && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Specialist:</strong> {m.specialist}
                                    </div>
                                  )}
                                  {m.service && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Service:</strong> {m.service}
                                    </div>
                                  )}
                                  {m.visitType && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Visit Type:</strong> {m.visitType}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200">
                              <div className="flex justify-between items-center text-lg font-semibold">
                                <span className="text-purple-700">Total Charges:</span>
                                <span className="text-purple-600">
                                  ₹{(selectedAppointment as OPDAppointment).payment.totalCharges}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                            <CreditCard className="mr-2 h-5 w-5" /> Payment Details
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Cash Amount:</span>
                                <span className="font-semibold text-green-700">
                                  ₹{(selectedAppointment as OPDAppointment).payment.cashAmount}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Online Amount:</span>
                                <span className="font-semibold text-blue-700">
                                  ₹{(selectedAppointment as OPDAppointment).payment.onlineAmount}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Total Charges:</span>
                                <span className="font-semibold">
                                  ₹{(selectedAppointment as OPDAppointment).payment.totalCharges}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Discount:</span>
                                <span className="font-semibold text-red-600">
                                  ₹{(selectedAppointment as OPDAppointment).payment.discount}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-green-700 font-bold">Total Paid:</span>
                                <span className="font-bold text-green-600">
                                  ₹{(selectedAppointment as OPDAppointment).payment.totalPaid}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IPD Details */}
                    {selectedAppointment.type === "IPD" && (
                      <div className="space-y-6">
                        {(selectedAppointment as IPDAppointment).services.length > 0 && (
                          <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center">
                              <FileText className="mr-2 h-5 w-5" /> Services & Charges
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-orange-200">
                                <thead className="bg-orange-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Service
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Type
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Doctor
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Amount
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-orange-100">
                                  {(selectedAppointment as IPDAppointment).services.map((s, i) => (
                                    <tr key={i} className="hover:bg-orange-50">
                                      <td className="px-4 py-2 text-sm text-gray-900">{s.serviceName}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600 capitalize">{s.type}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600">{s.doctorName || "-"}</td>
                                      <td className="px-4 py-2 text-sm font-medium text-orange-600">
                                        {formatCurrency(s.amount)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-orange-200">
                              <div className="flex justify-between items-center text-lg font-semibold">
                                <span className="text-orange-700">Total Service Amount:</span>
                                <span className="text-orange-600">
                                  {formatCurrency((selectedAppointment as IPDAppointment).totalAmount)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {(selectedAppointment as IPDAppointment).payments.length > 0 && (
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                              <CreditCard className="mr-2 h-5 w-5" /> Payment History
                            </h3>
                            <div className="space-y-3">
                              {(selectedAppointment as IPDAppointment).payments.map((p, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200"
                                >
                                  <div>
                                    <span className="font-medium text-green-700">
                                      {p.paymentType.toUpperCase()} - {p.type.toUpperCase()}
                                    </span>
                                    {p.date && (
                                      <p className="text-sm text-gray-500">
                                        {format(new Date(p.date), "dd MMM, yyyy")}
                                      </p>
                                    )}
                                  </div>
                                  <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-green-200">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-green-700">Total Paid:</span>
                                  <span className="font-bold text-green-600">
                                    {formatCurrency((selectedAppointment as IPDAppointment).totalDeposit)}
                                  </span>
                                </div>
                                {(selectedAppointment as IPDAppointment).remainingAmount! > 0 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-red-700">Remaining:</span>
                                    <span className="font-bold text-red-600">
                                      {formatCurrency((selectedAppointment as IPDAppointment).remainingAmount!)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                            <DollarSign className="mr-2 h-5 w-5" /> Financial Summary
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Total Services:</span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency((selectedAppointment as IPDAppointment).totalAmount)}
                              </span>
                            </div>
                            {(selectedAppointment as IPDAppointment).discount > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">Discount Applied:</span>
                                <span className="font-semibold text-red-600">
                                  {formatCurrency((selectedAppointment as IPDAppointment).discount)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Total Net Payments:</span>
                              <span className="font-semibold text-green-700">
                                {formatCurrency((selectedAppointment as IPDAppointment).totalDeposit)}
                              </span>
                            </div>
                            {(selectedAppointment as IPDAppointment).totalRefunds > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Refunds Issued:</span>
                                <span className="font-semibold text-red-600">
                                  {formatCurrency((selectedAppointment as IPDAppointment).totalRefunds)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-blue-200">
                              <span className="text-blue-800 font-bold text-lg">Net Balance:</span>
                              <span
                                className={`font-bold text-xl ${
                                  (selectedAppointment as IPDAppointment).remainingAmount! > 0
                                    ? "text-red-600"
                                    : (selectedAppointment as IPDAppointment).remainingAmount! < 0
                                      ? "text-green-600"
                                      : "text-gray-800"
                                }`}
                              >
                                {formatCurrency((selectedAppointment as IPDAppointment).remainingAmount!)}
                                {(selectedAppointment as IPDAppointment).remainingAmount! > 0
                                  ? " (Due)"
                                  : (selectedAppointment as IPDAppointment).remainingAmount! < 0
                                    ? " (Refundable)"
                                    : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* OT Details */}
                    {selectedAppointment.type === "OT" && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-purple-800 mb-4">OT Details</h3>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Time</p>
                            <p className="font-medium">{(selectedAppointment as OTAppointment).time}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Procedure Notes</p>
                            <p className="font-medium">{(selectedAppointment as OTAppointment).message}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Dialog.Panel>
            </div>
          )}
        </Dialog>

        {/* New: Patient Appointments Details Modal */}
        <Dialog
          open={patientAppointmentsModalOpen}
          onClose={closePatientAppointmentsModal}
          className="fixed z-50 inset-0 overflow-y-auto"
        >
          {patientAppointmentsModalOpen && selectedPatientForAppointments && (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true" />
              <Dialog.Panel className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-screen overflow-y-auto">
                <button
                  onClick={closePatientAppointmentsModal}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
                {patientAppointmentsLoading ? (
                  <div className="flex justify-center items-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
                    <span className="ml-3 text-gray-600">Loading patient appointments...</span>
                  </div>
                ) : (
                  <>
                    <Dialog.Title className="text-2xl font-bold mb-6 flex items-center">
                      <User className="p-3 rounded-full mr-4 bg-gradient-to-r from-sky-100 to-blue-100 text-sky-600 h-6 w-6" />
                      Appointments for {selectedPatientForAppointments.name} (UHID:{" "}
                      {selectedPatientForAppointments.uhid})
                    </Dialog.Title>
                    {patientAllAppointments.length > 0 ? (
                      <div className="space-y-4">
                        {patientAllAppointments.map((app) => (
                          <div key={app.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(app.type)}`}>
                                {app.type}
                              </span>
                              <span className="text-sm text-gray-600">
                                {format(
                                  new Date(app.type === "IPD" ? (app as IPDAppointment).admissionDate : app.date),
                                  "dd MMM, yyyy",
                                )}
                                {" at "}
                                {app.type === "OPD" || app.type === "OT"
                                  ? app.time
                                  : (app as IPDAppointment).admissionTime}
                              </span>
                            </div>
                            <p className="text-lg font-semibold text-gray-900">
                              {app.type === "OPD" &&
                                `OPD Visit - ${getModalitiesSummary((app as OPDAppointment).modalities)}`}
                              {app.type === "IPD" &&
                                `IPD Admission - ${formatCurrency((app as IPDAppointment).totalAmount)}`}
                              {app.type === "OT" && `OT Procedure - ${(app as OTAppointment).message}`}
                            </p>
                            {app.type === "OPD" && (
                              <p className="text-sm text-gray-700">
                                Total Paid: {formatCurrency((app as OPDAppointment).payment.totalPaid)}
                              </p>
                            )}
                            {app.type === "IPD" && (
                              <p className="text-sm text-gray-700">
                                Net Deposit: {formatCurrency((app as IPDAppointment).totalDeposit)}
                              </p>
                            )}
                            <button
                              onClick={() => openModal(app)} // Re-use existing openModal for full details
                              className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                            >
                              View Full Details
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <p>No appointments found for this patient in the last year.</p>
                      </div>
                    )}
                  </>
                )}
              </Dialog.Panel>
            </div>
          )}
        </Dialog>
      </main>
    </>
  )
}

export default DashboardPage
