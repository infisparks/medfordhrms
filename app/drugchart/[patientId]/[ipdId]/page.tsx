"use client"

import { useEffect, useState, Fragment } from "react"
import { useParams } from "next/navigation"
import { useForm, type SubmitHandler } from "react-hook-form"
import { ref, onValue, push, set, update } from "firebase/database"
import { db, auth } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Dialog, Transition } from "@headlessui/react"
import format from "date-fns/format"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pencil } from "lucide-react"

interface DrugChartEntry {
  id?: string
  dateTime: string
  duration: string
  dosage: string
  drugName: string
  dose: string
  route: string
  frequency: string
  specialInstruction: string
  stat: string
  enteredBy: string
  timestamp: string
  signatures?: Signature[]
  status: "active" | "hold" | "omit"
  editHistory?: EditRecord[]
}

interface Signature {
  dateTime: string
  by: string
  timestamp: string
}

interface EditRecord {
  editedBy: string
  timestamp: string
  previousValues: Partial<DrugChartEntry>
}

interface DrugChartFormInputs {
  dateTime: string
  duration: string
  dosage: string
  drugName: string
  dose: string
  route: string
  frequency: string
  specialInstruction: string
  stat: string
  status: "active" | "hold" | "omit"
}

interface SignatureFormInputs {
  dateTime: string
}

export default function DrugChartPage() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string }

  // --- New-Entry form
  const { register, handleSubmit, reset } = useForm<DrugChartFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      duration: "",
      dosage: "",
      drugName: "",
      dose: "",
      route: "",
      frequency: "",
      specialInstruction: "",
      stat: "",
      status: "active",
    },
  })

  const [entries, setEntries] = useState<DrugChartEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Signature modal state
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  const [entryForSignature, setEntryForSignature] = useState<DrugChartEntry | null>(null)
  const {
    register: registerSign,
    handleSubmit: handleSubmitSign,
    reset: resetSign,
  } = useForm<SignatureFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
    },
  })

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [entryForEdit, setEntryForEdit] = useState<DrugChartEntry | null>(null)
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit } =
    useForm<DrugChartFormInputs>()

  // --- Fetch existing entries from:
  // patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart
  useEffect(() => {
    const path = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart`
    const drugChartRef = ref(db, path)
    const unsubscribe = onValue(drugChartRef, (snapshot) => {
      setIsLoading(false)
      if (snapshot.exists()) {
        const data = snapshot.val()
        const loaded: DrugChartEntry[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          status: data[key].status || "active",
        }))
        // sort by dateTime descending
        loaded.sort(
          (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
        )
        setEntries(loaded)
      } else {
        setEntries([])
      }
    })
    return () => unsubscribe()
  }, [patientId, ipdId])

  // --- Create a new drug-chart entry
  const onSubmit: SubmitHandler<DrugChartFormInputs> = async (data) => {
    try {
      const enteredBy = auth.currentUser?.email || "unknown"
      const newEntry: DrugChartEntry = {
        ...data,
        enteredBy,
        timestamp: new Date().toISOString(),
        signatures: [],
        status: data.status || "active",
      }
      const path = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart`
      const drugChartRef = ref(db, path)
      await push(drugChartRef, newEntry)

      // reset form
      reset({
        dateTime: new Date().toISOString().slice(0, 16),
        duration: "",
        dosage: "",
        drugName: "",
        dose: "",
        route: "",
        frequency: "",
        specialInstruction: "",
        stat: "",
        status: "active",
      })
    } catch (err) {
      console.error("Error saving drug chart entry:", err)
    }
  }

  // --- Open signature modal
  const handleSignatureClick = (entry: DrugChartEntry) => {
    setEntryForSignature(entry)
    resetSign({ dateTime: new Date().toISOString().slice(0, 16) })
    setSignatureModalOpen(true)
  }

  // --- Open edit modal
  const handleEditClick = (entry: DrugChartEntry) => {
    setEntryForEdit(entry)
    resetEdit({
      dateTime: entry.dateTime,
      duration: entry.duration,
      dosage: entry.dosage,
      drugName: entry.drugName,
      dose: entry.dose,
      route: entry.route,
      frequency: entry.frequency,
      specialInstruction: entry.specialInstruction,
      stat: entry.stat,
      status: entry.status || "active",
    })
    setEditModalOpen(true)
  }

  // --- Submit signature
  const onSubmitSignature: SubmitHandler<SignatureFormInputs> = async (data) => {
    if (!entryForSignature || !entryForSignature.id) return

    try {
      const by = auth.currentUser?.email || "unknown"
      const signature: Signature = {
        dateTime: data.dateTime,
        by,
        timestamp: new Date().toISOString(),
      }
      const oldSignatures = entryForSignature.signatures || []
      const newSignatures = [...oldSignatures, signature]
      const updatedEntry: DrugChartEntry = {
        ...entryForSignature,
        signatures: newSignatures,
      }
      // save entire entry back under same ID
      const path = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart/${entryForSignature.id}`
      const entryRef = ref(db, path)
      await set(entryRef, updatedEntry)

      // update local state
      setEntries((prev) =>
        prev.map((ent) => (ent.id === entryForSignature.id ? updatedEntry : ent))
      )

      setSignatureModalOpen(false)
      setEntryForSignature(null)
    } catch (err) {
      console.error("Error saving signature:", err)
    }
  }

  // --- Submit edit
  const onSubmitEdit: SubmitHandler<DrugChartFormInputs> = async (data) => {
    if (!entryForEdit || !entryForEdit.id) return

    try {
      const editedBy = auth.currentUser?.email || "unknown"
      const editRecord: EditRecord = {
        editedBy,
        timestamp: new Date().toISOString(),
        previousValues: {
          dateTime: entryForEdit.dateTime,
          duration: entryForEdit.duration,
          dosage: entryForEdit.dosage,
          drugName: entryForEdit.drugName,
          dose: entryForEdit.dose,
          route: entryForEdit.route,
          frequency: entryForEdit.frequency,
          specialInstruction: entryForEdit.specialInstruction,
          stat: entryForEdit.stat,
          status: entryForEdit.status,
        },
      }
      const oldEditHistory = entryForEdit.editHistory || []
      const updatedEntry: DrugChartEntry = {
        ...entryForEdit,
        ...data,
        editHistory: [...oldEditHistory, editRecord],
      }
      // push only the updated fields + editHistory
      const path = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart/${entryForEdit.id}`
      const entryRef = ref(db, path)
      await update(entryRef, {
        dateTime: data.dateTime,
        duration: data.duration,
        dosage: data.dosage,
        drugName: data.drugName,
        dose: data.dose,
        route: data.route,
        frequency: data.frequency,
        specialInstruction: data.specialInstruction,
        stat: data.stat,
        status: data.status,
        editHistory: updatedEntry.editHistory,
      })

      // update local state
      setEntries((prev) =>
        prev.map((ent) => (ent.id === entryForEdit.id ? updatedEntry : ent))
      )

      setEditModalOpen(false)
      setEntryForEdit(null)
    } catch (err) {
      console.error("Error updating drug chart entry:", err)
    }
  }

  // --- Change status only
  const handleStatusChange = async (entry: DrugChartEntry, newStatus: "active" | "hold" | "omit") => {
    if (!entry.id) return

    try {
      const editedBy = auth.currentUser?.email || "unknown"
      const editRecord: EditRecord = {
        editedBy,
        timestamp: new Date().toISOString(),
        previousValues: { status: entry.status },
      }
      const oldEditHistory = entry.editHistory || []
      const updatedEntry: DrugChartEntry = {
        ...entry,
        status: newStatus,
        editHistory: [...oldEditHistory, editRecord],
      }
      const path = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/drugchart/${entry.id}`
      const entryRef = ref(db, path)
      await update(entryRef, { status: newStatus, editHistory: updatedEntry.editHistory })

      setEntries((prev) =>
        prev.map((ent) => (ent.id === entry.id ? updatedEntry : ent))
      )
    } catch (err) {
      console.error("Error updating entry status:", err)
    }
  }

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-50"
      case "hold":
        return "bg-orange-50"
      case "omit":
        return "bg-red-50"
      default:
        return "bg-white"
    }
  }

  // group by day string
  const groupedEntries = entries.reduce((acc: Record<string, DrugChartEntry[]>, entry) => {
    const day = format(new Date(entry.dateTime), "dd MMM yyyy")
    if (!acc[day]) acc[day] = []
    acc[day].push(entry)
    return acc
  }, {})

  return (
    <div className="p-4">
      {/* === New Entry Form === */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">New Drug Chart Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input type="datetime-local" {...register("dateTime")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Duration</label>
              <Input type="text" placeholder="Enter duration" {...register("duration")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dosage</label>
              <Input type="text" placeholder="Enter dosage" {...register("dosage")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Drug Name</label>
              <Input type="text" placeholder="Enter drug name" {...register("drugName")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dose</label>
              <Input type="text" placeholder="Enter dose" {...register("dose")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Route</label>
              <Input type="text" placeholder="Enter route (e.g., oral, IV)" {...register("route")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Frequency</label>
              <Input
                type="text"
                placeholder="Enter frequency (e.g., Q6H)"
                {...register("frequency")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Special Instruction</label>
              <Textarea
                placeholder="Enter special instructions"
                {...register("specialInstruction")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Stat</label>
              <Input type="text" placeholder="Enter stat if applicable" {...register("stat")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <Select defaultValue="active" {...register("status")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="omit">Omit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Save Entry
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* === List of Entries === */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Drug Chart Entries</h2>
        {isLoading ? (
          <p className="text-center">Loading entries...</p>
        ) : Object.keys(groupedEntries).length === 0 ? (
          <p className="text-center text-slate-500">No entries recorded yet.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEntries).map(([day, dayEntries]) => (
              <Card key={day}>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">{day}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`border p-2 rounded shadow-sm flex flex-col gap-2 ${getStatusBgColor(
                          entry.status || "active"
                        )}`}
                      >
                        <div className="flex justify-between flex-wrap">
                          <div>
                            <p className="font-medium mb-1">
                              Time: {format(new Date(entry.dateTime), "hh:mm a")}
                            </p>
                            <p className="text-sm">Drug: {entry.drugName}</p>
                            <p className="text-sm">Duration: {entry.duration}</p>
                            <p className="text-sm">Dosage: {entry.dosage}</p>
                            <p className="text-sm">Dose: {entry.dose}</p>
                            <p className="text-sm">Route: {entry.route}</p>
                            <p className="text-sm">Frequency: {entry.frequency}</p>
                            <p className="text-sm">
                              Special Instruction: {entry.specialInstruction}
                            </p>
                            <p className="text-sm">Stat: {entry.stat}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Entered By: {entry.enteredBy}
                            </p>
                            {entry.editHistory && entry.editHistory.length > 0 && (
                              <p className="text-xs text-gray-500">
                                Last Edited By:{" "}
                                {entry.editHistory[entry.editHistory.length - 1].editedBy}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditClick(entry)}>
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleSignatureClick(entry)}>
                                Signature
                              </Button>
                            </div>
                            <div className="mt-2">
                              <Select
                                defaultValue={entry.status || "active"}
                                onValueChange={(value) =>
                                  handleStatusChange(entry, value as "active" | "hold" | "omit")
                                }
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="hold">Hold</SelectItem>
                                  <SelectItem value="omit">Omit</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {/* List signatures */}
                        {entry.signatures && entry.signatures.length > 0 && (
                          <div className="mt-2 border-t pt-2">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Signatures:</p>
                            <div className="space-y-1">
                              {entry.signatures.map((sig, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs text-gray-700 flex items-center gap-2"
                                >
                                  <span>–</span>
                                  <span>
                                    {format(new Date(sig.dateTime), "dd MMM yyyy, hh:mm a")}
                                  </span>
                                  <span className="text-gray-500">by {sig.by}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* === Signature Modal === */}
      <Transition appear show={signatureModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setSignatureModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Add Signature
                  </Dialog.Title>

                  <form onSubmit={handleSubmitSign(onSubmitSignature)} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
                      <Input type="datetime-local" {...registerSign("dateTime")} className="w-full" />
                      <p className="text-xs text-gray-500 mt-1">(Auto-filled, can be changed)</p>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setSignatureModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">Save</Button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* === Edit Modal === */}
      <Transition appear show={editModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setEditModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Edit Drug Chart Entry
                  </Dialog.Title>

                  <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
                      <Input type="datetime-local" {...registerEdit("dateTime")} className="w-full" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Duration</label>
                      <Input
                        type="text"
                        placeholder="Enter duration"
                        {...registerEdit("duration")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Dosage</label>
                      <Input
                        type="text"
                        placeholder="Enter dosage"
                        {...registerEdit("dosage")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Drug Name</label>
                      <Input
                        type="text"
                        placeholder="Enter drug name"
                        {...registerEdit("drugName")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Dose</label>
                      <Input
                        type="text"
                        placeholder="Enter dose"
                        {...registerEdit("dose")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Route</label>
                      <Input
                        type="text"
                        placeholder="Enter route (e.g., oral, IV)"
                        {...registerEdit("route")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Frequency</label>
                      <Input
                        type="text"
                        placeholder="Enter frequency (e.g., Q6H)"
                        {...registerEdit("frequency")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Special Instruction</label>
                      <Textarea
                        placeholder="Enter special instructions"
                        {...registerEdit("specialInstruction")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Stat</label>
                      <Input
                        type="text"
                        placeholder="Enter stat if applicable"
                        {...registerEdit("stat")}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Status</label>
                      <Select defaultValue="active" {...registerEdit("status")}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="hold">Hold</SelectItem>
                          <SelectItem value="omit">Omit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">Save Changes</Button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
