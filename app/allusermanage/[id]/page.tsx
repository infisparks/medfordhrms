"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, get } from "firebase/database"
import { format, isValid } from "date-fns"
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Phone,
  PillIcon as Pills,
  User,
  Users,
  MapPin,
  Stethoscope,
  Clipboard,
  ArrowLeft,
  TrendingUp,
  Building2,
  FileCheck,
  DollarSign,
  ListChecks,
  HeartPulse,
  Syringe,
  NotebookPen,
  ScrollText,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

interface IPatientInfo {
  address?: string
  age?: number
  createdAt?: string | number
  gender?: string
  name?: string
  phone?: string
  uhid?: string
  updatedAt?: string | number
}

interface IModality {
  charges: number
  doctor?: string
  specialist?: string
  type: "consultation" | "casualty" | "xray" | "custom"
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
  updatedAt?: string
}

interface IOPDRecord {
  id: string
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

interface IPaymentDetail {
  amount: number | string
  createdAt: string
  date: string
  paymentType: string
  type: string
  id?: string
}

interface IServiceDetail {
  amount: number
  createdAt: string
  doctorName?: string
  serviceName: string
  type: string
}

interface IChargeSheetEntry {
  description: string
  doneBy: string
  enteredBy: string
  timestamp: string
}

interface IDoctorVisitEntry {
  dateTime: string
  doctorName: string
  enteredBy: string
}

interface IInvestigationEntry {
  dateTime: string
  type: string
  value: string
}

interface IProgressNoteEntry {
  enteredBy: string
  note: string
  timestamp: string
}

interface IVitalObservationEntry {
  bloodPressure?: string
  dateTime: string
  enteredBy: string
  intakeIV?: string
  intakeOral?: string
  outputAspiration?: string
  outputStool?: string
  outputUrine?: string
  pulse?: string
  respiratoryRate?: string
  temperature?: string
}

interface IIPDRecord {
  id: string
  admissionDate?: string
  admissionSource?: string
  admissionTime?: string
  admissionType?: string
  bed?: string
  createdAt?: string
  doctor?: string // Doctor ID
  name?: string
  referDoctor?: string
  relativeAddress?: string
  relativeName?: string
  relativePhone?: string
  roomType?: string
  services?: IServiceDetail[] // Services from userinfoipd (initial)
  status?: string
  uhid?: string
  dischargeDate?: string
  discount?: number
  // New fields from userbillinginfoipd
  advanceDeposit?: number | string
  totalDeposit?: number
  paymentMode?: string
  payments?: IPaymentDetail[]
  billingServices?: IServiceDetail[] // Services from userbillinginfoipd
  // New fields from userdetailipd
  dischargesummery?: { lastUpdated: string }
  chargeSheets?: IChargeSheetEntry[]
  doctorvisit?: IDoctorVisitEntry[]
  investigationsheet?: { testName: string; entries: IInvestigationEntry[] }[]
  progressNotes?: IProgressNoteEntry[]
  vitalobservation?: IVitalObservationEntry[]
}

interface IOTRecord {
  id: string
  createdAt?: string
  date?: string
  message?: string
  time?: string
  updatedAt?: string
}

interface IDoctor {
  name: string
  specialist?: string
  department?: string
}

const roomTypeMap: Record<string, string> = {
  deluxe: "Deluxe Room",
  female: "Female Ward",
  male: "Male Ward",
  female_ward: "Female Ward",
  male_ward: "Male Ward",
  icu: "ICU",
  nicu: "NICU",
  casualty: "Casualty",
  suit: "Suite",
}

export default function PatientDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<string>("overview")
  const [patientInfo, setPatientInfo] = useState<IPatientInfo | null>(null)
  const [opdRecords, setOpdRecords] = useState<IOPDRecord[]>([])
  const [ipdRecords, setIpdRecords] = useState<IIPDRecord[]>([])
  const [otRecords, setOtRecords] = useState<IOTRecord[]>([])
  const [doctors, setDoctors] = useState<Record<string, IDoctor>>({})
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalOPD: 0,
    totalIPD: 0,
    totalOT: 0,
    totalAmount: 0,
  })

  useEffect(() => {
    if (id) fetchPatientData()
  }, [id])

  async function fetchPatientData() {
    setLoading(true)
    try {
      // Fetch doctors
      const doctorsRef = ref(db, "doctors")
      const doctorsSnap = await get(doctorsRef)
      const doctorsData: Record<string, IDoctor> = {}
      if (doctorsSnap.exists()) {
        Object.entries(doctorsSnap.val()).forEach(([key, val]: [string, any]) => {
          doctorsData[key] = {
            name: val.name,
            specialist: val.specialist,
            department: val.department,
          }
        })
      }
      setDoctors(doctorsData)

      // Fetch patient info
      const infoRef = ref(db, `patients/patientinfo/${id}`)
      const infoSnap = await get(infoRef)
      if (infoSnap.exists()) {
        setPatientInfo(infoSnap.val())
      }

      // Fetch OPD records
      const opdRef = ref(db, `patients/opddetail`) // Fetch all opd records
      const opdSnap = await get(opdRef)
      const opdData: IOPDRecord[] = []
      if (opdSnap.exists()) {
        const allOpdByDate = opdSnap.val()
        for (const dateKey in allOpdByDate) {
          const uhidRecords = allOpdByDate[dateKey]
          if (uhidRecords[id]) {
            // Filter by current patient's UHID
            for (const recordId in uhidRecords[id]) {
              const val = uhidRecords[id][recordId]
              opdData.push({
                id: recordId,
                patientId: id,
                name: val.name || "",
                phone: val.phone || "",
                appointmentType: val.appointmentType || "",
                createdAt: val.createdAt || "",
                date: val.date || "",
                enteredBy: val.enteredBy || "",
                message: val.message || "",
                modalities: val.modalities || [],
                opdType: val.opdType || "",
                payment: val.payment || {
                  cashAmount: 0,
                  createdAt: "",
                  discount: 0,
                  onlineAmount: 0,
                  paymentMethod: "cash",
                  totalCharges: 0,
                  totalPaid: 0,
                },
                referredBy: val.referredBy || "",
                study: val.study || "",
                time: val.time || "",
                visitType: val.visitType || "",
              })
            }
          }
        }
      }
      opdData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setOpdRecords(opdData)

      // Fetch IPD records
      const ipdUserInfoRef = ref(db, `patients/ipddetail/userinfoipd`)
      const ipdUserInfoSnap = await get(ipdUserInfoRef)
      const allIpdUserInfo: Record<string, Record<string, Record<string, any>>> = ipdUserInfoSnap.exists()
        ? ipdUserInfoSnap.val()
        : {}

      const ipdBillingInfoRef = ref(db, `patients/ipddetail/userbillinginfoipd`)
      const ipdBillingInfoSnap = await get(ipdBillingInfoRef)
      const allIpdBillingInfo: Record<string, Record<string, Record<string, any>>> = ipdBillingInfoSnap.exists()
        ? ipdBillingInfoSnap.val()
        : {}

      const ipdDetailInfoRef = ref(db, `patients/ipddetail/userdetailipd`)
      const ipdDetailInfoSnap = await get(ipdDetailInfoRef)
      const allIpdDetailInfo: Record<string, Record<string, Record<string, any>>> = ipdDetailInfoSnap.exists()
        ? ipdDetailInfoSnap.val()
        : {}

      const patientIpdRecords: IIPDRecord[] = []
      const ipdIdMap: Record<string, IIPDRecord> = {} // To consolidate by ipdId

      // Process userinfoipd first as it contains core admission details
      for (const dateKey in allIpdUserInfo) {
        const uhidRecords = allIpdUserInfo[dateKey]
        if (uhidRecords[id]) {
          // Check if current patient's UHID exists for this date
          for (const ipdId in uhidRecords[id]) {
            const record = uhidRecords[id][ipdId]
            ipdIdMap[ipdId] = { id: ipdId, ...record }
          }
        }
      }

      // Now merge billing and detailed info
      for (const dateKey in allIpdBillingInfo) {
        const uhidRecords = allIpdBillingInfo[dateKey]
        if (uhidRecords[id]) {
          for (const ipdId in uhidRecords[id]) {
            const billingRecord = uhidRecords[id][ipdId]
            if (ipdIdMap[ipdId]) {
              ipdIdMap[ipdId] = {
                ...ipdIdMap[ipdId],
                totalDeposit: billingRecord.totalDeposit,
                paymentMode: billingRecord.paymentMode,
                payments: Object.values(billingRecord.payments || {}),
                billingServices: billingRecord.services || [], // Renamed to avoid conflict with initial services
                discount: billingRecord.discount,
              }
            }
          }
        }
      }

      for (const dateKey in allIpdDetailInfo) {
        const uhidRecords = allIpdDetailInfo[dateKey]
        if (uhidRecords[id]) {
          for (const ipdId in uhidRecords[id]) {
            const detailRecord = uhidRecords[id][ipdId]
            if (ipdIdMap[ipdId]) {
              ipdIdMap[ipdId] = {
                ...ipdIdMap[ipdId],
                dischargesummery: detailRecord.dischargesummery,
                chargeSheets: Object.values(detailRecord.chargeSheets || {}),
                doctorvisit: Object.values(detailRecord.doctorvisit || {}),
                investigationsheet: Object.values(detailRecord.investigationsheet || {}),
                progressNotes: Object.values(detailRecord.progressNotes || {}),
                vitalobservation: Object.values(detailRecord.vitalobservation || {}),
              }
            }
          }
        }
      }

      // Convert map to array and sort
      for (const ipdId in ipdIdMap) {
        patientIpdRecords.push(ipdIdMap[ipdId])
      }
      patientIpdRecords.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      setIpdRecords(patientIpdRecords)

      // Fetch OT records
      const otRef = ref(db, `patients/ot/otdetail`) // Fetch all ot records
      const otSnap = await get(otRef)
      const otData: IOTRecord[] = []
      if (otSnap.exists()) {
        const allOtByDate = otSnap.val()
        for (const dateKey in allOtByDate) {
          const uhidRecords = allOtByDate[dateKey]
          if (uhidRecords[id]) {
            // Filter by current patient's UHID
            for (const recordId in uhidRecords[id]) {
              const val = uhidRecords[id][recordId]
              otData.push({ id: recordId, ...val })
            }
          }
        }
      }
      otData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      setOtRecords(otData)

      // Compute stats
      const totalAmount =
        opdData.reduce((sum, r) => sum + (r.payment?.totalPaid || 0), 0) +
        patientIpdRecords.reduce((sum, r) => {
          const services: any[] = r.billingServices || [] // Use billingServices for total amount
          const payments: any[] = r.payments || []
          const totalServicesAmount = services.reduce((s, svc) => s + (svc.amount || 0), 0)
          const totalPaymentsAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
          return sum + totalServicesAmount + totalPaymentsAmount // Sum up services and payments for IPD
        }, 0)
      setStats({
        totalOPD: opdData.length,
        totalIPD: patientIpdRecords.length,
        totalOT: otData.length,
        totalAmount,
      })
    } catch (e) {
      console.error("Error fetching patient data:", e)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d?: string | number) => {
    if (!d) return "N/A"
    const dt = new Date(d)
    return isValid(dt) ? format(dt, "MMM dd, yyyy") : "Invalid Date"
  }

  const formatDateTime = (d?: string | number) => {
    if (!d) return "N/A"
    const dt = new Date(d)
    return isValid(dt) ? format(dt, "MMM dd, yyyy 'at' hh:mm a") : "Invalid Date"
  }

  const getInitials = (name = "") =>
    name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-6" />
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!patientInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Patient Not Found</h2>
            <p className="text-slate-600 mb-6">The patient does not exist or has been removed.</p>
            <Button onClick={() => router.push("/patientadmin")} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Patient Management
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Patient Details</h1>
            <p className="text-slate-600">Complete medical record overview</p>
          </div>
        </div>

        {/* Profile */}
        <Card className="mb-8 border-l-4 border-l-emerald-500 shadow-lg">
          <CardContent className="p-8 flex flex-col lg:flex-row gap-8 items-start lg:items-center">
            <Avatar className="h-24 w-24 border-4 border-emerald-100 shadow-lg">
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-2xl font-bold">
                {getInitials(patientInfo.name || "")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <h2 className="text-3xl font-bold text-slate-900">{patientInfo.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                    ID: {patientInfo.uhid}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`px-3 py-1 ${
                      patientInfo.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                    }`}
                  >
                    {patientInfo.gender
                      ? `${patientInfo.gender[0].toUpperCase()}${patientInfo.gender.slice(1)}, ${patientInfo.age} yrs`
                      : "Gender not specified"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-slate-600">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Phone className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Phone</p>
                    <p className="font-medium">{patientInfo.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <MapPin className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Address</p>
                    <p className="font-medium">{patientInfo.address || "Not provided"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Registered</p>
                    <p className="font-medium">{formatDate(patientInfo.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-600">Total OPD</p>
                <p className="text-3xl font-bold text-blue-600">{stats.totalOPD}</p>
              </div>
              <Stethoscope className="h-6 w-6 text-blue-600" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 shadow-md">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-600">Total IPD</p>
                <p className="text-3xl font-bold text-emerald-600">{stats.totalIPD}</p>
              </div>
              <Building2 className="h-6 w-6 text-emerald-600" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500 shadow-md">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-600">Total OT</p>
                <p className="text-3xl font-bold text-orange-600">{stats.totalOT}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-orange-600" />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500 shadow-md">
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-600">Total Amount</p>
                <p className="text-3xl font-bold text-purple-600">₹{stats.totalAmount.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Clipboard className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="opd" className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> OPD ({stats.totalOPD})
            </TabsTrigger>
            <TabsTrigger value="ipd" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> IPD ({stats.totalIPD})
            </TabsTrigger>
            <TabsTrigger value="ot" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> OT ({stats.totalOT})
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            {/* Recent OPD */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-blue-600" /> Recent OPD Visits
                </CardTitle>
              </CardHeader>
              <CardContent>
                {opdRecords.slice(0, 3).length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No OPD records found</p>
                ) : (
                  <div className="space-y-3">
                    {opdRecords.slice(0, 3).map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium">{r.appointmentType || r.opdType || "OPD Visit"}</p>
                          <p className="text-sm text-slate-600">{formatDate(r.date)}</p>
                        </div>
                        <Badge variant="outline">₹{r.payment.totalPaid}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Recent IPD */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-600" /> Recent IPD Admissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ipdRecords.slice(0, 3).length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No IPD records found</p>
                ) : (
                  <div className="space-y-3">
                    {ipdRecords.slice(0, 3).map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium">{roomTypeMap[r.roomType || ""] || r.roomType}</p>
                          <p className="text-sm text-slate-600">{formatDate(r.admissionDate)}</p>
                        </div>
                        <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* OPD Records */}
          <TabsContent value="opd" className="space-y-6">
            {opdRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Stethoscope className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No OPD Records</h3>
                  <p className="text-slate-500">This patient has no OPD visit records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {opdRecords.map((record) => (
                  <Card key={record.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">
                          {record.appointmentType || record.opdType || "OPD Visit"}
                        </CardTitle>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          ₹{record.payment.totalPaid}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {formatDate(record.date)} at {record.time}
                        </span>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {/* Payment Breakdown */}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <CreditCard className="h-4 w-4 text-slate-500" />
                        <span>
                          <strong>Method:</strong> {record.payment.paymentMethod}
                        </span>
                        <span>
                          <strong>Total Paid:</strong> ₹{record.payment.totalPaid}
                        </span>
                        <span className="text-green-600">
                          <strong>Discount:</strong> ₹{record.payment.discount}
                        </span>
                        <span>
                          <strong>Cash:</strong> ₹{record.payment.cashAmount}
                        </span>
                        <span>
                          <strong>Online:</strong> ₹{record.payment.onlineAmount}
                        </span>
                      </div>

                      {/* Modalities */}
                      <div>
                        <p className="text-sm font-semibold mb-1">Services & Modalities:</p>
                        {record.modalities.length === 0 ? (
                          <span className="text-xs text-slate-400">No modalities</span>
                        ) : (
                          <ul className="list-disc list-inside text-xs space-y-1">
                            {record.modalities.map((m, i) => (
                              <li key={i}>
                                <span className="capitalize font-medium">{m.type}</span>
                                {m.service && ` • Service: ${m.service}`}
                                {m.specialist && ` • Specialist: ${m.specialist}`}
                                {m.doctor && ` • Doctor: ${m.doctor}`}
                                {m.visitType && ` • Visit: ${m.visitType}`}
                                <span className="ml-2 font-semibold text-emerald-700">₹{m.charges}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {record.referredBy && (
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Referred by:</strong> {record.referredBy}
                          </span>
                        </div>
                      )}

                      {record.message && (
                        <div className="flex items-start gap-2 text-sm">
                          <FileText className="h-4 w-4 text-slate-500 mt-1" />
                          <span>
                            <strong>Note:</strong> {record.message}
                          </span>
                        </div>
                      )}

                      {record.enteredBy && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Entered by:</strong> {record.enteredBy}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* IPD Records */}
          <TabsContent value="ipd" className="space-y-6">
            {ipdRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No IPD Records</h3>
                  <p className="text-slate-500">This patient has no IPD admission records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ipdRecords.map((record) => (
                  <Card key={record.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">
                          {roomTypeMap[record.roomType || ""] || record.roomType || "IPD Admission"}
                        </CardTitle>
                        <Badge
                          variant={
                            record.roomType === "icu" || record.roomType === "nicu" ? "destructive" : "secondary"
                          }
                        >
                          {record.status?.toUpperCase() || "N/A"}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Admitted: {formatDate(record.admissionDate)}</span>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4 text-sm">
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Doctor:</strong> {doctors[record.doctor || ""]?.name || "Not assigned"}
                          </span>
                        </div>
                        {record.referDoctor && (
                          <div className="flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-slate-500" />
                            <span>
                              <strong>Referred by:</strong> {record.referDoctor}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Relative:</strong> {record.relativeName || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Contact:</strong> {record.relativePhone || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Time:</strong> {record.admissionTime || "N/A"}
                          </span>
                        </div>
                        {record.dischargeDate && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <span>
                              <strong>Discharged:</strong> {formatDate(record.dischargeDate)}
                            </span>
                          </div>
                        )}
                      </div>

                      {(record.payments && record.payments.length > 0) ||
                      (record.billingServices && record.billingServices.length > 0) ? (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-purple-600" /> Billing & Payments
                            </p>
                            {record.totalDeposit !== undefined && (
                              <div className="flex items-center gap-2 text-xs">
                                <strong>Total Deposit:</strong> ₹{record.totalDeposit?.toLocaleString() || 0}
                              </div>
                            )}
                            {record.discount !== undefined && (
                              <div className="flex items-center gap-2 text-xs">
                                <strong>Discount:</strong> ₹{record.discount?.toLocaleString() || 0}
                              </div>
                            )}
                            {record.paymentMode && (
                              <div className="flex items-center gap-2 text-xs">
                                <strong>Payment Mode:</strong> {record.paymentMode}
                              </div>
                            )}
                            {record.payments && record.payments.length > 0 && (
                              <div className="space-y-1">
                                <p className="font-medium text-xs">Payments:</p>
                                <ul className="list-disc list-inside text-xs space-y-0.5">
                                  {record.payments.map((p, i) => (
                                    <li key={i}>
                                      {p.type} ({p.paymentType}): ₹{Number(p.amount).toLocaleString()} on{" "}
                                      {formatDate(p.date)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {record.billingServices && record.billingServices.length > 0 && (
                              <div className="space-y-1">
                                <p className="font-medium text-xs">Services:</p>
                                <ul className="list-disc list-inside text-xs space-y-0.5">
                                  {record.billingServices.map((s, i) => (
                                    <li key={i}>
                                      {s.serviceName} ({s.type}): ₹{s.amount.toLocaleString()}{" "}
                                      {s.doctorName && `by ${s.doctorName}`}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}

                      {record.chargeSheets && record.chargeSheets.length > 0 && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <ListChecks className="h-4 w-4 text-blue-600" /> Charge Sheets
                            </p>
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {record.chargeSheets.map((cs, i) => (
                                <li key={i}>
                                  {cs.description} (Done by: {cs.doneBy}) on {formatDateTime(cs.timestamp)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      {record.doctorvisit && record.doctorvisit.length > 0 && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <Stethoscope className="h-4 w-4 text-green-600" /> Doctor Visits
                            </p>
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {record.doctorvisit.map((dv, i) => (
                                <li key={i}>
                                  {dv.doctorName} on {formatDateTime(dv.dateTime)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      {record.investigationsheet && record.investigationsheet.length > 0 && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <Syringe className="h-4 w-4 text-red-600" /> Investigations
                            </p>
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {record.investigationsheet.map((inv, i) => (
                                <li key={i}>
                                  <strong>{inv.testName}:</strong>{" "}
                                  {inv.entries.map((e, j) => (
                                    <span key={j}>
                                      {e.value} ({e.type}) on {formatDateTime(e.dateTime)}
                                      {j < inv.entries.length - 1 ? "; " : ""}
                                    </span>
                                  ))}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      {record.progressNotes && record.progressNotes.length > 0 && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <NotebookPen className="h-4 w-4 text-orange-600" /> Progress Notes
                            </p>
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {record.progressNotes.map((pn, i) => (
                                <li key={i}>
                                  {pn.note} (Entered by: {pn.enteredBy}) on {formatDateTime(pn.timestamp)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      {record.vitalobservation && record.vitalobservation.length > 0 && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <HeartPulse className="h-4 w-4 text-pink-600" /> Vital Observations
                            </p>
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {record.vitalobservation.map((vo, i) => (
                                <li key={i}>
                                  BP: {vo.bloodPressure || "N/A"}, Pulse: {vo.pulse || "N/A"}, Temp:{" "}
                                  {vo.temperature || "N/A"} on {formatDateTime(vo.dateTime)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      {record.dischargesummery && (
                        <>
                          <Separator />
                          <div className="grid gap-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <ScrollText className="h-4 w-4 text-teal-600" /> Discharge Summary
                            </p>
                            <p className="text-xs">
                              Last Updated: {formatDateTime(record.dischargesummery.lastUpdated)}
                            </p>
                          </div>
                        </>
                      )}
                    </CardContent>

                    <Separator />

                    <CardFooter className="flex flex-wrap gap-2 py-3">
                      <Link href={`/manage/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-transparent">
                          <Clipboard className="h-3.5 w-3.5" /> Manage
                        </Button>
                      </Link>
                      <Link href={`/drugchart/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-transparent">
                          <Pills className="h-3.5 w-3.5" /> Drugs
                        </Button>
                      </Link>
                      <Link href={`/billing/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-transparent">
                          <CreditCard className="h-3.5 w-3.5" /> Billing
                        </Button>
                      </Link>
                      <Link href={`/discharge-summary/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-transparent">
                          <FileCheck className="h-3.5 w-3.5" /> Discharge
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* OT Records */}
          <TabsContent value="ot" className="space-y-6">
            {otRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No OT Records</h3>
                  <p className="text-slate-500">This patient has no OT procedure records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otRecords.map((record) => (
                  <Card
                    key={record.id}
                    className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500 cursor-pointer"
                    onClick={() => router.push(`/ot/${id}/${record.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">OT Procedure</CardTitle>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          OT
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(record.date)}</span>
                        {record.time && (
                          <>
                            <Clock className="h-3.5 w-3.5 ml-2" />
                            <span>{record.time}</span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3 text-sm">
                      {record.message && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-slate-500 mt-1" />
                          <span>
                            <strong>Notes:</strong> {record.message}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-500" />
                        <span>
                          <strong>Created:</strong> {formatDateTime(record.createdAt)}
                        </span>
                      </div>
                      {record.updatedAt && record.updatedAt !== record.createdAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          <span>
                            <strong>Updated:</strong> {formatDateTime(record.updatedAt)}
                          </span>
                        </div>
                      )}
                    </CardContent>

                    <Separator />

                    <CardFooter className="flex justify-end py-3">
                      <Button variant="outline" size="sm" className="flex items-center gap-1 bg-transparent">
                        View Details
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
