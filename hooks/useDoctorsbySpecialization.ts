// hooks/useDoctorsBySpecialization.ts

import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../lib/firebase"; // Adjust the import path as necessary

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  email: string;
  phone: string;
}

const useDoctorsBySpecialization = (specialization: string) => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!specialization) {
      setDoctors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      const doctorsList: Doctor[] = [];

      for (let id in data) {
        if (data[id].specialization === specialization) {
          doctorsList.push({
            id,
            name: data[id].name,
            specialization: data[id].specialization,
            email: data[id].email,
            phone: data[id].phone,
          });
        }
      }

      setDoctors(doctorsList);
      setLoading(false);
      setError(null);
    }, (error) => {
      console.error("Error fetching doctors:", error);
      setError("Failed to fetch doctors.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [specialization]);

  return { doctors, loading, error };
};

export default useDoctorsBySpecialization;
