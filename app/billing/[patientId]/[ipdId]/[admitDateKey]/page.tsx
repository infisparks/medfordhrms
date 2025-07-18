// components/BillingPage.tsx
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
// ***** IMPORTANT: Use CreatableSelect from react-select/creatable"
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
  Clipboard,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { Dialog, Transition } from "@headlessui/react"
import InvoiceDownload from "../../../InvoiceDownload"
import BulkServiceModal from "./bulk-service-modal"

// ===== Interfaces =====
interface ServiceItem {
  serviceName: string
  doctorName?: string
  type: "service" | "doctorvisit"
  amount: number
  createdAt?: string
}
interface Payment {
  id?: string
  amount: number
  paymentType: string
  type: "advance" | "refund"
  amountType: "advance" | "deposit" | "settlement"; // NEW: Added amountType
  date: string
  through?: string // Added 'through' field
}
interface AdditionalServiceForm {
  serviceName: string
  amount: number
  quantity: number
}
interface PaymentForm {
  paymentAmount: number
  paymentType: string
  type: string
  amountType: "advance" | "deposit" | "settlement"; // NEW: Added amountType to form
  sendWhatsappNotification: boolean
  paymentDate: string
  through?: string // Made optional
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
  ageUnit?: string
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string
  amount: number
  paymentType: string
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  admitDate?: string
  createdAt?: string
  doctor?: string
  billNumber?: string
}
interface ParsedServiceItem {
  id: string
  serviceName: string
  quantity: number
  amount: number
}
interface IDoctor {
  id: string
  name: string
  specialist: string
  department: "OPD" | "IPD" | "Both"
  opdCharge?: number
  ipdCharges?: Record<string, number>
}

// ===== Validation Schemas =====
const additionalServiceSchema = yup
  .object({
    serviceName: yup.string().required("Service Name is required"),
    amount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
    quantity: yup
      .number()
      .typeError("Quantity must be an integer")
      .integer("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .required("Quantity is required"),
  })
  .required()
const paymentSchema = yup
  .object({
    paymentAmount: yup.number().required(),
    paymentType: yup.string().required(),
    type: yup.string().required(),
    amountType: yup.string().oneOf(["advance", "deposit", "settlement"]).required(), // NEW: amountType validation
    sendWhatsappNotification: yup.boolean().required(),
    paymentDate: yup.string().required(),
    through: yup.string().when("paymentType", {
      is: (paymentType: string) => paymentType === "online" || paymentType === "card",
      then: (schema) => schema.required("Through is required for online/card payments"),
      otherwise: (schema) => schema.notRequired(),
    }),
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

export default function BillingPage() {
  const { patientId, ipdId, admitDateKey } = useParams() as {
    patientId: string
    ipdId: string
    admitDateKey: string
  }
  const router = useRouter()
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false)
  const [beds, setBeds] = useState<any>({})
  const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "payments" | "consultants">("overview")
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
  const [discountUpdated, setDiscountUpdated] = useState(false)
  const [isBulkServiceModalOpen, setIsBulkServiceModalOpen] = useState(false)
  const [serviceOptions, setServiceOptions] = useState<{ value: string; label: string; amount: number }[]>([])

  // Forms
  const {
    register: registerService,
    handleSubmit: handleSubmitService,
    formState: { errors: errorsService },
    reset: resetService,
    setValue: setValueService,
    control: serviceControl,
  } = useForm<AdditionalServiceForm>({
    resolver: yupResolver(additionalServiceSchema),
    defaultValues: { serviceName: "", amount: 0, quantity: 1 },
  })
  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
    setValue: setValuePayment,
    watch: watchPayment,
  } = useForm<PaymentForm>({
    resolver: yupResolver(paymentSchema),
    defaultValues: {
      paymentAmount: 0,
      paymentType: "cash",
      type: "advance",
      amountType: "deposit", // NEW: Default amountType
      sendWhatsappNotification: false,
      paymentDate: new Date().toISOString().slice(0, 10),
      through: "cash", // Default to 'cash' for 'cash' payment type
    },
  })
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
  const {
    register: registerVisit,
    handleSubmit: handleSubmitVisit,
    formState: { errors: errorsVisit },
    reset: resetVisit,
    watch: watchVisit,
    setValue: setVisitValue,
    control: visitControl,
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

  const watchPaymentType = watchPayment("paymentType");

  // Update 'through' default value when 'paymentType' changes
  useEffect(() => {
    if (watchPaymentType === "cash") {
      setValuePayment("through", "cash");
    } else {
      setValuePayment("through", ""); // Clear for other types
    }
  }, [watchPaymentType, setValuePayment]);

  // Fetch beds
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      setBeds(snapshot.exists() ? snapshot.val() : {})
    })
    return () => unsubscribe()
  }, [])

  // Fetch doctors
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

  // Fetch service options
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

  const getAdmitDateKey = (dateString?: string) => {
    if (!dateString) return ""
    try {
      return format(parseISO(dateString), "yyyy-MM-dd")
    } catch (e) {
      console.error("Error parsing date for admitDateKey:", e)
      return ""
    }
  }

  // Load billing & patient data
  useEffect(() => {
    if (!patientId || !ipdId || !admitDateKey) return
    setLoading(true)
    const billingPath = `patients/ipddetail/userbillinginfoipd/${admitDateKey}/${patientId}/${ipdId}`
    const infoPath = `patients/ipddetail/userinfoipd/${admitDateKey}/${patientId}/${ipdId}`
    const patientInfoPath = `patients/patientinfo/${patientId}`

    let billingData: any = null,
      infoData: any = null,
      patientInfoData: any = null
    let billingLoaded = false,
      infoLoaded = false,
      patientInfoLoaded = false

    const checkAndSet = () => {
      if (billingLoaded && infoLoaded && patientInfoLoaded) {
        if (!infoData) {
          toast.error("Patient information not found.")
          setLoading(false)
          return
        }

        const base: BillingRecord = {
          patientId,
          uhid: infoData.uhid ?? patientId,
          ipdId,
          name: infoData.name || patientInfoData?.name || "Unknown",
          mobileNumber: infoData.phone || patientInfoData?.phone || "",
          address: infoData.address || patientInfoData?.address || "",
          age: infoData.age || patientInfoData?.age || "",
          ageUnit: infoData.ageUnit || patientInfoData?.ageUnit || "years",
          gender: infoData.gender || patientInfoData?.gender || "",
          relativeName: infoData.relativeName || "",
          relativePhone: infoData.relativePhone || "",
          relativeAddress: infoData.relativeAddress || "",
          dischargeDate: infoData.dischargeDate || "",
          amount: 0,
          paymentType: infoData.paymentType || "advance", // This seems to be a placeholder, actual payments are in payments array
          roomType: infoData.roomType || "",
          bed: infoData.bed || "",
          services: [],
          payments: [],
          discount: 0,
          admitDate: infoData.admissionDate || infoData.createdAt || undefined,
          createdAt: infoData.createdAt || "",
          doctor: infoData.doctor || "",
        }

        if (billingData) {
          const servicesArray = Array.isArray(billingData.services)
            ? billingData.services.map((svc: any) => ({
                serviceName: svc.serviceName || "",
                doctorName: svc.doctorName || "",
                type: svc.type || "service",
                amount: Number(svc.amount) || 0,
                createdAt: svc.createdAt || "",
              }))
            : []
          const paymentsArray: Payment[] = billingData.payments
            ? Object.keys(billingData.payments).map((k) => ({
                id: k,
                amount: Number(billingData.payments[k].amount) || 0,
                paymentType: billingData.payments[k].paymentType || "cash",
                type: billingData.payments[k].type || "advance",
                amountType: billingData.payments[k].amountType || "deposit", // NEW: Read amountType from Firebase
                date: billingData.payments[k].date || new Date().toISOString(),
                through: billingData.payments[k].through || "", // Read 'through' from Firebase
              }))
            : []
          const depositTotal = Number(billingData.totalDeposit) || 0

          setSelectedRecord({
            ...base,
            amount: depositTotal,
            services: servicesArray,
            payments: paymentsArray,
            discount: billingData.discount ? Number(billingData.discount) : 0,
            billNumber: billingData?.billNumber || infoData?.billNumber || '',
          })
          if (billingData.discount) resetDiscount({ discount: Number(billingData.discount) })
        } else {
          toast.info("No billing record found. Showing patient details only.")
          setSelectedRecord({ ...base, billNumber: infoData?.billNumber || '' })
        }
        setLoading(false)
      }
    }

    const unsubBilling = onValue(
      ref(db, billingPath),
      (snap) => {
        billingData = snap.val()
        billingLoaded = true
        checkAndSet()
      },
      () => {
        billingLoaded = true
        checkAndSet()
      },
    )

    const unsubInfo = onValue(
      ref(db, infoPath),
      (snap) => {
        infoData = snap.val()
        infoLoaded = true
        checkAndSet()
      },
      () => {
        infoLoaded = true
        checkAndSet()
      },
    )

    get(ref(db, patientInfoPath))
      .then((snap) => {
        patientInfoData = snap.exists() ? snap.val() : null
        patientInfoLoaded = true
        checkAndSet()
      })
      .catch(() => {
        patientInfoLoaded = true
        checkAndSet()
      })

    return () => {
      unsubBilling()
      unsubInfo()
    }
  }, [patientId, ipdId, admitDateKey, resetDiscount])

  // Auto-fill visit charge
  const watchSelectedDoctorId = watchVisit("doctorId")
  const watchIsCustomDoctor = watchVisit("isCustomDoctor")
  useEffect(() => {
    if (watchIsCustomDoctor || !watchSelectedDoctorId || !selectedRecord) return
    const doc = doctors.find((d) => d.id === watchSelectedDoctorId)
    if (!doc) return

    let amount = 0
    if (doc.department === "OPD") {
      amount = doc.opdCharge ?? 0
    } else {
      if (selectedRecord.roomType && doc.ipdCharges?.[selectedRecord.roomType]) {
        amount = doc.ipdCharges[selectedRecord.roomType]
      }
      if (doc.department === "Both" && !amount && doc.opdCharge) {
        amount = doc.opdCharge
      }
    }
    setVisitValue("visitCharge", amount)
  }, [watchSelectedDoctorId, selectedRecord, doctors, setVisitValue, watchIsCustomDoctor])

  // Group services
  const getGroupedServices = (services: ServiceItem[]) => {
    const grouped: Record<string, { serviceName: string; amount: number; quantity: number; createdAt: string }> = {}
    services.forEach((item) => {
      if (item.type === "service") {
        const key = `${item.serviceName}-${item.amount}`
        if (grouped[key]) {
          grouped[key].quantity += 1
        } else {
          grouped[key] = {
            serviceName: item.serviceName,
            amount: item.amount,
            quantity: 1,
            createdAt: item.createdAt || new Date().toLocaleString(),
          }
        }
      }
    })
    return Object.values(grouped)
  }

  const serviceItems = selectedRecord?.services.filter((s) => s.type === "service") || []
  const groupedServiceItems = getGroupedServices(serviceItems)
  const hospitalServiceTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0)

  const consultantChargeItems = selectedRecord?.services.filter((s) => s.type === "doctorvisit") || []
  const consultantChargeTotal = consultantChargeItems.reduce((sum, s) => sum + s.amount, 0)

  const discountVal = selectedRecord?.discount || 0
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal
  const totalRefunds = selectedRecord
    ? selectedRecord.payments.filter((p) => p.type === "refund").reduce((sum, p) => sum + p.amount, 0)
    : 0
  const balanceAmount = totalBill - (selectedRecord?.amount || 0)
  const discountPercentage =
    hospitalServiceTotal + consultantChargeTotal > 0
      ? ((discountVal / (hospitalServiceTotal + consultantChargeTotal)) * 100).toFixed(1)
      : "0.0"

  // Aggregate consultant charges
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
      { doctorName: string; visited: number; totalCharge: number; lastVisit: Date | null; items: ServiceItem[] }
    >,
  )
  const aggregatedConsultantChargesArray = Object.values(aggregatedConsultantCharges)

  // Payment notification
  const sendPaymentNotification = async (
    patientMobile: string,
    patientName: string,
    paymentAmount: number,
    updatedDeposit: number,
    paymentType: "advance" | "refund",
  ) => {
    const apiUrl = "https://a.infispark.in/send-text"
    let message = ""
    if (paymentType === "advance") {
      message = `Dear ${patientName}, your payment of Rs ${paymentAmount.toLocaleString()} has been successfully added to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}. Thank you for choosing our service.`
    } else {
      message = `Dear ${patientName}, a refund of Rs ${paymentAmount.toLocaleString()} has been processed to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}.`
    }
    const payload = { token: "99583991573", number: `91${patientMobile}`, message }
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) console.error("Notification API error:", response.statusText)
    } catch (error) {
      console.error("Error sending notification:", error)
    }
  }

  // Handlers
  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const old = [...selectedRecord.services]
      const newItems: ServiceItem[] = []
      for (let i = 0; i < data.quantity; i++) {
        newItems.push({
          serviceName: data.serviceName,
          doctorName: "",
          type: "service",
          amount: Number(data.amount),
          createdAt: new Date().toLocaleString(),
        })
      }
      const updated = [...newItems, ...old].map((svc) => ({
        serviceName: svc.serviceName,
        doctorName: svc.doctorName,
        type: svc.type,
        amount: svc.amount,
        createdAt: svc.createdAt,
      }))
      const recordRef = ref(
        db,
        `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`,
      )
      await update(recordRef, { services: updated })
      toast.success(`Additional service${data.quantity > 1 ? "s" : ""} added successfully!`)
      setSelectedRecord({ ...selectedRecord, services: updated })
      resetService({ serviceName: "", amount: 0, quantity: 1 })
    } catch (error) {
      console.error("Error adding service:", error)
      toast.error("Failed to add service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleAddBulkServices = async (servicesToAdd: ParsedServiceItem[]) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      throw new Error("Admission date not found.")
    }
    try {
      const currentServices = [...selectedRecord.services]
      for (const svc of servicesToAdd) {
        for (let i = 0; i < svc.quantity; i++) {
          currentServices.push({
            serviceName: svc.serviceName,
            doctorName: "",
            type: "service",
            amount: Number(svc.amount),
            createdAt: new Date().toLocaleString(),
          })
        }
      }
      const updated = currentServices.map((svc) => ({
        serviceName: svc.serviceName,
        doctorName: svc.doctorName,
        type: svc.type,
        amount: svc.amount,
        createdAt: svc.createdAt,
      }))
      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { services: updated },
      )
      setSelectedRecord({ ...selectedRecord, services: updated })
    } catch (error) {
      console.error("Error adding bulk services:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const onSubmitPayment: SubmitHandler<PaymentForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const now = new Date()
      const [year, month, day] = formData.paymentDate.split("-").map(Number)
      const combined = new Date(
        year,
        month - 1,
        day,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
      )
      const isoDate = combined.toISOString()

      const newRef = push(
        ref(
          db,
          `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}/payments`,
        ),
      )
      const newPayment: Payment = {
        amount: Number(formData.paymentAmount),
        paymentType: formData.paymentType,
        type: formData.type as "advance" | "refund",
        amountType: formData.amountType, // NEW: Save amountType
        date: isoDate,
        id: newRef.key!,
        through: formData.through, // Save 'through' field
      }
      await update(newRef, newPayment)

      let updatedDeposit = selectedRecord.amount
      if (newPayment.type === "advance") updatedDeposit += newPayment.amount
      if (newPayment.type === "refund") updatedDeposit -= newPayment.amount

      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { totalDeposit: updatedDeposit },
      )

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
      setSelectedRecord({
        ...selectedRecord,
        payments: [newPayment, ...selectedRecord.payments],
        amount: updatedDeposit,
      })
      resetPayment({
        paymentAmount: 0,
        paymentType: "cash",
        type: "advance",
        amountType: "deposit", // NEW: Reset amountType
        sendWhatsappNotification: false,
        paymentDate: new Date().toISOString().slice(0, 10),
        through: "cash", // Reset to 'cash' after submission
      })
    } catch (error) {
      console.error("Error recording payment:", error)
      toast.error("Failed to record payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDischarge = () => {
    if (!selectedRecord) return
    const key = getAdmitDateKey(selectedRecord.admitDate)
    router.push(`/discharge-summary/${selectedRecord.patientId}/${selectedRecord.ipdId}/${key}`)
  }

  const onSubmitDiscount: SubmitHandler<DiscountForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const discountVal = Number(formData.discount)
      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { discount: discountVal },
      )
      toast.success("Discount applied successfully!")
      setSelectedRecord({ ...selectedRecord, discount: discountVal })
      setDiscountUpdated(true)
      setTimeout(() => setIsDiscountModalOpen(false), 1000)
    } catch (error) {
      console.error("Error applying discount:", error)
      toast.error("Failed to apply discount. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const onSubmitDoctorVisit: SubmitHandler<DoctorVisitForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const doctorName = data.isCustomDoctor
        ? data.customDoctorName || "Custom Doctor"
        : doctors.find((d) => d.id === data.doctorId)?.name || "Unknown"

      const old = [...selectedRecord.services]
      const newItems: ServiceItem[] = []
      for (let i = 0; i < data.visitTimes; i++) {
        newItems.push({
          serviceName: `Consultant Charge: Dr. ${doctorName}`,
          doctorName,
          type: "doctorvisit",
          amount: Number(data.visitCharge),
          createdAt: new Date().toLocaleString(),
        })
      }

      const updated = [...newItems, ...old].map((svc) => ({
        serviceName: svc.serviceName,
        doctorName: svc.doctorName,
        type: svc.type,
        amount: svc.amount,
        createdAt: svc.createdAt,
      }))

      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { services: updated },
      )
      toast.success(
        `Consultant charge${data.visitTimes > 1 ? "s" : ""} added successfully! (${data.visitTimes} visit${data.visitTimes > 1 ? "s" : ""})`,
      )
      setSelectedRecord({ ...selectedRecord, services: updated })
      resetVisit({ doctorId: "", visitCharge: 0, visitTimes: 1, customDoctorName: "", isCustomDoctor: false })
    } catch (error) {
      console.error("Error adding consultant charge:", error)
      toast.error("Failed to add consultant charge. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroupedServiceItem = async (serviceName: string, amount: number) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const updated = selectedRecord.services.filter(
        (svc) => !(svc.serviceName === serviceName && svc.amount === amount && svc.type === "service"),
      )
      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { services: updated },
      )
      toast.success(`All instances of '${serviceName}' deleted successfully!`)
      setSelectedRecord({ ...selectedRecord, services: updated })
    } catch (error) {
      console.error("Error deleting service:", error)
      toast.error("Failed to delete service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePayment = async (paymentId: string, paymentAmount: number, paymentType: "advance" | "refund") => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      await remove(
        ref(
          db,
          `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}/payments/${paymentId}`,
        ),
      )

      let updatedDeposit = selectedRecord.amount
      if (paymentType === "advance") updatedDeposit -= paymentAmount
      if (paymentType === "refund") updatedDeposit += paymentAmount

      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { totalDeposit: updatedDeposit },
      )

      toast.success("Payment deleted successfully!")
      setSelectedRecord({
        ...selectedRecord,
        payments: selectedRecord.payments.filter((p) => p.id !== paymentId),
        amount: updatedDeposit,
      })
    } catch (error) {
      console.error("Error deleting payment:", error)
      toast.error("Failed to delete payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConsultantCharges = async (doctorName: string) => {
    if (!selectedRecord) return
    setLoading(true)
    const key = getAdmitDateKey(selectedRecord.admitDate)
    if (!key) {
      toast.error("Admission date not found.")
      setLoading(false)
      return
    }
    try {
      const updated = selectedRecord.services.filter(
        (svc) => svc.type !== "doctorvisit" || svc.doctorName !== doctorName,
      )
      await update(
        ref(db, `patients/ipddetail/userbillinginfoipd/${key}/${selectedRecord.patientId}/${selectedRecord.ipdId}`),
        { services: updated },
      )
      toast.success(`Consultant charges for Dr. ${doctorName} deleted successfully!`)
      setSelectedRecord({ ...selectedRecord, services: updated })
    } catch (error) {
      console.error("Error deleting consultant charges:", error)
      toast.error("Failed to delete consultant charges. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const doctorOptions = doctors.map((doc) => ({ value: doc.id, label: `${doc.name} (${doc.specialist})` }))

  let primaryDoctorName = "N/A"
  if (selectedRecord?.doctor) {
    const found = doctors.find((d) => d.id === selectedRecord.doctor)
    if (found) primaryDoctorName = found.name
  }

  const handleCopyDetails = async () => {
    if (!selectedRecord) {
      toast.error("No patient record selected to copy details.")
      return
    }

    try {
      // 1. Date of Admission (dd-mm-yyyy)
      const admissionDate = selectedRecord.admitDate ? format(parseISO(selectedRecord.admitDate), "dd-MM-yyyy") : "N/A"

      // 2. Discharge Date (dd-mm-yyyy) or blank
      const dischargeDate = selectedRecord.dischargeDate
        ? format(parseISO(selectedRecord.dischargeDate), "dd-MM-yyyy")
        : ""

      // 3. UHID
      const uhid = selectedRecord.uhid || "N/A"

      // 4. Leave blank
      const blankColumn = ""

      // 5. Patient Name
      const patientName = selectedRecord.name || "N/A"

      // 6. User Age and Gender (e.g., 50/M or 39/F)
      const age = selectedRecord.age || "N/A"
      const genderInitial = selectedRecord.gender?.charAt(0).toUpperCase() || "N/A"
      const ageGender = `${age}/${genderInitial}`

      // 7. Contact Number of Patient
      const contactNumber = selectedRecord.mobileNumber || "N/A"

      // 8. Room Name
      let roomName = "N/A"
      if (selectedRecord.roomType) {
        roomName = selectedRecord.roomType
        if (selectedRecord.bed && beds[selectedRecord.roomType]?.[selectedRecord.bed]?.bedNumber) {
          roomName += ` (${beds[selectedRecord.roomType][selectedRecord.bed].bedNumber})`
        }
      }

      // 9. Doctor Name
      const doctorName = primaryDoctorName

      const detailsToCopy = [
        admissionDate,
        dischargeDate,
        uhid,
        blankColumn,
        patientName,
        ageGender,
        contactNumber,
        roomName,
        doctorName,
      ].join("\t") // Tab-separated for Excel

      await navigator.clipboard.writeText(detailsToCopy)
      toast.success("Patient details copied to clipboard!")
    } catch (error) {
      console.error("Failed to copy details:", error)
      toast.error("Failed to copy details. Please try again.")
    }
  }

  const getThroughOptions = () => {
    if (watchPaymentType === "cash") {
      return (
        <>
          <option value="cash">Cash</option>
          <option value="trust-cash">Trust Cash</option>
        </>
      );
    } else if (watchPaymentType === "online" || watchPaymentType === "card") {
      return (
        <>
          <option value="">Select Option</option>
          <option value="upi">UPI</option>
          <option value="credit-card">Credit Card</option>
          <option value="debit-card">Debit Card</option>
          <option value="netbanking">Net Banking</option>
          <option value="cheque">Cheque</option>
          <option value="trust-online">Trust Online</option>
        </>
      );
    }
    return <option value="">Select Option</option>; // Default for other types, though not expected based on schema
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <ToastContainer position="top-right" autoClose={3000} />
      {/* HEADER */}
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
                onClick={handleCopyDetails} // New button for copying details
                disabled={loading || !selectedRecord}
                className="flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm"
              >
                <Clipboard size={16} className="mr-2" /> Copy Details
              </button>
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
      {/* MAIN */}
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
              {/* PATIENT SUMMARY CARD */}
              <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-white">{selectedRecord.name}</h1>
                      <p className="text-teal-50">UHID: {selectedRecord.uhid || "Not assigned"}</p>
                      <p className="text-teal-50 mt-1">
                        Under care of Dr.: <span className="font-semibold">{primaryDoctorName}</span>
                      </p>
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
                            <p className="font-medium">
                              {selectedRecord.age || "Not provided"} {selectedRecord.ageUnit || "years"}
                            </p>
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
                        {/* Preview Bill */}
                        <InvoiceDownload record={selectedRecord} beds={beds} doctors={doctors}>
                          <button
                            type="button"
                            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          >
                            <FileText size={16} className="mr-2" /> Preview Bill
                          </button>
                        </InvoiceDownload>
                        <button
                          onClick={() => setActiveTab("payments")}
                          className="w-full flex items-center justify-center px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                        >
                          <CreditCard size={16} className="mr-2" /> Add Payment
                        </button>
                        <button
                          onClick={() => setIsBulkServiceModalOpen(true)}
                          className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                          <Plus size={16} className="mr-2" /> Add Bulk Service
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* TABS */}
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
              {/* TAB CONTENT */}
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
                        {groupedServiceItems.length === 0 ? (
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
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Qty
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
                                {groupedServiceItems.slice(0, 5).map((srv, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{srv.quantity}</td>
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
                                  <td></td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                            {groupedServiceItems.length > 5 && (
                              <div className="mt-3 text-right">
                                <button
                                  onClick={() => setActiveTab("services")}
                                  className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center justify-end w-full"
                                >
                                  View all {groupedServiceItems.length} services{" "}
                                  <ChevronRight size={16} className="ml-1" />
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
                                {aggregatedConsultantChargesArray.map((agg, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
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
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Hospital Services</h3>
                        {groupedServiceItems.length === 0 ? (
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
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Qty
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
                                {groupedServiceItems.map((srv, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{srv.quantity}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {srv.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {srv.createdAt ? new Date(srv.createdAt).toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      <button
                                        onClick={() => handleDeleteGroupedServiceItem(srv.serviceName, srv.amount)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Delete all instances of this service"
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
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                      {/* Add Service Form */}
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Hospital Service</h3>
                          <form onSubmit={handleSubmitService(onSubmitAdditionalService)} className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                              <Controller
                                control={serviceControl}
                                name="serviceName"
                                render={({ field }) => {
                                  const valueStr = field.value || ""
                                  const selectedOption = serviceOptions.find(
                                    (opt) =>
                                      typeof opt.label === "string" &&
                                      typeof valueStr === "string" &&
                                      opt.label.toLowerCase() === valueStr.toLowerCase(),
                                  ) || { label: valueStr, value: valueStr }
                                  return (
                                    <CreatableSelect
                                      {...field}
                                      isClearable
                                      options={serviceOptions}
                                      placeholder="Select or type a service..."
                                      onChange={(selected) => {
                                        if (selected) {
                                          field.onChange(selected.label)
                                          const found = serviceOptions.find((opt) => opt.label === selected.label)
                                          if (found) setValueService("amount", found.amount)
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
                                    Amount Type {/* NEW: Added Amount Type header */}
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Through
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
                                {selectedRecord.payments.map((payment, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {payment.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.paymentType}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.type}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.amountType} {/* NEW: Display amountType */}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.through || "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {new Date(payment.date).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
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
                      {/* Record Payment Form */}
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <CreditCard size={16} className="mr-2 text-teal-600" /> Record Payment
                          </h3>
                          <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Payment Amount (₹)
                              </label>
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
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.paymentType ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              >
                                <option value="">Select Payment Type</option>
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                                <option value="card">Card</option> {/* Added Card option */}
                              </select>
                              {errorsPayment.paymentType && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentType.message}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Through</label>
                              <select
                                {...registerPayment("through")}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.through ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                disabled={watchPaymentType === "cash"} // Disable if paymentType is cash, but still allow selection from getThroughOptions()
                              >
                                {getThroughOptions()}
                              </select>
                              {errorsPayment.through && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.through.message}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Type</label> {/* NEW: Amount Type dropdown */}
                              <select
                                {...registerPayment("amountType")}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.amountType ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                              >
                                <option value="deposit">Deposit</option>
                                <option value="advance">Advance</option>
                                <option value="settlement">Settlement</option>
                              </select>
                              {errorsPayment.amountType && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.amountType.message}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment For</label> {/* Renamed "Type" to "Payment For" */}
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
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                              <input
                                type="date"
                                {...registerPayment("paymentDate")}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                  errorsPayment.paymentDate ? "border-red-500" : "border-gray-300"
                                } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                defaultValue={new Date().toISOString().slice(0, 10)}
                              />
                              {errorsPayment.paymentDate && (
                                <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentDate.message}</p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Time will be set to current time automatically.
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
                {/* Consultants Tab */}
                {activeTab === "consultants" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                                {aggregatedConsultantChargesArray.map((agg, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{agg.totalCharge.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
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
                      <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <UserPlus size={16} className="mr-2 text-teal-600" /> Add Consultant Charge
                          </h3>
                          <form onSubmit={handleSubmitVisit(onSubmitDoctorVisit)} className="space-y-4">
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
                            {!watchIsCustomDoctor ? (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  <Search size={16} className="inline mr-1" />
                                  Select Doctor
                                </label>
                                <Controller
                                  control={visitControl}
                                  name="doctorId"
                                  render={({ field }) => (
                                    <Select
                                      {...field}
                                      options={doctorOptions}
                                      isClearable
                                      placeholder="Search or select a doctor..."
                                      onChange={(opt) => field.onChange(opt ? opt.value : "")}
                                      value={doctorOptions.find((o) => o.value === field.value) || null}
                                      classNamePrefix="react-select"
                                      styles={{
                                        control: (base, state) => ({
                                          ...base,
                                          borderColor: errorsVisit.doctorId ? "rgb(239 68 68)" : base.borderColor,
                                          boxShadow: state.isFocused ? "0 0 0 2px rgb(20 184 166)" : base.boxShadow,
                                          "&:hover": {
                                            borderColor: errorsVisit.doctorId
                                              ? "rgb(239 68 68)"
                                              : (base["&:hover"] as any)?.borderColor || "transparent",
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
                            Amount Type {/* NEW: Added Amount Type header */}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Through
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
                        {selectedRecord.payments.map((payment, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              {payment.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.paymentType}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.type}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                              {payment.amountType} {/* NEW: Display amountType */}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                              {payment.through || "N/A"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(payment.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
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
                    {watchDiscount("discount") > 0 && hospitalServiceTotal + consultantChargeTotal > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 p-3 rounded-lg border border-emerald-100"
                      >
                        <p className="text-sm text-emerald-700 flex items-center">
                          <Tag className="h-4 w-4 mr-1" />
                          This is equivalent to a{" "}
                          <span className="font-bold mx-1">
                            {(
                              (watchDiscount("discount") / (hospitalServiceTotal + consultantChargeTotal)) *
                              100
                            ).toFixed(1)}
                            %
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
      {/* Bulk Service Modal */}
      <BulkServiceModal
        isOpen={isBulkServiceModalOpen}
        onClose={() => setIsBulkServiceModalOpen(false)}
        onAddServices={handleAddBulkServices}
        geminiApiKey={"AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"}
      />
    </div>
  )
}