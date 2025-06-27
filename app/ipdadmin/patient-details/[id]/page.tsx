'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {  ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

// Define interfaces
interface Service {
  serviceName: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt?: string;
}

interface Payment {
  amount: number;
  date: string;
}

interface BillingRecord {
  id: string;
  name: string;
  mobileNumber: string;
  amount: number;
  totalPaid: number;
  roomType?: string;
  bed?: string;
  services: Service[];
  payments: Payment[];
  dischargeDate?: string;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

// Utility function for invoice generation date (still available for display)
// const getInvoiceDate = () => format(new Date(), 'dd MMM yyyy');

const PatientPaymentDetails: React.FC = () => {
  const [record, setRecord] = useState<BillingRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalPayments, setTotalPayments] = useState<number>(0);

  // Get the full ID from the URL and split it robustly into patientId and ipdKey.
  const url = typeof window !== 'undefined' ? window.location.pathname : '';
  // Expected format: /ipdadmin/patient-details/{patientId}_{ipdKey}
  const fullId = url.split('/').pop() || '';
  const parts = fullId.split('_');
  const patientId = parts.shift();
  const ipdKey = parts.join('_');

  useEffect(() => {
    if (!patientId || !ipdKey) {
      console.error('Extracted values:', { patientId, ipdKey, url });
      toast.error('Invalid patient ID provided. Please check the URL format.', { position: 'top-right', autoClose: 5000 });
      setLoading(false);
      return;
    }
    // Read from "patients/{patientId}/ipd/{ipdKey}"
    const recordRef = ref(db, `patients/${patientId}/ipd/${ipdKey}`);
    const unsubscribe = onValue(recordRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const completedServicesAmount = data.services
          ? data.services
              .filter((s: Service) => s.status === 'completed')
              .reduce((sum: number, s: Service) => sum + Number(s.amount), 0)
          : 0;
        const payments: Payment[] = data.payments
          ? Object.keys(data.payments).map((payKey) => ({
              amount: Number(data.payments[payKey].amount),
              date: data.payments[payKey].date,
            }))
          : [];
        const billingRecord: BillingRecord = {
          id: `${patientId}_${ipdKey}`,
          name: data.name,
          mobileNumber: data.phone || '', // using data.phone for mobile number
          amount: Number(data.amount || 0),
          totalPaid: completedServicesAmount,
          roomType: data.roomType,
          bed: data.bed,
          services: data.services
            ? data.services.map((service: any) => ({
                ...service,
                amount: Number(service.amount),
              }))
            : [],
          payments: payments,
          dischargeDate: data.dischargeDate || undefined,
        };
        setRecord(billingRecord);
        setLoading(false);
      } else {
        toast.error('Patient record not found.', { position: 'top-right', autoClose: 5000 });
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdKey]);

  useEffect(() => {
    if (!record) return;
    const total = record.payments.reduce((sum, p) => sum + p.amount, 0);
    setTotalPayments(total);
  }, [record]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-700">Loading...</p>
      </div>
    );
  }
  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-red-500">Patient record not found.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">Patient Payment Details</h1>
          {/* Back Button */}
          <div className="mb-4">
            <Link href="/ipdadmin">
              <button className="flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300">
                <ArrowLeft size={20} className="mr-2" />
                Back to Payments Overview
              </button>
            </Link>
          </div>
          {/* Patient Details */}
          <div className="bg-indigo-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-indigo-800 mb-4">Patient Details for {record.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p><strong>Name:</strong> {record.name}</p>
                <p><strong>Mobile:</strong> {record.mobileNumber}</p>
              </div>
              <div>
                <p><strong>Total Amount:</strong> {currencyFormatter.format(record.amount)}</p>
                <p><strong>Total Paid:</strong> {currencyFormatter.format(totalPayments)}</p>
                <p>
                  <strong>Discharge Date:</strong>{' '}
                  {record.dischargeDate ? new Date(record.dischargeDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
          {/* Payment History */}
          <div>
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payment History</h2>
            {record.payments.length === 0 ? (
              <p className="text-gray-500 text-center">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-indigo-100">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Amount (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.payments.map((payment, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{format(new Date(payment.date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-2">{currencyFormatter.format(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Summary Section */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span>Total Services Amount:</span>
              <span className="font-semibold">{currencyFormatter.format(record.services.reduce((sum, s) => sum + s.amount, 0))}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Total Amount:</span>
              <span className="font-semibold">{currencyFormatter.format(record.amount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Total Payments:</span>
              <span className="font-semibold text-red-600">{currencyFormatter.format(totalPayments)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Outstanding Amount:</span>
              <span className="font-semibold text-red-600">
                {currencyFormatter.format(record.amount - totalPayments)}
              </span>
            </div>
          </div>
          {/* Notes Section */}
          <div className="text-sm text-gray-600">
            <p>This is a computer-generated invoice and does not require a signature.</p>
            <p>Thank you for choosing our hospital. We wish you a speedy recovery and continued good health.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientPaymentDetails;
