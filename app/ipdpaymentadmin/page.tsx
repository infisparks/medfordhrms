// app/ipdadmin/payments/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Search } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, subDays, isSameDay } from 'date-fns';
import Link from 'next/link';

// Define the interfaces
interface Service {
  serviceName: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt?: string;
}

interface Payment {
  amount: number;
  paymentType: string;
  date: string;
}

interface BillingRecord {
  id: string;
  name: string;
  mobileNumber: string;
  amount: number;
  totalPaid: number;
  paymentType: string;
  roomType?: string;
  bed?: string;
  services: Service[];
  payments: Payment[];
  dischargeDate?: string;
}

interface PaymentWithUser extends Payment {
  userId: string;
  name: string;
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Define the currency formatter
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const PaymentsOverview: React.FC = () => {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithUser[]>([]);
  const [totalCollected, setTotalCollected] = useState<number>(0);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [chartData, setChartData] = useState<any>(null);
  const [mostSellDay, setMostSellDay] = useState<string>('');

  useEffect(() => {
    const billingRef = ref(db, 'ipd_bookings');
    const unsubscribe = onValue(billingRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const records: BillingRecord[] = Object.keys(data).map((key) => {
          const rec = data[key];
          const completedServicesAmount = rec.services
            ? rec.services.filter((s: Service) => s.status === 'completed').reduce((sum: number, s: Service) => sum + Number(s.amount), 0)
            : 0;

          const payments: Payment[] = rec.payments
            ? Object.keys(rec.payments).map((payKey) => ({
                amount: Number(rec.payments[payKey].amount),
                paymentType: rec.payments[payKey].paymentType,
                date: rec.payments[payKey].date,
              }))
            : [];

          return {
            id: key,
            name: rec.name,
            mobileNumber: rec.mobileNumber || '',
            amount: Number(rec.amount || 0),
            totalPaid: completedServicesAmount,
            paymentType: rec.paymentType || 'deposit',
            roomType: rec.roomType,
            bed: rec.bed,
            services: rec.services
              ? rec.services.map((service: any) => ({
                  ...service,
                  amount: Number(service.amount),
                }))
              : [],
            payments: payments,
            dischargeDate: rec.dischargeDate || undefined,
          } as BillingRecord;
        });
        setAllRecords(records);
      } else {
        setAllRecords([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Aggregate all payments without adding deposit
    const aggregatedPayments: PaymentWithUser[] = [];
    allRecords.forEach((rec) => {
      // Include all actual payments
      rec.payments.forEach((payment) => {
        aggregatedPayments.push({
          userId: rec.id,
          name: rec.name,
          paymentType: payment.paymentType,
          amount: payment.amount,
          date: payment.date,
        });
      });
    });

    // Apply search and date filter
    let payments = aggregatedPayments;

    if (searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      payments = payments.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.userId.toLowerCase().includes(term)
      );
    }

    if (selectedDateFilter) {
      payments = payments.filter((p) => {
        const paymentDate = p.date ? new Date(p.date) : null;
        const filterDate = new Date(selectedDateFilter);
        return paymentDate && isSameDay(paymentDate, filterDate);
      });
    }

    setFilteredPayments(payments);

    // Calculate total collected
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    setTotalCollected(total);

    // Prepare data for the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
    const paymentAmounts = last7Days.map((day) => {
      return payments
        .filter((p) => p.date && isSameDay(new Date(p.date), day))
        .reduce((sum, p) => sum + p.amount, 0);
    });

    // Find the day with the highest sales
    const salesByDay = last7Days.map((day, index) => ({
      day: format(day, 'EEE dd MMM'),
      amount: paymentAmounts[index],
    }));

    const maxSale = Math.max(...paymentAmounts);
    const maxDay = salesByDay.find((s) => s.amount === maxSale)?.day || '';

    setMostSellDay(maxDay);

    // Prepare chart data
    setChartData({
      labels: salesByDay.map((s) => s.day),
      datasets: [
        {
          label: 'Payments (Rs)',
          data: salesByDay.map((s) => s.amount),
          backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue-500
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
      ],
    });
  }, [allRecords, searchTerm, selectedDateFilter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">Payments Overview</h1>

          {/* Search and Filter Section */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            {/* Search Bar */}
            <div className="flex items-center bg-gray-100 rounded-full p-2 w-full md:w-1/2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Name or Admission ID"
                className="flex-grow bg-transparent px-4 py-2 focus:outline-none"
              />
              <button
                onClick={() => {}}
                className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition duration-300"
              >
                <Search size={24} />
              </button>
            </div>

            {/* Filter Date */}
            <div className="flex items-center space-x-4">
              <input
                type="date"
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="px-4 py-2 rounded bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Filter by Payment Date"
              />
              {selectedDateFilter && (
                <button
                  onClick={() => setSelectedDateFilter('')}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition duration-300"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          {/* Total Collected Display */}
          <div className="mb-6 flex justify-end">
            <div className="bg-green-100 rounded-lg p-4">
              <p className="text-green-800 font-semibold">Total Collected: {currencyFormatter.format(totalCollected)}</p>
            </div>
          </div>

          {/* Payment Graphs */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payments in Last 7 Days</h2>
            {chartData ? (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: false,
                      text: 'Payments in Last 7 Days',
                    },
                  },
                }}
              />
            ) : (
              <p className="text-gray-500 text-center">Loading chart...</p>
            )}
            {mostSellDay && (
              <p className="mt-4 text-center text-lg font-semibold">
                Most Sell Day: <span className="text-blue-600">{mostSellDay}</span>
              </p>
            )}
          </div>

          {/* Payment History Table */}
          <div>
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payment History</h2>
            {filteredPayments.length === 0 ? (
              <p className="text-gray-500 text-center">No payment records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-indigo-100">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Patient Name</th>
                      <th className="px-4 py-2 text-left">Payment Type</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Amount (Rs)</th>
                      <th className="px-4 py-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment, index) => (
                      <tr key={index} className="border-t hover:bg-indigo-50">
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{payment.name}</td>
                        <td className="px-4 py-2 capitalize">{payment.paymentType}</td>
                        <td className="px-4 py-2">
                          {payment.date ? new Date(payment.date).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-2">{currencyFormatter.format(payment.amount)}</td>
                        <td className="px-4 py-2">
                          <Link href={`/ipdadmin/patient-details/${payment.userId}`}>
                            <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300">
                              View Details
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentsOverview;
