"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useForm, type SubmitHandler, Controller } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import type { ObjectSchema } from "yup"
import { db } from "../../lib/firebase"
import { ref, push, update, onValue, remove } from "firebase/database"
import Head from "next/head"
import { PlusCircle, Edit, Trash2, User, Info, Search, X, AlertCircle } from "lucide-react"
import { BedIcon, DoorOpen } from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import Select from "react-select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

// Define the shape of your form inputs
interface BedFormInput {
  roomType: { label: string; value: string } | null
  bedNumber: string
  type: string
  status: { label: string; value: string } | null
}

// Define the validation schema using Yup
const bedSchema: ObjectSchema<BedFormInput> = yup
  .object({
    roomType: yup
      .object({
        label: yup.string().required(),
        value: yup.string().required(),
      })
      .nullable()
      .required("Room Type is required"),
    bedNumber: yup.string().required("Bed Number is required"),
    type: yup.string().required("Bed Type is required"),
    status: yup
      .object({
        label: yup.string().required(),
        value: yup.string().required(),
      })
      .nullable()
      .required("Status is required"),
  })
  .required()

  const RoomTypeOptions = [
    { value: "casualty", label: "Casualty" },
    { value: "icu", label: "ICU" },
    { value: "suit", label: "Suite" },        // corrected from "suit" to "suite"
    { value: "female", label: "Female" },
    { value: "delux", label: "Delux" },
    { value: "jade", label: "Jade" },
    { value: "citrine", label: "Citrine" },
    { value: "male", label: "Male" },
    { value: "nicu", label: "NICU" },
  ];
  

const StatusOptions = [
  { value: "Available", label: "Available" },
  { value: "Occupied", label: "Occupied" },
  { value: "Maintenance", label: "Under Maintenance" },
  { value: "Reserved", label: "Reserved" },
]

interface Bed {
  id: string
  bedNumber: string
  type: string
  status: string
}

interface RoomType {
  roomName: string
  roomKey: string
  beds: Bed[]
}

const customSelectStyles = {
  control: (provided: any, state: any) => ({
    ...provided,
    borderColor: state.isFocused ? "#0d9488" : provided.borderColor,
    boxShadow: state.isFocused ? "0 0 0 1px #0d9488" : provided.boxShadow,
    "&:hover": {
      borderColor: state.isFocused ? "#0d9488" : "#d1d5db",
    },
    padding: "2px",
    borderRadius: "0.5rem",
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected ? "#0d9488" : state.isFocused ? "#e6fffa" : null,
    color: state.isSelected ? "white" : "#374151",
    "&:active": {
      backgroundColor: "#0d9488",
    },
  }),
}

const BedManagementPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,

  } = useForm<BedFormInput>({
    resolver: yupResolver(bedSchema),
    defaultValues: {
      roomType: null,
      bedNumber: "",
      type: "",
      status: null,
    },
  })

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(false)
  const [editingBed, setEditingBed] = useState<{ roomType: string; bedId: string; data: Bed } | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [bedToDelete, setBedToDelete] = useState<{ roomType: string; bedId: string } | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
    reserved: 0,
  })

  // Fetch beds from Firebase
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const roomTypesList: RoomType[] = Object.keys(data).map((roomKey) => ({
          roomName: roomKey.replace("_", " ").replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase()),
          roomKey: roomKey,
          beds: Object.keys(data[roomKey]).map((bedKey) => ({
            id: bedKey,
            bedNumber: data[roomKey][bedKey].bedNumber,
            type: data[roomKey][bedKey].type,
            status: data[roomKey][bedKey].status,
          })),
        }))
        setRoomTypes(roomTypesList)

        // Calculate stats
        let totalBeds = 0
        let availableBeds = 0
        let occupiedBeds = 0
        let maintenanceBeds = 0
        let reservedBeds = 0

        roomTypesList.forEach((room) => {
          room.beds.forEach((bed) => {
            totalBeds++
            if (bed.status === "Available") availableBeds++
            else if (bed.status === "Occupied") occupiedBeds++
            else if (bed.status === "Maintenance") maintenanceBeds++
            else if (bed.status === "Reserved") reservedBeds++
          })
        })

        setStats({
          total: totalBeds,
          available: availableBeds,
          occupied: occupiedBeds,
          maintenance: maintenanceBeds,
          reserved: reservedBeds,
        })
      } else {
        setRoomTypes([])
        setStats({
          total: 0,
          available: 0,
          occupied: 0,
          maintenance: 0,
          reserved: 0,
        })
      }
    })

    return () => unsubscribe()
  }, [])

  const onSubmit: SubmitHandler<BedFormInput> = async (data) => {
    setLoading(true)
    try {
      if (editingBed) {
        // Update existing bed
        const bedRef = ref(db, `beds/${editingBed.roomType}/${editingBed.bedId}`)
        await update(bedRef, {
          bedNumber: data.bedNumber,
          type: data.type,
          status: data.status?.value,
        })
        toast.success("Bed updated successfully!", {
          position: "top-right",
          autoClose: 3000,
        })
        setEditingBed(null)
      } else {
        // Add new bed
        if (data.roomType) {
          const bedsRef = ref(db, `beds/${data.roomType.value}`)
          const newBedRef = push(bedsRef)
          await update(newBedRef, {
            bedNumber: data.bedNumber,
            type: data.type,
            status: data.status?.value,
          })
          toast.success("Bed added successfully!", {
            position: "top-right",
            autoClose: 3000,
          })
        }
      }
      reset({
        roomType: null,
        bedNumber: "",
        type: "",
        status: null,
      })
      setIsFormOpen(false)
    } catch (error) {
      console.error("Error managing bed:", error)
      toast.error("Failed to manage bed. Please try again.", {
        position: "top-right",
        autoClose: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (roomType: string, bed: Bed) => {
    setEditingBed({ roomType, bedId: bed.id, data: bed })
    reset({
      roomType: RoomTypeOptions.find((rt) => rt.value === roomType) || null,
      bedNumber: bed.bedNumber,
      type: bed.type,
      status: StatusOptions.find((status) => status.value === bed.status) || null,
    })
    setIsFormOpen(true)
  }

  const openDeleteDialog = (roomType: string, bedId: string) => {
    setBedToDelete({ roomType, bedId })
    setIsDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!bedToDelete) return

    try {
      const bedRef = ref(db, `beds/${bedToDelete.roomType}/${bedToDelete.bedId}`)
      await remove(bedRef)
      toast.success("Bed deleted successfully!", {
        position: "top-right",
        autoClose: 3000,
      })
    } catch (error) {
      console.error("Error deleting bed:", error)
      toast.error("Failed to delete bed. Please try again.", {
        position: "top-right",
        autoClose: 3000,
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setBedToDelete(null)
    }
  }

  const openAddForm = () => {
    setEditingBed(null)
    reset({
      roomType: null,
      bedNumber: "",
      type: "",
      status: null,
    })
    setIsFormOpen(true)
  }

  const lowerSearch = searchTerm.toLowerCase();

  const filteredRoomTypes = roomTypes
    .map((room) => ({
      ...room,
      beds: room.beds.filter((bed) => {
        // safe lowercase values
        const bedNumber = bed.bedNumber?.toLowerCase() || "";
        const bedType   = bed.type?.toLowerCase()       || "";
        const roomName  = room.roomName.toLowerCase();
  
        // search match
        const matchesSearch =
          bedNumber.includes(lowerSearch) ||
          bedType.includes(lowerSearch)   ||
          roomName.includes(lowerSearch);
  
        // tab filter
        const matchesTab =
          activeTab === "all" ||
          (activeTab === "available"   && bed.status === "Available")   ||
          (activeTab === "occupied"    && bed.status === "Occupied")    ||
          (activeTab === "maintenance" && bed.status === "Maintenance") ||
          (activeTab === "reserved"    && bed.status === "Reserved");
  
        return matchesSearch && matchesTab;
      }),
    }))
    .filter((room) => room.beds.length > 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available":
        return "bg-green-100 text-green-800 border-green-300"
      case "Occupied":
        return "bg-red-100 text-red-800 border-red-300"
      case "Maintenance":
        return "bg-amber-100 text-amber-800 border-amber-300"
      case "Reserved":
        return "bg-blue-100 text-blue-800 border-blue-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  return (
    <>
      <Head>
        <title>IPD Bed Management</title>
        <meta name="description" content="Add and manage beds for IPD admissions" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex flex-col items-center justify-start p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-teal-800">IPD Bed Management</h1>
              <p className="text-teal-600 mt-1">Manage and monitor all hospital beds</p>
            </div>
            <Button onClick={openAddForm} className="mt-4 md:mt-0 bg-teal-600 hover:bg-teal-700">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add New Bed
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-gray-500">Total Beds</p>
                <h3 className="text-3xl font-bold text-gray-700 mt-1">{stats.total}</h3>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-green-600">Available</p>
                <h3 className="text-3xl font-bold text-green-700 mt-1">{stats.available}</h3>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-red-600">Occupied</p>
                <h3 className="text-3xl font-bold text-red-700 mt-1">{stats.occupied}</h3>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-amber-600">Maintenance</p>
                <h3 className="text-3xl font-bold text-amber-700 mt-1">{stats.maintenance}</h3>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-blue-600">Reserved</p>
                <h3 className="text-3xl font-bold text-blue-700 mt-1">{stats.reserved}</h3>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filter */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search beds by number, type or room..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                <TabsList className="grid grid-cols-5 w-full md:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="available" className="text-green-600">
                    Available
                  </TabsTrigger>
                  <TabsTrigger value="occupied" className="text-red-600">
                    Occupied
                  </TabsTrigger>
                  <TabsTrigger value="maintenance" className="text-amber-600">
                    Maintenance
                  </TabsTrigger>
                  <TabsTrigger value="reserved" className="text-blue-600">
                    Reserved
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Existing Beds - Room Layout */}
          <div className="space-y-6">
            {filteredRoomTypes.length === 0 ? (
              <Card>
                <CardContent className="p-8 flex flex-col items-center justify-center">
                  <AlertCircle className="h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-xl font-medium text-gray-700">No beds found</h3>
                  <p className="text-gray-500 mt-1">
                    {searchTerm ? "Try adjusting your search term" : "Add beds to get started"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredRoomTypes.map((room, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardHeader className="bg-teal-50 py-4">
                    <div className="flex items-center">
                      <DoorOpen className="h-5 w-5 text-teal-600 mr-2" />
                      <CardTitle className="text-teal-800">{room.roomName}</CardTitle>
                      <Badge variant="outline" className="ml-3 bg-teal-100 text-teal-800 border-teal-200">
                        {room.beds.length} {room.beds.length === 1 ? "Bed" : "Beds"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {room.beds.map((bed, bedIndex) => (
                        <div
                          key={bedIndex}
                          className="relative flex flex-col p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center">
                              <BedIcon
                                className={`h-5 w-5 ${bed.status === "Available" ? "text-green-500" : bed.status === "Occupied" ? "text-red-500" : bed.status === "Maintenance" ? "text-amber-500" : "text-blue-500"}`}
                              />
                              <span className="ml-2 font-semibold text-gray-800">{bed.bedNumber}</span>
                            </div>
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleEdit(room.roomKey, bed)}
                                className="text-gray-400 hover:text-teal-600 transition-colors p-1 rounded-full hover:bg-teal-50"
                                title="Edit bed"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openDeleteDialog(room.roomKey, bed.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-red-50"
                                title="Delete bed"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">Type: {bed.type}</div>
                          <div className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(bed.status)}`}>
                            {bed.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Add/Edit Bed Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBed ? "Edit Bed" : "Add New Bed"}</DialogTitle>
            <DialogDescription>
              {editingBed ? "Update the bed information below." : "Fill in the details to add a new bed to the system."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Room Type Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Room Type</label>
              <Controller
                control={control}
                name="roomType"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={RoomTypeOptions}
                    placeholder="Select Room Type"
                    styles={customSelectStyles}
                    isDisabled={!!editingBed} // Disable room type selection when editing
                    onChange={(value) => field.onChange(value)}
                    value={field.value || null}
                  />
                )}
              />
              {errors.roomType && <p className="text-sm text-red-500">{errors.roomType.message}</p>}
            </div>

            {/* Bed Number Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Bed Number</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  {...register("bedNumber")}
                  placeholder="e.g., B101"
                  className={`pl-10 ${errors.bedNumber ? "border-red-500" : ""}`}
                />
              </div>
              {errors.bedNumber && <p className="text-sm text-red-500">{errors.bedNumber.message}</p>}
            </div>

            {/* Bed Type Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Bed Type</label>
              <div className="relative">
                <Info className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  {...register("type")}
                  placeholder="e.g., Standard, ICU, Electric"
                  className={`pl-10 ${errors.type ? "border-red-500" : ""}`}
                />
              </div>
              {errors.type && <p className="text-sm text-red-500">{errors.type.message}</p>}
            </div>

            {/* Status Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={StatusOptions}
                    placeholder="Select Status"
                    styles={customSelectStyles}
                    onChange={(value) => field.onChange(value)}
                    value={field.value || null}
                  />
                )}
              />
              {errors.status && <p className="text-sm text-red-500">{errors.status.message}</p>}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                {loading ? "Processing..." : editingBed ? "Update Bed" : "Add Bed"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the bed from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default BedManagementPage

