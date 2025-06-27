"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { db } from "../../lib/firebase"
import {
  ref,
  get,
  query,
  orderByChild,
  limitToLast,
  endAt,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
} from "firebase/database"
import { format } from "date-fns"
import { Search, Users, Download, Plus, Filter, Calendar, Phone, MapPin } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface IPatientInfo {
  address?: string
  age?: string | number
  createdAt?: string | number
  gender?: string
  name?: string
  phone?: string
  uhid?: string
  updatedAt?: string | number
}

interface IPatientRecord {
  uhid: string
  name: string
  phone: string
  createdAt: string
  address?: string
  age?: string | number
  gender?: string
  updatedAt?: string | number
}

const PatientManagement: React.FC = () => {
  const router = useRouter()

  // State
  const [patients, setPatients] = useState<IPatientRecord[]>([])
  const [filteredPatients, setFilteredPatients] = useState<IPatientRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [genderFilter, setGenderFilter] = useState<string>("all")
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)

  const patientMap = useRef<Record<string, boolean>>({})
  const PAGE_SIZE = 20
  const STORAGE_KEY = "cachedPatients"

  // Real-time listeners and data synchronization
  useEffect(() => {
    const patientsRef = ref(db, "patients/patientinfo")

    // Set up real-time listeners
    const addedListener = onChildAdded(patientsRef, (snapshot) => {
      const val = snapshot.val() as IPatientInfo
      if (val.uhid && val.createdAt && !patientMap.current[val.uhid]) {
        const newPatient: IPatientRecord = {
          uhid: val.uhid,
          name: val.name || "Unknown",
          phone: val.phone || "",
          address: val.address,
          age: val.age,
          gender: val.gender,
          createdAt: val.createdAt as string,
          updatedAt: val.updatedAt,
        }

        setPatients((prev) => {
          const updated = [newPatient, ...prev].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          return updated
        })

        patientMap.current[val.uhid] = true
      }
    })

    const removedListener = onChildRemoved(patientsRef, (snapshot) => {
      const val = snapshot.val() as IPatientInfo
      if (val.uhid) {
        setPatients((prev) => prev.filter((p) => p.uhid !== val.uhid))
        delete patientMap.current[val.uhid]
      }
    })

    const changedListener = onChildChanged(patientsRef, (snapshot) => {
      const val = snapshot.val() as IPatientInfo
      if (val.uhid && val.createdAt) {
        const updatedPatient: IPatientRecord = {
          uhid: val.uhid,
          name: val.name || "Unknown",
          phone: val.phone || "",
          address: val.address,
          age: val.age,
          gender: val.gender,
          createdAt: val.createdAt as string,
          updatedAt: val.updatedAt,
        }

        setPatients((prev) => prev.map((p) => (p.uhid === val.uhid ? updatedPatient : p)))
      }
    })

    // Initial load
    fetchInitialPatients()

    // Cleanup listeners
    return () => {
      addedListener()
      removedListener()
      changedListener()
    }
  }, [])

  // Fetch Initial Patients
  const fetchInitialPatients = useCallback(async () => {
    setLoading(true)
    try {
      const patientsRef = ref(db, "patients/patientinfo")
      const q = query(patientsRef, orderByChild("createdAt"), limitToLast(PAGE_SIZE))
      const snap = await get(q)
      const temp: IPatientRecord[] = []

      snap.forEach((child) => {
        const val = child.val() as IPatientInfo
        if (val.uhid && val.createdAt) {
          temp.push({
            uhid: val.uhid,
            name: val.name || "Unknown",
            phone: val.phone || "",
            address: val.address,
            age: val.age,
            gender: val.gender,
            createdAt: val.createdAt as string,
            updatedAt: val.updatedAt,
          })
        }
      })

      temp.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const map: Record<string, boolean> = {}
      temp.forEach((p) => {
        map[p.uhid] = true
      })
      patientMap.current = map

      setPatients(temp)
      if (temp.length < PAGE_SIZE) {
        setHasMore(false)
      }
      if (temp.length > 0) {
        setLastCreatedAt(temp[temp.length - 1].createdAt)
      }
    } catch (error) {
      console.error("Error fetching initial patients:", error)
      toast.error("Failed to load patients")
    } finally {
      setLoading(false)
    }
  }, [])

  // Load More Patients
  const loadMore = async () => {
    if (!lastCreatedAt) return
    setLoading(true)
    try {
      const patientsRef = ref(db, "patients/patientinfo")
      const q = query(patientsRef, orderByChild("createdAt"), endAt(lastCreatedAt), limitToLast(PAGE_SIZE + 1))
      const snap = await get(q)
      const temp: IPatientRecord[] = []

      snap.forEach((child) => {
        const val = child.val() as IPatientInfo
        if (val.uhid && val.createdAt) {
          temp.push({
            uhid: val.uhid,
            name: val.name || "Unknown",
            phone: val.phone || "",
            address: val.address,
            age: val.age,
            gender: val.gender,
            createdAt: val.createdAt as string,
            updatedAt: val.updatedAt,
          })
        }
      })

      temp.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const filtered: IPatientRecord[] = []
      for (const p of temp) {
        if (!patientMap.current[p.uhid!]) {
          filtered.push(p)
        }
      }

      if (filtered.length === 0) {
        setHasMore(false)
      } else {
        setPatients((prev) => [...prev, ...filtered])
        filtered.forEach((p) => {
          patientMap.current[p.uhid!] = true
        })
        const last = filtered[filtered.length - 1].createdAt
        setLastCreatedAt(last)
        if (filtered.length < PAGE_SIZE) {
          setHasMore(false)
        }
      }
    } catch (error) {
      console.error("Error loading more patients:", error)
      toast.error("Failed to load more patients")
    } finally {
      setLoading(false)
    }
  }

  // Apply Filters
  const applyFilters = (patientList: IPatientRecord[], search: string, gender: string) => {
    let filtered = [...patientList]

    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.phone.includes(search) ||
          p.uhid.toLowerCase().includes(searchLower),
      )
    }

    if (gender !== "all") {
      filtered = filtered.filter((p) => p.gender === gender)
    }

    setFilteredPatients(filtered)
  }

  // Handle Search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchQuery(q)
    applyFilters(patients, q, genderFilter)
  }

  // Handle Gender Filter
  const handleGenderFilter = (value: string) => {
    setGenderFilter(value)
    applyFilters(patients, searchQuery, value)
  }

  // Export Excel
  const exportExcel = () => {
    const data = filteredPatients.map((p) => ({
      Name: p.name,
      Phone: p.phone,
      UHID: p.uhid,
      Age: p.age || "",
      Gender: p.gender || "",
      Address: p.address || "",
      CreatedAt: format(new Date(p.createdAt), "PPP"),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Patients")
    XLSX.writeFile(wb, `Patients_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`)
    toast.success("Excel downloaded successfully")
  }

  // Get Initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  // Handle Row Click
  const handleRowClick = (p: IPatientRecord) => {
    router.push(`/allusermanage/${p.uhid}`)
  }

  // Apply filters when patients data changes
  useEffect(() => {
    applyFilters(patients, searchQuery, genderFilter)
  }, [patients, searchQuery, genderFilter])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Patient Management</h1>
              <p className="text-slate-600">Manage and view all patient records</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  // Clear cache and reload
                  patientMap.current = {}
                  setPatients([])
                  setFilteredPatients([])
                  setLastCreatedAt(null)
                  setHasMore(true)
                  fetchInitialPatients()
                }}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={exportExcel} variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
              <Button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                Add Patient
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{patients.length}</div>
              <p className="text-xs text-slate-500 mt-1">Active records</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Male Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {patients.filter((p) => p.gender === "male").length}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {patients.length > 0
                  ? Math.round((patients.filter((p) => p.gender === "male").length / patients.length) * 100)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-pink-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Female Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {patients.filter((p) => p.gender === "female").length}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {patients.length > 0
                  ? Math.round((patients.filter((p) => p.gender === "female").length / patients.length) * 100)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search by name, phone, or UHID..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-10"
                />
              </div>
              <Select value={genderFilter} onValueChange={handleGenderFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Patient Cards */}
        <div className="space-y-4">
          {loading && patients.length === 0 ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredPatients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No patients found</h3>
                <p className="text-slate-500">
                  {searchQuery.trim() || genderFilter !== "all"
                    ? "Try adjusting your search or filters"
                    : "No patients have been added yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPatients.map((patient) => (
              <Card
                key={patient.uhid}
                className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-transparent hover:border-l-emerald-500"
                onClick={() => handleRowClick(patient)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-12 w-12 border-2 border-emerald-100">
                        <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                          {getInitials(patient.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-slate-900">{patient.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {patient.uhid}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              patient.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                            }`}
                          >
                            {patient.gender === "male" ? "Male" : "Female"}, {patient.age}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{patient.phone}</span>
                          </div>
                          {patient.address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-48">{patient.address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(patient.createdAt), "MMM dd, yyyy")}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Load More */}
        {hasMore && !loading && !searchQuery.trim() && genderFilter === "all" && (
          <div className="flex justify-center mt-8">
            <Button onClick={loadMore} variant="outline" className="px-8">
              Load More Patients
            </Button>
          </div>
        )}

        {loading && patients.length > 0 && (
          <div className="flex justify-center mt-8">
            <div className="flex items-center gap-2 text-slate-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500"></div>
              <span>Loading more patients...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PatientManagement
