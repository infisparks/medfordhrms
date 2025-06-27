"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { ArrowLeft, User, Edit3, Search, Eye, Clock, Bed } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import type React from "react"

interface IPDChangeRecord {
  id: string
  type: "edit"
  ipdId: string
  patientId: string
  patientName: string
  changes: Array<{ field: string; oldValue: any; newValue: any }>
  editedBy: string
  editedAt: string
}

const IPDChangesPage: React.FC = () => {
  const router = useRouter()
  const [changes, setChanges] = useState<IPDChangeRecord[]>([])
  const [filteredChanges, setFilteredChanges] = useState<IPDChangeRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChange, setSelectedChange] = useState<IPDChangeRecord | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  // Fetch changes from Firebase
  useEffect(() => {
    const changesRef = ref(db, "ipdChanges")
    const unsubscribe = onValue(changesRef, (snapshot) => {
      const data = snapshot.val()
      const changesList: IPDChangeRecord[] = []

      if (data) {
        Object.keys(data).forEach((key) => {
          const change = data[key]
          changesList.push({
            id: key,
            type: change.type,
            ipdId: change.ipdId,
            patientId: change.patientId,
            patientName: change.patientName,
            changes: change.changes || [],
            editedBy: change.editedBy,
            editedAt: change.editedAt,
          })
        })
      }

      // Sort by date (latest first)
      changesList.sort((a, b) => {
        const dateA = new Date(a.editedAt).getTime()
        const dateB = new Date(b.editedAt).getTime()
        return dateB - dateA
      })

      setChanges(changesList)
      setFilteredChanges(changesList)
    })

    return () => unsubscribe()
  }, [])

  // Filter changes based on search
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredChanges(changes)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = changes.filter(
        (change) =>
          change.patientName.toLowerCase().includes(query) ||
          change.ipdId.toLowerCase().includes(query) ||
          change.editedBy.toLowerCase().includes(query),
      )
      setFilteredChanges(filtered)
    }
  }, [searchQuery, changes])

  const handleViewDetails = (change: IPDChangeRecord) => {
    setSelectedChange(change)
    setDetailDialogOpen(true)
  }

  const formatFieldName = (field: string) => {
    const fieldNames: { [key: string]: string } = {
      name: "Patient Name",
      phone: "Phone Number",
      gender: "Gender",
      age: "Age",
      address: "Address",
      relativeName: "Relative Name",
      relativePhone: "Relative Phone",
      relativeAddress: "Relative Address",
      date: "Admission Date",
      time: "Admission Time",
      roomType: "Room Type",
      bed: "Bed",
      doctor: "Doctor",
      referDoctor: "Referral Doctor",
      admissionType: "Admission Type",
    }
    return fieldNames[field] || field
  }

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === "") {
      return "Not set"
    }
    if (typeof value === "string" && value.includes("T")) {
      // Likely a date string
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return value
      }
    }
    return String(value)
  }

  const getRoomTypeLabel = (value: string) => {
    const roomTypes: { [key: string]: string } = {
      female_ward: "Female Ward",
      icu: "ICU",
      male_ward: "Male Ward",
      deluxe: "Deluxe",
      nicu: "NICU",
    }
    return roomTypes[value] || value
  }

  const getAdmissionTypeLabel = (value: string) => {
    const admissionTypes: { [key: string]: string } = {
      general: "General",
      surgery: "Surgery",
      accident_emergency: "Accident/Emergency",
      day_observation: "Day Observation",
    }
    return admissionTypes[value] || value
  }

  const formatDisplayValue = (field: string, value: any) => {
    if (field === "roomType") {
      return getRoomTypeLabel(value)
    }
    if (field === "admissionType") {
      return getAdmissionTypeLabel(value)
    }
    if (field === "gender") {
      return value.charAt(0).toUpperCase() + value.slice(1)
    }
    return formatValue(value)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-7xl mx-auto shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold">IPD Changes History</CardTitle>
                <CardDescription className="text-purple-100">
                  Track all edits and modifications in the IPD system
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/billing")}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Billing
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Search Section */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by patient name, IPD ID, or user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-gray-600">Total: {filteredChanges.length} changes</div>
              </div>
            </div>

            {/* Changes List */}
            {filteredChanges.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? "No matching changes found" : "No changes recorded yet"}
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {filteredChanges.map((change) => (
                    <Card
                      key={change.id}
                      className="overflow-hidden hover:shadow-md transition-shadow bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
                    >
                      <CardHeader className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">{change.patientName}</CardTitle>
                              <Badge variant="default" className="flex items-center gap-1">
                                <Edit3 className="h-3 w-3" />
                                EDIT
                              </Badge>
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Bed className="h-3 w-3" />
                                IPD
                              </Badge>
                            </div>
                            <CardDescription className="flex items-center gap-4 text-sm">
                              <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {change.editedBy}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {new Date(change.editedAt).toLocaleString()}
                              </span>
                              <span className="text-xs text-gray-500">ID: {change.ipdId.slice(-8)}</span>
                            </CardDescription>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(change)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 pt-0">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Fields Changed: {change.changes.length}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {change.changes.slice(0, 6).map((fieldChange, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {formatFieldName(fieldChange.field)}
                              </Badge>
                            ))}
                            {change.changes.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{change.changes.length - 6} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-blue-500" />
              IPD Edit Details
            </DialogTitle>
            <DialogDescription>Changes made to {selectedChange?.patientName} s IPD record</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-500">Patient Name</div>
                <div className="text-lg">{selectedChange?.patientName}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">IPD ID</div>
                <div className="text-lg font-mono">{selectedChange?.ipdId}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Edited By</div>
                <div className="text-lg">{selectedChange?.editedBy}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Edit Date</div>
                <div className="text-lg">{new Date(selectedChange?.editedAt || "").toLocaleString()}</div>
              </div>
            </div>

            {/* Field Changes */}
            {selectedChange?.changes && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Field Changes</h3>
                <div className="space-y-4">
                  {selectedChange.changes.map((change, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="font-medium text-blue-600 mb-2">{formatFieldName(change.field)}</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-500 mb-1">Previous Value</div>
                          <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm">
                            {formatDisplayValue(change.field, change.oldValue)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500 mb-1">New Value</div>
                          <div className="p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-sm">
                            {formatDisplayValue(change.field, change.newValue)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default IPDChangesPage
