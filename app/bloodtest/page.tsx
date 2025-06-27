"use client"; 
// If you're using Next.js 13+ with the App Router, keep "use client".
// If you're on Pages Router (pages/ directory), you can remove it if it's not needed.

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, push, set, onValue, update } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineFieldBinary,
  AiOutlineDollarCircle,
} from "react-icons/ai";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Firebase imports — adjust paths as needed
import { db as dbGautami } from "../../lib/firebase";
import { db as dbMedford } from "../../lib/firebaseMedford";

/* ------------------------------------------------------------------
  Type definitions
------------------------------------------------------------------ */
interface IPatientFormInput {
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  bloodTestName: string;
  amount: number;
  paymentId?: string;
  doctor?: string; // This will hold the final doctor ID
}

interface IBloodTestEntry {
  bloodTestName: string;
}

interface Doctor {
  id: string;
  name: string;
}

interface GautamiPatient {
  name: string;
  phone: string;
  address: string;
  age: number;
  gender: string;
}

interface MedfordPatient {
  patientId: string;
  name: string;
  contact: string;
  dob: string;
  gender: string;
  hospitalName: string;
}

interface CombinedPatient {
  id: string;
  name: string;
  phone?: string;
  source: "gautami" | "medford";
  data: GautamiPatient | MedfordPatient;
}

/* ------------------------------------------------------------------
  Utility function for generating random patient IDs
------------------------------------------------------------------ */
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/* ------------------------------------------------------------------
  The main component
------------------------------------------------------------------ */
const PathologyEntryPage: React.FC = () => {
  /* --------------------------------------------
     1. State for data from Firebase
  -------------------------------------------- */
  const [bloodTestOptions, setBloodTestOptions] = useState<string[]>([]);
  const [doctorOptions, setDoctorOptions] = useState<Doctor[]>([]);
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);

  /* --------------------------------------------
     2. React Hook Form Setup
  -------------------------------------------- */
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue, // We'll call this when user clicks suggestions
  } = useForm<IPatientFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      address: "",
      gender: "",
      bloodTestName: "",
      amount: 0,
      paymentId: "",
      doctor: "", // we'll store the final doctor ID here
    },
  });

  const [loading, setLoading] = useState(false);

  /* --------------------------------------------
     3. Auto-Complete States & Refs
  -------------------------------------------- */
  // Patient name suggestions
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null);
  const patientSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // For the name field local typed text (optional)
  const [patientNameInput, setPatientNameInput] = useState("");

  // Phone auto-complete states
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<CombinedPatient[]>([]);
  const phoneSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Blood test suggestions
  const [filteredBloodTests, setFilteredBloodTests] = useState<string[]>([]);
  const [showBloodTestSuggestions, setShowBloodTestSuggestions] = useState(false);
  const bloodTestSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Doctor auto-complete
  //  - We'll keep a local typed string for doctor search
  //  - We'll put the final doctor ID into the "doctor" form field
  const [doctorTyped, setDoctorTyped] = useState("");
  const [filteredDoctors, setFilteredDoctors] = useState<{ label: string; value: string }[]>([]);
  const doctorSuggestionBoxRef = useRef<HTMLUListElement>(null);

  /* ------------------------------------------------------------------
     4. Fetch data from Firebase (on mount only) 
  ------------------------------------------------------------------ */

  // === Fetch Blood Tests ===
  useEffect(() => {
    const bloodTestsRef = ref(dbGautami, "bloodTests");
    const unsubscribe = onValue(bloodTestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const typedData = data as Record<string, IBloodTestEntry>;
        const testNames: string[] = Object.values(typedData).map(
          (entry) => entry.bloodTestName
        );
        setBloodTestOptions(Array.from(new Set(testNames)));
      } else {
        setBloodTestOptions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // === Fetch Doctors ===
  useEffect(() => {
    const doctorsRef = ref(dbGautami, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // If your DB stores doctors as an object of { id, name }, then:
        const docsArray = Object.values(data) as Doctor[];
        setDoctorOptions(docsArray);
      } else {
        setDoctorOptions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // === Fetch Gautami Patients ===
  useEffect(() => {
    const patientsRef = ref(dbGautami, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            source: "gautami",
            data: data[key],
          });
        }
      }
      setGautamiPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // === Fetch Medford Patients ===
  useEffect(() => {
    const medfordPatientsRef = ref(dbMedford, "patients");
    const unsubscribe = onValue(medfordPatientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          const rec: MedfordPatient = data[key];
          loaded.push({
            id: rec.patientId,
            name: rec.name,
            phone: rec.contact,
            source: "medford",
            data: rec,
          });
        }
      }
      setMedfordPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Combine both sets of patients for suggestion usage
  const allCombinedPatients = [...gautamiPatients, ...medfordPatients];

  /* ------------------------------------------------------------------
     5. Name Auto-Complete
  ------------------------------------------------------------------ */
  const handlePatientNameChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    onChangeFn: (...event: any[]) => void
  ) => {
    // Let react-hook-form track this new value
    onChangeFn(e);
    const inputValue = e.target.value.trim();
    setPatientNameInput(inputValue);

    if (inputValue.length >= 2) {
      const lower = inputValue.toLowerCase();
      const suggestions = allCombinedPatients.filter((p) =>
        p.name.toLowerCase().includes(lower)
      );
      setPatientSuggestions(suggestions);
      setSelectedPatient(null);
    } else {
      setPatientSuggestions([]);
    }
  };

  /* ------------------------------------------------------------------
     6. Phone Auto-Complete
  ------------------------------------------------------------------ */
  const handlePatientPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setPatientPhoneInput(inputValue);
    setValue("phone", inputValue);

    if (inputValue.trim().length >= 2) {
      const suggestions = allCombinedPatients.filter(
        (p) => p.phone && p.phone.includes(inputValue)
      );
      setPhoneSuggestions(suggestions);
      setSelectedPatient(null);
    } else {
      setPhoneSuggestions([]);
    }
  };

  /* ------------------------------------------------------------------
     7. On Select: Fill in all known details
  ------------------------------------------------------------------ */
  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient);

    // Fill form fields from this patient's data
    setValue("name", patient.name);
    setPatientNameInput(patient.name);

    setValue("phone", patient.phone || "");
    setPatientPhoneInput(patient.phone || "");

    if (patient.source === "gautami") {
      const gData = patient.data as GautamiPatient;
      setValue("address", gData.address);
      setValue("age", gData.age);
      setValue("gender", gData.gender);
    } else {
      // medford
      const mData = patient.data as MedfordPatient;
      setValue("gender", mData.gender);
    }

    // Clear suggestions
    setPatientSuggestions([]);
    setPhoneSuggestions([]);

    toast.info(`Selected patient from ${patient.source.toUpperCase()}`);
  };

  /* ------------------------------------------------------------------
     8. Blood Test Auto-Complete
  ------------------------------------------------------------------ */
  const handleBloodTestChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    onChangeFn: (...event: any[]) => void
  ) => {
    onChangeFn(e);
    const inputVal = e.target.value.trim();
    if (inputVal.length === 0) {
      setFilteredBloodTests([]);
      setShowBloodTestSuggestions(false);
      return;
    }
    const matched = bloodTestOptions.filter((test) =>
      test.toLowerCase().includes(inputVal.toLowerCase())
    );
    setFilteredBloodTests(matched);
    setShowBloodTestSuggestions(matched.length > 0);
  };

  const handleBloodTestSelect = (testName: string) => {
    setValue("bloodTestName", testName);
    setFilteredBloodTests([]);
    setShowBloodTestSuggestions(false);
  };

  /* ------------------------------------------------------------------
     9. Doctor Auto-Complete
  ------------------------------------------------------------------ */
  const handleDoctorTypedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value;
    setDoctorTyped(typed);
    setValue("doctor", ""); // clear any existing doctor ID
    if (typed.trim().length === 0) {
      setFilteredDoctors([]);
      return;
    }
    const lower = typed.toLowerCase();
    const matched = doctorOptions
      .filter((doc) => doc.name.toLowerCase().includes(lower))
      .map((doc) => ({ label: doc.name, value: doc.id }));
    setFilteredDoctors(matched);
  };

  const handleDoctorSuggestionClick = (id: string, name: string) => {
    setValue("doctor", id);
    setDoctorTyped(name);
    setFilteredDoctors([]);
  };

  /* ------------------------------------------------------------------
     10. Close suggestion boxes if user clicks outside
  ------------------------------------------------------------------ */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        patientSuggestionBoxRef.current &&
        !patientSuggestionBoxRef.current.contains(e.target as Node)
      ) {
        setPatientSuggestions([]);
      }
      if (
        phoneSuggestionBoxRef.current &&
        !phoneSuggestionBoxRef.current.contains(e.target as Node)
      ) {
        setPhoneSuggestions([]);
      }
      if (
        bloodTestSuggestionBoxRef.current &&
        !bloodTestSuggestionBoxRef.current.contains(e.target as Node)
      ) {
        setShowBloodTestSuggestions(false);
      }
      if (
        doctorSuggestionBoxRef.current &&
        !doctorSuggestionBoxRef.current.contains(e.target as Node)
      ) {
        setFilteredDoctors([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ------------------------------------------------------------------
     11. Form Submission
  ------------------------------------------------------------------ */
  const onSubmit: SubmitHandler<IPatientFormInput> = async (data) => {
    setLoading(true);
    try {
      let patientId: string;
      if (selectedPatient) {
        // Existing patient
        patientId = selectedPatient.id;
        const patientRef = ref(dbGautami, `patients/${patientId}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
        });
      } else {
        // New patient
        patientId = generatePatientId();
        // Save full details in Gautami
        await set(ref(dbGautami, `patients/${patientId}`), {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
          createdAt: new Date().toISOString(),
          uhid: patientId,
          ipd: {},
        });
        // Minimal details in Medford
        await set(ref(dbMedford, `patients/${patientId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender,
          dob: "",
          patientId: patientId,
          hospitalName: "MEDFORD",
        });
      }

      // Save pathology entry under that patient in Gautami
      const pathologyRef = ref(dbGautami, `patients/${patientId}/pathology`);
      const newPathRef = push(pathologyRef);
      await set(newPathRef, {
        bloodTestName: data.bloodTestName,
        amount: data.amount,
        paymentId: data.paymentId || null,
        createdAt: new Date().toISOString(),
        doctor: data.doctor || "", // this is the doctor ID
      });

      toast.success("Patient pathology entry saved successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset form and local states
      reset({
        name: "",
        phone: "",
        age: undefined,
        address: "",
        gender: "",
        bloodTestName: "",
        amount: 0,
        paymentId: "",
        doctor: "",
      });
      setSelectedPatient(null);
      setPatientNameInput("");
      setPatientPhoneInput("");
      setPatientSuggestions([]);
      setPhoneSuggestions([]);
      setDoctorTyped("");
    } catch (err) {
      console.error("Error saving patient pathology entry:", err);
      toast.error("Failed to save entry. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------
     12. Rendering
  ------------------------------------------------------------------ */
  return (
    <>
      <Head>
        <title>Admin - Pathology Entry</title>
        <meta name="description" content="Add patient details and blood tests" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-green-100 to-green-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-green-600 mb-8">
            Pathology Entry
          </h2>
          <div className="mb-6 text-center text-gray-600">
            {new Date().toLocaleString()}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* ======= Patient Name (auto-complete) ======= */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("name", {
                  required: "Patient name is required",
                  onChange: (e) => handlePatientNameChange(e, (v) => v),
                })}
                value={patientNameInput}
                onChange={(e) => {
                  // 1) Update local state
                  setPatientNameInput(e.target.value);
                  // 2) Also do react-hook-form + suggestions
                  handlePatientNameChange(e, (v) => v);
                }}
              />

              {/* Patient Name Suggestions */}
              {patientSuggestions.length > 0 && (
                <ul
                  ref={patientSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {patientSuggestions.map((patient) => (
                    <li
                      key={patient.id}
                      onClick={() => handlePatientSuggestionClick(patient)}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer flex justify-between items-center"
                    >
                      <span>
                        {patient.name}
                        {patient.phone ? ` - ${patient.phone}` : ""}
                      </span>
                      {patient.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* ======= Phone with Auto-Complete ======= */}
            <div className="relative">
              <AiOutlinePhone className="absolute top-3 left-3 text-gray-400" />
              <input
                placeholder="Patient Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.phone ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                value={patientPhoneInput}
                onChange={handlePatientPhoneChange}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
              )}
              {/* Phone Suggestions */}
              {phoneSuggestions.length > 0 && (
                <ul
                  ref={phoneSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {phoneSuggestions.map((patient) => (
                    <li
                      key={patient.id}
                      onClick={() => handlePatientSuggestionClick(patient)}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer flex justify-between items-center"
                    >
                      <span>
                        {patient.name}
                        {patient.phone ? ` - ${patient.phone}` : ""}
                      </span>
                      {patient.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ======= Age ======= */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                min={0}
                placeholder="Age"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.age ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("age", { valueAsNumber: true })}
              />
              {errors.age && (
                <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>
              )}
            </div>

            {/* ======= Address ======= */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                placeholder="Address"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.address ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("address")}
              />
              {errors.address && (
                <p className="text-red-500 text-sm mt-1">{errors.address.message}</p>
              )}
            </div>

            {/* ======= Gender ======= */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <select
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.gender ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("gender")}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>
              )}
            </div>

            {/* ======= Blood Test Name (auto-complete) ======= */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                placeholder="Blood Test Name"
                autoComplete="off"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.bloodTestName ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("bloodTestName", {
                  required: "Blood test name is required",
                  onChange: (e) => handleBloodTestChange(e, (v) => v),
                })}
              />

              {/* Blood Test Suggestions */}
              {showBloodTestSuggestions && filteredBloodTests.length > 0 && (
                <ul
                  ref={bloodTestSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {filteredBloodTests.map((test, index) => (
                    <li
                      key={index}
                      onClick={() => handleBloodTestSelect(test)}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer"
                    >
                      {test}
                    </li>
                  ))}
                </ul>
              )}

              {errors.bloodTestName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.bloodTestName.message}
                </p>
              )}
            </div>

            {/* ======= Payment ID (optional) ======= */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                placeholder="Payment ID (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.paymentId ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("paymentId")}
              />
              {errors.paymentId && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.paymentId.message}
                </p>
              )}
            </div>

            {/* ======= Doctor Refer (auto-complete) ======= */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                placeholder="Referred By Doctor (Optional)"
                autoComplete="off"
                value={doctorTyped}
                onChange={handleDoctorTypedChange}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ${
                  errors.doctor ? "border-red-500" : "border-gray-300"
                }`}
              />

              {/* Doctor Suggestions */}
              {filteredDoctors.length > 0 && (
                <ul
                  ref={doctorSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {filteredDoctors.map((item) => (
                    <li
                      key={item.value}
                      onClick={() => handleDoctorSuggestionClick(item.value, item.label)}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer"
                    >
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* Hidden input to store the final doctor ID */}
              <input type="hidden" {...register("doctor")} />

              {errors.doctor && (
                <p className="text-red-500 text-sm mt-1">{errors.doctor.message}</p>
              )}
            </div>

            {/* ======= Amount ======= */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                min={0}
                placeholder="Amount (Rs)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.amount ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>
              )}
            </div>

            {/* ======= Submit Button ======= */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Patient"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default PathologyEntryPage;
