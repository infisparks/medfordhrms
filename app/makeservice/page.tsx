"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { ref, push, onValue, update, remove } from "firebase/database"
import { db } from "@/lib/firebase"
import { toast } from "react-toastify"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export interface ServiceFormInput {
  serviceName: string
  amount: number
}

interface ServiceItem {
  id: string
  serviceName: string
  amount: number
  createdAt: string
  // optionally updatedAt?: string
}

export default function ServiceManagement() {
  // Form for adding a service
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ServiceFormInput>({
    defaultValues: {
      serviceName: "",
      amount: 0,
    },
  })
  const [loading, setLoading] = useState(false)

  // State for list of services
  const [services, setServices] = useState<ServiceItem[]>([])
  // Search term state
  const [searchTerm, setSearchTerm] = useState("")

  // For editing a service
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceItem | null>(null)
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<ServiceFormInput>({
    defaultValues: {
      serviceName: "",
      amount: 0,
    },
  })

  // Listen to service list changes
  useEffect(() => {
    const servicesRef = ref(db, "service")
    const unsubscribe = onValue(servicesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        const servicesList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))
        setServices(servicesList)
      } else {
        setServices([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Add a new service
  const onSubmit = async (data: ServiceFormInput) => {
    setLoading(true)
    try {
      const serviceRef = ref(db, "service")
      await push(serviceRef, {
        serviceName: data.serviceName,
        amount: data.amount,
        createdAt: new Date().toISOString(),
      })
      toast.success("Service added successfully!")
      reset()
    } catch (error) {
      console.error("Error adding service:", error)
      toast.error("Error adding service.")
    } finally {
      setLoading(false)
    }
  }

  // Open edit modal for a specific service
  const handleEdit = (service: ServiceItem) => {
    setEditingService(service)
    resetEdit({
      serviceName: service.serviceName,
      amount: service.amount,
    })
    setIsEditModalOpen(true)
  }

  // Update service record
  const onEditSubmit = async (data: ServiceFormInput) => {
    if (!editingService) return
    try {
      const serviceRef = ref(db, `service/${editingService.id}`)
      await update(serviceRef, {
        serviceName: data.serviceName,
        amount: data.amount,
        updatedAt: new Date().toISOString(),
      })
      toast.success("Service updated successfully!")
      setIsEditModalOpen(false)
      setEditingService(null)
    } catch (error) {
      console.error("Error updating service:", error)
      toast.error("Error updating service.")
    }
  }

  // Delete a service record
  const handleDelete = async (serviceId: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return
    try {
      await remove(ref(db, `service/${serviceId}`))
      toast.success("Service deleted successfully!")
    } catch (error) {
      console.error("Error deleting service:", error)
      toast.error("Error deleting service.")
    }
  }

  // Filter services based on search term
  const filteredServices = services.filter((service) =>
    service.serviceName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      {/* Add Service Form */}
      <Card className="max-w-md mx-auto shadow-lg border-slate-200">
        <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
          <CardTitle className="text-2xl font-bold">Add Service</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="serviceName" className="text-sm font-medium">
                Service Name
              </Label>
              <Input
                id="serviceName"
                {...register("serviceName", { required: true })}
                placeholder="Enter service name"
                className="mt-1"
              />
              {errors.serviceName && (
                <p className="text-xs text-red-500">Service name is required</p>
              )}
            </div>

            <div>
              <Label htmlFor="amount" className="text-sm font-medium">
                Amount
              </Label>
              <Input
                id="amount"
                type="number"
                {...register("amount", { required: true, valueAsNumber: true })}
                placeholder="Enter amount"
                className="mt-1"
              />
              {errors.amount && (
                <p className="text-xs text-red-500">Amount is required</p>
              )}
            </div>

            <Separator />

            <CardFooter className="flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
              >
                {loading ? "Saving..." : "Save Service"}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      {/* Service List */}
      <div className="mt-8 max-w-4xl mx-auto">
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="bg-gray-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xl font-semibold">Service List</CardTitle>
            <div className="w-full sm:w-auto">
              <Input
                type="text"
                placeholder="Search service name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            {filteredServices.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-200 text-left">
                    <th className="px-4 py-2">Service Name</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((service) => (
                    <tr
                      key={service.id}
                      className="border-b hover:bg-gray-50 last:border-0"
                    >
                      <td className="px-4 py-2">{service.serviceName}</td>
                      <td className="px-4 py-2">{service.amount}</td>
                      <td className="px-4 py-2 space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleEdit(service)}
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(service.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-center py-4">No services found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Service Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Service</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="editServiceName" className="text-sm font-medium">
                Service Name
              </Label>
              <Input
                id="editServiceName"
                {...registerEdit("serviceName", { required: true })}
                placeholder="Service Name"
                className="mt-1"
              />
              {editErrors.serviceName && (
                <p className="text-xs text-red-500">Service name is required</p>
              )}
            </div>
            <div>
              <Label htmlFor="editAmount" className="text-sm font-medium">
                Amount
              </Label>
              <Input
                id="editAmount"
                type="number"
                {...registerEdit("amount", { required: true, valueAsNumber: true })}
                placeholder="Amount"
                className="mt-1"
              />
              {editErrors.amount && (
                <p className="text-xs text-red-500">Amount is required</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false)
                 	setEditingService(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
