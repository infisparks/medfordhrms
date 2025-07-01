"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { db, auth } from "@/lib/firebase"
import { ref, get, update, push, set } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { ArrowLeft, Save, User, Clock, AlertCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { EditAppointmentForm } from "./edit-appointment-form"
import type { IFormInput, Doctor, ModalitySelection } from "../opd/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function formatAMPM(date: Date): string {
  let hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes.toString()
  return `${hours}:${minutesStr} ${ampm}`
}

export default function EditAppointmentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const uhid = searchParams.get("uhid")
  const appointmentId = searchParams.get("id")
  const urlDate = searchParams.get("date") // try to get date from query

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateKey, setDateKey] = useState<string | null>(urlDate) // Track the dateKey for correct node

  const form = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined, // Changed to undefined for optional number
      ageUnit: "years", // Added default age unit
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

  const { handleSubmit, reset } = form

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUserEmail(user?.email ?? null)
    })
  }, [])

  // Fetch doctors (unchanged)
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const doctorsRef = ref(db, "doctors")
        const snapshot = await get(doctorsRef)
        if (snapshot.exists()) {
          const data = snapshot.val()
          let doctorsList: Doctor[] = []
          if (Array.isArray(data)) {
            doctorsList = data.map((doc: any) => ({
              id: doc.id,
              name: doc.name,
              specialist: doc.specialist || [],
              department: doc.department || "",
              firstVisitCharge: doc.firstVisitCharge || 0,
              followUpCharge: doc.followUpCharge || 0,
              ipdCharges: doc.ipdCharges || {},
            }))
          } else {
            doctorsList = Object.keys(data).map((key) => ({
              id: key,
              name: data[key].name,
              specialist: data[key].specialist || [],
              department: data[key].department || "",
              firstVisitCharge: data[key].firstVisitCharge || 0,
              followUpCharge: data[key].followUpCharge || 0,
              ipdCharges: data[key].ipdCharges || {},
            }))
          }
          doctorsList.push({
            id: "no_doctor",
            name: "No Doctor",
            specialist: [],
            department: "",
            firstVisitCharge: 0,
            followUpCharge: 0,
          })
          setDoctors(doctorsList)
        }
      } catch (error) {
        console.error("Error fetching doctors:", error)
        toast.error("Failed to load doctors")
      }
    }
    fetchDoctors()
  }, [])

  // Load appointment data from new date-based structure
  useEffect(() => {
    const loadAppointmentData = async () => {
      if (!uhid || !appointmentId) {
        setError("Missing appointment information. Please provide both UHID and appointment ID.")
        setIsLoading(false)
        return
      }
      if (doctors.length === 0) return // Wait for doctors to load
      setIsLoading(true)
      try {
        let foundDateKey = dateKey
        // If we don't already have dateKey, scan all dates for this appointment
        if (!foundDateKey) {
          const opdRef = ref(db, `patients/opddetail`)
          const opdSnap = await get(opdRef)
          if (!opdSnap.exists()) {
            setError("Appointment data not found.")
            setIsLoading(false)
            return
          }
          const opdData = opdSnap.val()
          // Scan all dates to find this UHID/ID combo
          for (const dateK of Object.keys(opdData)) {
            const uhidData = opdData[dateK]?.[uhid]
            if (uhidData && uhidData[appointmentId]) {
              foundDateKey = dateK
              break
            }
          }
          if (!foundDateKey) {
            setError("Appointment not found in any date node.")
            setIsLoading(false)
            return
          }
          setDateKey(foundDateKey)
        }
        // Now, load appointment data using foundDateKey
        const appointmentRef = ref(db, `patients/opddetail/${foundDateKey}/${uhid}/${appointmentId}`)
        const appointmentSnap = await get(appointmentRef)
        if (!appointmentSnap.exists()) {
          setError(`Appointment not found for UHID: ${uhid} and ID: ${appointmentId}`)
          setIsLoading(false)
          return
        }
        const appointmentData = appointmentSnap.val()
        // Patient info
        const patientRef = ref(db, `patients/patientinfo/${uhid}`)
        const patientSnap = await get(patientRef)
        const patientData = patientSnap.exists() ? patientSnap.val() : {}

        // Modalities
        let modalities: ModalitySelection[] = []
        if (appointmentData.modalities && Array.isArray(appointmentData.modalities)) {
          modalities = appointmentData.modalities.map((modality: any, index: number) => {
            let doctorId = ""
            if (modality.doctor) {
              const matchedDoctor = doctors.find((d) => d.name === modality.doctor)
              doctorId = matchedDoctor ? matchedDoctor.id : "no_doctor"
            }
            return {
              id: `modality_${Date.now()}_${index}`,
              type: modality.type,
              doctor: doctorId,
              specialist: modality.specialist || "",
              visitType: modality.visitType || "first",
              service: modality.service || "",
              study: modality.study || "",
              charges: modality.charges || 0,
            }
          })
        }

        let doctorId = ""
        if (appointmentData.doctor) {
          const matchedDoctor = doctors.find((d) => d.name === appointmentData.doctor)
          doctorId = matchedDoctor ? matchedDoctor.id : "no_doctor"
        }

        reset({
          name: appointmentData.name || patientData.name || "",
          phone: appointmentData.phone || patientData.phone || "",
          age: Number(patientData.age ?? appointmentData.age ?? undefined),
          ageUnit: patientData.ageUnit || appointmentData.ageUnit || "years", // Load age unit
          gender: patientData.gender || appointmentData.gender || "",
          address: patientData.address || appointmentData.address || "",
          date: new Date(appointmentData.date),
          time: appointmentData.time,
          message: appointmentData.message || "",
          paymentMethod: appointmentData.payment?.paymentMethod || "cash",
          cashAmount: appointmentData.payment?.cashAmount || 0,
          onlineAmount: appointmentData.payment?.onlineAmount || 0,
          discount: appointmentData.payment?.discount || 0,
          modalities: modalities,
          appointmentType: appointmentData.appointmentType || "visithospital",
          opdType: appointmentData.opdType || "",
          doctor: doctorId || "",
          specialist: appointmentData.specialist || "",
          visitType: appointmentData.visitType || "first",
          study: appointmentData.study || "",
          referredBy: appointmentData.referredBy || "",
        })
        setError(null)
      } catch (error) {
        console.error("Error loading appointment:", error)
        setError("Failed to load appointment data. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }
    loadAppointmentData()
  }, [uhid, appointmentId, doctors, reset, dateKey])

  // On save: always update correct dateKey path
  const onSubmit = async (data: IFormInput) => {
    if (!uhid || !appointmentId || !dateKey) {
      toast.error("Missing appointment information")
      return
    }
    setIsSaving(true)
    try {
      const cash = data.appointmentType === "visithospital" ? Number(data.cashAmount) || 0 : 0
      const online = data.appointmentType === "visithospital" ? Number(data.onlineAmount) || 0 : 0
      const discount = data.appointmentType === "visithospital" ? Number(data.discount) || 0 : 0
      const totalCharges = data.modalities.reduce((total, modality) => total + modality.charges, 0)
      const totalPaid = cash + online

      // Update patient info
      await update(ref(db, `patients/patientinfo/${uhid}`), {
        name: data.name,
        phone: data.phone,
        age: data.age,
        ageUnit: data.ageUnit, // Save age unit
        gender: data.gender,
        address: data.address,
        updatedAt: new Date().toISOString(),
      })

      // Store all modalities with doctor names instead of IDs
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

      const mainDoctorName = data.doctor ? doctors.find((d) => d.id === data.doctor)?.name || data.doctor : null

      // Update appointment data (always use dateKey)
      const updatedAppointmentData = {
        name: data.name,
        phone: data.phone,
        patientId: uhid,
        date: data.date.toISOString(),
        time: data.time,
        doctor: mainDoctorName,
        modalities: modalitiesData,
        visitType: data.visitType,
        study: data.study,
        message: data.message,
        referredBy: data.referredBy,
        appointmentType: data.appointmentType,
        opdType: data.opdType,
        lastModifiedBy: currentUserEmail || "unknown",
        lastModifiedAt: new Date().toISOString(),
      }

      await update(ref(db, `patients/opddetail/${dateKey}/${uhid}/${appointmentId}`), updatedAppointmentData)

      if (data.appointmentType === "visithospital") {
        await update(ref(db, `patients/opddetail/${dateKey}/${uhid}/${appointmentId}/payment`), {
          cashAmount: cash,
          onlineAmount: online,
          paymentMethod: data.paymentMethod,
          discount,
          totalCharges: totalCharges,
          totalPaid: totalPaid,
          updatedAt: new Date().toISOString(),
        })
      }

      // Log the change
      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "edit",
        appointmentId: appointmentId,
        patientId: uhid,
        patientName: data.name,
        editedBy: currentUserEmail || "unknown",
        editedAt: new Date().toISOString(),
        changes: updatedAppointmentData,
      })

      toast.success("Appointment updated successfully!")
      setTimeout(() => {
        router.push("/opdlist")
      }, 1500)
    } catch (error) {
      console.error("Error updating appointment:", error)
      toast.error("Failed to update appointment")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h2 className="text-xl font-semibold text-gray-700">Loading Appointment...</h2>
              <p className="text-gray-500">Please wait while we fetch the appointment details.</p>
              <p className="text-xs text-gray-400">
                UHID: {uhid} | ID: {appointmentId?.substring(0, 8)}...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold text-gray-700">Error</h2>
              <Alert variant="destructive">
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="text-xs text-gray-500 space-y-1">
                <p>UHID: {uhid || "Not provided"}</p>
                <p>Appointment ID: {appointmentId || "Not provided"}</p>
              </div>
              <Button onClick={() => router.push("/opdlist")} className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to Manage OPD
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <ToastContainer />
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Appointment</h1>
                <p className="text-sm text-gray-500">
                  UHID: {uhid} | ID: {appointmentId?.substring(0, 8)}...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <Button variant="outline" onClick={() => router.push("/opdlist")} className="ml-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Manage
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <CardTitle className="text-xl">Edit Appointment Details</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <EditAppointmentForm
                form={form}
                doctors={doctors}
                appointmentId={appointmentId || undefined}
                patientId={uhid || undefined}
              />
              <div className="flex justify-between pt-6 border-t bg-gray-50 -mx-6 px-6 -mb-6 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/opdlist")}
                  className="min-w-[120px]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition min-w-[150px]"
                >
                  {isSaving ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </div>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
