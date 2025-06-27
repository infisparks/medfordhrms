// pages/ipd.tsx
"use client";

import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, set, onValue, remove, update } from "firebase/database";

interface Bed {
  id: string;
  bedNumber: string;
  ward: string;
  type: string;
  status: "Available" | "Not Available";
  patientName?: string;
  admissionDate?: string;
}

const IPDManagement: React.FC = () => {
  const [beds, setBeds] = useState<Bed[]>([]);
  const [bedNumber, setBedNumber] = useState("");
  const [ward, setWard] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<"Available" | "Not Available">("Available");
  const [patientName, setPatientName] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");

  // Handle bed form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bedNumber && ward && type && status) {
      const bedId = new Date().getTime().toString();
      try {
        await set(ref(db, `beds/${bedId}`), {
          id: bedId,
          bedNumber,
          ward,
          type,
          status,
          patientName: status === "Not Available" ? patientName : "",
          admissionDate: status === "Not Available" ? admissionDate : "",
        });
        setBedNumber("");
        setWard("");
        setType("");
        setStatus("Available");
        setPatientName("");
        setAdmissionDate("");
      } catch (error) {
        console.error("Error adding bed: ", error);
      }
    }
  };

  // Fetch beds from Firebase Realtime Database
  const fetchBeds = () => {
    const bedsRef = ref(db, "beds");
    onValue(bedsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const bedsList: Bed[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setBeds(bedsList);
      } else {
        setBeds([]);
      }
    });
  };

  const handleDelete = async (id: string) => {
    const bedRef = ref(db, `beds/${id}`);
    await remove(bedRef);
  };

  const handleUpdateStatus = async (id: string, newStatus: "Available" | "Not Available") => {
    const bedRef = ref(db, `beds/${id}`);
    if (newStatus === "Available") {
      await update(bedRef, {
        status: newStatus,
        patientName: "",
        admissionDate: "",
      });
    } else {
      // You might want to handle assigning patient details here
      // For simplicity, setting status to Not Available without patient details
      await update(bedRef, {
        status: newStatus,
      });
    }
  };

  useEffect(() => {
    fetchBeds();
  }, []);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-center">IPD Management</h2>
      <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow-md">
        <form onSubmit={handleSubmit} className="mb-6">
          <h3 className="text-2xl font-semibold mb-4">Add New Bed</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label htmlFor="bedNumber" className="mb-1 font-medium">Bed Number:</label>
              <input
                type="text"
                id="bedNumber"
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                required
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="ward" className="mb-1 font-medium">Ward:</label>
              <input
                type="text"
                id="ward"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                required
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="type" className="mb-1 font-medium">Type:</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                className="p-2 border rounded"
              >
                <option value="">Select Type</option>
                <option value="ICU">ICU</option>
                <option value="General">General</option>
                <option value="Private">Private</option>
                <option value="Semi-Private">Semi-Private</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label htmlFor="status" className="mb-1 font-medium">Status:</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "Available" | "Not Available")}
                required
                className="p-2 border rounded"
              >
                <option value="Available">Available</option>
                <option value="Not Available">Not Available</option>
              </select>
            </div>
            {status === "Not Available" && (
              <>
                <div className="flex flex-col">
                  <label htmlFor="patientName" className="mb-1 font-medium">Patient Name:</label>
                  <input
                    type="text"
                    id="patientName"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required={status === "Not Available"}
                    className="p-2 border rounded"
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="admissionDate" className="mb-1 font-medium">Admission Date:</label>
                  <input
                    type="date"
                    id="admissionDate"
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    required={status === "Not Available"}
                    className="p-2 border rounded"
                  />
                </div>
              </>
            )}
          </div>
          <button
            type="submit"
            className="mt-4 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
          >
            Add Bed
          </button>
        </form>

        <h3 className="text-2xl font-semibold mb-4">Beds List</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr>
                <th className="py-2 px-4 border">Bed Number</th>
                <th className="py-2 px-4 border">Ward</th>
                <th className="py-2 px-4 border">Type</th>
                <th className="py-2 px-4 border">Status</th>
                <th className="py-2 px-4 border">Patient Name</th>
                <th className="py-2 px-4 border">Admission Date</th>
                <th className="py-2 px-4 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {beds.map((bed) => (
                <tr key={bed.id} className="text-center">
                  <td className="py-2 px-4 border">{bed.bedNumber}</td>
                  <td className="py-2 px-4 border">{bed.ward}</td>
                  <td className="py-2 px-4 border">{bed.type}</td>
                  <td className="py-2 px-4 border">
                    <span
                      className={`px-2 py-1 rounded ${
                        bed.status === "Available" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"
                      }`}
                    >
                      {bed.status}
                    </span>
                  </td>
                  <td className="py-2 px-4 border">{bed.patientName || "-"}</td>
                  <td className="py-2 px-4 border">{bed.admissionDate || "-"}</td>
                  <td className="py-2 px-4 border">
                    <button
                      className="bg-blue-600 text-white px-2 py-1 rounded mr-2 hover:bg-blue-700"
                      onClick={() =>
                        handleUpdateStatus(
                          bed.id,
                          bed.status === "Available" ? "Not Available" : "Available"
                        )
                      }
                    >
                      {bed.status === "Available" ? "Mark Unavailable" : "Mark Available"}
                    </button>
                    <button
                      className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      onClick={() => handleDelete(bed.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {beds.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center">
                    No beds available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default IPDManagement;
