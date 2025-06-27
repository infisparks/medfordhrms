"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { db, auth } from "@/lib/firebase"
import { ref, push, update, onValue, set, remove } from "firebase/database"
import Head from "next/head"
import { onAuthStateChanged } from "firebase/auth"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { User, Clock, CheckCircle, Hospital, PhoneCall } from "lucide-react"
import { useRouter } from "next/navigation"

import { PatientForm } from "./patient-form"
import { OnCallAppointments } from "./oncall-appointments"
import type { IFormInput, PatientRecord, Doctor, ModalitySelection, OnCallAppointment } from "./types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { generateNextUHID } from "@/components/uhid-generator" // Import the new UHID generator

function formatAMPM(date: Date): string {
  const rawHours = date.getHours()
  const rawMinutes = date.getMinutes()
  const ampm = rawHours >= 12 ? "PM" : "AM"

  const hours = rawHours % 12 || 12
  const minutesStr = rawMinutes < 10 ? `0${rawMinutes}` : rawMinutes.toString()

  return `${hours}:${minutesStr} ${ampm}`
}

// Removed the old generatePatientId function

// WhatsApp message sending function
async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const phoneWithCountryCode = `91${phone.replace(/\D/g, "")}`

    const response = await fetch("https://wa.medblisss.com/send-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: "99583991572",
        number: phoneWithCountryCode,
        message: message,
      }),
    })

    if (response.ok) {
      console.log("WhatsApp message sent successfully")
      return true
    } else {
      console.error("Failed to send WhatsApp message:", response.statusText)
      return false
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error)
    return false
  }
}

// Generate professional WhatsApp messages
function generateAppointmentMessage(data: IFormInput, uhid: string, appointmentType: "hospital" | "oncall"): string {
  const appointmentDate = data.date.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  if (appointmentType === "oncall") {
    return `🏥 *APPOINTMENT CONFIRMATION*

Dear ${data.name},

Your *On-Call Appointment* has been successfully registered!

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

*Gautami Medford NX *`
  } else {
    // Hospital visit message
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

Dear ${data.name},

Your *Appointment* has been successfully booked!

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

*Gautami Medford NX Healthcare*`
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
  const [uhidSearchInput, setUhidSearchInput] = useState("") // New state for UHID search input
  const [uhidSuggestions, setUhidSuggestions] = useState<PatientRecord[]>([]) // New state for UHID suggestions
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false)
  const [showUhidSuggestions, setShowUhidSuggestions] = useState(false) // New state for UHID suggestion visibility
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [activeTab, setActiveTab] = useState("booking")

  const form = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
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
      setGautamiPatients(Object.keys(data).map((key) => ({ id: key, ...data[key], uhid: key }))) // Ensure UHID is part of PatientRecord
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
    setUhidSearchInput(patient.uhid || "") // Set UHID search input to selected patient's UHID
    setShowNameSuggestions(false)
    setShowPhoneSuggestions(false)
    setShowUhidSuggestions(false) // Hide UHID suggestions
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("name", e.target.value)
    setSelectedPatient(null)
    setUhidSearchInput("") // Clear UHID search when name changes
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("phone", e.target.value)
    setSelectedPatient(null)
    setUhidSearchInput("") // Clear UHID search when phone changes
  }

  const handleUhidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUhidSearchInput(e.target.value)
    setSelectedPatient(null) // Clear selected patient when UHID input changes
    setValue("name", "") // Clear name and phone to avoid confusion
    setValue("phone", "")
  }

  // Calculate total charges from all modalities
  const getTotalModalityCharges = () => {
    const modalities = watch("modalities") || []
    return modalities.reduce((total, modality) => total + modality.charges, 0)
  }

  const calculateTotalAmount = () => {
    const cash = Number(watch("cashAmount")) || 0
    const online = Number(watch("onlineAmount")) || 0
    return cash + online
  }

  const validateAndSubmit = async (data: IFormInput) => {
    const required: Array<keyof IFormInput> = ["name", "phone", "age", "gender", "date", "time"]

    // For hospital visits, validate modalities and payment
    if (data.appointmentType === "visithospital") {
      required.push("modalities")

      // Validate modalities
      if (!data.modalities || data.modalities.length === 0) {
        toast.error("Please select at least one service")
        return
      }

      required.push("paymentMethod")
      if (data.paymentMethod === "mixed") {
        required.push("cashAmount", "onlineAmount")
      } else if (data.paymentMethod === "cash") {
        required.push("cashAmount")
      } else if (data.paymentMethod === "online") {
        required.push("onlineAmount")
      }
    }

    const valid = await trigger(required as any)
    if (!valid) {
      toast.error("Please fill all required fields")
      return
    }
    onSubmit(data)
  }

  const onSubmit = async (data: IFormInput) => {
    setIsSubmitting(true)
    try {
      // Determine UHID
      const uhid = selectedPatient?.id || (await generateNextUHID())

      if (!selectedPatient) {
        // new patient
        await set(ref(db, `patients/patientinfo/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          address: data.address,
          createdAt: new Date().toISOString(),
          uhid,
        })
      } else {
        // update existing
        await update(ref(db, `patients/patientinfo/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          address: data.address,
          updatedAt: new Date().toISOString(),
        })
      }

      if (data.appointmentType === "oncall") {
        // Save as on-call appointment
        const onCallRef = push(ref(db, "oncall-appointments"))
        await set(onCallRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          patientId: uhid,
          date: data.date.toISOString(),
          time: data.time,
          message: data.message,
          referredBy: data.referredBy,
          enteredBy: currentUserEmail || "unknown",
          createdAt: new Date().toISOString(),
        })

        // Send WhatsApp message for on-call appointment
        const professionalMessage = generateAppointmentMessage(data, uhid, "oncall")
        const messageSent = await sendWhatsAppMessage(data.phone, professionalMessage)

        if (messageSent) {
          toast.success("On-call appointment registered successfully! Confirmation sent via WhatsApp.")
        } else {
          toast.success("On-call appointment registered successfully!")
          toast.warning("WhatsApp message could not be sent. Please contact the patient manually.")
        }
      } else {
        // Hospital visit - existing logic
        const cash = Number(data.cashAmount) || 0
        const online = Number(data.onlineAmount) || 0
        const discount = Number(data.discount) || 0

        // Calculate total charges from all modalities (before discount)
        const totalCharges = getTotalModalityCharges()

        // Total amount paid
        const totalPaid = cash + online

        // push OPD record
        const appointmentDateKey =
          data.date instanceof Date
            ? data.date.toISOString().slice(0, 10)
            : new Date(data.date).toISOString().slice(0, 10)

        // Save under: /patients/opddetail/yyyy-MM-dd/{uhid}/{appointmentId}
        const opdRef = push(ref(db, `patients/opddetail/${appointmentDateKey}/${uhid}`))

        // Store all modalities as a separate array in the database
        const modalitiesData = data.modalities.map((modality: ModalitySelection) => {
          // Find doctor name from ID
          const doctorName = modality.doctor
            ? doctors.find((d) => d.id === modality.doctor)?.name || modality.doctor
            : null

          return {
            type: modality.type,
            doctor: doctorName, // Save doctor name instead of ID
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
          doctor: data.doctor ? doctors.find((d) => d.id === data.doctor)?.name || data.doctor : null, // Save doctor name instead of ID
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

        // payment - store total charges without discount
        const opdId = opdRef.key
        if (opdId) {
          await set(ref(db, `patients/opddetail/${appointmentDateKey}/${uhid}/${opdId}/payment`), {
            cashAmount: cash,
            onlineAmount: online,
            paymentMethod: data.paymentMethod,
            discount,
            totalCharges: totalCharges, // Total charges before discount
            totalPaid: totalPaid, // Total amount paid (cash + online)
            createdAt: new Date().toISOString(),
          })
        }

        // Send WhatsApp message for hospital appointment
        const professionalMessage = generateAppointmentMessage(data, uhid, "hospital")
        const messageSent = await sendWhatsAppMessage(data.phone, professionalMessage)

        if (messageSent) {
          toast.success("Hospital appointment booked successfully! Confirmation sent via WhatsApp.")
        } else {
          toast.success("Hospital appointment booked successfully!")
          toast.warning("WhatsApp message could not be sent. Please contact the patient manually.")
        }
      }

      setIsSubmitted(true)
      setTimeout(() => {
        setIsSubmitted(false)
        reset({
          name: "",
          phone: "",
          age: undefined,
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
        setUhidSearchInput("") // Clear UHID search input on form reset
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
    // Pre-fill the form with on-call appointment data
    setValue("name", appointment.name)
    setValue("phone", appointment.phone)
    setValue("age", appointment.age)
    setValue("gender", appointment.gender)
    setValue("appointmentType", "visithospital")
    setValue("date", new Date(appointment.date))
    setValue("time", appointment.time)
    setValue("message", appointment.message || "")
    setValue("referredBy", appointment.referredBy || "")

    // Switch to booking tab
    setActiveTab("booking")

    toast.info("Patient information pre-filled. Please select services and payment details.")
  }

  const handleBookOnCall = () => {
    // Reset form and set to on-call
    reset({
      name: "",
      phone: "",
      age: undefined,
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
    setUhidSearchInput("") // Clear UHID search input on form reset
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
                <form onSubmit={handleSubmit(validateAndSubmit)} className="space-y-6">
                  <PatientForm
                    form={form}
                    doctors={doctors}
                    patientSuggestions={patientSuggestions}
                    phoneSuggestions={phoneSuggestions}
                    uhidSearchInput={uhidSearchInput} // Pass UHID search input
                    uhidSuggestions={uhidSuggestions} // Pass UHID suggestions
                    showNameSuggestions={showNameSuggestions}
                    showPhoneSuggestions={showPhoneSuggestions}
                    showUhidSuggestions={showUhidSuggestions} // Pass UHID suggestion visibility
                    selectedPatient={selectedPatient}
                    onPatientSelect={handlePatientSelect}
                    onNameChange={handleNameChange}
                    onPhoneChange={handlePhoneChange}
                    onUhidChange={handleUhidChange} // Pass UHID change handler
                    setShowNameSuggestions={setShowNameSuggestions}
                    setShowPhoneSuggestions={setShowPhoneSuggestions}
                    setShowUhidSuggestions={setShowUhidSuggestions} // Pass UHID suggestion visibility setter
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
