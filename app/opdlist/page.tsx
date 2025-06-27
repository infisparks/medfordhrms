"use client"

import { useState, useEffect, useCallback } from "react"
import { db } from "@/lib/firebase"
import { eachDayOfInterval } from "date-fns"
import { ref, query, get } from "firebase/database"
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
import { Calendar, RefreshCw, Eye, ArrowUpDown, X, Filter } from "lucide-react"

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
        };
        if (filterFn(appointmentData)) {
          result.push(appointmentData);
        }
      })
    }
  })
  return result
}

export default function ManageOPDPage() {
  const router = useRouter()
  const [tab, setTab] = useState<"today" | "last7days">("today")
  const [appointments, setAppointments] = useState<Appointment[]>([])
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

  // Fetch only today's data by default
  const fetchTodayAppointments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const todayKey = getTodayDateKey()
      const opdRef = ref(db, `patients/opddetail/${todayKey}`)
      const snap = await get(query(opdRef))
      const data = snap.val() as Record<string, any> | null
      const result = flattenAppointments(data, () => true)
      setAppointments(result)
      setDownloadedCount(result.length)
      setDownloadedBytes(byteSize(JSON.stringify(data || {})))
    } catch (err) {
      setError("Failed to load today's appointments")
      setAppointments([])
      setDownloadedCount(0)
      setDownloadedBytes(0)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch last 7 days data
  const fetchLast7DaysAppointments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const today = new Date()
      const sixDaysAgo = new Date()
      sixDaysAgo.setDate(today.getDate() - 6)

      const days = eachDayOfInterval({ start: sixDaysAgo, end: today })

      const fetches = days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd")
        const opdRef = ref(db, `patients/opddetail/${dateKey}`)
        return get(query(opdRef)).then((snap) => ({
          data: snap.val() as Record<string, any> | null,
          dateKey,
        }))
      })

      const snaps = await Promise.all(fetches)

      let allResults: Appointment[] = []
      let totalBytes = 0
      for (const { data } of snaps) {
        if (data) {
          allResults = allResults.concat(flattenAppointments(data, () => true))
          totalBytes += byteSize(JSON.stringify(data))
        }
      }

      setAppointments(allResults)
      setDownloadedCount(allResults.length)
      setDownloadedBytes(totalBytes)
    } catch (err) {
      setError("Failed to load last 7 days' appointments")
      setAppointments([])
      setDownloadedCount(0)
      setDownloadedBytes(0)
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
            (a.patientId || "").toLowerCase().includes(t) // Added search by patientId (UHID)
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
          setAppointments(historicalResults)
        } catch (err) {
          setError("Failed to search historical appointments")
          setAppointments([])
          setDownloadedCount(0)
          setDownloadedBytes(0)
        } finally {
          setSearching(false)
        }
      } else {
        // If search term is too short, revert to tab-based data
        setSearching(false)
        setError(null)
        if (tab === "today") {
          fetchTodayAppointments()
        } else {
          fetchLast7DaysAppointments()
        }
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [searchTerm, tab, fetchTodayAppointments, fetchLast7DaysAppointments, fetchHistoricalAppointments])

  // Initial load or tab change
  useEffect(() => {
    setSearchTerm("") // Clear search term on tab change
    if (tab === "today") fetchTodayAppointments()
    else fetchLast7DaysAppointments()
  }, [tab, fetchTodayAppointments, fetchLast7DaysAppointments])

  // Sorting
  const sortedAppointments = [...appointments].sort((a, b) => {
    const { key, direction } = sortConfig
    if (key === "date") {
      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      return direction === "asc" ? da - db : db - da
    }
    // Handle sorting for patientId, name, phone
    if (key === "name" || key === "phone" || key === "patientId") {
      const va = (a as any)[key] || "";
      const vb = (b as any)[key] || "";
      return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return 0
  })

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50">
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
                  <Button
                    variant="default"
                    onClick={() => (tab === "today" ? fetchTodayAppointments() : fetchLast7DaysAppointments())}
                    disabled={isLoading}
                  >
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
          <Tabs value={tab} onValueChange={(v) => setTab(v as "today" | "last7days")} className="w-full mb-4">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="last7days">Last 7 Days</TabsTrigger>
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
                {tab === "today" ? "Today's Appointments" : "Last 7 Days' Appointments"}
              </CardTitle>
              <CardDescription>
                {appointments.length ? `${appointments.length} found` : isLoading ? "Loading..." : "No appointments"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
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
                              setSortConfig({ key: "patientId", direction: sortConfig.direction === "asc" ? "desc" : "asc" })
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
                      {sortedAppointments.map((app) => (
                        <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                          <TableCell className="font-medium">
                            {app.name}
                            <div className="text-xs text-gray-500">{app.phone}</div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 font-mono">
                            {app.patientId}
                          </TableCell>
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
    </TooltipProvider>
  )
}