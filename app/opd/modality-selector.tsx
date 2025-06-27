"use client"

import { useState, useCallback, useMemo } from "react"
import { Plus, Edit2, Check, DollarSign, Trash2, IndianRupeeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SearchDropdown } from "./Component/search-dropdown"
import { DoctorSearchDropdown } from "./Component/doctor-search-dropdown"
import {
  ModalityOptions,
  VisitTypeOptions,
  XRayStudyOptions,
  PathologyStudyOptions,
  IPDServiceOptions,
  RadiologyServiceOptions,
  Casualty,
  type ModalitySelection,
  type Doctor,
  type ServiceOption,
} from "./types"

// Utility functions
const generateModalityId = (): string => {
  return `modality_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const getDefaultCharges = (type: ModalitySelection["type"]): number => {
  const option = ModalityOptions.find((m) => m.value === type)
  return option?.baseCharge || 0
}

interface ModalitySelectorProps {
  modalities: ModalitySelection[]
  doctors: Doctor[]
  onChange: (modalities: ModalitySelection[]) => void
}

export function ModalitySelector({ modalities, doctors, onChange }: ModalitySelectorProps) {
  const [editingCharges, setEditingCharges] = useState<Record<string, boolean>>({})
  const [tempCharges, setTempCharges] = useState<Record<string, string>>({}) // Changed to string to allow empty input

  // Add modality function
  const addModality = (type: ModalitySelection["type"]) => {
    const newModality: ModalitySelection = {
      id: generateModalityId(),
      type,
      charges: getDefaultCharges(type),
      service: type === "custom" ? "" : undefined, // Initialize custom service name
    }
    onChange([...modalities, newModality])
  }

  // Get service options based on modality type
  const getServiceOptions = useCallback((type: ModalitySelection["type"]): ServiceOption[] => {
    switch (type) {
      case "xray":
        return XRayStudyOptions
      case "pathology":
        return PathologyStudyOptions
      case "ipd":
        return IPDServiceOptions
      case "radiology":
        return RadiologyServiceOptions
      case "casualty":
        return Casualty
      default:
        return []
    }
  }, [])

  // Get available specialists (deduplicated, sorted)
  const getAvailableSpecialists = useMemo(() => {
    const specialistSet = new Set<string>()
    doctors.forEach((doctor) => {
      if (doctor.specialist && Array.isArray(doctor.specialist)) {
        doctor.specialist.forEach((spec) => specialistSet.add(spec))
      }
    })
    return Array.from(specialistSet).sort()
  }, [doctors])

  // Calculate doctor charges
  const calculateDoctorCharges = useCallback(
    (modality: ModalitySelection): number => {
      if (modality.type === "consultation" && modality.doctor && modality.visitType) {
        const selectedDoctor = doctors.find((d) => d.id === modality.doctor)
        if (selectedDoctor) {
          return modality.visitType === "first"
            ? selectedDoctor.firstVisitCharge || 0
            : selectedDoctor.followUpCharge || 0
        }
      }
      return modality.charges
    },
    [doctors],
  )

  // Update modality
  const updateModality = useCallback(
    (id: string, updates: Partial<ModalitySelection>) => {
      onChange(
        modalities.map((m) => {
          if (m.id === id) {
            const updated = { ...m, ...updates }
            // Special handling for custom service charges
            if (updated.type === "custom" && updates.charges !== undefined) {
              updated.charges = updates.charges
            } else if (!editingCharges[id] && updates.charges === undefined && updated.type === "consultation") {
              // Only calculate charges if not manually edited and it's a consultation
              updated.charges = calculateDoctorCharges(updated)
            }
            return updated
          }
          return m
        }),
      )
    },
    [modalities, onChange, calculateDoctorCharges, editingCharges],
  )

  // Remove modality
  const removeModality = useCallback(
    (id: string) => {
      onChange(modalities.filter((m) => m.id !== id))
      setEditingCharges((prev) => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
      setTempCharges((prev) => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    },
    [modalities, onChange],
  )

  // Start editing charges
  const startEditingCharges = (id: string, currentCharges: number) => {
    setEditingCharges({ ...editingCharges, [id]: true })
    setTempCharges({ ...tempCharges, [id]: currentCharges.toString() }) // Convert to string for input
  }

  // Save edited charges
  const saveEditedCharges = (id: string) => {
    updateModality(id, { charges: Number(tempCharges[id]) || 0 }) // Convert back to number
    setEditingCharges({ ...editingCharges, [id]: false })
  }

  // Handle scroll event to prevent default behavior on number inputs
  const handleWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur(); // Remove focus to stop scroll
    e.preventDefault(); // Prevent default scroll behavior
  }, []);

  // Calculate total charges
  const getTotalCharges = useCallback(() => {
    return modalities.reduce((total, modality) => total + modality.charges, 0)
  }, [modalities])

  return (
    <div className="space-y-4">
      {/* Quick Add Buttons */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <Label className="text-sm font-medium text-gray-700 mb-3 block">Quick Add Services</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {ModalityOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addModality(option.value as ModalitySelection["type"])}
              className="h-12 text-xs"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Selected Modalities */}
      {modalities.length > 0 && (
        <div className="space-y-3">
          {modalities.map((modality, index) => (
            <Card key={modality.id} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {ModalityOptions.find((m) => m.value === modality.type)?.label}
                    </Badge>
                    <span className="text-xs text-gray-500">#{index + 1}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeModality(modality.id)}
                    className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {modality.type === "consultation" ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Specialist (with search) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Specialist *</Label>
                      <SearchDropdown
                        options={getAvailableSpecialists.map((spec) => ({
                          service: spec,
                          amount: 0,
                        }))}
                        value={modality.specialist || ""}
                        onSelect={(spec) => {
                          updateModality(modality.id, {
                            specialist: spec,
                            doctor: "",
                            visitType: undefined,
                          })
                        }}
                        placeholder="Search & select specialist"
                      />
                    </div>

                    {/* Doctor (searchable, already present) */}
                    {modality.specialist && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">Doctor *</Label>
                        <DoctorSearchDropdown
                          doctors={doctors}
                          value={modality.doctor || ""}
                          onSelect={(doctorId) => {
                            updateModality(modality.id, { doctor: doctorId, visitType: "first" })
                          }}
                          placeholder="Select doctor"
                          specialist={modality.specialist}
                        />
                      </div>
                    )}

                    {/* Visit Type */}
                    {modality.doctor && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">Visit Type *</Label>
                        <select
                          value={modality.visitType || ""}
                          onChange={(e) => {
                            updateModality(modality.id, { visitType: e.target.value as "first" | "followup" })
                          }}
                          className="h-9 rounded-md border border-gray-300 px-3"
                        >
                          <option value="">Select</option>
                          {VisitTypeOptions.map((option) => {
                            const doc = doctors.find((d) => d.id === modality.doctor)
                            const charge = doc && option.value === "first" ? doc.firstVisitCharge : doc?.followUpCharge
                            return (
                              <option key={option.value} value={option.value}>
                                {option.label}
                                {charge ? ` - ₹${charge}` : ""}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )}

                    {/* Charges */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Charges</Label>
                      <div className="relative">
                        {editingCharges[modality.id] ? (
                          <div className="flex">
                            <Input
                              type="number"
                              className="h-9 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Remove scroll mouse
                              value={tempCharges[modality.id]}
                              onChange={(e) =>
                                setTempCharges({
                                  ...tempCharges,
                                  [modality.id]: e.target.value,
                                })
                              }
                              onWheel={handleWheel} // Add onWheel handler
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="absolute right-0 top-0 h-9 w-8 p-0"
                              onClick={() => saveEditedCharges(modality.id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex">
                            <Input
                              value={modality.charges === 0 ? "" : `₹${modality.charges}`} // Display empty if 0
                              readOnly
                              className="h-9 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Remove scroll mouse
                              onWheel={handleWheel} // Add onWheel handler
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="absolute right-0 top-0 h-9 w-8 p-0"
                              onClick={() => startEditingCharges(modality.id, modality.charges)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : modality.type === "custom" ? ( // New custom service fields
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Custom Service Name */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Custom Service Name *</Label>
                      <Input
                        type="text"
                        placeholder="Enter service name"
                        value={modality.service || ""}
                        onChange={(e) => updateModality(modality.id, { service: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    {/* Custom Service Amount */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Amount *</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="Enter amount"
                          value={modality.charges === 0 ? "" : modality.charges} // Display empty if 0
                          onChange={(e) => updateModality(modality.id, { charges: Number(e.target.value) || 0 })}
                          className="h-9 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Remove scroll mouse
                          onWheel={handleWheel} // Add onWheel handler
                        />
                        <IndianRupeeIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      </div>
                    </div>
                    {/* Doctor (optional for custom service) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Doctor (Optional)</Label>
                      <DoctorSearchDropdown
                        doctors={doctors}
                        value={modality.doctor || ""}
                        onSelect={(doctorId) => {
                          updateModality(modality.id, { doctor: doctorId })
                        }}
                        placeholder="Select doctor"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Service (with search) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Service *</Label>
                      <SearchDropdown
                        options={getServiceOptions(modality.type)}
                        value={modality.service || ""}
                        onSelect={(service, amount) => {
                          updateModality(modality.id, { service, charges: amount })
                        }}
                        placeholder="Search & select service"
                      />
                    </div>
                    {/* Doctor (optional) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Doctor (Optional)</Label>
                      <DoctorSearchDropdown
                        doctors={doctors}
                        value={modality.doctor || ""}
                        onSelect={(doctorId) => {
                          updateModality(modality.id, { doctor: doctorId })
                        }}
                        placeholder="Select doctor"
                      />
                    </div>
                    {/* Charges */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-600">Charges</Label>
                      <div className="relative">
                        {editingCharges[modality.id] ? (
                          <div className="flex">
                            <Input
                              type="number"
                              className="h-9 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Remove scroll mouse
                              value={tempCharges[modality.id]}
                              onChange={(e) =>
                                setTempCharges({
                                  ...tempCharges,
                                  [modality.id]: e.target.value,
                                })
                              }
                              onWheel={handleWheel} // Add onWheel handler
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="absolute right-0 top-0 h-9 w-8 p-0"
                              onClick={() => saveEditedCharges(modality.id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex">
                            <Input
                              value={modality.charges === 0 ? "" : `₹${modality.charges}`} // Display empty if 0
                              readOnly
                              className="h-9 pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Remove scroll mouse
                              onWheel={handleWheel} // Add onWheel handler
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="absolute right-0 top-0 h-9 w-8 p-0"
                              onClick={() => startEditingCharges(modality.id, modality.charges)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Total Summary */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Total Charges:</span>
                </div>
                <span className="text-2xl font-bold text-blue-900">₹{getTotalCharges()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {modalities.length === 0 && (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="pt-6 pb-6">
            <div className="text-center text-gray-500">
              <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium mb-1">No services selected</p>
              <p className="text-sm">Use the quick add buttons above to add services</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}