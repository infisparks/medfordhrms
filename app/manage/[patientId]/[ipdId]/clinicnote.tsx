"use client";

import type React from "react";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { ref, onValue, set } from "firebase/database";
import { useForm, type SubmitHandler } from "react-hook-form";
import { db, auth } from "@/lib/firebase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope,
  FileText,
  Heart,
  TreesIcon as Lungs, // Assuming TreesIcon is aliased as Lungs
  Pill,
  Brain,
  Bone,
  ClipboardList,
  Mic,
  MicOff,
  Save,
  Users,
  Activity,
  Clock,
} from "lucide-react";
import {
  PersonIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { format, parseISO } from "date-fns";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";

// --- Define Web Speech API interfaces if not globally available (common in TypeScript) ---
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
    | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
    | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

// --- End Web Speech API interfaces ---

interface ClinicNote {
  mainComplaintsAndDuration?: string;
  pastHistory?: string;
  familySocialHistory?: string;
  generalPhysicalExamination?: string;
  systemicCardiovascular?: string;
  systemicRespiratory?: string;
  systemicPerAbdomen?: string;
  systemicNeurology?: string;
  systemicSkeletal?: string;
  systemicOther?: string;
  summary?: string;
  provisionalDiagnosis?: string;
  additionalNotes?: string;
  enteredBy?: string;
  timestamp?: string;
}

// Exclude admin fields from form inputs.
type ClinicNoteFormInputs = Omit<ClinicNote, "enteredBy" | "timestamp">;

export default function ClinicNotePage() {
  const { patientId, ipdId } = useParams() as {
    patientId: string;
    ipdId: string;
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<ClinicNoteFormInputs>({
    defaultValues: {
      mainComplaintsAndDuration: "",
      pastHistory: "",
      familySocialHistory: "",
      generalPhysicalExamination: "",
      systemicCardiovascular: "",
      systemicRespiratory: "",
      systemicPerAbdomen: "",
      systemicNeurology: "",
      systemicSkeletal: "",
      systemicOther: "",
      summary: "",
      provisionalDiagnosis: "",
      additionalNotes: "",
    },
  });

  const [loading, setLoading] = useState(true);
  const [activeField, setActiveField] =
    useState<keyof ClinicNoteFormInputs | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("complaints");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Fetch existing clinic note (if any) from Firebase at the new path
  useEffect(() => {
    const clinicNoteRef = ref(
      db,
      `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/clinicalnote`
    );
    const unsubscribe = onValue(clinicNoteRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as ClinicNote;
        // Pre-populate the form with existing data.
        reset(data);
        if (data.timestamp) {
          setLastUpdated(new Date(data.timestamp).toLocaleString());
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [patientId, ipdId, reset]);

  // Submit handler saves the whole clinic note under the new path
  const onSubmit: SubmitHandler<ClinicNoteFormInputs> = async (data) => {
    try {
      const loggedInEmail = auth.currentUser?.email || "unknown";
      // Build the record. Optionally, you can remove keys with empty strings.
      const clinicNoteData: ClinicNote = {
        ...data,
        enteredBy: loggedInEmail,
        timestamp: new Date().toISOString(),
      };
      const clinicNoteRef = ref(
        db,
        `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/clinicalnote`
      );
      await set(clinicNoteRef, clinicNoteData);
      setLastUpdated(new Date().toLocaleString());
      toast.success("Clinic note updated successfully!");
    } catch (error) {
      console.error("Error updating clinic note:", error);
      toast.error("Error updating clinic note. Please try again.");
    }
  };

  // Voice transcription functionality
  const startRecording = (field: keyof ClinicNoteFormInputs) => {
    // Ensure any previous recognition is stopped before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setActiveField(field);
    setIsRecording(true);

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          const currentValue = watch(field) || "";
          setValue(
            field,
            (currentValue ? currentValue + " " : "") + finalTranscript.trim(),
            { shouldDirty: true }
          );
        }

        // (Optional) use interimTranscript for a live preview somewhere
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error, event.message);
        toast.error(`Speech recognition error: ${event.error}`);
        setIsRecording(false);
        setActiveField(null);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        if (isRecording && activeField === field) {
          setIsRecording(false);
          setActiveField(null);
          recognitionRef.current = null;
        }
      };

      try {
        recognition.start();
        console.log("Speech recognition started for field:", field);
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast.error("Could not start voice recording. Check permissions.");
        setIsRecording(false);
        setActiveField(null);
        recognitionRef.current = null;
      }
    } else {
      toast.error("Speech recognition is not supported in your browser.");
      setIsRecording(false);
      setActiveField(null);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("Speech recognition stopped by user.");
      } catch (e) {
        console.error("Error stopping speech recognition:", e);
      }
    }
    setIsRecording(false);
    setActiveField(null);
    recognitionRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log("Stopping recognition on component unmount.");
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
        <div className="text-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-teal-700 font-medium">Loading clinic note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 p-4 md:p-6">
      <ToastContainer position="top-right" autoClose={3000} />

      <Card className="max-w-5xl mx-auto shadow-lg border-teal-100">
        <CardHeader className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-t-lg">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Clinic Note
              </CardTitle>
              <CardDescription className="text-teal-100 mt-1">
                Patient ID: {patientId} • IPD ID: {ipdId}
              </CardDescription>
            </div>
            {lastUpdated && (
              <Badge
                variant="outline"
                className="bg-white/10 text-white border-none flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                Last updated: {lastUpdated}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs
            defaultValue="complaints"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="border-b">
              <ScrollArea className="w-full whitespace-nowrap">
                <TabsList className="bg-transparent h-14 px-4">
                  <TabsTrigger
                    value="complaints"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                    Complaints
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <PersonIcon className="h-4 w-4 mr-2" />
                    History
                  </TabsTrigger>
                  <TabsTrigger
                    value="examination"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Examination
                  </TabsTrigger>
                  <TabsTrigger
                    value="systemic"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Systemic
                  </TabsTrigger>
                  <TabsTrigger
                    value="diagnosis"
                    className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Diagnosis
                  </TabsTrigger>
                </TabsList>
              </ScrollArea>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="p-6 space-y-6"
            >
              <TabsContent value="complaints" className="mt-0">
                <TextareaWithVoice
                  label="Main Complaints & Duration"
                  icon={
                    <ExclamationTriangleIcon className="h-5 w-5 text-teal-600" />
                  }
                  field="mainComplaintsAndDuration"
                  register={register}
                  isRecording={
                    isRecording && activeField === "mainComplaintsAndDuration"
                  }
                  startRecording={() =>
                    startRecording("mainComplaintsAndDuration")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter patient's main complaints and their duration..."
                />
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <TextareaWithVoice
                  label="Past History"
                  icon={<Clock className="h-5 w-5 text-teal-600" />}
                  field="pastHistory"
                  register={register}
                  isRecording={isRecording && activeField === "pastHistory"}
                  startRecording={() => startRecording("pastHistory")}
                  stopRecording={stopRecording}
                  placeholder="Enter patient's past medical history..."
                />

                <TextareaWithVoice
                  label="Family & Social History"
                  icon={<Users className="h-5 w-5 text-teal-600" />}
                  field="familySocialHistory"
                  register={register}
                  isRecording={
                    isRecording && activeField === "familySocialHistory"
                  }
                  startRecording={() => startRecording("familySocialHistory")}
                  stopRecording={stopRecording}
                  placeholder="Enter patient's family and social history..."
                />
              </TabsContent>

              <TabsContent value="examination" className="mt-0">
                <TextareaWithVoice
                  label="General Physical Examination"
                  icon={
                    <Stethoscope className="h-5 w-5 text-teal-600" />
                  }
                  field="generalPhysicalExamination"
                  register={register}
                  isRecording={
                    isRecording && activeField === "generalPhysicalExamination"
                  }
                  startRecording={() =>
                    startRecording("generalPhysicalExamination")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter general physical examination findings..."
                />
              </TabsContent>

              <TabsContent value="systemic" className="mt-0">
                <TextareaWithVoice
                  label="Cardiovascular System"
                  icon={<Heart className="h-5 w-5 text-teal-600" />}
                  field="systemicCardiovascular"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemicCardiovascular"
                  }
                  startRecording={() =>
                    startRecording("systemicCardiovascular")
                  }
                  stopRecording={stopRecording}
                  placeholder="Enter cardiovascular examination findings..."
                />

                <TextareaWithVoice
                  label="Respiratory System"
                  icon={<Lungs className="h-5 w-5 text-teal-600" />}
                  field="systemicRespiratory"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemicRespiratory"
                  }
                  startRecording={() => startRecording("systemicRespiratory")}
                  stopRecording={stopRecording}
                  placeholder="Enter respiratory examination findings..."
                />

                <TextareaWithVoice
                  label="Per Abdomen"
                  icon={<Pill className="h-5 w-5 text-teal-600" />}
                  field="systemicPerAbdomen"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemicPerAbdomen"
                  }
                  startRecording={() => startRecording("systemicPerAbdomen")}
                  stopRecording={stopRecording}
                  placeholder="Enter per abdomen examination findings..."
                />

                <TextareaWithVoice
                  label="Neurological System"
                  icon={<Brain className="h-5 w-5 text-teal-600" />}
                  field="systemicNeurology"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemicNeurology"
                  }
                  startRecording={() => startRecording("systemicNeurology")}
                  stopRecording={stopRecording}
                  placeholder="Enter neurological examination findings..."
                />

                <TextareaWithVoice
                  label="Skeletal System"
                  icon={<Bone className="h-5 w-5 text-teal-600" />}
                  field="systemicSkeletal"
                  register={register}
                  isRecording={
                    isRecording && activeField === "systemicSkeletal"
                  }
                  startRecording={() => startRecording("systemicSkeletal")}
                  stopRecording={stopRecording}
                  placeholder="Enter skeletal examination findings..."
                />

                <TextareaWithVoice
                  label="Other Systems"
                  icon={<PlusIcon className="h-5 w-5 text-teal-600" />}
                  field="systemicOther"
                  register={register}
                  isRecording={isRecording && activeField === "systemicOther"}
                  startRecording={() => startRecording("systemicOther")}
                  stopRecording={stopRecording}
                  placeholder="Enter other systemic examination findings..."
                />
              </TabsContent>

              <TabsContent value="diagnosis" className="mt-0">
                <TextareaWithVoice
                  label="Summary"
                  icon={<ClipboardList className="h-5 w-5 text-teal-600" />}
                  field="summary"
                  register={register}
                  isRecording={isRecording && activeField === "summary"}
                  startRecording={() => startRecording("summary")}
                  stopRecording={stopRecording}
                  placeholder="Enter summary of findings..."
                />

                <TextareaWithVoice
                  label="Provisional Diagnosis"
                  icon={<Stethoscope className="h-5 w-5 text-teal-600" />}
                  field="provisionalDiagnosis"
                  register={register}
                  isRecording={
                    isRecording && activeField === "provisionalDiagnosis"
                  }
                  startRecording={() => startRecording("provisionalDiagnosis")}
                  stopRecording={stopRecording}
                  placeholder="Enter provisional diagnosis..."
                />

                <TextareaWithVoice
                  label="Additional Notes"
                  icon={<FileText className="h-5 w-5 text-teal-600" />}
                  field="additionalNotes"
                  register={register}
                  isRecording={
                    isRecording && activeField === "additionalNotes"
                  }
                  startRecording={() => startRecording("additionalNotes")}
                  stopRecording={stopRecording}
                  placeholder="Enter any additional notes..."
                />
              </TabsContent>

              <div className="mt-8 flex justify-end">
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white px-6"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Clinic Note
                </Button>
              </div>
            </form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface TextareaWithVoiceProps {
  label: string;
  icon: React.ReactNode;
  field: keyof ClinicNoteFormInputs;
  register: any;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  placeholder: string;
}

function TextareaWithVoice({
  label,
  icon,
  field,
  register,
  isRecording,
  startRecording,
  stopRecording,
  placeholder,
}: TextareaWithVoiceProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center text-sm font-medium text-teal-800 gap-1.5">
          {icon}
          {label}
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={isRecording ? "destructive" : "outline"}
                className={`h-8 w-[140px] ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "border-teal-200 text-teal-700 hover:bg-teal-100"
                }`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1 flex-shrink-0" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1 flex-shrink-0" />
                    Voice Input
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRecording
                ? `Stop voice recording for ${label}`
                : `Start voice recording for ${label}`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div
        className={`relative ${
          isRecording ? "ring-2 ring-red-500 rounded-md" : ""
        }`}
      >
        <Textarea
          {...register(field)}
          placeholder={placeholder}
          className={`min-h-[120px] border-teal-200 focus:border-teal-500 focus:ring-teal-500 pr-10 ${
            isRecording
              ? "border-red-500 focus:border-red-600 focus:ring-red-600"
              : ""
          }`}
        />
        {isRecording && (
          <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-none">
            <span className="animate-pulse h-2 w-2 bg-red-500 rounded-full"></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.2s" }}
            ></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.4s" }}
            ></span>
          </div>
        )}
      </div>
    </div>
  );
}
