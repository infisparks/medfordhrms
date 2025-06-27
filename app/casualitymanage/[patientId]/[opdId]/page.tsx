"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { db } from "../../../../lib/firebase"
import { ref, get, update } from "firebase/database"
import { format } from "date-fns"
import {
  User,
  Phone,
  Cake,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  Building,
  Ambulance,
  MessageSquare,
  Download,
  Plus,
  Trash2,
  ArrowLeft,
  IndianRupeeIcon,
} from "lucide-react"
import { jsPDF } from "jspdf"
import "jspdf-autotable"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

interface Service {
  name: string
  amount: number
}

interface PatientDetails {
  id: string
  patientId: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  doctor?: string
  serviceName?: string
  appointmentType: "oncall" | "visithospital"
  opdType: "casualty"
  createdAt: string
  // Casualty specific fields
  modeOfArrival?: "ambulance" | "walkin" | "referred"
  broughtBy?: string
  referralHospital?: string
  broughtDead?: boolean
  caseType?: string
  otherCaseType?: string
  incidentDescription?: string
  isMLC?: boolean
  mlcNumber?: string
  policeInformed?: boolean
  services?: Service[]
  // Payment details
  paymentMethod?: string
  amount?: number
  discount?: number
}

const CasualtyPatientDetailsPage = () => {
  const params = useParams()
  const router = useRouter()
  const { patientId, opdId } = params

  const [patient, setPatient] = useState<PatientDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [newService, setNewService] = useState<Service>({ name: "", amount: 0 })
  const [services, setServices] = useState<Service[]>([])
  const [savingService, setSavingService] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Fetch patient details
  useEffect(() => {
    const fetchPatientDetails = async () => {
      setLoading(true)
      try {
        // First check if this is an oncall appointment
        const oncallRef = ref(db, `oncall/${opdId}`)
        const oncallSnapshot = await get(oncallRef)

        if (oncallSnapshot.exists()) {
          // This is an oncall appointment
          const data = oncallSnapshot.val()
          setPatient({
            id: opdId as string,
            patientId: patientId as string,
            ...data,
          })
          setServices(data.services || [])
        } else {
          // This is a regular patient appointment
          const patientRef = ref(db, `patients/${patientId}/opd/${opdId}`)
          const patientSnapshot = await get(patientRef)

          if (patientSnapshot.exists()) {
            const opdData = patientSnapshot.val()

            // Get patient basic info
            const patientInfoRef = ref(db, `patients/${patientId}`)
            const patientInfoSnapshot = await get(patientInfoRef)

            if (patientInfoSnapshot.exists()) {
              const patientInfo = patientInfoSnapshot.val()
              setPatient({
                id: opdId as string,
                patientId: patientId as string,
                name: patientInfo.name,
                phone: patientInfo.phone,
                age: patientInfo.age,
                gender: patientInfo.gender,
                ...opdData,
              })
              setServices(opdData.services || [])
            }
          }
        }
      } catch (error) {
        console.error("Error fetching patient details:", error)
        toast.error("Failed to load patient details")
      } finally {
        setLoading(false)
      }
    }

    if (patientId && opdId) {
      fetchPatientDetails()
    }
  }, [patientId, opdId])

  // Handle adding a new service
  const handleAddService = async () => {
    if (newService.name.trim() === "" || newService.amount <= 0) {
      toast.error("Please enter a valid service name and amount")
      return
    }

    setSavingService(true)
    try {
      const updatedServices = [...services, newService]
      setServices(updatedServices)

      // Update in database
      if (patient?.appointmentType === "oncall") {
        // Update oncall record
        await update(ref(db, `oncall/${opdId}`), {
          services: updatedServices,
        })
      } else {
        // Update regular patient record
        await update(ref(db, `patients/${patientId}/opd/${opdId}`), {
          services: updatedServices,
        })
      }

      setNewService({ name: "", amount: 0 })
      setServiceDialogOpen(false)
      toast.success("Service added successfully")
    } catch (error) {
      console.error("Error adding service:", error)
      toast.error("Failed to add service")
    } finally {
      setSavingService(false)
    }
  }

  // Handle removing a service
  const handleRemoveService = async (index: number) => {
    try {
      const updatedServices = [...services]
      updatedServices.splice(index, 1)
      setServices(updatedServices)

      // Update in database
      if (patient?.appointmentType === "oncall") {
        // Update oncall record
        await update(ref(db, `oncall/${opdId}`), {
          services: updatedServices,
        })
      } else {
        // Update regular patient record
        await update(ref(db, `patients/${patientId}/opd/${opdId}`), {
          services: updatedServices,
        })
      }

      toast.success("Service removed successfully")
    } catch (error) {
      console.error("Error removing service:", error)
      toast.error("Failed to remove service")
    }
  }

  // Calculate total amount
  const calculateTotalAmount = () => {
    const baseAmount = patient?.amount || 0
    const discount = patient?.discount || 0
    const servicesTotal = services.reduce((total, service) => total + service.amount, 0)
    return baseAmount + servicesTotal - discount
  }

  // Generate and download bill as PDF
  const generateBill = () => {
    if (!patient) return

    setGeneratingPdf(true)
    try {
      const doc = new jsPDF()

      // Add hospital logo/header
      doc.setFontSize(20)
      doc.setTextColor(0, 128, 0) // Green color for hospital name
      doc.text("Gautami Hospital", 105, 20, { align: "center" })

      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0) // Reset to black
      doc.text("Medical Bill / Receipt", 105, 30, { align: "center" })

      // Add a line
      doc.setDrawColor(0, 128, 0)
      doc.line(20, 35, 190, 35)

      // Patient details
      doc.setFontSize(11)
      doc.text(`Patient Name: ${patient.name}`, 20, 45)
      doc.text(`Patient ID: ${patient.patientId}`, 20, 52)
      doc.text(`Age/Gender: ${patient.age} / ${patient.gender.toUpperCase()}`, 20, 59)
      doc.text(`Phone: ${patient.phone}`, 20, 66)

      // Bill details on right side
      doc.text(`Bill Date: ${format(new Date(), "dd/MM/yyyy")}`, 130, 45)
      doc.text(`Appointment Date: ${format(new Date(patient.date), "dd/MM/yyyy")}`, 130, 52)
      doc.text(`Time: ${patient.time}`, 130, 59)
      doc.text(`Bill #: ${opdId}`, 130, 66)

      // Casualty details
      doc.setFontSize(12)
      doc.setTextColor(220, 20, 60) // Crimson color for casualty
      doc.text("CASUALTY CASE", 105, 76, { align: "center" })

      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0) // Reset to black

      // Case details
      let yPos = 83
      doc.text(`Case Type: ${patient.caseType === "other" ? patient.otherCaseType : patient.caseType}`, 20, yPos)
      yPos += 7

      if (patient.modeOfArrival) {
        doc.text(`Mode of Arrival: ${patient.modeOfArrival}`, 20, yPos)
        yPos += 7
      }

      if (patient.isMLC) {
        doc.text(`MLC Number: ${patient.mlcNumber || "Not provided"}`, 20, yPos)
        yPos += 7
      }

      // Services table
      yPos += 5
      doc.setFontSize(12)
      doc.text("Services & Charges", 20, yPos)
      yPos += 5

      // Create table for services
      const tableColumn = ["S.No", "Service Description", "Amount (₹)"]
      const tableRows: any[] = []

      // Add main service
      tableRows.push([1, patient.serviceName, patient.amount || 0])
      // Add additional services
      services.forEach((service, index) => {
        tableRows.push([index + 2, service.name, service.amount])
      })

      // Add table
      ;(doc as any).autoTable({
          head: [tableColumn],
          body: tableRows,
          startY: yPos,
          theme: "grid",
          styles: { fontSize: 10 },
          headStyles: { fillColor: [0, 128, 0] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 100 },
            2: { cellWidth: 30 },
          },
        })

      // Get the y position after the table
      const finalY = (doc as any).lastAutoTable.finalY + 10

      // Add total calculation
      const baseAmount = patient.amount || 0
      const servicesTotal = services.reduce((total, service) => total + service.amount, 0)
      const subtotal = baseAmount + servicesTotal
      const discount = patient.discount || 0
      const total = subtotal - discount

      doc.text(`Subtotal: ₹${subtotal}`, 150, finalY)
      if (discount > 0) {
        doc.text(`Discount: ₹${discount}`, 150, finalY + 7)
      }
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text(`Total Amount: ₹${total}`, 150, finalY + (discount > 0 ? 14 : 7))

      // Footer
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text("Thank you for choosing Gautami Hospital", 105, 280, { align: "center" })

      // Save the PDF
      doc.save(`Bill_${patient.name}_${format(new Date(), "dd-MM-yyyy")}.pdf`)

      toast.success("Bill downloaded successfully")
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to generate bill")
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Get case type label
  const getCaseTypeLabel = (caseType?: string, otherCaseType?: string) => {
    if (!caseType) return "Not specified"

    const caseTypeMap: Record<string, string> = {
      rta: "Road Traffic Accident (RTA)",
      physicalAssault: "Physical Assault",
      burn: "Burn",
      poisoning: "Poisoning",
      snakeBite: "Snake/Insect Bite",
      cardiac: "Cardiac Emergency",
      fall: "Fall",
      other: otherCaseType || "Other",
    }

    return caseTypeMap[caseType] || caseType
  }

  // Get mode of arrival label
  const getModeOfArrivalLabel = (mode?: string) => {
    if (!mode) return "Not specified"

    const modeMap: Record<string, string> = {
      ambulance: "Ambulance",
      walkin: "Walk-in",
      referred: "Referred",
    }

    return modeMap[mode] || mode
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Patient Not Found</h2>
        <p className="text-gray-500 mb-4">The patient details youre looking for could not be found.</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Patient Details</h1>
              <p className="text-gray-500 dark:text-gray-400">
                Casualty case from {format(new Date(patient.date), "dd MMMM yyyy")}
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setServiceDialogOpen(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Service
              </Button>

              <Button
                onClick={generateBill}
                disabled={generatingPdf}
                className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {generatingPdf ? "Generating..." : "Download Bill"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Patient Information Card */}
          <Card className="md:col-span-2">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div className="flex justify-between items-center">
                <CardTitle>Patient Information</CardTitle>
                <div className="flex gap-2">
                  {patient.broughtDead && (
                    <Badge variant="destructive" className="bg-white/20 text-white">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Brought Dead
                    </Badge>
                  )}
                  {patient.isMLC && (
                    <Badge variant="outline" className="border-white/50 text-white">
                      MLC
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Name</p>
                      <p className="font-medium">{patient.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                      <p className="font-medium">{patient.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Cake className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Age & Gender</p>
                      <p className="font-medium">
                        {patient.age} years, {patient.gender}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
                      <p className="font-medium">{format(new Date(patient.date), "dd MMMM yyyy")}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Time</p>
                      <p className="font-medium">{patient.time}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Case Type</p>
                      <p className="font-medium">{getCaseTypeLabel(patient.caseType, patient.otherCaseType)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Ambulance className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Mode of Arrival</p>
                      <p className="font-medium">{getModeOfArrivalLabel(patient.modeOfArrival)}</p>
                    </div>
                  </div>

                  {patient.broughtBy && (
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Brought By</p>
                        <p className="font-medium">{patient.broughtBy}</p>
                      </div>
                    </div>
                  )}

                  {patient.referralHospital && (
                    <div className="flex items-center gap-3">
                      <Building className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Referral Hospital/Doctor</p>
                        <p className="font-medium">{patient.referralHospital}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {patient.isMLC && (
                    <>
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">MLC Number</p>
                          <p className="font-medium">{patient.mlcNumber || "Not provided"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-emerald-500" />
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Police Informed</p>
                          <p className="font-medium">{patient.policeInformed ? "Yes" : "No"}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {patient.doctor && (
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Doctor</p>
                        <p className="font-medium">{patient.doctor}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {patient.incidentDescription && (
                <>
                  <Separator className="my-6" />

                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Incident Description
                    </p>
                    <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                      {patient.incidentDescription}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Billing Information Card */}
          <Card>
            <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-900 text-white">
              <CardTitle>Billing Information</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Services</h3>

                  {patient.serviceName && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>{patient.serviceName}</span>
                      <span className="font-medium">₹ {patient.amount || 0}</span>
                    </div>
                  )}

                  {services.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {services.map((service, index) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b">
                          <div className="flex items-center gap-2">
                            <span>{service.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">₹ {service.amount}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveService(index)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">No additional services added</div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setServiceDialogOpen(true)}
                    className="mt-4 w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>
                      ₹ {(patient.amount || 0) + services.reduce((total, service) => total + service.amount, 0)}
                    </span>
                  </div>

                  {(patient.discount || 0) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>- ₹ {patient.discount}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span>₹ {calculateTotalAmount()}</span>
                  </div>
                </div>

                <Button
                  onClick={generateBill}
                  disabled={generatingPdf}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {generatingPdf ? "Generating..." : "Download Bill"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Service Dialog */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Enter service details to add to the bill</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Service Name</Label>
              <Input
                id="serviceName"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="Enter service name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceAmount">Amount (₹)</Label>
              <div className="relative">
                <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="serviceAmount"
                  type="number"
                  value={newService.amount}
                  onChange={(e) => setNewService({ ...newService, amount: Number(e.target.value) })}
                  placeholder="Enter amount"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddService} disabled={savingService}>
              {savingService ? "Adding..." : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default CasualtyPatientDetailsPage
