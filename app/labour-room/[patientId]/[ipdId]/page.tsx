"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ref, get, set } from "firebase/database"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { format } from "date-fns"
import { CalendarIcon, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InfoIcon } from "lucide-react"

interface LabourRoomRecord {
  motherName: string
  deliveryMode: "normal" | "c-section"
  babyGender: "male" | "female" | "other"
  dateOfBirth: string
  timeOfBirth: string
  isInICU: boolean
  createdAt: string
  updatedAt?: string
}

export default function LabourRoomPage({ params }: { params: { patientId: string; ipdId: string } }) {
  const router = useRouter()
  const { patientId, ipdId } = params

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [patientData, setPatientData] = useState<any>(null)
  const [existingRecord, setExistingRecord] = useState<boolean>(false)
  const [formData, setFormData] = useState<LabourRoomRecord>({
    motherName: "",
    deliveryMode: "normal",
    babyGender: "male",
    dateOfBirth: format (new Date(), "yyyy-MM-dd"),
    timeOfBirth:  format (new Date(), "HH:mm"),
    isInICU: false,
    createdAt: new Date().toISOString(),
  })

  // Fetch patient data and check for existing labour room record
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch patient data
        const patientRef = ref(db, `patients/${patientId}`)
        const patientSnapshot = await get(patientRef)

        if (!patientSnapshot.exists()) {
          console.error("Patient not found")
          router.push("/patients")
          return
        }

        const patientData = patientSnapshot.val()
        setPatientData(patientData)

        // Check for existing labour room record
        const labourRoomRef = ref(db, `patients/${patientId}/ipd/${ipdId}/labourRoom`)
        const labourRoomSnapshot = await get(labourRoomRef)

        if (labourRoomSnapshot.exists()) {
          // Existing record found, load it
          const labourRoomData = labourRoomSnapshot.val()
          setFormData({
            motherName: labourRoomData.motherName || "",
            deliveryMode: labourRoomData.deliveryMode || "normal",
            babyGender: labourRoomData.babyGender || "male",
            dateOfBirth: labourRoomData.dateOfBirth || format(new Date(), "yyyy-MM-dd"),
            timeOfBirth: labourRoomData.timeOfBirth || format(new Date(), "HH:mm"),
            isInICU: labourRoomData.isInICU || false,
            createdAt: labourRoomData.createdAt || new Date().toISOString(),
          })
          setExistingRecord(true)
        } else {
          // No existing record, pre-fill mother name if available
          if (patientData.relativeName) {
            setFormData((prev) => ({
              ...prev,
              motherName: patientData.relativeName,
            }))
          }
        }

        setIsLoading(false)
      } catch (error) {
        console.error("Error fetching data:", error)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [patientId, ipdId, router])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData((prev) => ({
        ...prev,
        dateOfBirth: format(date, "yyyy-MM-dd"),
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      // Update the record with current timestamp
      const updatedData = {
        ...formData,
        updatedAt: new Date().toISOString(),
      }

      // Save labour room record to Firebase
      const labourRoomRef = ref(db, `patients/${patientId}/ipd/${ipdId}/labourRoom`)
      await set(labourRoomRef, updatedData)

      // Navigate back to patients page
      router.push("/patients")
    } catch (error) {
      console.error("Error saving labour room record:", error)
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Labour Room Record</h1>
        <p className="text-slate-500">Record delivery details for the patient</p>
      </div>

      {existingRecord && (
        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <InfoIcon className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700">Existing Record Found</AlertTitle>
          <AlertDescription className="text-blue-600">
            You are viewing an existing labour room record. Any changes you make will update the existing record.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Patient details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-slate-500">Name</Label>
              <p className="font-medium">{patientData.name}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Mobile Number</Label>
              <p className="font-medium">{patientData.phone}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Age</Label>
              <p className="font-medium">{patientData.age}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Gender</Label>
              <p className="font-medium">{patientData.gender}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">IPD ID</Label>
              <p className="font-medium">{ipdId}</p>
            </div>
          </CardContent>
        </Card>

        {/* Labour Room Form */}
        <Card className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>{existingRecord ? "Update Delivery Details" : "Delivery Details"}</CardTitle>
              <CardDescription>
                {existingRecord ? "Update delivery information" : "Enter delivery information"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date and Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dateOfBirth && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dateOfBirth ? (
                          format(new Date(formData.dateOfBirth), "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={new Date(formData.dateOfBirth)}
                        onSelect={handleDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeOfBirth">Time of Birth</Label>
                  <Input
                    id="timeOfBirth"
                    name="timeOfBirth"
                    type="time"
                    value={formData.timeOfBirth}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Mother's Name */}
              <div className="space-y-2">
                <Label htmlFor="motherName">Mothers Name</Label>
                <Input
                  id="motherName"
                  name="motherName"
                  value={formData.motherName}
                  onChange={handleInputChange}
                  placeholder="Enter mother's name"
                  required
                />
              </div>

              {/* Delivery Mode */}
              <div className="space-y-2">
                <Label>Mode of Delivery</Label>
                <RadioGroup
                  value={formData.deliveryMode}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, deliveryMode: value as "normal" | "c-section" }))
                  }
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="normal" id="normal" />
                    <Label htmlFor="normal" className="font-normal">
                      Normal Delivery
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="c-section" id="c-section" />
                    <Label htmlFor="c-section" className="font-normal">
                      C-Section
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Baby Gender */}
              <div className="space-y-2">
                <Label>Baby Gender</Label>
                <RadioGroup
                  value={formData.babyGender}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, babyGender: value as "male" | "female" | "other" }))
                  }
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="male" id="male" />
                    <Label htmlFor="male" className="font-normal">
                      Male
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="female" id="female" />
                    <Label htmlFor="female" className="font-normal">
                      Female
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="other" />
                    <Label htmlFor="other" className="font-normal">
                      Other
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* ICU Admission */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isInICU"
                  checked={formData.isInICU}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isInICU: checked as boolean }))}
                />
                <Label htmlFor="isInICU" className="font-normal">
                  Admitted to ICU
                </Label>
              </div>

              {existingRecord && (
                <div className="pt-2 text-xs text-slate-500">
                  <p>Created: {new Date(formData.createdAt).toLocaleString()}</p>
                  {formData.updatedAt && <p>Last updated: {new Date(formData.updatedAt).toLocaleString()}</p>}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={() => router.push("/patients")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {existingRecord ? "Update Record" : "Save Record"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
