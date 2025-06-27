"use client"

import type React from "react"
import { useEffect, useRef, useCallback, useMemo } from "react"
import { type UseFormReturn, Controller } from "react-hook-form"
import { type IFormInput, type PatientRecord, GenderOptions, PaymentOptions } from "./types"
import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  IndianRupeeIcon,
  PersonStandingIcon as PersonIcon,
  CalendarIcon,
  User,
  CreditCard,
  FileText,
  Hospital,
  PhoneCall,
  Search,
} from "lucide-react"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalitySelector } from "./modality-selector"
import type { Doctor } from "./types"
import { DoctorSearchDropdown } from "./Component/doctor-search-dropdown" // Import DoctorSearchDropdown

interface PatientFormProps {
  form: UseFormReturn<IFormInput>
  doctors: Doctor[]
  patientSuggestions: PatientRecord[]
  phoneSuggestions: PatientRecord[]
  uhidSearchInput: string // New prop for UHID search input value
  uhidSuggestions: PatientRecord[] // New prop for UHID suggestions
  showNameSuggestions: boolean
  showPhoneSuggestions: boolean
  showUhidSuggestions: boolean // New prop for UHID suggestion visibility
  selectedPatient: PatientRecord | null
  onPatientSelect: (patient: PatientRecord) => void
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUhidChange: (e: React.ChangeEvent<HTMLInputElement>) => void // New prop for UHID change handler
  setShowNameSuggestions: (show: boolean) => void
  setShowPhoneSuggestions: (show: boolean) => void
  setShowUhidSuggestions: (show: boolean) => void // New prop for UHID suggestion visibility setter
}

function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

export function PatientForm({
  form,
  doctors,
  patientSuggestions,
  phoneSuggestions,
  uhidSearchInput, // Destructure new prop
  uhidSuggestions, // Destructure new prop
  showNameSuggestions,
  showPhoneSuggestions,
  showUhidSuggestions, // Destructure new prop
  selectedPatient,
  onPatientSelect,
  onNameChange,
  onPhoneChange,
  onUhidChange, // Destructure new prop
  setShowNameSuggestions,
  setShowPhoneSuggestions,
  setShowUhidSuggestions, // Destructure new prop
}: PatientFormProps) {
  const {
    register,
    control,
    formState: { errors },
    watch,
    setValue,
  } = form

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)
  const uhidInputRef = useRef<HTMLInputElement | null>(null) // New ref for UHID input
  const nameSuggestionBoxRef = useRef<HTMLDivElement | null>(null)
  const phoneSuggestionBoxRef = useRef<HTMLDivElement | null>(null)
  const uhidSuggestionBoxRef = useRef<HTMLDivElement | null>(null) // New ref for UHID suggestion box

  const watchedModalities = watch("modalities") || []
  const watchedPaymentMethod = watch("paymentMethod")
  const watchedAppointmentType = watch("appointmentType")
  const watchedCashAmount = watch("cashAmount")
  const watchedOnlineAmount = watch("onlineAmount")

  // Calculate total charges
  const getTotalModalityCharges = useCallback(() => {
    return watchedModalities.reduce((total, modality) => total + modality.charges, 0)
  }, [watchedModalities])

  const totalModalityCharges = useMemo(() => getTotalModalityCharges(), [getTotalModalityCharges])

  // Payment logic - only for hospital visits
  useEffect(() => {
    if (watchedAppointmentType === "visithospital" && !watchedPaymentMethod) {
      setValue("paymentMethod", "cash")
    }
  }, [watchedAppointmentType, watchedPaymentMethod, setValue])

  useEffect(() => {
    if (
      watchedAppointmentType === "visithospital" &&
      watchedModalities.length > 0 &&
      watchedCashAmount === undefined &&
      watchedOnlineAmount === undefined
    ) {
      const totalCharges = totalModalityCharges
      setValue("cashAmount", totalCharges)
      setValue("onlineAmount", 0)
      setValue("discount", 0)
    }
  }, [watchedModalities.length, watchedAppointmentType, totalModalityCharges, setValue])

  // Fixed payment calculation logic - only for hospital visits
  useEffect(() => {
    if (watchedAppointmentType !== "visithospital") return

    const totalCharges = totalModalityCharges
    const cashAmount = Number(watchedCashAmount) || 0
    const onlineAmount = Number(watchedOnlineAmount) || 0
    const totalPaid = cashAmount + onlineAmount

    let discount = 0

    // Calculate discount based on the difference between total charges and amount paid
    if (totalPaid < totalCharges) {
      discount = totalCharges - totalPaid
    }

    // Only update if discount has actually changed
    if (watch("discount") !== discount) {
      setValue("discount", discount)
    }
  }, [
    watchedAppointmentType,
    watchedPaymentMethod,
    watchedCashAmount,
    watchedOnlineAmount,
    totalModalityCharges,
    setValue,
    watch,
  ])

  // Hide suggestions on outside click for Name
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showNameSuggestions &&
        nameSuggestionBoxRef.current &&
        !nameSuggestionBoxRef.current.contains(event.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(event.target as Node)
      ) {
        setShowNameSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showNameSuggestions, setShowNameSuggestions])

  // Hide suggestions on outside click for Phone
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showPhoneSuggestions &&
        phoneSuggestionBoxRef.current &&
        !phoneSuggestionBoxRef.current.contains(event.target as Node) &&
        phoneInputRef.current &&
        !phoneInputRef.current.contains(event.target as Node)
      ) {
        setShowPhoneSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showPhoneSuggestions, setShowPhoneSuggestions])

  // Hide suggestions on outside click for UHID
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showUhidSuggestions &&
        uhidSuggestionBoxRef.current &&
        !uhidSuggestionBoxRef.current.contains(event.target as Node) &&
        uhidInputRef.current &&
        !uhidInputRef.current.contains(event.target as Node)
      ) {
        setShowUhidSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showUhidSuggestions, setShowUhidSuggestions])

  // Fixed calculation: Final amount = Cash + Online (total amount paid)
  const calculateTotalAmount = () => {
    const cashAmount = Number(watch("cashAmount")) || 0
    const onlineAmount = Number(watch("onlineAmount")) || 0
    return cashAmount + onlineAmount
  }

  return (
    <div className="space-y-6">
      {/* Patient Information Section */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />
            Patient Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Patient Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Patient Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="name"
                  type="text"
                  {...register("name", { required: "Name is required" })}
                  onChange={onNameChange}
                  placeholder="Enter patient name"
                  className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
                  autoComplete="off"
                  ref={(e) => {
                    register("name", { required: "Name is required" }).ref(e)
                    nameInputRef.current = e
                  }}
                />
                {showNameSuggestions && patientSuggestions.length > 0 && (
                  <div
                    ref={nameSuggestionBoxRef}
                    className="absolute z-10 bg-white border border-gray-200 rounded-md w-full mt-1 max-h-48 shadow-lg"
                  >
                    <ScrollArea className="max-h-48">
                      <div className="p-1">
                        {patientSuggestions.map((suggestion) => (
                          <div
                            key={suggestion.id}
                            className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 rounded-md cursor-pointer"
                            onClick={() => onPatientSelect(suggestion)}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                                  {suggestion.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{suggestion.name}</span>
                            </div>
                            <Badge variant="default" className="text-xs">
                              Existing
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="phone"
                  type="tel"
                  {...register("phone", {
                    required: "Phone number is required",
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: "Please enter a valid 10-digit phone number",
                    },
                  })}
                  onChange={onPhoneChange}
                  placeholder="Enter 10-digit number"
                  className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
                  autoComplete="off"
                  ref={(e) => {
                    register("phone", {
                      required: "Phone number is required",
                      pattern: {
                        value: /^[0-9]{10}$/,
                        message: "Please enter a valid 10-digit phone number",
                      },
                    }).ref(e)
                    phoneInputRef.current = e
                  }}
                />
                {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                  <div
                    ref={phoneSuggestionBoxRef}
                    className="absolute z-10 bg-white border border-gray-200 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
                  >
                    {phoneSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        onClick={() => onPatientSelect(suggestion)}
                        className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                              {suggestion.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{suggestion.name}</span>
                        </div>
                        <Badge variant="default" className="text-xs">
                          Existing
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
            </div>

            {/* UHID Search - New Field */}
            <div className="space-y-2">
              <Label htmlFor="uhid" className="text-sm font-medium">
                Search by UHID (Optional)
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="uhid"
                  type="text"
                  value={uhidSearchInput}
                  onChange={onUhidChange}
                  placeholder="Enter UHID"
                  className="pl-10"
                  autoComplete="off"
                  ref={uhidInputRef}
                />
                {showUhidSuggestions && uhidSuggestions.length > 0 && (
                  <div
                    ref={uhidSuggestionBoxRef}
                    className="absolute z-10 bg-white border border-gray-200 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
                  >
                    {uhidSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        onClick={() => onPatientSelect(suggestion)}
                        className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                              {suggestion.uhid?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{suggestion.uhid}</span>
                        </div>
                        <Badge variant="default" className="text-xs">
                          Existing
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Age */}
            <div className="space-y-2">
              <Label htmlFor="age" className="text-sm font-medium">
                Age <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="age"
                  type="number"
                  {...register("age", {
                    required: "Age is required",
                    min: { value: 1, message: "Age must be positive" },
                  })}
                  placeholder="Enter age"
                  className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
                />
              </div>
              {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-sm font-medium">
                Gender <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="gender"
                rules={{ required: "Gender is required" }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={errors.gender ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GenderOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
            </div>

            {/* Consulting Doctor - New Field */}
            <div className="space-y-2">
              <Label htmlFor="doctor" className="text-sm font-medium">
                Consulting Doctor (Optional)
              </Label>
              <Controller
                control={control}
                name="doctor"
                render={({ field }) => (
                  <DoctorSearchDropdown
                    doctors={doctors}
                    value={field.value || ""}
                    onSelect={field.onChange}
                    placeholder="Select consulting doctor"
                  />
                )}
              />
              {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
            </div>
          </div>

          {/* Appointment Type and Date/Time Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Appointment Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Appointment Type <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    watch("appointmentType") === "visithospital"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setValue("appointmentType", "visithospital")}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        watch("appointmentType") === "visithospital" ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}
                    ></div>
                    <Hospital className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Visit Hospital</span>
                  </div>
                </div>
                <div
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    watch("appointmentType") === "oncall"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setValue("appointmentType", "oncall")}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        watch("appointmentType") === "oncall" ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}
                    ></div>
                    <PhoneCall className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">On-Call</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Date, Time, and Referred By */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium">
                  Date <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Controller
                    control={control}
                    name="date"
                    rules={{ required: "Date is required" }}
                    render={({ field }) => (
                      <DatePicker
                        selected={field.value}
                        onChange={(date: Date | null) => date && field.onChange(date)}
                        dateFormat="dd/MM/yyyy"
                        placeholderText="Select Date"
                        className={`w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 ${
                          errors.date ? "border-red-500" : ""
                        }`}
                      />
                    )}
                  />
                </div>
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="time" className="text-sm font-medium">
                  Time <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="time"
                    type="text"
                    {...register("time", { required: "Time is required" })}
                    placeholder="10:30 AM"
                    className={`pl-10 ${errors.time ? "border-red-500" : ""}`}
                    defaultValue={formatAMPM(new Date())}
                  />
                </div>
                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="referredBy" className="text-sm font-medium">
                  Referred By
                </Label>
                <Input id="referredBy" type="text" {...register("referredBy")} placeholder="Referrer name" />
              </div>
            </div>
          </div>

          {/* Address - Only for hospital visits */}
          {watchedAppointmentType === "visithospital" && (
            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium">
                Address
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                <Textarea
                  id="address"
                  {...register("address")}
                  placeholder="Enter address (optional)"
                  className="pl-10 min-h-[60px]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Medical Services Section - Only for hospital visits */}
      {watchedAppointmentType === "visithospital" && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hospital className="h-5 w-5 text-green-600" />
              Medical Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="modalities"
              rules={{
                required: watchedAppointmentType === "visithospital" ? "At least one service is required" : false,
                validate: (modalities) => {
                  if (!modalities || modalities.length === 0) {
                    return "At least one service is required"
                  }

                  for (const modality of modalities) {
                    if (modality.type === "consultation") {
                      if (!modality.specialist) return "Specialist is required for consultation"
                      if (!modality.doctor) return "Doctor is required for consultation"
                      if (!modality.visitType) return "Visit type is required for consultation"
                    }
                    if (
                      (modality.type === "casualty" ||
                        modality.type === "xray" ||
                        modality.type === "pathology" ||
                        modality.type === "ipd" ||
                        modality.type === "radiology") &&
                      !modality.service
                    ) {
                      return `Service is required for ${modality.type}`
                    }
                  }
                  return true
                },
              }}
              render={({ field }) => (
                <ModalitySelector modalities={field.value || []} doctors={doctors} onChange={field.onChange} />
              )}
            />
            {errors.modalities && <p className="text-sm text-red-500 mt-2">{errors.modalities.message}</p>}
          </CardContent>
        </Card>
      )}

      {/* Payment Section - Only for hospital visits */}
      {watchedAppointmentType === "visithospital" && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-purple-600" />
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Payment Method */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="text-sm font-medium">
                  Payment Method <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="paymentMethod"
                  rules={{
                    required: watchedAppointmentType === "visithospital" ? "Payment method is required" : false,
                  }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "cash"}>
                      <SelectTrigger className={errors.paymentMethod ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PaymentOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.paymentMethod && <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>}
              </div>

              {/* Total Charges Display */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Total Charges</Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    value={totalModalityCharges}
                    readOnly
                    className="pl-10 bg-gray-50 cursor-not-allowed font-semibold text-blue-600"
                  />
                </div>
              </div>

              {/* Amount Fields */}
              {watchedPaymentMethod === "mixed" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cashAmount" className="text-sm font-medium">
                      Cash Amount <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="cashAmount"
                        type="number"
                        placeholder="Cash amount"
                        className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                        {...register("cashAmount", {
                          required: watchedAppointmentType === "visithospital" ? "Cash amount is required" : false,
                          min: { value: 0, message: "Amount must be positive" },
                          valueAsNumber: true,
                        })}
                        onWheel={e => e.currentTarget.blur()}
                      />
                    </div>
                    {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="onlineAmount" className="text-sm font-medium">
                      Online Amount <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="onlineAmount"
                        type="number"
                        placeholder="Online amount"
                        className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                        {...register("onlineAmount", {
                          required: watchedAppointmentType === "visithospital" ? "Online amount is required" : false,
                          min: { value: 0, message: "Amount must be positive" },
                          valueAsNumber: true,
                        })}
                        onWheel={e => e.currentTarget.blur()}
                      />
                    </div>
                    {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                  </div>
                </>
              ) : watchedPaymentMethod === "online" ? (
                <div className="space-y-2">
                  <Label htmlFor="onlineAmount" className="text-sm font-medium">
                    Online Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="onlineAmount"
                      type="number"
                      placeholder="Online amount"
                      className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                      {...register("onlineAmount", {
                        required: watchedAppointmentType === "visithospital" ? "Online amount is required" : false,
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={e => e.currentTarget.blur()}
                    />
                  </div>
                  {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="cashAmount" className="text-sm font-medium">
                    Cash Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="cashAmount"
                      type="number"
                      placeholder="Cash amount"
                      className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                      {...register("cashAmount", {
                        required: watchedAppointmentType === "visithospital" ? "Amount is required" : false,
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={e => e.currentTarget.blur()}
                    />
                  </div>
                  {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                </div>
              )}

              {/* Discount */}
              <div className="space-y-2">
                <Label htmlFor="discount" className="text-sm font-medium">
                  Discount
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="discount"
                    type="number"
                    placeholder="Auto-calculated"
                    className="pl-10 bg-gray-50"
                    {...register("discount", {
                      min: { value: 0, message: "Discount must be positive" },
                      valueAsNumber: true,
                    })}
                    readOnly
                  />
                </div>
                {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
              </div>
            </div>

            {/* Payment Summary */}
            {totalModalityCharges > 0 && (
              <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span>Total Charges:</span>
                      <span className="font-semibold">₹{totalModalityCharges}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span className="text-red-600">-₹{Number(watch("discount")) || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount to Pay:</span>
                      <span className="font-semibold">₹{totalModalityCharges - (Number(watch("discount")) || 0)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-green-700">
                      <span>Amount Paid:</span>
                      <span>₹{calculateTotalAmount()}</span>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                      {watchedPaymentMethod === "mixed" && (
                        <>
                          <div className="flex justify-between">
                            <span>Cash Paid:</span>
                            <span>₹{Number(watchedCashAmount) || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Online Paid:</span>
                            <span>₹{Number(watchedOnlineAmount) || 0}</span>
                          </div>
                        </>
                      )}
                      {watchedPaymentMethod === "cash" && (
                        <div className="flex justify-between">
                          <span>Cash Paid:</span>
                          <span>₹{Number(watchedCashAmount) || 0}</span>
                        </div>
                      )}
                      {watchedPaymentMethod === "online" && (
                        <div className="flex justify-between">
                          <span>Online Paid:</span>
                          <span>₹{Number(watchedOnlineAmount) || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes Section */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-orange-600" />
            Additional Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Notes & Comments
            </Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <Textarea
                id="message"
                {...register("message")}
                placeholder="Enter any additional notes, special instructions, or comments (optional)"
                className="pl-10 min-h-[80px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
