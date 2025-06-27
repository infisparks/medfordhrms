"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, remove ,onValue, update, get } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  Save,
  UserCheck,
  FileText,
  Calendar,
  User,
  Phone,
  MapPin,
  Bed,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import "react-toastify/dist/ReactToastify.css";

interface DischargeData {
  finalDiagnosis?: string;
  procedures?: string;
  provisionalDiagnosis?: string;
  historyOfPresentIllness?: string;
  investigations?: string;
  treatmentGiven?: string;
  hospitalCourse?: string;
  surgeryProcedureDetails?: string;
  conditionAtDischarge?: string;
  dischargeMedication?: string;
  followUp?: string;
  dischargeInstructions?: string;
  lastUpdated?: string;
}

interface PatientRecord {
  patientId: string;
  uhid: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  age?: string | number;
  gender?: string;
  relativeName?: string;
  relativePhone?: string;
  relativeAddress?: string;
  roomType?: string;
  bed?: string;
  admitDate?: string;
  dischargeDate?: string;
}

export default function DischargeSummaryPage() {
  const { patientId, ipdId, admitDateKey } = useParams() as {
    patientId: string;
    ipdId: string;
    admitDateKey: string;
  };
  const router = useRouter();

  /* State for basic IPD + patient info */
  const [patientRecord, setRec] = useState<PatientRecord | null>(null);

  /* State for our discharge‐summary form */
  const [discharge, setDischarge] = useState<DischargeData>({});

  /* Bed‐map so we can show bed numbers, etc. */
  const [beds, setBeds] = useState<Record<string, any>>({});

  /* UI loading/saving flags */
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  /* Info about when the summary was last saved */
  const [lastSaved, setLastSaved] = useState("");

  /* Refs for enabling Ctrl+B → **bold** in <textarea> */
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  /* ─── Step 1: load the static “beds” tree for bed‐number lookups ────────────────── */
  useEffect(() => {
    const bedsRef = ref(db, "beds");
    const unsub = onValue(bedsRef, (snap) => {
      setBeds(snap.exists() ? snap.val() : {});
    });
    return () => unsub();
  }, []);

  /* ─── Step 2: load “userinfoipd” + discharge‐summary (if any) ───────────────────── */
  useEffect(() => {
    if (!patientId || !ipdId) return;

    // a) listen to the core IPD node under “userinfoipd”
    const ipdRef = ref(
      db,
      `patients/ipddetail/userinfoipd/${admitDateKey}/${patientId}/${ipdId}`
    );
    const unsub = onValue(ipdRef, async (snap) => {
      if (!snap.exists()) {
        // still waiting for data
        return;
      }

      const ipdNode = snap.val();

      // b) once we have ipdNode, grab demographics from patientinfo
      const patientInfoSnap = await get(
        ref(db, `patients/patientinfo/${patientId}`)
      );
      if (!patientInfoSnap.exists()) {
        toast.error("Could not load patientinfo");
        return;
      }
      const p = patientInfoSnap.val();

      const rec: PatientRecord = {
        patientId,
        ipdId,
        uhid: p.uhid ?? patientId,
        name: p.name ?? "Unknown",
        mobileNumber: p.phone ?? "",
        address: p.address ?? "",
        age: p.age ?? "",
        gender: p.gender ?? "",
        relativeName: ipdNode.relativeName ?? "",
        relativePhone: ipdNode.relativePhone ?? "",
        relativeAddress: ipdNode.relativeAddress ?? "",
        roomType: ipdNode.roomType ?? "",
        bed: ipdNode.bed ?? "",
        admitDate:
          ipdNode.admissionDate ?? ipdNode.createdAt ?? undefined,
        dischargeDate:
          ipdNode.dischargeDate ?? undefined,
      };
      setRec(rec);

      // c) now ALSO attempt to load any existing discharge‐summary text
      const dischargeSnap = await get(
        ref(
          db,
          `patients/ipddetail/userdetailipd/${admitDateKey}/${patientId}/${ipdId}/dischargesummery`
        )
      );
      if (dischargeSnap.exists()) {
        const existing: DischargeData = dischargeSnap.val();
        setDischarge(existing);
        if (existing.lastUpdated) {
          setLastSaved(existing.lastUpdated);
        }
      }
    });

    return () => unsub();
  }, [patientId, ipdId]);

  /* ─── Step 3: “Ctrl+B → **bold**” textarea helper ───────────────────────────────── */
  const makeBold = (
    field: string,
    ta: HTMLTextAreaElement
  ) => {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.substring(start, end);
    if (!sel) return;
    const newText =
      ta.value.substring(0, start) +
      "**" +
      sel +
      "**" +
      ta.value.substring(end);
    setDischarge((d) => ({
      ...d,
      [field]: newText,
    }));
    // after inserting, restore focus & cursor
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        start + sel.length + 4,
        start + sel.length + 4
      );
    }, 0);
  };

  const handleKey = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    fieldName: string
  ) => {
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      const ta = textRefs.current[fieldName];
      if (ta) {
        makeBold(fieldName, ta);
      }
    }
  };

  const handleChange = (fieldName: string, val: string) => {
    setDischarge((d) => ({
      ...d,
      [fieldName]: val,
    }));
  };

  /* ─── Step 4: “Save Draft” → write dischargeData under userdetailipd/.../dischargesummery ─────────── */
  const saveDraft = async () => {
    if (!patientRecord) return;
    setSaving(true);
    try {
      const payload: DischargeData = {
        ...discharge,
        lastUpdated: new Date().toISOString(),
      };
      // write into our NEW node:
      await update(
        ref(
          db,
          `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/dischargesummery`
        ),
        payload
      );
      setLastSaved(payload.lastUpdated!);
      toast.success("Discharge note saved");
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  /* ─── Step 5: “Complete Discharge” → set dischargeDate under userinfoipd, free bed, AND write summary again ─ */
  const finalDischarge = async () => {
    if (!patientRecord) return;
    if (!patientRecord.roomType || !patientRecord.bed) {
      toast.error("Missing bed / ward information");
      return;
    }
    setLoading(true);
    try {
      const when = new Date().toISOString();
      const payload: DischargeData = {
        ...discharge,
        lastUpdated: when,
      };
  
      // a) update dischargeDate
      await update(
        ref(
          db,
          `patients/ipddetail/userinfoipd/${admitDateKey}/${patientId}/${ipdId}`
        ),
        {
          dischargeDate: when,
        }
      );
  
      // b) save the discharge summary text
      await update(
        ref(
          db,
          `patients/ipddetail/userdetailipd/${admitDateKey}/${patientId}/${ipdId}/dischargesummery`
        ),
        payload
      );
  
      // c) free up the bed
      await update(
        ref(
          db,
          `beds/${patientRecord.roomType}/${patientRecord.bed}`
        ),
        {
          status: "Available",
        }
      );
  
      // d) REMOVE from ipdactive!
      await remove(ref(db, `patients/ipdactive/${ipdId}`));
  
      toast.success("Patient discharged");
      setTimeout(() => {
        router.push(`/billing/${patientId}/${ipdId}/${admitDateKey}`);
      }, 1500);
    } catch (e) {
      console.error(e);
      toast.error("Error during discharge");
    } finally {
      setLoading(false);
    }
  };
  

  /* ─── Step 6: if we don’t yet have `patientRecord`, show spinner ───────────────────────────────── */
  if (!patientRecord) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-teal-50">
        <div className="text-center">
          <div className="h-16 w-16 border-4 border-t-teal-500 border-gray-200 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading patient record…</p>
        </div>
      </div>
    );
  }

  /* ─── Step 7: helper to render a single field with (Ctrl+B) hint ───────────────────── */
  const Field = (
    key: keyof DischargeData,
    label: string,
    rows = 4,
    placeholder = "Type here…"
  ) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        <span className="text-xs text-gray-500 ml-2">(Ctrl+B for bold)</span>
      </label>
      <textarea
        ref={(el) => {
          textRefs.current[key as string] = el;
        }}
        rows={rows}
        value={discharge[key] || ""}
        placeholder={placeholder}
        onKeyDown={(e) => handleKey(e, key as string)}
        onChange={(e) => handleChange(key as string, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-teal-500 resize-vertical"
      />
    </div>
  );

  /* ─── Step 8: full JSX ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* ─── Header ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-teal-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between">
        <button
  onClick={() => router.push(`/billing/${patientId}/${ipdId}/${admitDateKey}`)}
  className="flex items-center text-teal-600 hover:text-teal-800"
>
  <ArrowLeft size={18} className="mr-2" /> Back to Billing
</button>

          <div className="flex items-center gap-4">
            {lastSaved && (
              <div className="flex items-center text-sm text-gray-500">
                <Clock size={14} className="mr-1" />
                Last saved:{" "}
                {format(parseISO(lastSaved), "MMM dd yyyy • HH:mm")}
              </div>
            )}

            <button
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700"
              onClick={saveDraft}
              disabled={saving}
            >
              {saving ? (
                <span className="animate-spin border-2 border-white border-t-transparent h-4 w-4 rounded-full mr-2" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              {saving ? "Saving…" : "Save Info"}
            </button>

            {!patientRecord.dischargeDate && (
              <button
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700"
                onClick={finalDischarge}
                disabled={loading}
              >
                {loading ? (
                  <span className="animate-spin border-2 border-white border-t-transparent h-4 w-4 rounded-full mr-2" />
                ) : (
                  <UserCheck size={16} className="mr-2" />
                )}
                {loading ? "Discharging…" : "Discharge Patient"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* ─── Patient Summary Card ─────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {patientRecord.name}
                  </h1>
                  <p className="text-teal-50">
                    UHID: {patientRecord.uhid}
                  </p>
                </div>

                <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                    <Bed size={14} className="mr-2" />
                    {patientRecord.roomType || "No Room"} •{" "}
                    {patientRecord.roomType &&
                    patientRecord.bed &&
                    beds[patientRecord.roomType]?.[patientRecord.bed]
                      ?.bedNumber
                      ? beds[patientRecord.roomType][
                          patientRecord.bed
                        ].bedNumber
                      : "Unknown Bed"}
                  </div>

                  <div className="mt-2 text-teal-50 text-sm">
                    {patientRecord.dischargeDate ? (
                      <span className="inline-flex items-center">
                        <CheckCircle size={14} className="mr-1" /> Discharged:{" "}
                        {format(
                          parseISO(patientRecord.dischargeDate),
                          "dd MMM yyyy"
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <Calendar size={14} className="mr-1" /> Admitted:{" "}
                        {patientRecord.admitDate
                          ? format(
                              parseISO(patientRecord.admitDate),
                              "dd MMM yyyy"
                            )
                          : "Unknown"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ─── Patient Details ─────────────────────────── */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <User size={18} className="mr-2 text-teal-600" /> Patient
                    Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-start">
                      <Phone
                        size={16}
                        className="mr-2 text-gray-400 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-500">Mobile</p>
                        <p className="font-medium">
                          {patientRecord.mobileNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <MapPin
                        size={16}
                        className="mr-2 text-gray-400 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-500">Address</p>
                        <p className="font-medium">
                          {patientRecord.address || "Not provided"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-sm text-gray-500">Age</p>
                        <p className="font-medium">
                          {patientRecord.age || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Gender</p>
                        <p className="font-medium">
                          {patientRecord.gender || "Not provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Relative Details ────────────────────────── */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <User size={18} className="mr-2 text-teal-600" /> Relative
                    Details
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Name</p>
                      <p className="font-medium">
                        {patientRecord.relativeName || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium">
                        {patientRecord.relativePhone || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Address</p>
                      <p className="font-medium">
                        {patientRecord.relativeAddress || "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ─── Discharge Status ───────────────────────── */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <FileText size={18} className="mr-2 text-teal-600" />{" "}
                    Discharge Status
                  </h3>
                  <div className="space-y-3">
                    {patientRecord.dischargeDate ? (
                      <div className="flex items-center p-3 bg-green-50 rounded-lg">
                        <CheckCircle
                          size={20}
                          className="text-green-600 mr-3"
                        />
                        <div>
                          <p className="font-medium text-green-800">
                            Patient Discharged
                          </p>
                          <p className="text-sm text-green-600">
                            {format(
                              parseISO(patientRecord.dischargeDate),
                              "MMM dd, yyyy 'at' HH:mm"
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center p-3 bg-yellow-50 rounded-lg">
                        <AlertTriangle
                          size={20}
                          className="text-yellow-600 mr-3"
                        />
                        <div>
                          <p className="font-medium text-yellow-800">
                            Pending Discharge
                          </p>
                          <p className="text-sm text-yellow-600">
                            Complete the form to discharge
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Discharge Summary Form ───────────────────────── */}
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <FileText size={24} className="mr-3" /> Discharge Summary
              </h2>
              <p className="text-blue-50 mt-1">
                Fill in all medical discharge details below
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {Field(
                    "finalDiagnosis",
                    "Final Diagnosis (primary first)",
                    3
                  )}
                  {Field(
                    "procedures",
                    "Procedures (dates, complications)",
                    4
                  )}
                  {Field(
                    "provisionalDiagnosis",
                    "Provisional Diagnosis",
                    3
                  )}
                  {Field(
                    "historyOfPresentIllness",
                    "History of Present Illness",
                    4
                  )}
                  {Field("investigations", "Investigations", 4)}
                  {Field("treatmentGiven", "Treatment Given", 4)}
                </div>

                <div className="space-y-6">
                  {Field("hospitalCourse", "Hospital Course", 4)}
                  {Field(
                    "surgeryProcedureDetails",
                    "Surgery / Procedure Details",
                    4
                  )}
                  {Field("conditionAtDischarge", "Condition at Discharge", 3)}
                  {Field("dischargeMedication", "Discharge Medication", 4)}
                  {Field("followUp", "Follow-up", 3)}
                  {Field(
                    "dischargeInstructions",
                    "Discharge Instructions (diet, activity, etc.)",
                    4
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
