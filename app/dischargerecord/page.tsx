"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { ref, onChildAdded, onChildChanged, onChildRemoved, get, update, set } from "firebase/database"
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
  Undo2,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { format, parseISO, isValid } from "date-fns"

// --- INTERFACES ---
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
  dischargeDate?: string
  admissionDate?: string
  amount: number
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  createdAt?: string
  [key: string]: any
}

// --- CONSTANTS ---
const ITEMS_PER_PAGE = 20
const UNDO_PASSWORD = "mudassirs472"

// --- HELPER FUNCTIONS ---
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// CORRECTED: Moved this function outside the component
function getAdmitDateKey(dateStr?: string) {
  if (!dateStr) return ""
  const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr
  if (!isValid(date)) return ""
  return format(date, "yyyy-MM-dd")
}


// --- MAIN COMPONENT ---
export default function OptimizedPatientsPage() {
  const [activeIpdRecords, setActiveIpdRecords] = useState<BillingRecord[]>([])
  const [dischargedRecords, setDischargedRecords] = useState<BillingRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [dischargedDataSize, setDischargedDataSize] = useState<number>(0)
  const [hasLoadedDischarged, setHasLoadedDischarged] = useState<boolean>(false)
  const router = useRouter()

  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false)
  const [selectedPatientForUndo, setSelectedPatientForUndo] = useState<BillingRecord | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [undoError, setUndoError] = useState<string | null>(null)
  const [isProcessingUndo, setIsProcessingUndo] = useState(false)

  const combineRecordData = useCallback(
    (patientId: string, ipdId: string, ipdData: any, billingData: any): BillingRecord => {
      const servicesArray: ServiceItem[] = []
      if (ipdData?.services && typeof ipdData.services === 'object') {
         Object.values(ipdData.services).forEach((svc: any) => {
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
      if (billingData?.payments && typeof billingData.payments === 'object') {
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
        mobileNumber: ipdData.phone || ipdData.mobileNumber || "",
        address: ipdData.address || "",
        age: ipdData.age || "",
        gender: ipdData.gender || "",
        relativeName: ipdData.relativeName || "",
        relativePhone: ipdData.relativePhone || "",
        dischargeDate: ipdData.dischargeDate || "",
        admissionDate: ipdData.admissionDate || ipdData.admitDate || "",
        amount: billingData?.totalDeposit ? Number(billingData.totalDeposit) : (ipdData.advanceDeposit ? Number(ipdData.advanceDeposit) : 0),
        roomType: ipdData.roomType || ipdData.ward || "",
        bed: ipdData.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        discount: ipdData.discount ? Number(ipdData.discount) : 0,
        createdAt: ipdData.createdAt || "",
        ...ipdData,
      }
    },
    [],
  )

  useEffect(() => {
    if (selectedTab !== "non-discharge") return
    setIsLoading(true)
    const ipdActiveRef = ref(db, "patients/ipdactive")
    const listeners = [
      onChildAdded(ipdActiveRef, (snapshot) => {
        const data = snapshot.val()
        if (!data) return
        setActiveIpdRecords((prev) =>
          prev.some((r) => r.ipdId === data.ipdId) ? prev : [...prev, combineRecordData(data.patientId, data.ipdId, data, {})],
        )
        setIsLoading(false)
      }),
      onChildChanged(ipdActiveRef, (snapshot) => {
        const data = snapshot.val()
        if (!data) return
        setActiveIpdRecords((prev) =>
          prev.map((r) => (r.ipdId === data.ipdId ? combineRecordData(data.patientId, data.ipdId, data, {}) : r)),
        )
      }),
      onChildRemoved(ipdActiveRef, (snapshot) => {
        const data = snapshot.val()
        if (!data) return
        setActiveIpdRecords((prev) => prev.filter((r) => r.ipdId !== data.ipdId))
      }),
    ]
    return () => {
      listeners.forEach((listener) => listener())
      setActiveIpdRecords([])
    }
  }, [selectedTab, combineRecordData])

  const loadDischargedPatients = useCallback(async () => {
    setIsLoading(true)
    setDischargedDataSize(0)
    setDischargedRecords([])

    try {
      const ipdRef = ref(db, "patients/ipddetail/userinfoipd")
      const snap = await get(ipdRef)
      if (!snap.exists()) { return }

      const allDateNodes = snap.val()
      const dischargedArr: {
        patientId: string
        ipdId: string
        ipdData: any
        dischargeDate: string
        dateKey: string
      }[] = []

      let rawDataSize = 0

      if (allDateNodes && typeof allDateNodes === "object") {
        Object.keys(allDateNodes).forEach((dateKey) => {
          const patientNodes = allDateNodes[dateKey]
          if (patientNodes && typeof patientNodes === "object") {
            Object.keys(patientNodes).forEach((patientId) => {
              const ipdNodes = patientNodes[patientId]
              if (ipdNodes && typeof ipdNodes === "object") {
                Object.keys(ipdNodes).forEach((ipdId) => {
                  const ipdData = ipdNodes[ipdId]
                  if (ipdData && ipdData.dischargeDate) {
                    dischargedArr.push({ patientId, ipdId, ipdData, dischargeDate: ipdData.dischargeDate, dateKey })
                  }
                })
              }
            })
          }
        })
      }

      if (dischargedArr.length === 0) { return }

      rawDataSize += JSON.stringify(dischargedArr.map((d) => d.ipdData)).length
      dischargedArr.sort((a, b) => new Date(b.dischargeDate).getTime() - new Date(a.dischargeDate).getTime())
      const topRecords = dischargedArr.slice(0, ITEMS_PER_PAGE)

      let billingDataSize = 0
      const billingSnapshots = await Promise.all(
        topRecords.map(({ dateKey, patientId, ipdId }) =>
          get(ref(db, `patients/ipddetail/userbillinginfoipd/${dateKey}/${patientId}/${ipdId}`)),
        ),
      )

      const finalDischargedRecords: BillingRecord[] = topRecords.map((entry, idx) => {
        const billingData = billingSnapshots[idx].exists() ? billingSnapshots[idx].val() : {}
        if (billingData) {
          billingDataSize += JSON.stringify(billingData).length
        }
        return combineRecordData(entry.patientId, entry.ipdId, entry.ipdData, billingData)
      })

      setDischargedDataSize(rawDataSize + billingDataSize)
      setDischargedRecords(finalDischargedRecords)
    } catch (err) {
      console.error("Error loading discharged patients:", err)
      setDischargedRecords([])
    } finally {
      setIsLoading(false)
      setHasLoadedDischarged(true)
    }
  }, [combineRecordData])

  useEffect(() => {
    if (selectedTab === "discharge" && !hasLoadedDischarged) {
      loadDischargedPatients()
    }
  }, [selectedTab, hasLoadedDischarged, loadDischargedPatients])

  useEffect(() => {
    let records: BillingRecord[] = selectedTab === "non-discharge" ? activeIpdRecords : dischargedRecords

    if (selectedWard !== "All") {
      records = records.filter(
        (rec) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase(),
      )
    }

    const term = searchTerm.trim().toLowerCase()
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term) ||
          (rec.uhid && rec.uhid.toLowerCase().includes(term)),
      )
    }
    setFilteredRecords(records)
  }, [selectedTab, searchTerm, selectedWard, activeIpdRecords, dischargedRecords])

  const handleRowClick = (record: BillingRecord) => {
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  const handleUndoDischargeClick = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    setSelectedPatientForUndo(record)
    setIsUndoModalOpen(true)
    setUndoError(null)
    setPasswordInput("")
  }

  const handleConfirmUndo = async () => {
    if (!selectedPatientForUndo) return

    if (passwordInput !== UNDO_PASSWORD) {
      setUndoError("Incorrect password. Please try again.")
      return
    }

    setIsProcessingUndo(true)
    setUndoError(null)

    const patient = selectedPatientForUndo
    const admitDateKey = getAdmitDateKey(patient.admissionDate || patient.createdAt)

    if (!admitDateKey) {
      setUndoError("Error: Cannot find admission date for this record.")
      setIsProcessingUndo(false)
      return
    }

    try {
      const activeIpdRecord = {
        patientId: patient.patientId,
        ipdId: patient.ipdId,
        uhid: patient.uhid || patient.patientId,
        name: patient.name || "",
        phone: patient.mobileNumber || "",
        ward: patient.roomType || "",
        bed: patient.bed || "",
        advanceDeposit: patient.amount || 0,
        admitDate: patient.admissionDate || "",
      }

      const activeIpdRef = ref(db, `patients/ipdactive/${patient.ipdId}`)
      await set(activeIpdRef, activeIpdRecord)

      const patientInfoRef = ref(db, `patients/ipddetail/userinfoipd/${admitDateKey}/${patient.patientId}/${patient.ipdId}`)
      await update(patientInfoRef, { dischargeDate: null })

      setIsUndoModalOpen(false)
      setDischargedRecords((prev) => prev.filter((p) => p.ipdId !== patient.ipdId))
    } catch (err: any) {
      console.error("Error undoing discharge:", err)
      setUndoError(err.message || "An unexpected error occurred.")
    } finally {
      setIsProcessingUndo(false)
    }
  }

  const allRecords = [...activeIpdRecords, ...dischargedRecords]
  const uniqueWards = Array.from(new Set(allRecords.map((record) => record.roomType).filter(Boolean)))

  const totalPatients = filteredRecords.length
  const totalDeposits = filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  function reloadDischargeTab() {
    setHasLoadedDischarged(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">IPD Billing Management</h1>
          <p className="text-slate-500">Manage and track in-patient billing records</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Patients ({selectedTab === "non-discharge" ? "Active" : "Discharged"})</CardTitle>
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
              <CardTitle className="text-sm font-medium text-slate-500">Total Deposits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CreditCard className="h-5 w-5 text-violet-500 mr-2" />
                <span className="text-2xl font-bold">₹{totalDeposits.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Filters */}
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
                      Non-Discharged ({activeIpdRecords.length})
                    </TabsTrigger>
                    <TabsTrigger value="discharge" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Discharged ({dischargedRecords.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, ID or mobile"
                    className="pl-10 w-full md:w-80"
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
                  {uniqueWards.map((ward) => (
                    <Badge key={ward} variant={selectedWard === ward ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedWard(ward ?? "")}>
                      {ward}
                    </Badge>
                  ))}
                </div>
              </div>

              <TabsContent value="non-discharge" className="mt-0">
                {renderPatientsTable(filteredRecords, handleRowClick, handleUndoDischargeClick, isLoading)}
              </TabsContent>

              <TabsContent value="discharge" className="mt-0">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Data downloaded: <b>{formatBytes(dischargedDataSize)}</b> (Showing latest {ITEMS_PER_PAGE} records)
                  </span>
                  <Button variant="outline" size="sm" onClick={reloadDischargeTab}>
                    Reload
                  </Button>
                </div>
                {renderPatientsTable(filteredRecords, handleRowClick, handleUndoDischargeClick, isLoading)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Modal Dialog for Undo Discharge */}
      <Dialog open={isUndoModalOpen} onOpenChange={setIsUndoModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Undo Discharge</DialogTitle>
            <DialogDescription>
              To move patient{" "}
              <span className="font-semibold text-slate-900">{selectedPatientForUndo?.name}</span> back to the active list, please enter the password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {undoError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{undoError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="password" className="text-right">Password</label>
              <Input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setUndoError(null); }}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUndoModalOpen(false)}>Cancel</Button>
            <Button type="submit" onClick={handleConfirmUndo} disabled={isProcessingUndo}>
              {isProcessingUndo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Undo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- RENDER FUNCTION ---
function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleUndoDischargeClick: (e: React.MouseEvent, record: BillingRecord) => void,
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
        <h3 className="text-lg font-medium text-slate-700 mb-1">No Patients Found</h3>
        <p className="text-slate-500">Try adjusting your filters or search criteria.</p>
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
            <th className="px-4 py-3 text-left font-medium text-slate-500">Mobile</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Room / Bed</th>
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
                <div className="text-xs text-slate-500">UHID: {record.uhid || record.patientId} | IPD: {record.ipdId}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{record.mobileNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">₹{record.amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50 whitespace-nowrap">
                  {record.roomType || "N/A"} / {record.bed || "N/A"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.dischargeDate ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Discharged</Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Active</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1 flex-wrap">
                  {record.dischargeDate ? (
                    <Button variant="destructive" size="sm" onClick={(e) => handleUndoDischargeClick(e, record)}>
                      <Undo2 className="h-4 w-4 mr-1" />
                      Undo Discharge
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()} asChild>
                        <a href={`/billing/edit/${record.patientId}/${record.ipdId}/${getAdmitDateKey(record.admissionDate)}`}>
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()} asChild>
                         <a href={`/manage/${record.patientId}/${record.ipdId}`}>
                           <FileText className="h-4 w-4 mr-1" /> Manage
                         </a>
                      </Button>
                    </>
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