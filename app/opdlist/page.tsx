"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/firebase"
import { format } from "date-fns"
import { ref, get, remove, onChildAdded, onChildChanged, onChildRemoved, off, query, orderByChild, equalTo, startAt, endAt } from "firebase/database"
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

  // Function to clear all listeners
  const clearAllListeners = () => {
    if (uhidListenerRef.current && uhidListenerPath.current) {
      off(ref(db, uhidListenerPath.current), "child_added", uhidListenerRef.current.added)
      off(ref(db, uhidListenerPath.current), "child_changed", uhidListenerRef.current.changed)
      off(ref(db, uhidListenerPath.current), "child_removed", uhidListenerRef.current.removed)
    }
    uhidListenerRef.current = null
    uhidListenerPath.current = ""

    phoneListenerRefs.current.forEach(({ path, added, changed, removed }) => {
      off(ref(db, path), "child_added", added)
      off(ref(db, path), "child_changed", changed)
      off(ref(db, path), "child_removed", removed)
    })
    phoneListenerRefs.current = []
  }

  // Clear listeners on unmount
  useEffect(() => {
    return () => {
      clearAllListeners()
    }
  }, [])

  // ============ Default Today List =============
  // This effect will run on initial load and when the activeFilterTab is "today"
  useEffect(() => {
    // Only fetch today's data if no search is active
    if (!uhidSearch && !phoneSearch && activeFilterTab === "today") {
      setIsLoading(true)
      clearAllListeners() // Clear any existing search listeners

      const todayKey = getTodayDateKey()
      const opdRef = ref(db, `patients/opddetail/${todayKey}`)

      const addedListener = onChildAdded(opdRef, (uhidSnap) => {
        uhidSnap.forEach((apptSnap: any) => {
          const newAppt = flattenAppointment(uhidSnap.key!, apptSnap.key!, apptSnap.val())
          setAppointments((prev) => {
            if (!prev.some(a => a.id === newAppt.id && a.patientId === newAppt.patientId)) {
              const updated = [...prev, newAppt];
              setDoctorTabs(collectDoctorTabs(updated));
              setDownloadedCount(updated.length);
              setDownloadedBytes(prevBytes => prevBytes + byteSize(JSON.stringify(apptSnap.val())));
              return updated;
            }
            return prev;
          });
        });
      });

      const changedListener = onChildChanged(opdRef, (uhidSnap) => {
        uhidSnap.forEach((apptSnap: any) => {
          const updatedAppt = flattenAppointment(uhidSnap.key!, apptSnap.key!, apptSnap.val());
          setAppointments((prev) => {
            const updated = prev.map(a =>
              (a.id === updatedAppt.id && a.patientId === updatedAppt.patientId) ? updatedAppt : a
            );
            setDoctorTabs(collectDoctorTabs(updated));
            return updated;
          });
        });
      });

      const removedListener = onChildRemoved(opdRef, (uhidSnap) => {
        uhidSnap.forEach((apptSnap: any) => {
          setAppointments((prev) => {
            const updated = prev.filter(a => !(a.id === apptSnap.key && a.patientId === uhidSnap.key));
            setDoctorTabs(collectDoctorTabs(updated));
            setDownloadedCount(updated.length);
            setDownloadedBytes(prevBytes => prevBytes - byteSize(JSON.stringify(apptSnap.val()))); // Approximate
            return updated;
          });
        });
      });

      // Initially fetch all data once to set the initial state
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

      uhidListenerRef.current = { added: addedListener, changed: changedListener, removed: removedListener };
      uhidListenerPath.current = `patients/opddetail/${todayKey}`;
    }
  }, [activeFilterTab, uhidSearch, phoneSearch]) // Re-run if filter changes, or searches are cleared

  // ============ UHID Search Logic =============
  useEffect(() => {
    clearAllListeners() // Clear other listeners when a new search starts
    setAppointments([]) // Clear previous appointments

    if (!uhidSearch) {
      setUhidSearchLoading(false)
      return
    }

    setUhidSearchLoading(true)

    if (uhidSearch.length >= 10) { // Assuming 10 digits for a full UHID
      // Full UHID search across all data
      const patientInfoRef = query(ref(db, `patients/patientinfo`), orderByChild('uhid'), equalTo(uhidSearch));

      get(patientInfoRef)
        .then(async (snapshot) => {
          const result: Appointment[] = [];
          let totalBytes = 0;
          if (snapshot.exists()) {
            const patientData = snapshot.val();
            const patientId = Object.keys(patientData)[0]; // Assuming UHID is unique and corresponds to patientId

            // Now fetch appointments for this patientId across all dates
            const opdDetailRef = ref(db, `patients/opddetail`);
            const opdSnapshot = await get(opdDetailRef);

            if (opdSnapshot.exists()) {
              opdSnapshot.forEach((dateSnap: any) => {
                const dateData = dateSnap.val();
                if (dateData[patientId]) {
                  Object.entries(dateData[patientId]).forEach(([apptId, apptData]: any) => {
                    result.push(flattenAppointment(patientId, apptId, apptData));
                    totalBytes += byteSize(JSON.stringify(apptData));
                  });
                }
              });
            }
          }
          setAppointments(result);
          setDoctorTabs([]); // Clear doctor tabs for search results
          setDownloadedCount(result.length);
          setDownloadedBytes(totalBytes);
          setUhidSearchLoading(false);
        })
        .catch((error) => {
          console.error("Error fetching UHID search:", error);
          setUhidSearchLoading(false);
          toast.error("Failed to search by UHID.", { position: "top-right", autoClose: 5000 });
        });

    } else { // Partial UHID search (less than 10 chars) - limited to today's data
      const todayKey = getTodayDateKey()
      const opdPath = `patients/opddetail/${todayKey}`
      const opdRef = ref(db, opdPath)

      get(opdRef).then((snap) => {
        const data = snap.val()
        const result: Appointment[] = []
        let totalBytes = 0
        if (data) {
          Object.entries(data).forEach(([uhid, appts]: any) => {
            if (uhid.toLowerCase().startsWith(uhidSearch.toLowerCase())) {
              Object.entries(appts || {}).forEach(([apptId, apptData]: any) => {
                result.push(flattenAppointment(uhid, apptId, apptData))
                totalBytes += byteSize(JSON.stringify(apptData))
              })
            }
          })
        }
        setAppointments(result)
        setDoctorTabs([])
        setDownloadedCount(result.length)
        setDownloadedBytes(totalBytes)
        setUhidSearchLoading(false)

        // Set up real-time listeners for partial UHID search on today's data
        Object.keys(data || {}).forEach((uhid) => {
          if (uhid.toLowerCase().startsWith(uhidSearch.toLowerCase())) {
            const path = `patients/opddetail/${todayKey}/${uhid}`

            const added = (snap: any) => {
              setAppointments((prev: Appointment[]) => {
                const found = prev.find(a => a.id === snap.key && a.patientId === uhid)
                if (found) return prev
                const val = snap.val()
                if (!val) return prev
                return [...prev, flattenAppointment(uhid, snap.key, val)]
              })
            }
            const changed = (snap: any) => {
              setAppointments((prev: Appointment[]) =>
                prev.map(a => (a.id === snap.key && a.patientId === uhid)
                  ? flattenAppointment(uhid, snap.key, snap.val())
                  : a
                )
              )
            }
            const removed = (snap: any) => {
              setAppointments((prev: Appointment[]) => prev.filter(a => !(a.id === snap.key && a.patientId === uhid)))
            }

            onChildAdded(ref(db, path), added)
            onChildChanged(ref(db, path), changed)
            onChildRemoved(ref(db, path), removed)
            uhidListenerRef.current = { added, changed, removed }
            uhidListenerPath.current = path
          }
        })
      }).catch((error) => {
        console.error("Error fetching partial UHID search:", error);
        setUhidSearchLoading(false);
        toast.error("Failed to search by UHID.", { position: "top-right", autoClose: 5000 });
      })
    }
  }, [uhidSearch])

  // ============ Phone Search Logic =============
  useEffect(() => {
    clearAllListeners() // Clear other listeners when a new search starts
    setAppointments([]) // Clear previous appointments

    if (!phoneSearch) {
      setPhoneSearchLoading(false);
      return;
    }

    setPhoneSearchLoading(true);

    if (phoneSearch.length === 10) { // Full 10-digit phone number search
      const opdRef = ref(db, `patients/opddetail`);

      get(opdRef).then((dateSnapshots) => {
        const result: Appointment[] = [];
        let totalBytes = 0;

        const promises: Promise<void>[] = [];

        dateSnapshots.forEach((dateSnap) => {
          const dateKey = dateSnap.key;
          const patientsForDate = dateSnap.val();

          if (patientsForDate) {
            Object.entries(patientsForDate).forEach(([patientId, appointmentsForPatient]: any) => {
              Object.entries(appointmentsForPatient || {}).forEach(([apptId, apptData]: any) => {
                if (apptData.phone === phoneSearch) {
                  result.push(flattenAppointment(patientId, apptId, apptData));
                  totalBytes += byteSize(JSON.stringify(apptData));
                }
              });
            });
          }
        });

        // Set up real-time listeners for *all* appointments that match the phone number
        // This is tricky as we need to listen on each date and patientId path.
        // A more scalable solution for full phone search with real-time updates might involve
        // a Cloud Function to denormalize data or a separate index.
        // For now, we'll set up listeners for the found appointments.

        result.forEach((appt) => {
          const path = `patients/opddetail/${format(new Date(appt.date), "yyyy-MM-dd")}/${appt.patientId}`;
          const added = (snap: any) => {
            setAppointments((prev: Appointment[]) => {
              const found = prev.find(a => a.id === snap.key && a.patientId === appt.patientId);
              if (found) return prev;
              const val = snap.val();
              if (!val) return prev;
              if (val.phone === phoneSearch) { // Ensure new child also matches phone
                return [...prev, flattenAppointment(appt.patientId, snap.key, val)];
              }
              return prev;
            });
          };
          const changed = (snap: any) => {
            setAppointments((prev: Appointment[]) =>
              prev.map(a => (a.id === snap.key && a.patientId === appt.patientId)
                ? flattenAppointment(appt.patientId, snap.key, snap.val())
                : a
              )
            );
          };
          const removed = (snap: any) => {
            setAppointments((prev: Appointment[]) => prev.filter(a => !(a.id === snap.key && a.patientId === appt.patientId)));
          };
          onChildAdded(ref(db, path), added);
          onChildChanged(ref(db, path), changed);
          onChildRemoved(ref(db, path), removed);
          phoneListenerRefs.current.push({ path, added, changed, removed });
        });

        setAppointments(result);
        setDoctorTabs([]);
        setDownloadedCount(result.length);
        setDownloadedBytes(totalBytes);
        setPhoneSearchLoading(false);

      }).catch((error) => {
        console.error("Error fetching phone search:", error);
        setPhoneSearchLoading(false);
        toast.error("Failed to search by phone number.", { position: "top-right", autoClose: 5000 });
      });

    } else { // Partial phone search (less than 10 digits) - limited to today's data
      const todayKey = getTodayDateKey()
      const opdPath = `patients/opddetail/${todayKey}`
      const opdRef = ref(db, opdPath)

      get(opdRef).then((snap) => {
        const data = snap.val()
        const result: Appointment[] = []
        let totalBytes = 0
        if (data) {
          Object.entries(data).forEach(([uhid, appts]: any) => {
            Object.entries(appts || {}).forEach(([apptId, apptData]: any) => {
              if (apptData.phone && apptData.phone.startsWith(phoneSearch)) {
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

        // Set up real-time listeners for partial phone search on today's data
        result.forEach((appt) => {
          const path = `patients/opddetail/${todayKey}/${appt.patientId}`
          const added = (snap: any) => {
            setAppointments((prev: Appointment[]) => {
              const found = prev.find(a => a.id === snap.key && a.patientId === appt.patientId)
              if (found) return prev
              const val = snap.val()
              if (!val) return prev
              if (val.phone && val.phone.startsWith(phoneSearch)) {
                return [...prev, flattenAppointment(appt.patientId, snap.key, val)]
              }
              return prev
            })
          }
          const changed = (snap: any) => {
            setAppointments((prev: Appointment[]) =>
              prev.map(a => (a.id === snap.key && a.patientId === appt.patientId)
                ? flattenAppointment(appt.patientId, snap.key, snap.val())
                : a
              )
            )
          }
          const removed = (snap: any) => {
            setAppointments((prev: Appointment[]) => prev.filter(a => !(a.id === snap.key && a.patientId === appt.patientId)))
          }
          onChildAdded(ref(db, path), added)
          onChildChanged(ref(db, path), changed)
          onChildRemoved(ref(db, path), removed)
          phoneListenerRefs.current.push({ path, added, changed, removed })
        })
      }).catch((error) => {
        console.error("Error fetching partial phone search:", error);
        setPhoneSearchLoading(false);
        toast.error("Failed to search by phone number.", { position: "top-right", autoClose: 5000 });
      })
    }
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
                      placeholder="Search by UHID (enter 10+ for full search)"
                      value={uhidSearch}
                      onChange={(e) => {
                        setUhidSearch(e.target.value)
                        setPhoneSearch("") // Clear phone search when UHID search is active
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
                  <span className="text-xs text-gray-500">
                    Enter fewer than 10 characters for today's appointments, 10 or more for full search
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by Phone (10 digits)"
                      value={phoneSearch}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "")
                        setPhoneSearch(val.slice(0, 10))
                        setUhidSearch("") // Clear UHID search when phone search is active
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
                  <span className="text-xs text-gray-500">
                    Type 10-digit number to search all appointments, fewer for today's appointments
                  </span>
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