"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { db, auth } from "@/lib/firebase"
import { ref, push, update, onValue, set, remove, runTransaction } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { useRouter } from "next/navigation"
import { PatientForm } from "./patient-form"
import { OnCallAppointments } from "./oncall-appointments"
import type { IFormInput, PatientRecord, Doctor, ModalitySelection, OnCallAppointment } from "./types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { generateNextUHID } from "@/components/uhid-generator"
import { CheckCircle, User, Clock, Hospital, PhoneCall } from "lucide-react"
import Head from "next/head"
import { openBillInNewTabProgrammatically } from "@/app/edit-appointment/bill-generator"

function formatAMPM(date: Date): string {
  const rawHours = date.getHours()
  const rawMinutes = date.getMinutes()
  const ampm = rawHours >= 12 ? "PM" : "AM"
  const hours = rawHours % 12 || 12
  const minutesStr = rawMinutes < 10 ? `0${rawMinutes}` : rawMinutes.toString()
  return `${hours}:${minutesStr} ${ampm}`
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const phoneWithCountryCode = `91${phone.replace(/\D/g, "")}`
    const response = await fetch("https://wa.medblisss.com/send-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "99583991573",
        number: phoneWithCountryCode,
        message: message,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

function generateAppointmentMessage(data: IFormInput, uhid: string, appointmentType: "hospital" | "oncall"): string {
  const appointmentDate = data.date.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  if (appointmentType === "oncall") {
    return `🏥 *APPOINTMENT CONFIRMATION*
Dear ${data.name}, Your *On-Call Appointment* has been successfully registered!
📋 *Appointment Details:*
• Patient ID: ${uhid}
• Date: ${appointmentDate}
• Time: ${data.time}
• Type: On-Call Consultation
${data.referredBy ? `• Referred By: ${data.referredBy}` : ""}
📞 Our medical team will contact you at the scheduled time.
${data.message ? `📝 *Notes:* ${data.message}` : ""}
For any queries, please contact our reception.
Thank you for choosing our healthcare services!
* G-Medford-NX Hospital *`
  } else {
    const modalities = data.modalities || []
    const servicesText = modalities
      .map((m) => {
        let serviceDesc = `• ${m.type.charAt(0).toUpperCase() + m.type.slice(1)}`
        if (m.specialist) serviceDesc += ` - ${m.specialist}`
        if (m.doctor) serviceDesc += ` (Dr. ${m.doctor})`
        if (m.service) serviceDesc += ` - ${m.service}`
        serviceDesc += ` - ₹${m.charges}`
        return serviceDesc
      })
      .join("\n")
    const totalCharges = modalities.reduce((total, m) => total + m.charges, 0)
    const totalPaid = (Number(data.cashAmount) || 0) + (Number(data.onlineAmount) || 0)
    const discount = Number(data.discount) || 0
    return `🏥 *APPOINTMENT CONFIRMATION*
Dear ${data.name}, Your *Appointment* has been successfully booked!
📋 *Appointment Details:*
• Patient ID: ${uhid}
• Date: ${appointmentDate}
• Time: ${data.time}
• Type: Hospital Visit
${data.referredBy ? `• Referred By: ${data.referredBy}` : ""}
💰 *Payment Summary:*
• Total Charges: ₹${totalCharges}
${discount > 0 ? `• Discount: ₹${discount}` : ""}
• Amount Paid: ₹${totalPaid}
• Payment Method: ${data.paymentMethod?.charAt(0).toUpperCase() + data.paymentMethod?.slice(1)}
${data.message ? `📝 *Notes:* ${data.message}` : ""}
For any queries, please contact our reception.
Thank you for choosing our healthcare services!
*Medford  Healthcare*`
  }
}

export default function Page() {
  const router = useRouter()
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<PatientRecord[]>([])
  const [onCallAppointments, setOnCallAppointments] = useState<OnCallAppointment[]>([])
  const [patientSuggestions, setPatientSuggestions] = useState<PatientRecord[]>([])
  const [phoneSuggestions, setPhoneSuggestions] = useState<PatientRecord[]>([])
  const [uhidSearchInput, setUhidSearchInput] = useState("")
  const [uhidSuggestions, setUhidSuggestions] = useState<PatientRecord[]>([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false)
  const [showUhidSuggestions, setShowUhidSuggestions] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [activeTab, setActiveTab] = useState("booking")
  const [lastUhid, setLastUhid] = useState<string | null>(null)

  const form = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      ageUnit: "years",
      gender: "",
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      paymentMethod: "cash",
      cashAmount: undefined,
      onlineAmount: undefined,
      discount: undefined,
      modalities: [],
      appointmentType: "visithospital",
      opdType: "",
      doctor: "",
      specialist: "",
      visitType: "first",
      study: "",
      referredBy: "",
    },
    mode: "onChange",
  })

  const { watch, setValue, handleSubmit, reset, trigger, getValues } = form

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUserEmail(user?.email ?? null)
    })
  }, [])

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    return onValue(doctorsRef, (snap) => {
      const data = snap.val() || {}
      setDoctors(Object.keys(data).map((key) => ({ id: key, ...data[key] })))
    })
  }, [])

  // Fetch patients
  useEffect(() => {
    const patientsRef = ref(db, "patients/patientinfo")
    return onValue(patientsRef, (snap) => {
      const data = snap.val() || {}
      setGautamiPatients(Object.keys(data).map((key) => ({ id: key, ...data[key], uhid: key })))
    })
  }, [])

  // Fetch on-call appointments
  useEffect(() => {
    const onCallRef = ref(db, "oncall-appointments")
    return onValue(onCallRef, (snap) => {
      const data = snap.val() || {}
      const appointments = Object.keys(data).map((key) => ({ id: key, ...data[key] }))
      setOnCallAppointments(appointments)
    })
  }, [])

  // Suggestions logic for Name
  const watchedName = watch("name")
  useEffect(() => {
    if (watchedName.length >= 2 && (!selectedPatient || watchedName !== selectedPatient.name)) {
      const lower = watchedName.toLowerCase()
      const matches = gautamiPatients.filter((p) => p.name.toLowerCase().includes(lower))
      setPatientSuggestions(matches)
      setShowNameSuggestions(matches.length > 0)
    } else {
      setShowNameSuggestions(false)
    }
  }, [watchedName, gautamiPatients, selectedPatient])

  // Suggestions logic for Phone
  const watchedPhone = watch("phone")
  useEffect(() => {
    if (watchedPhone.length >= 2 && (!selectedPatient || watchedPhone !== selectedPatient.phone)) {
      const matches = gautamiPatients.filter((p) => p.phone?.includes(watchedPhone))
      setPhoneSuggestions(matches)
      setShowPhoneSuggestions(matches.length > 0)
    } else {
      setShowPhoneSuggestions(false)
    }
  }, [watchedPhone, gautamiPatients, selectedPatient])

  // Suggestions logic for UHID
  useEffect(() => {
    if (uhidSearchInput.length >= 2 && (!selectedPatient || uhidSearchInput !== selectedPatient.uhid)) {
      const lower = uhidSearchInput.toLowerCase()
      const matches = gautamiPatients.filter((p) => p.uhid?.toLowerCase().includes(lower))
      setUhidSuggestions(matches)
      setShowUhidSuggestions(matches.length > 0)
    } else {
      setShowUhidSuggestions(false)
    }
  }, [uhidSearchInput, gautamiPatients, selectedPatient])

  const handlePatientSelect = (patient: PatientRecord) => {
    setSelectedPatient(patient)
    setValue("name", patient.name)
    setValue("phone", patient.phone || "")
    setValue("age", patient.age)
    setValue("gender", patient.gender || "")
    setValue("address", patient.address)
    setUhidSearchInput(patient.uhid || "")
    setShowNameSuggestions(false)
    setShowPhoneSuggestions(false)
    setShowUhidSuggestions(false)
  }
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("name", e.target.value)
    setSelectedPatient(null)
    setUhidSearchInput("")
  }
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("phone", e.target.value)
    setSelectedPatient(null)
    setUhidSearchInput("")
  }
  const handleUhidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUhidSearchInput(e.target.value)
    setSelectedPatient(null)
    setValue("name", "")
    setValue("phone", "")
  }

  // On submit booking
  const onSubmit = async (data: IFormInput) => {
    setIsSubmitting(true)
    try {
      // Determine UHID
      const uhid = selectedPatient?.id || (await generateNextUHID())
      setLastUhid(uhid)
      if (!selectedPatient) {
        await set(ref(db, `patients/patientinfo/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          ageUnit: data.ageUnit,
          gender: data.gender,
          address: data.address,
          createdAt: new Date().toISOString(),
          uhid,
        })
      } else {
        await update(ref(db, `patients/patientinfo/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          ageUnit: data.ageUnit,
          gender: data.gender,
          address: data.address,
          updatedAt: new Date().toISOString(),
        })
      }

      if (data.appointmentType === "oncall") {
        const onCallRef = push(ref(db, "oncall-appointments"))
        await set(onCallRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          ageUnit: data.ageUnit,
          gender: data.gender,
          patientId: uhid,
          date: data.date.toISOString(),
          time: data.time,
          message: data.message,
          referredBy: data.referredBy,
          enteredBy: currentUserEmail || "unknown",
          createdAt: new Date().toISOString(),
        })

        const professionalMessage = generateAppointmentMessage(data, uhid, "oncall")
        await sendWhatsAppMessage(data.phone, professionalMessage)
      } else {
        const cash = Number(data.cashAmount) || 0
        const online = Number(data.onlineAmount) || 0
        const discount = Number(data.discount) || 0
        const totalCharges = (data.modalities || []).reduce((total, m) => total + m.charges, 0)
        const appointmentDateKey =
          data.date instanceof Date
            ? data.date.toISOString().slice(0, 10)
            : new Date(data.date).toISOString().slice(0, 10)
        const opdRef = push(ref(db, `patients/opddetail/${appointmentDateKey}/${uhid}`))
        const modalitiesData = data.modalities.map((modality: ModalitySelection) => {
          const doctorName = modality.doctor
            ? doctors.find((d) => d.id === modality.doctor)?.name || modality.doctor
            : null
          return {
            type: modality.type,
            doctor: doctorName,
            specialist: modality.specialist || null,
            visitType: modality.visitType || null,
            service: modality.service || null,
            study: modality.study || null,
            charges: modality.charges,
          }
        })
        await set(opdRef, {
          name: data.name,
          phone: data.phone,
          patientId: uhid,
          date: data.date.toISOString(),
          time: data.time,
          doctor: data.doctor ? doctors.find((d) => d.id === data.doctor)?.name || data.doctor : null,
          modalities: modalitiesData,
          visitType: data.visitType,
          study: data.study,
          message: data.message,
          referredBy: data.referredBy,
          appointmentType: data.appointmentType,
          opdType: data.opdType,
          enteredBy: currentUserEmail || "unknown",
          createdAt: new Date().toISOString(),
        })
        const opdId = opdRef.key
        if (opdId) {
          await set(ref(db, `patients/opddetail/${appointmentDateKey}/${uhid}/${opdId}/payment`), {
            cashAmount: cash,
            onlineAmount: online,
            paymentMethod: data.paymentMethod,
            discount,
            totalCharges: totalCharges,
            totalPaid: cash + online,
            createdAt: new Date().toISOString(),
          })
        }

        // ----------------- OPD SUMMARY NODE UPDATE START -----------------
        const summaryRef = ref(db, `summary/opd/${appointmentDateKey}`)
        await runTransaction(summaryRef, (current) => {
          if (current === null) {
            return {
              totalCount: 1,
              totalRevenue: cash + online,
              cash: cash,
              online: online,
              discount: discount,
            }
          }
          return {
            totalCount: (current.totalCount || 0) + 1,
            totalRevenue: (current.totalRevenue || 0) + cash + online,
            cash: (current.cash || 0) + cash,
            online: (current.online || 0) + online,
            discount: (current.discount || 0) + discount,
          }
        })
        // ----------------- OPD SUMMARY NODE UPDATE END -----------------

        const professionalMessage = generateAppointmentMessage(data, uhid, "hospital")
        await sendWhatsAppMessage(data.phone, professionalMessage)
      }

      // ---------------- AUTO OPEN BILL PDF in new tab ------------------
      await openBillInNewTabProgrammatically(
        { ...data, date: data.date },
        uhid,
        doctors.map((d) => ({ id: d.id, name: d.name }))
      )

      setIsSubmitted(true)
      setTimeout(() => {
        setIsSubmitted(false)
        reset({
          name: "",
          phone: "",
          age: undefined,
          ageUnit: "years",
          gender: "",
          address: "",
          date: new Date(),
          time: formatAMPM(new Date()),
          message: "",
          paymentMethod: "cash",
          cashAmount: undefined,
          onlineAmount: undefined,
          discount: undefined,
          modalities: [],
          appointmentType: "visithospital",
          opdType: "",
          doctor: "",
          specialist: "",
          visitType: "first",
          study: "",
          referredBy: "",
        })
        setSelectedPatient(null)
        setUhidSearchInput("")
        setLastUhid(null)
      }, 3000)
    } catch (err) {
      console.error(err)
      toast.error("Failed to book appointment.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteOnCallAppointment = async (id: string) => {
    try {
      await remove(ref(db, `oncall-appointments/${id}`))
      toast.success("On-call appointment deleted successfully!")
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  const handleBookOPDVisit = (appointment: OnCallAppointment) => {
    setValue("name", appointment.name)
    setValue("phone", appointment.phone)
    setValue("age", appointment.age)
    setValue("gender", appointment.gender)
    setValue("appointmentType", "visithospital")
    setValue("date", new Date(appointment.date))
    setValue("time", appointment.time)
    setValue("message", appointment.message || "")
    setValue("referredBy", appointment.referredBy || "")
    setActiveTab("booking")
    toast.info("Patient information pre-filled. Please select services and payment details.")
  }

  const handleBookOnCall = () => {
    reset({
      name: "",
      phone: "",
      age: undefined,
      ageUnit: "years",
      gender: "",
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      paymentMethod: "cash",
      cashAmount: undefined,
      onlineAmount: undefined,
      discount: undefined,
      modalities: [],
      appointmentType: "oncall",
      opdType: "",
      doctor: "",
      specialist: "",
      visitType: "first",
      study: "",
      referredBy: "",
    })
    setSelectedPatient(null)
    setUhidSearchInput("")
    setActiveTab("booking")
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-2xl font-bold text-green-700">Appointment Registered!</h2>
              <p className="text-gray-600">Your appointment has been successfully registered.</p>
              {lastUhid && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-semibold text-blue-700">
                    Patient UHID: <span className="font-mono">{lastUhid}</span>
                  </span>
                </div>
              )}
              <p className="text-sm text-gray-500">WhatsApp confirmation sent to patient.</p>
              <p className="text-sm text-gray-500">Resetting form shortly...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>OPD Management System</title>
      </Head>
      <ToastContainer />
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OPD Management System</h1>
              <p className="text-sm text-gray-500">Professional Healthcare Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <CardTitle className="text-xl">Patient Management System</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
                <TabsTrigger value="booking" className="flex items-center gap-2">
                  <Hospital className="h-4 w-4" />
                  Book Appointment
                </TabsTrigger>
                <TabsTrigger value="oncall" className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4" />
                  On-Call List ({onCallAppointments.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="booking" className="p-6 mt-0">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <PatientForm
                    form={form}
                    doctors={doctors}
                    patientSuggestions={patientSuggestions}
                    phoneSuggestions={phoneSuggestions}
                    uhidSearchInput={uhidSearchInput}
                    uhidSuggestions={uhidSuggestions}
                    showNameSuggestions={showNameSuggestions}
                    showPhoneSuggestions={showPhoneSuggestions}
                    showUhidSuggestions={showUhidSuggestions}
                    selectedPatient={selectedPatient}
                    onPatientSelect={handlePatientSelect}
                    onNameChange={handleNameChange}
                    onPhoneChange={handlePhoneChange}
                    onUhidChange={handleUhidChange}
                    setShowNameSuggestions={setShowNameSuggestions}
                    setShowPhoneSuggestions={setShowPhoneSuggestions}
                    setShowUhidSuggestions={setShowUhidSuggestions}
                  />
                  <div className="flex justify-end pt-6 border-t bg-gray-50 -mx-6 px-6 -mb-6 pb-6">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition min-w-[150px]"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </div>
                      ) : watch("appointmentType") === "oncall" ? (
                        "Register On-Call"
                      ) : (
                        "Book Appointment"
                      )}
                    </Button>
                  </div>
                </form>
              </TabsContent>
              <TabsContent value="oncall" className="p-6 mt-0">
                <OnCallAppointments
                  appointments={onCallAppointments}
                  doctors={doctors}
                  onDeleteAppointment={handleDeleteOnCallAppointment}
                  onBookOPDVisit={handleBookOPDVisit}
                  onBookOnCall={handleBookOnCall}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
