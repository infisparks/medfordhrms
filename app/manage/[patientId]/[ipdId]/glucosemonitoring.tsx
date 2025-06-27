"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push, set } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { format } from "date-fns";

interface GlucoseReading {
  id?: string;
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
  enteredBy: string;
  timestamp: string;
}

interface GlucoseFormInputs {
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
}

export default function GlucoseMonitoring() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  const { register, handleSubmit, reset, setValue, getValues } = useForm<GlucoseFormInputs>({
    defaultValues: {
      bloodSugar: "",
      urineSugarKetone: "",
      medication: "",
      dose: "",
      orderedBy: "",
      staffOrNurse: "",
    },
  });

  const [glucoseReadings, setGlucoseReadings] = useState<GlucoseReading[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listening, setListening] = useState(false);

  // Path base: patients/ipddetail/userdetailipd/{patientId}/{ipdId}/glucosemonitering
  const basePath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/glucosemonitering`;

  useEffect(() => {
    const glucoseRef = ref(db, basePath);
    const unsubscribe = onValue(glucoseRef, (snapshot) => {
      const data = snapshot.val() || {};
      setGlucoseReadings(
        Object.entries(data).map(([id, val]: any) => ({ id, ...val }))
      );
    });
    return () => unsubscribe();
  }, [basePath]);

  const handleVoiceInput = useCallback(
    async (text: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"; // your Vertex AI key
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `Extract these details as JSON with keys bloodSugar, urineSugarKetone, medication, dose, orderedBy, staffOrNurse from this: "${text}"`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      };

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error("No JSON returned from API");

        const structuredData: Partial<GlucoseFormInputs> = JSON.parse(jsonText);

        Object.entries(structuredData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            setValue(key as keyof GlucoseFormInputs, String(val));
          }
        });
      } catch (error) {
        console.error("Vertex AI request failed:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [setValue]
  );

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech Recognition not supported.");

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      handleVoiceInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const onSubmit: SubmitHandler<GlucoseFormInputs> = async (data) => {
    setIsSubmitting(true);
    const newRef = push(ref(db, basePath));
    await set(newRef, {
      ...getValues(),
      enteredBy: auth.currentUser?.email || "unknown",
      timestamp: new Date().toISOString(),
    });
    reset();
    setIsSubmitting(false);
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add New Glucose Reading</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={startListening}
            disabled={listening || isSubmitting}
            className="w-full mb-4"
          >
            {listening ? "Listening…" : "Fill Form via Voice"}
          </Button>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="bloodSugar" className="block text-sm font-medium mb-1">
                Blood Sugar (mg/dL)
              </label>
              <Input
                id="bloodSugar"
                {...register("bloodSugar")}
                placeholder="Enter blood sugar level"
              />
            </div>

            <div>
              <label htmlFor="urineSugarKetone" className="block text-sm font-medium mb-1">
                Urine Sugar/Ketone
              </label>
              <Input
                id="urineSugarKetone"
                {...register("urineSugarKetone")}
                placeholder="Enter urine sugar/ketone reading"
              />
            </div>

            <div>
              <label htmlFor="medication" className="block text-sm font-medium mb-1">
                Medication
              </label>
              <Input
                id="medication"
                {...register("medication")}
                placeholder="Enter medication"
              />
            </div>

            <div>
              <label htmlFor="dose" className="block text-sm font-medium mb-1">
                Dose
              </label>
              <Input
                id="dose"
                {...register("dose")}
                placeholder="Enter dose details"
              />
            </div>

            <div>
              <label htmlFor="orderedBy" className="block text-sm font-medium mb-1">
                Ordered By
              </label>
              <Input
                id="orderedBy"
                {...register("orderedBy")}
                placeholder="Enter who ordered"
              />
            </div>

            <div>
              <label htmlFor="staffOrNurse" className="block text-sm font-medium mb-1">
                Staff/Nurse
              </label>
              <Input
                id="staffOrNurse"
                {...register("staffOrNurse")}
                placeholder="Enter staff or nurse name"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving…" : "Save Reading"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {glucoseReadings.length === 0 ? (
        <p>No readings yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-2 py-1">#</th>
              <th className="px-2 py-1">Blood Sugar</th>
              <th className="px-2 py-1">Urine Sugar/Ketone</th>
              <th className="px-2 py-1">Medication</th>
              <th className="px-2 py-1">Dose</th>
              <th className="px-2 py-1">Ordered By</th>
              <th className="px-2 py-1">Staff/Nurse</th>
              <th className="px-2 py-1">Entered By</th>
              <th className="px-2 py-1">Date/Time</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {glucoseReadings.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-2 py-1">{idx + 1}</td>
                <td className="px-2 py-1">{item.bloodSugar}</td>
                <td className="px-2 py-1">{item.urineSugarKetone}</td>
                <td className="px-2 py-1">{item.medication}</td>
                <td className="px-2 py-1">{item.dose}</td>
                <td className="px-2 py-1">{item.orderedBy}</td>
                <td className="px-2 py-1">{item.staffOrNurse}</td>
                <td className="px-2 py-1">{item.enteredBy}</td>
                <td className="px-2 py-1 flex items-center">
                  <Calendar className="inline-block mr-1 h-4 w-4" />
                  {format(new Date(item.timestamp), "PPpp")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
