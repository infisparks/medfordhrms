"use client"

import type React from "react"
import { useEffect, useState, useCallback, useMemo } from "react"
// Use 'update' for atomic multi-path writes
import { ref, onChildAdded, onChildChanged, onChildRemoved, get, update } from "firebase/database"
import { db } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import {
  Search,
  Edit,
  Users,
  CreditCard,
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard,
  Stethoscope,
  Trash2,
  AlertCircle,
  Calendar as CalendarIcon,
  RefreshCw, // Icon for reload button
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format, parseISO, isValid, subWeeks, addDays } from "date-fns"
import { ToastContainer, toast } from "react-toastify"

import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

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
  date: string
}

export interface BillingRecord {
  patientId: string
  ipdId: string
  name: string
  uhid?: string
  mobileNumber: string
  address?: string
  age?: string | number
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string // ISO string
  admissionDate?: string // ISO string
  amount: number // totalDeposit or advanceDeposit
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  createdAt?: string // ISO string
  billNumber?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function OptimizedPatientsPage() {
  const [activeIpdRecords, setActiveIpdRecords] = useState<BillingRecord[]>([])
  // RENAMED for clarity: this holds all detailed records fetched by admission date, not just discharged ones.
  const [detailedRecords, setDetailedRecords] = useState<BillingRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  // RENAMED for clarity
  const [detailedDataSize, setDetailedDataSize] = useState<number>(0)
  const [hasLoadedDetails, setHasLoadedDetails] = useState<boolean>(false)
  const router = useRouter()

  // Date Filter States
  const [selectedAdmissionDate, setSelectedAdmissionDate] = useState<Date | null>(null)

  // State for cancellation modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelPassword, setCancelPassword] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [recordToCancel, setRecordToCancel] = useState<BillingRecord | null>(null)

  // Add state for search input, search results, and search loading
  const [archiveSearchInput, setArchiveSearchInput] = useState("")
  const [archiveSearchResults, setArchiveSearchResults] = useState<BillingRecord[]>([])
  const [archiveSearchLoading, setArchiveSearchLoading] = useState(false)
  const [archiveSearchError, setArchiveSearchError] = useState("")

  // Helper to format ISO date strings to yyyy-MM-dd
  function getFirebaseDateKey(date?: string | Date | null): string {
    if (!date) return ""
    const d = typeof date === "string" ? parseISO(date) : date
    if (!isValid(d)) return ""
    return format(d, "yyyy-MM-dd")
  }

  // Combine IPD info and billing info into a single record
  const combineRecordData = useCallback(
    (patientId: string, ipdId: string, ipdData: any, billingData: any): BillingRecord => {
      const servicesArray: ServiceItem[] = []
      if (Array.isArray(ipdData.services)) {
        ipdData.services.forEach((svc: any) => {
          servicesArray.push({
            serviceName: svc.serviceName || "",
            doctorName: svc.doctorName || "",
            type: svc.type || "service",
            amount: Number(svc.amount) || 0,
            createdAt: svc.createdAt || "",
          })
        })
      }
      const paymentsArray: Payment[] = []
      if (billingData?.payments) {
        Object.keys(billingData.payments).forEach((payId) => {
          const pay = billingData.payments[payId]
          paymentsArray.push({
            id: payId,
            amount: Number(pay.amount) || 0,
            paymentType: pay.paymentType || "cash",
            date: pay.date || new Date().toISOString(),
          })
        })
      }
      return {
        patientId,
        ipdId,
        name: ipdData.name || "Unknown",
        uhid: ipdData.uhid || "",
        mobileNumber: ipdData.phone || "",
        address: ipdData.address || "",
        age: ipdData.age || "",
        gender: ipdData.gender || "",
        relativeName: ipdData.relativeName || "",
        relativePhone: ipdData.relativePhone || "",
        relativeAddress: ipdData.relativeAddress || "",
        dischargeDate: ipdData.dischargeDate || "",
        admissionDate: ipdData.admitDate || "",
        amount: billingData?.totalDeposit ? Number(billingData.totalDeposit) : 0,
        roomType: ipdData.ward || "",
        bed: ipdData.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        discount: ipdData.discount ? Number(ipdData.discount) : 0,
        createdAt: ipdData.createdAt || "",
        billNumber: billingData?.billNumber || ipdData?.billNumber || "",
      }
    },
    [],
  )

  // Active (non-discharge) patients listener
  useEffect(() => {
    const ipdActiveRef = ref(db, "patients/ipdactive")
    setActiveIpdRecords([])
    if (!selectedAdmissionDate && selectedTab === "non-discharge") {
      setIsLoading(true)
    }

    const handleAdd = onChildAdded(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) => {
        if (prev.some((r) => r.ipdId === data.ipdId)) return prev
        return [
          ...prev,
          {
            patientId: data.patientId,
            ipdId: data.ipdId,
            uhid: data.uhid,
            name: data.name || "",
            mobileNumber: data.phone || "",
            roomType: data.ward || "",
            bed: data.bed || "",
            amount: data.advanceDeposit || 0,
            admissionDate: data.admitDate || "",
            dischargeDate: "",
            services: [],
            payments: [],
          },
        ]
      })
      if (!selectedAdmissionDate && selectedTab === "non-discharge") {
        setIsLoading(false)
      }
    })
    const handleChange = onChildChanged(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) =>
        prev.map((r) =>
          r.ipdId === data.ipdId
            ? {
                ...r,
                name: data.name || "",
                mobileNumber: data.phone || "",
                roomType: data.ward || "",
                bed: data.bed || "",
                amount: data.advanceDeposit || 0,
                admissionDate: data.admitDate || "",
              }
            : r,
        ),
      )
    })
    const handleRemove = onChildRemoved(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) => prev.filter((r) => r.ipdId !== data.ipdId))
    })
    return () => {
      handleAdd()
      handleChange()
      handleRemove()
    }
  }, [selectedAdmissionDate, selectedTab])

  // Load IPD Details by ADMISSION DATE
  const loadIpdDetailsByAdmissionDate = useCallback(async () => {
    setIsLoading(true)
    setDetailedRecords([])
    setDetailedDataSize(0)

    if (!selectedAdmissionDate) {
      setIsLoading(false)
      return
    }

    const queryDateKey = getFirebaseDateKey(selectedAdmissionDate)

    try {
      let totalBytesFetched = 0
      const fetchedRawIpdData: { patientId: string; ipdId: string; ipdData: any; dateKey: string }[] = []
      const admittedRef = ref(db, `patients/ipddetail/userinfoipd/${queryDateKey}`)
      const snap = await get(admittedRef)
      if (snap.exists()) {
        const dateData = snap.val()
        totalBytesFetched += JSON.stringify(dateData).length
        Object.keys(dateData).forEach((patientId) => {
          Object.keys(dateData[patientId]).forEach((ipdId) => {
            fetchedRawIpdData.push({
              patientId,
              ipdId,
              ipdData: dateData[patientId][ipdId],
              dateKey: queryDateKey,
            })
          })
        })
      }

      const billingPromises: Promise<any>[] = []
      const billingMap = new Map<string, any>()

      for (const entry of fetchedRawIpdData) {
        const billingRef = ref(
          db,
          `patients/ipddetail/userbillinginfoipd/${entry.dateKey}/${entry.patientId}/${entry.ipdId}`,
        )
        billingPromises.push(
          get(billingRef).then((snap) => {
            const billingVal = snap.exists() ? snap.val() : {}
            totalBytesFetched += JSON.stringify(billingVal).length
            billingMap.set(entry.ipdId, billingVal)
          }),
        )
      }
      await Promise.all(billingPromises)

      const combinedFetchedRecords: BillingRecord[] = fetchedRawIpdData.map((entry) =>
        combineRecordData(entry.patientId, entry.ipdId, entry.ipdData, billingMap.get(entry.ipdId) || {}),
      )

      setDetailedRecords(combinedFetchedRecords)
      setDetailedDataSize(totalBytesFetched)
      setHasLoadedDetails(true)
    } catch (err) {
      setDetailedDataSize(0)
      setDetailedRecords([])
      console.error("Error loading IPD details:", err)
      toast.error("Failed to load IPD patient details.")
    } finally {
      setIsLoading(false)
    }
  }, [combineRecordData, selectedAdmissionDate])

  // Effect to trigger loading of IPD details
  useEffect(() => {
    if (selectedTab === "discharge" && (selectedAdmissionDate || searchTerm)) {
      loadIpdDetailsByAdmissionDate()
    } else {
      if (detailedRecords.length > 0 || hasLoadedDetails) {
        setDetailedRecords([])
        setDetailedDataSize(0)
        setHasLoadedDetails(false)
      }
    }
  }, [selectedTab, selectedAdmissionDate, searchTerm, loadIpdDetailsByAdmissionDate, detailedRecords.length, hasLoadedDetails])

  // Main filtering logic (client-side)
  useEffect(() => {
    let recordsToFilter: BillingRecord[] = []

    if (selectedAdmissionDate) {
      recordsToFilter = [...detailedRecords]
      const admitDateKey = getFirebaseDateKey(selectedAdmissionDate)
      const relevantActive = activeIpdRecords.filter((rec) => getFirebaseDateKey(rec.admissionDate) === admitDateKey)
      // Combine and remove duplicates by ipdId
      const combined = [...recordsToFilter, ...relevantActive]
      const uniqueRecords = Array.from(new Map(combined.map(item => [item.ipdId, item])).values())
      recordsToFilter = uniqueRecords
    } else {
      if (selectedTab === "non-discharge") {
        recordsToFilter = activeIpdRecords
      } else {
        recordsToFilter = detailedRecords.filter((record) => record.dischargeDate)
      }
    }

    const term = searchTerm.trim().toLowerCase()
    if (term) {
      recordsToFilter = recordsToFilter.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term) ||
          (rec.uhid && rec.uhid.toLowerCase().includes(term)),
      )
    }

    if (selectedWard !== "All") {
      recordsToFilter = recordsToFilter.filter(
        (rec: BillingRecord) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase(),
      )
    }

    setFilteredRecords(recordsToFilter)
  }, [selectedTab, searchTerm, selectedWard, activeIpdRecords, detailedRecords, selectedAdmissionDate])

  // Event handlers
  const handleRowClick = (record: BillingRecord) => {
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }
  const handleEditRecord = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }
  const handleManagePatient = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/manage/${record.patientId}/${record.ipdId}`)
  }
  const handleDrugChart = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/drugchart/${record.patientId}/${record.ipdId}`)
  }
  const handleOTForm = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/ot/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }
  const handleCancelAppointment = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    setRecordToCancel(record)
    setCancelPassword("")
    setCancelError("")
    setShowCancelModal(true)
  }

  // UPDATED to be an atomic operation
  const confirmCancelAppointment = async () => {
    if (cancelPassword !== "medford@788") { // IMPORTANT: Use environment variables for passwords
      setCancelError("Incorrect password.")
      return
    }
    if (!recordToCancel) {
      setCancelError("No record selected for cancellation.")
      return
    }

    setIsLoading(true)
    try {
      const { patientId, ipdId, admissionDate, createdAt } = recordToCancel
      const dateKey = getFirebaseDateKey(admissionDate || createdAt)

      // Create a map of all paths to delete
      const updates: { [key: string]: null } = {}
      updates[`/patients/ipdactive/${ipdId}`] = null
      updates[`/patients/ipddetail/userinfoipd/${dateKey}/${patientId}/${ipdId}`] = null
      updates[`/patients/ipddetail/userbillinginfoipd/${dateKey}/${patientId}/${ipdId}`] = null

      // Perform a single, atomic multi-path update
      await update(ref(db), updates)

      toast.success("IPD Appointment cancelled and records deleted successfully!")
      setShowCancelModal(false)
      setRecordToCancel(null)
    } catch (error) {
      console.error("Error cancelling IPD appointment:", error)
      toast.error("Failed to cancel IPD appointment.")
      setCancelError("An error occurred during cancellation.")
    } finally {
      setCancelPassword("")
      setIsLoading(false)
    }
  }

  const allRecordsForWardFilter = useMemo(() => [...activeIpdRecords, ...detailedRecords], [activeIpdRecords, detailedRecords])
  const uniqueWards = useMemo(
    () =>
      Array.from(
        new Set(
          allRecordsForWardFilter
            .map((record: BillingRecord) => record.roomType)
            .filter((ward): ward is string => ward !== undefined && ward !== null),
        ),
      ),
    [allRecordsForWardFilter],
  )

  const totalPatients = filteredRecords.length
  const totalDeposits = filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  // Manual reload for discharge tab
  function reloadDischargeTab() {
    setHasLoadedDetails(false)
    setSelectedAdmissionDate(null)
    // The useEffect hook for `selectedTab` and `selectedAdmissionDate` will trigger the reload.
  }

  const handleAdmissionDateChange = (date: Date | null) => {
    setSelectedAdmissionDate(date)
    setSearchTerm("")
  }
  const clearDateFilters = () => {
    setSelectedAdmissionDate(null)
    setSearchTerm("")
    setSelectedWard("All")
  }

  async function handleArchiveSearch() {
    setArchiveSearchError("")
    setArchiveSearchResults([])
    const input = archiveSearchInput.trim()
    if (!input) return
    if (/^\d{10}$/.test(input) || input.length === 10 || input.length >= 3) {
      setArchiveSearchLoading(true)
      try {
        // Fetch all dates under userinfoipd
        const userinfoRootRef = ref(db, "patients/ipddetail/userinfoipd")
        const snap = await get(userinfoRootRef)
        if (!snap.exists()) {
          setArchiveSearchResults([])
          setArchiveSearchLoading(false)
          return
        }
        const allData = snap.val()
        const results: BillingRecord[] = []
        Object.keys(allData).forEach(dateKey => {
          const dateData = allData[dateKey]
          Object.keys(dateData).forEach(patientId => {
            Object.keys(dateData[patientId]).forEach(ipdId => {
              const ipdData = dateData[patientId][ipdId]
              // Match logic
              if (
                (input.length === 10 && (ipdData.uhid === input || ipdData.phone === input)) ||
                (input.length >= 3 && ipdData.name && ipdData.name.toLowerCase().includes(input.toLowerCase()))
              ) {
                results.push(combineRecordData(patientId, ipdId, ipdData, {}))
              }
            })
          })
        })
        setArchiveSearchResults(results)
      } catch (err) {
        setArchiveSearchError("Error searching records. Please try again.")
      } finally {
        setArchiveSearchLoading(false)
      }
    } else {
      setArchiveSearchError("Enter a valid 10-digit mobile, 10-char UHID, or name (min 3 chars)")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <ToastContainer />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">IPD Billing Management</h1>
          <p className="text-slate-500">Manage and track in-patient billing records</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Patients (Filtered)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Users className="h-5 w-5 text-emerald-500 mr-2" />
                <span className="text-2xl font-bold">{totalPatients}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Deposits (Filtered)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CreditCard className="h-5 w-5 text-violet-500 mr-2" />
                <span className="text-2xl font-bold">₹{totalDeposits.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="mb-8">
          <CardContent className="p-6">
            <Tabs
              defaultValue="non-discharge"
              value={selectedTab}
              onValueChange={(value) => setSelectedTab(value as "non-discharge" | "discharge")}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="overflow-x-auto">
                  <TabsList className="bg-slate-100 flex gap-2 whitespace-nowrap">
                    <TabsTrigger value="non-discharge" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                      <XCircle className="h-4 w-4 mr-2" />
                      Active IPD ({activeIpdRecords.length})
                    </TabsTrigger>
                    <TabsTrigger value="discharge" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Patient Archive ({detailedRecords.filter((rec) => rec.dischargeDate).length})
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, ID, UHID or mobile"
                    className="pl-10 w-full md:w-80"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-500" />
                  <span className="font-medium text-slate-700">Admission Date:</span>
                  <DatePicker
                    selected={selectedAdmissionDate}
                    onChange={handleAdmissionDateChange}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Load by Admission Date"
                    className="border rounded-md px-3 py-1 w-40"
                    isClearable
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-4 w-4 text-slate-500" />
                  <h3 className="font-medium text-slate-700">Filter by Ward</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={selectedWard === "All" ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedWard("All")}>
                    All Wards
                  </Badge>
                  {uniqueWards.map((ward: string) => (
                    <Badge key={ward} variant={selectedWard === ward ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedWard(ward)}>
                      {ward}
                    </Badge>
                  ))}
                </div>
              </div>

              <TabsContent value="non-discharge" className="mt-0">
                {renderPatientsTable(filteredRecords, handleRowClick, handleEditRecord, handleManagePatient, handleDrugChart, handleOTForm, handleCancelAppointment, isLoading)}
              </TabsContent>
              <TabsContent value="discharge" className="mt-0">
                <div className="mb-4 flex items-center gap-2">
                  <Input
                    type="text"
                    value={archiveSearchInput}
                    onChange={e => setArchiveSearchInput(e.target.value)}
                    placeholder="Enter 10-digit mobile, 10-char UHID, or patient name (min 3 chars)"
                    className="w-64"
                  />
                  <Button
                    onClick={handleArchiveSearch}
                    disabled={archiveSearchLoading || !archiveSearchInput.trim()}
                    variant="default"
                  >
                    {archiveSearchLoading ? (
                      <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </Button>
                </div>
                {archiveSearchError && (
                  <div className="text-red-500 mb-2">{archiveSearchError}</div>
                )}
                {archiveSearchResults.length > 0 ? (
                  renderPatientsTable(archiveSearchResults, handleRowClick, handleEditRecord, handleManagePatient, handleDrugChart, handleOTForm, handleCancelAppointment, isLoading)
                ) : (
                  (!selectedAdmissionDate && !archiveSearchInput) ? (
                    <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                      <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-700 mb-1">No data loaded</h3>
                      <p className="text-slate-500">Select an admission date or search by patient details to view archived records.</p>
                    </div>
                  ) : (
                    archiveSearchInput && !archiveSearchLoading && (
                      <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                        <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700 mb-1">No patients found</h3>
                        <p className="text-slate-500">No records match your search criteria.</p>
                      </div>
                    )
                  )
                )}
                {selectedAdmissionDate && !archiveSearchInput && (
                  <>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        Data downloaded for selected range: <b>{formatBytes(detailedDataSize)}</b>
                      </span>
                      <Button variant="outline" size="sm" onClick={reloadDischargeTab}>
                        <RefreshCw className="h-3 w-3 mr-2"/>
                        Reload Recent Admissions
                      </Button>
                    </div>
                    {renderPatientsTable(filteredRecords, handleRowClick, handleEditRecord, handleManagePatient, handleDrugChart, handleOTForm, handleCancelAppointment, isLoading)}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      {showCancelModal && recordToCancel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-red-700 flex items-center">
                <Trash2 className="h-6 w-6 mr-2" />
                Confirm Cancellation
              </h3>
              <button onClick={() => setShowCancelModal(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to cancel the IPD appointment for{" "}
              <span className="font-semibold">{recordToCancel.name}</span> (UHID:{" "}
              <span className="font-semibold">{recordToCancel.uhid || recordToCancel.patientId}</span>)?
              <br />
              This action will permanently delete all associated records.
            </p>
            <div className="mb-4">
              <label htmlFor="cancel-password" className="block text-sm font-medium text-gray-700 mb-1">
                Enter Password to Confirm:
              </label>
              <Input
                id="cancel-password"
                type="password"
                value={cancelPassword}
                onChange={(e) => {
                  setCancelPassword(e.target.value)
                  setCancelError("")
                }}
                placeholder="Enter password"
                className={cancelError ? "border-red-500" : ""}
              />
              {cancelError && (
                <p className="text-red-500 text-sm mt-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {cancelError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCancelModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmCancelAppointment} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Record"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDrugChart: (e: React.MouseEvent, record: BillingRecord) => void,
  handleOTForm: (e: React.MouseEvent, record: BillingRecord) => void,
  handleCancelAppointment: (e: React.MouseEvent, record: BillingRecord) => void,
  isLoading: boolean,
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
        <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700 mb-1">No patients found</h3>
        <p className="text-slate-500">Try adjusting your filters or search criteria</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Patient Details</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Room</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {records.map((record, index) => (
            <tr key={`${record.patientId}-${record.ipdId}`} onClick={() => handleRowClick(record)} className="hover:bg-slate-50 transition-colors cursor-pointer">
              <td className="px-4 py-3 text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{record.name}</div>
                <div className="text-xs text-slate-500">UHID: {record.uhid || "N/A"} | IPD: {record.ipdId}</div>
                <div className="text-xs text-slate-500">📱 {record.mobileNumber}</div>
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">₹{record.amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50">
                  {record.roomType || "N/A"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.dischargeDate ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Discharged
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Active
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1 flex-wrap">
                  <Button variant="outline" size="sm" onClick={(e) => handleEditRecord(e, record)} className="text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={(e) => handleManagePatient(e, record)} className="text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button variant="outline" size="sm" onClick={(e) => handleDrugChart(e, record)} className="text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                    <Clipboard className="h-4 w-4 mr-1" />
                    Drug Chart
                  </Button>
                  <Button variant="outline" size="sm" onClick={(e) => handleOTForm(e, record)} className="text-blue-700 hover:text-blue-900 hover:bg-blue-50 border-blue-200">
                    <Stethoscope className="h-4 w-4 mr-1" />
                    OT
                  </Button>
                  {!record.dischargeDate && (
                    <Button variant="destructive" size="sm" onClick={(e) => handleCancelAppointment(e, record)} className="bg-red-500 hover:bg-red-600 text-white">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Cancel IPD
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}