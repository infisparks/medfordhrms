"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { db } from "@/lib/firebase"
import { ref, get } from "firebase/database"
import { format, subDays, startOfDay, endOfDay, isSameDay, addDays, parseISO, startOfMonth, endOfMonth } from "date-fns"
import { Line, Doughnut } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Search, DollarSign, Bed, RefreshCw, Filter, FileText, Banknote, Tag } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as XLSX from "xlsx"

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

// Types
interface IPDService {
  amount: number
  serviceName: string
  type: string
  doctorName?: string
  createdAt: string
}

interface IPDPayment {
  id: string
  amount: number
  paymentType: "cash" | "online"
  type: "deposit" | "advance" | "refund"
  date: string
  createdAt: string
}

interface IPDPatient {
  id: string
  uhid: string
  ipdId: string
  billNumber?: string
  name: string
  phone: string
  age: string | number
  gender: string
  address?: string
  admissionDate: string
  admissionTime: string
  doctor: string
  doctorId: string
  roomType: string
  roomNumber?: string
  status: "active" | "discharged"
  dischargeDate?: string
  dischargeTime?: string
  services: IPDService[]
  totalAmount: number
  totalDeposit: number
  totalRefunds: number
  payments: IPDPayment[]
  remainingAmount: number
  createdAt: string
  enteredBy?: string
  discount?: number
}

interface Doctor {
  id: string
  name: string
  specialty?: string
}

type DateFilter = "today" | "7days" | "month" | "custom"

interface FilterOptions {
  dateFilter: DateFilter
  startDate: string
  endDate: string
  selectedMonth: string
  status: "all" | "active" | "discharged"
  searchQuery: string
}

// Helper functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

const IPDDashboardPage: React.FC = () => {
  // State
  const [ipdPatients, setIpdPatients] = useState<IPDPatient[]>([])
  const [doctors, setDoctors] = useState<Record<string, Doctor>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<IPDPatient | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

  // Filters
  const [filters, setFilters] = useState<FilterOptions>({
    dateFilter: "7days",
    startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    selectedMonth: format(new Date(), "yyyy-MM"),
    status: "all",
    searchQuery: "",
  })

  // Get date range based on filter
  const getDateRange = useCallback(() => {
    const now = new Date()
    const today = startOfDay(now)

    switch (filters.dateFilter) {
      case "today":
        return {
          start: today.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      case "7days":
        const sevenDaysAgo = startOfDay(subDays(now, 6))
        return {
          start: sevenDaysAgo.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      case "month":
        const selectedMonthDate = parseISO(`${filters.selectedMonth}-01`)
        return {
          start: startOfMonth(selectedMonthDate).toISOString(),
          end: endOfMonth(selectedMonthDate).toISOString(),
        }
      case "custom":
        try {
          const start = startOfDay(parseISO(filters.startDate))
          const end = endOfDay(parseISO(filters.endDate))
          if (start > end) {
            toast.error("Start date cannot be after end date")
            return {
              start: today.toISOString(),
              end: endOfDay(now).toISOString(),
            }
          }
          return {
            start: start.toISOString(),
            end: end.toISOString(),
          }
        } catch (error) {
          console.error("Invalid custom date range:", error)
          toast.error("Invalid date format. Using default range.")
          return {
            start: today.toISOString(),
            end: endOfDay(now).toISOString(),
          }
        }
      default:
        return {
          start: startOfDay(subDays(now, 6)).toISOString(),
          end: endOfDay(now).toISOString(),
        }
    }
  }, [filters.dateFilter, filters.startDate, filters.endDate, filters.selectedMonth])

  // Fetch doctors
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const doctorsRef = ref(db, "doctors")
        const snapshot = await get(doctorsRef)
        const data = snapshot.val()
        const doctorsMap: Record<string, Doctor> = {}

        if (data) {
          Object.keys(data).forEach((key) => {
            doctorsMap[key] = {
              id: key,
              name: data[key].name,
              specialty: data[key].specialist,
            }
          })
        }
        setDoctors(doctorsMap)
      } catch (error) {
        console.error("Error fetching doctors:", error)
      }
    }

    fetchDoctors()
  }, [])

  // Fetch IPD patients
  const fetchIPDPatients = useCallback(async () => {
    setLoading(true)
    setRefreshing(true)

    try {
      console.log("Starting to fetch IPD patients...")
      const allPatients: IPDPatient[] = []

      const { start, end } = getDateRange()
      const startDate = parseISO(start)
      const endDate = parseISO(end)

      // Generate date keys for the range
      const dateKeys: string[] = []
      let currentDate = startOfDay(startDate)
      while (currentDate <= endOfDay(endDate)) {
        dateKeys.push(format(currentDate, "yyyy-MM-dd"))
        currentDate = addDays(currentDate, 1)
      }

      for (const dateKey of dateKeys) {
        const ipdInfoDateRef = ref(db, `patients/ipddetail/userinfoipd/${dateKey}`)
        const ipdBillingDateRef = ref(db, `patients/ipddetail/userbillinginfoipd/${dateKey}`)

        const [infoSnapshot, billingSnapshot] = await Promise.all([get(ipdInfoDateRef), get(ipdBillingDateRef)])

        const infoDataForDate = infoSnapshot.exists() ? infoSnapshot.val() : {}
        const billingDataForDate = billingSnapshot.exists() ? billingSnapshot.val() : {}

        for (const patientIdKey in infoDataForDate) {
          if (Object.prototype.hasOwnProperty.call(infoDataForDate, patientIdKey)) {
            const ipdEntriesForPatient = infoDataForDate[patientIdKey]

            for (const ipdId of Object.keys(ipdEntriesForPatient)) {
              const ipdData = ipdEntriesForPatient[ipdId]
              const billingData = billingDataForDate[patientIdKey]?.[ipdId] || null

              if (!ipdData || !ipdData.admissionDate) continue

              // Apply status filter
              const patientStatus = ipdData.status || "active"
              if (filters.status !== "all" && patientStatus !== filters.status) {
                continue
              }

              // Process payments and refunds
              const payments: IPDPayment[] = []
              let netDeposit = 0
              let totalRefunds = 0

              if (billingData?.payments) {
                Object.entries(billingData.payments).forEach(([paymentId, paymentData]: [string, any]) => {
                  const payment: IPDPayment = {
                    id: paymentId,
                    amount: Number(paymentData.amount) || 0,
                    paymentType: paymentData.paymentType,
                    type: paymentData.type || "deposit",
                    date: paymentData.date,
                    createdAt: paymentData.createdAt || paymentData.date,
                  }
                  payments.push(payment)

                  if (payment.type === "refund") {
                    netDeposit -= payment.amount
                    totalRefunds += payment.amount
                  } else {
                    netDeposit += payment.amount
                  }
                })
              }

              // Calculate service amounts
              const services = billingData?.services || []
              const totalServiceAmount = services.reduce(
                (sum: number, service: IPDService) => sum + (Number(service.amount) || 0),
                0,
              )
              const discountAmount = Number(billingData?.discount) || 0

              // Create IPD patient object
              const ipdPatient: IPDPatient = {
                id: `${patientIdKey}_${ipdId}`,
                uhid: ipdData.uhid ?? patientIdKey,
                ipdId,
                billNumber: billingData?.billNumber || "",
                name: ipdData.name || "Unknown",
                phone: ipdData.phone || "",
                age: ipdData.age || "",
                gender: ipdData.gender || "",
                address: ipdData.address,
                admissionDate: ipdData.admissionDate,
                admissionTime: ipdData.admissionTime || "",
                doctor: ipdData.doctor || "",
                doctorId: ipdData.doctor || "",
                roomType: ipdData.roomType || "",
                roomNumber: ipdData.roomNumber,
                status: patientStatus,
                dischargeDate: ipdData.dischargeDate,
                dischargeTime: ipdData.dischargeTime,
                services,
                totalAmount: totalServiceAmount,
                totalDeposit: netDeposit,
                totalRefunds,
                payments,
                remainingAmount: totalServiceAmount - netDeposit - discountAmount,
                createdAt: ipdData.createdAt || ipdData.admissionDate,
                enteredBy: ipdData.enteredBy,
                discount: discountAmount,
              }

              allPatients.push(ipdPatient)
            }
          }
        }
      }

      console.log("Fetched patients:", allPatients.length)

      // Sort by admission date (newest first)
      allPatients.sort((a, b) => new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime())
      setIpdPatients(allPatients)

      if (allPatients.length === 0) {
        toast.info("No IPD patients found for the selected criteria")
      }
    } catch (error) {
      console.error("Error fetching IPD patients:", error)
      toast.error("Failed to load IPD patients. Please check your database connection.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filters.dateFilter, filters.status, filters.selectedMonth, filters.startDate, filters.endDate, getDateRange])

  // Initial load and filter changes
  useEffect(() => {
    fetchIPDPatients()
  }, [fetchIPDPatients])

  // Filtered patients based on search
  const filteredPatients = useMemo(() => {
    if (!filters.searchQuery.trim()) return ipdPatients

    const query = filters.searchQuery.toLowerCase()
    return ipdPatients.filter(
      (patient) =>
        patient.name.toLowerCase().includes(query) ||
        patient.phone.includes(query) ||
        patient.uhid.toLowerCase().includes(query) ||
        patient.roomNumber?.toLowerCase().includes(query) ||
        (doctors[patient.doctorId]?.name || "").toLowerCase().includes(query),
    )
  }, [ipdPatients, filters.searchQuery, doctors])

  // Dashboard statistics
  const stats = useMemo(() => {
    const activePatients = ipdPatients.filter((p) => p.status === "active")
    const dischargedPatients = ipdPatients.filter((p) => p.status === "discharged")

    const totalRevenue = ipdPatients.reduce((sum, p) => sum + (p.totalAmount - (p.discount || 0)), 0)
    const pendingAmount = ipdPatients.reduce((sum, p) => sum + Math.max(0, p.remainingAmount), 0)
    const overallRefunds = ipdPatients.reduce((sum, p) => sum + p.totalRefunds, 0)

    const paymentsByMethod = {
      cash: 0,
      online: 0,
      cashRefunds: 0,
      onlineRefunds: 0,
    }

    ipdPatients.forEach((patient) => {
      patient.payments.forEach((payment) => {
        if (payment.type === "refund") {
          if (payment.paymentType === "cash") {
            paymentsByMethod.cashRefunds += payment.amount
          } else if (payment.paymentType === "online") {
            paymentsByMethod.onlineRefunds += payment.amount
          }
        } else {
          if (payment.paymentType === "cash") {
            paymentsByMethod.cash += payment.amount
          } else if (payment.paymentType === "online") {
            paymentsByMethod.online += payment.amount
          }
        }
      })
    })

    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))
    const dailyAdmissions = last7Days.map(
      (day) => ipdPatients.filter((p) => isSameDay(new Date(p.admissionDate), day)).length,
    )
    const dailyRevenue = last7Days.map((day) =>
      ipdPatients.filter((p) => isSameDay(new Date(p.admissionDate), day)).reduce((sum, p) => sum + p.totalDeposit, 0),
    )

    return {
      totalPatients: ipdPatients.length,
      activeCount: activePatients.length,
      dischargedCount: dischargedPatients.length,
      totalRevenue,
      pendingAmount,
      overallRefunds,
      paymentsByMethod,
      last7Days: last7Days.map((day) => format(day, "MMM dd")),
      dailyAdmissions,
      dailyRevenue,
    }
  }, [ipdPatients])

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  // Reset filters
  const resetFilters = () => {
    setFilters({
      dateFilter: "7days",
      startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
      selectedMonth: format(new Date(), "yyyy-MM"),
      status: "all",
      searchQuery: "",
    })
  }

  // Refresh data
  const handleRefresh = () => {
    fetchIPDPatients()
  }

  // View patient details
  const viewPatientDetails = (patient: IPDPatient) => {
    setSelectedPatient(patient)
    setDetailsDialogOpen(true)
  }

  // Get doctor name
  const getDoctorName = (doctorId: string) => {
    return doctors[doctorId]?.name || "Unknown Doctor"
  }

  // Get filter title
  const getFilterTitle = () => {
    switch (filters.dateFilter) {
      case "today":
        return "Today's IPD Patients"
      case "7days":
        return "Last 7 Days IPD Patients"
      case "month":
        return `${format(parseISO(`${filters.selectedMonth}-01`), "MMMM yyyy")} IPD Patients`
      case "custom":
        return `${format(new Date(filters.startDate), "MMM dd")} - ${format(new Date(filters.endDate), "MMM dd, yyyy")}`
      default:
        return "IPD Patients"
    }
  }

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = []
    const today = new Date()
    for (let i = 0; i < 12; i++) {
      const date = subDays(startOfMonth(today), i * 30)
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy"),
      })
    }
    return options
  }, [])

  const exportIPDExcel = () => {
    const rows: any[] = []
    filteredPatients.forEach((patient) => {
      rows.push({
        "Patient Name": patient.name,
        "Phone": patient.phone,
        "Address": patient.address || "",
        "UHID": patient.uhid,
        "Bill Number": patient.billNumber || patient.ipdId,
        "Age": patient.age || "",
        "Gender": patient.gender || "",
        "Bed Name": patient.roomType || "",
        "Room Number": patient.roomNumber || "",
        "Admission Date": patient.admissionDate ? format(new Date(patient.admissionDate), "yyyy-MM-dd") : "",
        "Discharge Date": patient.dischargeDate ? format(new Date(patient.dischargeDate), "yyyy-MM-dd") : "",
        "Discount": patient.discount || 0,
        "Doctor Name": getDoctorName(patient.doctorId),
        "Status": patient.status,
        "Total Paid": patient.totalDeposit,
        "Payment Details": patient.payments.map((p) => `${p.type} (${p.paymentType}): ₹${p.amount}`).join("; "),
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "IPD Patients")
    XLSX.writeFile(wb, `IPD_Patients_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`)
    toast.success("Excel downloaded successfully")
  }

  if (loading && !refreshing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-xl text-gray-600">Loading IPD data...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">IPD Management</h1>
                <p className="text-gray-600">Inpatient Department - {getFilterTitle()}</p>
              </div>
              <div className="flex gap-3">
                <Select
                  value={filters.dateFilter}
                  onValueChange={(value: DateFilter) => handleFilterChange({ dateFilter: value })}
                >
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="month">Select Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Custom Date Range and Month Filter */}
          {(filters.dateFilter === "custom" || filters.dateFilter === "month") && (
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                {filters.dateFilter === "custom" && (
                  <>
                    <div className="w-full sm:w-auto">
                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <Input
                        id="startDate"
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => handleFilterChange({ startDate: e.target.value })}
                        className="w-full sm:w-40"
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <Input
                        id="endDate"
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => handleFilterChange({ endDate: e.target.value })}
                        className="w-full sm:w-40"
                      />
                    </div>
                  </>
                )}
                {filters.dateFilter === "month" && (
                  <div className="w-full sm:w-auto">
                    <label htmlFor="selectedMonth" className="block text-sm font-medium text-gray-700 mb-1">
                      Select Month
                    </label>
                    <Select
                      value={filters.selectedMonth}
                      onValueChange={(value) => handleFilterChange({ selectedMonth: value })}
                    >
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleRefresh} className="w-full sm:w-auto">
                  Apply Filter
                </Button>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                <Bed className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalPatients}</div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100">
                    {stats.activeCount} Active
                  </Badge>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                    {stats.dischargedCount} Discharged
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Net Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {filters.dateFilter === "today" ? "Today's net collections" : "Period net collections"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{formatCurrency(stats.pendingAmount)}</div>
                <p className="text-xs text-muted-foreground mt-2">Outstanding balance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payment Breakdown</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(stats.paymentsByMethod.cash + stats.paymentsByMethod.online)}
                </div>
                <div className="flex flex-col gap-1 mt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cash (Net):</span>
                    <span className="font-semibold">{formatCurrency(stats.paymentsByMethod.cash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Online (Net):</span>
                    <span className="font-semibold">{formatCurrency(stats.paymentsByMethod.online)}</span>
                  </div>
                  {stats.overallRefunds > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span className="font-semibold">Total Refunds:</span>
                      <span className="font-bold">{formatCurrency(stats.overallRefunds)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Daily Admissions (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <Line
                  data={{
                    labels: stats.last7Days,
                    datasets: [
                      {
                        label: "Admissions",
                        data: stats.dailyAdmissions,
                        borderColor: "rgb(59, 130, 246)",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                        },
                      },
                    },
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Method Distribution (Net)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="w-64 h-64">
                  <Doughnut
                    data={{
                      labels: ["Cash", "Online"],
                      datasets: [
                        {
                          data: [stats.paymentsByMethod.cash, stats.paymentsByMethod.online],
                          backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(59, 130, 246, 0.8)"],
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: "bottom" },
                      },
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 w-full">
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <div className="text-sm text-green-700">Cash (Net)</div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(stats.paymentsByMethod.cash)}
                    </div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-700">Online (Net)</div>
                    <div className="text-lg font-bold text-blue-600">
                      {formatCurrency(stats.paymentsByMethod.online)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters */}
          <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search by name, phone, UHID, room..."
                value={filters.searchQuery}
                onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Select value={filters.status} onValueChange={(value) => handleFilterChange({ status: value as any })}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="discharged">Discharged</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>
          </div>

          {/* Export Excel Button */}
          <Button onClick={exportIPDExcel} variant="outline" className="mb-4 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16v-8m0 8l-3-3m3 3l3-3m-9 5.25A2.25 2.25 0 015.25 19.5h13.5A2.25 2.25 0 0021 17.25v-10.5A2.25 2.25 0 0018.75 4.5H5.25A2.25 2.25 0 003 6.75v10.5z"
              />
            </svg>
            Export Excel
          </Button>

          {/* IPD Patients Table */}
          <Card>
            <CardHeader>
              <CardTitle>IPD Patients ({filteredPatients.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {refreshing ? (
                <div className="flex justify-center items-center p-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mr-3" />
                  <span>Refreshing data...</span>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Bed className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">No IPD patients found</p>
                  <p className="text-sm">Try adjusting your filters or check your database connection</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Admission</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Billing</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPatients.map((patient) => (
                        <TableRow key={patient.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{patient.name}</div>
                              <div className="text-sm text-gray-500">{patient.phone}</div>
                              <div className="text-xs text-gray-400">UHID: {patient.uhid}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{format(new Date(patient.admissionDate), "dd MMM yyyy")}</div>
                              <div className="text-sm text-gray-500">{patient.admissionTime}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{patient.roomType}</div>
                              {patient.roomNumber && (
                                <div className="text-sm text-gray-500">Room #{patient.roomNumber}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{getDoctorName(patient.doctorId)}</div>
                          </TableCell>
                          <TableCell>
                            {patient.status === "active" ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Active</Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Discharged</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">Net: {formatCurrency(patient.totalDeposit)}</div>
                              {patient.remainingAmount > 0 && (
                                <div className="text-sm text-red-500">
                                  Pending: {formatCurrency(patient.remainingAmount)}
                                </div>
                              )}
                              {patient.totalRefunds > 0 && (
                                <div className="text-xs text-blue-600">
                                  Refunds: {formatCurrency(patient.totalRefunds)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => viewPatientDetails(patient)}>
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Patient Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Patient Details</DialogTitle>
            <DialogDescription>
              UHID: {selectedPatient?.uhid} | IPD ID: {selectedPatient?.ipdId}
            </DialogDescription>
          </DialogHeader>

          {selectedPatient && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="details">Patient Details</TabsTrigger>
                <TabsTrigger value="services">Services & Charges</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h3 className="font-semibold text-blue-800 mb-3">Patient Information</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Name:</span>
                          <span className="font-medium">{selectedPatient.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Phone:</span>
                          <span className="font-medium">{selectedPatient.phone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Age:</span>
                          <span className="font-medium">{selectedPatient.age}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gender:</span>
                          <span className="font-medium">{selectedPatient.gender}</span>
                        </div>
                        {selectedPatient.address && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Address:</span>
                            <span className="font-medium">{selectedPatient.address}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h3 className="font-semibold text-green-800 mb-3">Admission Details</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Admission Date:</span>
                          <span className="font-medium">
                            {format(new Date(selectedPatient.admissionDate), "dd MMM yyyy")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Admission Time:</span>
                          <span className="font-medium">{selectedPatient.admissionTime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Doctor:</span>
                          <span className="font-medium">{getDoctorName(selectedPatient.doctorId)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Status:</span>
                          <Badge
                            className={
                              selectedPatient.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-blue-100 text-blue-800"
                            }
                          >
                            {selectedPatient.status === "active" ? "Active" : "Discharged"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <h3 className="font-semibold text-purple-800 mb-3">Room Information</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Room Type:</span>
                          <span className="font-medium">{selectedPatient.roomType}</span>
                        </div>
                        {selectedPatient.roomNumber && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Room Number:</span>
                            <span className="font-medium">{selectedPatient.roomNumber}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedPatient.status === "discharged" && selectedPatient.dischargeDate && (
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <h3 className="font-semibold text-blue-800 mb-3">Discharge Information</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Discharge Date:</span>
                            <span className="font-medium">
                              {format(new Date(selectedPatient.dischargeDate), "dd MMM yyyy")}
                            </span>
                          </div>
                          {selectedPatient.dischargeTime && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Discharge Time:</span>
                              <span className="font-medium">{selectedPatient.dischargeTime}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <h3 className="font-semibold text-amber-800 mb-3">Billing Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Charges:</span>
                          <span className="font-medium">{formatCurrency(selectedPatient.totalAmount)}</span>
                        </div>
                        {selectedPatient.discount && selectedPatient.discount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span className="flex items-center">
                              <Tag size={14} className="mr-1" /> Discount:
                            </span>
                            <span className="font-medium">- {formatCurrency(selectedPatient.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Net Paid:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(selectedPatient.totalDeposit)}
                          </span>
                        </div>
                        {selectedPatient.totalRefunds > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Refunds Issued:</span>
                            <span className="font-medium text-blue-600">
                              {formatCurrency(selectedPatient.totalRefunds)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600">Remaining Balance:</span>
                          <span
                            className={`font-medium ${
                              selectedPatient.totalAmount -
                                (selectedPatient.discount || 0) -
                                selectedPatient.totalDeposit >
                              0
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            {formatCurrency(
                              selectedPatient.totalAmount -
                                (selectedPatient.discount || 0) -
                                selectedPatient.totalDeposit,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="services" className="mt-4">
                {selectedPatient.services.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No services recorded for this patient</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPatient.services.map((service, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{service.serviceName}</TableCell>
                            <TableCell className="capitalize">{service.type}</TableCell>
                            <TableCell>{service.doctorName || "-"}</TableCell>
                            <TableCell>
                              {service.createdAt ? format(new Date(service.createdAt), "dd MMM yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(service.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={4} className="font-bold text-right">
                            Total
                          </TableCell>
                          <TableCell className="font-bold text-right">
                            {formatCurrency(selectedPatient.totalAmount)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                {selectedPatient.payments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Banknote className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No payments recorded for this patient</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Payment Type</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedPatient.payments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{format(new Date(payment.date), "dd MMM yyyy")}</TableCell>
                              <TableCell className="capitalize">{payment.type}</TableCell>
                              <TableCell className="capitalize">{payment.paymentType}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(payment.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-white rounded-lg shadow-sm">
                          <div className="text-sm text-gray-600">Total Net Paid</div>
                          <div className="text-xl font-bold text-green-600">
                            {formatCurrency(selectedPatient.totalDeposit)}
                          </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg shadow-sm">
                          <div className="text-sm text-gray-600">Total Charges</div>
                          <div className="text-xl font-bold text-gray-700">
                            {formatCurrency(selectedPatient.totalAmount)}
                          </div>
                        </div>
                        {selectedPatient.discount && selectedPatient.discount > 0 && (
                          <div className="p-3 bg-white rounded-lg shadow-sm">
                            <div className="text-sm text-gray-600">Discount</div>
                            <div className="text-xl font-bold text-green-600">
                              {formatCurrency(selectedPatient.discount)}
                            </div>
                          </div>
                        )}
                        <div className="p-3 bg-white rounded-lg shadow-sm">
                          <div className="text-sm text-gray-600">Total Refunds Issued</div>
                          <div className="text-xl font-bold text-blue-600">
                            {formatCurrency(selectedPatient.totalRefunds)}
                          </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg shadow-sm col-span-full">
                          <div className="text-sm text-gray-600">Net Balance</div>
                          <div
                            className={`text-xl font-bold ${
                              selectedPatient.totalAmount -
                                (selectedPatient.discount || 0) -
                                selectedPatient.totalDeposit >
                              0
                                ? "text-red-600"
                                : selectedPatient.totalAmount -
                                      (selectedPatient.discount || 0) -
                                      selectedPatient.totalDeposit <
                                    0
                                  ? "text-green-600"
                                  : "text-gray-800"
                            }`}
                          >
                            {formatCurrency(
                              selectedPatient.totalAmount -
                                (selectedPatient.discount || 0) -
                                selectedPatient.totalDeposit,
                            )}
                            {selectedPatient.totalAmount -
                              (selectedPatient.discount || 0) -
                              selectedPatient.totalDeposit >
                            0
                              ? " (Due)"
                              : selectedPatient.totalAmount -
                                    (selectedPatient.discount || 0) -
                                    selectedPatient.totalDeposit <
                                  0
                                ? " (Refundable)"
                                : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

const IPDDashboardPageWithProtection: React.FC = () => (
  <ProtectedRoute>
    <IPDDashboardPage />
  </ProtectedRoute>
)

export default IPDDashboardPageWithProtection