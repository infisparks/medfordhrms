"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { db } from "../../lib/firebase"
import { ref, push, update, onValue, remove } from "firebase/database"
import Head from "next/head"
import { AiOutlineDelete, AiOutlineEdit } from "react-icons/ai"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

// IPD charges interface; keys = room types from DB
interface IIPDCharges {
  [key: string]: number
}

// MODIFICATION: Form input interface now includes an array for specialists
interface IDoctorFormInput {
  name: string
  specialist: string[] // Changed to an array of strings
  department: "OPD" | "IPD" | "Both"
  firstVisitCharge?: number
  followUpCharge?: number
  ipdCharges?: IIPDCharges
}

// MODIFICATION: Doctor interface for Firebase now includes an array for specialists
interface IDoctor {
  id: string
  name: string
  specialist: string[] // Changed to an array of strings
  department: "OPD" | "IPD" | "Both"
  firstVisitCharge?: number
  followUpCharge?: number
  ipdCharges?: IIPDCharges
}

const AdminDoctorsPage: React.FC = () => {
  // ---------------------------------------------------------------------------
  // 1) Fetch dynamic roomTypes from "beds" in Firebase
  // ---------------------------------------------------------------------------
  const [roomTypes, setRoomTypes] = useState<string[]>([])
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribeBeds = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const rooms = Object.keys(data)
        setRoomTypes(rooms)
      } else {
        setRoomTypes([])
      }
    })
    return () => unsubscribeBeds()
  }, [])

  // ---------------------------------------------------------------------------
  // 2) Build a lazy schema for IPD charges dynamically
  // ---------------------------------------------------------------------------
  const dynamicIPDChargesSchema = useMemo(() => {
    return yup.lazy(() => {
      if (!roomTypes.length) {
        return yup.object({})
      }
      const shape: Record<string, yup.NumberSchema> = {}
      roomTypes.forEach((room) => {
        shape[room] = yup
          .number()
          .typeError("Must be a number")
          .positive("Must be positive")
          .required(`${room} charge is required`)
      })
      return yup.object().shape(shape)
    })
  }, [roomTypes])

  // ---------------------------------------------------------------------------
  // 3) Our main Yup schema with function-style .when() calls
  // ---------------------------------------------------------------------------
  const schema = useMemo(() => {
    return yup.object({
      name: yup.string().required("Doctor name is required"),
      // MODIFICATION: Yup schema now validates an array of specialists
      specialist: yup
        .array()
        .of(yup.string().required())
        .min(1, "At least one specialist is required")
        .required("Specialist is required"),
      department: yup
        .mixed<"OPD" | "IPD" | "Both">()
        .oneOf(["OPD", "IPD", "Both"], "Select a valid department")
        .required("Department is required"),
      firstVisitCharge: yup.number().when("department", ([dept], schema) => {
        if (dept === "OPD" || dept === "Both") {
          return schema
            .typeError("First visit amount must be a number")
            .positive("First visit amount must be positive")
            .required("First visit amount is required")
        }
        return schema.notRequired()
      }),
      followUpCharge: yup.number().when("department", ([dept], schema) => {
        if (dept === "OPD" || dept === "Both") {
          return schema
            .typeError("Follow-up amount must be a number")
            .positive("Follow-up amount must be positive")
            .required("Follow-up amount is required")
        }
        return schema.notRequired()
      }),
      ipdCharges: yup.mixed().when("department", ([dept], schema) => {
        if (dept === "IPD" || dept === "Both") {
          return dynamicIPDChargesSchema
        }
        return schema.notRequired()
      }),
    })
  }, [dynamicIPDChargesSchema])

  // ---------------------------------------------------------------------------
  // 4) useForm for Adding a Doctor
  // ---------------------------------------------------------------------------
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(schema),
    // MODIFICATION: Default values updated for specialist array
    defaultValues: {
      name: "",
      specialist: [],
      department: "OPD",
      firstVisitCharge: undefined,
      followUpCharge: undefined,
      ipdCharges: {},
    },
  })
  const departmentValue = watch("department")

  // ---------------------------------------------------------------------------
  // 5) useForm for Editing a Doctor
  // ---------------------------------------------------------------------------
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    reset: resetEdit,
    watch: watchEdit,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(schema),
    // MODIFICATION: Default values updated for specialist array
    defaultValues: {
      name: "",
      specialist: [],
      department: "OPD",
      firstVisitCharge: undefined,
      followUpCharge: undefined,
      ipdCharges: {},
    },
  })
  const departmentValueEdit = watchEdit("department")

  // ---------------------------------------------------------------------------
  // Local states: doctors, loading, modals
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(false)
  const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [currentDoctor, setCurrentDoctor] = useState<IDoctor | null>(null)

  // ---------------------------------------------------------------------------
  // 6) Fetch doctors from Firebase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        // MODIFICATION: Mapping updated to handle specialist array
        const loadedDoctors: IDoctor[] = Object.keys(data).map((key) => ({
          id: key,
          name: data[key].name,
          specialist: data[key].specialist || [], // Ensure it's an array
          department: data[key].department,
          firstVisitCharge: data[key].firstVisitCharge,
          followUpCharge: data[key].followUpCharge,
          ipdCharges: data[key].ipdCharges,
        }))
        setDoctors(loadedDoctors)
      } else {
        setDoctors([])
      }
    })
    return () => unsubscribe()
  }, [])

  // ---------------------------------------------------------------------------
  // 7) Add Doctor
  // ---------------------------------------------------------------------------
  const onSubmit: SubmitHandler<IDoctorFormInput> = async (formData) => {
    setLoading(true)
    try {
      const doctorsRef = ref(db, "doctors")
      const newDoctorRef = push(doctorsRef)

      const newDoctor: IDoctor = {
        id: newDoctorRef.key || "",
        name: formData.name,
        specialist: formData.specialist,
        department: formData.department,
      }

      if (formData.department === "OPD" || formData.department === "Both") {
        newDoctor.firstVisitCharge = formData.firstVisitCharge
        newDoctor.followUpCharge = formData.followUpCharge
      }
      if (formData.department === "IPD" || formData.department === "Both") {
        newDoctor.ipdCharges = formData.ipdCharges
      }

      await update(newDoctorRef, newDoctor)

      toast.success("Doctor added successfully!", {
        position: "top-right",
        autoClose: 5000,
      })

      // MODIFICATION: Reset form with specialist array
      reset({
        name: "",
        specialist: [],
        department: "OPD",
        firstVisitCharge: undefined,
        followUpCharge: undefined,
        ipdCharges: {},
      })
    } catch (error) {
      console.error("Error adding doctor:", error)
      toast.error("Failed to add doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // 8) Delete Doctor
  // ---------------------------------------------------------------------------
  const handleDelete = async (doctorId: string) => {
    if (!confirm("Are you sure you want to delete this doctor?")) return
    try {
      const doctorRef = ref(db, `doctors/${doctorId}`)
      await remove(doctorRef)
      toast.success("Doctor deleted successfully!", {
        position: "top-right",
        autoClose: 5000,
      })
    } catch (error) {
      console.error("Error deleting doctor:", error)
      toast.error("Failed to delete doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // 9) Edit Doctor
  // ---------------------------------------------------------------------------
  const openEditModal = (doctor: IDoctor) => {
    setCurrentDoctor(doctor)
    setIsEditModalOpen(true)
  }

  const closeEditModal = () => {
    setCurrentDoctor(null)
    setIsEditModalOpen(false)
  }

  // Initialize form when a doc is chosen for edit
  useEffect(() => {
    if (currentDoctor) {
      // MODIFICATION: Reset edit form with specialist array
      resetEdit({
        name: currentDoctor.name,
        specialist: currentDoctor.specialist || [],
        department: currentDoctor.department,
        firstVisitCharge: currentDoctor.firstVisitCharge ?? undefined,
        followUpCharge: currentDoctor.followUpCharge ?? undefined,
        ipdCharges: currentDoctor.ipdCharges ?? {},
      })
    }
  }, [currentDoctor, resetEdit])

  // Submit the edited doc
  const onEditSubmit: SubmitHandler<IDoctorFormInput> = async (formData) => {
    if (!currentDoctor) return
    setLoading(true)
    try {
      const doctorRef = ref(db, `doctors/${currentDoctor.id}`)

      const updatedDoctor: Partial<IDoctor> = {
        name: formData.name,
        specialist: formData.specialist,
        department: formData.department,
      }

      if (formData.department === "OPD" || formData.department === "Both") {
        updatedDoctor.firstVisitCharge = formData.firstVisitCharge
        updatedDoctor.followUpCharge = formData.followUpCharge
      }
      if (formData.department === "IPD" || formData.department === "Both") {
        updatedDoctor.ipdCharges = formData.ipdCharges
      }
      if (formData.department === "IPD") {
        delete updatedDoctor.firstVisitCharge
        delete updatedDoctor.followUpCharge
      }
      if (formData.department === "OPD") {
        delete updatedDoctor.ipdCharges
      }

      await update(doctorRef, updatedDoctor)

      toast.success("Doctor updated successfully!", {
        position: "top-right",
        autoClose: 5000,
      })
      closeEditModal()
    } catch (error) {
      console.error("Error updating doctor:", error)
      toast.error("Failed to update doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Sample list of specialists
  const specialists = [
    "General Medicine",
    "Chest Physician",
    "Plastic Surgeon",
    "Cardiology",
    "Psychiatry",
    "Neuro-Physician",
    "Orthopedics",
    "General Surgery",
    "Dermatology",
    "Nephrology",
    "Pediatrics",
    "Gastroenterology",
    "Ophthalmology",
    "ENT",
    "Urology",
    "Onco - Physician",
    "Pediatric Surgery",
    "Physiotherapy",
    "Maxo-Facial Surgeon",
    "Anesthesiology",
    "Neuro - Surgery",
    "Onco - Surgeon",
    "Gynecology"
    
  ]

  // Function to prevent scroll wheel from changing number input values
  const preventWheelChange = (e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    (e.target as HTMLInputElement).blur();
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <>
      <Head>
        <title>Admin - Manage Doctors</title>
        <meta name="description" content="Add or remove doctors" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-yellow-100 to-yellow-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-yellow-600 mb-8">Manage Doctors</h2>

          {/* Add Doctor Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mb-10">
            {/* Doctor Name */}
            <div className="relative">
              <input
                type="text"
                {...register("name")}
                placeholder="Doctor Name"
                className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            {/* MODIFICATION: Specialist Multi-select */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Specialist (select one or more)</label>
              <select
                multiple
                {...register("specialist")}
                className={`w-full h-32 pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.specialist ? "border-red-500" : "border-gray-300"
                } transition duration-200 appearance-none bg-white`}
              >
                {specialists.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
              {errors.specialist && <p className="text-red-500 text-sm mt-1">{errors.specialist.message}</p>}
            </div>

            {/* Department */}
            <div className="relative">
              <select
                {...register("department")}
                className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.department ? "border-red-500" : "border-gray-300"
                } transition duration-200 appearance-none bg-white`}
              >
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
                <option value="Both">Both</option>
              </select>
              {errors.department && <p className="text-red-500 text-sm mt-1">{errors.department.message}</p>}
            </div>

            {/* MODIFICATION: Two separate inputs for OPD charges */}
            {(departmentValue === "OPD" || departmentValue === "Both") && (
              <>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    {...register("firstVisitCharge")}
                    placeholder="First Visit Charge (in Rs.)"
                    onWheel={preventWheelChange}
                    className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                      errors.firstVisitCharge ? "border-red-500" : "border-gray-300"
                    } transition duration-200`}
                  />
                  {errors.firstVisitCharge && <p className="text-red-500 text-sm mt-1">{errors.firstVisitCharge.message}</p>}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    {...register("followUpCharge")}
                    placeholder="Follow Up Charge (in Rs.)"
                    onWheel={preventWheelChange}
                    className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                      errors.followUpCharge ? "border-red-500" : "border-gray-300"
                    } transition duration-200`}
                  />
                  {errors.followUpCharge && <p className="text-red-500 text-sm mt-1">{errors.followUpCharge.message}</p>}
                </div>
              </>
            )}


            {/* IPD Charges */}
            {(departmentValue === "IPD" || departmentValue === "Both") && roomTypes.length > 0 && (
              <div className="border p-4 rounded-lg space-y-4">
                <p className="font-semibold text-gray-800">Enter IPD Ward Charges:</p>
                {roomTypes.map((room) => {
                  const roomError = errors.ipdCharges && (errors.ipdCharges as any)[room]
                  return (
                    <div key={room}>
                      <label className="block text-sm">{room.replace(/_/g, " ").toUpperCase()} Charge</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`ipdCharges.${room}` as const)}
                        placeholder={`${room} Charge`}
                        onWheel={preventWheelChange}
                        className={`w-full mt-1 pl-4 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                          roomError ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                      {roomError && <p className="text-red-500 text-sm mt-1">{roomError.message}</p>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Doctor"}
            </button>
          </form>

          {/* Existing Doctors */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-700 mb-4">Existing Doctors</h3>
            {doctors.length === 0 ? (
              <p className="text-gray-500">No doctors available.</p>
            ) : (
              <ul className="space-y-4">
                {doctors.map((doctor) => (
                  <li
                    key={doctor.id}
                    className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-lg font-medium">{doctor.name}</p>
                      {/* MODIFICATION: Display multiple specialists */}
                      <p className="text-gray-600">Specialist: {doctor.specialist.join(", ")}</p>
                      <p className="text-gray-600">Department: {doctor.department}</p>
                      {doctor.firstVisitCharge != null && <p className="text-gray-600">First Visit Charge: Rs {doctor.firstVisitCharge}</p>}
                      {doctor.followUpCharge != null && <p className="text-gray-600">Follow Up Charge: Rs {doctor.followUpCharge}</p>}
                      {doctor.ipdCharges && (
                        <div className="mt-2">
                          <p className="font-semibold">IPD Charges:</p>
                          <ul className="list-disc list-inside text-gray-600">
                            {Object.keys(doctor.ipdCharges).map((roomKey) => (
                              <li key={roomKey}>
                                {roomKey.replace(/_/g, " ").toUpperCase()}:{"  "}
                                {doctor.ipdCharges ? doctor.ipdCharges[roomKey] : "N/A"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2 mt-4 md:mt-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(doctor)}
                        className="flex items-center justify-center bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition duration-200"
                      >
                        <AiOutlineEdit size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doctor.id)}
                        className="flex items-center justify-center bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition duration-200"
                      >
                        <AiOutlineDelete size={20} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {isEditModalOpen && currentDoctor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-center text-blue-600 mb-6">Edit Doctor</h2>
              <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-6">
                {/* Doctor Name */}
                <div className="relative">
                  <input
                    type="text"
                    {...registerEdit("name")}
                    placeholder="Doctor Name"
                    className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.name ? "border-red-500" : "border-gray-300"
                    } transition duration-200`}
                  />
                  {errorsEdit.name && <p className="text-red-500 text-sm mt-1">{errorsEdit.name.message}</p>}
                </div>

                {/* MODIFICATION: Specialist Multi-select in Edit Modal */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialist (select one or more)</label>
                  <select
                    multiple
                    {...registerEdit("specialist")}
                    className={`w-full h-32 pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.specialist ? "border-red-500" : "border-gray-300"
                    } transition duration-200 appearance-none bg-white`}
                  >
                    {specialists.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                  {errorsEdit.specialist && (
                    <p className="text-red-500 text-sm mt-1">{errorsEdit.specialist.message}</p>
                  )}
                </div>

                {/* Department */}
                <div className="relative">
                  <select
                    {...registerEdit("department")}
                    className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.department ? "border-red-500" : "border-gray-300"
                    } transition duration-200 appearance-none bg-white`}
                  >
                    <option value="OPD">OPD</option>
                    <option value="IPD">IPD</option>
                    <option value="Both">Both</option>
                  </select>
                  {errorsEdit.department && (
                    <p className="text-red-500 text-sm mt-1">{errorsEdit.department.message}</p>
                  )}
                </div>

                {/* MODIFICATION: Two separate inputs for OPD charges in the edit modal */}
                {(departmentValueEdit === "OPD" || departmentValueEdit === "Both") && (
                  <>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        {...registerEdit("firstVisitCharge")}
                        placeholder="First Visit Charge (in Rs.)"
                        onWheel={preventWheelChange}
                        className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errorsEdit.firstVisitCharge ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                      {errorsEdit.firstVisitCharge && (
                        <p className="text-red-500 text-sm mt-1">{errorsEdit.firstVisitCharge.message}</p>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        {...registerEdit("followUpCharge")}
                        placeholder="Follow Up Charge (in Rs.)"
                        onWheel={preventWheelChange}
                        className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errorsEdit.followUpCharge ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                      {errorsEdit.followUpCharge && (
                        <p className="text-red-500 text-sm mt-1">{errorsEdit.followUpCharge.message}</p>
                      )}
                    </div>
                  </>
                )}


                {/* IPD Charges */}
                {(departmentValueEdit === "IPD" || departmentValueEdit === "Both") && roomTypes.length > 0 && (
                  <div className="border p-4 rounded-lg space-y-4">
                    <p className="font-semibold text-gray-800">Enter IPD Ward Charges:</p>
                    {roomTypes.map((room) => {
                      const roomError = errorsEdit.ipdCharges && (errorsEdit.ipdCharges as any)[room]
                      return (
                        <div key={room}>
                          <label className="block text-sm">{room.replace(/_/g, " ").toUpperCase()} Charge</label>
                          <input
                            type="number"
                            step="0.01"
                            {...registerEdit(`ipdCharges.${room}` as const)}
                            placeholder={`${room} Charge`}
                            onWheel={preventWheelChange}
                            className={`w-full mt-1 pl-4 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              roomError ? "border-red-500" : "border-gray-300"
                            } transition duration-200`}
                          />
                          {roomError && <p className="text-red-500 text-sm mt-1">{roomError.message}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Update Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    loading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {loading ? "Updating..." : "Update Doctor"}
                </button>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="w-full py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export default AdminDoctorsPage