"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Head from "next/head"
import { ref, query, orderByChild, limitToLast, onValue } from "firebase/database"
import { db } from "../../lib/firebase"
import { format, parseISO, subDays, isAfter } from "date-fns"
import { Bar } from "react-chartjs-2"
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js"
import { AiOutlineCalendar, AiOutlineSearch } from "react-icons/ai"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface IMortalityReport {
  id: string
  patientId: string
  patientName: string
  admissionDate: string
  dateOfDeath: string
  medicalFindings: string
  timeSpanDays: number
  createdAt: string
  enteredBy: string
}

interface IPatientInfo {
  uhid: string
  name: string
  age: number
  phone: string
  address: string
  gender: string
}

const MortalityDashboardPage: React.FC = () => {
  const [reports, setReports] = useState<IMortalityReport[]>([])
  const [patientInfo, setPatientInfo] = useState<{ [key: string]: IPatientInfo }>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [filterDate, setFilterDate] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [showAllData, setShowAllData] = useState<boolean>(false)

  // Calculate 7 days ago for default filtering
  const sevenDaysAgo = subDays(new Date(), 7)

  // Fetch patient info (cached for performance)
  useEffect(() => {
    const patientsRef = ref(db, "patients/patientinfo")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setPatientInfo(data)
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch mortality reports with optimized query
  useEffect(() => {
    const mortalityRef = ref(db, "patients/mortalitydetail")
    let mortalityQuery

    if (showAllData) {
      // Load all data when explicitly requested
      mortalityQuery = query(mortalityRef, orderByChild("createdAt"))
    } else {
      // Load only recent data by default (last 50 records)
      mortalityQuery = query(mortalityRef, orderByChild("createdAt"), limitToLast(50))
    }

    const unsubscribe = onValue(
      mortalityQuery,
      (snapshot) => {
        const data = snapshot.val()
        const fetchedReports: IMortalityReport[] = []

        if (data) {
          Object.entries(data).forEach(([patientId, mortalityRecords]: [string, any]) => {
            if (mortalityRecords) {
              Object.entries(mortalityRecords).forEach(([mortalityId, mortalityData]: [string, any]) => {
                // Filter by last 7 days if not showing all data
                const reportDate = parseISO(mortalityData.dateOfDeath)
                if (showAllData || isAfter(reportDate, sevenDaysAgo)) {
                  fetchedReports.push({
                    id: `${patientId}_${mortalityId}`,
                    patientId,
                    patientName: mortalityData.patientName,
                    admissionDate: mortalityData.admissionDate,
                    dateOfDeath: mortalityData.dateOfDeath,
                    medicalFindings: mortalityData.medicalFindings,
                    timeSpanDays: mortalityData.timeSpanDays,
                    createdAt: mortalityData.createdAt,
                    enteredBy: mortalityData.enteredBy,
                  })
                }
              })
            }
          })
        }

        // Sort by date of death (most recent first)
        fetchedReports.sort((a, b) => new Date(b.dateOfDeath).getTime() - new Date(a.dateOfDeath).getTime())

        setReports(fetchedReports)
        setLoading(false)
      },
      (error) => {
        console.error("Error fetching mortality reports:", error)
        toast.error("Failed to fetch mortality reports.", {
          position: "top-right",
          autoClose: 5000,
        })
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [showAllData, sevenDaysAgo])

  // Calculate statistics
  const totalDeathsToday = reports.filter(
    (report) => format(parseISO(report.dateOfDeath), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
  ).length

  const totalDeathsLast7Days = reports.filter((report) => isAfter(parseISO(report.dateOfDeath), sevenDaysAgo)).length

  // Prepare chart data for last 7 days
  const chartData = {
    labels: Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i)
      return format(date, "MMM dd")
    }),
    datasets: [
      {
        label: "Deaths per Day",
        data: Array.from({ length: 7 }, (_, i) => {
          const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd")
          return reports.filter((report) => format(parseISO(report.dateOfDeath), "yyyy-MM-dd") === date).length
        }),
        backgroundColor: "rgba(220, 38, 38, 0.7)",
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Deaths in Last 7 Days" },
    },
  }

  // Filter reports based on search and date
  const filteredReports = reports.filter((report) => {
    const matchesDate = filterDate ? report.dateOfDeath === filterDate : true
    const matchesSearch = searchQuery
      ? report.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.patientId.toLowerCase().includes(searchQuery.toLowerCase())
      : true
    return matchesDate && matchesSearch
  })

  return (
    <>
      <Head>
        <title>Admin - Mortality Dashboard</title>
        <meta name="description" content="View and analyze mortality reports" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">Mortality Dashboard</h1>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Deaths Today</h2>
              <p className="text-3xl font-bold text-red-600">{totalDeathsToday}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Deaths Last 7 Days</h2>
              <p className="text-3xl font-bold text-orange-600">{totalDeathsLast7Days}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Total Records Loaded</h2>
              <p className="text-3xl font-bold text-blue-600">{reports.length}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <Bar data={chartData} options={chartOptions} />
          </div>

          {/* Data Load Toggle */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-700">Data View</h3>
                <p className="text-sm text-gray-500">
                  {showAllData
                    ? "Showing all mortality records (may increase data usage)"
                    : "Showing last 7 days only (optimized for cost)"}
                </p>
              </div>
              <button
                onClick={() => setShowAllData(!showAllData)}
                className={`px-4 py-2 rounded-lg transition duration-200 ${
                  showAllData ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {showAllData ? "Show Last 7 Days Only" : "Load All Data"}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 space-y-4 md:space-y-0">
            {/* Date Filter */}
            <div className="flex items-center space-x-2">
              <AiOutlineCalendar className="text-gray-500" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {filterDate && (
                <button onClick={() => setFilterDate("")} className="text-red-500 hover:underline">
                  Clear
                </button>
              )}
            </div>

            {/* Search */}
            <div className="flex items-center space-x-2">
              <AiOutlineSearch className="text-gray-500" />
              <input
                type="text"
                placeholder="Search by patient name or ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-red-500 hover:underline">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Reports Table */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">
              Mortality Reports
              {filterDate && ` for ${format(parseISO(filterDate), "PPP")}`}
              {!showAllData && !filterDate && " (Last 7 Days)"}
            </h2>
            {loading ? (
              <p className="text-center text-gray-500">Loading reports...</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-center text-gray-500">No reports found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Age
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Admission Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date of Death
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days in Hospital
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Medical Findings
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredReports.map((report) => {
                      const patient = patientInfo[report.patientId]
                      return (
                        <tr key={report.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {report.patientId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.patientName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{patient?.age || "N/A"}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(parseISO(report.admissionDate), "MMM dd, yyyy")}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(parseISO(report.dateOfDeath), "MMM dd, yyyy")}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.timeSpanDays}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {report.medicalFindings}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

export default MortalityDashboardPage
