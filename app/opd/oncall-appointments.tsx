"use client"

import { useState, useEffect } from "react"
import { OnCallAppointment, Doctor } from "./types"
import { MagnifyingGlassIcon, Cross2Icon  } from "@radix-ui/react-icons"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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

interface OnCallAppointmentsProps {
  appointments: OnCallAppointment[]
  doctors: Doctor[]
  onDeleteAppointment: (id: string) => void
  onBookOPDVisit: (appointment: OnCallAppointment) => void
  onBookOnCall: () => void
}

export function OnCallAppointments({
  appointments,
  doctors,
  onDeleteAppointment,
  onBookOPDVisit,
  onBookOnCall,
}: OnCallAppointmentsProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredAppointments, setFilteredAppointments] = useState<OnCallAppointment[]>(appointments)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredAppointments(appointments)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = appointments.filter(
        (appointment) =>
          appointment.name.toLowerCase().includes(query) ||
          appointment.phone.includes(query)
      )
      setFilteredAppointments(filtered)
    }
  }, [searchQuery, appointments])

  const handleDeleteClick = (id: string) => {
    setAppointmentToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (appointmentToDelete) {
      onDeleteAppointment(appointmentToDelete)
      setAppointmentToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
          On-Call Appointments
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setSearchQuery("")}
              >
                <Cross2Icon className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            onClick={onBookOnCall}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Book On-Call
          </Button>
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery ? "No matching appointments found" : "No on-call appointments found"}
        </div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="overflow-hidden">
                <CardHeader className="bg-emerald-50 dark:bg-gray-800 p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg">{appointment.name}</CardTitle>
                      <CardDescription>
                        {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                      </CardDescription>
                    </div>
                    <Badge>On-Call</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="font-medium">Phone:</div>
                    <div>{appointment.phone}</div>

                    <div className="font-medium">Age:</div>
                    <div>{appointment.age}</div>

                    <div className="font-medium">Gender:</div>
                    <div>{appointment.gender}</div>

                    {appointment.serviceName && (
                      <>
                        <div className="font-medium">Service:</div>
                        <div>{appointment.serviceName}</div>
                      </>
                    )}

                    {appointment.modality && (
                      <>
                        <div className="font-medium">Modality:</div>
                        <div className="capitalize">{appointment.modality}</div>
                      </>
                    )}

                    {appointment.visitType && (
                      <>
                        <div className="font-medium">Visit Type:</div>
                        <div className="capitalize">{appointment.visitType}</div>
                      </>
                    )}

                    {appointment.study && (
                      <>
                        <div className="font-medium">Study:</div>
                        <div>{appointment.study}</div>
                      </>
                    )}

                    {appointment.doctor && (
                      <>
                        <div className="font-medium">Doctor:</div>
                        <div>
                          {doctors.find((d) => d.id === appointment.doctor)?.name || appointment.doctor}
                        </div>
                      </>
                    )}

                    <div className="font-medium">Created:</div>
                    <div>{new Date(appointment.createdAt).toLocaleString()}</div>
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteClick(appointment.id)}
                  >
                    <Cross2Icon className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onBookOPDVisit(appointment)}
                  >
                    Book OPD Visit
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this on-call appointment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
