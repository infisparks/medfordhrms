"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, onValue, update, push, remove, get } from "firebase/database"
import { db } from "@/lib/firebase"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { useForm, Controller, type SubmitHandler } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle } from "lucide-react"
// ***** IMPORTANT: Use CreatableSelect from react-select/creatable
import CreatableSelect from "react-select/creatable"
// Import `Select` from `react-select`
import Select from "react-select"

import {
  Plus,
  ArrowLeft,
  AlertTriangle,
  History,
  Trash,
  Calendar,
  User,
  Phone,
  MapPin,
  CreditCard,
  Bed,
  Users,
  FileText,
  Download,
  ChevronRight,
  Percent,
  UserPlus,
  X,
  DollarSign,
  Tag,
  Save,
  RefreshCw,
  Search,
  Clock,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { Dialog, Transition } from "@headlessui/react"
import InvoiceDownload from "../../../InvoiceDownload"

// ===== Interfaces =====
interface ServiceItem {
  serviceName: string
  doctorName?: string
  type: "service" | "doctorvisit"
  amount: number
  createdAt?: string
}

interface Payment {
  id?: string // Changed to optional string to match Firebase key behavior
  amount: number
  paymentType: string
  type: "advance" | "refund"
  date: string
}

interface AdditionalServiceForm {
  serviceName: string
  amount: number
  quantity: number // NEW: Added quantity field
}

interface PaymentForm {
  paymentAmount: number
  paymentType: string
  type: string
  sendWhatsappNotification: boolean // NEW: Added for WhatsApp checkbox
}

interface DiscountForm {
  discount: number
}

interface DoctorVisitForm {
  doctorId?: string
  visitCharge: number
  visitTimes: number
  customDoctorName?: string
  isCustomDoctor: boolean
}

export interface BillingRecord {
  patientId: string
  uhid: string
  ipdId: string
  name: string
  mobileNumber: string
  address?: string
  age?: string | number
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string
  amount: number // deposit total
  paymentType: string // not used heavily here, but kept
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  admitDate?: string
  createdAt?: string
}

// ===== Additional Validation Schemas =====
const additionalServiceSchema = yup
  .object({
    serviceName: yup.string().required("Service Name is required"),
    amount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
    quantity: yup // NEW: Added quantity validation
      .number()
      .typeError("Quantity must be a number")
      .integer("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .required("Quantity is required"),
  })
  .required()

const paymentSchema = yup
  .object({
    paymentAmount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
    paymentType: yup.string().required("Payment Type is required"),
    type: yup.string().required("Type is required"),
    sendWhatsappNotification: yup.boolean().required(), // NEW: Added validation for checkbox
  })
  .required()

const discountSchema = yup
  .object({
    discount: yup
      .number()
      .typeError("Discount must be a number")
      .min(0, "Discount cannot be negative")
      .required("Discount is required"),
  })
  .required()

const doctorVisitSchema = yup
  .object({
    doctorId: yup.string().when("isCustomDoctor", {
      is: false,
      then: (schema) => schema.required("Select a doctor"),
      otherwise: (schema) => schema.notRequired(),
    }),
    visitCharge: yup
      .number()
      .typeError("Visit charge must be a number")
      .positive("Must be positive")
      .required("Charge is required"),
    visitTimes: yup
      .number()
      .typeError("Visit times must be a number")
      .min(1, "Must be at least 1")
      .max(10, "Cannot exceed 10 visits")
      .required("Visit times is required"),
    customDoctorName: yup.string().when("isCustomDoctor", {
      is: true,
      then: (schema) => schema.required("Doctor name is required"),
      otherwise: (schema) => schema.notRequired(),
    }),
    isCustomDoctor: yup.boolean().required(),
  })
  .required()

// ===== Doctor Interface =====
interface IDoctor {
  id: string
  name: string
  specialist: string
  department: "OPD" | "IPD" | "Both"
  opdCharge?: number
  ipdCharges?: Record<string, number>
}

export default function BillingPage() {
  const { patientId, ipdId, admitDateKey } = useParams() as { patientId: string; ipdId: string; admitDateKey: string }
  const router = useRouter()

  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false)
  const [beds, setBeds] = useState<any>({})
  const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "payments" | "consultants">("overview")
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
  const [discountUpdated, setDiscountUpdated] = useState(false)

  // State to hold service options for CreatableSelect
  const [serviceOptions, setServiceOptions] = useState<{ value: string; label: string; amount: number }[]>([])

  // ===== React Hook Form setups (Moved to top-level) =====

  // Additional Service Form (with CreatableSelect)
  const {
    register: registerService,
    handleSubmit: handleSubmitService,
    formState: { errors: errorsService },
    reset: resetService,
    setValue: setValueService,
    control: serviceControl,
  } = useForm<AdditionalServiceForm>({
    resolver: yupResolver(additionalServiceSchema),
    defaultValues: { serviceName: "", amount: 0, quantity: 1 }, // UPDATED: Added default quantity
  })

  // Payment Form
  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
  } = useForm<PaymentForm>({
    resolver: yupResolver(paymentSchema),
    defaultValues: { paymentAmount: 0, paymentType: "cash", type: "advance", sendWhatsappNotification: false }, // UPDATED: Added default for new field
  })

  // Discount Form
  const {
    register: registerDiscount,
    handleSubmit: handleSubmitDiscount,
    formState: { errors: errorsDiscount },
    reset: resetDiscount,
    watch: watchDiscount,
  } = useForm<DiscountForm>({
    resolver: yupResolver(discountSchema),
    defaultValues: { discount: 0 },
  })

  // Watch discount value for animation
  const currentDiscount = watchDiscount("discount")

  // Consultant Charge Form
  const {
    register: registerVisit,
    handleSubmit: handleSubmitVisit,
    formState: { errors: errorsVisit },
    reset: resetVisit,
    watch: watchVisit,
    setValue: setVisitValue,
    control: visitControl, // ADDED: Destructure control for DoctorVisitForm
  } = useForm<DoctorVisitForm>({
    resolver: yupResolver(doctorVisitSchema),
    defaultValues: {
      doctorId: "",
      visitCharge: 0,
      visitTimes: 1,
      customDoctorName: "",
      isCustomDoctor: false,
    },
  })

  // ===== Fetch Beds Data =====
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (snapshot.exists()) {
        setBeds(snapshot.val())
      } else {
        setBeds({})
      }
    })
    return () => unsubscribe()
  }, [])

  // ===== Fetch Doctors List =====
  useEffect(() => {
    const docsRef = ref(db, "doctors")
    const unsubscribe = onValue(docsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDoctors([])
        return
      }
      const data = snapshot.val()
      const list: IDoctor[] = Object.keys(data).map((key) => ({
        id: key,
        name: data[key].name,
        specialist: data[key].specialist,
        department: data[key].department,
        opdCharge: data[key].opdCharge,
        ipdCharges: data[key].ipdCharges,
      }))
      setDoctors(list)
    })
    return () => unsubscribe()
  }, [])

  // ===== Fetch Service Options for CreatableSelect =====
  useEffect(() => {
    const serviceRef = ref(db, "service")
    const unsubscribe = onValue(serviceRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        const options = Object.keys(data).map((key) => ({
          value: key,
          label: data[key].serviceName,
          amount: Number(data[key].amount) || 0,
        }))
        setServiceOptions(options)
      } else {
        setServiceOptions([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Helper to format date for Firebase path key
  const getAdmitDateKey = (dateString: string | undefined) => {
    if (!dateString) return ""
    try {
      // Assuming dateString is an ISO string like "2025-06-21T06:04:51.312Z"
      return format(parseISO(dateString), "yyyy-MM-dd")
    } catch (e) {
      console.error("Error parsing date for admitDateKey:", e)
      return ""
    }
  }

  // ===== Load Selected Patient Record =====
  // We need both patient demographics (from "patients/patientinfo/[patientId]")
  // and IPD‐details (from "patients/ipddetail/userinfoipd/[patientId]/[ipdId]")
  useEffect(() => {
    if (!patientId || !ipdId || !admitDateKey) return

    setLoading(true)

    const ipdBillingRef = ref(db, `patients/ipddetail/userbillinginfoipd/${admitDateKey}/${patientId}/${ipdId}`)
    const ipdInfoRef = ref(db, `patients/ipddetail/userinfoipd/${admitDateKey}/${patientId}/${ipdId}`)
    const patientInfoRef = ref(db, `patients/patientinfo/${patientId}`)

    // Add explicit types here
    let billingData: Record<string, any> | null = null
    let infoData: Record<string, any> | null = null
    let patientInfoData: Record<string, any> | null = null
    let billingLoaded = false
    let infoLoaded = false
    let patientInfoLoaded = false

    const checkAndSetRecord = () => {
      if (billingLoaded && infoLoaded && patientInfoLoaded) {
        let record: BillingRecord | null = null

        if (infoData) {
          record = {
            patientId,
            uhid: infoData.uhid ?? patientId,
            ipdId,
            name: infoData.name || (patientInfoData?.name ?? "Unknown"),
            mobileNumber: infoData.phone || (patientInfoData?.phone ?? ""),
            address: infoData.address || (patientInfoData?.address ?? ""),
            age: infoData.age || (patientInfoData?.age ?? ""),
            gender: infoData.gender || (patientInfoData?.gender ?? ""),
            relativeName: infoData.relativeName || "",
            relativePhone: infoData.relativePhone || "",
            relativeAddress: infoData.relativeAddress || "",
            dischargeDate: infoData.dischargeDate || "",
            amount: 0,
            paymentType: infoData.paymentType || "advance",
            roomType: infoData.roomType || "",
            bed: infoData.bed || "",
            services: [],
            payments: [],
            discount: 0,
            admitDate: infoData.admissionDate
              ? infoData.admissionDate
              : infoData.createdAt
                ? infoData.createdAt
                : undefined,
            createdAt: infoData.createdAt || "",
          }

          if (billingData) {
            const servicesArray =
              billingData.services && Array.isArray(billingData.services)
                ? billingData.services.map((svc: any) => ({
                    serviceName: svc.serviceName || "",
                    doctorName: svc.doctorName || "",
                    type: svc.type || "service",
                    amount: Number(svc.amount) || 0,
                    createdAt: svc.createdAt || "",
                  }))
                : []

            let paymentsArray: Payment[] = []
            if (billingData.payments) {
              paymentsArray = Object.keys(billingData.payments).map((k) => ({
                id: k,
                amount: Number(billingData?.payments[k].amount) || 0,
                paymentType: billingData?.payments[k].paymentType || "cash",
                type: billingData?.payments[k].type || "advance",
                date: billingData?.payments[k].date || new Date().toISOString(),
              }))
            }

            const depositTotal = Number(billingData.totalDeposit) || 0

            record = {
              ...record,
              amount: depositTotal,
              services: servicesArray,
              payments: paymentsArray,
              discount: billingData.discount ? Number(billingData.discount) : 0,
            }
          } else {
            toast.info("No billing record found for this IPD entry. Displaying patient details only.")
          }
        } else {
          toast.error("Patient information not found.")
        }

        setSelectedRecord(record)
        if (record?.discount) {
          resetDiscount({ discount: record.discount })
        }
        setLoading(false)
      }
    }

    const unsubscribeBilling = onValue(
      ipdBillingRef,
      (snap) => {
        billingData = snap.val() as Record<string, any> | null
        billingLoaded = true
        checkAndSetRecord()
      },
      (error) => {
        billingLoaded = true
        checkAndSetRecord()
      },
    )

    const unsubscribeInfo = onValue(
      ipdInfoRef,
      (snap) => {
        infoData = snap.val() as Record<string, any> | null
        infoLoaded = true
        checkAndSetRecord()
      },
      (error) => {
        infoLoaded = true
        checkAndSetRecord()
      },
    )

    // NEW: fetch patientinfo ONCE (no onValue, just get)
    get(patientInfoRef)
      .then((snap) => {
        patientInfoData = snap.exists() ? (snap.val() as Record<string, any>) : null
        patientInfoLoaded = true
        checkAndSetRecord()
      })
      .catch(() => {
        patientInfoLoaded = true
        checkAndSetRecord()
      })

    return () => {
      unsubscribeBilling()
      unsubscribeInfo()
    }
  }, [patientId, ipdId, admitDateKey, resetDiscount])
  // Auto-fill visit charge when a doctor is selected
  const watchSelectedDoctorId = watchVisit("doctorId")
  const watchIsCustomDoctor = watchVisit("isCustomDoctor")

  useEffect(() => {
    if (watchIsCustomDoctor || !watchSelectedDoctorId || !selectedRecord) return
    const doc = doctors.find((d) => d.id === watchSelectedDoctorId)
    if (!doc) return
    let amount = 0
    if (doc.department === "OPD") {
      amount = doc.opdCharge ?? 0
    } else if (doc.department === "IPD") {
      if (selectedRecord.roomType && doc.ipdCharges && doc.ipdCharges[selectedRecord.roomType]) {
        amount = doc.ipdCharges[selectedRecord.roomType]
      }
    } else if (doc.department === "Both") {
      if (selectedRecord.roomType && doc.ipdCharges && doc.ipdCharges[selectedRecord.roomType]) {
        amount = doc.ipdCharges[selectedRecord.roomType]
      }
      if (!amount && doc.opdCharge) {
        amount = doc.opdCharge
      }
    }
    setVisitValue("visitCharge", amount)
  }, [watchSelectedDoctorId, selectedRecord, doctors, setVisitValue, watchIsCustomDoctor])

  // ===== Calculations =====
  const hospitalServiceTotal = selectedRecord
    ? selectedRecord.services.filter((s) => s.type === "service").reduce((sum, s) => sum + s.amount, 0)
    : 0
  const consultantChargeItems = selectedRecord ? selectedRecord.services.filter((s) => s.type === "doctorvisit") : []
  const consultantChargeTotal = consultantChargeItems.reduce((sum, s) => sum + s.amount, 0)
  const discountVal = selectedRecord?.discount || 0
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal

  // Calculate total refunds
  const totalRefunds = selectedRecord
    ? selectedRecord.payments.filter((p) => p.type === "refund").reduce((sum, p) => sum + p.amount, 0)
    : 0

  // Calculate balance (can be positive for due, negative for refund)
  const balanceAmount = totalBill - (selectedRecord?.amount || 0)

  // Calculate discount percentage for display
  const discountPercentage =
    hospitalServiceTotal + consultantChargeTotal > 0
      ? ((discountVal / (hospitalServiceTotal + consultantChargeTotal)) * 100).toFixed(1)
      : "0.0"

  // ===== Group Consultant Charges by Doctor =====
  const aggregatedConsultantCharges = consultantChargeItems.reduce(
    (acc, item) => {
      const key = item.doctorName || "Unknown"
      if (!acc[key]) {
        acc[key] = {
          doctorName: key,
          visited: 0,
          totalCharge: 0,
          lastVisit: null as Date | null,
          items: [] as ServiceItem[],
        }
      }
      acc[key].visited += 1
      acc[key].totalCharge += item.amount
      const itemDate = item.createdAt ? new Date(item.createdAt) : new Date(0)
      if (!acc[key].lastVisit || itemDate > acc[key].lastVisit) {
        acc[key].lastVisit = itemDate
      }
      acc[key].items.push(item)
      return acc
    },
    {} as Record<
      string,
      {
        doctorName: string
        visited: number
        totalCharge: number
        lastVisit: Date | null
        items: ServiceItem[]
      }
    >,
  )
  const aggregatedConsultantChargesArray = Object.values(aggregatedConsultantCharges)

  // ===== Payment Notification Helper (optional usage) =====
  const sendPaymentNotification = async (
    patientMobile: string,
    patientName: string,
    paymentAmount: number,
    updatedDeposit: number,
    paymentType: "advance" | "refund",
  ) => {
    const apiUrl = "https://wa.medblisss.com/send-text"
    let message = ""
    if (paymentType === "advance") {
      message = `Dear ${patientName}, your payment of Rs ${paymentAmount.toLocaleString()} has been successfully added to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}. Thank you for choosing our service.`
    } else {
      message = `Dear ${patientName}, a refund of Rs ${paymentAmount.toLocaleString()} has been processed to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}.`
    }

    const payload = {
      token: "99583991572",
      number: `91${patientMobile}`,
      message: message,
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        console.error("Notification API error:", response.statusText)
      }
    } catch (error) {
      console.error("Error sending notification:", error)
    }
  }

  // ===== Handlers =====

  // 1. Add Additional Service
  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot add service.")
      setLoading(false)
      return
    }
    try {
      const oldServices = [...selectedRecord.services]
      const newItems: ServiceItem[] = [] // Changed to an array to hold multiple items

      // Loop based on quantity to create multiple service entries
      for (let i = 0; i < data.quantity; i++) {
        const newItem: ServiceItem = {
          serviceName: data.serviceName,
          doctorName: "", // Services don't have doctorName
          type: "service",
          amount: Number(data.amount),
          createdAt: new Date().toLocaleString(), // Unique timestamp for each item
        }
        newItems.push(newItem)
      }

      const updatedServices = [...newItems, ...oldServices] // Add all new items
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "service",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }))

      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`,
      )
      await update(recordRef, { services: sanitizedServices })

      toast.success(`Additional service${data.quantity > 1 ? "s" : ""} added successfully!`) // UPDATED: Toast message reflects quantity
      const updatedRecord = { ...selectedRecord, services: sanitizedServices }
      setSelectedRecord(updatedRecord)
      resetService({ serviceName: "", amount: 0, quantity: 1 }) // UPDATED: Reset quantity to 1
    } catch (error) {
      console.error("Error adding service:", error)
      toast.error("Failed to add service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 2. Add Payment with Notification
  const onSubmitPayment: SubmitHandler<PaymentForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot record payment.")
      setLoading(false)
      return
    }
    try {
      // Push new payment directly under the ipdId node
      const newPaymentRef = push(
        ref(
          db,
          `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}/payments`, // Changed path
        ),
      )
      const newPayment: Payment = {
        amount: Number(formData.paymentAmount),
        paymentType: formData.paymentType,
        type: formData.type as "advance" | "refund",
        date: new Date().toISOString(),
        id: newPaymentRef.key!, // Asserting key is string, as Firebase push keys are never null
      }
      await update(newPaymentRef, newPayment)

      // Update deposit total directly under the ipdId node
      let updatedDeposit = Number(selectedRecord.amount)
      if (newPayment.type === "advance") {
        updatedDeposit += newPayment.amount
      } else if (newPayment.type === "refund") {
        updatedDeposit -= newPayment.amount
      }
      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { totalDeposit: updatedDeposit })

      // Optional: send payment notification based on checkbox
      if (formData.sendWhatsappNotification) {
        await sendPaymentNotification(
          selectedRecord.mobileNumber,
          selectedRecord.name,
          newPayment.amount,
          updatedDeposit,
          newPayment.type,
        )
      }

      toast.success("Payment recorded successfully!")
      // To ensure the UI updates correctly, we need to fetch the new payment ID
      // from the push operation. Firebase's push returns a reference with a key.
      const updatedPayments = [newPayment, ...selectedRecord.payments] // newPayment already has the ID
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit }
      setSelectedRecord(updatedRecord)
      resetPayment({ paymentAmount: 0, paymentType: "cash", type: "advance", sendWhatsappNotification: false }) // UPDATED: Reset checkbox
    } catch (error) {
      console.error("Error recording payment:", error)
      toast.error("Failed to record payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 3. Discharge Patient
  const handleDischarge = () => {
    if (!selectedRecord) return
    const admitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    router.push(`/discharge-summary/${selectedRecord.patientId}/${selectedRecord.ipdId}/${admitDateKey}`)
  }

  // 4. Apply Discount
  const onSubmitDiscount: SubmitHandler<DiscountForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot apply discount.")
      setLoading(false)
      return
    }
    try {
      const discountVal = Number(formData.discount)
      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { discount: discountVal })

      toast.success("Discount applied successfully!")
      const updatedRecord = { ...selectedRecord, discount: discountVal }
      setSelectedRecord(updatedRecord)
      setDiscountUpdated(true)

      setTimeout(() => {
        setIsDiscountModalOpen(false)
      }, 1000)
    } catch (error) {
      console.error("Error applying discount:", error)
      toast.error("Failed to apply discount. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 5. Add Consultant Charge (Enhanced with multiple visits and custom doctor)
  const onSubmitDoctorVisit: SubmitHandler<DoctorVisitForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot add consultant charge.")
      setLoading(false)
      return
    }
    try {
      let doctorName = ""

      if (data.isCustomDoctor) {
        doctorName = data.customDoctorName || "Custom Doctor"
      } else {
        const doc = doctors.find((d) => d.id === data.doctorId)
        if (!doc) {
          toast.error("Invalid doctor selection.")
          setLoading(false)
          return
        }
        doctorName = doc.name || "Unknown"
      }

      const oldServices = [...selectedRecord.services]
      const newItems: ServiceItem[] = []

      // Create multiple visit records based on visitTimes
      for (let i = 0; i < data.visitTimes; i++) {
        const newItem: ServiceItem = {
          serviceName: `Consultant Charge: Dr. ${doctorName}`,
          doctorName: doctorName,
          type: "doctorvisit",
          amount: Number(data.visitCharge) || 0,
          createdAt: new Date().toLocaleString(),
        }
        newItems.push(newItem)
      }

      const updatedServices = [...newItems, ...oldServices]
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "doctorvisit",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }))

      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { services: sanitizedServices })

      toast.success(
        `Consultant charge${data.visitTimes > 1 ? "s" : ""} added successfully! (${data.visitTimes} visit${data.visitTimes > 1 ? "s" : ""})`,
      )
      const updatedRecord = { ...selectedRecord, services: sanitizedServices }
      setSelectedRecord(updatedRecord)
      resetVisit({
        doctorId: "",
        visitCharge: 0,
        visitTimes: 1,
        customDoctorName: "",
        isCustomDoctor: false,
      })
    } catch (error) {
      console.error("Error adding consultant charge:", error)
      toast.error("Failed to add consultant charge. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ===== Delete Handlers =====

  // Delete a service item (for hospital services)
  const handleDeleteServiceItem = async (item: ServiceItem) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot delete service.")
      setLoading(false)
      return
    }
    try {
      const updatedServices = selectedRecord.services.filter((svc) => svc !== item)
      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { services: updatedServices })

      toast.success("Service deleted successfully!")
      const updatedRecord = { ...selectedRecord, services: updatedServices }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting service:", error)
      toast.error("Failed to delete service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Delete a payment
  const handleDeletePayment = async (paymentId: string, paymentAmount: number, paymentType: "advance" | "refund") => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot delete payment.")
      setLoading(false)
      return
    }
    try {
      const paymentRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}/payments/${paymentId}`, // Changed path
      )
      await remove(paymentRef)

      // Adjust deposit after deleting payment
      let updatedDeposit = selectedRecord.amount
      if (paymentType === "advance") {
        updatedDeposit -= paymentAmount
      } else if (paymentType === "refund") {
        updatedDeposit += paymentAmount
      }

      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { totalDeposit: updatedDeposit })

      const updatedPayments = selectedRecord.payments.filter((p) => p.id !== paymentId)
      toast.success("Payment deleted successfully!")
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting payment:", error)
      toast.error("Failed to delete payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Delete consultant charges for a specific doctor (aggregated deletion)
  const handleDeleteConsultantCharges = async (doctorName: string) => {
    if (!selectedRecord) return
    setLoading(true)
    const currentAdmitDateKey = getAdmitDateKey(selectedRecord.admitDate)
    if (!currentAdmitDateKey) {
      toast.error("Admission date not found for record. Cannot delete consultant charges.")
      setLoading(false)
      return
    }
    try {
      const updatedServices = selectedRecord.services.filter(
        (svc) => svc.type !== "doctorvisit" || svc.doctorName !== doctorName,
      )
      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${currentAdmitDateKey}/${selectedRecord.patientId}/${selectedRecord.ipdId}`, // Changed path
      )
      await update(recordRef, { services: updatedServices })

      toast.success(`Consultant charges for Dr. ${doctorName} deleted successfully!`)
      const updatedRecord = { ...selectedRecord, services: updatedServices }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting consultant charges:", error)
      toast.error("Failed to delete consultant charges. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const serviceItems = selectedRecord?.services.filter((s) => s.type === "service") || []

  // Prepare doctor options for react-select
  const doctorOptions = doctors.map((doc) => ({
    value: doc.id,
    label: `${doc.name} (${doc.specialist})`,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <header className="bg-white border-b border-teal-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center text-teal-600 hover:text-teal-800 transition-colors font-medium"
            >
              <ArrowLeft size={18} className="mr-2" /> Back to Patients
            </button>

            <div className="flex items-center space-x-4">
              {selectedRecord && !selectedRecord.dischargeDate && (
                <button
                  onClick={handleDischarge}
                  disabled={loading}
                  className="flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                >
                  <FileText size={16} className="mr-2" /> Discharge Summary
                </button>
              )}

              <button
                onClick={() => setIsPaymentHistoryOpen(true)}
                className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <History size={16} className="mr-2" /> Payment History
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedRecord ? (
          <AnimatePresence mode="wait">
            <motion.div
              key="billing-details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Patient Summary Card */}
              <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-white">{selectedRecord.name}</h1>
                      <p className="text-teal-50">UHID: {selectedRecord.uhid ? selectedRecord.uhid : "Not assigned"}</p>
                    </div>

                    <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                        <Bed size={14} className="mr-2" />
                        {selectedRecord.roomType || "No Room"} •{" "}
                        {selectedRecord.roomType &&
                        selectedRecord.bed &&
                        beds[selectedRecord.roomType]?.[selectedRecord.bed]?.bedNumber
                          ? beds[selectedRecord.roomType][selectedRecord.bed].bedNumber
                          : "Unknown Bed"}
                      </div>

                      <div className="mt-2 text-teal-50 text-sm">
                        {selectedRecord.dischargeDate ? (
                          <span className="inline-flex items-center">
                            <AlertTriangle size={14} className="mr-1" /> Discharged:{" "}
                            {format(parseISO(selectedRecord.dischargeDate), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center">
                            <Calendar size={14} className="mr-1" /> Admitted:{" "}
                            {selectedRecord.admitDate
                              ? format(parseISO(selectedRecord.admitDate), "dd MMM yyyy")
                              : "Unknown"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Financial Summary */}
                    <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-teal-800 mb-3">Financial Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Hospital Services:</span>
                          <span className="font-medium">₹{hospitalServiceTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Consultant Charges:</span>
                          <span className="font-medium">₹{consultantChargeTotal.toLocaleString()}</span>
                        </div>
                        {discountVal > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span className="flex items-center">
                              <Tag size={14} className="mr-1" /> Discount ({discountPercentage}%):
                            </span>
                            <span className="font-medium">-₹{discountVal.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="border-t border-teal-200 pt-2 mt-2">
                          <div className="flex justify-between font-bold text-teal-800">
                            <span>Total Bill:</span>
                            <span>₹{totalBill.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-600">Deposit Amount:</span>
                          <span className="font-medium">₹{selectedRecord.amount.toLocaleString()}</span>
                        </div>
                        {totalRefunds > 0 && (
                          <div className="flex justify-between text-blue-600">
                            <span className="text-gray-600">Total Refunds:</span>
                            <span className="font-medium">₹{totalRefunds.toLocaleString()}</span>
                          </div>
                        )}
                        {balanceAmount > 0 ? (
                          <div className="flex justify-between text-red-600 font-bold">
                            <span>Due Amount:</span>
                            <span>₹{balanceAmount.toLocaleString()}</span>
                          </div>
                        ) : balanceAmount < 0 ? (
                          <div className="flex justify-between text-blue-600 font-bold">
                            <span>We have to refund :</span>
                            <span>₹{Math.abs(balanceAmount).toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-green-600 font-bold">
                            <span>Balance:</span>
                            <span>✓ Fully Paid</span>
                          </div>
                        )}
                      </div>

                      {/* Discount Quick Action Button */}
                      <button
                        onClick={() => setIsDiscountModalOpen(true)}
                        className="mt-4 w-full flex items-center justify-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg transition-colors shadow-sm"
                      >
                        <Percent size={16} className="mr-2" />
                        {discountVal > 0 ? "Update Discount" : "Add Discount"}
                      </button>
                    </div>

                    {/* Patient Details */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <User size={18} className="mr-2 text-teal-600" /> Patient Details
                      </h3>
                      <div className="space-y-2">
                        <div className="flex items-start">
                          <Phone size={16} className="mr-2 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-500">Mobile</p>
                            <p className="font-medium">{selectedRecord.mobileNumber}</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-500">Address</p>
                            <p className="font-medium">{selectedRecord.address || "Not provided"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm text-gray-500">Age</p>
                            <p className="font-medium">{selectedRecord.age || "Not provided"}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Gender</p>
                            <p className="font-medium">{selectedRecord.gender || "Not provided"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Relative Details */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <Users size={18} className="mr-2 text-teal-600" /> Relative Details
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm text-gray-500">Name</p>
                          <p className="font-medium">{selectedRecord.relativeName || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Phone</p>
                          <p className="font-medium">{selectedRecord.relativePhone || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Address</p>
                          <p className="font-medium">{selectedRecord.relativeAddress || "Not provided"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h3>
                      <div className="space-y-3">
                        <InvoiceDownload record={selectedRecord}>
                          <button className="w-full flex items-center justify-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                            <Download size={16} className="mr-2" /> Download Invoice
                          </button>
                        </InvoiceDownload>

                        <button
                          onClick={() => setActiveTab("payments")}
                          className="w-full flex items-center justify-center px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                        >
                          <CreditCard size={16} className="mr-2" /> Add Payment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="mb-6">
                <div className="border-b border-gray-200">
                  <nav className="flex -mb-px space-x-8">
                    <button
                      onClick={() => setActiveTab("overview")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "overview"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <FileText size={16} className="mr-2" /> Overview
                    </button>
                    <button
                      onClick={() => setActiveTab("services")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "services"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Plus size={16} className="mr-2" /> Services
                    </button>
                    <button
                      onClick={() => setActiveTab("payments")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "payments"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <CreditCard size={16} className="mr-2" /> Payments
                    </button>
                    <button
                      onClick={() => setActiveTab("consultants")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "consultants"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <UserPlus size={16} className="mr-2" /> Consultants
                    </button>
                  </nav>
                </div>
              </div>

              {/* Tab Content */}
              <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                {/* Overview Tab */}
                {activeTab === "overview" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Hospital Services Summary */}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                          <FileText size={20} className="mr-2 text-teal-600" /> Hospital Services
                        </h3>
                        {serviceItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No hospital services recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {serviceItems.slice(0, 5).map((srv, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{srv.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {srv.createdAt ? new Date(srv.createdAt).toLocaleDateString() : "N/A"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                            {serviceItems.length > 5 && (
                              <div className="mt-3 text-right">
                                <button
                                  onClick={() => setActiveTab("services")}
                                  className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center justify-end w-full"
                                >
                                  View all {serviceItems.length} services <ChevronRight size={16} className="ml-1" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Consultant Charges Summary */}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                          <UserPlus size={20} className="mr-2 text-teal-600" /> Consultant Charges
                        </h3>
                        {consultantChargeItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No consultant charges recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Doctor
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Visits
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {aggregatedConsultantChargesArray.map((agg, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{agg.totalCharge.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td></td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{consultantChargeTotal.toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                            <div className="mt-3 text-right">
                              <button
                                onClick={() => setActiveTab("consultants")}
                                className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center justify-end w-full"
                              >
                                View consultant details <ChevronRight size={16} className="ml-1" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Services Tab */}
                {activeTab === "services" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Services List */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Hospital Services</h3>
                        {serviceItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No hospital services recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service Name
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date/Time
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {serviceItems.map((srv, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {srv.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {srv.createdAt ? new Date(srv.createdAt).toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {/* Removed dischargeDate condition */}
                                      <button
                                        onClick={() => handleDeleteServiceItem(srv)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Delete service"
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Add Service Form (with manual typing or selection) */}
                      {/* Removed dischargeDate condition */}
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Hospital Service</h3>
                          <form onSubmit={handleSubmitService(onSubmitAdditionalService)} className="space-y-4">
                            {/* Service Name Field with CreatableSelect */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                              <Controller
                                control={serviceControl}
                                name="serviceName"
                                render={({ field }) => {
                                  // If the typed-in service is not in the array, create an object so CreatableSelect won't complain
                                  const valueStr = field.value || ""
                                  const selectedOption = serviceOptions.find(
                                    (option) =>
                                      typeof option.label === "string" &&
                                      typeof valueStr === "string" &&
                                      option.label.toLowerCase() === valueStr.toLowerCase(),
                                    
                                  ) || {
                                    label: valueStr,
                                    value: valueStr,
                                  }
                                  

                                  return (
                                    <CreatableSelect
                                      {...field}
                                      isClearable
                                      options={serviceOptions}
                                      placeholder="Select or type a service..."
                                      onChange={(selected) => {
                                        if (selected) {
                                          // If user chose an existing service, auto-fill the amount
                                          field.onChange(selected.label)
                                          // If that option has a known amount, set it
                                          const foundOption = serviceOptions.find((opt) => opt.label === selected.label)
                                          if (foundOption) {
                                            setValueService("amount", foundOption.amount)
                                          }
                                        } else {
                                          field.onChange("")
                                          setValueService("amount", 0)
                                        }
                                      }}
                                      value={selectedOption}
                                    />
                                  )
                                }}
                              />
                              {errorsService.serviceName && (
                                <p className="text-red-500 text-xs mt-1">{errorsService.serviceName.message}</p>
                              )}
                            </div>

                            {/* Amount Field */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                              <input
                                type="number"
                                {...registerService("amount")}
                                placeholder="Auto-filled on selection, or type your own"
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsService.amount ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              />
                              {errorsService.amount && (
                                <p className="text-red-500 text-xs mt-1">{errorsService.amount.message}</p>
                              )}
                            </div>

                            {/* NEW: Quantity Field */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                              <input
                                type="number"
                                {...registerService("quantity")}
                                min="1"
                                placeholder="e.g., 1"
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsService.quantity ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              />
                              {errorsService.quantity && (
                                <p className="text-red-500 text-xs mt-1">{errorsService.quantity.message}</p>
                              )}
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                loading ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              {loading ? (
                                "Processing..."
                              ) : (
                                <>
                                  <Plus size={16} className="mr-2" /> Add Service
                                </>
                              )}
                            </button>
                          </form>
                        </div>

                        {/* Enhanced Discount Card */}
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200 p-6 mt-6 shadow-sm">
                          <h3 className="text-lg font-semibold text-emerald-800 mb-4 flex items-center">
                            <Percent size={18} className="mr-2 text-emerald-600" /> Discount
                          </h3>

                          {discountVal > 0 ? (
                            <div className="space-y-4">
                              <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="text-sm text-gray-500">Current Discount</p>
                                    <p className="text-2xl font-bold text-emerald-600">
                                      ₹{discountVal.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-medium">
                                    {discountPercentage}% off
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => setIsDiscountModalOpen(true)}
                                className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center"
                              >
                                <RefreshCw size={16} className="mr-2" /> Update Discount
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="bg-white rounded-lg p-4 shadow-sm border border-dashed border-emerald-200 text-center">
                                <p className="text-gray-500 mb-2">No discount applied yet</p>
                                <DollarSign size={24} className="mx-auto text-emerald-300" />
                              </div>

                              <button
                                onClick={() => setIsDiscountModalOpen(true)}
                                className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center"
                              >
                                <Percent size={16} className="mr-2" /> Add Discount
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payments Tab */}
                {activeTab === "payments" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Payment Summary */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment Summary</h3>
                        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-teal-50 rounded-lg p-4">
                              <p className="text-sm text-teal-600">Total Bill</p>
                              <p className="text-2xl font-bold text-teal-800">₹{totalBill.toLocaleString()}</p>
                            </div>
                            <div className="bg-cyan-50 rounded-lg p-4">
                              <p className="text-sm text-cyan-600">Deposit Amount</p>
                              <p className="text-2xl font-bold text-cyan-800">
                                ₹{selectedRecord.amount.toLocaleString()}
                              </p>
                            </div>
                            {balanceAmount > 0 ? (
                              <div className="bg-red-50 rounded-lg p-4">
                                <p className="text-sm text-red-600">Due Amount</p>
                                <p className="text-2xl font-bold text-red-800">₹{balanceAmount.toLocaleString()}</p>
                              </div>
                            ) : balanceAmount < 0 ? (
                              <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-600">Total Amount we have to Refund</p>
                                <p className="text-2xl font-bold text-blue-800">
                                  ₹{Math.abs(balanceAmount).toLocaleString()}
                                </p>
                              </div>
                            ) : (
                              <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-sm text-green-600">Fully Paid</p>
                                <p className="text-2xl font-bold text-green-800">✓</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment History</h3>
                        {selectedRecord.payments.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No payments recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    #
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Payment Type
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>

                              <tbody className="divide-y divide-gray-200">
                                {selectedRecord.payments.map((payment, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {payment.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.paymentType}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.type || "advance"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {new Date(payment.date).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {/* Removed dischargeDate condition */}
                                      <button
                                        onClick={() =>
                                          payment.id && handleDeletePayment(payment.id, payment.amount, payment.type)
                                        }
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Delete payment"
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Add Payment Form */}
                      {/* Removed dischargeDate condition */}
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <CreditCard size={16} className="mr-2 text-teal-600" /> Record Payment
                          </h3>
                          <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (₹)</label>
                              <input
                                type="number"
                                {...registerPayment("paymentAmount")}
                                placeholder="e.g., 5000"
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.paymentAmount ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              />
                              {errorsPayment.paymentAmount && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentAmount.message}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                              <select
                                {...registerPayment("paymentType")}
                                defaultValue="cash"
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.paymentType ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              >
                                <option value="">Select Payment Type</option>
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                                <option value="card">Card</option>
                              </select>
                              {errorsPayment.paymentType && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentType.message}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                              <select
                                {...registerPayment("type")}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.type ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              >
                                <option value="advance">Advance</option>
                                <option value="refund">Refund</option>
                              </select>
                              {errorsPayment.type && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.type.message}</p>
                              )}
                            </div>
                            {/* NEW: WhatsApp Notification Checkbox */}
                            <div>
                              <div className="flex items-center mt-4">
                                <input
                                  type="checkbox"
                                  id="sendWhatsappNotification"
                                  {...registerPayment("sendWhatsappNotification")}
                                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                                />
                                <label htmlFor="sendWhatsappNotification" className="ml-2 block text-sm text-gray-900">
                                  Send message on WhatsApp
                                </label>
                              </div>
                              {errorsPayment.sendWhatsappNotification && (
                                <p className="text-red-500 text-xs mt-1">
                                  {errorsPayment.sendWhatsappNotification.message}
                                </p>
                              )}
                            </div>
                            <button
                              type="submit"
                              disabled={loading}
                              className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                loading ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              {loading ? (
                                "Processing..."
                              ) : (
                                <>
                                  <Plus size={16} className="mr-2" /> Add Payment
                                </>
                              )}
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Consultants Tab - Enhanced */}
                {activeTab === "consultants" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Consultant Charges List */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Consultant Charges</h3>
                        {consultantChargeItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No consultant charges recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Doctor
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Visits
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Total Charge (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Last Visit
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {aggregatedConsultantChargesArray.map((agg, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{agg.totalCharge.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {/* Removed dischargeDate condition */}
                                      <button
                                        onClick={() => handleDeleteConsultantCharges(agg.doctorName)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Delete consultant charges"
                                      >
                                        <Trash size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td></td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{consultantChargeTotal.toLocaleString()}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Enhanced Add Consultant Charge Form */}
                      {/* Removed dischargeDate condition */}
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <UserPlus size={16} className="mr-2 text-teal-600" /> Add Consultant Charge
                          </h3>
                          <form onSubmit={handleSubmitVisit(onSubmitDoctorVisit)} className="space-y-4">
                            {/* Custom Doctor Toggle */}
                            <div className="flex items-center space-x-2 mb-4">
                              <input
                                type="checkbox"
                                {...registerVisit("isCustomDoctor")}
                                id="customDoctorToggle"
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                              />
                              <label htmlFor="customDoctorToggle" className="text-sm font-medium text-gray-700">
                                Add custom doctor
                              </label>
                            </div>

                            {/* Doctor Selection or Custom Entry */}
                            {!watchIsCustomDoctor ? (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  <Search size={16} className="inline mr-1" />
                                  Select Doctor
                                </label>
                                <Controller
                                  control={visitControl} // UPDATED: Use visitControl
                                  name="doctorId"
                                  render={({ field }) => (
                                    <Select
                                      {...field}
                                      options={doctorOptions} // Use pre-mapped options
                                      isClearable
                                      placeholder="Search or select a doctor..."
                                      onChange={(selectedOption) => {
                                        field.onChange(selectedOption ? selectedOption.value : "")
                                      }}
                                      value={doctorOptions.find((option) => option.value === field.value) || null} // UPDATED: Correctly map field.value to option object
                                      classNamePrefix="react-select"
                                      styles={{
                                        control: (base, state) => ({
                                          ...base,
                                          borderColor: errorsVisit.doctorId ? "rgb(239 68 68)" : base.borderColor,
                                          boxShadow: state.isFocused ? "0 0 0 2px rgb(20 184 166)" : base.boxShadow,
                                          "&:hover": {
                                            borderColor: errorsVisit.doctorId
                                              ? "rgb(239 68 68)"
                                              : ((base["&:hover"] as any)?.borderColor ?? "transparent"),
                                          },
                                        }),
                                      }}
                                    />
                                  )}
                                />
                                {errorsVisit.doctorId && (
                                  <p className="text-red-500 text-xs mt-1">{errorsVisit.doctorId.message}</p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Custom Doctor Name
                                </label>
                                <input
                                  type="text"
                                  {...registerVisit("customDoctorName")}
                                  placeholder="Enter doctor name"
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsVisit.customDoctorName ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                />
                                {errorsVisit.customDoctorName && (
                                  <p className="text-red-500 text-xs mt-1">{errorsVisit.customDoctorName.message}</p>
                                )}
                              </div>
                            )}

                            {/* Visit Charge */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Charge (₹)</label>
                              <input
                                type="number"
                                {...registerVisit("visitCharge")}
                                placeholder={watchIsCustomDoctor ? "Enter charge amount" : "Auto-filled or override"}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsVisit.visitCharge ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              />
                              {errorsVisit.visitCharge && (
                                <p className="text-red-500 text-xs mt-1">{errorsVisit.visitCharge.message}</p>
                              )}
                            </div>

                            {/* Visit Times */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Clock size={16} className="inline mr-1" />
                                Number of Visits
                              </label>
                              <input
                                type="number"
                                {...registerVisit("visitTimes")}
                                min="1"
                                max="10"
                                placeholder="e.g., 2 for 2 visits"
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsVisit.visitTimes ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              />
                              {errorsVisit.visitTimes && (
                                <p className="text-red-500 text-xs mt-1">{errorsVisit.visitTimes.message}</p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Each visit will be recorded separately with current timestamp
                              </p>
                            </div>

                            <button
                              type="submit"
                              disabled={loading}
                              className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                loading ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                            >
                              {loading ? (
                                "Processing..."
                              ) : (
                                <>
                                  <Plus size={16} className="mr-2" /> Add Consultant Charge
                                </>
                              )}
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="w-16 h-16 border-4 border-t-teal-500 border-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">Loading patient record...</p>
          </div>
        )}
      </main>

      {/* Payment History Modal */}
      <Transition appear show={isPaymentHistoryOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsPaymentHistoryOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-xl font-bold text-gray-800">Payment History</Dialog.Title>
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {selectedRecord && selectedRecord.payments.length > 0 ? (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            #
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount (₹)
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Payment Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedRecord.payments.map((payment, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              {payment.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.paymentType}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.type || "advance"}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(payment.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {/* Removed dischargeDate condition */}
                              <button
                                onClick={() =>
                                  payment.id && handleDeletePayment(payment.id, payment.amount, payment.type)
                                }
                                className="text-red-500 hover:text-red-700 transition-colors"
                                title="Delete payment"
                              >
                                <Trash size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No payments recorded yet.</p>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      {/* Discount Modal */}
      <Transition appear show={isDiscountModalOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsDiscountModalOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-xl font-bold text-gray-800 flex items-center">
                    <Percent size={20} className="mr-2 text-emerald-600" />
                    {discountVal > 0 ? "Update Discount" : "Add Discount"}
                  </Dialog.Title>
                  <button
                    onClick={() => setIsDiscountModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-6">
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-600">Total Bill Amount</p>
                        <p className="text-xl font-bold text-gray-800">
                          ₹{(hospitalServiceTotal + consultantChargeTotal).toLocaleString()}
                        </p>
                      </div>
                      {discountVal > 0 && (
                        <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-medium">
                          Current: ₹{discountVal.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleSubmitDiscount(onSubmitDiscount)} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Amount (₹)</label>
                      <div className="relative">
                        <DollarSign className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                        <input
                          type="number"
                          {...registerDiscount("discount")}
                          placeholder="Enter discount amount"
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            errorsDiscount.discount ? "border-red-500" : "border-gray-300"
                          } transition duration-200`}
                        />
                      </div>
                      {errorsDiscount.discount && (
                        <p className="text-red-500 text-xs mt-1">{errorsDiscount.discount.message}</p>
                      )}
                    </div>

                    {/* Discount percentage display */}
                    {currentDiscount > 0 && hospitalServiceTotal + consultantChargeTotal > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 p-3 rounded-lg border border-emerald-100"
                      >
                        <p className="text-sm text-emerald-700 flex items-center">
                          <Tag className="h-4 w-4 mr-1" />
                          This is equivalent to a{" "}
                          <span className="font-bold mx-1">
                            {((currentDiscount / (hospitalServiceTotal + consultantChargeTotal)) * 100).toFixed(1)}%
                          </span>{" "}
                          discount
                        </p>
                      </motion.div>
                    )}

                    <div className="flex space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsDiscountModalOpen(false)}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`flex-1 py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? (
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : discountUpdated ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <Save className="h-5 w-5 mr-2" />
                        )}
                        {loading ? "Processing..." : discountUpdated ? "Saved!" : "Save Discount"}
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
