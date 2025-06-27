"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, onValue, update, push, set } from "firebase/database"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import {
  ArrowLeft,
  Plus,
  CreditCard,
  Banknote,
  Download,
  Activity,
  Heart,
  Thermometer,
  Stethoscope,
  AlertTriangle,
  Shield,
  Ambulance,
  UserCheck,
  Hospital,
  Edit,
  Save,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"

interface CasualtyRecord {
  id: string
  patientId: string
  name: string
  phone: string
  age: number
  gender: string
  dob?: string
  address?: string
  date: string
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
  vitalSigns?: {
    bloodPressure?: string
    pulse?: number
    temperature?: number
    oxygenSaturation?: number
    respiratoryRate?: number
    gcs?: number
  }
  createdAt: string
  status?: "active" | "discharged" | "transferred" | "deceased"
  payments?: Record<string, Payment>
  services?: Record<string, Service>
  discount?: number
  enteredBy?: string
}

interface Payment {
  id: string
  amount: number
  method: "cash" | "online"
  createdAt: string
  enteredBy?: string
}

interface Service {
  id: string
  name: string
  amount: number
  createdAt?: string
  enteredBy?: string
}

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

const ModeOfArrivalOptions = [
  { value: "ambulance", label: "Ambulance", icon: Ambulance },
  { value: "walkin", label: "Walk-in", icon: UserCheck },
  { value: "referred", label: "Referred", icon: Hospital },
]

export default function CasualtyDetailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invoiceRef = useRef<HTMLDivElement>(null)

  // Get parameters from URL
  const uhid = searchParams.get("uhid")
  const casualtyId = searchParams.get("casualtyId")

  // State
  const [casualtyRecord, setCasualtyRecord] = useState<CasualtyRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("details")
  const [isEditing, setIsEditing] = useState(false)

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash")

  // Service form
  const [serviceName, setServiceName] = useState("")
  const [serviceAmount, setServiceAmount] = useState("")

  // Discount form
  const [discountAmount, setDiscountAmount] = useState("")

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<CasualtyRecord>>({})

  // Fetch casualty record
  useEffect(() => {
    if (!uhid || !casualtyId) {
      toast.error("Invalid casualty record parameters")
      router.push("/casulity/list")
      return
    }

    setIsLoading(true)
    const casualtyRef = ref(db, `patients/casualtydetail/${uhid}/${casualtyId}`)
    const unsubscribe = onValue(casualtyRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const record: CasualtyRecord = {
          id: casualtyId,
          patientId: uhid,
          ...data,
          status: data.status || "active",
          payments: data.payments || {},
          services: data.services || {},
          discount: data.discount || 0,
        }
        setCasualtyRecord(record)
        setEditForm(record)
      } else {
        toast.error("Casualty record not found")
        router.push("/casulity/list")
      }
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [uhid, casualtyId, router])

  // Handle back navigation
  const handleBackToList = () => {
    router.push("/casulity/list")
  }

  // Update status
  const handleUpdateStatus = async (newStatus: CasualtyRecord["status"]) => {
    if (!casualtyRecord) return

    try {
      await update(ref(db, `patients/casualtydetail/${uhid}/${casualtyId}`), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      toast.success(`Status updated to ${newStatus}`)
    } catch (error) {
      toast.error("Failed to update status")
      console.error(error)
    }
  }

  // Add payment
  const handleAddPayment = async () => {
    if (!casualtyRecord) return
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    const newPayment: Payment = {
      id: "",
      amount: Number(paymentAmount),
      method: paymentMethod,
      createdAt: new Date().toISOString(),
      enteredBy: "current_user", // Replace with actual user
    }

    try {
      const paymentRef = push(ref(db, `patients/casualtydetail/${uhid}/${casualtyId}/payments`))
      newPayment.id = paymentRef.key || ""
      await set(paymentRef, newPayment)

      setPaymentAmount("")
      toast.success("Payment added successfully")
    } catch (error) {
      toast.error("Failed to add payment")
      console.error(error)
    }
  }

  // Add service
  const handleAddService = async () => {
    if (!casualtyRecord) return
    if (!serviceName.trim()) {
      toast.error("Please enter a service name")
      return
    }
    if (!serviceAmount || isNaN(Number(serviceAmount)) || Number(serviceAmount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    const newService: Service = {
      id: "",
      name: serviceName.trim(),
      amount: Number(serviceAmount),
      createdAt: new Date().toISOString(),
      enteredBy: "current_user", // Replace with actual user
    }

    try {
      const serviceRef = push(ref(db, `patients/casualtydetail/${uhid}/${casualtyId}/services`))
      newService.id = serviceRef.key || ""
      await set(serviceRef, newService)

      setServiceName("")
      setServiceAmount("")
      toast.success("Service added successfully")
    } catch (error) {
      toast.error("Failed to add service")
      console.error(error)
    }
  }

  // Add/Update discount
  const handleAddDiscount = async () => {
    if (!casualtyRecord) return
    if (!discountAmount || isNaN(Number(discountAmount)) || Number(discountAmount) < 0) {
      toast.error("Please enter a valid discount amount")
      return
    }

    try {
      await update(ref(db, `patients/casualtydetail/${uhid}/${casualtyId}`), {
        discount: Number(discountAmount),
        updatedAt: new Date().toISOString(),
      })

      setDiscountAmount("")
      toast.success("Discount updated successfully")
    } catch (error) {
      toast.error("Failed to update discount")
      console.error(error)
    }
  }

  // Save edited details
  const handleSaveEdit = async () => {
    if (!casualtyRecord || !editForm) return

    try {
      await update(ref(db, `patients/casualtydetail/${uhid}/${casualtyId}`), {
        ...editForm,
        updatedAt: new Date().toISOString(),
      })

      // Also update patient info if basic details changed
      if (editForm.name || editForm.phone || editForm.age || editForm.gender || editForm.address) {
        await update(ref(db, `patients/patientinfo/${uhid}`), {
          name: editForm.name,
          phone: editForm.phone,
          age: editForm.age,
          gender: editForm.gender,
          address: editForm.address,
          updatedAt: new Date().toISOString(),
        })
      }

      setIsEditing(false)
      toast.success("Details updated successfully")
    } catch (error) {
      toast.error("Failed to update details")
      console.error(error)
    }
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "PPp")
    } catch (e) {
      return dateString
    }
  }

  // Convert number to words for invoice
  function convertNumberToWords(num: number): string {
    const a = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ]
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    if ((num = Math.floor(num)) === 0) return "Zero"
    if (num < 20) return a[num]
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "")
    if (num < 1000)
      return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convertNumberToWords(num % 100) : "")
    if (num < 1000000)
      return (
        convertNumberToWords(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + convertNumberToWords(num % 1000) : "")
      )
    if (num < 1000000000)
      return (
        convertNumberToWords(Math.floor(num / 1000000)) +
        " Million" +
        (num % 1000000 ? " " + convertNumberToWords(num % 1000000) : "")
      )
    return (
      convertNumberToWords(Math.floor(num / 1000000000)) +
      " Billion" +
      (num % 1000000000 ? " " + convertNumberToWords(num % 1000000000) : "")
    )
  }

  // Generate PDF for invoice
  const generatePDF = async (): Promise<jsPDF> => {
    if (!invoiceRef.current) throw new Error("Invoice element not found.")

    await new Promise((resolve) => setTimeout(resolve, 100))
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: null,
    })

    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    })

    const pdfWidth = 595
    const pdfHeight = 842
    const topMargin = 120
    const bottomMargin = 80
    const sideMargin = 20
    const contentHeight = pdfHeight - topMargin - bottomMargin
    const scaleRatio = pdfWidth / canvas.width
    const fullContentHeightPts = canvas.height * scaleRatio

    let currentPos = 0
    let pageCount = 0

    while (currentPos < fullContentHeightPts) {
      pageCount += 1
      if (pageCount > 1) pdf.addPage()

      const sourceY = Math.floor(currentPos / scaleRatio)
      const sourceHeight = Math.floor(contentHeight / scaleRatio)
      const pageCanvas = document.createElement("canvas")
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight
      const pageCtx = pageCanvas.getContext("2d")

      if (pageCtx) {
        pageCtx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)
      }

      const chunkImgData = pageCanvas.toDataURL("image/png")
      const chunkHeightPts = sourceHeight * scaleRatio
      pdf.addImage(chunkImgData, "PNG", sideMargin, topMargin, pdfWidth - 2 * sideMargin, chunkHeightPts, "", "FAST")
      currentPos += contentHeight
    }

    return pdf
  }

  // Download invoice
  const handleDownloadInvoice = async () => {
    if (!casualtyRecord) return

    try {
      const pdf = await generatePDF()
      const fileName = `Casualty_Invoice_${casualtyRecord.name}_${casualtyRecord.id}.pdf`
      pdf.save(fileName)
      toast.success("Invoice downloaded successfully")
    } catch (error) {
      console.error(error)
      toast.error("Failed to generate the invoice PDF")
    }
  }

  // Send invoice via WhatsApp
  const handleSendPdfOnWhatsapp = async () => {
    if (!casualtyRecord) return

    try {
      const pdf = await generatePDF()
      const pdfBlob = pdf.output("blob")
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.")

      const storage = getStorage()
      const storagePath = `casualty-invoices/invoice-${casualtyRecord.id}-${Date.now()}.pdf`
      const fileRef = storageRef(storage, storagePath)
      await uploadBytes(fileRef, pdfBlob)
      const downloadUrl = await getDownloadURL(fileRef)

      const formattedNumber = casualtyRecord.phone.startsWith("91") ? casualtyRecord.phone : `91${casualtyRecord.phone}`
      const payload = {
        token: "99583991572",
        number: formattedNumber,
        imageUrl: downloadUrl,
        caption:
          "Dear Patient, please find attached your casualty invoice PDF. Thank you for choosing Gautami Hospital Emergency Department.",
      }

      const response = await fetch("https://wa.medblisss.com/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to send the invoice on WhatsApp.")
      }

      toast.success("Invoice PDF sent successfully on WhatsApp!")
    } catch (error) {
      console.error(error)
      toast.error("An error occurred while sending the invoice PDF on WhatsApp.")
    }
  }

  // Calculate totals
  const calculateTotals = () => {
    if (!casualtyRecord) return { subtotal: 0, discount: 0, total: 0, paid: 0, due: 0 }

    const subtotal = casualtyRecord.services
      ? Object.values(casualtyRecord.services).reduce((sum, service) => sum + service.amount, 0)
      : 0

    const discount = casualtyRecord.discount || 0
    const total = subtotal - discount

    const paid = casualtyRecord.payments
      ? Object.values(casualtyRecord.payments).reduce((sum, payment) => sum + payment.amount, 0)
      : 0

    const due = Math.max(0, total - paid)

    return { subtotal, discount, total, paid, due }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600">Loading casualty details...</p>
        </div>
      </div>
    )
  }

  if (!casualtyRecord) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Record Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The casualty record youre looking for doesnt exist.</p>
          <Button onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </div>
      </div>
    )
  }

  const totals = calculateTotals()
  const triageOption = TriageCategoryOptions.find((t) => t.value === casualtyRecord.triageCategory)
  const caseTypeOption = CaseTypeOptions.find((c) => c.value === casualtyRecord.caseType)
  const modeOfArrivalOption = ModeOfArrivalOptions.find((m) => m.value === casualtyRecord.modeOfArrival)

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-6xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBackToList}
                      className="text-white hover:bg-white/20"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <div>
                      <CardTitle className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                        <AlertTriangle className="h-8 w-8" />
                        {casualtyRecord.name}
                      </CardTitle>
                      <CardDescription className="text-red-100">
                        Case ID: {casualtyRecord.id} | UHID: {casualtyRecord.patientId}
                      </CardDescription>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`${triageOption?.color} text-white`}>{triageOption?.label}</Badge>
                  <Badge
                    className={
                      casualtyRecord.status === "active"
                        ? "bg-blue-500"
                        : casualtyRecord.status === "discharged"
                          ? "bg-green-500"
                          : casualtyRecord.status === "transferred"
                            ? "bg-yellow-500 text-black"
                            : "bg-gray-700"
                    }
                  >
                    {casualtyRecord.status ? `${casualtyRecord.status.charAt(0).toUpperCase()}${casualtyRecord.status.slice(1)}` : ''}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-4 grid grid-cols-4 gap-2 bg-muted/20 p-1 rounded-lg">
                  <TabsTrigger
                    value="details"
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    Patient Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="payments"
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    Payments
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    Services & Billing
                  </TabsTrigger>
                  <TabsTrigger
                    value="invoice"
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    Invoice
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6">
                  <div className="flex justify-end mb-4">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700">
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => setIsEditing(true)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Details
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <UserCheck className="h-5 w-5 text-blue-600" />
                          Personal Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {isEditing ? (
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="edit-name">Name</Label>
                              <Input
                                id="edit-name"
                                value={editForm.name || ""}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-phone">Phone</Label>
                              <Input
                                id="edit-phone"
                                value={editForm.phone || ""}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label htmlFor="edit-age">Age</Label>
                                <Input
                                  id="edit-age"
                                  type="number"
                                  value={editForm.age || ""}
                                  onChange={(e) => setEditForm({ ...editForm, age: Number(e.target.value) })}
                                />
                              </div>
                              <div>
                                <Label htmlFor="edit-gender">Gender</Label>
                                <Select
                                  value={editForm.gender || ""}
                                  onValueChange={(value) => setEditForm({ ...editForm, gender: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select gender" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="edit-address">Address</Label>
                              <Textarea
                                id="edit-address"
                                value={editForm.address || ""}
                                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Name</p>
                              <p className="font-medium">{casualtyRecord.name}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Phone</p>
                              <p>{casualtyRecord.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Age</p>
                              <p>{casualtyRecord.age} years</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Gender</p>
                              <p className="capitalize">{casualtyRecord.gender}</p>
                            </div>
                            {casualtyRecord.dob && (
                              <div>
                                <p className="text-sm font-medium text-gray-500">Date of Birth</p>
                                <p>{new Date(casualtyRecord.dob).toLocaleDateString()}</p>
                              </div>
                            )}
                            {casualtyRecord.address && (
                              <div className="col-span-2">
                                <p className="text-sm font-medium text-gray-500">Address</p>
                                <p>{casualtyRecord.address}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Emergency Information */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          Emergency Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Date & Time</p>
                            <p>
                              {new Date(casualtyRecord.date).toLocaleDateString()} {casualtyRecord.time}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Case Type</p>
                            <p>
                              {casualtyRecord.caseType === "other"
                                ? casualtyRecord.otherCaseType
                                : caseTypeOption?.label}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Triage Category</p>
                            <Badge className={`${triageOption?.color} text-white`}>{triageOption?.label}</Badge>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Mode of Arrival</p>
                            <div className="flex items-center gap-1">
                              {modeOfArrivalOption?.icon && <modeOfArrivalOption.icon className="h-4 w-4" />}
                              {modeOfArrivalOption?.label}
                            </div>
                          </div>
                          {casualtyRecord.broughtBy && (
                            <div>
                              <p className="text-sm font-medium text-gray-500">Brought By</p>
                              <p>{casualtyRecord.broughtBy}</p>
                            </div>
                          )}
                          {casualtyRecord.referralHospital && (
                            <div>
                              <p className="text-sm font-medium text-gray-500">Referral Hospital</p>
                              <p>{casualtyRecord.referralHospital}</p>
                            </div>
                          )}
                          {casualtyRecord.attendingDoctor && (
                            <div>
                              <p className="text-sm font-medium text-gray-500">Attending Doctor</p>
                              <p>{casualtyRecord.attendingDoctor}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Legal Information */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-purple-600" />
                          Legal Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-500">MLC Case</p>
                            <p>
                              {casualtyRecord.isMLC
                                ? `Yes${casualtyRecord.mlcNumber ? ` (${casualtyRecord.mlcNumber})` : ""}`
                                : "No"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Police Informed</p>
                            <p>{casualtyRecord.policeInformed ? "Yes" : "No"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Brought Dead</p>
                            <p>{casualtyRecord.broughtDead ? "Yes" : "No"}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Vital Signs */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-green-600" />
                          Vital Signs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                              <Heart className="h-3 w-3" /> Blood Pressure
                            </p>
                            <p>{casualtyRecord.vitalSigns?.bloodPressure || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                              <Activity className="h-3 w-3" /> Pulse
                            </p>
                            <p>{casualtyRecord.vitalSigns?.pulse ? `${casualtyRecord.vitalSigns.pulse} bpm` : "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                              <Thermometer className="h-3 w-3" /> Temperature
                            </p>
                            <p>
                              {casualtyRecord.vitalSigns?.temperature
                                ? `${casualtyRecord.vitalSigns.temperature}°F`
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                              <Stethoscope className="h-3 w-3" /> Oxygen Saturation
                            </p>
                            <p>
                              {casualtyRecord.vitalSigns?.oxygenSaturation
                                ? `${casualtyRecord.vitalSigns.oxygenSaturation}%`
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">Respiratory Rate</p>
                            <p>
                              {casualtyRecord.vitalSigns?.respiratoryRate
                                ? `${casualtyRecord.vitalSigns.respiratoryRate}/min`
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">GCS Score</p>
                            <p>{casualtyRecord.vitalSigns?.gcs || "N/A"}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Incident Description */}
                    {casualtyRecord.incidentDescription && (
                      <Card className="md:col-span-2">
                        <CardHeader>
                          <CardTitle>Incident Description</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 dark:text-gray-300">{casualtyRecord.incidentDescription}</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Additional Notes */}
                    {casualtyRecord.message && (
                      <Card className="md:col-span-2">
                        <CardHeader>
                          <CardTitle>Additional Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 dark:text-gray-300">{casualtyRecord.message}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Status Update */}
                  <div className="flex justify-end gap-2 mt-6">
                    <Select
                      defaultValue={casualtyRecord.status}
                      onValueChange={(value) => handleUpdateStatus(value as CasualtyRecord["status"])}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Update Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="discharged">Discharged</SelectItem>
                        <SelectItem value="transferred">Transferred</SelectItem>
                        <SelectItem value="deceased">Deceased</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="payments" className="space-y-6">
                  {/* Add Payment Form */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-blue-600" />
                        Add Payment
                      </CardTitle>
                      <CardDescription>Record a new payment for this patient</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="amount">Amount (₹)</Label>
                          <div className="relative">
                            <Input
                              id="amount"
                              type="number"
                              placeholder="Enter amount"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="pl-8"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Payment Method</Label>
                          <RadioGroup
                            value={paymentMethod}
                            onValueChange={(value) => setPaymentMethod(value as "cash" | "online")}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="cash" id="cash" />
                              <Label htmlFor="cash" className="flex items-center gap-1">
                                <Banknote className="h-4 w-4" /> Cash
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="online" id="online" />
                              <Label htmlFor="online" className="flex items-center gap-1">
                                <CreditCard className="h-4 w-4" /> Online
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button onClick={handleAddPayment} className="ml-auto bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" /> Add Payment
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Payment History */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment History</CardTitle>
                      <CardDescription>
                        Total Paid: ₹{totals.paid.toLocaleString()} | Outstanding: ₹{totals.due.toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {casualtyRecord.payments && Object.keys(casualtyRecord.payments).length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date & Time</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead>Entered By</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.values(casualtyRecord.payments)
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{formatDate(payment.createdAt)}</TableCell>
                                  <TableCell className="font-medium">₹{payment.amount.toLocaleString()}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {payment.method === "cash" ? (
                                        <Banknote className="h-4 w-4" />
                                      ) : (
                                        <CreditCard className="h-4 w-4" />
                                      )}
                                      <span className="capitalize">{payment.method}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{payment.enteredBy || "N/A"}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <p>No payment records found</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="services" className="space-y-6">
                  {/* Add Service Form */}
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900">
                      <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-blue-600" />
                        Add New Service
                      </CardTitle>
                      <CardDescription>Record a new service provided to this patient</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="serviceName">Service Name</Label>
                          <Input
                            id="serviceName"
                            placeholder="Enter service name (e.g., X-Ray, Blood Test, Consultation)"
                            value={serviceName}
                            onChange={(e) => setServiceName(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="serviceAmount">Amount (₹)</Label>
                          <div className="relative">
                            <Input
                              id="serviceAmount"
                              type="number"
                              placeholder="Enter amount"
                              value={serviceAmount}
                              onChange={(e) => setServiceAmount(e.target.value)}
                              className="pl-8"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button onClick={handleAddService} className="ml-auto bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" /> Add Service
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Services List */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Services Provided</span>
                        {casualtyRecord.services && Object.keys(casualtyRecord.services).length > 0 && (
                          <Badge variant="secondary">
                            {Object.keys(casualtyRecord.services).length} service
                            {Object.keys(casualtyRecord.services).length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {casualtyRecord.services && Object.keys(casualtyRecord.services).length > 0 ? (
                        <div className="space-y-4">
                          {Object.values(casualtyRecord.services).map((service, index) => (
                            <Card key={service.id} className="border-l-4 border-l-blue-500">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                      <span className="text-blue-600 dark:text-blue-300 font-semibold text-sm">
                                        {index + 1}
                                      </span>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">{service.name}</h4>
                                      <p className="text-sm text-gray-500">Service #{service.id.slice(-6)}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xl font-bold text-green-600">
                                      ₹{service.amount.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <Plus className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <h3 className="text-lg font-medium mb-2">No services added yet</h3>
                          <p className="text-gray-500 mb-4">
                            Start by adding the first service provided to this patient
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Discount Management */}
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900 dark:to-pink-900">
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-purple-600 dark:text-purple-300">💰 Discount Management</span>
                      </CardTitle>
                      <CardDescription>Apply or update discount for this patients bill</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="discountAmount">Discount Amount (₹)</Label>
                          <div className="relative">
                            <Input
                              id="discountAmount"
                              type="number"
                              placeholder="Enter discount amount"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(e.target.value)}
                              className="pl-8"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          </div>
                          {casualtyRecord.discount && casualtyRecord.discount > 0 && (
                            <div className="mt-2 p-4 bg-purple-50 dark:bg-purple-900/50 rounded-lg border border-purple-200 dark:border-purple-700">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                    Current Discount Applied
                                  </p>
                                </div>
                                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                                  ₹{casualtyRecord.discount.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button onClick={handleAddDiscount} className="ml-auto bg-purple-600 hover:bg-purple-700">
                        <Plus className="h-4 w-4 mr-2" /> Update Discount
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Billing Summary */}
                  <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/50 dark:to-emerald-900/50">
                    <CardHeader>
                      <CardTitle className="text-green-700 dark:text-green-300">Billing Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Subtotal</p>
                          <p className="text-xl font-bold text-green-600 dark:text-green-400">
                            ₹{totals.subtotal.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Discount</p>
                          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                            ₹{totals.discount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total</p>
                          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            ₹{totals.total.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Paid</p>
                          <p className="text-xl font-bold text-green-600 dark:text-green-400">
                            ₹{totals.paid.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Due</p>
                          <p className="text-xl font-bold text-red-600 dark:text-red-400">
                            ₹{totals.due.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="invoice" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Generate Invoice</CardTitle>
                      <CardDescription>Download or send invoice for this casualty case</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex gap-4">
                          <Button onClick={handleDownloadInvoice} className="flex items-center gap-2">
                            <Download className="h-4 w-4" /> Download Invoice
                          </Button>
                          <Button
                            onClick={handleSendPdfOnWhatsapp}
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            Send on WhatsApp
                          </Button>
                        </div>

                        {/* Billing Summary for Invoice Preview */}
                        <div className="w-full max-w-md p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h3 className="font-semibold mb-3 text-center">Invoice Summary</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Subtotal:</span>
                              <span>₹{totals.subtotal.toLocaleString()}</span>
                            </div>
                            {totals.discount > 0 && (
                              <div className="flex justify-between text-purple-600">
                                <span>Discount:</span>
                                <span>-₹{totals.discount.toLocaleString()}</span>
                              </div>
                            )}
                            <hr />
                            <div className="flex justify-between font-semibold">
                              <span>Total:</span>
                              <span>₹{totals.total.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                              <span>Paid:</span>
                              <span>₹{totals.paid.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-red-600">
                              <span>Due:</span>
                              <span>₹{totals.due.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hidden invoice template for PDF generation */}
                      <div
                        ref={invoiceRef}
                        style={{
                          position: "absolute",
                          left: "-9999px",
                          top: 0,
                          width: "595px",
                          backgroundColor: "transparent",
                        }}
                      >
                        <div className="text-xs text-gray-800 p-4 bg-transparent">
                          {/* Invoice Header */}
                          <div className="flex justify-between mb-4">
                            <div>
                              <h2 className="text-lg font-bold mb-2">CASUALTY INVOICE</h2>
                              <p>
                                <strong>Patient Name:</strong> {casualtyRecord.name}
                              </p>
                              <p>
                                <strong>Mobile No.:</strong> {casualtyRecord.phone}
                              </p>
                              <p>
                                <strong>UHID:</strong> {casualtyRecord.patientId}
                              </p>
                              <p>
                                <strong>Case ID:</strong> {casualtyRecord.id}
                              </p>
                            </div>
                            <div className="text-right">
                              <p>
                                <strong>Admission Date:</strong> {formatDate(casualtyRecord.date)}
                              </p>
                              <p>
                                <strong>Bill Date:</strong> {formatDate(new Date().toISOString())}
                              </p>
                              <p>
                                <strong>Case Type:</strong>{" "}
                                {casualtyRecord.caseType === "other"
                                  ? casualtyRecord.otherCaseType
                                  : caseTypeOption?.label}
                              </p>
                              <p>
                                <strong>Triage:</strong> {triageOption?.label}
                              </p>
                            </div>
                          </div>

                          {/* Services Table */}
                          <div className="my-4">
                            <h3 className="font-semibold mb-2">Emergency Services</h3>
                            <table className="w-full text-[8px] border-collapse border border-gray-300">
                              <thead>
                                <tr className="bg-red-100">
                                  <th className="border border-gray-300 p-1 text-left">Service</th>
                                  <th className="border border-gray-300 p-1 text-center">Qty</th>
                                  <th className="border border-gray-300 p-1 text-right">Unit (Rs)</th>
                                  <th className="border border-gray-300 p-1 text-right">Total (Rs)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {casualtyRecord.services &&
                                  Object.values(casualtyRecord.services).map((service, idx) => (
                                    <tr key={idx}>
                                      <td className="border border-gray-300 p-1">{service.name}</td>
                                      <td className="border border-gray-300 p-1 text-center">1</td>
                                      <td className="border border-gray-300 p-1 text-right">
                                        {service.amount.toLocaleString()}
                                      </td>
                                      <td className="border border-gray-300 p-1 text-right">
                                        {service.amount.toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Final Summary */}
                          <div className="mt-4 p-2 rounded text-[9px] w-[250px] ml-auto border border-gray-300">
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span>Subtotal:</span>
                                <span>Rs. {totals.subtotal.toLocaleString()}</span>
                              </div>
                              {totals.discount > 0 && (
                                <div className="flex justify-between text-red-600">
                                  <span>Discount:</span>
                                  <span>- Rs. {totals.discount.toLocaleString()}</span>
                                </div>
                              )}
                              <hr />
                              <div className="flex justify-between font-bold">
                                <span>Net Total:</span>
                                <span>Rs. {totals.total.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Amount Paid:</span>
                                <span>Rs. {totals.paid.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between font-bold text-red-600">
                                <span>Due Amount:</span>
                                <span>Rs. {totals.due.toLocaleString()}</span>
                              </div>
                              <div className="mt-2 text-[8px]">
                                <strong>Amount in Words:</strong> {convertNumberToWords(totals.due)} Rupees Only
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-4 text-center text-[8px]">
                            <p>Thank you for choosing Gautami Hospital Emergency Department</p>
                            <p>For any queries, please contact our billing department</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
