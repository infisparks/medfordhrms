"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import format from "date-fns/format";

interface ChargeSheet {
  id?: string;
  description: string;
  doneBy: string;
  enteredBy: string;
  timestamp: string;
}

interface ChargeSheetFormInputs {
  description: string;
  doneBy: string;
}

export default function PatientCharges() {
  const { patientId, ipdId } = useParams() as {
    patientId: string;
    ipdId: string;
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
  } = useForm<ChargeSheetFormInputs>({
    defaultValues: {
      description: "",
      doneBy: "",
    },
  });

  const [chargeSheets, setChargeSheets] = useState<ChargeSheet[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listening, setListening] = useState(false);

  // Firebase path under new JSON structure:
  // patients/ipddetail/userdetailipd/${patientId}/${ipdId}/chargeSheets
  const basePath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/chargeSheets`;

  // Load existing charge sheets
  useEffect(() => {
    const sheetsRef = ref(db, basePath);
    const unsub = onValue(sheetsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const sheets: ChargeSheet[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setChargeSheets(sheets);
      } else {
        setChargeSheets([]);
      }
    });
    return () => unsub();
  }, [patientId, ipdId]);

  // Handle AI voice extraction
  const handleVoiceInput = useCallback(
    async (transcript: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const prompt = `Extract these as JSON with keys "description" and "doneBy" from this: "${transcript}"`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        const json = await res.json();
        const aiData: Partial<ChargeSheetFormInputs> = JSON.parse(
          json.candidates[0].content.parts[0].text
        );
        Object.entries(aiData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            setValue(key as keyof ChargeSheetFormInputs, String(val));
          }
        });
      } catch (err) {
        console.error("AI fill failed:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [setValue]
  );

  // Start speech recognition
  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition API not supported.");
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      handleVoiceInput(transcript);
    };
    recog.onend = () => setListening(false);
    recog.start();
    setListening(true);
  };

  // Form submission
  const onSubmit: SubmitHandler<ChargeSheetFormInputs> = async (data) => {
    setIsSubmitting(true);
    try {
      const entry: ChargeSheet = {
        ...getValues(),
        enteredBy: auth.currentUser?.email || "unknown",
        timestamp: new Date().toISOString(),
      };
      const sheetsRef = ref(db, basePath);
      await push(sheetsRef, entry);
      reset({ description: "", doneBy: "" });
    } catch (error) {
      console.error("Error saving charge sheet:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add New Charge Sheet</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={startListening}
            disabled={listening || isSubmitting}
            className="w-full mb-4"
          >
            {listening ? "Listening…" : "Fill via Voice"}
          </Button>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Charge Details</label>
              <Textarea
                {...register("description", { required: true })}
                placeholder="Enter details..."
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Done By</label>
              <Input
                {...register("doneBy", { required: true })}
                placeholder="Enter name"
                className="w-full"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving…" : "Add Charge Sheet"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold mb-4">Charge Sheet History</h2>
        {chargeSheets.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg border">
            <p className="text-slate-500">
              No charge sheets have been added yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Done By</th>
                  <th className="px-4 py-2">Entered By</th>
                  <th className="px-4 py-2">Date/Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {chargeSheets.map((sheet, idx) => (
                  <tr key={sheet.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">{idx + 1}</td>
                    <td className="px-4 py-2">{sheet.description}</td>
                    <td className="px-4 py-2">{sheet.doneBy}</td>
                    <td className="px-4 py-2">{sheet.enteredBy}</td>
                    <td className="px-4 py-2 flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      {format(new Date(sheet.timestamp), "PPpp")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
