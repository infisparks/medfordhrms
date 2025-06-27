"use client"

import { useState, useEffect, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { db, auth } from "../../lib/firebase"
import { ref, push, update, get, onValue, set, remove } from "firebase/database"
import Head from "next/head"
import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  CheckCircle,
  HelpCircle,
  Trash2,
  AlertTriangle,
  Activity,
  Heart,
  Thermometer,
  Stethoscope,
  Shield,
  Ambulance,
  UserCheck,
  Hospital,
} from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import Joyride, { type CallBackProps, STATUS } from "react-joyride"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import type React from "react"
import { PersonIcon, CalendarIcon, MagnifyingGlassIcon, Cross2Icon } from "@radix-ui/react-icons"
import { onAuthStateChanged } from "firebase/auth"

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  --------------------------- */
interface ICasualtyFormInput {
  name: string
  phone: string
  age: number
  gender: string
  dob: Date | null
  address?: string
  date: Date
  time: string
  message?: string
  modeOfArrival: "ambulance" | "walkin" | "referred"
  broughtBy?: string
  referralHospital?: string
  broughtDead: boolean
  caseType: "rta" | "physicalAssault" | "burn" | "poisoning" | "snakeBite" | "cardiac" | "fall" | "other"
  otherCaseType?: string
  incidentDescription?: string
  isMLC: boolean
  mlcNumber?: string
  policeInformed: boolean
  attendingDoctor?: string
  triageCategory: "red" | "yellow" | "green" | "black"
  vitalSigns: {
    bloodPressure?: string
    pulse?: number
    temperature?: number
    oxygenSaturation?: number
    respiratoryRate?: number
    gcs?: number
  }
}

interface PatientRecord {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  address?: string
  createdAt?: string
  uhid?: string
}

interface Doctor {
  id: string
  name: string
  specialty?: string
}

interface CasualtyRecord {
  id: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  caseType: string
  triageCategory: string
  modeOfArrival: string
  createdAt: string
}

const ModeOfArrivalOptions = [
  { value: "ambulance", label: "Ambulance", icon: Ambulance },
  { value: "walkin", label: "Walk-in", icon: UserCheck },
  { value: "referred", label: "Referred", icon: Hospital },
]

const CaseTypeOptions = [
  { value: "rta", label: "Road Traffic Accident (RTA)" },
  { value: "physicalAssault", label: "Physical Assault" },
  { value: "burn", label: "Burn" },
  { value: "poisoning", label: "Poisoning" },
  { value: "snakeBite", label: "Snake Bite" },
  { value: "cardiac", label: "Cardiac Emergency" },
  { value: "fall", label: "Fall" },
  { value: "other", label: "Other" },
]

const TriageCategoryOptions = [
  { value: "red", label: "Red (Critical)", color: "bg-red-500" },
  { value: "yellow", label: "Yellow (Urgent)", color: "bg-yellow-500" },
  { value: "green", label: "Green (Less Urgent)", color: "bg-green-500" },
  { value: "black", label: "Black (Deceased)", color: "bg-gray-800" },
]

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

/**
 * Utility function: Format a Date to 12-hour time with AM/PM
 */
function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

/** Helper function to generate a 10-character alphanumeric UHID */
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** ---------------
 *    MAIN COMPONENT
 *  --------------- */
const CasualtyBookingPage: React.FC = () => {
  const router = useRouter()
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

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

  // Form state using React Hook Form
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
    setValue,
    trigger,
    getValues,
  } = useForm<ICasualtyFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: 0,
      gender: "",
      dob: null,
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      modeOfArrival: "walkin",
      broughtBy: "",
      referralHospital: "",
      broughtDead: false,
      caseType: "other",
      otherCaseType: "",
      incidentDescription: "",
      isMLC: false,
      mlcNumber: "",
      policeInformed: false,
      attendingDoctor: "",
      triageCategory: "green",
      vitalSigns: {
        bloodPressure: "",
        pulse: undefined,
        temperature: undefined,
        oxygenSaturation: undefined,
        respiratoryRate: undefined,
        gcs: undefined,
      },
    },
    mode: "onChange",
  })

  // UI states
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("form")
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null)

  // Patient management
  const [patientSuggestions, setPatientSuggestions] = useState<PatientRecord[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [phoneSuggestions, setPhoneSuggestions] = useState<PatientRecord[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<PatientRecord[]>([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false)

  // Casualty records
  const [casualtyRecords, setCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [filteredCasualtyRecords, setFilteredCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  // Refs
  const phoneSuggestionBoxRef = useRef<HTMLDivElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)
  const ageInputRef = useRef<HTMLInputElement | null>(null)
  const nameSuggestionBoxRef = useRef<HTMLDivElement | null>(null)

  // Joyride (guided tour)
  const [runTour, setRunTour] = useState(false)
  const tourSteps = [
    {
      target: '[data-tour="patient-name"]',
      content: "Enter the patient name here or search for existing patients.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="phone"]',
      content: "Enter a valid 10-digit phone number here. You can also search by number.",
    },
    {
      target: '[data-tour="age"]',
      content: "Specify the patient's age.",
    },
    {
      target: '[data-tour="gender"]',
      content: "Select the patient's gender.",
    },
    {
      target: '[data-tour="dob"]',
      content: "Select the patient's date of birth.",
    },
    {
      target: '[data-tour="mode-of-arrival"]',
      content: "Select how the patient arrived at the hospital.",
    },
    {
      target: '[data-tour="case-type"]',
      content: "Select the type of emergency case.",
    },
    {
      target: '[data-tour="triage-category"]',
      content: "Assign the appropriate triage category based on urgency.",
    },
    {
      target: '[data-tour="vital-signs"]',
      content: "Record the patient's vital signs for medical assessment.",
    },
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false)
    }
  }

  // Watchers
  const watchedName = watch("name")
  const watchedPhone = watch("phone")
  const watchedCaseType = watch("caseType")
  const watchedModeOfArrival = watch("modeOfArrival")
  const watchedIsMLC = watch("isMLC")

  /** ----------------
   *   FETCH DOCTORS
   *  ---------------- */
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const doctorsList: Doctor[] = Object.keys(data).map((key) => ({
          id: key,
          name: data[key].name,
          specialty: data[key].specialty || "",
        }))
        setDoctors(doctorsList)
      } else {
        setDoctors([])
      }
    })
    return () => unsubscribe()
  }, [])

  /** -------------------------------
   *  FETCH PATIENTS FROM GAUTAMI DB ONLY
   *  ------------------------------- */
  useEffect(() => {
    const patientsRef = ref(db, "patients/patientinfo")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: PatientRecord[] = []
      if (data) {
        for (const key in data) {
          loaded.push({
            ...data[key],
            id: key,
          })
        }
      }
      setGautamiPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // Casualty records
  useEffect(() => {
    const casualtyRef = ref(db, "patients/casualtydetail")
    const unsubscribe = onValue(casualtyRef, (snapshot) => {
      const data = snapshot.val()
      const records: CasualtyRecord[] = []
      if (data) {
        // Iterate through patient UHIDs
        Object.keys(data).forEach((uhid) => {
          const patientCasualties = data[uhid]
          if (patientCasualties) {
            Object.keys(patientCasualties).forEach((recordId) => {
              records.push({
                id: recordId,
                ...patientCasualties[recordId],
              })
            })
          }
        })
        // Sort descending by createdAt
        records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }
      setCasualtyRecords(records)
      setFilteredCasualtyRecords(records)
    })
    return () => unsubscribe()
  }, [])

  // Filter casualty records when searchQuery changes
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredCasualtyRecords(casualtyRecords)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = casualtyRecords.filter(
        (record) =>
          record.name.toLowerCase().includes(query) ||
          record.phone.includes(query) ||
          record.caseType.toLowerCase().includes(query),
      )
      setFilteredCasualtyRecords(filtered)
    }
  }, [searchQuery, casualtyRecords])

  // Name suggestions when watchedName changes
  useEffect(() => {
    if (watchedName && watchedName.length >= 2) {
      if (selectedPatient && watchedName === selectedPatient.name) {
        setPatientSuggestions([])
        setShowNameSuggestions(false)
      } else {
        const lower = watchedName.toLowerCase()
        const suggestions = gautamiPatients.filter((p) => p.name.toLowerCase().includes(lower))
        setPatientSuggestions(suggestions)
        setShowNameSuggestions(suggestions.length > 0)
      }
    } else {
      setPatientSuggestions([])
      setShowNameSuggestions(false)
    }
  }, [watchedName, gautamiPatients, selectedPatient])

  // Phone suggestions when watchedPhone changes
  useEffect(() => {
    if (watchedPhone && watchedPhone.length >= 2) {
      if (selectedPatient && watchedPhone === selectedPatient.phone) {
        setPhoneSuggestions([])
        setShowPhoneSuggestions(false)
      } else {
        const suggestions = gautamiPatients.filter((p) => p.phone && p.phone.includes(watchedPhone))
        setPhoneSuggestions(suggestions)
        setShowPhoneSuggestions(suggestions.length > 0)
      }
    } else {
      setPhoneSuggestions([])
      setShowPhoneSuggestions(false)
    }
  }, [watchedPhone, gautamiPatients, selectedPatient])

  /** -------------------------------------------
   *  SELECT PATIENT FROM DROPDOWN, AUTO‐FILL FORM
   *  ------------------------------------------- */
  const handlePatientSuggestionClick = (patient: PatientRecord) => {
    setSelectedPatient(patient)

    // Fill in the form fields
    setValue("name", patient.name, { shouldValidate: true })
    setValue("phone", patient.phone || "", { shouldValidate: true })
    setValue("address", patient.address || "", { shouldValidate: true })
    setValue("age", patient.age || 0, { shouldValidate: true })
    setValue("gender", patient.gender || "", { shouldValidate: true })

    // Hide suggestions
    setPatientSuggestions([])
    setPhoneSuggestions([])
    setShowNameSuggestions(false)
    setShowPhoneSuggestions(false)

    toast.info(`Patient ${patient.name} selected!`)
  }

  // Handlers for manual name/phone typing
  const handleNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setValue("name", value, { shouldValidate: true })
    setSelectedPatient(null)
  }

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setValue("phone", value, { shouldValidate: true })
    setSelectedPatient(null)
  }

  /**
   * ----------------------------------------------------------------------
   *  VALIDATION & SUBMISSION LOGIC
   * ----------------------------------------------------------------------
   */
  const validateAndSubmit = async (data: ICasualtyFormInput) => {
    // Required fields
    const requiredFields = [
      "name",
      "phone",
      "age",
      "gender",
      "date",
      "time",
      "modeOfArrival",
      "caseType",
      "triageCategory",
    ]

    // Validate
    const isValid = await trigger(requiredFields as any)
    if (!isValid) {
      // Focus the first error field and show toast
      if (errors.name) {
        nameInputRef.current?.focus()
        toast.error("Please enter patient name")
        return
      }
      if (errors.phone) {
        phoneInputRef.current?.focus()
        toast.error("Please enter a valid phone number")
        return
      }
      if (errors.age) {
        ageInputRef.current?.focus()
        toast.error("Please enter patient age")
        return
      }
      if (errors.gender) {
        toast.error("Please select patient gender")
        return
      }
      toast.error("Please fill all required fields")
      return
    }

    // All good → call actual onSubmit
    onSubmit(data)
  }

  /**
   * -------------------------------------------------------------------
   *  onSubmit: SAVES TO FIREBASE
   *
   *  - Saves patient info to "patients/patientinfo/{uhid}"
   *  - Saves casualty details to "patients/casualtydetail/{uhid}/{casualtyId}"
   * -------------------------------------------------------------------
   */
  const onSubmit = async (data: ICasualtyFormInput) => {
    setLoading(true)
    try {
      let uhid = ""

      if (selectedPatient) {
        // Existing patient
        uhid = selectedPatient.id

        // Update patientinfo
        await update(ref(db, `patients/patientinfo/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
          dob: data.dob?.toISOString() || null,
          updatedAt: new Date().toISOString(),
        })
      } else {
        // New patient → generate new UHID, store patient info
        const newUhid = generatePatientId()
        uhid = newUhid

        // Save patientinfo
        await set(ref(db, `patients/patientinfo/${newUhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          dob: data.dob?.toISOString() || null,
          address: data.address || "",
          createdAt: new Date().toISOString(),
          uhid: newUhid,
        })
      }

      // Save casualty details under patients/casualtydetail/{uhid}
      const casualtyListRef = ref(db, `patients/casualtydetail/${uhid}`)
      const newCasualtyRef = push(casualtyListRef)
      await set(newCasualtyRef, {
        name: data.name,
        phone: data.phone,
        age: data.age,
        gender: data.gender,
        dob: data.dob?.toISOString() || null,
        address: data.address || "",
        patientId: uhid,
        date: data.date.toISOString(),
        time: data.time,
        message: data.message || "",
        modeOfArrival: data.modeOfArrival,
        broughtBy: data.broughtBy || "",
        referralHospital: data.referralHospital || "",
        broughtDead: data.broughtDead,
        caseType: data.caseType,
        otherCaseType: data.otherCaseType || "",
        incidentDescription: data.incidentDescription || "",
        isMLC: data.isMLC,
        mlcNumber: data.mlcNumber || "",
        policeInformed: data.policeInformed,
        attendingDoctor: data.attendingDoctor || "",
        triageCategory: data.triageCategory,
        vitalSigns: data.vitalSigns,
        enteredBy: currentUserEmail || "unknown",
        createdAt: new Date().toISOString(),
      })

      // WhatsApp notification
      try {
        const formattedDate = data.date.toLocaleDateString("en-IN")
        const caseTypeLabel = CaseTypeOptions.find((c) => c.value === data.caseType)?.label || data.caseType
        const triageLabel =
          TriageCategoryOptions.find((t) => t.value === data.triageCategory)?.label || data.triageCategory

        const professionalMessage = `Hello ${data.name}, 
Your casualty registration at Gautami Hospital has been completed.

Patient Details:
• Name: ${data.name}
• Date: ${formattedDate}
• Time: ${data.time}
• Case Type: ${caseTypeLabel}
• Triage Category: ${triageLabel}
• Mode of Arrival: ${data.modeOfArrival.toUpperCase()}
${data.attendingDoctor ? `• Attending Doctor: ${data.attendingDoctor}` : ""}

Please follow the medical staff instructions for further treatment.

Thank you,
Gautami Hospital Emergency Department
`
        const phoneWithCountryCode = `91${data.phone.replace(/\D/g, "")}`
        await fetch("https://wa.medblisss.com/send-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "99583991572",
            number: phoneWithCountryCode,
            message: professionalMessage,
          }),
        })
      } catch (whatsappError) {
        console.error("Error sending WhatsApp message:", whatsappError)
      }

      toast.success("Casualty registration completed successfully!", {
        position: "top-right",
        autoClose: 5000,
      })

      // Reset form + UI state
      reset({
        name: "",
        phone: "",
        age: 0,
        gender: "",
        dob: null,
        address: "",
        date: new Date(),
        time: formatAMPM(new Date()),
        message: "",
        modeOfArrival: "walkin",
        broughtBy: "",
        referralHospital: "",
        broughtDead: false,
        caseType: "other",
        otherCaseType: "",
        incidentDescription: "",
        isMLC: false,
        mlcNumber: "",
        policeInformed: false,
        attendingDoctor: "",
        triageCategory: "green",
        vitalSigns: {
          bloodPressure: "",
          pulse: undefined,
          temperature: undefined,
          oxygenSaturation: undefined,
          respiratoryRate: undefined,
          gcs: undefined,
        },
      })
      setPreviewOpen(false)
      setSelectedPatient(null)
      setShowNameSuggestions(false)
      setShowPhoneSuggestions(false)
    } catch (error) {
      console.error("Error registering casualty:", error)
      toast.error("Failed to register casualty. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Delete a casualty record
   */
  const handleDeleteRecord = async () => {
    if (!recordToDelete) return

    try {
      // Find the record to get patient ID
      const recordToDeleteData = casualtyRecords.find((r) => r.id === recordToDelete)
      if (!recordToDeleteData) return
      // Remove from casualtydetail
      const casualtyRef = ref(db, `patients/casualtydetail/${recordToDeleteData.id}/${recordToDelete}`)
      const snapshot = await get(casualtyRef)

      if (snapshot.exists()) {
        const casualtyData = snapshot.val()

        // Log deletion
        const changesDeleteRef = ref(db, "changesdelete")
        const newChangeRef = push(changesDeleteRef)
        await set(newChangeRef, {
          type: "delete",
          dataType: "casualty",
          originalData: casualtyData,
          deletedBy: currentUserEmail || "unknown",
          deletedAt: new Date().toISOString(),
          recordId: recordToDelete,
        })

        // Actually remove it
        await remove(casualtyRef)

        toast.success("Casualty record deleted successfully")
      }

      setRecordToDelete(null)
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error("Error deleting casualty record:", error)
      toast.error("Failed to delete casualty record")
    }
  }

  /** -------------
   *   START TOUR
   *  ------------- */
  const startTour = () => {
    setRunTour(true)
  }

  /** -----------
   *   RENDER UI
   *  ----------- */
  // Hide name suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showNameSuggestions &&
        nameSuggestionBoxRef.current &&
        !nameSuggestionBoxRef.current.contains(event.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(event.target as Node)
      ) {
        setShowNameSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showNameSuggestions])

  // Hide phone suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showPhoneSuggestions &&
        phoneSuggestionBoxRef.current &&
        !phoneSuggestionBoxRef.current.contains(event.target as Node) &&
        phoneInputRef.current &&
        !phoneInputRef.current.contains(event.target as Node)
      ) {
        setShowPhoneSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showPhoneSuggestions])

  return (
    <>
      <Head>
        <title>Casualty Registration System</title>
        <meta name="description" content="Emergency casualty registration system" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer position="top-right" autoClose={3000} />

      {/* Joyride for guided tour */}
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleJoyrideCallback}
        styles={{
          options: { zIndex: 10000, primaryColor: "#dc2626" },
        }}
      />

      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-6xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-8 w-8" />
                    Casualty Registration System
                  </CardTitle>
                  <CardDescription className="text-red-100">Emergency department patient registration</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startTour}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Help
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Tabs defaultValue="form" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full grid grid-cols-3 rounded-none">
                  <TabsTrigger value="form" className="text-sm md:text-base">
                    Registration Form
                  </TabsTrigger>
                  <TabsTrigger value="records" className="text-sm md:text-base">
                    Casualty Records
                  </TabsTrigger>
                  <TabsTrigger value="help" className="text-sm md:text-base">
                    Help
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="form" className="p-6">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      validateAndSubmit(getValues())
                    }}
                    className="space-y-8"
                  >
                    {/* Patient Information Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                          <PersonIcon className="h-5 w-5" />
                          Patient Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Patient Name Field with Auto-Suggest */}
                        <div className="space-y-2" data-tour="patient-name">
                          <Label htmlFor="name" className="text-sm font-medium">
                            Patient Name <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="name"
                              type="text"
                              {...register("name", { required: "Name is required" })}
                              onChange={handleNameInputChange}
                              placeholder="Enter patient name"
                              className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
                              autoComplete="off"
                              ref={(e) => {
                                register("name", { required: "Name is required" }).ref(e)
                                nameInputRef.current = e
                              }}
                            />
                            {showNameSuggestions && patientSuggestions.length > 0 && (
                              <div
                                ref={nameSuggestionBoxRef}
                                className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 shadow-lg"
                              >
                                <ScrollArea className="max-h-48">
                                  <div className="p-1">
                                    {patientSuggestions.map((suggestion) => (
                                      <div
                                        key={suggestion.id}
                                        className="flex items-center justify-between px-3 py-2 hover:bg-red-50 dark:hover:bg-gray-700 rounded-md cursor-pointer"
                                        onClick={() => handlePatientSuggestionClick(suggestion)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <Avatar className="h-6 w-6">
                                            <AvatarFallback className="text-xs bg-red-100 text-red-700">
                                              {suggestion.name.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="font-medium">{suggestion.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm text-gray-500">
                                            {suggestion.phone || "No phone"}
                                          </span>
                                          <Badge variant="default" className="text-xs">
                                            Existing
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
                          {errors.name && (
                            <p className="text-sm text-red-500">{errors.name.message || "Name is required"}</p>
                          )}
                        </div>

                        {/* Phone Field with Auto-Suggest */}
                        <div className="space-y-2" data-tour="phone">
                          <Label htmlFor="phone" className="text-sm font-medium">
                            Phone Number <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="phone"
                              type="tel"
                              {...register("phone", {
                                required: "Phone number is required",
                                pattern: {
                                  value: /^[0-9]{10}$/,
                                  message: "Please enter a valid 10-digit phone number",
                                },
                              })}
                              onChange={handlePhoneInputChange}
                              placeholder="Enter 10-digit number"
                              className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
                              autoComplete="off"
                              ref={(e) => {
                                register("phone", {
                                  required: "Phone number is required",
                                  pattern: {
                                    value: /^[0-9]{10}$/,
                                    message: "Please enter a valid 10-digit phone number",
                                  },
                                }).ref(e)
                                phoneInputRef.current = e
                              }}
                            />
                            {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                              <div
                                ref={phoneSuggestionBoxRef}
                                className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
                              >
                                {phoneSuggestions.map((suggestion) => (
                                  <div
                                    key={suggestion.id}
                                    onClick={() => handlePatientSuggestionClick(suggestion)}
                                    className="flex items-center justify-between px-3 py-2 hover:bg-red-50 dark:hover:bg-gray-700 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-xs bg-red-100 text-red-700">
                                          {suggestion.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="font-medium">{suggestion.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                                      <Badge variant="default" className="text-xs">
                                        Existing
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {errors.phone && (
                            <p className="text-sm text-red-500">{errors.phone.message || "Phone number is required"}</p>
                          )}
                        </div>

                        {/* Age Field */}
                        <div className="space-y-2" data-tour="age">
                          <Label htmlFor="age" className="text-sm font-medium">
                            Age <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="age"
                              type="number"
                              {...register("age", {
                                required: "Age is required",
                                min: { value: 1, message: "Age must be positive" },
                              })}
                              placeholder="Enter age"
                              className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
                              ref={(e) => {
                                register("age", {
                                  required: "Age is required",
                                  min: { value: 1, message: "Age must be positive" },
                                }).ref(e)
                                ageInputRef.current = e
                              }}
                            />
                          </div>
                          {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
                        </div>

                        {/* Gender Field */}
                        <div className="space-y-2" data-tour="gender">
                          <Label htmlFor="gender" className="text-sm font-medium">
                            Gender <span className="text-red-500">*</span>
                          </Label>
                          <Controller
                            control={control}
                            name="gender"
                            rules={{ required: "Gender is required" }}
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className={errors.gender ? "border-red-500" : ""}>
                                  <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                  {GenderOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
                        </div>

                        {/* Date of Birth Field */}
                        <div className="space-y-2" data-tour="dob">
                          <Label htmlFor="dob" className="text-sm font-medium">
                            Date of Birth
                          </Label>
                          <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Controller
                              control={control}
                              name="dob"
                              render={({ field }) => (
                                <DatePicker
                                  selected={field.value}
                                  onChange={(date: Date | null) => field.onChange(date)}
                                  dateFormat="dd/MM/yyyy"
                                  placeholderText="Select Date of Birth"
                                  className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                                  maxDate={new Date()}
                                />
                              )}
                            />
                          </div>
                        </div>

                        {/* Address Field */}
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="address" className="text-sm font-medium">
                            Address
                          </Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                            <Textarea
                              id="address"
                              {...register("address")}
                              placeholder="Enter address (optional)"
                              className="pl-10 min-h-[80px]"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Emergency Details Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Emergency Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Date Field */}
                        <div className="space-y-2">
                          <Label htmlFor="date" className="text-sm font-medium">
                            Date <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Controller
                              control={control}
                              name="date"
                              rules={{ required: "Date is required" }}
                              render={({ field }) => (
                                <DatePicker
                                  selected={field.value}
                                  onChange={(date: Date | null) => date && field.onChange(date)}
                                  dateFormat="dd/MM/yyyy"
                                  placeholderText="Select Date"
                                  className={`w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800 ${
                                    errors.date ? "border-red-500" : ""
                                  }`}
                                />
                              )}
                            />
                          </div>
                          {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                        </div>

                        {/* Time Field */}
                        <div className="space-y-2">
                          <Label htmlFor="time" className="text-sm font-medium">
                            Time <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="time"
                              type="text"
                              {...register("time", {
                                required: "Time is required",
                              })}
                              placeholder="e.g. 10:30 AM"
                              className={`pl-10 ${errors.time ? "border-red-500" : ""}`}
                              defaultValue={formatAMPM(new Date())}
                            />
                          </div>
                          {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
                        </div>

                        {/* Mode of Arrival */}
                        <div className="space-y-2" data-tour="mode-of-arrival">
                          <Label htmlFor="modeOfArrival" className="text-sm font-medium">
                            Mode of Arrival <span className="text-red-500">*</span>
                          </Label>
                          <Controller
                            control={control}
                            name="modeOfArrival"
                            rules={{ required: "Mode of arrival is required" }}
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className={errors.modeOfArrival ? "border-red-500" : ""}>
                                  <SelectValue placeholder="Select mode of arrival" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ModeOfArrivalOptions.map((option) => {
                                    const IconComponent = option.icon
                                    return (
                                      <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                          <IconComponent className="h-4 w-4" />
                                          {option.label}
                                        </div>
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.modeOfArrival && (
                            <p className="text-sm text-red-500">{errors.modeOfArrival.message}</p>
                          )}
                        </div>

                        {/* Brought By (conditional) */}
                        {(watchedModeOfArrival === "ambulance" || watchedModeOfArrival === "referred") && (
                          <div className="space-y-2">
                            <Label htmlFor="broughtBy" className="text-sm font-medium">
                              Brought By
                            </Label>
                            <Input
                              id="broughtBy"
                              type="text"
                              {...register("broughtBy")}
                              placeholder="Enter who brought the patient"
                            />
                          </div>
                        )}

                        {/* Referral Hospital (conditional) */}
                        {watchedModeOfArrival === "referred" && (
                          <div className="space-y-2">
                            <Label htmlFor="referralHospital" className="text-sm font-medium">
                              Referral Hospital
                            </Label>
                            <Input
                              id="referralHospital"
                              type="text"
                              {...register("referralHospital")}
                              placeholder="Enter referring hospital name"
                            />
                          </div>
                        )}

                        {/* Case Type */}
                        <div className="space-y-2" data-tour="case-type">
                          <Label htmlFor="caseType" className="text-sm font-medium">
                            Case Type <span className="text-red-500">*</span>
                          </Label>
                          <Controller
                            control={control}
                            name="caseType"
                            rules={{ required: "Case type is required" }}
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className={errors.caseType ? "border-red-500" : ""}>
                                  <SelectValue placeholder="Select case type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CaseTypeOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.caseType && <p className="text-sm text-red-500">{errors.caseType.message}</p>}
                        </div>

                        {/* Other Case Type (conditional) */}
                        {watchedCaseType === "other" && (
                          <div className="space-y-2">
                            <Label htmlFor="otherCaseType" className="text-sm font-medium">
                              Other Case Type
                            </Label>
                            <Input
                              id="otherCaseType"
                              type="text"
                              {...register("otherCaseType")}
                              placeholder="Specify other case type"
                            />
                          </div>
                        )}

                        {/* Triage Category */}
                        <div className="space-y-2" data-tour="triage-category">
                          <Label htmlFor="triageCategory" className="text-sm font-medium">
                            Triage Category <span className="text-red-500">*</span>
                          </Label>
                          <Controller
                            control={control}
                            name="triageCategory"
                            rules={{ required: "Triage category is required" }}
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className={errors.triageCategory ? "border-red-500" : ""}>
                                  <SelectValue placeholder="Select triage category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {TriageCategoryOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${option.color}`}></div>
                                        {option.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.triageCategory && (
                            <p className="text-sm text-red-500">{errors.triageCategory.message}</p>
                          )}
                        </div>

                        {/* Attending Doctor */}
                        <div className="space-y-2">
                          <Label htmlFor="attendingDoctor" className="text-sm font-medium">
                            Attending Doctor
                          </Label>
                          <Controller
                            control={control}
                            name="attendingDoctor"
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select attending doctor" />
                                </SelectTrigger>
                                <SelectContent>
                                  {doctors.map((doctor) => (
                                    <SelectItem key={doctor.id} value={doctor.name}>
                                      {doctor.name} {doctor.specialty ? `(${doctor.specialty})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        {/* Brought Dead Checkbox */}
                        <div className="space-y-2 col-span-2">
                          <div className="flex items-center space-x-2">
                            <Controller
                              control={control}
                              name="broughtDead"
                              render={({ field }) => (
                                <Checkbox id="broughtDead" checked={field.value} onCheckedChange={field.onChange} />
                              )}
                            />
                            <Label htmlFor="broughtDead" className="text-sm font-medium">
                              Brought Dead
                            </Label>
                          </div>
                        </div>

                        {/* Incident Description */}
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="incidentDescription" className="text-sm font-medium">
                            Incident Description
                          </Label>
                          <Textarea
                            id="incidentDescription"
                            {...register("incidentDescription")}
                            placeholder="Describe the incident (optional)"
                            className="min-h-[100px]"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Legal & Medical Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Legal & Medical Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* MLC Checkbox */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Controller
                              control={control}
                              name="isMLC"
                              render={({ field }) => (
                                <Checkbox id="isMLC" checked={field.value} onCheckedChange={field.onChange} />
                              )}
                            />
                            <Label htmlFor="isMLC" className="text-sm font-medium">
                              Is MLC (Medico-Legal Case)
                            </Label>
                          </div>
                        </div>

                        {/* MLC Number (conditional) */}
                        {watchedIsMLC && (
                          <div className="space-y-2">
                            <Label htmlFor="mlcNumber" className="text-sm font-medium">
                              MLC Number
                            </Label>
                            <Input
                              id="mlcNumber"
                              type="text"
                              {...register("mlcNumber")}
                              placeholder="Enter MLC number"
                            />
                          </div>
                        )}

                        {/* Police Informed Checkbox */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Controller
                              control={control}
                              name="policeInformed"
                              render={({ field }) => (
                                <Checkbox id="policeInformed" checked={field.value} onCheckedChange={field.onChange} />
                              )}
                            />
                            <Label htmlFor="policeInformed" className="text-sm font-medium">
                              Police Informed
                            </Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Vital Signs Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle
                          className="text-lg text-red-700 dark:text-red-400 flex items-center gap-2"
                          data-tour="vital-signs"
                        >
                          <Activity className="h-5 w-5" />
                          Vital Signs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Blood Pressure */}
                        <div className="space-y-2">
                          <Label htmlFor="bloodPressure" className="text-sm font-medium">
                            Blood Pressure
                          </Label>
                          <div className="relative">
                            <Heart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="bloodPressure"
                              type="text"
                              {...register("vitalSigns.bloodPressure")}
                              placeholder="e.g. 120/80"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        {/* Pulse */}
                        <div className="space-y-2">
                          <Label htmlFor="pulse" className="text-sm font-medium">
                            Pulse (bpm)
                          </Label>
                          <div className="relative">
                            <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="pulse"
                              type="number"
                              {...register("vitalSigns.pulse", {
                                valueAsNumber: true,
                              })}
                              placeholder="e.g. 72"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        {/* Temperature */}
                        <div className="space-y-2">
                          <Label htmlFor="temperature" className="text-sm font-medium">
                            Temperature (°F)
                          </Label>
                          <div className="relative">
                            <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="temperature"
                              type="number"
                              step="0.1"
                              {...register("vitalSigns.temperature", {
                                valueAsNumber: true,
                              })}
                              placeholder="e.g. 98.6"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        {/* Oxygen Saturation */}
                        <div className="space-y-2">
                          <Label htmlFor="oxygenSaturation" className="text-sm font-medium">
                            Oxygen Saturation (%)
                          </Label>
                          <div className="relative">
                            <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                              id="oxygenSaturation"
                              type="number"
                              {...register("vitalSigns.oxygenSaturation", {
                                valueAsNumber: true,
                                min: { value: 0, message: "Must be positive" },
                                max: { value: 100, message: "Cannot exceed 100%" },
                              })}
                              placeholder="e.g. 98"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        {/* Respiratory Rate */}
                        <div className="space-y-2">
                          <Label htmlFor="respiratoryRate" className="text-sm font-medium">
                            Respiratory Rate (per min)
                          </Label>
                          <Input
                            id="respiratoryRate"
                            type="number"
                            {...register("vitalSigns.respiratoryRate", {
                              valueAsNumber: true,
                            })}
                            placeholder="e.g. 16"
                          />
                        </div>

                        {/* GCS */}
                        <div className="space-y-2">
                          <Label htmlFor="gcs" className="text-sm font-medium">
                            GCS Score
                          </Label>
                          <Input
                            id="gcs"
                            type="number"
                            {...register("vitalSigns.gcs", {
                              valueAsNumber: true,
                              min: { value: 3, message: "GCS minimum is 3" },
                              max: { value: 15, message: "GCS maximum is 15" },
                            })}
                            placeholder="e.g. 15"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Additional Notes */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                          <MessageSquare className="h-5 w-5" />
                          Additional Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Label htmlFor="message" className="text-sm font-medium">
                            Notes
                          </Label>
                          <Textarea
                            id="message"
                            {...register("message")}
                            placeholder="Enter any additional notes or observations (optional)"
                            className="min-h-[100px]"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
                        Preview
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700"
                        disabled={loading}
                      >
                        {loading ? "Registering..." : "Register Patient"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="records" className="p-6">
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                      <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">Casualty Records</h3>
                      <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="relative flex-1 sm:w-64">
                          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input
                            placeholder="Search records..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                          />
                          {searchQuery && (
                            <button
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                              onClick={() => setSearchQuery("")}
                            >
                              <Cross2Icon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <Button onClick={() => setActiveTab("form")} className="bg-red-600 hover:bg-red-700">
                          New Registration
                        </Button>
                      </div>
                    </div>

                    {filteredCasualtyRecords.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        {searchQuery ? "No matching records found" : "No casualty records found"}
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-4">
                          {filteredCasualtyRecords.map((record) => {
                            const triageOption = TriageCategoryOptions.find((t) => t.value === record.triageCategory)
                            const caseTypeOption = CaseTypeOptions.find((c) => c.value === record.caseType)

                            return (
                              <Card key={record.id} className="overflow-hidden">
                                <CardHeader className="bg-red-50 dark:bg-gray-800 p-4">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <CardTitle className="text-lg">{record.name}</CardTitle>
                                      <CardDescription>
                                        {new Date(record.date).toLocaleDateString()} at {record.time}
                                      </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge className={`${triageOption?.color} text-white`}>
                                        {triageOption?.label}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="p-4">
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="font-medium">Phone:</div>
                                    <div>{record.phone}</div>

                                    <div className="font-medium">Age:</div>
                                    <div>{record.age}</div>

                                    <div className="font-medium">Gender:</div>
                                    <div>{record.gender}</div>

                                    <div className="font-medium">Case Type:</div>
                                    <div>{caseTypeOption?.label || record.caseType}</div>

                                    <div className="font-medium">Mode of Arrival:</div>
                                    <div className="capitalize">{record.modeOfArrival}</div>

                                    <div className="font-medium">Created:</div>
                                    <div>{new Date(record.createdAt).toLocaleString()}</div>
                                  </div>
                                </CardContent>
                                <CardFooter className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      setRecordToDelete(record.id)
                                      setDeleteDialogOpen(true)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </CardFooter>
                              </Card>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="help" className="p-6">
                  <div className="space-y-6">
                    <div className="bg-red-50 dark:bg-gray-800 rounded-lg p-4 border border-red-100 dark:border-gray-700">
                      <h3 className="text-lg font-semibold mb-2 text-red-700 dark:text-red-400">
                        Casualty Registration Help
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 mb-4">
                        Learn how to use the Casualty Registration System efficiently.
                      </p>

                      <div className="space-y-4">
                        <h4 className="font-semibold text-red-700 dark:text-red-400">Triage Categories</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {TriageCategoryOptions.map((option) => (
                            <div
                              key={option.value}
                              className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3 h-3 rounded-full ${option.color}`}></div>
                                <p className="font-medium">{option.label}</p>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {option.value === "red" &&
                                  "Immediate life-threatening conditions requiring immediate attention"}
                                {option.value === "yellow" && "Urgent conditions that need prompt medical attention"}
                                {option.value === "green" && "Less urgent conditions that can wait for treatment"}
                                {option.value === "black" && "Deceased or expectant cases"}
                              </p>
                            </div>
                          ))}
                        </div>

                        <h4 className="font-semibold text-red-700 dark:text-red-400">Case Types</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">Medical Emergencies</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Cardiac emergencies, poisoning, snake bites, and other medical conditions requiring
                              immediate care.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">Trauma Cases</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Road traffic accidents, physical assault, burns, falls, and other traumatic injuries.
                            </p>
                          </div>
                        </div>

                        <h4 className="font-semibold text-red-700 dark:text-red-400">Legal Considerations</h4>
                        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <p className="font-medium mb-1">MLC (Medico-Legal Case)</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Cases involving legal implications such as accidents, assaults, poisoning, or suspicious
                            deaths. Police must be informed for MLC cases.
                          </p>
                        </div>

                        <div className="mt-4">
                          <Button variant="outline" size="sm" onClick={startTour}>
                            <HelpCircle className="mr-2 h-4 w-4" />
                            Start Guided Tour
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            {selectedPatient && (
              <div className="px-6 py-3 bg-red-50 dark:bg-gray-800 border-t border-red-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium">
                      Patient selected: <span className="text-red-600 dark:text-red-400">{selectedPatient.name}</span>
                    </span>
                  </div>
                  <Badge variant="default">Existing Patient</Badge>
                </div>
              </div>
            )}

            <CardFooter className="flex flex-col sm:flex-row justify-between items-center p-6 bg-gray-50 dark:bg-gray-900 border-t">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-0">
                Fields marked with <span className="text-red-500">*</span> are required
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startTour}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Tour
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Casualty Registration Preview</DialogTitle>
            <DialogDescription>Review the patient details before submitting</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="font-medium">Patient Name:</div>
              <div>{watch("name")}</div>

              <div className="font-medium">Phone:</div>
              <div>{watch("phone")}</div>

              <div className="font-medium">Age:</div>
              <div>{watch("age")}</div>

              <div className="font-medium">Gender:</div>
              <div>{GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}</div>

              {watch("dob") && (
                <>
                  <div className="font-medium">Date of Birth:</div>
                  <div>{watch("dob")?.toLocaleDateString()}</div>
                </>
              )}

              {watch("address") && (
                <>
                  <div className="font-medium">Address:</div>
                  <div>{watch("address")}</div>
                </>
              )}

              <div className="font-medium">Date:</div>
              <div>{watch("date")?.toLocaleDateString()}</div>

              <div className="font-medium">Time:</div>
              <div>{watch("time")}</div>

              <div className="font-medium">Mode of Arrival:</div>
              <div>{ModeOfArrivalOptions.find((m) => m.value === watch("modeOfArrival"))?.label}</div>

              {watch("broughtBy") && (
                <>
                  <div className="font-medium">Brought By:</div>
                  <div>{watch("broughtBy")}</div>
                </>
              )}

              {watch("referralHospital") && (
                <>
                  <div className="font-medium">Referral Hospital:</div>
                  <div>{watch("referralHospital")}</div>
                </>
              )}

              <div className="font-medium">Case Type:</div>
              <div>{CaseTypeOptions.find((c) => c.value === watch("caseType"))?.label}</div>

              {watch("otherCaseType") && (
                <>
                  <div className="font-medium">Other Case Type:</div>
                  <div>{watch("otherCaseType")}</div>
                </>
              )}

              <div className="font-medium">Triage Category:</div>
              <div>{TriageCategoryOptions.find((t) => t.value === watch("triageCategory"))?.label}</div>

              {watch("attendingDoctor") && (
                <>
                  <div className="font-medium">Attending Doctor:</div>
                  <div>{watch("attendingDoctor")}</div>
                </>
              )}

              <div className="font-medium">Brought Dead:</div>
              <div>{watch("broughtDead") ? "Yes" : "No"}</div>

              <div className="font-medium">MLC:</div>
              <div>{watch("isMLC") ? "Yes" : "No"}</div>

              {watch("mlcNumber") && (
                <>
                  <div className="font-medium">MLC Number:</div>
                  <div>{watch("mlcNumber")}</div>
                </>
              )}

              <div className="font-medium">Police Informed:</div>
              <div>{watch("policeInformed") ? "Yes" : "No"}</div>

              {/* Vital Signs */}
              {(watch("vitalSigns.bloodPressure") ||
                watch("vitalSigns.pulse") ||
                watch("vitalSigns.temperature") ||
                watch("vitalSigns.oxygenSaturation") ||
                watch("vitalSigns.respiratoryRate") ||
                watch("vitalSigns.gcs")) && (
                <>
                  <div className="font-medium col-span-2 mt-2 mb-1 text-red-700">Vital Signs:</div>

                  {watch("vitalSigns.bloodPressure") && (
                    <>
                      <div className="font-medium ml-4">Blood Pressure:</div>
                      <div>{watch("vitalSigns.bloodPressure")}</div>
                    </>
                  )}

                  {watch("vitalSigns.pulse") && (
                    <>
                      <div className="font-medium ml-4">Pulse:</div>
                      <div>{watch("vitalSigns.pulse")} bpm</div>
                    </>
                  )}

                  {watch("vitalSigns.temperature") && (
                    <>
                      <div className="font-medium ml-4">Temperature:</div>
                      <div>{watch("vitalSigns.temperature")}°F</div>
                    </>
                  )}

                  {watch("vitalSigns.oxygenSaturation") && (
                    <>
                      <div className="font-medium ml-4">Oxygen Saturation:</div>
                      <div>{watch("vitalSigns.oxygenSaturation")}%</div>
                    </>
                  )}

                  {watch("vitalSigns.respiratoryRate") && (
                    <>
                      <div className="font-medium ml-4">Respiratory Rate:</div>
                      <div>{watch("vitalSigns.respiratoryRate")} per min</div>
                    </>
                  )}

                  {watch("vitalSigns.gcs") && (
                    <>
                      <div className="font-medium ml-4">GCS Score:</div>
                      <div>{watch("vitalSigns.gcs")}</div>
                    </>
                  )}
                </>
              )}

              {watch("incidentDescription") && (
                <>
                  <div className="font-medium">Incident Description:</div>
                  <div>{watch("incidentDescription")}</div>
                </>
              )}

              {watch("message") && (
                <>
                  <div className="font-medium">Notes:</div>
                  <div>{watch("message")}</div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => validateAndSubmit(getValues())}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? "Processing..." : "Confirm & Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Casualty Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this casualty record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRecordToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecord} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default CasualtyBookingPage
