"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { db } from "../../lib/firebase"
import { ref, query, orderByChild, startAt, endAt, get, remove } from "firebase/database"
import { format, isSameDay, subDays, startOfDay, endOfDay ,eachDayOfInterval } from "date-fns"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import {
  Search,
  Trash2,
  Eye,
  Users,
  CreditCard,
  Banknote,
  RefreshCw,
  Filter,
  IndianRupeeIcon,
  TrendingUp,
} from "lucide-react"

import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// Updated interface for new data structure
interface IModality {
  charges: number
  doctor?: string
  specialist?: string
  type: "consultation" | "casualty" | "xray"
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

interface IOPDEntry {
  id: string // appointmentId
  patientId: string
  name: string
  phone: string
  appointmentType: string
  createdAt: string
  date: string
  enteredBy: string
  message: string
  modalities: IModality[]
  opdType: string
  payment: IPayment
  referredBy: string
  study: string
  time: string
  visitType: string
}

interface PaymentSummary {
  totalCash: number
  totalOnline: number
  totalAmount: number
  totalDiscount: number
  netRevenue: number
}

interface DashboardStats {
  totalAppointments: number
  totalRevenue: number
  paymentBreakdown: PaymentSummary
  averageAmount: number
  totalConsultations: number
  totalCasualty: number
  totalXrays: number
}

type DateFilter = "today" | "7days"

const AdminDashboardPage: React.FC = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days")
  const [opdAppointments, setOpdAppointments] = useState<IOPDEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedAppointment, setSelectedAppointment] = useState<IOPDEntry | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<IOPDEntry | null>(null)

  // Get date range based on filter
  const getDateRange = useCallback((filter: DateFilter) => {
    const now = new Date()
    const today = startOfDay(now)

    switch (filter) {
      case "today":
        return {
          start: today.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      case "7days":
        const sevenDaysAgo = startOfDay(subDays(now, 6)) // Last 7 days including today
        return {
          start: sevenDaysAgo.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      default:
        return {
          start: today.toISOString(),
          end: endOfDay(now).toISOString(),
        }
    }
  }, [])

  
  const fetchOPDAppointments = useCallback(
    async (filter: DateFilter) => {
      const isRefresh = !loading;
      if (isRefresh) setRefreshing(true);
  
      try {
        const allAppointments: IOPDEntry[] = [];
        let dateKeys: string[] = [];
  
        if (filter === "today") {
          const todayKey = format(new Date(), "yyyy-MM-dd");
          dateKeys = [todayKey];
        } else if (filter === "7days") {
          const today = new Date();
          const sevenDaysAgo = subDays(today, 6);
          const days = eachDayOfInterval({ start: sevenDaysAgo, end: today });
          dateKeys = days.map((d) => format(d, "yyyy-MM-dd"));
        }
  
        // For each dateKey, fetch the date node, then flatten all appointments
        for (const dateKey of dateKeys) {
          const dateRef = ref(db, `patients/opddetail/${dateKey}`);
          const dateSnap = await get(dateRef);
  
          const data = dateSnap.val();
          if (data && typeof data === "object") {
            Object.entries(data).forEach(([patientId, appointments]) => {
              // appointments is possibly an object { [appointmentId]: apptData }
              if (appointments && typeof appointments === "object") {
                Object.entries(appointments as Record<string, any>).forEach(([appointmentId, appt]) => {
                  if (appt && typeof appt === "object") {
                    allAppointments.push({
                      id: appointmentId,
                      patientId,
                      name: appt.name || "Unknown",
                      phone: appt.phone || "",
                      appointmentType: appt.appointmentType || "visithospital",
                      createdAt: appt.createdAt,
                      date: appt.date,
                      enteredBy: appt.enteredBy || "",
                      message: appt.message || "",
                      modalities: appt.modalities || [],
                      opdType: appt.opdType || "",
                      payment: appt.payment || {
                        cashAmount: 0,
                        createdAt: "",
                        discount: 0,
                        onlineAmount: 0,
                        paymentMethod: "cash",
                        totalCharges: 0,
                        totalPaid: 0,
                      },
                      referredBy: appt.referredBy || "",
                      study: appt.study || "",
                      time: appt.time || "",
                      visitType: appt.visitType || "",
                    });
                  }
                });
              }
            });
          }
        }
  
        // Sort by creation date (newest first)
        allAppointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOpdAppointments(allAppointments);
      } catch (error) {
        console.error("Error fetching OPD appointments:", error);
        toast.error("Failed to load appointments");
        setOpdAppointments([]);
      } finally {
        setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [loading],
  );
  

  // Initial load and filter changes
  useEffect(() => {
    fetchOPDAppointments(dateFilter)
  }, [dateFilter, fetchOPDAppointments])

  // Enhanced dashboard statistics calculation
  const dashboardStats = useMemo((): DashboardStats => {
    const paymentBreakdown: PaymentSummary = {
      totalCash: 0,
      totalOnline: 0,
      totalAmount: 0,
      totalDiscount: 0,
      netRevenue: 0,
    }

    let totalConsultations = 0
    let totalCasualty = 0
    let totalXrays = 0

    opdAppointments.forEach((appt) => {
      // Payment calculations
      paymentBreakdown.totalCash += appt.payment.cashAmount
      paymentBreakdown.totalOnline += appt.payment.onlineAmount
      paymentBreakdown.totalAmount += appt.payment.totalPaid
      paymentBreakdown.totalDiscount += appt.payment.discount
      paymentBreakdown.netRevenue += appt.payment.totalPaid

      // Count modalities
      appt.modalities.forEach((modality) => {
        switch (modality.type) {
          case "consultation":
            totalConsultations++
            break
          case "casualty":
            totalCasualty++
            break
          case "xray":
            totalXrays++
            break
        }
      })
    })

    return {
      totalAppointments: opdAppointments.length,
      totalRevenue: paymentBreakdown.netRevenue,
      paymentBreakdown,
      averageAmount: opdAppointments.length > 0 ? paymentBreakdown.netRevenue / opdAppointments.length : 0,
      totalConsultations,
      totalCasualty,
      totalXrays,
    }
  }, [opdAppointments])

  // Chart data for appointments over time
  const appointmentChartData = useMemo(() => {
    const days = dateFilter === "today" ? [new Date()] : Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))

    const appointmentCounts = days.map(
      (day) => opdAppointments.filter((appt) => isSameDay(new Date(appt.date), day)).length,
    )

    const revenueCounts = days.map((day) =>
      opdAppointments
        .filter((appt) => isSameDay(new Date(appt.date), day))
        .reduce((acc, appt) => acc + appt.payment.totalPaid, 0),
    )

    return {
      labels: days.map((day) => format(day, dateFilter === "today" ? "HH:mm" : "MMM dd")),
      appointmentCounts,
      revenueCounts,
    }
  }, [opdAppointments, dateFilter])

  // Filtered appointments for search
  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return opdAppointments

    const query = searchQuery.toLowerCase()
    return opdAppointments.filter(
      (appt) =>
        appt.name.toLowerCase().includes(query) ||
        appt.phone.includes(query) ||
        appt.patientId.toLowerCase().includes(query) ||
        appt.modalities.some(
          (mod) =>
            mod.doctor?.toLowerCase().includes(query) ||
            mod.specialist?.toLowerCase().includes(query) ||
            mod.service?.toLowerCase().includes(query),
        ),
    )
  }, [opdAppointments, searchQuery])

  // Format payment display for table
  const formatPaymentDisplay = (appointment: IOPDEntry) => {
    if (appointment.payment.paymentMethod === "mixed") {
      return `₹${appointment.payment.totalPaid} (C:${appointment.payment.cashAmount} + O:${appointment.payment.onlineAmount})`
    }
    return `₹${appointment.payment.totalPaid}`
  }

  // Get modalities summary for display
  const getModalitiesSummary = (modalities: IModality[]) => {
    const consultations = modalities.filter((m) => m.type === "consultation").length
    const casualty = modalities.filter((m) => m.type === "casualty").length
    const xrays = modalities.filter((m) => m.type === "xray").length

    const parts = []
    if (consultations > 0) parts.push(`${consultations} Consultation${consultations > 1 ? "s" : ""}`)
    if (casualty > 0) parts.push(`${casualty} Casualty`)
    if (xrays > 0) parts.push(`${xrays} X-ray${xrays > 1 ? "s" : ""}`)

    return parts.join(", ") || "No services"
  }

  // Delete appointment
  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return

    try {
      const opdRef = ref(db, `patients/opddetail/${appointmentToDelete.patientId}/${appointmentToDelete.id}`)
      await remove(opdRef)

      toast.success("Appointment deleted successfully!")
      setDeleteDialogOpen(false)
      setAppointmentToDelete(null)

      // Refresh data
      fetchOPDAppointments(dateFilter)
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  // Refresh data
  const handleRefresh = () => {
    fetchOPDAppointments(dateFilter)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-xl text-gray-600">Loading dashboard...</p>
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
                <h1 className="text-4xl font-bold text-gray-900 mb-2">OPD Admin Dashboard</h1>
                <p className="text-gray-600">
                  {dateFilter === "today" ? "Today's" : "Last 7 days"} comprehensive payment & appointment analytics
                </p>
              </div>
              <div className="flex gap-3">
                <Select value={dateFilter} onValueChange={(value: DateFilter) => setDateFilter(value)}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Payment Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-100">Total Cash Collected</CardTitle>
                <Banknote className="h-5 w-5 text-green-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹{dashboardStats.paymentBreakdown.totalCash.toLocaleString()}</div>
                <p className="text-xs text-green-100 mt-1">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.totalCash / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total revenue
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Total Online Collected</CardTitle>
                <CreditCard className="h-5 w-5 text-blue-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ₹{dashboardStats.paymentBreakdown.totalOnline.toLocaleString()}
                </div>
                <p className="text-xs text-blue-100 mt-1">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.totalOnline / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total revenue
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-100">Total Amount</CardTitle>
                <IndianRupeeIcon className="h-5 w-5 text-purple-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹{dashboardStats.totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-purple-100 mt-1">Total collected amount</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardStats.totalAppointments}</div>
                <p className="text-xs text-muted-foreground">Avg: ₹{Math.round(dashboardStats.averageAmount)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Payment Collection Summary */}
          <Card className="mb-8 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-800">
                <TrendingUp className="h-5 w-5" />
                Payment Collection Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-emerald-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Banknote className="h-6 w-6 text-green-600" />
                    <span className="font-semibold text-gray-700">Cash Collection</span>
                  </div>
                  <div className="text-3xl font-bold text-green-700 mb-1">
                    ₹{dashboardStats.paymentBreakdown.totalCash.toLocaleString()}
                  </div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-blue-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CreditCard className="h-6 w-6 text-blue-600" />
                    <span className="font-semibold text-gray-700">Online Collection</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-700 mb-1">
                    ₹{dashboardStats.paymentBreakdown.totalOnline.toLocaleString()}
                  </div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-purple-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <IndianRupeeIcon className="h-6 w-6 text-purple-600" />
                    <span className="font-semibold text-gray-700">Total Revenue</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-700 mb-1">
                    ₹{dashboardStats.totalRevenue.toLocaleString()}
                  </div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-orange-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Users className="h-6 w-6 text-orange-600" />
                    <span className="font-semibold text-gray-700">Services</span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Consultations: {dashboardStats.totalConsultations}</div>
                    <div>Casualty: {dashboardStats.totalCasualty}</div>
                    <div>X-rays: {dashboardStats.totalXrays}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appointments Chart */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{dateFilter === "today" ? "Today's Appointments" : "Appointments (Last 7 Days)"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Line
                data={{
                  labels: appointmentChartData.labels,
                  datasets: [
                    {
                      label: "Appointments",
                      data: appointmentChartData.appointmentCounts,
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
                    y: { beginAtZero: true },
                  },
                }}
              />
            </CardContent>
          </Card>

          {/* Enhanced Appointments Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <CardTitle>Recent Appointments</CardTitle>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search appointments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchQuery ? "No matching appointments found" : "No appointments available"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Patient</th>
                        <th className="text-left py-3 px-4 font-medium">Services</th>
                        <th className="text-left py-3 px-4 font-medium">Payment</th>
                        <th className="text-left py-3 px-4 font-medium">Date</th>
                        <th className="text-left py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments.slice(0, 20).map((appt) => (
                        <tr key={`${appt.patientId}-${appt.id}`} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{appt.name}</div>
                              <div className="text-sm text-gray-500">{appt.phone}</div>
                              <div className="text-xs text-gray-400">ID: {appt.patientId}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm">{getModalitiesSummary(appt.modalities)}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">
                                {appt.payment.paymentMethod}
                              </Badge>
                              {appt.payment.discount > 0 && (
                                <span className="text-green-600">(-₹{appt.payment.discount})</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{formatPaymentDisplay(appt)}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">
                                {appt.payment.paymentMethod}
                              </Badge>
                              {appt.payment.discount > 0 && (
                                <span className="text-green-600">(-₹{appt.payment.discount})</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>{format(new Date(appt.date), "MMM dd, yyyy")}</div>
                            <div className="text-sm text-gray-500">{appt.time}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setSelectedAppointment(appt)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAppointmentToDelete(appt)
                                  setDeleteDialogOpen(true)
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAppointments.length > 30 && (
                    <div className="text-center py-4 text-gray-500">
                      Showing first 20 of {filteredAppointments.length} appointments
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enhanced Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>Patient ID: {selectedAppointment?.patientId}</DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Patient Information</h4>
                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Name:</span>
                    <span className="font-semibold">{selectedAppointment.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Phone:</span>
                    <span>{selectedAppointment.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Patient ID:</span>
                    <span className="font-mono text-xs">{selectedAppointment.patientId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Visit Type:</span>
                    <span className="capitalize">{selectedAppointment.visitType}</span>
                  </div>
                  {selectedAppointment.referredBy && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Referred By:</span>
                      <span>{selectedAppointment.referredBy}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Appointment Details</h4>
                <div className="space-y-2 text-sm bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Type:</span>
                    <Badge variant="outline">{selectedAppointment.appointmentType}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Date:</span>
                    <span className="font-semibold">{format(new Date(selectedAppointment.date), "PPP")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Time:</span>
                    <span className="font-semibold">{selectedAppointment.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Created:</span>
                    <span className="text-xs">{format(new Date(selectedAppointment.createdAt), "PPp")}</span>
                  </div>
                  {selectedAppointment.enteredBy && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Entered By:</span>
                      <span className="text-xs">{selectedAppointment.enteredBy}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Payment Information</h4>
                <div className="space-y-2 text-sm bg-green-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Method:</span>
                    <Badge variant="default" className="capitalize">
                      {selectedAppointment.payment.paymentMethod}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Total Charges:</span>
                    <span className="font-semibold">₹{selectedAppointment.payment.totalCharges}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Cash Amount:</span>
                    <span className="font-semibold text-green-700">₹{selectedAppointment.payment.cashAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Online Amount:</span>
                    <span className="font-semibold text-blue-700">₹{selectedAppointment.payment.onlineAmount}</span>
                  </div>
                  {selectedAppointment.payment.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Discount:</span>
                      <span className="text-red-600 font-semibold">₹{selectedAppointment.payment.discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium text-gray-600">Total Paid:</span>
                    <span className="font-bold text-lg">₹{selectedAppointment.payment.totalPaid}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Services & Modalities</h4>
                <div className="space-y-3 text-sm bg-purple-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                  {selectedAppointment.modalities.map((modality, index) => (
                    <div key={index} className="border border-purple-200 rounded p-3 bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="capitalize">
                          {modality.type}
                        </Badge>
                        <span className="font-semibold text-purple-700">₹{modality.charges}</span>
                      </div>
                      {modality.doctor && (
                        <div className="text-xs text-gray-600">
                          <strong>Doctor:</strong> {modality.doctor}
                        </div>
                      )}
                      {modality.specialist && (
                        <div className="text-xs text-gray-600">
                          <strong>Specialist:</strong> {modality.specialist}
                        </div>
                      )}
                      {modality.service && (
                        <div className="text-xs text-gray-600">
                          <strong>Service:</strong> {modality.service}
                        </div>
                      )}
                      {modality.visitType && (
                        <div className="text-xs text-gray-600">
                          <strong>Visit Type:</strong> {modality.visitType}
                        </div>
                      )}
                    </div>
                  ))}
                  {selectedAppointment.modalities.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No services recorded</div>
                  )}
                </div>
              </div>

              {selectedAppointment.message && (
                <div className="lg:col-span-2">
                  <h4 className="font-semibold mb-3 text-gray-800">Additional Notes</h4>
                  <div className="text-sm bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <p className="text-gray-700">{selectedAppointment.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <div className="text-sm text-gray-600">
              Are you sure you want to delete the appointment for <strong>{appointmentToDelete?.name}</strong>? This
              action cannot be undone.
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAppointment} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default AdminDashboardPage
