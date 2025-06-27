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

interface ProgressNote {
  id?: string;
  note: string;
  enteredBy: string;
  timestamp: string;
}

interface ProgressNoteFormInputs {
  note: string;
}

export default function ProgressNotes() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  const { register, handleSubmit, reset } = useForm<ProgressNoteFormInputs>({
    defaultValues: { note: "" },
  });
  const [notes, setNotes] = useState<ProgressNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Firebase path:
  // patients/ipddetail/userdetailipd/${patientId}/${ipdId}/progressNotes
  const basePath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/progressNotes`;

  // Fetch all progress notes for the given patient
  useEffect(() => {
    const notesRef = ref(db, basePath);
    const unsubscribe = onValue(notesRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedNotes: ProgressNote[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        // Sort by timestamp descending
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

  // When the form is submitted, save the new note
  const onSubmit: SubmitHandler<ProgressNoteFormInputs> = async (data) => {
    if (data.note.trim() === "") return;
    try {
      const enteredBy = auth.currentUser?.email || "unknown";
      const newNote: ProgressNote = {
        note: data.note.trim(),
        enteredBy,
        timestamp: new Date().toISOString(),
      };
      const notesRef = ref(db, basePath);
      await push(notesRef, newNote);
      reset({ note: "" });
    } catch (error) {
      console.error("Error saving progress note:", error);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">
            Add Progress Note
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Textarea
              {...register("note")}
              placeholder="Enter progress note..."
              className="w-full"
            />
            <Button type="submit" className="w-full">
              Add Note
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Progress Notes</h2>
        {isLoading ? (
          <p className="text-center">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-center text-slate-500">No progress notes available.</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <Card key={note.id}>
                <CardContent>
                  <p className="text-sm text-slate-800 whitespace-pre-line">{note.note}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>By: {note.enteredBy}</span>
                    <span>{format(new Date(note.timestamp), "dd MMM yyyy, hh:mm a")}</span>
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
