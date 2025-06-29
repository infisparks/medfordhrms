"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, push, set, serverTimestamp, onValue } from "firebase/database"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FlaskRoundIcon as Flask,
  User,
  Phone,
  Calendar,
  UserCircle,
  DollarSign,
  CreditCard,
  Wallet,
} from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PatientInfo {
  name: string
  phone: string
  age: string | number
  gender: string
}

const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
]

export default function PathologyPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  const ipdId = params.ipdId as string

  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null)
  const [bloodTestName, setBloodTestName] = useState("")
  const [paymentId, setPaymentId] = useState("")
  const [referBy, setReferBy] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch patient information
  useEffect(() => {
    const patientRef = ref(db, `patients/${userId}`)
    const unsubscribe = onValue(patientRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        setPatientInfo({
          name: data.name || "Unknown",
          phone: data.phone || "N/A",
          age: data.age || "N/A",
          gender: data.gender || "N/A",
        })
      } else {
        toast.error("Patient not found")
        // setTimeout(() => router.push("/patients"), 2000)
      }
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [userId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!bloodTestName) {
      toast.error("Blood test name is required")
      return
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    if (!paymentMethod) {
      toast.error("Please select a payment method")
      return
    }

    setIsSubmitting(true)

    try {
      // Create a reference to the pathology node for this user
      const pathologyRef = ref(db, `patients/${userId}/pathology`)
      const newPathologyRef = push(pathologyRef)

      // Prepare the data to save
      const pathologyData = {
        ipdId,
        bloodTestName,
        paymentId: paymentId.trim() || null,
        referBy: referBy.trim() || null,
        amount: Number(amount),
        paymentMethod,
        createdAt: serverTimestamp(),
      }

      // Save the data
      await set(newPathologyRef, pathologyData)

      // Send WhatsApp message
      try {
        if (patientInfo?.phone) {
          const formattedDate = new Date().toLocaleDateString("en-IN") // e.g. DD/MM/YYYY
          const professionalMessage = `Hello ${patientInfo.name}, 
Your pathology test has been successfully registered at Gautami Hospital.

Test Details:
• Test Name: ${bloodTestName}
• Date: ${formattedDate}
• Amount: ₹${amount}
• Payment Method: ${paymentMethod.toUpperCase()}
${referBy ? `• Referred By: ${referBy}` : ""}

Thank you for choosing our services.
Medford Hospital
`

          const phoneWithCountryCode = `91${patientInfo.phone.replace(/\D/g, "")}`

          await fetch("https://wa.medblisss.com/send-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: "99583991573",
              number: phoneWithCountryCode,
              message: professionalMessage,
            }),
          })
        }
      } catch (whatsappError) {
        console.error("Error sending WhatsApp message:", whatsappError)
      }

      toast.success("Pathology entry saved successfully!")

      // Reset form
      setBloodTestName("")
      setPaymentId("")
      setReferBy("")
      setAmount("")
      setPaymentMethod("")
    } catch (error) {
      console.error("Error saving pathology entry:", error)
      toast.error("Failed to save pathology entry. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 py-12">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-lg">
            <div className="flex items-center gap-3 mb-2">
              <Flask className="h-8 w-8" />
              <CardTitle className="text-2xl font-bold">Pathology Entry</CardTitle>
            </div>
            <CardDescription className="text-purple-100">
              Patient ID: {userId} | IPD ID: {ipdId}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {/* Patient Information */}
            <div className="bg-purple-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-purple-800 mb-3">Patient Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-600">Name:</span>
                  <span className="font-medium">{patientInfo?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-600">Phone:</span>
                  <span className="font-medium">{patientInfo?.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-600">Age:</span>
                  <span className="font-medium">{patientInfo?.age}</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-600">Gender:</span>
                  <span className="font-medium">{patientInfo?.gender}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Blood Test Name Field */}
              <div className="space-y-2">
                <Label htmlFor="bloodTestName" className="flex items-center gap-2">
                  <Flask className="h-4 w-4 text-purple-500" />
                  <span>Blood Test Name</span>
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bloodTestName"
                  type="text"
                  value={bloodTestName}
                  onChange={(e) => setBloodTestName(e.target.value)}
                  placeholder="Enter blood test name"
                  className="border-slate-300"
                  required
                />
              </div>

              {/* Payment Method Field */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-purple-500" />
                  <span>Payment Method</span>
                  <span className="text-red-500">*</span>
                </Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="border-slate-300">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PaymentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment ID Field (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="paymentId" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <span>
                    Payment ID{" "}
                    {paymentMethod === "online" || paymentMethod === "upi" ? (
                      <span className="text-red-500">*</span>
                    ) : (
                      "(Optional)"
                    )}
                  </span>
                </Label>
                <Input
                  id="paymentId"
                  type="text"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  placeholder="Enter payment ID"
                  className="border-slate-300"
                  required={paymentMethod === "online" || paymentMethod === "upi"}
                />
              </div>

              {/* Refer By Field (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="referBy" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-purple-500" />
                  <span>Refer By (Optional)</span>
                </Label>
                <Input
                  id="referBy"
                  type="text"
                  value={referBy}
                  onChange={(e) => setReferBy(e.target.value)}
                  placeholder="Enter referring doctor"
                  className="border-slate-300"
                />
              </div>

              {/* Amount Field */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-purple-500" />
                  <span>Amount</span>
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="border-slate-300"
                  min="0"
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
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    "Save Pathology Entry"
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
