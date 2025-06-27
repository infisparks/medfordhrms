"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import format from "date-fns/format";

interface VitalObservation {
  id?: string;
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
  enteredBy: string;
}

interface VitalObservationFormInputs {
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
}

export default function VitalObservations() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
  } = useForm<VitalObservationFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      temperature: "",
      pulse: "",
      respiratoryRate: "",
      bloodPressure: "",
      intakeOral: "",
      intakeIV: "",
      outputUrine: "",
      outputStool: "",
      outputAspiration: ""
    }
  });

  const [observations, setObservations] = useState<VitalObservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listening, setListening] = useState(false);

  // Fetch existing observations
  useEffect(() => {
    // Updated path:
    const obsRef = ref(db, `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/vitalobservation`);
    const unsub = onValue(obsRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: VitalObservation[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key]
        }));
        loaded.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
        setObservations(loaded);
      } else {
        setObservations([]);
      }
    });
    return () => unsub();
  }, [patientId, ipdId]);

  // AI + Voice handler
  const handleVoiceInput = useCallback(
    async (transcript: string) => {
      setIsSubmitting(true);
      const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const prompt = `Extract these as JSON with keys:
dateTime, temperature, pulse, respiratoryRate, bloodPressure, intakeOral, intakeIV, outputUrine, outputStool, outputAspiration
from this text:
"${transcript}"`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });
        const json = await res.json();
        const aiData: Partial<VitalObservationFormInputs> = JSON.parse(
          json.candidates[0].content.parts[0].text
        );

        // Only overwrite non-empty fields
        Object.entries(aiData).forEach(([key, val]) => {
          if (val != null && String(val).trim() !== "") {
            setValue(key as keyof VitalObservationFormInputs, String(val));
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
      return alert("Speech Recognition API not supported in this browser.");
    }
    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0][0].transcript;
      handleVoiceInput(text);
    };
    recog.onend = () => setListening(false);
    recog.start();
    setListening(true);
  };

  // Form submission
  const onSubmit: SubmitHandler<VitalObservationFormInputs> = async (data) => {
    setIsSubmitting(true);
    try {
      const entry: VitalObservation = {
        ...getValues(),
        enteredBy: auth.currentUser?.email || "unknown"
      };
      // Updated path:
      const obsRef = ref(db, `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/vitalobservation`);
      await push(obsRef, entry);
      reset({
        dateTime: new Date().toISOString().slice(0, 16),
        temperature: "",
        pulse: "",
        respiratoryRate: "",
        bloodPressure: "",
        intakeOral: "",
        intakeIV: "",
        outputUrine: "",
        outputStool: "",
        outputAspiration: ""
      });
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">
            Add Vital Observation
          </CardTitle>
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
              <label className="block text-sm font-medium">Date &amp; Time</label>
              <Input type="datetime-local" {...register("dateTime")} className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium">Temperature</label>
              <Input {...register("temperature")} placeholder="e.g. 98.6 ℉" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium">Pulse</label>
              <Input {...register("pulse")} placeholder="beats per minute" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium">Respiratory Rate</label>
              <Input
                {...register("respiratoryRate")}
                placeholder="breaths per minute"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Blood Pressure</label>
              <Input {...register("bloodPressure")} placeholder="e.g. 120/80" className="w-full" />
            </div>

            <h3 className="text-lg font-semibold pt-4">Intake</h3>
            <div>
              <label className="block text-sm font-medium">Oral Intake</label>
              <Input {...register("intakeOral")} placeholder="ml" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium">IV Intake</label>
              <Input {...register("intakeIV")} placeholder="ml" className="w-full" />
            </div>

            <h3 className="text-lg font-semibold pt-4">Output</h3>
            <div>
              <label className="block text-sm font-medium">Urine</label>
              <Input {...register("outputUrine")} placeholder="ml" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium">Stool</label>
              <Input {...register("outputStool")} placeholder="times/volume" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium">Aspiration</label>
              <Input
                {...register("outputAspiration")}
                placeholder="ml"
                className="w-full"
              />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving…" : "Add Observation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold mb-4">Vital Observations</h2>
        {isLoading ? (
          <p>Loading…</p>
        ) : observations.length === 0 ? (
          <p>No observations recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1">Date &amp; Time</th>
                  <th className="px-2 py-1">Temp</th>
                  <th className="px-2 py-1">Pulse</th>
                  <th className="px-2 py-1">Resp Rate</th>
                  <th className="px-2 py-1">BP</th>
                  <th className="px-2 py-1">Intake (Oral/IV)</th>
                  <th className="px-2 py-1">Output (U/St/Asp)</th>
                  <th className="px-2 py-1">Entered By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-slate-100">
                    <td className="px-2 py-1">
                      {format(new Date(obs.dateTime), "dd MMM yyyy, hh:mm a")}
                    </td>
                    <td className="px-2 py-1">{obs.temperature || "-"}</td>
                    <td className="px-2 py-1">{obs.pulse || "-"}</td>
                    <td className="px-2 py-1">{obs.respiratoryRate || "-"}</td>
                    <td className="px-2 py-1">{obs.bloodPressure || "-"}</td>
                    <td className="px-2 py-1">
                      {obs.intakeOral || "-"} / {obs.intakeIV || "-"}
                    </td>
                    <td className="px-2 py-1">
                      {obs.outputUrine || "-"} / {obs.outputStool || "-"} /{" "}
                      {obs.outputAspiration || "-"}
                    </td>
                    <td className="px-2 py-1">{obs.enteredBy}</td>
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
