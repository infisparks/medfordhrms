// components/OPDManagement.tsx
"use client"; // Ensure this is a client component
import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { ref, set, onValue, remove } from "firebase/database";

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  appointmentDate: string;
}

const OPDManagement: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | "">(0);
  const [gender, setGender] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");

  // Handle patient form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name && age && gender && appointmentDate) {
      const patientId = new Date().getTime().toString(); // Use timestamp as ID
      try {
        await set(ref(db, `patients/${patientId}`), {
          id: patientId,
          name,
          age,
          gender,
          appointmentDate,
        });
        setName("");
        setAge(0);
        setGender("");
        setAppointmentDate("");
      } catch (error) {
        console.error("Error adding patient: ", error);
      }
    }
  };

  // Fetch patients from Firebase Realtime Database
  const fetchPatients = () => {
    const patientsRef = ref(db, 'patients');
    onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const patientsList: Patient[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key],
        }));
        setPatients(patientsList);
      } else {
        setPatients([]); // No patients found
      }
    });
  };

  const handleDelete = async (id: string) => {
    const patientRef = ref(db, `patients/${id}`);
    await remove(patientRef);
  };

  useEffect(() => {
    fetchPatients(); // Fetch patients on component mount
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">OPD Management</h2>
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col mb-2">
          <label htmlFor="name" className="font-medium">Name:</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="p-2 border rounded"
          />
        </div>
        <div className="flex flex-col mb-2">
          <label htmlFor="age" className="font-medium">Age:</label>
          <input
            type="number"
            id="age"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            required
            className="p-2 border rounded"
          />
        </div>
        <div className="flex flex-col mb-2">
          <label htmlFor="gender" className="font-medium">Gender:</label>
          <select
            id="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            required
            className="p-2 border rounded"
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="flex flex-col mb-2">
          <label htmlFor="appointmentDate" className="font-medium">Appointment Date:</label>
          <input
            type="date"
            id="appointmentDate"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            required
            className="p-2 border rounded"
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
          Add Patient
        </button>
      </form>

      <h3 className="text-xl font-semibold">Patients List</h3>
      <ul className="mt-4">
        {patients.map((patient) => (
          <li key={patient.id} className="border-b py-2 flex justify-between items-center">
            <div>
              <strong>{patient.name}</strong> - {patient.age} years - {patient.gender} - Appointment: {patient.appointmentDate}
            </div>
            <button
              className="ml-4 bg-red-600 text-white p-1 rounded hover:bg-red-700"
              onClick={() => handleDelete(patient.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OPDManagement;
