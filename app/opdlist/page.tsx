"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/firebase"
import { format } from "date-fns"
import { ref, get, remove, onChildAdded, onChildChanged, onChildRemoved, off } from "firebase/database"
import { useRouter } from "next/navigation"
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
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

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
  doctor?: string
  appointmentType: string
  modalities: any[]
  createdAt: string
  payment?: {
    totalCharges: number
    totalPaid: number
    discount: number
    paymentMethod: string
  }
}

const DOCTOR_MODALITY_TYPES = ["consultation", "radiology", "cardiology"]
const getTodayDateKey = () => format(new Date(), "yyyy-MM-dd")

function flattenAppointment(patientId: string, apptId: string, data: any): Appointment {
  return {
    id: apptId,
    patientId,
    name: data.name || "",
    phone: data.phone || "",
    date: data.date || "",
    time: data.time || "",
    doctor: data.doctor || "",
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
}

function collectDoctorTabs(appointments: Appointment[]) {
  const docTabMap = new Map<string, { name: string; count: number }>()
  appointments.forEach(app => {
    if (app.appointmentType === "visithospital" && Array.isArray(app.modalities)) {
      const uniqueDoctors = new Set<string>()
      app.modalities.forEach((modality: any) => {
        if (DOCTOR_MODALITY_TYPES.includes(modality.type) && modality.doctor) {
          uniqueDoctors.add(modality.doctor)
        }
      })
      uniqueDoctors.forEach(docName => {
        docTabMap.set(docName, { name: docName, count: (docTabMap.get(docName)?.count || 0) + 1 })
      })
    }
  })
  return Array.from(docTabMap.values()).sort((a, b) => b.count - a.count)
}

export default function ManageOPDPage() {
  const router = useRouter()
  const [activeFilterTab, setActiveFilterTab] = useState<string>("today")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [doctorTabs, setDoctorTabs] = useState<{ name: string; count: number }[]>([])
  const [downloadedCount, setDownloadedCount] = useState(0)
  const [downloadedBytes, setDownloadedBytes] = useState(0)

  // UHID Search
  const [uhidSearch, setUhidSearch] = useState("")
  const [uhidSearchLoading, setUhidSearchLoading] = useState(false)
  const uhidListenerRef = useRef<any>(null)
  const uhidListenerPath = useRef<string>("")

  // Phone Search
  const [phoneSearch, setPhoneSearch] = useState("")
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false)
  const phoneListenerRefs = useRef<any[]>([])

  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Clear listeners on unmount
  useEffect(() => {
    return () => {
      if (uhidListenerRef.current && uhidListenerPath.current)
        off(ref(db, uhidListenerPath.current), "child_added", uhidListenerRef.current)
      phoneListenerRefs.current.forEach(({ path, fn }) => off(ref(db, path), "child_added", fn))
    }
  }, [])

  // ============ Default Today List =============
  useEffect(() => {
    setIsLoading(true)
    const todayKey = getTodayDateKey()
    const opdRef = ref(db, `patients/opddetail/${todayKey}`)
    get(opdRef).then((snap) => {
      const data = snap.val()
      const result: Appointment[] = []
      let totalBytes = 0
      if (data) {
        Object.entries(data).forEach(([uhid, appts]: any) => {
          Object.entries(appts || {}).forEach(([apptId, apptData]: any) => {
            result.push(flattenAppointment(uhid, apptId, apptData))
          })
        })
        totalBytes = byteSize(JSON.stringify(data))
      }
      setAppointments(result)
      setDoctorTabs(collectDoctorTabs(result))
      setDownloadedCount(result.length)
      setDownloadedBytes(totalBytes)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [])

  // ============ UHID Search - Real-Time, Only That User =============
  useEffect(() => {
    if (uhidListenerRef.current && uhidListenerPath.current)
      off(ref(db, uhidListenerPath.current), "child_added", uhidListenerRef.current)
    uhidListenerRef.current = null

    if (!uhidSearch || uhidSearch.length < 8) return

    setUhidSearchLoading(true)
    const todayKey = getTodayDateKey()
    const opdPath = `patients/opddetail/${todayKey}`

    get(ref(db, opdPath)).then((snap) => {
      const data = snap.val()
      const result: Appointment[] = []
      let totalBytes = 0
      if (data) {
        Object.entries(data).forEach(([uhid, appts]: any) => {
          if (uhid.toLowerCase().startsWith(uhidSearch.toLowerCase())) {
            Object.entries(appts || {}).forEach(([apptId, apptData]: any) => {
              result.push(flattenAppointment(uhid, apptId, apptData))
            })
            totalBytes += byteSize(JSON.stringify(appts))
          }
        })
      }
      setAppointments(result)
      setDoctorTabs([])
      setDownloadedCount(result.length)
      setDownloadedBytes(totalBytes)
      setUhidSearchLoading(false)

      Object.keys(data || {}).forEach((uhid) => {
        if (uhid.toLowerCase().startsWith(uhidSearch.toLowerCase())) {
          const path = `patients/opddetail/${todayKey}/${uhid}`
          const fn = (snap: any) => {
            setAppointments((prev: Appointment[]) => {
              const found = prev.find(a => a.id === snap.key && a.patientId === uhid)
              if (found) return prev
              const val = snap.val()
              if (!val) return prev
              return [...prev, flattenAppointment(uhid, snap.key, val)]
            })
          }
          onChildAdded(ref(db, path), fn)
          onChildChanged(ref(db, path), (snap: any) => {
            setAppointments((prev: Appointment[]) =>
              prev.map(a => (a.id === snap.key && a.patientId === uhid)
                ? flattenAppointment(uhid, snap.key, snap.val())
                : a
              )
            )
          })
          onChildRemoved(ref(db, path), (snap: any) => {
            setAppointments((prev: Appointment[]) => prev.filter(a => !(a.id === snap.key && a.patientId === uhid)))
          })
          uhidListenerRef.current = fn
          uhidListenerPath.current = path
        }
      })
    })
  }, [uhidSearch])

  // ============ Phone Search - Real-Time, Only Matching Phones =============
  useEffect(() => {
    phoneListenerRefs.current.forEach(({ path, fn }) => off(ref(db, path), "child_added", fn))
    phoneListenerRefs.current = []

    if (!phoneSearch || phoneSearch.length !== 10) return

    setPhoneSearchLoading(true)
    const todayKey = getTodayDateKey()
    const opdPath = `patients/opddetail/${todayKey}`

    get(ref(db, opdPath)).then((snap) => {
      const data = snap.val()
      const result: Appointment[] = []
      let totalBytes = 0
      if (data) {
        Object.entries(data).forEach(([uhid, appts]: any) => {
          Object.entries(appts || {}).forEach(([apptId, apptData]: any) => {
            if (apptData.phone === phoneSearch) {
              result.push(flattenAppointment(uhid, apptId, apptData))
              totalBytes += byteSize(JSON.stringify(apptData))
            }
          })
        })
      }
      setAppointments(result)
      setDoctorTabs([])
      setDownloadedCount(result.length)
      setDownloadedBytes(totalBytes)
      setPhoneSearchLoading(false)

      result.forEach((appt) => {
        const path = `patients/opddetail/${todayKey}/${appt.patientId}`
        const fn = (snap: any) => {
          setAppointments((prev: Appointment[]) => {
            const found = prev.find(a => a.id === snap.key && a.patientId === appt.patientId)
            if (found) return prev
            const val = snap.val()
            if (!val) return prev
            if (val.phone === phoneSearch) {
              return [...prev, flattenAppointment(appt.patientId, snap.key, val)]
            }
            return prev
          })
        }
        onChildAdded(ref(db, path), fn)
        phoneListenerRefs.current.push({ path, fn })
        onChildChanged(ref(db, path), (snap: any) => {
          setAppointments((prev: Appointment[]) =>
            prev.map(a => (a.id === snap.key && a.patientId === appt.patientId)
              ? flattenAppointment(appt.patientId, snap.key, snap.val())
              : a
            )
          )
        })
        onChildRemoved(ref(db, path), (snap: any) => {
          setAppointments((prev: Appointment[]) => prev.filter(a => !(a.id === snap.key && a.patientId === appt.patientId)))
        })
      })
    })
  }, [phoneSearch])

  // ============ Filtered Appointments for Doctor Tabs ============
  const filteredAndSortedAppointments = [...appointments]
    .filter((app) => {
      if (activeFilterTab !== "today") {
        return app.modalities.some(
          (modality: any) =>
            DOCTOR_MODALITY_TYPES.includes(modality.type) &&
            modality.doctor === activeFilterTab
        )
      }
      return true
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // ==== DELETE LOGIC ====
  const handleDeleteAppointment = (appt: Appointment) => {
    setAppointmentToDelete(appt)
    setDeletePassword("")
    setDeleteError("")
    setShowDeleteModal(true)
  }

  const confirmDeleteAppointment = async () => {
    if (deletePassword !== "medford@788") {
      setDeleteError("Incorrect password.")
      return
    }
    if (!appointmentToDelete) {
      setDeleteError("No appointment selected for deletion.")
      return
    }
    setDeleting(true)
    try {
      const { patientId, id: appointmentId, date, appointmentType } = appointmentToDelete
      const dateKey = format(new Date(date), "yyyy-MM-dd")
      await remove(ref(db, `patients/opddetail/${dateKey}/${patientId}/${appointmentId}`))
      if (appointmentType === "oncall") {
        await remove(ref(db, `oncall-appointments/${appointmentId}`))
      }
      toast.success("Appointment cancelled and records deleted successfully!", { position: "top-right", autoClose: 4000 })
      setShowDeleteModal(false)
      setAppointmentToDelete(null)
      setDeletePassword("")
      setDeleteError("")
      // Optionally refresh today list
      setAppointments((prev: Appointment[]) => prev.filter(a => !(a.patientId === patientId && a.id === appointmentId)))
    } catch (error) {
      toast.error("Failed to cancel appointment.", { position: "top-right", autoClose: 5000 })
      setDeleteError("An error occurred during cancellation.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50">
        <ToastContainer />
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
                  <Button variant="default" onClick={() => window.location.reload()} disabled={isLoading}>
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
            <TabsList className="bg-slate-100 flex flex-wrap gap-2">
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
                Fast Search (by UHID or Phone)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-wrap gap-4 items-center mb-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by UHID (type at least 8 chars)"
                      value={uhidSearch}
                      onChange={(e) => {
                        setUhidSearch(e.target.value)
                        setPhoneSearch("")
                      }}
                      className="max-w-xs"
                    />
                    {uhidSearchLoading && <span className="text-sm text-blue-600">Searching...</span>}
                    {uhidSearch && (
                      <Button variant="ghost" size="sm" onClick={() => setUhidSearch("")} className="h-8 gap-1">
                        <X className="h-3 w-3" /> Clear
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">Enter at least 8 characters for partial search, or full UHID</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by Phone (10 digits)"
                      value={phoneSearch}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "")
                        setPhoneSearch(val.slice(0, 10))
                        setUhidSearch("")
                      }}
                      className="max-w-xs"
                    />
                    {phoneSearchLoading && <span className="text-sm text-blue-600">Searching...</span>}
                    {phoneSearch && (
                      <Button variant="ghost" size="sm" onClick={() => setPhoneSearch("")} className="h-8 gap-1">
                        <X className="h-3 w-3" /> Clear
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">Type 10-digit number to search appointments</span>
                </div>
                <span className="text-xs text-gray-500">
                  Downloaded: <b>{downloadedCount}</b> record{downloadedCount === 1 ? "" : "s"},{" "}
                  <b>{humanFileSize(downloadedBytes)}</b> from database
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {activeFilterTab === "today"
                  ? "Today's Appointments"
                  : `Appointments for Dr. ${activeFilterTab}`}
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
              {isLoading ? (
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
                            className="flex items-center gap-1 p-0 h-auto font-medium"
                          >
                            Patient <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
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
                            ₹{app.payment?.totalPaid ?? app.modalities.reduce((sum: number, m: any) => sum + (m.charges || 0), 0)}
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
                                    onClick={() => handleDeleteAppointment(app)}
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

        {/* =========== Delete Modal =========== */}
        {showDeleteModal && appointmentToDelete && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
                    setDeleteError("")
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
                <Button variant="destructive" onClick={confirmDeleteAppointment} disabled={deleting}>
                  {deleting ? (
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

      </div>
    </TooltipProvider>
  )
}
