"use client"

import { Button } from "@/components/ui/button"
import { Edit } from "lucide-react"
import { useRouter } from "next/navigation"

interface EditButtonProps {
  uhid: string
  appointmentId: string
  className?: string
  compact?: boolean
}

export function EditButton({
  uhid,
  appointmentId,
  className = "",
  compact = false,
}: EditButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/edit-appointment?uhid=${uhid}&id=${appointmentId}`)
  }

  return (
    <Button
      size={compact ? "icon" : "sm"}
      variant="outline"
      onClick={handleClick}
      className={`text-blue-600 hover:text-blue-700 ${className}`}
      aria-label="Edit Appointment"
    >
      <Edit className={compact ? "h-5 w-5" : "h-4 w-4 mr-1"} />
      {!compact && "Edit"}
    </Button>
  )
}
