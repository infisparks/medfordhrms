"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, get, set, serverTimestamp } from "firebase/database"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Scissors, Calendar, FileText, User, Phone, Activity, Badge } from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

interface SurgeryData {
  ipdId: string
  surgeryDate: string
  surgeryTitle: string
  finalDiagnosis: string
  updatedAt: any
  createdAt?: any
}

export default function SurgeryPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  const ipdId = params.ipdId as string

  // Get current date for default value
  const currentDate = new Date().toISOString().split("T")[0]

  // State for form data
  const [surgeryDate, setSurgeryDate] = useState(currentDate)
  const [surgeryTitle, setSurgeryTitle] = useState("")
  const [finalDiagnosis, setFinalDiagnosis] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // State for patient data
  const [patientData, setPatientData] = useState<any>(null)
  const [ipdData, setIpdData] = useState<any>(null)
  const [hasSurgeryData, setHasSurgeryData] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch patient data and check for existing surgery data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch patient data
        const patientRef = ref(db, `patients/${userId}`)
        const patientSnapshot = await get(patientRef)

        if (!patientSnapshot.exists()) {
          toast.error("Patient not found")
          return
        }

        const patientData = patientSnapshot.val()
        setPatientData(patientData)

        // Get IPD data
        if (patientData.ipd && patientData.ipd[ipdId]) {
          setIpdData(patientData.ipd[ipdId])
        }

        // Check for existing surgery data
        if (patientData.surgery) {
          setHasSurgeryData(true)
          setSurgeryDate(patientData.surgery.surgeryDate || currentDate)
          setSurgeryTitle(patientData.surgery.surgeryTitle || "")
          setFinalDiagnosis(patientData.surgery.finalDiagnosis || "")
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        toast.error("Failed to load patient data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId, ipdId, currentDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!surgeryDate || !surgeryTitle || !finalDiagnosis) {
      toast.error("All fields are required")
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare the data to save
      const surgeryData: SurgeryData = {
        ipdId,
        surgeryDate,
        surgeryTitle,
        finalDiagnosis,
        updatedAt: serverTimestamp(),
      }

      // If this is a new entry, add createdAt
      if (!hasSurgeryData) {
        surgeryData.createdAt = serverTimestamp()
      }

      // Save directly to the surgery node without generating a unique key
      const surgeryRef = ref(db, `patients/${userId}/surgery`)
      await set(surgeryRef, surgeryData)

      toast.success(hasSurgeryData ? "Surgery entry updated successfully!" : "Surgery entry saved successfully!")

      // Navigate back after a short delay
      setTimeout(() => {
        router.push(`/patients/${userId}/ipd/${ipdId}`)
      }, 2000)
    } catch (error) {
      console.error("Error saving surgery entry:", error)
      toast.error("Failed to save surgery entry. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
        <span className="ml-3 text-blue-700">Loading patient data...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-12">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-lg">
            <div className="flex items-center gap-3 mb-2">
              <Scissors className="h-8 w-8" />
              <CardTitle className="text-2xl font-bold">
                {hasSurgeryData ? "Edit Surgery Entry" : "New Surgery Entry"}
              </CardTitle>
            </div>
          </CardHeader>

          {/* Patient Information Card */}
          {patientData && (
            <div className="bg-white p-4 border-b border-slate-200">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold">{patientData.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-blue-500" />
                    <span>{patientData.phone}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span>{patientData.age} years</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className="h-3 w-3 text-blue-500" />
                    <span>{patientData.gender}</span>
                  </div>
                </div>
                {ipdData && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md text-sm">
                    <h4 className="font-medium text-blue-700">IPD Details</h4>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>Admission Date: {new Date(ipdData.date).toLocaleDateString()}</div>
                      <div>Room: {ipdData.roomType}</div>
                      <div>Doctor: {ipdData.doctor}</div>
                      <div>Admission Type: {ipdData.admissionType}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Surgery Date Field */}
              <div className="space-y-2">
                <Label htmlFor="surgeryDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span>Surgery Date</span>
                </Label>
                <Input
                  id="surgeryDate"
                  type="date"
                  value={surgeryDate}
                  onChange={(e) => setSurgeryDate(e.target.value)}
                  className="border-slate-300"
                  required
                />
              </div>

              {/* Surgery Title Field */}
              <div className="space-y-2">
                <Label htmlFor="surgeryTitle" className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-blue-500" />
                  <span>Title of Surgery</span>
                </Label>
                <Input
                  id="surgeryTitle"
                  type="text"
                  value={surgeryTitle}
                  onChange={(e) => setSurgeryTitle(e.target.value)}
                  placeholder="Enter title of surgery"
                  className="border-slate-300"
                  required
                />
              </div>

              {/* Final Diagnosis Field */}
              <div className="space-y-2">
                <Label htmlFor="finalDiagnosis" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span>Final Diagnosis</span>
                </Label>
                <Textarea
                  id="finalDiagnosis"
                  value={finalDiagnosis}
                  onChange={(e) => setFinalDiagnosis(e.target.value)}
                  placeholder="Enter final diagnosis"
                  className="border-slate-300 min-h-[120px]"
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="border-slate-300"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      {hasSurgeryData ? "Updating..." : "Saving..."}
                    </>
                  ) : hasSurgeryData ? (
                    "Update Surgery Entry"
                  ) : (
                    "Save Surgery Entry"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
