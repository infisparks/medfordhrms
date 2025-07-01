"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { db } from "@/lib/firebase"
import { eachDayOfInterval } from "date-fns"
import { ref, query, get, remove } from "firebase/database" // Import remove
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EditButton } from "./edit-button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calendar, RefreshCw, Eye, ArrowUpDown, X, Filter, Trash2, AlertCircle, Users } from "lucide-react"
import { ToastContainer, toast } from "react-toastify" // Ensure ToastContainer is imported
import "react-toastify/dist/ReactToastify.css" // Ensure CSS is imported

// === Helpers for download size ===
function byteSize(str: string) {
  return new Blob([str]).size
}

function humanFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(2) + " MB"
}

interface Appointment {
  id: string
  patientId: string // This is the UHID
  name: string
  phone: string
  date: string
  time: string
  doctor?: string // This is the main consulting doctor, not necessarily from modalities
  appointmentType: string
  modalities: any[] // Modalities can contain doctor info for consultation type
  createdAt: string
  payment?: {
    totalCharges: number
    totalPaid: number
    discount: number
    paymentMethod: string
  }
}

const getTodayDateKey = () => format(new Date(), "yyyy-MM-dd")

const flattenAppointments = (snap: Record<string, any> | null | undefined, filterFn: (a: any) => boolean) => {
  const result: Appointment[] = []
  if (!snap) return result
  Object.entries(snap).forEach(([patientId, apps]) => {
    if (typeof apps === "object" && apps !== null) {
      Object.entries(apps as Record<string, any>).forEach(([apptId, data]) => {
        const appointmentData = {
          id: apptId,
          patientId: patientId, // Capture patientId as UHID
          name: data.name || "",
          phone: data.phone || "",
          date: data.date || "",
          time: data.time || "",
          doctor: data.doctor || "", // Main consulting doctor
          appointmentType: data.appointmentType || "visithospital",
          modalities: data.modalities || [],
          createdAt: data.createdAt || "",
          payment: data.payment || {
            totalCharges: 0,
            totalPaid: 0,
            discount: 0,
            paymentMethod: "cash",
          },
        }
        if (filterFn(appointmentData)) {
          result.push(appointmentData)
        }
      })
    }
  })
  return result
}

export default function ManageOPDPage() {
  const router = useRouter()
  const [activeFilterTab, setActiveFilterTab] = useState<string>("today") // Can be "today" or a doctor's name
  const [appointments, setAppointments] = useState<Appointment[]>([]) // All today's appointments
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState({
    key: "date",
    direction: "desc" as "desc" | "asc",
  })
  const [downloadedCount, setDownloadedCount] = useState(0)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [doctorTabs, setDoctorTabs] = useState<{ name: string; count: number }[]>([])

  // State for deletion modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null)

  // Fetch only today's data
  const fetchTodayAppointments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setSearchTerm("") // Clear search term when fetching new data
    setActiveFilterTab("today") // Reset active filter tab

    try {
      const todayKey = getTodayDateKey()
      const opdRef = ref(db, `patients/opddetail/${todayKey}`)
      const snap = await get(query(opdRef))
      const data = snap.val() as Record<string, any> | null
      const result = flattenAppointments(data, () => true)
      setAppointments(result)
      setDownloadedCount(result.length)
      setDownloadedBytes(byteSize(JSON.stringify(data || {})))

      // Calculate doctor consultation counts for dynamic tabs based on modalities
      const doctorCounts: { [key: string]: number } = {}
      result.forEach((app) => {
        if (app.appointmentType === "visithospital" && app.modalities && Array.isArray(app.modalities)) {
          app.modalities.forEach((modality) => {
            if (modality.type === "consultation" && modality.doctor) {
              doctorCounts[modality.doctor] = (doctorCounts[modality.doctor] || 0) + 1
            }
          })
        }
      })
      const sortedDoctors = Object.entries(doctorCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      setDoctorTabs(sortedDoctors)
    } catch (err) {
      setError("Failed to load today's appointments")
      setAppointments([])
      setDownloadedCount(0)
      setDownloadedBytes(0)
      setDoctorTabs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch historical data for search (e.g., last 90 days)
  const fetchHistoricalAppointments = useCallback(async (term: string) => {
    const results: Appointment[] = []
    let totalBytes = 0
    const t = term.toLowerCase()
    const today = new Date()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(today.getDate() - 89)
    const daysToFetch = eachDayOfInterval({ start: ninetyDaysAgo, end: today })

    const fetches = daysToFetch.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd")
      const opdRef = ref(db, `patients/opddetail/${dateKey}`)
      return get(query(opdRef)).then((snap) => ({
        data: snap.val() as Record<string, any> | null,
        dateKey,
      }))
    })

    const snaps = await Promise.all(fetches)

    for (const { data } of snaps) {
      if (data) {
        const filtered = flattenAppointments(
          data,
          (a) =>
            (a.name || "").toLowerCase().includes(t) ||
            (a.phone || "").includes(t) ||
            (a.patientId || "").toLowerCase().includes(t), // Added search by patientId (UHID)
        )
        results.push(...filtered)
        totalBytes += byteSize(JSON.stringify(data))
      }
    }

    setDownloadedCount(results.length)
    setDownloadedBytes(totalBytes)
    return results
  }, [])

  // Search only when search term is >= 6 characters
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (searchTerm.length >= 6) {
        setSearching(true)
        setError(null)
        try {
          const historicalResults = await fetchHistoricalAppointments(searchTerm)
          setAppointments(historicalResults) // Update main appointments state with search results
          setDoctorTabs([]) // Clear doctor tabs when in search mode
          setActiveFilterTab("today") // Keep "today" tab active visually for search results
        } catch (err) {
          setError("Failed to search historical appointments")
          setAppointments([])
          setDownloadedCount(0)
          setDownloadedBytes(0)
        } finally {
          setSearching(false)
        }
      } else {
        // If search term is too short, revert to today's data
        setSearching(false)
        setError(null)
        fetchTodayAppointments() // Re-fetch today's data and re-populate doctor tabs
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [searchTerm, fetchTodayAppointments, fetchHistoricalAppointments])

  // Initial load
  useEffect(() => {
    fetchTodayAppointments()
  }, [fetchTodayAppointments])

  // Filtering based on activeFilterTab and searchTerm
  const filteredAndSortedAppointments = [...appointments]
    .filter((app) => {
      // Apply doctor filter if activeFilterTab is a doctor's name
      if (activeFilterTab !== "today") {
        // Check if any modality is a consultation by the selected doctor
        const hasConsultationByDoctor = app.modalities.some(
          (modality) => modality.type === "consultation" && modality.doctor === activeFilterTab,
        )
        if (!hasConsultationByDoctor) {
          return false
        }
      }
      // Apply search term filter
      const term = searchTerm.trim().toLowerCase()
      if (term.length >= 6) {
        return (
          (app.name || "").toLowerCase().includes(term) ||
          (app.phone || "").includes(term) ||
          (app.patientId || "").toLowerCase().includes(term)
        )
      }
      return true
    })
    .sort((a, b) => {
      const { key, direction } = sortConfig
      if (key === "date") {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        return direction === "asc" ? da - db : db - da
      }
      // Handle sorting for patientId, name, phone
      if (key === "name" || key === "phone" || key === "patientId") {
        const va = (a as any)[key] || ""
        const vb = (b as any)[key] || ""
        return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return 0
    })

  // Handle delete button click
  const handleDeleteAppointment = (e: React.MouseEvent, app: Appointment) => {
    e.stopPropagation()
    setAppointmentToDelete(app)
    setDeletePassword("")
    setDeleteError("")
    setShowDeleteModal(true)
  }

  // Confirm deletion after password input
  const confirmDeleteAppointment = async () => {
    if (deletePassword !== "medford@786") {
      setDeleteError("Incorrect password.")
      return
    }

    if (!appointmentToDelete) {
      setDeleteError("No appointment selected for deletion.")
      return
    }

    setIsLoading(true) // Show loading state during deletion
    try {
      const { patientId, id: appointmentId, date, appointmentType } = appointmentToDelete
      const dateKey = format(new Date(date), "yyyy-MM-dd")

      // 1. Delete from patients/opddetail/{dateKey}/{uhid}/{appointmentId}
      await remove(ref(db, `patients/opddetail/${dateKey}/${patientId}/${appointmentId}`))

      // 2. If it's an on-call appointment, delete from oncall-appointments/{appointmentId}
      if (appointmentType === "oncall") {
        await remove(ref(db, `oncall-appointments/${appointmentId}`))
      }

      toast.success("Appointment cancelled and records deleted successfully!", {
        position: "top-right",
        autoClose: 5000,
      })
      setShowDeleteModal(false)
      setAppointmentToDelete(null)
      setDeletePassword("")
      setDeleteError("")
      fetchTodayAppointments() // Re-fetch data to update the list
    } catch (error) {
      console.error("Error cancelling appointment:", error)
      toast.error("Failed to cancel appointment.", {
        position: "top-right",
        autoClose: 5000,
      })
      setDeleteError("An error occurred during cancellation.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50">
        <ToastContainer /> {/* ToastContainer for notifications */}
        <div className="bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">OPD Management</h1>
                <p className="text-sm text-gray-500">Fast, filtered OPD dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/opd")}
                    className="hidden md:flex gap-2 bg-black text-white"
                  >
                    <Calendar className="h-4 w-4" />
                    New Appointment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Schedule a new appointment</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="default" onClick={fetchTodayAppointments} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Tabs value={activeFilterTab} onValueChange={setActiveFilterTab} className="w-full mb-4">
            <TabsList className="bg-slate-100 overflow-x-auto whitespace-nowrap">
              <TabsTrigger value="today">Today</TabsTrigger>
              {doctorTabs.map((doctor) => (
                <TabsTrigger key={doctor.name} value={doctor.name}>
                  Dr. {doctor.name} ({doctor.count})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Card className="mb-6 border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Fast Search
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Input
                  placeholder="Type at least 6 letters/digits to search by name, phone, or UHID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-md"
                />
                {searching && <span className="text-sm text-blue-600">Searching...</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
                {isLoading && !searching && <Skeleton className="h-6 w-32" />}
                <span className="text-xs text-gray-500">
                  Downloaded: <b>{downloadedCount}</b> record{downloadedCount === 1 ? "" : "s"},{" "}
                  <b>{humanFileSize(downloadedBytes)}</b> from database
                </span>
                {searchTerm.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="h-8 gap-1">
                    <X className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {activeFilterTab === "today" ? "Today's Appointments" : `Appointments for Dr. ${activeFilterTab}`}
              </CardTitle>
              <CardDescription>
                {filteredAndSortedAppointments.length
                  ? `${filteredAndSortedAppointments.length} found`
                  : isLoading
                    ? "Loading..."
                    : "No appointments"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && !searching ? ( // Show skeleton only when initial loading or refreshing, not during search
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredAndSortedAppointments.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                  <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-700 mb-1">No appointments found</h3>
                  <p className="text-slate-500">Try adjusting your filters or search criteria</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-[200px]">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setSortConfig({ key: "name", direction: sortConfig.direction === "asc" ? "desc" : "asc" })
                            }
                            className="flex items-center gap-1 p-0 h-auto font-medium"
                          >
                            Patient <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setSortConfig({
                                key: "patientId",
                                direction: sortConfig.direction === "asc" ? "desc" : "asc",
                              })
                            }
                            className="flex items-center gap-1 p-0 h-auto font-medium"
                          >
                            UHID <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedAppointments.map((app) => (
                        <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                          <TableCell className="font-medium">
                            {app.name}
                            <div className="text-xs text-gray-500">{app.phone}</div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 font-mono">{app.patientId}</TableCell>
                          <TableCell>{format(new Date(app.date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={app.appointmentType === "visithospital" ? "default" : "secondary"}>
                              {app.appointmentType === "visithospital" ? "Visit" : "On Call"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ₹{app.payment?.totalPaid ?? app.modalities.reduce((sum, m) => sum + (m.charges || 0), 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <EditButton
                                    uhid={app.patientId}
                                    appointmentId={app.id}
                                    compact
                                    className="h-8 w-8 p-0"
                                  />
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={(e) => handleDeleteAppointment(e, app)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Appointment</TooltipContent>
                              </Tooltip>
                            </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && appointmentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-red-700 flex items-center">
                <Trash2 className="h-6 w-6 mr-2" />
                Confirm Deletion
              </h3>
              <button onClick={() => setShowDeleteModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete the appointment for{" "}
              <span className="font-semibold">{appointmentToDelete.name}</span> (UHID:{" "}
              <span className="font-semibold">{appointmentToDelete.patientId}</span>)?
              <br />
              This action will permanently remove this appointment record.
            </p>
            <div className="mb-4">
              <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700 mb-1">
                Enter Password to Confirm:
              </label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value)
                  setDeleteError("") // Clear error on input change
                }}
                placeholder="Enter password"
                className={deleteError ? "border-red-500" : ""}
              />
              {deleteError && (
                <p className="text-red-500 text-sm mt-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {deleteError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDeleteAppointment} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Appointment"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}
