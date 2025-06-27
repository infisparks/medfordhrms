/* ------------------------------------------------------------------
   IPDSignaturePDF.tsx
   ------------------------------------------------------------------ */
   "use client"
   import jsPDF from "jspdf"
   
   // Make sure these paths resolve in your Next.js project
   import letterhead from "@/public/letterhead.png"
   
   // Add `uhid` to the IPDFormInput interface
   interface IPDFormInput {
     // Basic Patient
     name: string
     phone: string
     gender: { label: string; value: string } | null
     age: number
     address?: string
     uhid?: string // ADDED: UHID field
   
     // Relative
     relativeName: string
     relativePhone: string
     relativeAddress?: string
   
     // IPD
     date: Date
     time: string
     roomType: { label: string; value: string } | null
     bed: { label: string; value: string } | null
     doctor: { label: string; value: string } | null
     referDoctor?: string
     admissionType: { label: string; value: string } | null
   
     // New fields
     admissionSource: { label: string; value: string } | null
     // New field
     deposit?: number
     paymentMode: { label: string; value: string } | null
   }
   
   interface IPDSignaturePDFProps {
     data: IPDFormInput
   }
   
   export default function IPDSignaturePDF({ data }: IPDSignaturePDFProps) {
     /* ----------------------------------------
           Load Hindi font (Noto Sans Devanagari)
           ---------------------------------------- */
     const loadHindiFont = (doc: jsPDF): Promise<void> =>
       new Promise((resolve, reject) => {
         fetch("/font/NotoSansDevanagari_Condensed-Medium.ttf")
           .then((res) => res.blob())
           .then((blob) => {
             const reader = new FileReader()
             reader.onload = () => {
               const base64 = (reader.result as string).split(",")[1]
               doc.addFileToVFS("NotoSansDevanagari_Condensed-Medium.ttf", base64)
               doc.addFont("NotoSansDevanagari_Condensed-Medium.ttf", "NotoSansDev", "normal")
               resolve()
             }
             reader.onerror = reject
             reader.readAsDataURL(blob)
           })
           .catch(reject)
       })
   
     /* ----------------------------------------
           Helpers shared by both generators
           ---------------------------------------- */
     const initializeDoc = () => {
       const doc = new jsPDF({ orientation: "p", unit: "pt", format: "A4" })
       const pageWidth = doc.internal.pageSize.getWidth()
       const pageHeight = doc.internal.pageSize.getHeight()
       doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight)
       return { doc, pageWidth, pageHeight }
     }
   
     /* ================================================================
           ===============  ENGLISH‑LANGUAGE PDF  ==========================
           ================================================================ */
     const generatePDF = () => {
       const { doc, pageWidth, pageHeight } = initializeDoc()
       let y = 120
       const left = 50
       const right = pageWidth - 50
       const lh = 14
   
       const newPageIfNeeded = () => {
         if (y > pageHeight - 50) {
           doc.addPage()
           doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight)
           y = 120
         }
       }
   
       const sep = () => {
         doc.setDrawColor(180)
         doc.setLineWidth(0.6)
         doc.line(left, y, right, y)
         y += lh
         newPageIfNeeded()
       }
   
       const addField = (label: string, value?: string) => {
         doc.setFont("Helvetica", "bold").setFontSize(10).text(label, left, y)
         doc.setFont("Helvetica", "normal").text(value || "N/A", left + 120, y)
         y += lh
         newPageIfNeeded()
       }
   
       const addSection = (title: string) => {
         y += 20
         newPageIfNeeded()
         doc.setFont("Helvetica", "bold").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
         y += 4
         sep()
         doc.setFont("Helvetica", "normal").setFontSize(10).setTextColor(0)
       }
   
       /* ---------- Title ---------- */
       doc
         .setFont("Helvetica", "bold")
         .setFontSize(14)
         .setTextColor(0, 0, 128)
         .text("Patient's Admission Summary", pageWidth / 2, y, { align: "center" })
       y += lh + 8
       sep()
   
       // Add UHID field in generatePDF
       /* ---------- Patient details ---------- */
       addSection("Patient Details")
       addField("UHID", data.uhid || "NA") // ADDED: UHID field
       addField("Patient Name", data.name || "NA")
       addField("Age / Sex", `${data.age || "NA"} Yrs / ${data.gender?.label || "NA"}`)
       addField("Under Care of Doctor", data.doctor?.label || "NA")
       addField("Address", data.address || "NA")
       addField("Number", data.phone || "NA")
   
       /* ---------- Admission ---------- */
       addSection("Admission Details")
       const adDate = data.date ? data.date.toLocaleDateString() : "24‑03‑2025"
       const adTime =
         data.time || (data.date ? data.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "NA")
       addField("Admission Date / Time", `${adDate} - ${adTime}`)
       addField("Referral Doctor", data.referDoctor || "NA")
   
       /* ---------- Room / Ward ---------- */
       addSection("Room / Ward")
       addField("Room / Ward", data.roomType?.label || "NA")
       addField("Bed No", data.bed?.label || "NA")
   
       /* ---------- Instructions ---------- */
       addSection("Instructions")
       const instructions = [
         "Please have an attendant to accompany you till discharge.",
         "Billing Cycle will be of 24 hours from the date and time of admission.",
         //  "Any investigations like Sonography, Blood/Urine Test, X‑Ray, 2D‑Echo, etc. will be charged extra.",
         //  "In package, oral medicines and non‑medical items are payable by the patient.",
         "Consultant Visit charges will be charged as per their visits.",
         "All other services like Oxygen, Nebulizer, Monitor, Syringe pump, Ventilator, BiPAP, etc., are chargeable.",
         "Any other visiting consultants other than the treating doctor will be charged extra.",
         "Normal delivery basic package consists of 1 induction; if more than that, it will be charged.",
         "Normal delivery basic package includes 1 pediatric visit.",
         "Consumption of alcohol, smoking, chewing gum, and spitting are strictly prohibited.",
         "Patients are advised not to carry cash or wear/keep any jewelry during hospitalization. The hospital is not responsible for any kind of loss.",
         "Photography is prohibited on hospital premises.",
         "If the patient is required to be transferred to the ICU/Room/Ward, the room/bed they were occupying prior to transfer is to be vacated by the attendants.",
         "For any further assistance, you may reach us on 9769000091 / 9769000092",
       ]
       instructions.forEach((txt) => {
         doc.setFont("Helvetica", "bold").setTextColor(0, 0, 128).text("•", left, y)
         doc
           .setFont("Helvetica", "normal")
           .setTextColor(60)
           .splitTextToSize(txt, right - left - 15)
           .forEach((line: string | string[]) => {
             doc.text(line, left + 15, y)
             y += lh
             newPageIfNeeded()
           })
       })
   
       /* ---------- Acknowledgment & Sign ---------- */
       y += lh
       newPageIfNeeded()
       doc
         .setFont("Helvetica", "bold")
         .setTextColor(0)
         .text("I have read all the information mentioned above and hereby acknowledge and confirm:", left, y)
       y += lh * 2
       newPageIfNeeded()
   
       doc
         .setFont("Helvetica", "normal")
         .text("Signature: ______________", left, y)
         .text("Billing Executive: ______________", right, y, { align: "right" })
       y += lh * 2
       newPageIfNeeded()
       doc.text("Name: ______________", left, y)
       y += lh * 1.5
       newPageIfNeeded()
       doc.text("Relation with Patient: ______________", left, y)
   
       doc.save(`IPD_Admission_Letter_${data.name || "Patient"}.pdf`)
     }
   
     /* ================================================================
           ===============  HINDI‑LANGUAGE PDF  ============================
           ================================================================ */
     const generatePDFHindi = async () => {
       const { doc, pageWidth, pageHeight } = initializeDoc()
       let y = 120
       const left = 50
       const right = pageWidth - 50
       const lh = 14
   
       await loadHindiFont(doc)
   
       const newPageIfNeeded = () => {
         if (y > pageHeight - 50) {
           doc.addPage()
           doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight)
           y = 120
         }
       }
   
       const sep = () => {
         doc.setDrawColor(180).setLineWidth(0.6).line(left, y, right, y)
         y += lh
         newPageIfNeeded()
       }
   
       /* ---------- Section title (Hindi) ---------- */
       const addSectionHI = (title: string) => {
         y += 20
         newPageIfNeeded()
         doc.setFont("NotoSansDev", "normal").setFontSize(11).setTextColor(0, 0, 128).text(title, left, y)
         y += 4
         sep()
         doc.setFontSize(10).setTextColor(0)
       }
   
       /* ---------- Field (English labels + values) ---------- */
       const addFieldEN = (label: string, value?: string) => {
         doc
           .setFont("Helvetica", "bold")
           .text(label, left, y)
           .setFont("Helvetica", "normal")
           .text(value || "N/A", left + 120, y)
         y += lh
         newPageIfNeeded()
       }
   
       /* ---------- Bullet in Hindi ---------- */
       const addBulletHI = (txt: string) => {
         doc.setFont("NotoSansDev", "normal").text("•", left, y)
         doc.splitTextToSize(txt, right - left - 15).forEach((line: string | string[]) => {
           doc.text(line, left + 15, y)
           y += lh
           newPageIfNeeded()
         })
       }
   
       /* ---------- Title ---------- */
       doc
         .setFont("NotoSansDev", "normal")
         .setFontSize(14)
         .setTextColor(0, 0, 128)
         .text("रोगी का प्रवेश सारांश", pageWidth / 2, y, { align: "center" })
       y += lh + 8
       sep()
   
       // Add UHID field in generatePDFHindi
       /* ---------- Patient details (labels & values in English) ---------- */
       addSectionHI("रोगी विवरण / PATIENT DETAILS")
       addFieldEN("UHID", data.uhid || "NA") // ADDED: UHID field
       addFieldEN("Patient Name", data.name || "NA")
       addFieldEN("Age / Sex", `${data.age || "NA"} Yrs / ${data.gender?.label || "NA"}`)
       addFieldEN("Under Care of Doctor", data.doctor?.label || "NA")
       addFieldEN("Address", data.address || "NA")
       addFieldEN("Number", data.phone || "NA")
   
       /* ---------- Admission details ---------- */
       addSectionHI("भर्ती विवरण / ADMISSION DETAILS")
       const adDate = data.date ? data.date.toLocaleDateString() : "24‑03‑2025"
       const adTime =
         data.time || (data.date ? data.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "NA")
       addFieldEN("Admission Date / Time", `${adDate} - ${adTime}`)
       addFieldEN("Referral Doctor", data.referDoctor || "NA")
   
       /* ---------- Room / Ward ---------- */
       addSectionHI("कक्ष / वार्ड")
       addFieldEN("Room / Ward", data.roomType?.label || "NA")
       addFieldEN("Bed No", data.bed?.label || "NA")
   
       /* ---------- Instructions ---------- */
       addSectionHI("निर्देश")
       ;[
         "कृपया डिस्चार्ज तक एक परिचारक आपके साथ रहे।",
         "भर्ती की तारीख और समय से 24 घंटे का बिलिंग चक्र होगा।",
         "परामर्शदाता की विजिट चार्जेज उनकी विजिट के अनुसार लगाए जाएंगे।",
         "सोनोग्राफी, रक्त/मूत्र परीक्षण, एक्स‑रे, 2D‑इको जैसी जांचें अतिरिक्त शुल्क पर होंगी।",
         "पैकेज में मौखिक एवं गैर‑चिकित्सा वस्तुएँ रोगी द्वारा भुगतान योग्य हैं।",
         "ऑक्सीजन, नेबुलाइज़र, मॉनिटर, सिरिंज पंप, वेंटीलेटर, BiPAP आदि चार्जेबल सेवाएँ हैं।",
         "इलाज करने वाले डॉक्टर के अलावा अन्य परामर्शदाता की विजिट पर अतिरिक्त शुल्क लगेगा।",
         "साधारण प्रसव पैकेज में 1 इंडक्शन शामिल है; अधिक होने पर शुल्क लगेगा।",
         "साधारण प्रसव में 1 बाल रोग विशेषज्ञ की विजिट शामिल है।",
         "अस्पताल परिसर में शराब, धूम्रपान, च्यूइंग गम एवं थूकना वर्जित है।",
         "अस्पताल में नकदी या आभूषण न रखें; किसी भी हानि के लिए अस्पताल उत्तरदायी नहीं है।",
         "अस्पताल परिसर में फोटोग्राफी वर्जित है।",
         "ICU/कक्ष/वार्ड में स्थानांतरण पर पूर्व बिस्तर खाली करें।",
         "अन्य सहायता हेतु 9769000091 / 9769000092 पर संपर्क करें।",
       ].forEach(addBulletHI)
   
       /* ---------- Acknowledgment & Sign ---------- */
       y += lh
       doc.setFont("NotoSansDev", "normal").text("मैंने उपरोक्त सभी जानकारी पढ़ ली है एवं पुष्टि करता हूँ:", left, y)
       y += lh * 2
       newPageIfNeeded()
   
       doc.setFont("NotoSansDev", "normal").text("हस्ताक्षर: ______________", left, y)
       doc.text("बिलिंग कार्यकारी: ______________", right, y, { align: "right" })
       y += lh * 2
       newPageIfNeeded()
       doc.text("नाम: ______________", left, y)
       y += lh * 1.5
       newPageIfNeeded()
       doc.text("रोगी के साथ संबंध: ______________", left, y)
   
       doc.save(`IPD_Admission_Letter_${data.name || "Patient"}_HI.pdf`)
     }
   
     /* ================================================================
           ===============  RENDER PDF BUTTONS  ============================
           ================================================================ */
     return (
       <div className="flex gap-4">
         <button
           type="button"
           onClick={generatePDF}
           className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200"
         >
           Download Letter
         </button>
         <button
           type="button"
           onClick={generatePDFHindi}
           className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
         >
           पत्र डाउनलोड करें
         </button>
       </div>
     )
   }
   