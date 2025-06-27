"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import format from "date-fns/format";

interface NurseNote {
  id?: string;
  observation: string;
  enteredBy: string;
  timestamp: string;
}

interface NurseNoteFormInputs {
  observation: string;
}

export default function NurseNoteComponent() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  const { register, handleSubmit, reset } = useForm<NurseNoteFormInputs>({
    defaultValues: { observation: "" },
  });

  const [notes, setNotes] = useState<NurseNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firebase path base for nurse notes under the new structure
  const dbPath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/nursenote`;

  // Fetch existing nurse notes for this patient from Firebase.
  useEffect(() => {
    const nurseNotesRef = ref(db, dbPath);
    const unsubscribe = onValue(nurseNotesRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedNotes: NurseNote[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        // Sort notes in descending order by timestamp.
        loadedNotes.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setNotes(loadedNotes);
      } else {
        setNotes([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  // Submit handler for nurse note.
  const onSubmit: SubmitHandler<NurseNoteFormInputs> = async (data) => {
    if (!data.observation.trim()) return;
    try {
      const enteredBy = auth.currentUser?.email || "unknown";
      const newNote: NurseNote = {
        observation: data.observation.trim(),
        enteredBy,
        timestamp: new Date().toISOString(),
      };
      const nurseNotesRef = ref(db, dbPath);
      await push(nurseNotesRef, newNote);
      reset({ observation: "" });
    } catch (error) {
      console.error("Error saving nurse note:", error);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">Add Nurse Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Textarea
              {...register("observation")}
              placeholder="Enter nurse observation..."
              className="w-full"
            />
            <Button type="submit" className="w-full">
              Add Note
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Nurse Notes</h2>
        {isLoading ? (
          <p className="text-center">Loading nurse notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-center text-slate-500">No nurse notes available.</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <Card key={note.id}>
                <CardContent>
                  <p className="text-sm text-slate-800 whitespace-pre-line">
                    {note.observation}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>By: {note.enteredBy}</span>
                    <span>
                      {format(new Date(note.timestamp), "dd MMM yyyy, hh:mm a")}
                    </span>
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
