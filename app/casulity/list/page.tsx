"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, onValue, remove } from "firebase/database"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Info, Trash2, ArrowLeftIcon, MicroscopeIcon as MagnifyingGlassIcon, Plus, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRightIcon } from "@radix-ui/react-icons"

interface CasualtyRecord {
  id: string
  patientId: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  caseType: string
  otherCaseType?: string
  triageCategory: string
  modeOfArrival: string
  isMLC: boolean
  mlcNumber?: string
  createdAt: string
  status?: "active" | "discharged" | "transferred" | "deceased"
}

const CaseTypeOptions = [
  { value: "rta", label: "Road Traffic Accident (RTA)" },
  { value: "physicalAssault", label: "Physical Assault" },
  { value: "burn", label: "Burn" },
  { value: "poisoning", label: "Poisoning" },
  { value: "snakeBite", label: "Snake Bite" },
  { value: "cardiac", label: "Cardiac Emergency" },
  { value: "fall", label: "Fall" },
  { value: "other", label: "Other" },
]

const TriageCategoryOptions = [
  { value: "red", label: "Red (Critical)", color: "bg-red-500" },
  { value: "yellow", label: "Yellow (Urgent)", color: "bg-yellow-500" },
  { value: "green", label: "Green (Less Urgent)", color: "bg-green-500" },
  { value: "black", label: "Black (Deceased)", color: "bg-gray-800" },
]

export default function CasualtyListPage() {
  const router = useRouter()

  // State
  const [casualtyRecords, setCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [filteredCasualtyRecords, setFilteredCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const recordsPerPage = 10

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [casualtyToDelete, setCasualtyToDelete] = useState<{ patientId: string; id: string } | null>(null)

  // Fetch all casualty records from the new structure
  useEffect(() => {
    setIsLoading(true)
    const casualtyRef = ref(db, "patients/casualtydetail")
    const unsubscribe = onValue(casualtyRef, (snapshot) => {
      const data = snapshot.val() || {}
      const allRecords: CasualtyRecord[] = []

      // Iterate through patient UHIDs
      Object.entries(data).forEach(([uhid, patientCasualties]: any) => {
        if (patientCasualties) {
          Object.entries(patientCasualties).forEach(([casualtyId, casualtyData]: any) => {
            allRecords.push({
              id: casualtyId,
              patientId: uhid,
              name: casualtyData.name,
              phone: casualtyData.phone,
              age: casualtyData.age,
              gender: casualtyData.gender,
              date: casualtyData.date,
              time: casualtyData.time,
              caseType: casualtyData.caseType,
              otherCaseType: casualtyData.otherCaseType,
              triageCategory: casualtyData.triageCategory,
              modeOfArrival: casualtyData.modeOfArrival,
              isMLC: casualtyData.isMLC,
              mlcNumber: casualtyData.mlcNumber,
              createdAt: casualtyData.createdAt,
              status: casualtyData.status || "active",
            })
          })
        }
      })

      // Sort by createdAt descending
      allRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setCasualtyRecords(allRecords)
      setFilteredCasualtyRecords(allRecords)
      setIsLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Filter and search
  useEffect(() => {
    let filtered = [...casualtyRecords]
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.phone.includes(q) || (r.mlcNumber?.toLowerCase().includes(q) ?? false),
      )
    }
    setFilteredCasualtyRecords(filtered)
    setCurrentPage(1)
  }, [searchQuery, statusFilter, casualtyRecords])

  // Delete casualty record
  const handleDeleteCasualty = async () => {
    if (!casualtyToDelete) return
    const { patientId, id } = casualtyToDelete
    try {
      await remove(ref(db, `patients/casualtydetail/${patientId}/${id}`))
      toast.success("Casualty record deleted")
    } catch {
      toast.error("Delete failed")
    } finally {
      setDeleteDialogOpen(false)
      setCasualtyToDelete(null)
    }
  }

  // View casualty details
  const handleViewDetails = (record: CasualtyRecord) => {
    router.push(`/casulity/detail?uhid=${record.patientId}&casualtyId=${record.id}`)
  }

  // Pagination
  const indexOfLast = currentPage * recordsPerPage
  const indexOfFirst = indexOfLast - recordsPerPage
  const current = filteredCasualtyRecords.slice(indexOfFirst, indexOfLast)
  const totalPages = Math.ceil(filteredCasualtyRecords.length / recordsPerPage)
  const paginate = (n: number) => setCurrentPage(n)

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-6xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-t-lg">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-8 w-8" />
                    Casualty Records
                  </CardTitle>
                  <CardDescription className="text-red-100">Manage and view all casualty cases</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/casualty/booking")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Registration
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/dashboard")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeftIcon className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Search & Filters */}
              <div className="flex flex-col md:flex-row justify-between mb-4 gap-4">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by name, phone, or MLC number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cases</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                    <SelectItem value="deceased">Deceased</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table / Loading / Empty */}
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded" />
                  ))}
                </div>
              ) : filteredCasualtyRecords.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    No casualty records found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {searchQuery ? "Try adjusting your search criteria" : "Start by registering a new casualty case"}
                  </p>
                  <Button onClick={() => router.push("/casualty/booking")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Register New Casualty
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Case Type</TableHead>
                          <TableHead>Triage</TableHead>
                          <TableHead>MLC</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {current.map((record) => {
                          const triageOption = TriageCategoryOptions.find((t) => t.value === record.triageCategory)
                          const caseTypeOption = CaseTypeOptions.find((c) => c.value === record.caseType)

                          return (
                            <TableRow key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <TableCell>
                                <div>
                                  <div className="font-medium">{record.name}</div>
                                  <div className="text-sm text-gray-500">{record.phone}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div>{new Date(record.date).toLocaleDateString()}</div>
                                  <div className="text-sm text-gray-500">{record.time}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {record.caseType === "other" ? record.otherCaseType : caseTypeOption?.label}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={`${triageOption?.color} text-white`}>{triageOption?.label}</Badge>
                              </TableCell>
                              <TableCell>
                                {record.isMLC ? (
                                  <div>
                                    <Badge variant="destructive" className="text-xs">
                                      MLC
                                    </Badge>
                                    {record.mlcNumber && (
                                      <div className="text-xs text-gray-500 mt-1">{record.mlcNumber}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">No</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    record.status === "active"
                                      ? "default"
                                      : record.status === "discharged"
                                        ? "outline"
                                        : record.status === "transferred"
                                          ? "secondary"
                                          : "destructive"
                                  }
                                >
                                  {record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : 'Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewDetails(record)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                  >
                                    <Info className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCasualtyToDelete({ patientId: record.patientId, id: record.id })
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center mt-6 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ArrowLeftIcon className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Page {currentPage} of {totalPages} ({filteredCasualtyRecords.length} total records)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ArrowRightIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Casualty Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this casualty record? This action cannot be undone and will permanently
              remove all associated data including payments and services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCasualty} className="bg-red-500 hover:bg-red-600">
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
