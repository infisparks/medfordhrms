"use client"
import React, { useEffect, useState, useRef, useMemo } from "react"
import { db } from "@/lib/firebase" // Assuming this path is correct for your Firebase setup
import { ref, onValue } from "firebase/database" // Only ref and onValue are used
import { ToastContainer, toast } from "react-toastify"
// import "react-toastify/dist/React-Toastify.css" // Keep this commented or uncomment if you need the default CSS
import { format, isSameDay, parseISO, subDays } from "date-fns"
import { motion } from "framer-motion"
import {
  FaBed,
  FaHospital,
  FaDownload,
  FaChartLine,
  FaProcedures,
} from "react-icons/fa"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"

// =================== Interfaces ===================

interface Doctor {
  id: string
  name: string
  department: string
  specialist: string
  opdCharge: number
  ipdCharges: Record<string, number>
}

interface Bed {
  bedNumber: string
  status: string
  type: string
}

interface OPDAppointment {
  amount: number
  createdAt: string
  date: string
  doctor: string
  gender: string
  message?: string
  name: string
  paymentMethod?: string
  phone: string
  serviceName?: string
  time: string
  referredBy?: string
  appointmentType: string // This will be 'visithospital' (or other non-casualty type) or 'casualty'
}

interface IPDAdmission {
  admissionDate: string
  admissionSource: string
  admissionTime: string
  admissionType: string
  bed: string
  createdAt: string
  dischargeDate?: string
  doctor: string
  name: string
  phone: string
  referDoctor?: string
  relativeAddress: string
  relativeName: string
  relativePhone: string
  roomType: string
  status: string
  uhid: string
  id?: string
}

interface MortalityReport {
  admissionDate: string
  dateOfDeath: string
  medicalFindings: string
  timeSpanDays: number
  createdAt: string
  enteredBy: string
  patientId: string
  patientName: string
}

interface PatientInfo {
  name: string
  gender: string
  age: string
  phone: string
  address?: string
  uhid: string
}

interface OTData {
  date: string
  time: string
  message: string
  createdAt: string
  updatedAt: string
  patientId: string;
  ipdId: string;
  patientName?: string;
  patientGender?: string;
}

// =================== Main Component ===================

export default function DailyPerformanceReport() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [beds, setBeds] = useState<Record<string, Record<string, Bed>>>({})
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [mortalityReports, setMortalityReports] = useState<MortalityReport[]>([])
  const [otRecords, setOtRecords] = useState<OTData[]>([])
  const [patientInfo, setPatientInfo] = useState<Record<string, PatientInfo>>({})

  const [loading, setLoading] = useState(true)

  const [metrics, setMetrics] = useState({
    totalOPD: 0,
    totalCasualty: 0,
    totalMortality: 0,
    totalOT: 0,
    totalBeds: 0,
    bedsOccupied: 0,
    bedsAvailable: 0,
  })

  const reportRef = useRef<HTMLDivElement>(null)

  // =================== Fetch Doctors ===================
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      const doctorsList: Doctor[] = []
      if (data) {
        Object.entries(data).forEach(([id, doctorData]: [string, any]) => {
          doctorsList.push({ id, name: doctorData.name || "", department: doctorData.department || "", specialist: doctorData.specialist || "", opdCharge: Number(doctorData.opdCharge) || 0, ipdCharges: doctorData.ipdCharges || {} })
        })
      }
      setDoctors(doctorsList)
    })
    return () => unsubscribe()
  }, [])

  // =================== Fetch Beds ===================
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      setBeds(data || {})
    })
    return () => unsubscribe()
  }, [])

  // =================== Fetch Patient Info ===================
  useEffect(() => {
    const patientInfoRef = ref(db, "patients/patientinfo")
    const unsubscribe = onValue(patientInfoRef, (snapshot) => {
      const data = snapshot.val()
      setPatientInfo(data || {})
    })
    return () => unsubscribe()
  }, [])

  // =================== Fetch OPD Appointments (Updated to handle modalities type for casualty) ===================
  useEffect(() => {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    const fetchedAppointments: OPDAppointment[] = [];

    const opdByDateRef = ref(db, `patients/opddetail/${todayStr}`);

    const unsubscribe = onValue(opdByDateRef, (snapshot) => {
      const data = snapshot.val();
      fetchedAppointments.length = 0; // Clear list before populating

      if (data) {
        Object.entries(data).forEach(([patientId, appointments]: [string, any]) => {
          Object.entries(appointments).forEach(([appointmentId, appt]: [string, any]) => {
            const apptCreatedAt = appt.createdAt ? parseISO(appt.createdAt) : null;

            if (apptCreatedAt && isSameDay(apptCreatedAt, today)) {
                // Determine if it's a casualty appointment based on appointmentType OR modalities type
                const isCasualtyFromModalities = appt.modalities?.some((mod: any) => mod.type?.toLowerCase() === 'casualty');
                const isCasualtyFromAppointmentType = appt.appointmentType?.toLowerCase() === 'casualty';

                const appointmentType = (isCasualtyFromAppointmentType || isCasualtyFromModalities) ? 'casualty' : (appt.appointmentType || "visithospital");

                fetchedAppointments.push({
                    amount: Number(appt.payment?.totalPaid) || 0,
                    appointmentType: appointmentType, // Set the determined type
                    createdAt: appt.createdAt || "",
                    date: appt.date || "",
                    doctor: appt.doctor || "",
                    gender: patientInfo[patientId]?.gender || "N/A",
                    message: appt.message || "",
                    name: appt.name || patientInfo[patientId]?.name || "N/A",
                    paymentMethod: appt.payment?.paymentMethod || "cash",
                    phone: appt.phone || patientInfo[patientId]?.phone || "N/A",
                    serviceName: appt.modalities?.[0]?.service || appt.modalities?.[0]?.type || "",
                    time: appt.time || "",
                    referredBy: appt.referredBy || appt.referBy || "",
                });
            }
          });
        });
      }
      setOpdAppointments(fetchedAppointments);
    }, (error) => {
      console.error("Error fetching OPD records:", error);
      toast.error("Failed to load OPD records.", { position: "top-right" });
    });
    return () => unsubscribe();
  }, [patientInfo]);


  // =================== Fetch Mortality Reports ===================
  useEffect(() => {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    const mortalityList: MortalityReport[] = [];
    const mortalityByDateRef = ref(db, `patients/mortalitydetail/${todayStr}`);

    const unsubscribe = onValue(mortalityByDateRef, (snapshot) => {
      const data = snapshot.val();
      mortalityList.length = 0;
      if (data) {
        Object.entries(data).forEach(([patientId, reports]: [string, any]) => {
          Object.entries(reports).forEach(([mortalityId, report]: [string, any]) => {
            const reportCreatedAt = report.createdAt ? parseISO(report.createdAt) : null;

            if (reportCreatedAt && isSameDay(reportCreatedAt, today)) {
                mortalityList.push({
                    admissionDate: report.admissionDate || "", dateOfDeath: report.dateOfDeath || "", medicalFindings: report.medicalFindings || "",
                    timeSpanDays: report.timeSpanDays || 0, createdAt: report.createdAt || "", enteredBy: report.enteredBy || "",
                    patientId, patientName: patientInfo[patientId]?.name || "N/A",
                });
            }
          });
        });
      }
      setMortalityReports(mortalityList);
    }, (error) => { console.error("Error fetching mortality reports:", error); toast.error("Failed to load mortality reports.", { position: "top-right" }); });
    return () => unsubscribe();
  }, [patientInfo]);

  // =================== Fetch ALL relevant OT Records and Filter by createdAt ===================
  useEffect(() => {
    const today = new Date(); // Local system date
    const todayStr = format(today, "yyyy-MM-dd");
    const yesterday = subDays(today, 1);
    const yesterdayStr = format(yesterday, "yyyy-MM-dd");

    const fetchedOtList: OTData[] = [];
    const dateKeysToFetch = [todayStr];
    if (yesterdayStr !== todayStr) {
        dateKeysToFetch.push(yesterdayStr);
    }

    const activeUnsubscribes: (() => void)[] = [];
    let completedFetches = 0;

    dateKeysToFetch.forEach(dateKey => {
      const otByDateRef = ref(db, `patients/ot/${dateKey}`);
      const unsubscribe = onValue(otByDateRef, (snapshot) => {
          const data = snapshot.val();
          completedFetches++;

          if (data) {
              Object.entries(data).forEach(([patientId, ipdEntries]: [string, any]) => {
                  Object.entries(ipdEntries).forEach(([ipdId, otRecord]: [string, any]) => {
                      const recordCreatedAt = otRecord.createdAt ? parseISO(otRecord.createdAt) : null;

                      if (recordCreatedAt && isSameDay(recordCreatedAt, today)) {
                          fetchedOtList.push({
                              date: otRecord.date || '',
                              time: otRecord.time || '',
                              message: otRecord.message || '',
                              createdAt: otRecord.createdAt || new Date().toISOString(),
                              updatedAt: otRecord.updatedAt || new Date().toISOString(),
                              patientId,
                              ipdId,
                          });
                      }
                  });
              });
          }

          if (completedFetches === dateKeysToFetch.length) {
              const uniqueRecords = Array.from(new Map(fetchedOtList.map(item => [`${item.patientId}-${item.ipdId}-${item.createdAt}`, item])).values());
              setOtRecords(uniqueRecords);
          }
      }, (error) => {
          console.error(`Error fetching OT records for date key ${dateKey}:`, error);
          toast.error(`Failed to load OT records for ${dateKey}.`, { position: "top-right" });
          completedFetches++;
          if (completedFetches === dateKeysToFetch.length) {
              const uniqueRecords = Array.from(new Map(fetchedOtList.map(item => [`${item.patientId}-${item.ipdId}-${item.createdAt}`, item])).values());
              setOtRecords(uniqueRecords);
          }
      });
      activeUnsubscribes.push(unsubscribe);
    });

    return () => activeUnsubscribes.forEach(unsub => unsub());
  }, []);


  // =================== Calculate Today's Metrics ===================
  useEffect(() => {
    // These filters now work with the unified opdAppointments state
    const totalOPD = opdAppointments.filter(appt => appt.appointmentType !== 'casualty').length;
    const totalCasualty = opdAppointments.filter(appt => appt.appointmentType === 'casualty').length;
    const totalMortality = mortalityReports.length;
    const totalOT = otRecords.length;

    let totalBeds = 0;
    let bedsOccupied = 0;
    let bedsAvailable = 0;

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        totalBeds++;
        if (beds[ward][bedKey].status?.toLowerCase() === "occupied") {
          bedsOccupied++;
        } else {
          bedsAvailable++;
        }
      });
    });

    setMetrics({ totalOPD, totalCasualty, totalMortality, totalOT, totalBeds, bedsOccupied, bedsAvailable });
    setLoading(false);
  }, [opdAppointments, mortalityReports, otRecords, beds]);


  // =================== Derived Data (Memoized for display) ===================
  const bedDetails = useMemo(() => {
    const details: Array<{ ward: string; bedNumber: string; bedKey: string; status: string; type: string; }> = [];
    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        details.push({ ward, bedNumber: beds[ward][bedKey].bedNumber || "", bedKey, status: beds[ward][bedKey].status || "Available", type: beds[ward][bedKey].type || "standard", });
      });
    });
    return details;
  }, [beds]);

  const todayMortalityReports = useMemo(() => {
    return mortalityReports.map(report => ({
      ...report,
      patientName: patientInfo[report.patientId]?.name || report.patientName || "N/A",
    }));
  }, [mortalityReports, patientInfo]);

  const todayOtRecords = useMemo(() => {
    return otRecords.map(record => ({
      ...record,
      patientName: patientInfo[record.patientId]?.name || "N/A",
      patientGender: patientInfo[record.patientId]?.gender || "N/A"
    }));
  }, [otRecords, patientInfo]);


  // =================== Download DPR (Multi-page) ===================
  const handleDownloadReport = async () => {
    if (!reportRef.current) { toast.error("Report content not found.", { position: "top-right", autoClose: 5000 }); return; }
    try {
      // Small delay to ensure all content is rendered before taking snapshots
      await new Promise((resolve) => setTimeout(resolve, 100));
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const pages = reportRef.current.children; // Get each 'page' div

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 4, // Higher scale for better resolution
          useCORS: true,
          logging: false,
          allowTaint: true,
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // Calculate aspect ratio to fit image within PDF page
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const imgX = (pdfWidth - imgWidth * ratio) / 2;
        const imgY = (pdfHeight - imgHeight * ratio) / 2;

        pdf.addImage(imgData, "JPEG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      }
      pdf.save(`DPR_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
      toast.success("DPR downloaded successfully!", { position: "top-right", autoClose: 3000 });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.", { position: "top-right", autoClose: 5000 });
    }
  };

  const getDoctorName = (doctorId: string) => { const doctor = doctors.find((d) => d.id === doctorId); return doctor ? doctor.name : "Unknown Doctor"; };

  // =================== Render ===================
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-600 p-8 text-white">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Daily Performance Report</h1>
              <p className="text-teal-100">{format(new Date(), "EEEE, MMMM d,PPPP")}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownloadReport}
                className="flex items-center bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition duration-300 shadow-md"
              >
                <FaDownload className="mr-2" />
                Download Report
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center p-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
          </div>
        ) : (
          <div className="p-8">
            {/* Summary Cards */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <FaChartLine className="mr-2 text-teal-500" />
                Todays Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* OPD */}
                <motion.div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-md p-6 border-l-4 border-green-500" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} >
                  <div className="flex items-center justify-between">
                    <div> <p className="text-xs text-gray-500 uppercase tracking-wider">OPD Visits</p> <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalOPD}</p> </div>
                    <div className="bg-green-200 p-3 rounded-full"> <FaHospital className="text-green-600 text-xl" /> </div>
                  </div>
                </motion.div>

                {/* Casualty */}
                <motion.div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-md p-6 border-l-4 border-orange-500" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} >
                  <div className="flex items-center justify-between">
                    <div> <p className="text-xs text-gray-500 uppercase tracking-wider">Casualty</p> <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalCasualty}</p> </div>
                    <div className="bg-orange-200 p-3 rounded-full"> <FaHospital className="text-orange-600 text-xl" /> </div>
                  </div>
                </motion.div>

                {/* Mortality */}
                <motion.div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-md p-6 border-l-4 border-red-500" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} >
                  <div className="flex items-center justify-between">
                    <div> <p className="text-xs text-gray-500 uppercase tracking-wider">Mortality</p> <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalMortality}</p> </div>
                    <div className="bg-red-200 p-3 rounded-full"> <FaHospital className="text-red-600 text-xl" /> </div>
                  </div>
                </motion.div>

                {/* Total OT Today */}
                <motion.div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-md p-6 border-l-4 border-purple-500" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} >
                  <div className="flex items-center justify-between">
                    <div> <p className="text-xs text-gray-500 uppercase tracking-wider">Total OT Today (Created)</p> <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalOT}</p> </div>
                    <div className="bg-purple-200 p-3 rounded-full"> <FaProcedures className="text-purple-600 text-xl" /> </div>
                  </div>
                </motion.div>

                {/* Bed Occupancy */}
                <motion.div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl shadow-md p-6 border-l-4 border-teal-500" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} >
                  <div className="flex items-center justify-between">
                    <div> <p className="text-xs text-gray-500 uppercase tracking-wider">Bed Occupancy</p> <div className="flex items-end mt-1"> <p className="text-3xl font-bold text-gray-800">{metrics.bedsOccupied}</p> <p className="text-sm text-gray-500 ml-1 mb-1">/ {metrics.totalBeds}</p> </div> </div>
                    <div className="bg-teal-200 p-3 rounded-full"> <FaBed className="text-teal-600 text-xl" /> </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Detailed Bed Status */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaBed className="mr-2 text-teal-500" /> Bed Status
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-teal-100 to-blue-100 text-gray-700">
                      <th className="px-3 py-2 text-left font-semibold rounded-tl-lg" style={{ width: '25%' }}>Ward</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ width: '25%' }}>Bed Number</th>
                      <th className="px-3 py-2 text-left font-semibold" style={{ width: '25%' }}>Type</th>
                      <th className="px-3 py-2 text-left font-semibold rounded-tr-lg" style={{ width: '25%' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bedDetails.map((bed, index) => (
                      <tr key={index} className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`} >
                        <td className="px-3 py-2 capitalize">{bed.ward.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{bed.bedNumber || bed.bedKey}</td>
                        <td className="px-3 py-2 capitalize">{bed.type || "Standard"}</td>
                        <td className={`px-3 py-2 capitalize font-medium ${bed.status.toLowerCase() === "occupied" ? "text-red-600" : "text-green-600"}`} > {bed.status} </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Todays OT Records (Filtered by createdAt) */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaProcedures className="mr-2 text-purple-500" /> Todays Operation Theater Records (Created)
              </h2>
              {todayOtRecords.length === 0 ? (
                <div className="bg-purple-50 p-6 rounded-lg text-center"> <p className="text-gray-600">No OT records created today.</p> </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-purple-100 to-indigo-100 text-gray-700">
                        <th className="px-3 py-2 text-left font-semibold rounded-tl-lg" style={{ width: '25%' }}>Patient Name</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ width: '15%' }}>Surgery Date</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ width: '15%' }}>Created At Time</th>
                        <th className="px-3 py-2 text-left font-semibold rounded-tr-lg" style={{ width: 'auto' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayOtRecords.map((record, index) => (
                        <tr key={index} className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`} >
                          <td className="px-3 py-2 font-medium">{record.patientName}</td>
                          <td className="px-3 py-2">{format(parseISO(record.date), "MMM dd,PPPP")}</td>
                          <td className="px-3 py-2">{format(parseISO(record.createdAt), "hh:mm a")}</td>
                          <td className="px-3 py-2 truncate max-w-xs">{record.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Mortality Reports Today */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaHospital className="mr-2 text-red-500" /> Todays Mortality Reports
              </h2>
              {todayMortalityReports.length === 0 ? (
                <div className="bg-red-50 p-6 rounded-lg text-center"> <p className="text-gray-600">No mortality reports for today.</p> </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-red-100 to-pink-100 text-gray-700">
                        <th className="px-3 py-2 text-left font-semibold rounded-tl-lg" style={{ width: '25%' }}>Patient Name</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ width: '25%' }}>Admission Date</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ width: '25%' }}>Date of Death</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ width: '15%' }}>Days in Hospital</th>
                        <th className="px-3 py-2 text-left font-semibold rounded-tr-lg" style={{ width: 'auto' }}>Medical Findings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayMortalityReports.map((report, index) => (
                        <tr key={index} className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`} >
                          <td className="px-3 py-2 font-medium">{report.patientName}</td>
                          <td className="px-3 py-2">{format(parseISO(report.admissionDate), "MMM dd,PPPP")}</td>
                          <td className="px-3 py-2">{format(parseISO(report.dateOfDeath), "MMM dd,PPPP")}</td>
                          <td className="px-3 py-2">{report.timeSpanDays}</td>
                          <td className="px-3 py-2 truncate max-w-xs">{report.medicalFindings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Offscreen Multi-Page Container for PDF generation */}
        <div ref={reportRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <DPRMultiPage
            metrics={metrics}
            bedDetails={bedDetails}
            mortalityReports={todayMortalityReports}
            otRecords={todayOtRecords}
            doctors={doctors}
          />
        </div>
      </div>
    </div>
  );
}

// =================== Multi-page DPR Content for PDF ===================

interface DPRMultiPageProps {
  metrics: {
    totalOPD: number; totalCasualty: number; totalMortality: number; totalOT: number;
    totalBeds: number; bedsOccupied: number; bedsAvailable: number;
  };
  bedDetails: Array<{ ward: string; bedNumber: string; bedKey: string; status: string; type: string; }>;
  mortalityReports: MortalityReport[];
  otRecords: OTData[];
  doctors: Doctor[];
}

function DPRMultiPage({ metrics, bedDetails, mortalityReports, otRecords, doctors }: DPRMultiPageProps) {
  const [pages, setPages] = useState<React.ReactNode[]>([]);

  // IMPORTANT: Replace this with the actual, publicly accessible URL of your hospital's letterhead image.
  // Example: "https://yourhospital.com/images/letterhead.png"
  // For demonstration, using a placeholder image from placehold.co
  const letterheadImageUrl = "https://placehold.co/595x842/E0F7FA/004D40?text=Your+Hospital+Letterhead";


  const pairedMetrics = useMemo(() => {
    const metricsArray = [
      { label: "Total OPD Today", value: metrics.totalOPD }, { label: "Total Casualty Today", value: metrics.totalCasualty },
      { label: "Mortality Today", value: metrics.totalMortality }, { label: "Total OT Today (Created)", value: metrics.totalOT },
      { label: "Total Beds", value: metrics.totalBeds }, { label: "Beds Occupied", value: metrics.bedsOccupied },
      { label: "Beds Available", value: metrics.bedsAvailable },
    ];
    // Ensure all metrics are present for layout consistency even if value is 0
    // This part ensures a consistent 2-column layout for metrics in PDF
    const pairs = [];
    for (let i = 0; i < metricsArray.length; i += 2) {
      pairs.push(metricsArray.slice(i, i + 2));
    }
    return pairs;
  }, [metrics]);

  useEffect(() => {
    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height in points
    const topOffset = 70; // Space for letterhead/header
    const bottomOffset = 70; // Space for footer
    const maxContentHeight = pageHeight - (topOffset + bottomOffset);
    const contentPages: React.ReactNode[] = [];
    let currentPageContent: React.ReactNode[] = [];
    let currentHeightInPoints = 0;

    const addContentBlock = (element: React.ReactNode, estimatedBlockHeight: number) => {
      // Check if adding this block would exceed the current page's content height
      if (currentHeightInPoints + estimatedBlockHeight > maxContentHeight) {
        // If it does, finalize the current page and start a new one
        contentPages.push(
          <div key={`pdf-page-${contentPages.length}`} style={{ width: `${pageWidth}pt`, height: `${pageHeight}pt`, overflow: "hidden", backgroundColor: "white" }}>
            <DPRPageLayout key={`layout-${contentPages.length}`} topOffset={topOffset} bottomOffset={bottomOffset} letterheadUrl={letterheadImageUrl}>{currentPageContent}</DPRPageLayout>
          </div>,
        );
        currentPageContent = []; // Reset content for the new page
        currentHeightInPoints = 0; // Reset height for the new page
      }
      currentPageContent.push(element);
      currentHeightInPoints += estimatedBlockHeight;
    };

    // Header (always appears on the first page, subsequent pages will just have the layout)
    addContentBlock(
      <div key="pdf-header" style={{ marginBottom: "12px" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "700", margin: "0", color: "#0f766e" }}>Daily Performance Report</h1>
          <p style={{ fontSize: "10px", color: "#555", margin: "4px 0 0 0" }}>Date: {format(new Date(), "dd MMM,PPPP")}</p>
        </div>
      </div>,
      40, // Estimated height for header
    );

    // Metrics Table
    const metricsContent = (
      <div key="pdf-metrics" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#0f766e" }}>Todays Metrics</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
          <tbody>
            {pairedMetrics.map((pair, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                {pair.map((item, index) => (
                  <React.Fragment key={index}>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px", fontWeight: "500", verticalAlign: "middle", width: '25%' }}>{item.label}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "center", verticalAlign: "middle", fontWeight: "600", width: '25%' }}>{item.value}</td>
                  </React.Fragment>
                ))}
                {/* If there's an odd number of metrics, fill the last row with empty cells for layout */}
                {pair.length === 1 && (<><td style={{ border: "1px solid #e5e7eb", padding: "6px", verticalAlign: "middle", width: '25%' }}></td><td style={{ border: "1px solid #e5e7eb", padding: "6px", verticalAlign: "middle", width: '25%' }}></td></>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    addContentBlock(metricsContent, (pairedMetrics.length * 20) + 40); // Estimate height: rows * row_height + title_height

    // Bed Status
    const bedTableTitleHeight = 25;
    const bedTableHeaderHeight = 30;
    const bedTableRowHeight = 16;
    const generateBedTableBlock = (rows: React.ReactNode[], isContinuation: boolean = false) => (
      <div key={`pdf-beds-${contentPages.length}-${isContinuation}`} style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#0f766e" }}>{isContinuation ? "Detailed Bed Status (Cont.)" : "Detailed Bed Status"}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
          <thead>
            <tr style={{ backgroundColor: "#e6f7f5" }}>
              <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#0f766e", width: '25%' }}>Ward</th>
              <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#0f766e", width: '25%' }}>Bed Number</th>
              <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#0f766e", width: '25%' }}>Type</th>
              <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#0f766e", width: '25%' }}>Status</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
    let currentBedRows: React.ReactNode[] = [];
    let currentBedRowsHeight = 0;
    bedDetails.forEach((bed, index) => {
        const rowElement = (<tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}><td style={{ padding: "6px", textTransform: "capitalize", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '25%' }}>{bed.ward.replace(/_/g, " ")}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '25%' }}>{bed.bedNumber || bed.bedKey}</td><td style={{ padding: "6px", textTransform: "capitalize", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '25%' }}>{bed.type || "Standard"}</td><td style={{ padding: "6px", textTransform: "capitalize", color: bed.status.toLowerCase() === "occupied" ? "#dc2626" : "#16a34a", verticalAlign: "middle", fontWeight: "600", border: "1px solid #e5e7eb", width: '25%' }}>{bed.status}</td></tr>);
        // Check if adding the next row exceeds page height (current content + title + header + accumulated rows + new row)
        if (currentHeightInPoints + bedTableTitleHeight + bedTableHeaderHeight + currentBedRowsHeight + bedTableRowHeight > maxContentHeight) {
            addContentBlock(generateBedTableBlock(currentBedRows, currentBedRows.length > 0), bedTableTitleHeight + bedTableHeaderHeight + currentBedRowsHeight);
            currentBedRows = []; // Start new set of rows for the next block
            currentBedRowsHeight = 0;
        }
        currentBedRows.push(rowElement);
        currentBedRowsHeight += bedTableRowHeight;
    });
    // Add any remaining bed rows to the current page/block
    if (currentBedRows.length > 0) {
      addContentBlock(generateBedTableBlock(currentBedRows, bedDetails.length > currentBedRows.length), bedTableTitleHeight + bedTableHeaderHeight + currentBedRowsHeight);
    }

    // // OT Records - Removed as per user request
    // const otTableTitleHeight = 25;
    // const otTableHeaderHeight = 30;
    // const otTableRowHeight = 16;
    // const otNoRecordsHeight = 30;
    // const generateOtTableBlock = (rows: React.ReactNode[], isContinuation: boolean = false) => (
    //   <div key={`pdf-ot-${contentPages.length}-${isContinuation}`} style={{ marginBottom: "16px" }}>
    //     <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#8b5cf6", marginBottom: "8px" }}>{isContinuation ? "Operation Theater Records (Cont.)" : "Today's Operation Theater Records (Created)"}</h2>
    //     <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
    //       <thead>
    //         <tr style={{ backgroundColor: "#f3e8ff" }}>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#8b5cf6", width: '25%' }}>Patient Name</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#8b5cf6", width: '15%' }}>Surgery Date</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#8b5cf6", width: '15%' }}>Created At Time</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#8b5cf6", width: 'auto' }}>Notes</th>
    //         </tr>
    //       </thead>
    //       <tbody>{rows}</tbody>
    //     </table>
    //   </div>
    // );
    // let currentOtRows: React.ReactNode[] = [];
    // let currentOtRowsHeight = 0;
    // if (otRecords.length === 0) {
    //     addContentBlock(<div key="pdf-no-ot" style={{ marginBottom: "16px" }}><h2 style={{ fontSize: "14px", fontWeight: "600", color: "#8b5cf6", marginBottom: "8px" }}>Today's Operation Theater Records (Created)</h2><p style={{ fontSize: "9px", color: "#555", fontStyle: "italic", textAlign: "center", padding: "8px", backgroundColor: "#f3e8ff" }}>No OT records created today.</p></div>, otTableTitleHeight + otNoRecordsHeight);
    // } else {
    //     otRecords.forEach((record, index) => {
    //         const rowElement = (<tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}><td style={{ padding: "6px", verticalAlign: "middle", fontWeight: "600", border: "1px solid #e5e7eb", width: '25%' }}>{record.patientName}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '15%' }}>{format(parseISO(record.date), "MMM dd,PPPP")}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '15%' }}>{format(parseISO(record.createdAt), "hh:mm a")}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: 'auto' }}>{record.message.length > 50 ? `${record.message.substring(0, 50)}...` : record.message}</td></tr>);
    //         if (currentHeightInPoints + otTableTitleHeight + otTableHeaderHeight + currentOtRowsHeight + otTableRowHeight > maxContentHeight) {
    //             addContentBlock(generateOtTableBlock(currentOtRows, currentOtRows.length > 0), otTableTitleHeight + otTableHeaderHeight + currentOtRowsHeight);
    //             currentOtRows = [];
    //             currentOtRowsHeight = 0;
    //         }
    //         currentOtRows.push(rowElement);
    //         currentOtRowsHeight += otTableRowHeight;
    //     });
    //     if (currentOtRows.length > 0) {
    //       addContentBlock(generateOtTableBlock(currentOtRows, otRecords.length > currentOtRows.length), otTableTitleHeight + otTableHeaderHeight + currentOtRowsHeight);
    //     }
    // }

    // // Mortality Reports - Removed as per user request
    // const mortalityTableTitleHeight = 25;
    // const mortalityTableHeaderHeight = 30;
    // const mortalityTableRowHeight = 16;
    // const mortalityNoRecordsHeight = 30;
    // const generateMortalityTableBlock = (rows: React.ReactNode[], isContinuation: boolean = false) => (
    //   <div key={`pdf-mortality-${contentPages.length}-${isContinuation}`} style={{ marginBottom: "16px" }}>
    //     <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#dc2626", marginBottom: "8px" }}>{isContinuation ? "Mortality Reports Today (Cont.)" : "Today's Mortality Reports"}</h2>
    //     <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
    //       <thead>
    //         <tr style={{ backgroundColor: "#fee2e2" }}>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#b91c1c", width: '25%' }}>Patient Name</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#b91c1c", width: '25%' }}>Admission Date</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#b91c1c", width: '25%' }}>Date of Death</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#b91c1c", width: '15%' }}>Days in Hospital</th>
    //           <th style={{ border: "1px solid #e5e7eb", padding: "6px", textAlign: "left", verticalAlign: "middle", color: "#b91c1c", width: 'auto' }}>Medical Findings</th>
    //         </tr>
    //       </thead>
    //       <tbody>{rows}</tbody>
    //     </table>
    //   </div>
    // );
    // let currentMortalityRows: React.ReactNode[] = [];
    // let currentMortalityRowsHeight = 0;
    // if (mortalityReports.length === 0) {
    //     addContentBlock(<div key="pdf-no-mortality" style={{ marginBottom: "16px" }}><h2 style={{ fontSize: "14px", fontWeight: "600", color: "#dc2626", marginBottom: "8px" }}>Today's Mortality Reports</h2><p style={{ fontSize: "9px", color: "#555", fontStyle: "italic", textAlign: "center", padding: "8px", backgroundColor: "#fee2e2" }}>No mortality reports for today.</p></div>, mortalityTableTitleHeight + mortalityNoRecordsHeight);
    // } else {
    //     mortalityReports.forEach((report, index) => {
    //         const rowElement = (<tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}><td style={{ padding: "6px", verticalAlign: "middle", fontWeight: "600", border: "1px solid #e5e7eb", width: '25%' }}>{report.patientName}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '25%' }}>{format(parseISO(report.admissionDate), "MMM dd,PPPP")}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '25%' }}>{format(parseISO(report.dateOfDeath), "MMM dd,PPPP")}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: '15%' }}>{report.timeSpanDays}</td><td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb", width: 'auto' }}>{report.medicalFindings.length > 50 ? `${report.medicalFindings.substring(0, 50)}...` : report.medicalFindings}</td></tr>);
    //         if (currentHeightInPoints + mortalityTableTitleHeight + mortalityTableHeaderHeight + currentMortalityRowsHeight + mortalityTableRowHeight > maxContentHeight) {
    //             addContentBlock(generateMortalityTableBlock(currentMortalityRows, currentMortalityRows.length > 0), mortalityTableTitleHeight + mortalityTableHeaderHeight + currentMortalityRowsHeight);
    //             currentMortalityRows = [];
    //             currentMortalityRowsHeight = 0;
    //         }
    //         currentMortalityRows.push(rowElement);
    //         currentMortalityRowsHeight += mortalityTableRowHeight;
    //     });
    //     if (currentMortalityRows.length > 0) {
    //       addContentBlock(generateMortalityTableBlock(currentMortalityRows, mortalityReports.length > currentMortalityRows.length), mortalityTableTitleHeight + mortalityTableHeaderHeight + currentMortalityRowsHeight);
    //     }
    // }

    // Final footer (will appear on the last page with content)
    // Estimate height and add it as the last block. It will force a new page if not enough space.
    addContentBlock(
      <div key="pdf-footer" style={{ textAlign: "center", fontSize: "8px", color: "#666", marginTop: "16px", borderTop: "1px solid #e5e7eb", paddingTop: "8px", }} >
        <p>This is a computer-generated report and does not require a signature.</p>
        <p>Generated on {format(new Date(), "dd MMM,PPPP 'at' hh:mm a")}</p>
        <p>Thank you for choosing Our Hospital. We are committed to your health and well-being.</p>
      </div>,
      40, // Estimated height for footer
    );

    // Add the last accumulated content as a new page if anything remains
    if (currentPageContent.length > 0) {
      contentPages.push(
        <div key={`pdf-page-${contentPages.length}`} style={{ width: `${pageWidth}pt`, height: `${pageHeight}pt`, overflow: "hidden", backgroundColor: "white" }}>
          <DPRPageLayout key={`layout-final-${contentPages.length}`} topOffset={topOffset} bottomOffset={bottomOffset} letterheadUrl={letterheadImageUrl}>{currentPageContent}</DPRPageLayout>
        </div>,
      );
    }
    setPages(contentPages);
  }, [pairedMetrics, bedDetails, otRecords, mortalityReports, doctors, letterheadImageUrl]);

  return (
    <>
      {pages.map((page, idx) => (
        <React.Fragment key={idx}>{page}</React.Fragment>
      ))}
    </>
  );
}

// =================== Page Layout with Letterhead ===================

interface DPRPageLayoutProps {
  children: React.ReactNode;
  topOffset: number;
  bottomOffset: number;
  letterheadUrl: string; // New prop for letterhead image URL
}

function DPRPageLayout({ children, topOffset, bottomOffset, letterheadUrl }: DPRPageLayoutProps) {
  return (
    <div style={{
      width: "595pt", // A4 width in points
      height: "842pt", // A4 height in points
      backgroundImage: `url('${letterheadUrl}')`, // Use the passed URL for the letterhead
      backgroundSize: "cover", // Cover the entire div
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      position: "relative",
      boxSizing: "border-box",
    }}>
      {/* This inner div holds the report content */}
      <div style={{
        position: "absolute",
        top: `${topOffset}pt`,
        left: "24pt",
        right: "24pt",
        bottom: `${bottomOffset}pt`,
        overflow: "hidden", // Ensures content stays within bounds
        padding: "16pt",
        backgroundColor: "rgba(255, 255, 255, 0.95)", // Slightly transparent white background for readability over letterhead
        borderRadius: "8px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
        display: 'flex',
        flexDirection: 'column',
        gap: '10pt', // Using 'pt' for consistency in print dimensions
      }}>
        {children}
      </div>
    </div>
  );
}
