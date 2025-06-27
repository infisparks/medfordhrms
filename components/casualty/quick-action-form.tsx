"use client"

import React, { useState } from "react"
import { Plus, Percent, CreditCard, X, DollarSign, Tag, Save } from 'lucide-react'
import { motion, AnimatePresence } from "framer-motion"
import { useForm, Controller } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import CreatableSelect from "react-select/creatable"

// Form schemas
const additionalServiceSchema = yup
  .object({
    serviceName: yup.string().required("Service Name is required"),
    amount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
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

interface QuickActionsPanelProps {
  serviceOptions: { value: string; label: string; amount: number }[]
  totalBill: number
  currentDiscount: number
  hospitalServiceTotal: number
  consultantChargeTotal: number
  onAddService: (data: { serviceName: string; amount: number }) => Promise<void>
  onAddPayment: (data: { paymentAmount: number; paymentType: string }) => Promise<void>
  onApplyDiscount: (data: { discount: number }) => Promise<void>
  loading: boolean
}

export default function QuickActionsPanel({
  serviceOptions,
  totalBill,
  currentDiscount,
  hospitalServiceTotal,
  consultantChargeTotal,
  onAddService,
  onAddPayment,
  onApplyDiscount,
  loading,
}: QuickActionsPanelProps) {
  const [activeForm, setActiveForm] = useState<"service" | "payment" | "discount" | null>(null)

  // Service Form
  const {
    register: registerService,
    handleSubmit: handleSubmitService,
    formState: { errors: errorsService },
    reset: resetService,
    setValue: setValueService,
    control: serviceControl,
  } = useForm({
    resolver: yupResolver(additionalServiceSchema),
    defaultValues: { serviceName: "", amount: 0 },
  })

  // Payment Form
  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
  } = useForm({
    resolver: yupResolver(paymentSchema),
    defaultValues: { paymentAmount: 0, paymentType: "" },
  })

  // Discount Form
  const {
    register: registerDiscount,
    handleSubmit: handleSubmitDiscount,
    formState: { errors: errorsDiscount },
    watch: watchDiscount,
  } = useForm({
    resolver: yupResolver(discountSchema),
    defaultValues: { discount: currentDiscount || 0 },
  })

  const discountValue = watchDiscount("discount")

  const handleServiceSubmit = async (data: any) => {
    await onAddService(data)
    resetService({ serviceName: "", amount: 0 })
    setActiveForm(null)
  }

  const handlePaymentSubmit = async (data: any) => {
    await onAddPayment(data)
    resetPayment({ paymentAmount: 0, paymentType: "" })
    setActiveForm(null)
  }

  const handleDiscountSubmit = async (data: any) => {
    await onApplyDiscount(data)
    setActiveForm(null)
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
      
      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setActiveForm(activeForm === "service" ? null : "service")}
          className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors shadow-sm ${
            activeForm === "service" 
              ? "bg-red-600 text-white" 
              : "bg-red-50 text-red-600 hover:bg-red-100"
          }`}
        >
          <Plus size={18} className="mr-2" /> Add Service
        </button>
        
        <button
          onClick={() => setActiveForm(activeForm === "payment" ? null : "payment")}
          className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors shadow-sm ${
            activeForm === "payment" 
              ? "bg-red-600 text-white" 
              : "bg-red-50 text-red-600 hover:bg-red-100"
          }`}
        >
          <CreditCard size={18} className="mr-2" /> Add Payment
        </button>
        
        <button
          onClick={() => setActiveForm(activeForm === "discount" ? null : "discount")}
          className={`flex items-center justify-center px-4 py-3 rounded-lg transition-colors shadow-sm ${
            activeForm === "discount" 
              ? "bg-red-600 text-white" 
              : "bg-red-50 text-red-600 hover:bg-red-100"
          }`}
        >
          <Percent size={18} className="mr-2" /> {currentDiscount > 0 ? "Update Discount" : "Add Discount"}
        </button>
      </div>
      
      {/* Form Container */}
      <AnimatePresence mode="wait">
        {activeForm && (
          <motion.div
            key={activeForm}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium text-gray-800">
                  {activeForm === "service" && "Add Hospital Service"}
                  {activeForm === "payment" && "Record Payment"}
                  {activeForm === "discount" && (currentDiscount > 0 ? "Update Discount" : "Add Discount")}
                </h4>
                <button 
                  onClick={() => setActiveForm(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
              
              {/* Service Form */}
              {activeForm === "service" && (
                <form onSubmit={handleSubmitService(handleServiceSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                    <Controller
                      control={serviceControl}
                      name="serviceName"
                      render={({ field }) => {
                        const selectedOption = serviceOptions.find(
                          (option) => option.label.toLowerCase() === field.value.toLowerCase()
                        ) || {
                          label: field.value,
                          value: field.value,
                        }

                        return (
                          <CreatableSelect
                            {...field}
                            isClearable
                            options={serviceOptions}
                            placeholder="Select or type a service..."
                            onChange={(selected) => {
                              if (selected) {
                                field.onChange(selected.label)
                                const foundOption = serviceOptions.find(
                                  (opt) => opt.label === selected.label
                                )
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
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      {...registerService("amount")}
                      placeholder="Auto-filled on selection, or type your own"
                      className={`w-full px-3 py-2 rounded-lg border ${
                        errorsService.amount ? "border-red-500" : "border-gray-300"
                      } focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent`}
                    />
                    {errorsService.amount && (
                      <p className="text-red-500 text-xs mt-1">{errorsService.amount.message}</p>
                    )}
                  </div>
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center ${
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
              )}
              
              {/* Payment Form */}
              {activeForm === "payment" && (
                <form onSubmit={handleSubmitPayment(handlePaymentSubmit)} className="space-y-4">
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
                      } focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent`}
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
                      } focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent`}
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
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center ${
                      loading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {loading ? (
                      "Processing..."
                    ) : (
                      <>
                        <CreditCard size={16} className="mr-2" /> Add Payment
                      </>
                    )}
                  </button>
                </form>
              )}
              
              {/* Discount Form */}
              {activeForm === "discount" && (
                <form onSubmit={handleSubmitDiscount(handleDiscountSubmit)} className="space-y-4">
                  <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-600">Total Bill Amount</p>
                        <p className="text-xl font-bold text-gray-800">
                          ₹{(hospitalServiceTotal + consultantChargeTotal).toLocaleString()}
                        </p>
                      </div>
                      {currentDiscount > 0 && (
                        <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                          Current: ₹{currentDiscount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Discount Amount (₹)</label>
                    <div className="relative">
                      <DollarSign className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="number"
                        {...registerDiscount("discount")}
                        placeholder="Enter discount amount"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          errorsDiscount.discount ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                    </div>
                    {errorsDiscount.discount && (
                      <p className="text-red-500 text-xs mt-1">{errorsDiscount.discount.message}</p>
                    )}
                  </div>
                  
                  {/* Discount percentage display */}
                  {discountValue > 0 && hospitalServiceTotal + consultantChargeTotal > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 p-3 rounded-lg border border-red-100"
                    >
                      <p className="text-sm text-red-700 flex items-center">
                        <Tag className="h-4 w-4 mr-1" />
                        This is equivalent to a{" "}
                        <span className="font-bold mx-1">
                          {((discountValue / (hospitalServiceTotal + consultantChargeTotal)) * 100).toFixed(1)}%
                        </span>{" "}
                        discount
                      </p>
                    </motion.div>
                  )}
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center ${
                      loading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {loading ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Save className="h-5 w-5 mr-2" />
                        {currentDiscount > 0 ? "Update Discount" : "Apply Discount"}
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
