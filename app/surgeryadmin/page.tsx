// app/surgeryadmin/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue } from "firebase/database";
import Head from "next/head";
import { AiOutlineCalendar, AiOutlineUser } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface ISurgeryEntry {
  id: string;
  name: string;
  gender: string;
  age: number;
  surgeryDate: string; // expected format YYYY-MM-DD
  surgeryTitle: string;
  finalDiagnosis: string;
  timestamp: number;
}

const AdminDashboard: React.FC = () => {
  const [surgeryEntries, setSurgeryEntries] = useState<ISurgeryEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ISurgeryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [selectedEntry, setSelectedEntry] = useState<ISurgeryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Fetch surgery entries from "patients" node
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(
      patientsRef,
      (snapshot) => {
        const data = snapshot.val();
        const entries: ISurgeryEntry[] = [];
        if (data) {
          Object.entries(data).forEach(([patientId, patientData]: [string, any]) => {
            // Check if the patient has surgery data
            if (patientData.surgery) {
              Object.entries(patientData.surgery).forEach(([surgeryKey, surgeryEntry]: [string, any]) => {
                entries.push({
                  id: `${patientId}_surgery_${surgeryKey}`,
                  name: patientData.name,
                  gender: patientData.gender,
                  age: Number(patientData.age) || 0,
                  surgeryDate: surgeryEntry.surgeryDate,
                  surgeryTitle: surgeryEntry.surgeryTitle,
                  finalDiagnosis: surgeryEntry.finalDiagnosis,
                  timestamp: surgeryEntry.timestamp,
                });
              });
            }
          });
        }
        // Sort entries by timestamp descending
        entries.sort((a, b) => b.timestamp - a.timestamp);
        setSurgeryEntries(entries);
        setFilteredEntries(entries);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching surgeries:", error);
        toast.error("Failed to fetch surgeries. Please try again.", {
          position: "top-right",
          autoClose: 5000,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter entries based on selected date range
  useEffect(() => {
    if (filterStartDate || filterEndDate) {
      const filtered = surgeryEntries.filter((entry) => {
        const entryDate = new Date(entry.surgeryDate);
        // Normalize time to ensure accurate date comparisons
        entryDate.setHours(0, 0, 0, 0);
        if (filterStartDate && filterEndDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          return entryDate >= start && entryDate <= end;
        } else if (filterStartDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          return entryDate >= start;
        } else if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          return entryDate <= end;
        }
        return true;
      });
      setFilteredEntries(filtered);
    } else {
      setFilteredEntries(surgeryEntries);
    }
  }, [filterStartDate, filterEndDate, surgeryEntries]);

  const handleCardClick = (entry: ISurgeryEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedEntry(null);
    setIsModalOpen(false);
  };

  return (
    <>
      <Head>
        <title>Admin - Dashboard</title>
        <meta
          name="description"
          content="Admin panel to view and manage surgery entries"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-blue-600 mb-8">
            Admin Dashboard
          </h1>

          {/* Date Filter Section */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <AiOutlineCalendar className="text-gray-600" size={24} />
              <DatePicker
                selected={filterStartDate}
                onChange={(date: Date | null) => setFilterStartDate(date || undefined)}
                selectsStart
                startDate={filterStartDate}
                endDate={filterEndDate}
                placeholderText="Start Date"
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                dateFormat="yyyy-MM-dd"
                isClearable
              />
            </div>
            <div className="flex items-center space-x-2">
              <AiOutlineCalendar className="text-gray-600" size={24} />
              <DatePicker
                selected={filterEndDate}
                onChange={(date: Date | null) => setFilterEndDate(date || undefined)}
                selectsEnd
                startDate={filterStartDate}
                endDate={filterEndDate}
                minDate={filterStartDate}
                placeholderText="End Date"
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                dateFormat="yyyy-MM-dd"
                isClearable
              />
            </div>
            <button
              onClick={() => {
                setFilterStartDate(undefined);
                setFilterEndDate(undefined);
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
            >
              Clear Filters
            </button>
          </div>

          {/* Loading Indicator */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-16 w-16"></div>
            </div>
          ) : (
            <>
              {/* No Entries Message */}
              {filteredEntries.length === 0 ? (
                <div className="text-center text-gray-600">
                  No surgery entries found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.id}
                      onClick={() => handleCardClick(entry)}
                      className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg cursor-pointer transition duration-200"
                    >
                      <div className="flex items-center mb-4">
                        <AiOutlineUser className="text-blue-500" size={30} />
                        <h2 className="ml-3 text-xl font-semibold">
                          {entry.name}
                        </h2>
                      </div>
                      <p className="text-gray-700">
                        <span className="font-semibold">Surgery Date:</span>{" "}
                        {entry.surgeryDate}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-semibold">Title:</span>{" "}
                        {entry.surgeryTitle}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-semibold">Diagnosis:</span>{" "}
                        {entry.finalDiagnosis.length > 50
                          ? `${entry.finalDiagnosis.substring(0, 50)}...`
                          : entry.finalDiagnosis}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail Modal */}
        {isModalOpen && selectedEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-11/12 md:w-3/4 lg:w-1/2 p-6 relative">
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 text-gray-600 hover:text-gray-800"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <h2 className="text-2xl font-bold mb-4">Surgery Details</h2>
              <div className="space-y-2">
                <p className="text-gray-700">
                  <span className="font-semibold">Patient Name:</span>{" "}
                  {selectedEntry.name}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Gender:</span>{" "}
                  {selectedEntry.gender}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Age:</span>{" "}
                  {selectedEntry.age}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Surgery Date:</span>{" "}
                  {selectedEntry.surgeryDate}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Title of Surgery:</span>{" "}
                  {selectedEntry.surgeryTitle}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Final Diagnosis:</span>{" "}
                  {selectedEntry.finalDiagnosis}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Recorded At:</span>{" "}
                  {new Date(selectedEntry.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Loader Styles */}
      <style jsx>{`
        .loader {
          border-top-color: #3498db;
          animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
};

export default AdminDashboard;
