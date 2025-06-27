"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { ref, onValue, update, push, set, get } from "firebase/database" // Added 'get'
import { db, auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import Select from "react-select"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { toast } from "react-toastify"
import { format } from "date-fns"
import { User, Phone, Clock, Home, Users, Calendar, Bed, UserCheck, Check, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

/* ---------------------------
   Types & Options
--------------------------- */
export interface IPDFormInput {
  // Patient Basic Info
  name: string
  phone: string
  gender: { label: string; value: string } | null
  age: number
  address?: string

  // Relative
  relativeName: string
  relativePhone: string
  relativeAddress?: string

  // IPD Specifics
  date: Date
  time: string
  admissionSource: { label: string; value: string } | null
  admissionType: { label: string; value: string } | null
  roomType: { label: string; value: string } | null
  bed: { label: string; value: string } | null
  doctor: { label: string; value: string } | null
  referDoctor?: string

  // Billing
  deposit?: number
  paymentMode: { label: string; value: string } | null
}

interface PatientRecord {
  name: string
  phone: string
  gender: string
  age: number
  address: string
}

interface IPDRecord {
  uhid: string
  relativeName: string
  relativePhone: string
  relativeAddress: string
  admissionDate: string
  admissionTime: string
  admissionSource: string
  admissionType: string
  roomType: string
  bed: string
  doctor: string
  referDoctor: string
  createdAt: string
  status: string
  updatedAt?: string
  lastModifiedBy?: string
}

interface BillingRecord {
  totalDeposit: number
}

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

const AdmissionTypeOptions = [
  { value: "general", label: "General" },
  { value: "surgery", label: "Surgery" },
  { value: "accident_emergency", label: "Accident/Emergency" },
  { value: "day_observation", label: "Day Observation" },
]

const AdmissionSourceOptions = [
  { value: "opd", label: "OPD" },
  { value: "casualty", label: "Casualty" },
  { value: "referral", label: "Referral" },
  { value: "ipd", label: "IPD" }, // ADDED: 'ipd' option
]

const RoomTypeOptions = [
  { value: "casualty", label: "Casualty" },
  { value: "citrine", label: "Citrine" },
  { value: "jade", label: "Jade" },
  { value: "female", label: "Female Ward" },
  { value: "icu", label: "ICU" },
  { value: "male", label: "Male Ward" },
]

const PaymentModeOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
]

function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours || 12
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

// Custom styles for react-select
const selectStyles = {
  control: (provided: any, state: any) => ({
    ...provided,
    borderColor: state.isFocused ? "#6366f1" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 1px #6366f1" : "none",
    "&:hover": {
      borderColor: "#6366f1",
    },
    borderRadius: "0.375rem",
    padding: "2px",
    backgroundColor: "white",
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected ? "#6366f1" : state.isFocused ? "#e0e7ff" : "white",
    color: state.isSelected ? "white" : "#1f2937",
    cursor: "pointer",
  }),
}

// Custom styles for date picker
const datePickerWrapperStyles = {
  input:
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
}

/* ---------------------------
   Edit IPD Record Component
--------------------------- */
export default function EditIPDPage() {
  const {
    patienteditId,
    ipdeditId,
    admissionDate: admissionDateParam,
  } = useParams() as { patienteditId: string; ipdeditId: string; admissionDate: string }
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([])
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([])
  const [showBedsPopup, setShowBedsPopup] = useState(false)
  const [allBeds, setAllBeds] = useState<any[]>([])
  const [originalPatient, setOriginalPatient] = useState<PatientRecord | null>(null)
  const [originalIPD, setOriginalIPD] = useState<IPDRecord | null>(null)
  const [originalBilling, setOriginalBilling] = useState<BillingRecord | null>(null)
  const [oldBedInfo, setOldBedInfo] = useState<{ roomType: string; bedId: string } | null>(null)

  // State to hold the raw roomType and bedId from the fetched IPD record
  const [fetchedRoomType, setFetchedRoomType] = useState<string | null>(null)
  const [fetchedBedId, setFetchedBedId] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IPDFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      gender: null,
      age: 0,
      address: "",
      relativeName: "",
      relativePhone: "",
      relativeAddress: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      admissionSource: null,
      admissionType: null,
      roomType: null,
      bed: null,
      doctor: null,
      referDoctor: "",
      deposit: 0,
      paymentMode: PaymentModeOptions[0],
    },
  })

  // Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCurrentUserEmail(user.email)
      } else {
        setCurrentUserEmail(null)
      }
    })
    return () => unsubscribe()
  }, [])

  /* ---------------------------
     Fetch Doctors
  --------------------------- */
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      if (!snapshot.exists()) return
      const data = snapshot.val()
      const docsList = Object.keys(data)
        .filter((key) => {
          const dept = String(data[key].department || "").toLowerCase()
          return dept === "ipd" || dept === "both"
        })
        .map((key) => ({ label: data[key].name, value: key }))
      setDoctors(docsList)
    })
    return () => unsubscribe()
  }, [])

  /* ---------------------------
     Fetch Patient Basic Info
  --------------------------- */
  useEffect(() => {
    if (!patienteditId) return
    const patientRef = ref(db, `patients/patientinfo/${patienteditId}`)
    const unsubscribe = onValue(patientRef, (snapshot) => {
      if (!snapshot.exists()) {
        toast.error("Patient not found.")
        return
      }
      const data = snapshot.val() as PatientRecord
      setOriginalPatient(data)
      setValue("name", data.name)
      setValue("phone", data.phone)
      const genderMatch = GenderOptions.find((g) => g.value.toLowerCase() === data.gender?.toLowerCase())
      setValue("gender", genderMatch || null)
      setValue("age", data.age)
      setValue("address", data.address)
    })
    return () => unsubscribe()
  }, [patienteditId, setValue])

  /* ---------------------------
     Fetch Existing IPD Record Data
  --------------------------- */
  useEffect(() => {
    if (!patienteditId || !ipdeditId || !admissionDateParam) return
    const ipdRef = ref(db, `patients/ipddetail/userinfoipd/${admissionDateParam}/${patienteditId}/${ipdeditId}`)
    const unsubscribe = onValue(ipdRef, (snapshot) => {
      if (!snapshot.exists()) {
        toast.error("IPD record not found.")
        return
      }
      const data = snapshot.val() as IPDRecord
      setOriginalIPD(data)

      // Set form fields from IPD record
      setValue("relativeName", data.relativeName)
      setValue("relativePhone", data.relativePhone)
      setValue("relativeAddress", data.relativeAddress)
      setValue("date", new Date(data.admissionDate)) // Use data.admissionDate for date object
      setValue("time", data.admissionTime)

      // Set fetched roomType and bedId to state for later use
      setFetchedRoomType(data.roomType)
      setFetchedBedId(data.bed)

      const srcMatch = AdmissionSourceOptions.find((s) => s.value === data.admissionSource)
      setValue("admissionSource", srcMatch || null)
      const typeMatch = AdmissionTypeOptions.find((a) => a.value === data.admissionType)
      setValue("admissionType", typeMatch || null)
      const roomMatch = RoomTypeOptions.find((r) => r.value === data.roomType)
      setValue("roomType", roomMatch || null) // This will trigger bed fetching
      setOldBedInfo(data.bed ? { roomType: data.roomType, bedId: data.bed } : null)

      const docMatch = doctors.find((d) => d.value === data.doctor)
      setValue("doctor", docMatch || null)
      setValue("referDoctor", data.referDoctor)
    })
    return () => unsubscribe()
  }, [patienteditId, ipdeditId, setValue, doctors, admissionDateParam])

  /* ---------------------------
     Fetch Existing Billing Data
  --------------------------- */
  useEffect(() => {
    if (!patienteditId || !ipdeditId || !admissionDateParam) return
    const billingRef = ref(
      db,
      `patients/ipddetail/userbillinginfoipd/${admissionDateParam}/${patienteditId}/${ipdeditId}`,
    )
    const unsubscribe = onValue(billingRef, (snapshot) => {
      if (!snapshot.exists()) {
        setOriginalBilling({ totalDeposit: 0 })
        setValue("deposit", 0)
        setValue("paymentMode", PaymentModeOptions[0])
        return
      }
      const data = snapshot.val() as BillingRecord
      setOriginalBilling(data)
      setValue("deposit", data.totalDeposit || 0)
      // Payment mode inference: default to cash if none
      setValue("paymentMode", PaymentModeOptions[0])
    })
    return () => unsubscribe()
  }, [patienteditId, ipdeditId, setValue, admissionDateParam])

  /* ---------------------------
     Fetch Beds Based on Selected Room Type
     AND set the initial bed value once beds are loaded
  --------------------------- */
  const selectedRoomType = watch("roomType")
  useEffect(() => {
    if (!selectedRoomType?.value) {
      setBeds([])
      setValue("bed", null)
      return
    }
    const bedsRef = ref(db, `beds/${selectedRoomType.value}`)
    const unsubscribe = onValue(bedsRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setBeds([])
        setValue("bed", null)
        return
      }
      const data = snapshot.val()
      const bedList = Object.keys(data)
        // Allow available beds or the one already assigned
        .filter((k) => {
          const status = data[k].status
          return status === "Available" || (oldBedInfo && k === oldBedInfo.bedId)
        })
        .map((k) => ({
          label: `Bed ${data[k].bedNumber}`,
          value: k,
        }))
      setBeds(bedList)

      // Set the bed value if fetchedRoomType and fetchedBedId match the current roomType
      if (fetchedRoomType === selectedRoomType.value && fetchedBedId) {
        const currentBedData = await get(ref(db, `beds/${fetchedRoomType}/${fetchedBedId}`))
        if (currentBedData.exists()) {
          const bedNumber = currentBedData.val().bedNumber
          setValue("bed", { label: `Bed ${bedNumber}`, value: fetchedBedId })
        }
      } else {
        // If room type changed or no bed was fetched, clear the bed selection
        setValue("bed", null)
      }
    })
    return () => unsubscribe()
  }, [selectedRoomType, setValue, oldBedInfo, fetchedRoomType, fetchedBedId]) // Added fetchedRoomType, fetchedBedId

  /* ---------------------------
     Beds Popup – List all beds in the selected room type
  --------------------------- */
  useEffect(() => {
    if (!selectedRoomType?.value) return
    const bedsRef = ref(db, `beds/${selectedRoomType.value}`)
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        const list = Object.keys(data).map((k) => ({
          id: k,
          bedNumber: data[k].bedNumber,
          status: data[k].status,
        }))
        setAllBeds(list)
      } else {
        setAllBeds([])
      }
    })
    return () => unsubscribe()
  }, [selectedRoomType])

  const toggleBedsPopup = () => {
    setShowBedsPopup(!showBedsPopup)
  }

  // Function to detect changes between original and new data
  const detectChanges = (origP: PatientRecord, origI: IPDRecord, origB: BillingRecord, upd: IPDFormInput) => {
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = []

    // Patient fields
    if (String(origP.name || "") !== String(upd.name || "")) {
      changes.push({ field: "name", oldValue: origP.name, newValue: upd.name })
    }
    if (String(origP.phone || "") !== String(upd.phone || "")) {
      changes.push({ field: "phone", oldValue: origP.phone, newValue: upd.phone })
    }
    if (String(origP.gender || "") !== String(upd.gender?.value || "")) {
      changes.push({ field: "gender", oldValue: origP.gender, newValue: upd.gender?.value })
    }
    if (String(origP.age || "") !== String(upd.age || "")) {
      changes.push({ field: "age", oldValue: origP.age, newValue: upd.age })
    }
    if (String(origP.address || "") !== String(upd.address || "")) {
      changes.push({ field: "address", oldValue: origP.address, newValue: upd.address || "" })
    }

    // IPD fields
    const toISO = (date: Date) => date.toISOString()
    if (String(origI.relativeName || "") !== String(upd.relativeName || "")) {
      changes.push({ field: "relativeName", oldValue: origI.relativeName, newValue: upd.relativeName })
    }
    if (String(origI.relativePhone || "") !== String(upd.relativePhone || "")) {
      changes.push({ field: "relativePhone", oldValue: origI.relativePhone, newValue: upd.relativePhone })
    }
    if (String(origI.relativeAddress || "") !== String(upd.relativeAddress || "")) {
      changes.push({
        field: "relativeAddress",
        oldValue: origI.relativeAddress,
        newValue: upd.relativeAddress || "",
      })
    }
    // Compare formatted dates for admissionDate
    if (format(new Date(origI.admissionDate), "yyyy-MM-dd") !== format(upd.date, "yyyy-MM-dd")) {
      changes.push({ field: "admissionDate", oldValue: origI.admissionDate, newValue: format(upd.date, "yyyy-MM-dd") })
    }
    if (String(origI.admissionTime || "") !== String(upd.time || "")) {
      changes.push({ field: "admissionTime", oldValue: origI.admissionTime, newValue: upd.time })
    }
    if (String(origI.admissionSource || "") !== String(upd.admissionSource?.value || "")) {
      changes.push({
        field: "admissionSource",
        oldValue: origI.admissionSource,
        newValue: upd.admissionSource?.value,
      })
    }
    if (String(origI.admissionType || "") !== String(upd.admissionType?.value || "")) {
      changes.push({
        field: "admissionType",
        oldValue: origI.admissionType,
        newValue: upd.admissionType?.value,
      })
    }
    if (String(origI.roomType || "") !== String(upd.roomType?.value || "")) {
      changes.push({ field: "roomType", oldValue: origI.roomType, newValue: upd.roomType?.value })
    }
    if (String(origI.bed || "") !== String(upd.bed?.value || "")) {
      changes.push({ field: "bed", oldValue: origI.bed, newValue: upd.bed?.value })
    }
    if (String(origI.doctor || "") !== String(upd.doctor?.value || "")) {
      changes.push({ field: "doctor", oldValue: origI.doctor, newValue: upd.doctor?.value })
    }
    if (String(origI.referDoctor || "") !== String(upd.referDoctor || "")) {
      changes.push({ field: "referDoctor", oldValue: origI.referDoctor, newValue: upd.referDoctor || "" })
    }

    // Billing fields
    if (String(origB.totalDeposit || "") !== String(upd.deposit || 0)) {
      changes.push({
        field: "deposit",
        oldValue: origB.totalDeposit,
        newValue: upd.deposit || 0,
      })
    }

    return changes
  }

  /* ---------------------------
     Form Submission
  --------------------------- */
  const onSubmit = async (data: IPDFormInput) => {
    if (!originalPatient || !originalIPD || !originalBilling) {
      toast.error("Original data not fully loaded")
      return
    }

    setLoading(true)
    try {
      // Detect changes
      const changes = detectChanges(originalPatient, originalIPD, originalBilling, data)

      if (changes.length === 0) {
        toast.info("No changes detected")
        setLoading(false)
        return
      }

      // 1) Update patientinfo if basic info changed
      const patientUpdates: any = {}
      if (String(originalPatient.name) !== String(data.name)) patientUpdates.name = data.name
      if (String(originalPatient.phone) !== String(data.phone)) patientUpdates.phone = data.phone
      if (String(originalPatient.gender) !== String(data.gender?.value || "")) {
        patientUpdates.gender = data.gender?.value || ""
      }
      if (String(originalPatient.age) !== String(data.age)) patientUpdates.age = data.age
      if (String(originalPatient.address) !== String(data.address || "")) {
        patientUpdates.address = data.address || ""
      }
      if (Object.keys(patientUpdates).length > 0) {
        patientUpdates.updatedAt = new Date().toISOString()
        await update(ref(db, `patients/patientinfo/${patienteditId}`), patientUpdates)
      }

      // 2) Handle bed status changes
      if (oldBedInfo && data.roomType?.value && data.bed?.value && data.bed.value !== oldBedInfo.bedId) {
        const oldBedRef = ref(db, `beds/${oldBedInfo.roomType}/${oldBedInfo.bedId}`)
        await update(oldBedRef, { status: "Available" })
        const newBedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`)
        await update(newBedRef, { status: "Occupied" })
      } else if (!oldBedInfo && data.roomType?.value && data.bed?.value) {
        const newBedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`)
        await update(newBedRef, { status: "Occupied" })
      }

      // 3) Update IPD record
      const ipdData: any = {
        relativeName: data.relativeName,
        relativePhone: data.relativePhone,
        relativeAddress: data.relativeAddress || "",
        admissionDate: format(data.date, "yyyy-MM-dd"), // Update the field, but the record's path remains fixed by admissionDateParam
        admissionTime: data.time,
        admissionSource: data.admissionSource?.value || "",
        admissionType: data.admissionType?.value || "",
        roomType: data.roomType?.value || "",
        bed: data.bed?.value || "",
        doctor: data.doctor?.value || "",
        referDoctor: data.referDoctor || "",
        updatedAt: new Date().toISOString(),
        lastModifiedBy: currentUserEmail || "unknown",
      }
      await update(
        ref(db, `patients/ipddetail/userinfoipd/${admissionDateParam}/${patienteditId}/${ipdeditId}`), // Use admissionDateParam from URL
        ipdData,
      )

      // 4) Update billing if deposit changed
      const prevDeposit = originalBilling.totalDeposit || 0
      const newDeposit = data.deposit || 0
      if (String(prevDeposit) !== String(newDeposit)) {
        // Update totalDeposit
        await update(
          ref(db, `patients/ipddetail/userbillinginfoipd/${admissionDateParam}/${patienteditId}/${ipdeditId}`), // Use admissionDateParam from URL
          { totalDeposit: newDeposit },
        )
        // Add a new payment entry
        const paymentRef = push(
          ref(db, `patients/ipddetail/userbillinginfoipd/${admissionDateParam}/${patienteditId}/${ipdeditId}/payments`), // Use admissionDateParam from URL
        )
        await update(paymentRef, {
          amount: newDeposit - prevDeposit,
          date: new Date().toISOString(),
          paymentType: data.paymentMode?.value || "",
          type: "deposit",
          createdAt: new Date().toISOString(),
        })
      }

      // 5) Save change tracking
      const changesRef = ref(db, "ipdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "edit",
        ipdId: ipdeditId,
        patientId: patienteditId,
        admissionDate: admissionDateParam, // Add admissionDate to log for context
        patientName: data.name,
        changes,
        editedBy: currentUserEmail || "unknown",
        editedAt: new Date().toISOString(),
      })

      toast.success("IPD record updated successfully!")
      router.push("/billing")
    } catch (err) {
      console.error("Error updating record:", err)
      toast.error("Error updating IPD record.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <Card className="max-w-4xl mx-auto shadow-lg border-slate-200">
        <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <User className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Edit IPD Record</CardTitle>
              <CardDescription className="text-indigo-100 mt-1">
                Update patient admission and billing information
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Patient Information Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Patient Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Patient Name <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      {...register("name", { required: true })}
                      className="pl-9"
                      placeholder="Full name"
                    />
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                  {errors.name && <p className="text-xs text-red-500">Name is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="phone"
                      {...register("phone", { required: true })}
                      className="pl-9"
                      placeholder="Contact number"
                    />
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500">Phone is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender" className="text-sm font-medium">
                    Gender <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name="gender"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={GenderOptions}
                        placeholder="Select Gender"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                      />
                    )}
                  />
                  {errors.gender && <p className="text-xs text-red-500">Gender is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age" className="text-sm font-medium">
                    Age <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="age"
                    type="number"
                    {...register("age", { required: true, min: 0 })}
                    placeholder="Patient age"
                  />
                  {errors.age && <p className="text-xs text-red-500">Valid age is required</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address" className="text-sm font-medium">
                    Address
                  </Label>
                  <div className="relative">
                    <Input id="address" {...register("address")} className="pl-9" placeholder="Patient address" />
                    <Home className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Relative Information Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Relative Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="relativeName" className="text-sm font-medium">
                    Relative Name <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="relativeName"
                      {...register("relativeName", { required: true })}
                      className="pl-9"
                      placeholder="Relative's full name"
                    />
                    <Users className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                  {errors.relativeName && <p className="text-xs text-red-500">Relative name is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="relativePhone" className="text-sm font-medium">
                    Relative Phone <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="relativePhone"
                      {...register("relativePhone", { required: true })}
                      className="pl-9"
                      placeholder="Relative's contact number"
                    />
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                  {errors.relativePhone && <p className="text-xs text-red-500">Relative phone is required</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="relativeAddress" className="text-sm font-medium">
                    Relative Address
                  </Label>
                  <Input id="relativeAddress" {...register("relativeAddress")} placeholder="Relative's address" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Admission Details Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Admission Details</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm font-medium">
                    Admission Date <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Controller
                      control={control}
                      name="date"
                      rules={{ required: true }}
                      render={({ field }) => (
                        <div className="relative">
                          <DatePicker
                            selected={field.value}
                            onChange={(date) => date && field.onChange(date)}
                            dateFormat="dd/MM/yyyy"
                            className={datePickerWrapperStyles.input}
                            wrapperClassName="w-full"
                          />
                          <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                        </div>
                      )}
                    />
                  </div>
                  {errors.date && <p className="text-xs text-red-500">Date is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-medium">
                    Admission Time <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="time"
                      {...register("time", { required: true })}
                      className="pl-9"
                      placeholder="HH:MM AM/PM"
                    />
                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                  {errors.time && <p className="text-xs text-red-500">Time is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admissionSource" className="text-sm font-medium">
                    Admission Source <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name="admissionSource"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={AdmissionSourceOptions}
                        placeholder="Select Source"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                      />
                    )}
                  />
                  {errors.admissionSource && <p className="text-xs text-red-500">Source is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admissionType" className="text-sm font-medium">
                    Admission Type <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name="admissionType"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={AdmissionTypeOptions}
                        placeholder="Select Type"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                      />
                    )}
                  />
                  {errors.admissionType && <p className="text-xs text-red-500">Type is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roomType" className="text-sm font-medium">
                    Room Type <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name="roomType"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={RoomTypeOptions}
                        placeholder="Select Room"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                        onChange={(val) => {
                          field.onChange(val)
                          setValue("bed", null) // Clear bed when room type changes
                        }}
                      />
                    )}
                  />
                  {errors.roomType && <p className="text-xs text-red-500">Room is required</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bed" className="text-sm font-medium">
                      Bed <span className="text-red-500">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={toggleBedsPopup}
                      disabled={!selectedRoomType}
                      className="h-8 px-2 text-indigo-600 text-xs hover:text-indigo-700 hover:bg-indigo-50"
                    >
                      <Bed className="h-3 w-3 mr-1" />
                      View All Beds
                    </Button>
                  </div>
                  <Controller
                    control={control}
                    name="bed"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={beds}
                        placeholder={beds.length ? "Select Bed" : "No Beds Available"}
                        styles={selectStyles}
                        classNamePrefix="react-select"
                        isDisabled={!selectedRoomType}
                      />
                    )}
                  />
                  {errors.bed && <p className="text-xs text-red-500">Bed is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doctor" className="text-sm font-medium">
                    Under Care of Doctor <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name="doctor"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={doctors}
                        placeholder="Select Doctor"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                      />
                    )}
                  />
                  {errors.doctor && <p className="text-xs text-red-500">Doctor is required</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referDoctor" className="text-sm font-medium">
                    Referral Doctor
                  </Label>
                  <div className="relative">
                    <Input
                      id="referDoctor"
                      {...register("referDoctor")}
                      className="pl-9"
                      placeholder="Referring doctor (if any)"
                    />
                    <UserCheck className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Billing Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-amber-100 text-amber-800">Billing</Badge>
                <h2 className="text-lg font-semibold text-slate-800">Deposit & Payment Mode</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="deposit" className="text-sm font-medium">
                    Deposit Amount
                  </Label>
                  <div className="relative">
                    <span className="absolute top-3 left-3 text-gray-400">₹</span>
                    <input
                      id="deposit"
                      type="number"
                      {...register("deposit", { min: { value: 0, message: "Deposit must be ≥ 0" } })}
                      placeholder="Enter deposit amount"
                      className={`w-full pl-8 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.deposit ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                  </div>
                  {errors.deposit && <p className="text-xs text-red-500">{errors.deposit.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMode" className="text-sm font-medium">
                    Payment Mode
                  </Label>
                  <Controller
                    name="paymentMode"
                    control={control}
                    rules={{ required: "Payment mode is required" }}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={PaymentModeOptions}
                        placeholder="Select Mode"
                        styles={selectStyles}
                        classNamePrefix="react-select"
                      />
                    )}
                  />
                  {errors.paymentMode && <p className="text-xs text-red-500">{errors.paymentMode.message}</p>}
                </div>
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-4 justify-end bg-slate-50 p-6 border-t rounded-b-lg">
          <Button variant="outline" onClick={() => router.push("/billing")} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={loading}
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Updating...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Update Record
              </span>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Beds Dialog */}
      <Dialog open={showBedsPopup} onOpenChange={setShowBedsPopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Bed className="h-5 w-5" />
              Beds in {selectedRoomType?.label || "Selected Room"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto">
            {allBeds.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Bed Number</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allBeds.map((bed) => (
                      <tr key={bed.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">Bed {bed.bedNumber}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={bed.status === "Available" ? "default" : "secondary"}
                            className={`${
                              bed.status === "Available" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {bed.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-10 w-10 text-slate-300 mb-2" />
                <p className="text-slate-500">No beds available in this room type</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={toggleBedsPopup} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
