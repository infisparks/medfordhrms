"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, push, set, onValue, update } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlineFieldBinary,
  AiOutlineCalendar,
  AiOutlineFileText,
  AiOutlinePhone,
} from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Import Firebase (Gautami DB)
import { db } from "../../lib/firebase";

interface ISurgeryFormInput {
  // Personal details
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  // Surgery-specific details
  surgeryDate: string; // In YYYY-MM-DD format
  surgeryTitle: string;
  finalDiagnosis: string;
}

interface PatientRecord {
  uhid: string;
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  createdAt: number;
  ipd?: any;
  surgery?: Record<string, any>;
}

// Helper function to generate a 10-character alphanumeric UHID
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const SurgeryEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
  } = useForm<ISurgeryFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      address: "",
      gender: "",
      surgeryDate: new Date().toISOString().split("T")[0],
      surgeryTitle: "",
      finalDiagnosis: "",
    },
  });

  const [loading, setLoading] = useState(false);

  // Auto-complete state for patient details
  const [allPatients, setAllPatients] = useState<PatientRecord[]>([]);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<
    { label: string; value: string }[]
  >([]);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    data: PatientRecord;
  } | null>(null);
  const patientSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Auto-complete state for patient phone
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<
    { label: string; value: string }[]
  >([]);
  const phoneSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Fetch all patient records from Firebase
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: PatientRecord[] = [];
      if (data) {
        for (const key in data) {
          loaded.push({ uhid: key, ...data[key] });
        }
      }
      setAllPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Filter suggestions based on Patient Name input (min. 2 characters)
  useEffect(() => {
    if (patientNameInput.length >= 2) {
      const lower = patientNameInput.toLowerCase();
      const suggestions = allPatients
        .filter((p) => p.name.toLowerCase().includes(lower))
        .map((p) => ({
          label: `${p.name} - ${p.phone}`,
          value: p.uhid,
        }));
      setPatientSuggestions(suggestions);
    } else {
      setPatientSuggestions([]);
    }
  }, [patientNameInput, allPatients]);

  // Filter suggestions based on Patient Phone input (min. 2 characters)
  useEffect(() => {
    if (patientPhoneInput.length >= 2) {
      const suggestions = allPatients
        .filter((p) => p.phone && p.phone.includes(patientPhoneInput))
        .map((p) => ({
          label: `${p.name} - ${p.phone}`,
          value: p.uhid,
        }));
      setPhoneSuggestions(suggestions);
    } else {
      setPhoneSuggestions([]);
    }
  }, [patientPhoneInput, allPatients]);

  // Close suggestion dropdown when clicking outside (for both name and phone)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        patientSuggestionBoxRef.current &&
        !patientSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setPatientSuggestions([]);
      }
      if (
        phoneSuggestionBoxRef.current &&
        !phoneSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setPhoneSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // When a patient suggestion is clicked (from either name or phone), auto-fill the form
  const handlePatientSuggestionClick = (uhid: string) => {
    const found = allPatients.find((p) => p.uhid === uhid);
    if (!found) return;
    setSelectedPatient({ id: found.uhid, data: found });
    setValue("name", found.name);
    setValue("phone", found.phone);
    setValue("age", found.age);
    setValue("address", found.address);
    setValue("gender", found.gender);
    setPatientNameInput(found.name);
    setPatientPhoneInput(found.phone);
    setPatientSuggestions([]);
    setPhoneSuggestions([]);
    toast.info(`Patient ${found.name} selected.`);
  };

  const onSubmit: SubmitHandler<ISurgeryFormInput> = async (data) => {
    setLoading(true);
    try {
      let uhid: string;
      if (selectedPatient) {
        // Existing patient: update personal details
        uhid = selectedPatient.id;
        const patientRef = ref(db, `patients/${uhid}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
        });
      } else {
        // New patient: create record with generated UHID
        uhid = generatePatientId();
        await set(ref(db, `patients/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
          createdAt: Date.now(),
          uhid: uhid,
          ipd: {},
        });
      }
      // Save surgery details under the patient's "surgery" node
      const surgeryRef = ref(db, `patients/${uhid}/surgery`);
      const newSurgeryRef = push(surgeryRef);
      await set(newSurgeryRef, {
        surgeryDate: data.surgeryDate,
        surgeryTitle: data.surgeryTitle,
        finalDiagnosis: data.finalDiagnosis,
        timestamp: Date.now(),
      });

      toast.success("Surgery entry saved successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset form and clear auto-complete state
      reset({
        name: "",
        phone: "",
        age: undefined,
        address: "",
        gender: "",
        surgeryDate: new Date().toISOString().split("T")[0],
        surgeryTitle: "",
        finalDiagnosis: "",
      });
      setPatientNameInput("");
      setPatientPhoneInput("");
      setSelectedPatient(null);
      setPatientSuggestions([]);
      setPhoneSuggestions([]);
    } catch (error) {
      console.error("Error saving surgery entry:", error);
      toast.error("Failed to save surgery entry. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin - Surgery Entry</title>
        <meta name="description" content="Add patient surgery details" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-blue-100 to-blue-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-blue-600 mb-8">
            Surgery Entry
          </h2>
          <div className="mb-6 text-center text-gray-600">
            {new Date().toLocaleString()}
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Name with Auto-Complete */}
            <div className="relative">
              <label htmlFor="name" className="block text-gray-700 font-medium mb-1">
                Patient Name <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <input
                id="name"
                type="text"
                value={patientNameInput}
                onChange={(e) => {
                  setPatientNameInput(e.target.value);
                  setValue("name", e.target.value, { shouldValidate: true });
                  setSelectedPatient(null);
                }}
                placeholder="Patient Name"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
              />
              {patientSuggestions.length > 0 && (
                <ul
                  ref={patientSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {patientSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.value}
                      onClick={() => handlePatientSuggestionClick(suggestion.value)}
                      className="px-4 py-2 hover:bg-blue-100 cursor-pointer"
                    >
                      {suggestion.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Patient Phone with Auto-Complete */}
            <div className="relative">
              <label htmlFor="phone" className="block text-gray-700 font-medium mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <AiOutlinePhone className="absolute top-9 left-3 text-gray-400" />
              <input
                id="phone"
                type="text"
                value={patientPhoneInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setPatientPhoneInput(val);
                  setValue("phone", val, { shouldValidate: true });
                }}
                placeholder="Patient Phone Number"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
              />
              {phoneSuggestions.length > 0 && (
                <ul
                  ref={phoneSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {phoneSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.value}
                      onClick={() => handlePatientSuggestionClick(suggestion.value)}
                      className="px-4 py-2 hover:bg-blue-100 cursor-pointer"
                    >
                      {suggestion.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Age Field */}
            <div className="relative">
              <label htmlFor="age" className="block text-gray-700 font-medium mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <AiOutlineFieldBinary className="absolute top-9 left-3 text-gray-400" />
              <input
                id="age"
                type="number"
                {...register("age", { valueAsNumber: true })}
                placeholder="Age"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                min="0"
              />
            </div>

            {/* Address Field */}
            <div className="relative">
              <label htmlFor="address" className="block text-gray-700 font-medium mb-1">
                Address <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <input
                id="address"
                type="text"
                {...register("address")}
                placeholder="Address"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
              />
            </div>

            {/* Gender Field */}
            <div className="relative">
              <label htmlFor="gender" className="block text-gray-700 font-medium mb-1">
                Gender <span className="text-red-500">*</span>
              </label>
              <AiOutlineFieldBinary className="absolute top-9 left-3 text-gray-400" />
              <select
                id="gender"
                {...register("gender")}
                className="w-full pl-10 pr-4 py-3 border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Surgery Date Field */}
            <div className="relative">
              <label htmlFor="surgeryDate" className="block text-gray-700 font-medium mb-1">
                Surgery Date <span className="text-red-500">*</span>
              </label>
              <AiOutlineCalendar className="absolute top-9 left-3 text-gray-400" />
              <input
                id="surgeryDate"
                type="date"
                {...register("surgeryDate")}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Surgery Title Field */}
            <div className="relative">
              <label htmlFor="surgeryTitle" className="block text-gray-700 font-medium mb-1">
                Title of Surgery <span className="text-red-500">*</span>
              </label>
              <AiOutlineFieldBinary className="absolute top-9 left-3 text-gray-400" />
              <input
                id="surgeryTitle"
                type="text"
                {...register("surgeryTitle")}
                placeholder="Title of Surgery"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
              />
            </div>

            {/* Final Diagnosis Field */}
            <div className="relative">
              <label htmlFor="finalDiagnosis" className="block text-gray-700 font-medium mb-1">
                Final Diagnosis <span className="text-red-500">*</span>
              </label>
              <AiOutlineFileText className="absolute top-9 left-3 text-gray-400" />
              <textarea
                id="finalDiagnosis"
                {...register("finalDiagnosis")}
                placeholder="Final Diagnosis"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                rows={4}
              ></textarea>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Submitting..." : "Add Surgery Entry"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default SurgeryEntryPage;
