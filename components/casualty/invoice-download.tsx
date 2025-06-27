"use client"

import type React from "react"
import { useState } from "react"
import { format } from "date-fns"

// Define interfaces for props
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
  date: string
}

interface VitalSigns {
  bloodPressure?: string
  pulse?: string
  respiratoryRate?: string
  temperature?: string
  oxygenSaturation?: string
  gcs?: number
}

interface Casualty {
  id: string
  name?: string
  age?: number
  gender?: string
  phone?: string
  address?: string
  dob?: string
  date?: string
  time?: string
  modeOfArrival?: string
  broughtBy?: string
  broughtDead?: boolean
  caseType?: string
  otherCaseType?: string
  incidentDescription?: string
  isMLC?: boolean
  mlcNumber?: string
  policeInformed?: boolean
  referralHospital?: string
  attendingDoctor?: string
  triageCategory?: string
  status?: string
  vitalSigns?: VitalSigns
  services?: ServiceItem[]
  payments?: Payment[]
  amount?: number
  discount?: number
  createdAt?: string
}

interface Patient {
  uhid: string
  name: string
  age: number
  gender: string
  phone: string
  address?: string
  dob?: string
  casualty?: Record<string, Casualty>
  createdAt?: string
  updatedAt?: string
}

interface CasualtyInvoiceDownloadProps {
  casualty: Casualty
  patient: Patient
  children: React.ReactNode
}

const CasualtyInvoiceDownload: React.FC<CasualtyInvoiceDownloadProps> = ({ casualty, patient, children }) => {
  const [isPrinting, setIsPrinting] = useState(false)

  // Calculate totals
  const serviceItems = casualty.services?.filter((s) => s.type === "service") || []
  const consultantItems = casualty.services?.filter((s) => s.type === "doctorvisit") || []

  const hospitalServiceTotal = serviceItems.reduce((sum, s) => sum + (s.amount || 0), 0)
  const consultantChargeTotal = consultantItems.reduce((sum, s) => sum + (s.amount || 0), 0)
  const discountVal = casualty.discount || 0
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal
  const depositAmount = casualty.amount || 0
  const dueAmount = Math.max(totalBill - depositAmount, 0)

  const handlePrint = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 100)
  }

  return (
    <>
      {/* Print Button Wrapper */}
      <div onClick={handlePrint} className="cursor-pointer">
        {children}
      </div>

      {/* Hidden Printable Invoice */}
      <div
        className={`fixed top-0 left-0 w-full h-0 overflow-hidden ${
          isPrinting ? "h-auto print:block" : "hidden"
        } bg-white p-8 z-50`}
      >
        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-red-600">HOSPITAL NAME</h1>
            <p className="text-sm mt-1">123 Hospital Street, City, State - 123456</p>
            <p className="text-sm">Phone: +91 1234567890 | Email: info@hospital.com</p>
          </div>
          <div className="text-right">
            <p className="font-medium">Invoice #: CAS-{casualty.id?.substring(0, 8)}</p>
            <p className="text-sm mt-1">Date: {format(new Date(), "dd/MM/yyyy")}</p>
            <p className="text-sm mt-1">Time: {format(new Date(), "hh:mm a")}</p>
          </div>
        </div>

        {/* Invoice Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-red-600 border-b-2 border-red-200 pb-2 inline-block">CASUALTY BILL</h2>
        </div>

        {/* Patient Information */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Patient Information</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="font-medium py-1 pr-4 align-top">Patient Name:</td>
                  <td className="py-1">{patient.name}</td>
                </tr>
                <tr>
                  <td className="font-medium py-1 pr-4 align-top">UHID:</td>
                  <td className="py-1">{patient.uhid}</td>
                </tr>
                <tr>
                  <td className="font-medium py-1 pr-4 align-top">Age/Gender:</td>
                  <td className="py-1">
                    {patient.age} years / {patient.gender}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium py-1 pr-4 align-top">Contact:</td>
                  <td className="py-1">{patient.phone}</td>
                </tr>
                {patient.address && (
                  <tr>
                    <td className="font-medium py-1 pr-4 align-top">Address:</td>
                    <td className="py-1">{patient.address}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Casualty Details</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="font-medium py-1 pr-4 align-top">Date & Time:</td>
                  <td className="py-1">
                    {casualty.date ? format(new Date(casualty.date), "dd/MM/yyyy") : "N/A"} {casualty.time || ""}
                  </td>
                </tr>
                {casualty.caseType && (
                  <tr>
                    <td className="font-medium py-1 pr-4 align-top">Case Type:</td>
                    <td className="py-1">{casualty.caseType}</td>
                  </tr>
                )}
                {casualty.status && (
                  <tr>
                    <td className="font-medium py-1 pr-4 align-top">Status:</td>
                    <td className="py-1">{casualty.status}</td>
                  </tr>
                )}
                {casualty.modeOfArrival && (
                  <tr>
                    <td className="font-medium py-1 pr-4 align-top">Mode of Arrival:</td>
                    <td className="py-1">{casualty.modeOfArrival}</td>
                  </tr>
                )}
                {casualty.triageCategory && (
                  <tr>
                    <td className="font-medium py-1 pr-4 align-top">Triage Category:</td>
                    <td className="py-1">{casualty.triageCategory}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Services Table */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Hospital Services</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-4 py-2 text-left">Service Description</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Date</th>
                <th className="border border-gray-300 px-4 py-2 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {serviceItems.length > 0 ? (
                serviceItems.map((service, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">{service.serviceName}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      {service.createdAt ? format(new Date(service.createdAt), "dd/MM/yyyy") : "N/A"}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-right">₹{service.amount.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="border border-gray-300 px-4 py-2 text-center">
                    No services recorded
                  </td>
                </tr>
              )}
              <tr className="bg-gray-50 font-medium">
                <td colSpan={2} className="border border-gray-300 px-4 py-2 text-right">
                  Total Hospital Services:
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  ₹{hospitalServiceTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Consultant Charges Table */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Consultant Charges</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-4 py-2 text-left">Doctor</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Date</th>
                <th className="border border-gray-300 px-4 py-2 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {consultantItems.length > 0 ? (
                consultantItems.map((consultant, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">{consultant.serviceName}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      {consultant.createdAt ? format(new Date(consultant.createdAt), "dd/MM/yyyy") : "N/A"}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-right">
                      ₹{consultant.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="border border-gray-300 px-4 py-2 text-center">
                    No consultant charges recorded
                  </td>
                </tr>
              )}
              <tr className="bg-gray-50 font-medium">
                <td colSpan={2} className="border border-gray-300 px-4 py-2 text-right">
                  Total Consultant Charges:
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  ₹{consultantChargeTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bill Summary */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Bill Summary</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <tbody>
              <tr>
                <td className="border border-gray-300 px-4 py-2 font-medium">Hospital Services Total:</td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  ₹{hospitalServiceTotal.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2 font-medium">Consultant Charges Total:</td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  ₹{consultantChargeTotal.toLocaleString()}
                </td>
              </tr>
              {discountVal > 0 && (
                <tr>
                  <td className="border border-gray-300 px-4 py-2 font-medium text-green-600">Discount:</td>
                  <td className="border border-gray-300 px-4 py-2 text-right text-green-600">
                    -₹{discountVal.toLocaleString()}
                  </td>
                </tr>
              )}
              <tr className="bg-gray-100 font-bold">
                <td className="border border-gray-300 px-4 py-2">Total Bill Amount:</td>
                <td className="border border-gray-300 px-4 py-2 text-right">₹{totalBill.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2 font-medium">Amount Paid:</td>
                <td className="border border-gray-300 px-4 py-2 text-right">₹{depositAmount.toLocaleString()}</td>
              </tr>
              {dueAmount > 0 && (
                <tr className="bg-red-50 font-bold">
                  <td className="border border-gray-300 px-4 py-2 text-red-600">Balance Due:</td>
                  <td className="border border-gray-300 px-4 py-2 text-right text-red-600">
                    ₹{dueAmount.toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Payment Details */}
        {casualty.payments && casualty.payments.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Payment Details</h3>
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">Date</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Mode</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {casualty.payments.map((payment, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">
                      {format(new Date(payment.date), "dd/MM/yyyy hh:mm a")}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 capitalize">{payment.paymentType}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">₹{payment.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature Section */}
        <div className="flex justify-between mt-16 pt-8">
          <div className="w-48 border-t border-gray-400 pt-2 text-center">
            <p className="text-sm">Patient/Relative Signature</p>
          </div>
          <div className="w-48 border-t border-gray-400 pt-2 text-center">
            <p className="text-sm">Authorized Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>Thank you for choosing our hospital. We wish you a speedy recovery.</p>
          <p className="mt-1">This is a computer-generated invoice and does not require a signature.</p>
        </div>

        {/* Print-only styles */}
        <style jsx global>{`
          @media print {
            @page {
              size: A4;
              margin: 1cm;
            }
            body * {
              visibility: hidden;
            }
            .print-container,
            .print-container * {
              visibility: visible;
            }
            .print-container {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .no-print {
              display: none;
            }
          }
        `}</style>
      </div>
    </>
  )
}

export default CasualtyInvoiceDownload
