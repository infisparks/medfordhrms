"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, get } from "firebase/database"
import { db } from "../../../../lib/firebase"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Phone, Building, Bed, User } from "lucide-react"

import PatientCharges from "./patientchareges"
import GlucoseMonitoring from "./glucosemonitoring"
import PatientAdmissionAssessment from "./patientadmissionassessment"
import InvestigationSheet from "./investigationsheet"
import ClinicNote from "./clinicnote"
import ProgressNotes from "./progressnotes"
import NurseNoteComponent from "./nursenote"
import VitalObservations from "./vitalobservations"
import DoctorVisits from "./doctorvisit"

type TabValue =
  | "charge"
  | "glucose"
  | "admission"
  | "investigation"
  | "clinic"
  | "progress"
  | "nurse"
  | "vital"
  | "doctor"

interface PatientInfo {
  name: string
  phone: string
  ward: string
  bed: string
}

export default function ManagePatientPageTabs() {
  const router = useRouter()

  /* ---------- URL parameters ---------- */
  const { patientId, ipdId } = useParams<{
    patientId: string
    ipdId: string
  }>()

  /* ---------- state ---------- */
  const [activeTab, setActiveTab] = useState<TabValue>("charge")
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /* ---------- fetch patient header data (Updated Logic) ---------- */
  useEffect(() => {
    if (!patientId || !ipdId) return

    const fetchPatientData = async () => {
      setIsLoading(true)
      try {
        // 1. Fetch main IPD record from the new path
        const ipdInfoRef = ref(db, `patients/ipddetail/userinfoipd/${patientId}/${ipdId}`)
        const ipdSnap = await get(ipdInfoRef)

        if (!ipdSnap.exists()) {
          console.error("Patient IPD record not found.")
          setIsLoading(false)
          return
        }

        const ipdData = ipdSnap.val()
        const name = ipdData.name ?? "Patient"
        const phone = ipdData.phone ?? "-"
        const ward = (ipdData.roomType ?? "N/A").replace(/_/g, " ")
        const bedId = ipdData.bed
        const roomType = ipdData.roomType

        let bedNumber = "-"

        // 2. If bed and roomType IDs exist, fetch the bed number
        if (bedId && roomType) {
          const bedRef = ref(db, `beds/${roomType}/${bedId}`)
          const bedSnap = await get(bedRef)
          if (bedSnap.exists()) {
            bedNumber = bedSnap.val().bedNumber ?? "-"
          }
        }

        setPatientInfo({
          name,
          phone,
          ward,
          bed: bedNumber,
        })
      } catch (err) {
        console.error("Error fetching patient data:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPatientData()
  }, [patientId, ipdId])

  /* ---------- tab metadata ---------- */
  const tabs = [
    { value: "charge", label: "Charges" },
    { value: "glucose", label: "Glucose" },
    { value: "admission", label: "Admission" },
    { value: "investigation", label: "Investigation" },
    { value: "clinic", label: "Clinic" },
    { value: "progress", label: "Progress" },
    { value: "nurse", label: "Nurse" },
    { value: "vital", label: "Vitals" },
    { value: "doctor", label: "Doctor" },
  ]

  const handleGoBack = () => {
    router.back()
  }

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        {/* Back and Add Discharge Summary buttons */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="text-slate-600 hover:text-slate-900 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              router.push(`/discharge-summary/${patientId}/${ipdId}`)
            }}
          >
            Add Discharge Summary
          </Button>
        </div>

        {/* Patient header */}
        {isLoading ? (
          <div className="h-24 animate-pulse bg-slate-200 rounded-lg mb-6"></div>
        ) : (
          <Card className="mb-6 overflow-hidden border-none shadow-md">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 md:p-6">
              <div className="flex items-center">
                <div className="bg-white/20 p-2 rounded-full mr-4">
                  <User className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white capitalize">
                    {patientInfo?.name || "Patient"}
                  </h1>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {patientInfo?.phone && (
                      <div className="flex items-center text-white/90 text-sm">
                        <Phone className="h-3 w-3 mr-1" />
                        {patientInfo.phone}
                      </div>
                    )}
                    {patientInfo?.ward && (
                      <div className="flex items-center text-white/90 text-sm capitalize">
                        <Building className="h-3 w-3 mr-1" />
                        {patientInfo.ward}
                      </div>
                    )}
                    {patientInfo?.bed && (
                      <div className="flex items-center text-white/90 text-sm">
                        <Bed className="h-3 w-3 mr-1" />
                        Bed: {patientInfo.bed}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* tabs */}
        <Card className="shadow-md border-none overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
            {/* tab bar */}
            <div className="relative px-4 pt-4 pb-2 bg-white border-b">
              <div className="overflow-x-auto scrollbar-hide pb-1">
                <TabsList className="flex space-x-1 whitespace-nowrap bg-slate-100/80 rounded-lg p-1">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className={`px-3 py-1.5 text-xs sm:text-sm flex-shrink-0 rounded-md transition-all duration-200 ${
                        activeTab === t.value
                          ? "bg-white shadow-sm text-blue-700 font-medium"
                          : "text-slate-700 hover:bg-slate-200/50"
                      }`}
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {/* tab panels */}
            <div className="p-4 md:p-6 bg-white">
              <TabsContent value="charge" className="mt-0">
                <PatientCharges />
              </TabsContent>
              <TabsContent value="glucose" className="mt-0">
                <GlucoseMonitoring />
              </TabsContent>
              <TabsContent value="admission" className="mt-0">
                <PatientAdmissionAssessment />
              </TabsContent>
              <TabsContent value="investigation" className="mt-0">
                <InvestigationSheet />
              </TabsContent>
              <TabsContent value="clinic" className="mt-0">
                <ClinicNote />
              </TabsContent>
              <TabsContent value="vital" className="mt-0">
                <VitalObservations />
              </TabsContent>
              <TabsContent value="progress" className="mt-0">
                <ProgressNotes />
              </TabsContent>
              <TabsContent value="nurse" className="mt-0">
                <NurseNoteComponent />
              </TabsContent>

              <TabsContent value="doctor" className="mt-0">
                <DoctorVisits />
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}