"use client"

import { useState, useRef, useEffect } from "react"
import { Search, ChevronDown, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Doctor } from "../types"

interface DoctorSearchDropdownProps {
  doctors: Doctor[]
  value: string
  onSelect: (doctorId: string) => void
  placeholder: string
  specialist?: string
  className?: string
}

export function DoctorSearchDropdown({
  doctors,
  value,
  onSelect,
  placeholder,
  specialist,
  className = "",
}: DoctorSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let filtered = doctors.filter((d) => d.id !== "no_doctor")

    if (specialist) {
      filtered = filtered.filter(
        (doctor) => doctor.specialist && Array.isArray(doctor.specialist) && doctor.specialist.includes(specialist),
      )
    }

    if (searchTerm) {
      filtered = filtered
        .filter((doctor) => doctor.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
          const aIndex = a.name.toLowerCase().indexOf(searchTerm.toLowerCase())
          const bIndex = b.name.toLowerCase().indexOf(searchTerm.toLowerCase())
          if (aIndex !== bIndex) return aIndex - bIndex
          return a.name.localeCompare(b.name)
        })
    }

    setFilteredDoctors(filtered.slice(0, 8))
  }, [searchTerm, doctors, specialist])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedDoctor = doctors.find((doc) => doc.id === value)

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between text-left font-normal"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">
          {selectedDoctor ? `${selectedDoctor.name} (${selectedDoctor.department})` : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search doctors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
                autoFocus
              />
            </div>
          </div>
          <ScrollArea className="max-h-60">
            <div className="p-1">
              {filteredDoctors.length > 0 ? (
                filteredDoctors.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 rounded-sm"
                    onClick={() => {
                      onSelect(doctor.id)
                      setIsOpen(false)
                      setSearchTerm("")
                    }}
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium">{doctor.name}</div>
                      <div className="text-xs text-gray-500">{doctor.department}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">No doctors found</div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
