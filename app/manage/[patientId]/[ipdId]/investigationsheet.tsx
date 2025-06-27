"use client"

import React, { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { ref as dbRef, push, set, update, onValue } from "firebase/database"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, auth, storage } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import format from "date-fns/format"
import { jsPDF } from "jspdf"
import { Eye, Download, X, FileImage, Loader2, Plus, Trash2 } from "lucide-react"

/* ───────── Types ───────── */
interface InvestigationEntry {
  dateTime: string
  value: string
  type: "text" | "image"
}

interface InvestigationRecord {
  id: string // Make ID non-optional for easier lookups
  testName: string
  entries: InvestigationEntry[]
  enteredBy: string
}

interface TestEntry {
  testName: string
  customTestName: string
  dateTime: string
  value: string
  image?: FileList
  entryType: "text" | "image"
}

interface InvestigationFormInputs {
  tests: TestEntry[]
}

interface AdditionalEntryFormInputs {
  dateTime: string
  value: string
  image?: FileList
  entryType: "text" | "image"
}

/* ───────── Test list ───────── */
const testOptions = ["HIV", "HBsAg", "HCV", "HB", "WBC", "PLATELET", "CRP", "ESR", "PT", "INR", "PTT", "BNP", "Custom"]

/* ───────── Image-compression helper ───────── */
const compressImage = (file: File, maxKB = 200, maxW = 1200): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxW) {
          height = (height * maxW) / width
          width = maxW
        }
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, width, height)

        const attempt = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject("Compression failed")
              if (blob.size / 1024 <= maxKB || q <= 0.4) {
                resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }))
              } else {
                attempt(q - 0.1)
              }
            },
            "image/jpeg",
            q,
          )
        }
        attempt(0.8)
      }
      img.onerror = () => reject("Image load error")
      img.src = e.target!.result as string
    }
    reader.onerror = () => reject("File read error")
    reader.readAsDataURL(file)
  })

/* =================================================================== */
export default function InvestigationSheet() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string }

  /* State */
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [imgPreviews, setImgPreviews] = useState<{ [key: number]: string }>({})
  const [addFormImgPreview, setAddFormImgPreview] = useState<string | null>(null) // FIX: Separate state for add form
  const [addRowId, setAddRowId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [selectedRec, setSelectedRec] = useState<InvestigationRecord | null>(null)
  const [fullImg, setFullImg] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  /* Refs */
  const fileRefs = useRef<{ [key: number]: HTMLInputElement | null }>({})
  const addFileRef = useRef<HTMLInputElement | null>(null)

  /* RHF main form with field array */
  const { register, handleSubmit, control, reset, watch, setValue } = useForm<InvestigationFormInputs>({
    defaultValues: {
      tests: [
        {
          testName: "",
          customTestName: "",
          dateTime: new Date().toISOString().slice(0, 16),
          value: "",
          entryType: "text",
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tests",
  })

  const watchedTests = watch("tests")

  /* RHF add-entry form */
  const {
    register: rAdd,
    handleSubmit: hAdd,
    reset: resetAdd,
    watch: wAdd,
    setValue: setValAdd,
  } = useForm<AdditionalEntryFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      value: "",
      entryType: "text",
    },
  })

  const entryTypeAdd = wAdd("entryType")

  /* Firebase path base */
  const dbPath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/investigationsheet`

  /* Fetch investigations */
  useEffect(() => {
    const refPath = dbRef(db, dbPath)
    return onValue(refPath, (snap) => {
      setIsLoading(false)
      if (!snap.exists()) return setInvestigations([])

      const list: InvestigationRecord[] = Object.entries(snap.val()).map(([id, rec]: any) => ({
        id,
        ...rec,
        entries: Array.isArray(rec.entries) ? rec.entries : [rec.entries],
      }))
      setInvestigations(list)
    })
  }, [patientId, ipdId])

  /* Progress helper */
  const tickProgress = () => {
    setUploadPct(0)
    const iv = setInterval(() => {
      setUploadPct((p) => (p >= 85 ? p : p + 10))
    }, 200)
    return () => clearInterval(iv)
  }

  /* Upload helper */
  const uploadImageAndGetUrl = async (file: File) => {
    setIsUploading(true)
    const stop = tickProgress()
    try {
      const compressed = await compressImage(file, 200, 1200)
      const name = `${Date.now()}_${compressed.name}`
      const refStorage = storageRef(storage, `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/images/${name}`)
      const snap = await uploadBytes(refStorage, compressed)
      const url = await getDownloadURL(snap.ref)
      stop()
      setUploadPct(100)
      await new Promise((r) => setTimeout(r, 300))
      return url
    } catch (err) {
      stop()
      console.error("🔥 upload error:", err)
      alert("Image upload failed – see console for details.")
      throw err
    } finally {
      setIsUploading(false)
      setUploadPct(0)
    }
  }

  /* Submit multiple tests */
  const onSubmit: SubmitHandler<InvestigationFormInputs> = async (data) => {
    try {
      for (const test of data.tests) {
        const finalTestName = test.testName === "Custom" ? test.customTestName : test.testName

        if (!finalTestName.trim()) {
          alert("Please provide a test name for all entries.")
          return
        }

        const file = test.image?.[0]
        const wantsImg = test.entryType === "image"

        if (wantsImg && !file) {
          alert(`Select an image for ${finalTestName} test.`)
          return
        }

        let value = test.value
        let type: "text" | "image" = "text"

        if (wantsImg && file) {
          value = await uploadImageAndGetUrl(file)
          type = "image"
        }

        const entry: InvestigationEntry = {
          dateTime: test.dateTime,
          value,
          type,
        }

        const existingTest = investigations.find((inv) => inv.testName === finalTestName)

        if (existingTest) {
          const updated = [...existingTest.entries, entry]
          await update(dbRef(db, `${dbPath}/${existingTest.id}`), { entries: updated })
        } else {
          await set(push(dbRef(db, dbPath)), {
            testName: finalTestName,
            entries: [entry],
            enteredBy: auth.currentUser?.email ?? "unknown",
          })
        }
      }

      reset({
        tests: [
          {
            testName: "",
            customTestName: "",
            dateTime: new Date().toISOString().slice(0, 16),
            value: "",
            entryType: "text",
          },
        ],
      })

      Object.values(fileRefs.current).forEach((ref) => {
        if (ref) ref.value = ""
      })
      setImgPreviews({})
    } catch (err) {
      console.error("🔥 Submit error:", err)
    }
  }

  /* Submit additional entry */
  const onSubmitAdd: SubmitHandler<AdditionalEntryFormInputs> = async (d) => {
    try {
      if (!addRowId) return

      const rec = investigations.find((r) => r.id === addRowId)!
      const file = d.image?.[0]
      const wantsImg = d.entryType === "image"

      if (wantsImg && !file) {
        alert("Select an image before submitting.")
        return
      }

      let value = d.value
      let type: "text" | "image" = "text"

      if (wantsImg && file) {
        value = await uploadImageAndGetUrl(file)
        type = "image"
      }

      const updated = [...rec.entries, { dateTime: d.dateTime, value, type }]

      await update(dbRef(db, `${dbPath}/${addRowId}`), { entries: updated })

      resetAdd({
        dateTime: new Date().toISOString().slice(0, 16),
        value: "",
        entryType: "text",
      })
      addFileRef.current && (addFileRef.current.value = "")
      setAddRowId(null)
      setAddFormImgPreview(null) // FIX: Clear the dedicated preview state
    } catch (err) {
      console.error("🔥 ADD entry error:", err)
    }
  }

  /* Preview image */
  const preview = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const f = e.target.files?.[0]
    if (!f) return

    const rd = new FileReader()
    rd.onloadend = () => {
      setImgPreviews((prev) => ({ ...prev, [index]: rd.result as string }))
    }
    rd.readAsDataURL(f)
    setValue(`tests.${index}.entryType`, "image")
  }

  /* Add preview for additional entry */
  const previewAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    const rd = new FileReader()
    rd.onloadend = () => {
      setAddFormImgPreview(rd.result as string) // FIX: Use dedicated state setter
    }
    rd.readAsDataURL(f)
    setValAdd("entryType", "image")
  }

  /* Generate PDF with all images merged */
  const generatePDF = async () => {
    if (!selectedRec) return

    setPdfBusy(true)
    try {
      const imgs = selectedRec.entries.filter((e) => e.type === "image")
      if (imgs.length === 0) {
        alert("No images to export.")
        return
      }

      const pdf = new jsPDF("p", "mm", "a4")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const usableWidth = pageWidth - margin * 2
      let currentY = margin

      pdf.setFontSize(18)
      pdf.setFont("helvetica", "bold")
      pdf.text(`${selectedRec.testName} - Investigation Images`, margin, currentY)
      currentY += 15

      pdf.setFontSize(12)
      pdf.setFont("helvetica", "normal")
      pdf.text(`Total Images: ${imgs.length}`, margin, currentY)
      currentY += 10
      pdf.text(`Generated: ${format(new Date(), "PPpp")}`, margin, currentY)
      currentY += 15

      for (let i = 0; i < imgs.length; i++) {
        const entry = imgs[i]

        pdf.setFontSize(10)
        pdf.setFont("helvetica", "bold")
        pdf.text(`Image ${i + 1}:`, margin, currentY)
        currentY += 5

        pdf.setFont("helvetica", "normal")
        pdf.text(`Date: ${format(new Date(entry.dateTime), "PPpp")}`, margin, currentY)
        currentY += 10

        try {
          const img = new Image()
          img.crossOrigin = "anonymous"

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = entry.value
          })

          const imgAspectRatio = img.width / img.height
          let imgWidth = usableWidth
          let imgHeight = imgWidth / imgAspectRatio

          const maxImageHeight = pageHeight - currentY - margin - 20
          if (imgHeight > maxImageHeight) {
            imgHeight = maxImageHeight
            imgWidth = imgHeight * imgAspectRatio
          }

          if (currentY + imgHeight > pageHeight - margin) {
            pdf.addPage()
            currentY = margin
          }

          pdf.addImage(img, "JPEG", margin, currentY, imgWidth, imgHeight)
          currentY += imgHeight + 15

          if (i < imgs.length - 1) {
            pdf.setDrawColor(200, 200, 200)
            pdf.line(margin, currentY, pageWidth - margin, currentY)
            currentY += 10
          }
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error)
          pdf.setTextColor(255, 0, 0)
          pdf.text(`Error loading image ${i + 1}`, margin, currentY)
          pdf.setTextColor(0, 0, 0)
          currentY += 10
        }
      }
      pdf.save(`${selectedRec.testName}_All_Images_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`)
    } catch (error) {
      console.error("PDF generation error:", error)
      alert("Error generating PDF. Please try again.")
    } finally {
      setPdfBusy(false)
    }
  }

  const ImgBtn = ({ url }: { url: string }) => (
    <Button variant="ghost" size="sm" className="flex items-center text-xs" onClick={() => setFullImg(url)}>
      <FileImage size={14} className="mr-1" />
      View Image
    </Button>
  )

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Forms and other components */}
      <Card className="mb-8 shadow">
        <CardHeader className="bg-slate-50">
          <CardTitle>Add New Investigations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-6">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 bg-slate-50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Test {index + 1}</h3>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        remove(index)
                        delete fileRefs.current[index]
                        setImgPreviews((prev) => {
                          const newPrev = { ...prev }
                          delete newPrev[index]
                          return newPrev
                        })
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium">Test Name</label>
                    <Select
                      value={watchedTests[index]?.testName || ""}
                      onValueChange={(value) => setValue(`tests.${index}.testName`, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Test" />
                      </SelectTrigger>
                      <SelectContent>
                        {testOptions.map((test) => (
                          <SelectItem key={test} value={test}>
                            {test}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {watchedTests[index]?.entryType === "text" && (
                    <div>
                      <label className="text-sm font-medium">Test Value</label>
                      <Input type="text" {...register(`tests.${index}.value`)} placeholder="Enter test value" />
                    </div>
                  )}
                </div>
                {watchedTests[index]?.testName === "Custom" && (
                  <div className="mb-4">
                    <label className="text-sm font-medium">Custom Test Name</label>
                    <Input {...register(`tests.${index}.customTestName`)} placeholder="Enter custom test name" />
                  </div>
                )}
                <div className="mb-4">
                  <label className="text-sm font-medium">Date & Time</label>
                  <Input type="datetime-local" {...register(`tests.${index}.dateTime`)} />
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium">Entry Type</label>
                  <div className="flex space-x-6 mt-1">
                    {["text", "image"].map((type) => (
                      <label key={type} className="flex items-center">
                        <input type="radio" value={type} {...register(`tests.${index}.entryType`)} className="mr-2" />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                {watchedTests[index]?.entryType === "image" && (
                  <div className="mt-4">
                    <label className="text-sm font-medium">Upload Image</label>
                    <Input
                      type="file"
                      accept="image/*"
                      {...register(`tests.${index}.image`)}
                      ref={(el) => {
                        register(`tests.${index}.image`).ref(el)
                        fileRefs.current[index] = el
                      }}
                      onChange={(e) => preview(e, index)}
                      disabled={isUploading}
                    />
                    {isUploading && <p className="text-xs mt-1">{uploadPct}%</p>}
                    {imgPreviews[index] && (
                      <img src={imgPreviews[index] || "/placeholder.svg"} className="h-24 mt-2 rounded" alt="Preview" />
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  testName: "",
                  customTestName: "",
                  dateTime: new Date().toISOString().slice(0, 16),
                  value: "",
                  entryType: "text",
                })
              }
              className="w-full"
            >
              <Plus size={16} className="mr-2" />
              Add Another Test
            </Button>
            <Button type="submit" disabled={isUploading} className="w-full">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add All Investigations
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold mb-2">Investigation Records</h2>
      {isLoading ? (
        <p>Loading…</p>
      ) : investigations.length === 0 ? (
        <p>No records.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="border px-4 py-2">Test</th>
                <th className="border px-4 py-2">Date & Time</th>
                <th className="border px-4 py-2">Value / Image</th>
                <th className="border px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((rec) => {
                const hasImg = rec.entries.some((e) => e.type === "image")
                return (
                  <React.Fragment key={rec.id}>
                    {rec.entries.map((e, i) => (
                      <tr key={`${rec.id}-${i}`} className="odd:bg-slate-50 hover:bg-slate-100">
                        {i === 0 && (
                          <td className="border px-4 py-2 align-top" rowSpan={rec.entries.length}>
                            <div className="font-medium">{rec.testName}</div>
                            {hasImg && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center text-xs mt-2"
                                onClick={() => {
                                  setSelectedRec(rec)
                                  setGalleryOpen(true)
                                }}
                              >
                                <Eye size={14} className="mr-1" />
                                Gallery
                              </Button>
                            )}
                          </td>
                        )}
                        <td className="border px-4 py-2">{format(new Date(e.dateTime), "PPpp")}</td>
                        <td className="border px-4 py-2">
                          {e.type === "text" ? <span className="font-medium">{e.value}</span> : <ImgBtn url={e.value} />}
                        </td>
                        {i === 0 && (
                          <td className="border px-4 py-2 align-top" rowSpan={rec.entries.length}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAddRowId(rec.id!)
                                setAddFormImgPreview(null) // FIX: Reset dedicated preview state
                                resetAdd({
                                  dateTime: new Date().toISOString().slice(0, 16),
                                  value: "",
                                  entryType: "text",
                                })
                              }}
                            >
                              Add More
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {addRowId === rec.id && (
                      <tr className="bg-slate-100">
                        <td colSpan={4} className="p-4">
                          <form className="space-y-4" onSubmit={hAdd(onSubmitAdd)}>
                            <div className="flex flex-col md:flex-row gap-4">
                              <Input type="datetime-local" {...rAdd("dateTime")} className="flex-1" />
                              <div className="flex-1 flex space-x-6">
                                {["text", "image"].map((t) => (
                                  <label key={t} className="flex items-center">
                                    <input
                                      type="radio"
                                      value={t}
                                      {...rAdd("entryType")}
                                      onChange={() => setValAdd("entryType", t as "image" | "text")}
                                      checked={entryTypeAdd === t}
                                      className="mr-2"
                                    />
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                  </label>
                                ))}
                              </div>
                            </div>
                            {entryTypeAdd === "text" ? (
                              <Input type="text" {...rAdd("value")} placeholder="Value" />
                            ) : (
                              <>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  {...rAdd("image")}
                                  ref={(el) => {
                                    rAdd("image").ref(el)
                                    addFileRef.current = el
                                  }}
                                  onChange={previewAdd}
                                  disabled={isUploading}
                                />
                                {isUploading && <p className="text-xs">{uploadPct}%</p>}
                                {addFormImgPreview && (
                                  <img src={addFormImgPreview} className="h-20 rounded mt-2" alt="Add more preview" />
                                )}
                              </>
                            )}
                            <div className="flex space-x-2">
                              <Button size="sm" type="submit" disabled={isUploading}>
                                {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setAddRowId(null)
                                  setAddFormImgPreview(null) // FIX: Reset dedicated preview state
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>{selectedRec?.testName} – Images</span>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                disabled={pdfBusy}
                onClick={generatePDF}
              >
                <Download size={14} className="mr-1" />
                {pdfBusy ? "Generating PDF..." : "Download All Images PDF"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedRec && (
            <Carousel className="w-full">
              <CarouselContent>
                {selectedRec.entries
                  .filter((e) => e.type === "image")
                  .sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime))
                  .map((e, i) => (
                    <CarouselItem key={i}>
                      <div className="p-1">
                        <img
                          src={e.value || "/placeholder.svg"}
                          className="max-h-[70vh] w-full object-contain cursor-pointer"
                          onClick={() => setFullImg(e.value)}
                          alt={`Investigation image ${i + 1}`}
                        />
                        <p className="text-center text-sm text-gray-600 mt-2">{format(new Date(e.dateTime), "PPpp")}</p>
                      </div>
                    </CarouselItem>
                  ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!fullImg} onOpenChange={(o) => !o && setFullImg(null)}>
        <DialogContent className="max-w-7xl h-[90vh] flex items-center justify-center p-0">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white bg-black/50"
              onClick={() => setFullImg(null)}
            >
              <X />
            </Button>
            {fullImg && <img src={fullImg || "/placeholder.svg"} className="max-w-full max-h-full object-contain" alt="Full screen investigation" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}