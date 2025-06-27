"use client"

import { useState, useRef, useEffect } from "react"
import { Search, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SearchDropdownProps {
  options: Array<{ service: string; amount: number }>
  value: string
  onSelect: (value: string, amount: number) => void
  placeholder: string
  className?: string
}

export function SearchDropdown({
  options,
  value,
  onSelect,
  placeholder,
  className = "",
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredOptions, setFilteredOptions] = useState(options)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = searchTerm.toLowerCase()
    setFilteredOptions(
      options
        .filter((o) => o.service.toLowerCase().includes(term))
        .sort((a, b) => {
          const ai = a.service.toLowerCase().indexOf(term)
          const bi = b.service.toLowerCase().indexOf(term)
          return ai !== bi ? ai - bi : a.service.localeCompare(b.service)
        })
        .slice(0, 50) // you can bump this if you need more
    )
  }, [searchTerm, options])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const selectedOption = options.find((o) => o.service === value)

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between text-left font-normal"
        onClick={() => setIsOpen((o) => !o)}
      >
        <span className="truncate">
          {selectedOption
            ? `${selectedOption.service} - ₹${selectedOption.amount}`
            : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          {/* search input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
                autoFocus
              />
            </div>
          </div>

          {/* scrollable options */}
          <ScrollArea className="max-h-60 overflow-y-auto">
            <div className="p-1 space-y-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <div
                    key={opt.service}
                    className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 rounded-sm"
                    onClick={() => {
                      onSelect(opt.service, opt.amount)
                      setSearchTerm("")
                      setIsOpen(false)
                    }}
                  >
                    <span className="font-medium">{opt.service}</span>
                    <span className="text-blue-600 font-semibold">₹{opt.amount}</span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">No services found</div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
