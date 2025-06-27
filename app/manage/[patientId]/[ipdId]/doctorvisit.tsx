"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import format from "date-fns/format";

// Define interface for a doctor visit record.
interface DoctorVisit {
  id?: string;
  doctorName: string;
  dateTime: string; // stored as an ISO string
  enteredBy: string;
}

// Form inputs for a new visit.
interface DoctorVisitFormInputs {
  doctorName: string;
  dateTime: string;
}

export default function DoctorVisits() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  // Set up react-hook-form.
  const { register, handleSubmit, reset } = useForm<DoctorVisitFormInputs>({
    defaultValues: {
      doctorName: "",
      dateTime: new Date().toISOString().slice(0, 16),
    },
  });

  const [visits, setVisits] = useState<DoctorVisit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch doctor visits from the new Firebase path.
  useEffect(() => {
    const visitsRef = ref(
      db,
      `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/doctorvisit`
    );
    const unsubscribe = onValue(visitsRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val() as Record<string, Omit<DoctorVisit, "id">>;
        const loaded: DoctorVisit[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        // Sort visits by dateTime in ascending order.
        loaded.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
        setVisits(loaded);
      } else {
        setVisits([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  // Form submission to add a new doctor visit.
  const onSubmit: SubmitHandler<DoctorVisitFormInputs> = async (data) => {
    try {
      const enteredBy = auth.currentUser?.email || "unknown";
      const newVisit: Omit<DoctorVisit, "id"> = {
        doctorName: data.doctorName,
        dateTime: data.dateTime,
        enteredBy,
      };
      const visitsRef = ref(
        db,
        `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/doctorvisit`
      );
      await push(visitsRef, newVisit);
      reset({
        doctorName: "",
        dateTime: new Date().toISOString().slice(0, 16),
      });
    } catch (error) {
      console.error("Error saving doctor visit:", error);
    }
  };

  // Group visits by day (format date as "dd MMM yyyy").
  const groupedVisits = visits.reduce((acc: Record<string, DoctorVisit[]>, visit) => {
    const day = format(new Date(visit.dateTime), "dd MMM yyyy");
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(visit);
    return acc;
  }, {});

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">Add Doctor Visit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Doctor Name
              </label>
              <Input
                type="text"
                {...register("doctorName")}
                placeholder="Enter doctor name"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Date &amp; Time
              </label>
              <Input
                type="datetime-local"
                {...register("dateTime")}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full">
              Add Visit
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Doctor Visits</h2>
        {isLoading ? (
          <p className="text-center">Loading doctor visits...</p>
        ) : Object.keys(groupedVisits).length === 0 ? (
          <p className="text-center text-slate-500">No doctor visits recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedVisits).map(([day, dayVisits]) => (
              <Card key={day}>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">{day}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {dayVisits.map((visit) => (
                      <div key={visit.id} className="bg-slate-50 p-2 rounded shadow-sm">
                        <p className="font-medium">{visit.doctorName}</p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(visit.dateTime), "hh:mm a")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Entered By: {dayVisits[0].enteredBy}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
