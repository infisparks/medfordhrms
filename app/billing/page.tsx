"use client"

import type React from "react"
import { useEffect, useState, useCallback, useMemo } from "react" // Import useMemo
import { ref, onChildAdded, onChildChanged, onChildRemoved, get, remove, query, orderByChild, startAt, endAt } from "firebase/database"
import { db } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import {
  Search,
  Edit,
  Users,
  CreditCard,
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard,
  Stethoscope,
  Trash2,
  AlertCircle,
  Calendar as CalendarIcon, // Renamed to avoid conflict with Calendar component
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format, parseISO, isValid, startOfWeek, endOfWeek, subWeeks, addDays } from "date-fns" // Added date-fns functions
import { ToastContainer, toast } from "react-toastify" // Ensure ToastContainer is imported

// Date Picker imports
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css"; // Ensure DatePicker CSS is imported

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

export interface BillingRecord {
  patientId: string
  ipdId: string
  name: string
  uhid?: string
  mobileNumber: string
  address?: string
  age?: string | number
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string // ISO string
  admissionDate?: string // ISO string
  amount: number // totalDeposit or advanceDeposit
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  createdAt?: string // ISO string
  billNumber?: string // <-- Add bill number to BillingRecord
}

const ITEMS_PER_PAGE = 20 // Still relevant for initial load of discharged or pagination if implemented

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function OptimizedPatientsPage() {
  const [activeIpdRecords, setActiveIpdRecords] = useState<BillingRecord[]>([])
  const [dischargedRecords, setDischargedRecords] = useState<BillingRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [dischargedDataSize, setDischargedDataSize] = useState<number>(0)
  const [hasLoadedDischarged, setHasLoadedDischarged] = useState<boolean>(false) // Track if discharge data was loaded at least once
  const router = useRouter()

  // Date Filter States
  const [selectedDischargeDate, setSelectedDischargeDate] = useState<Date | null>(null) // Specific discharge date
  const [selectedAdmissionDate, setSelectedAdmissionDate] = useState<Date | null>(null) // Specific admission date

  // State for cancellation modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelPassword, setCancelPassword] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [recordToCancel, setRecordToCancel] = useState<BillingRecord | null>(null)

  // Helper to format ISO date strings to yyyy-MM-dd
  function getFirebaseDateKey(date?: string | Date | null): string {
    if (!date) return ""
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return "";
    return format(d, 'yyyy-MM-dd');
  }

  // Combine IPD info and billing info into a single record
  const combineRecordData = useCallback(
    (patientId: string, ipdId: string, ipdData: any, billingData: any): BillingRecord => {
      const servicesArray: ServiceItem[] = []
      if (Array.isArray(ipdData.services)) {
        ipdData.services.forEach((svc: any) => {
          servicesArray.push({
            serviceName: svc.serviceName || "",
            doctorName: svc.doctorName || "",
            type: svc.type || "service",
            amount: Number(svc.amount) || 0,
            createdAt: svc.createdAt || "",
          })
        })
      }
      const paymentsArray: Payment[] = []
      if (billingData?.payments) {
        Object.keys(billingData.payments).forEach((payId) => {
          const pay = billingData.payments[payId]
          paymentsArray.push({
            id: payId,
            amount: Number(pay.amount) || 0,
            paymentType: pay.paymentType || "cash",
            date: pay.date || new Date().toISOString(),
          })
        })
      }
      return {
        patientId,
        ipdId,
        name: ipdData.name || "Unknown",
        uhid: ipdData.uhid || "", // Ensure UHID is included
        mobileNumber: ipdData.phone || "",
        address: ipdData.address || "",
        age: ipdData.age || "",
        gender: ipdData.gender || "",
        relativeName: ipdData.relativeName || "",
        relativePhone: ipdData.relativePhone || "",
        relativeAddress: ipdData.relativeAddress || "",
        dischargeDate: ipdData.dischargeDate || "", // This is the actual discharge date
        admissionDate: ipdData.admitDate || "", // This is the admission date
        amount: billingData?.totalDeposit ? Number(billingData.totalDeposit) : 0,
        roomType: ipdData.ward || "", // Use 'ward' from ipdData
        bed: ipdData.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        discount: ipdData.discount ? Number(ipdData.discount) : 0,
        createdAt: ipdData.createdAt || "",
        billNumber: billingData?.billNumber || ipdData?.billNumber || "", // <-- Prefer billingData, fallback to ipdData
      }
    },
    [],
  )

  // Active (non-discharge) patients: only fetch from /patients/ipdactive
  // This listener is always active for the active tab
  useEffect(() => {
    // Clear any previous listeners for active records if state changes
    const ipdActiveRef = ref(db, "patients/ipdactive")
    setActiveIpdRecords([]); // Clear previous records
    setIsLoading(true);

    const handleAdd = onChildAdded(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) => {
        if (prev.some((r) => r.ipdId === data.ipdId)) return prev
        return [
          ...prev,
          {
            patientId: data.patientId,
            ipdId: data.ipdId,
            uhid: data.uhid,
            name: data.name || "",
            mobileNumber: data.phone || "",
            roomType: data.ward || "",
            bed: data.bed || "",
            amount: data.advanceDeposit || 0,
            admissionDate: data.admitDate || "",
            dischargeDate: "", // Active patients don't have a discharge date yet
            services: [],
            payments: [],
          },
        ]
      })
      setIsLoading(false)
    })
    const handleChange = onChildChanged(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) =>
        prev.map((r) =>
          r.ipdId === data.ipdId
            ? {
                ...r,
                name: data.name || "",
                mobileNumber: data.phone || "",
                roomType: data.ward || "",
                bed: data.bed || "",
                amount: data.advanceDeposit || 0,
                admissionDate: data.admitDate || "",
              }
            : r,
        ),
      )
    })
    const handleRemove = onChildRemoved(ipdActiveRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) return
      setActiveIpdRecords((prev) => prev.filter((r) => r.ipdId !== data.ipdId))
    })
    return () => {
      handleAdd()
      handleChange()
      handleRemove()
      // Do not clear activeIpdRecords here, as it's needed for overall filtering later.
    }
  }, []) // No dependencies means it runs once on mount and sets up listeners

  // Load Discharged Patients based on selected date filters or default to this week
  const loadDischargedPatients = useCallback(async () => {
    setIsLoading(true)
    setDischargedRecords([]) // Clear previous discharged records
    setDischargedDataSize(0)

    let queryDateStart: Date;
    let queryDateEnd: Date;
    let filterByDischargeDate = false; // Flag to indicate if we're filtering by dischargeDate

    if (selectedAdmissionDate) {
        // If admission date is selected, query that specific admission date
        queryDateStart = selectedAdmissionDate;
        queryDateEnd = selectedAdmissionDate;
        filterByDischargeDate = false; // We're querying by admission date, not discharge date
    } else if (selectedDischargeDate) {
        // If specific discharge date is selected, query a broad range of admission dates
        // to find patients discharged on this date.
        // A full year range for admission dates.
        queryDateStart = new Date(selectedDischargeDate.getFullYear(), 0, 1);
        queryDateEnd = new Date(selectedDischargeDate.getFullYear(), 11, 31);
        filterByDischargeDate = true; // We will filter by discharge date after fetching
    } else { // Default: This week's discharged (filter by dischargeDate)
        queryDateEnd = new Date(); // Today
        queryDateStart = startOfWeek(queryDateEnd, { weekStartsOn: 1 }); // Monday of this week
        filterByDischargeDate = true;
    }

    try {
        const fetchPromises: Promise<any>[] = [];
        const fetchedRawIpdData: { patientId: string; ipdId: string; ipdData: any; dateKey: string }[] = [];
        let totalBytesFetched = 0;

        // Iterate through the determined date range for admission dates
        let currentDate = queryDateStart;
        while (currentDate <= queryDateEnd) {
            const admitDateKey = getFirebaseDateKey(currentDate);
            const admittedRef = ref(db, `patients/ipddetail/userinfoipd/${admitDateKey}`);
            fetchPromises.push(get(admittedRef).then(snap => {
                if (snap.exists()) {
                    const dateData = snap.val();
                    totalBytesFetched += JSON.stringify(dateData).length;
                    Object.keys(dateData).forEach(patientId => {
                        Object.keys(dateData[patientId]).forEach(ipdId => {
                            fetchedRawIpdData.push({
                                patientId,
                                ipdId,
                                ipdData: dateData[patientId][ipdId],
                                dateKey: admitDateKey, // Admission date key
                            });
                        });
                    });
                }
            }));
            currentDate = addDays(currentDate, 1);
        }

        await Promise.all(fetchPromises); // Wait for all IPD info to fetch

        const billingPromises: Promise<any>[] = [];
        const billingMap = new Map<string, any>(); // Map to store billing data by ipdId for later combination

        for (const entry of fetchedRawIpdData) {
            if (entry.ipdData.dischargeDate) { // Only fetch billing for discharged records
                const billingRef = ref(db, `patients/ipddetail/userbillinginfoipd/${entry.dateKey}/${entry.patientId}/${entry.ipdId}`);
                billingPromises.push(get(billingRef).then(snap => {
                    const billingVal = snap.exists() ? snap.val() : {};
                    totalBytesFetched += JSON.stringify(billingVal).length;
                    billingMap.set(entry.ipdId, billingVal);
                }));
            }
        }

        await Promise.all(billingPromises); // Wait for all billing data to fetch

        let tempDischargedRecords: BillingRecord[] = fetchedRawIpdData
            .filter(entry => entry.ipdData.dischargeDate) // Ensure it's discharged
            .map(entry => combineRecordData(
                entry.patientId,
                entry.ipdId,
                entry.ipdData,
                billingMap.get(entry.ipdId) || {}
            ));

        // Apply discharge date filter if needed
        if (filterByDischargeDate) {
            tempDischargedRecords = tempDischargedRecords.filter(record => {
                const dischargeDate = parseISO(record.dischargeDate || '');
                if (!isValid(dischargeDate)) return false;

                if (selectedDischargeDate) {
                    return getFirebaseDateKey(dischargeDate) === getFirebaseDateKey(selectedDischargeDate);
                } else { // Default: This week's discharge
                    return dischargeDate >= startOfWeek(new Date(), { weekStartsOn: 1 }) && dischargeDate <= endOfWeek(new Date(), { weekStartsOn: 1 });
                }
            });
        }
        // If selectedAdmissionDate, it's already implicitly filtered by the initial query range.

        setDischargedRecords(tempDischargedRecords);
        setDischargedDataSize(totalBytesFetched);
        setHasLoadedDischarged(true);
    } catch (err) {
      setDischargedDataSize(0)
      setDischargedRecords([])
      console.error("Error loading discharged patients:", err)
      toast.error("Failed to load discharged patients.")
    } finally {
      setIsLoading(false)
    }
  }, [combineRecordData, selectedDischargeDate, selectedAdmissionDate]);

  // Effect to trigger loading of discharged patients when tab is selected or date filters change
  useEffect(() => {
    // Only load discharged if on the discharge tab OR if an admission date is specifically selected.
    // If an admission date is selected, it will affect *both* active and discharged records,
    // so we call loadDischargedPatients to get the relevant discharged ones.
    if (selectedTab === "discharge" || selectedAdmissionDate) {
      loadDischargedPatients();
    } else if (selectedTab === "non-discharge" && !selectedAdmissionDate) {
        // If on non-discharge tab and no admission date filter, ensure discharged records are cleared
        // or set to their default "this week" view by calling loadDischargedPatients with null filters.
        // This avoids stale data if user switches back and forth without re-filtering.
        if (dischargedRecords.length > 0 || hasLoadedDischarged) { // Only clear if there's data or it was loaded
            setDischargedRecords([]);
            setDischargedDataSize(0);
            setHasLoadedDischarged(false); // Reset to ensure reload if discharge tab is selected later
        }
    }
  }, [selectedTab, selectedDischargeDate, selectedAdmissionDate, loadDischargedPatients, dischargedRecords.length, hasLoadedDischarged]);


  // Filter records based on tab, search, ward, and date filters
  useEffect(() => {
    let records: BillingRecord[] = []

    if (selectedAdmissionDate) {
        // If an admission date is selected, filter across ALL active and discharged records by that admission date
        const admitDateKey = getFirebaseDateKey(selectedAdmissionDate);
        records = [...activeIpdRecords, ...dischargedRecords].filter(
            (rec: BillingRecord) => getFirebaseDateKey(rec.admissionDate) === admitDateKey
        );
    } else {
        // If no admission date is selected, use the tab-specific logic
        if (selectedTab === "non-discharge") {
            records = activeIpdRecords;
        } else { // selectedTab === "discharge"
            // Discharged records are already filtered by loadDischargedPatients for discharge date or this week
            records = dischargedRecords;
        }
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term) ||
          (rec.uhid && rec.uhid.toLowerCase().includes(term)),
      );
    }

    if (selectedWard !== "All") {
      records = records.filter((rec: BillingRecord) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase()) // Explicitly type 'rec'
    }
    
    setFilteredRecords(records);
  }, [selectedTab, searchTerm, selectedWard, activeIpdRecords, dischargedRecords, selectedAdmissionDate]);


  // Event handlers
  const handleRowClick = (record: BillingRecord) => {
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  const handleEditRecord = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  const handleManagePatient = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/manage/${record.patientId}/${record.ipdId}`)
  }

  const handleDrugChart = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/drugchart/${record.patientId}/${record.ipdId}`)
  }

  const handleOTForm = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    const admitDateKey = getFirebaseDateKey(record.admissionDate || record.createdAt)
    router.push(`/ot/${record.patientId}/${record.ipdId}/${admitDateKey}`)
  }

  // Handle Cancel Appointment button click
  const handleCancelAppointment = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    setRecordToCancel(record)
    setCancelPassword("")
    setCancelError("")
    setShowCancelModal(true)
  }

  // Confirm cancellation after password input
  const confirmCancelAppointment = async () => {
    if (cancelPassword !== "medford@788") {
      setCancelError("Incorrect password.")
      return
    }

    if (!recordToCancel) {
      setCancelError("No record selected for cancellation.")
      return
    }

    setIsLoading(true) // Show loading state during deletion
    try {
      const { patientId, ipdId, admissionDate, createdAt } = recordToCancel
      const dateKey = getFirebaseDateKey(admissionDate || createdAt)

      // 1. Delete from /patients/ipdactive/{ipdId}
      await remove(ref(db, `patients/ipdactive/${ipdId}`))

      // 2. Delete from /patients/ipddetail/userinfoipd/{dateKey}/{patientId}/{ipdId}
      await remove(ref(db, `patients/ipddetail/userinfoipd/${dateKey}/${patientId}/${ipdId}`))

      // 3. Delete from /patients/ipddetail/userbillinginfoipd/{dateKey}/{patientId}/{ipdId}
      // Check if billing record exists before attempting to delete
      const billingRef = ref(db, `patients/ipddetail/userbillinginfoipd/${dateKey}/${patientId}/${ipdId}`)
      const billingSnap = await get(billingRef)
      if (billingSnap.exists()) {
        await remove(billingRef)
      }

      toast.success("IPD Appointment cancelled and records deleted successfully!", {
        position: "top-right",
        autoClose: 5000,
      })
      setShowCancelModal(false)
      setRecordToCancel(null)
      setCancelPassword("")
      setCancelError("")
    } catch (error) {
      console.error("Error cancelling IPD appointment:", error)
      toast.error("Failed to cancel IPD appointment.", {
        position: "top-right",
        autoClose: 5000,
      })
      setCancelError("An error occurred during cancellation.")
    } finally {
      setIsLoading(false)
    }
  }

  // Get unique ward names from current records
  const allRecordsForWardFilter = useMemo(() => [...activeIpdRecords, ...dischargedRecords], [activeIpdRecords, dischargedRecords]);
  const uniqueWards = useMemo(
    () => Array.from(new Set(allRecordsForWardFilter.map((record: BillingRecord) => record.roomType).filter((ward): ward is string => ward !== undefined && ward !== null))), // Explicitly type 'ward' and use type guard
    [allRecordsForWardFilter]
);

  // Summary stats
  const totalPatients = filteredRecords.length
  const totalDeposits = filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  // Manual reload for discharge
  function reloadDischargeTab() {
    setHasLoadedDischarged(false) // Force reload
    setSelectedDischargeDate(null); // Clear discharge date filter
    setSelectedAdmissionDate(null); // Clear admission date filter
    loadDischargedPatients();
  }

  // Handle date picker changes
  const handleDischargeDateChange = (date: Date | null) => {
    setSelectedDischargeDate(date);
    setSelectedAdmissionDate(null); // Clear admission date filter if discharge date is set
    setSearchTerm(""); // Clear search term
  };

  const handleAdmissionDateChange = (date: Date | null) => {
    setSelectedAdmissionDate(date);
    setSelectedDischargeDate(null); // Clear discharge date filter if admission date is set
    setSearchTerm(""); // Clear search term
  };

  const clearDateFilters = () => {
    setSelectedDischargeDate(null);
    setSelectedAdmissionDate(null);
    setSearchTerm(""); // Clear search term
    setSelectedWard("All"); // Reset ward filter
    // If on discharge tab, reload to default "this week"
    if (selectedTab === "discharge") {
        setHasLoadedDischarged(false);
        loadDischargedPatients();
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <ToastContainer /> {/* Ensure ToastContainer is rendered */}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">IPD Billing Management</h1>
          <p className="text-slate-500">Manage and track in-patient billing records</p>
        </div>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Users className="h-5 w-5 text-emerald-500 mr-2" />
                <span className="text-2xl font-bold">{totalPatients}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Deposits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CreditCard className="h-5 w-5 text-violet-500 mr-2" />
                <span className="text-2xl font-bold">₹{totalDeposits.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Tabs & Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <Tabs
              defaultValue="non-discharge"
              value={selectedTab}
              onValueChange={(value) => {
                setSelectedTab(value as "non-discharge" | "discharge");
                setSelectedDischargeDate(null); // Clear specific date filter when changing tabs
                setSelectedAdmissionDate(null); // Clear specific date filter when changing tabs
                setSearchTerm(""); // Clear search term
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="overflow-x-auto">
                  <TabsList className="bg-slate-100 flex gap-2 whitespace-nowrap">
                    <TabsTrigger
                      value="non-discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Non-Discharged ({activeIpdRecords.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Discharged ({dischargedRecords.length})
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, ID, UHID or mobile"
                    className="pl-10 w-full md:w-80"
                  />
                </div>
              </div>

              {/* Date Filters and Clear Button */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-500" />
                  <span className="font-medium text-slate-700">Discharge Date:</span>
                  <DatePicker
                    selected={selectedDischargeDate}
                    onChange={handleDischargeDateChange}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Discharge Date"
                    className="border rounded-md px-3 py-1 w-36"
                    isClearable
                  />
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-500" />
                  <span className="font-medium text-slate-700">Admission Date:</span>
                  <DatePicker
                    selected={selectedAdmissionDate}
                    onChange={handleAdmissionDateChange}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Admission Date"
                    className="border rounded-md px-3 py-1 w-36"
                    isClearable
                  />
                </div>
                {(selectedDischargeDate || selectedAdmissionDate || searchTerm || selectedWard !== "All") && (
                    <Button variant="outline" size="sm" onClick={clearDateFilters} className="text-red-500 border-red-200 hover:bg-red-50">
                        Clear All Filters
                    </Button>
                )}
              </div>

              {/* Ward Filter */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-4 w-4 text-slate-500" />
                  <h3 className="font-medium text-slate-700">Filter by Ward</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={selectedWard === "All" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedWard("All")}
                  >
                    All Wards
                  </Badge>
                  {uniqueWards.map((ward: string) => ( // Explicitly type 'ward'
                    <Badge
                      key={ward}
                      variant={selectedWard === ward ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedWard(ward)} // 'ward' is now guaranteed to be string
                    >
                      {ward}
                    </Badge>
                  ))}
                </div>
              </div>

              <TabsContent value="non-discharge" className="mt-0">
                {renderPatientsTable(
                  filteredRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  handleCancelAppointment, // Pass the new handler
                  isLoading,
                )}
              </TabsContent>
              <TabsContent value="discharge" className="mt-0">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Data downloaded: <b>{formatBytes(dischargedDataSize)}</b>
                  </span>
                  <Button variant="outline" size="sm" onClick={reloadDischargeTab}>
                    Reload Discharged Data
                  </Button>
                </div>
                {renderPatientsTable(
                  filteredRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  handleCancelAppointment, // Pass the new handler
                  isLoading,
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      {/* Cancellation Confirmation Modal */}
      {showCancelModal && recordToCancel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-red-700 flex items-center">
                <Trash2 className="h-6 w-6 mr-2" />
                Confirm Cancellation
              </h3>
              <button onClick={() => setShowCancelModal(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to cancel the IPD appointment for{" "}
              <span className="font-semibold">{recordToCancel.name}</span> (UHID:{" "}
              <span className="font-semibold">{recordToCancel.uhid || recordToCancel.patientId}</span>)?
              <br />
              This action will permanently delete all associated records.
            </p>
            <div className="mb-4">
              <label htmlFor="cancel-password" className="block text-sm font-medium text-gray-700 mb-1">
                Enter Password to Confirm:
              </label>
              <Input
                id="cancel-password"
                type="password"
                value={cancelPassword}
                onChange={(e) => {
                  setCancelPassword(e.target.value)
                  setCancelError("") // Clear error on input change
                }}
                placeholder="Enter password"
                className={cancelError ? "border-red-500" : ""}
              />
              {cancelError && (
                <p className="text-red-500 text-sm mt-1 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {cancelError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCancelModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmCancelAppointment} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Record"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDrugChart: (e: React.MouseEvent, record: BillingRecord) => void,
  handleOTForm: (e: React.MouseEvent, record: BillingRecord) => void,
  handleCancelAppointment: (e: React.MouseEvent, record: BillingRecord) => void, // New prop
  isLoading: boolean,
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
        <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700 mb-1">No patients found</h3>
        <p className="text-slate-500">Try adjusting your filters or search criteria</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Patient Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Mobile Number</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Room Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {records.map((record, index) => (
            <tr
              key={`${record.patientId}-${record.ipdId}`}
              onClick={() => handleRowClick(record)}
              className="hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{record.name}</div>
                <div className="text-xs text-slate-500">UHID: {record.uhid || record.patientId}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{record.mobileNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">₹{record.amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50">
                  {record.roomType || "Not Assigned"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.dischargeDate ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Discharged
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Active
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleEditRecord(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleManagePatient(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDrugChart(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Clipboard className="h-4 w-4 mr-1" />
                    Drug Chart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleOTForm(e, record)}
                    className="text-blue-700 hover:text-blue-900 hover:bg-blue-50 border-blue-200"
                  >
                    <Stethoscope className="h-4 w-4 mr-1" />
                    OT
                  </Button>
                  {/* New Cancel Button */}
                  {!record.dischargeDate && ( // Only show for non-discharged patients
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => handleCancelAppointment(e, record)}
                      className="bg-red-500 hover:bg-red-600 text-white"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}