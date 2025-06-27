"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { ref, onChildAdded, onChildChanged, onChildRemoved, get } from "firebase/database"
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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format, parseISO, isValid } from "date-fns"

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
  amount: number // totalDeposit or advanceDeposit
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  createdAt?: string
}

const ITEMS_PER_PAGE = 20

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

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

  // Combine IPD info and billing info into a single record (for discharge tab)
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
        mobileNumber: ipdData.phone || "",
        address: ipdData.address || "",
        age: ipdData.age || "",
        gender: ipdData.gender || "",
        relativeName: ipdData.relativeName || "",
        relativePhone: ipdData.relativePhone || "",
        relativeAddress: ipdData.relativeAddress || "",
        dischargeDate: ipdData.dischargeDate || "",
        admissionDate: ipdData.admissionDate || "",
        amount: billingData?.totalDeposit ? Number(billingData.totalDeposit) : 0,
        roomType: ipdData.roomType || "",
        bed: ipdData.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        discount: ipdData.discount ? Number(ipdData.discount) : 0,
        createdAt: ipdData.createdAt || "",
      }
    },
    [],
  )

  function getAdmitDateKey(dateStr?: string) {
    if (!dateStr) return ""
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr
    if (!isValid(date)) return ""
    return format(date, "yyyy-MM-dd")
  }

  // Active (non-discharge) patients: only fetch from /patients/ipdactive
  useEffect(() => {
    if (selectedTab !== "non-discharge") return
    setIsLoading(true)
    const ipdActiveRef = ref(db, "patients/ipdactive")
    setActiveIpdRecords([])
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
      setIsLoading(false)
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
      setActiveIpdRecords([])
    }
  }, [selectedTab])

  // Fetch latest 20 discharged IPD records ONLY when going to the discharge tab
  const loadDischargedPatients = useCallback(async () => {
    setIsLoading(true)
    setDischargedDataSize(0)
    try {
      // Fetch userinfoipd (just for discharged)
      const ipdRef = ref(db, "patients/ipddetail/userinfoipd")
      const snap = await get(ipdRef)

      const dischargedArr: {
        patientId: string
        ipdId: string
        ipdData: any
        dischargeDate: string
        dateKey: string
      }[] = []
      let sizeUserInfoIpd = 0

      if (snap.exists()) {
        const allDates = snap.val()
        const rawDataUserInfoIpd: any[] = []
        Object.keys(allDates).forEach((dateKey) => {
          const datePatients = allDates[dateKey]
          Object.keys(datePatients).forEach((patientId) => {
            const patientIpds = datePatients[patientId]
            Object.keys(patientIpds).forEach((ipdId) => {
              const ipdData = patientIpds[ipdId]
              if (ipdData && ipdData.dischargeDate) {
                dischargedArr.push({
                  patientId,
                  ipdId,
                  ipdData,
                  dischargeDate: ipdData.dischargeDate,
                  dateKey,
                })
                rawDataUserInfoIpd.push(ipdData)
              }
            })
          })
        })

        // Calculate size of userinfoipd discharged
        sizeUserInfoIpd = JSON.stringify(rawDataUserInfoIpd).length

        // Sort by dischargeDate desc, take latest 20
        dischargedArr.sort((a, b) => {
          return new Date(b.dischargeDate).getTime() - new Date(a.dischargeDate).getTime()
        })
        const top20 = dischargedArr.slice(0, ITEMS_PER_PAGE)

        // Fetch billing for each record
        let sizeBilling = 0
        const billingSnapshots = await Promise.all(
          top20.map(({ dateKey, patientId, ipdId }) =>
            get(ref(db, `patients/ipddetail/userbillinginfoipd/${dateKey}/${patientId}/${ipdId}`)),
          ),
        )
        const billingDataArr: any[] = []
        const dischargedRecords: BillingRecord[] = top20.map((entry, idx) => {
          const billingData = billingSnapshots[idx].exists() ? billingSnapshots[idx].val() : {}
          billingDataArr.push(billingData)
          return combineRecordData(entry.patientId, entry.ipdId, entry.ipdData, billingData)
        })

        // Calculate total downloaded size
        sizeBilling = JSON.stringify(billingDataArr).length
        setDischargedDataSize(sizeUserInfoIpd + sizeBilling)
        setDischargedRecords(dischargedRecords)
      } else {
        setDischargedDataSize(0)
        setDischargedRecords([])
      }
    } catch (err) {
      setDischargedDataSize(0)
      setDischargedRecords([])
      console.error("Error loading discharged patients:", err)
    } finally {
      setIsLoading(false)
      setHasLoadedDischarged(true)
    }
  }, [combineRecordData])

  // Only fetch when going to discharge tab and NOT already loaded
  useEffect(() => {
    if (selectedTab === "discharge" && !hasLoadedDischarged) {
      loadDischargedPatients()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, loadDischargedPatients])

  // Filter records based on tab, search, ward
  useEffect(() => {
    let records: BillingRecord[] = []
    if (selectedTab === "non-discharge") {
      records = activeIpdRecords
    } else {
      records = dischargedRecords
    }
    const term = searchTerm.trim().toLowerCase()
    if (selectedWard !== "All") {
      records = records.filter((rec) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term),
      )
    }
    setFilteredRecords(records)
  }, [selectedTab, searchTerm, selectedWard, activeIpdRecords, dischargedRecords])

  // Event handlers
  const handleRowClick = (record: BillingRecord) => {
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  const handleEditRecord = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }
  const handleManagePatient = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/manage/${record.patientId}/${record.ipdId}`)
  }
  const handleDrugChart = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/drugchart/${record.patientId}/${record.ipdId}`)
  }
  const handleOTForm = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getAdmitDateKey(record.admissionDate || record.createdAt)
    router.push(`/ot/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  // Get unique ward names from current records
  const allRecords = [...activeIpdRecords, ...dischargedRecords]
  const uniqueWards = Array.from(new Set(allRecords.map((record) => record.roomType).filter((ward) => ward)))

  // Summary stats
  const totalPatients = filteredRecords.length
  const totalDeposits = filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  // Manual reload for discharge
  function reloadDischargeTab() {
    setHasLoadedDischarged(false)
    loadDischargedPatients()
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
              <CardTitle className="text-sm font-medium text-slate-500">Total Patients</CardTitle>
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
                    <TabsTrigger
                      value="non-discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Non-Discharged ({activeIpdRecords.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
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
                  <Badge
                    variant={selectedWard === "All" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedWard("All")}
                  >
                    All Wards
                  </Badge>
                  {uniqueWards.map((ward) => (
                    <Badge
                      key={ward}
                      variant={selectedWard === ward ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedWard(ward ?? "")}
                    >
                      {ward}
                    </Badge>
                  ))}
                </div>
              </div>

              <TabsContent value="non-discharge" className="mt-0">
                {renderPatientsTable(
                  filteredRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  isLoading,
                )}
              </TabsContent>

              <TabsContent value="discharge" className="mt-0">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Data downloaded: <b>{formatBytes(dischargedDataSize)}</b>
                  </span>
                  <Button variant="outline" size="sm" onClick={reloadDischargeTab}>
                    Reload
                  </Button>
                </div>
                {renderPatientsTable(
                  filteredRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  isLoading,
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
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
            <th className="px-4 py-3 text-left font-medium text-slate-500">Patient Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Mobile Number</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Room Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {records.map((record, index) => (
            <tr
              key={`${record.patientId}-${record.ipdId}`}
              onClick={() => handleRowClick(record)}
              className="hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{record.name}</div>
                <div className="text-xs text-slate-500">UHID: {record.uhid || record.patientId}</div>
                              </td>
              <td className="px-4 py-3 text-slate-700">{record.mobileNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">₹{record.amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50">
                  {record.roomType || "Not Assigned"}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleEditRecord(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleManagePatient(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDrugChart(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Clipboard className="h-4 w-4 mr-1" />
                    Drug Chart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleOTForm(e, record)}
                    className="text-blue-700 hover:text-blue-900 hover:bg-blue-50 border-blue-200"
                  >
                    <Stethoscope className="h-4 w-4 mr-1" />
                    OT
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
