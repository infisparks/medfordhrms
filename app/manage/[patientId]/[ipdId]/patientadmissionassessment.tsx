"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, set } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import format from "date-fns/format";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ======================= Interfaces ======================= //

// Based on your updated JSON schema.
interface AdmissionAssessment {
  cardiovascular_assessments?: {
    colour?: string; // from ["pink","pale","cyanotic"]
    vitals?: {
      rhythm?: string;
      bp?: string;
      heart_sound?: string;
    };
    storipheries?: string; // from ["warm","cold"]
    pedal_pulse_felt?: string; // from ["feeble","absent"]
    edema?: {
      status?: string; // from ["absent","present"]
      present_site?: string;
    };
    chest_pain?: string; // ["absent","present"]
    dvt?: string; // ["none","low","med","high"]
  };
  respiratory_assessment?: {
    respirations?: string; // from ["regular","labored","non-labored"]
    use_of_accessory_muscles?: string; // ["equal","unequal"]
    rr?: string; // "number"
    o2_saturation?: string; // "percentage"
    on_auscultation?: {
      air_entry?: string; // ["equal","unequal"]
    };
    food?: {
      consumed?: string; // ["no","yes"]
      details?: string; // "string"
    };
    abnormal_breath_sound?: string; // ["absent","present"]
    cough?: {
      status?: string; // ["absent","present"]
      type?: string; // ["productive","non-productive"]
      since_when?: string;
    };
    secretions?: string; // ["frequent","occasional","purulent","mucopurulent"]
  };
  urinary_system?: {
    if_voiding?: string; // ["anuric","incontinent","catheter","av_fistula","other"]
    u_line?: string; // ["clear","cloudy","other"]
    sediments?: string; // ["concentrated","yellow"]
  };
  gastrointestinal_system?: {
    abdomen?: string; // ["soft","tender","guarding"]
    diet?: string; // ["normal","lfd","srd","diabetic_diet"]
    bowl_sounds?: string; // ["normal","absent"]
    last_bowel_movement?: {
      date?: string; // "date"
      time?: string; // "time"
    };
  };
  musculoskeletal_assessment?: {
    range_of_motion_to_all_extremities?: string; // ["yes","no"]
    present_swelling_tenderness?: {
      status?: string; // ["absent","present"]
      present_site?: string;
    };
  };
  integumentary_system?: {
    colour?: string; // ["cool","warm"]
    moisture?: string; // ["dry","moist"]
    braden_risk_score?: string; // "number"
    vitals?: {
      head?: string; // "intact"
      crum?: string; // "intact"
      redness?: string; // ["yes","no"]
      peel_sore?: string; // ["yes","no"]
    };
    pressure_sore?: {
      position?: string; // ["L","R"]
      size?: string; // "string"
      healing_status?: string; // ["healing","non_healing"]
    };
  };
  meta?: {
    date?: string; // "date"
    time?: string; // "time"
    name_of_rn?: string;
    signature?: string;
    loc?: string; // "level of consciousness"
    gcs?: string; // "glasgowcoma scale"
  };
  admission_info?: {
    arrival_to_unit_by?: string; // ["walking","wheel_chair","stretcher"]
    admitted_from?: string; // ["home","clinic","nursing_home","casualty"]
    patient_belongings?: string; // ["watch","jewellery","any_other"]
    relationship?: string;
    informant_name?: string;
  };
  assessment_info?: {
    any_allergies?: string; // ["no","yes"]
    latex_allergy?: string; // ["yes","no"]
    medications?: {
      status?: string; // ["no","yes"]
      if_yes?: string;
    };
    food?: {
      consumption?: string; // ["yes","no"]
    };
    habits?: string; // ["alcohol","smoking","any_other"]
  };
  medical_history?: {
    conditions?: string[]; // multiple selection
  };
  pregnancy_info?: {
    are_you_pregnant?: string; // ["not_applicable","yes_due_date","no"]
    due_date?: string; // "date"
    lmp?: string; // "date"
  };
  surgery_history?: {
    major_illness_surgery_accidents?: {
      description?: string;
      date_event?: string; // "date"
    };
  };
  implants?: string[]; // multiple selection
  activity_exercise?: {
    requires_assisting_devices?: string; // ["yes","no"]
    devices?: string[]; // multiple selection
    difficulty_with_adl?: string; // ["no","yes"]
    adl_tasks?: string[]; // multiple selection
  };
  neurologic_assessment?: {
    speech?: string; // ["clear","slurred"]
    loc?: string; // ["alert_oriented","drowsy","sedated","unresponsive","disoriented","other"]
    physical_limitation?: string; // ["no_limitations","hearing_impairment"]
    gsc?: string;
  };
  pain_assessment?: {
    pain_score?: string; // "number (0-10)"
    location?: string;
  };
  enteredBy?: string;
  timestamp?: string;
}

// The form inputs exclude the admin fields:
type AdmissionAssessmentInputs = Omit<AdmissionAssessment, "enteredBy" | "timestamp">;

// ======================= Component ======================= //

export default function AdmissionAssessmentForm() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  const [assessment, setAssessment] = useState<AdmissionAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<AdmissionAssessmentInputs>({
    defaultValues: {},
  });

  // Firebase path for admission assessment under new JSON structure
  const dbPath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/admissionassesment`;

  useEffect(() => {
    const assessmentRef = ref(db, dbPath);
    const unsubscribe = onValue(assessmentRef, (snapshot) => {
      setLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val() as AdmissionAssessment;
        setAssessment(data);
        reset(data);
      } else {
        setAssessment(null);
        reset({});
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId, reset]);

  // Helper to remove empty fields recursively before saving
  function removeEmptyValues(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.filter((val) => val && val.trim && val.trim() !== "");
    } else if (obj && typeof obj === "object") {
      const newObj: any = {};
      Object.keys(obj).forEach((key) => {
        const value = removeEmptyValues(obj[key]);
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        const isEmptyObject =
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0;
        if (
          value !== "" &&
          value !== null &&
          value !== undefined &&
          !isEmptyArray &&
          !isEmptyObject
        ) {
          newObj[key] = value;
        }
      });
      return newObj;
    } else if (typeof obj === "string") {
      return obj.trim() === "" ? "" : obj.trim();
    }
    return obj;
  }

  const onSubmit: SubmitHandler<AdmissionAssessmentInputs> = async (data) => {
    try {
      setSaving(true);
      setSaveSuccess(false);

      const cleaned = removeEmptyValues(data);
      const finalData: AdmissionAssessment = {
        ...cleaned,
        enteredBy: auth.currentUser?.email || "unknown",
        timestamp: new Date().toISOString(),
      };

      const assessmentRef = ref(db, dbPath);
      await set(assessmentRef, finalData);
      setAssessment(finalData);
      setSaveSuccess(true);

      // Reset form to clear dirty state
      reset(finalData);

      // Hide success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Error saving assessment:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading Assessment Form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 px-2 md:px-4 max-w-7xl mx-auto">
      <Card className="shadow-md border-slate-200">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <CardTitle className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Patient Admission Assessment
            </CardTitle>
            {assessment?.timestamp && (
              <div className="text-sm text-slate-500 flex flex-col md:flex-row md:items-center gap-2">
                <Badge variant="outline" className="w-fit">
                  Last Updated:{" "}
                  {format(new Date(assessment.timestamp), "PPpp")}
                </Badge>
                <Badge variant="outline" className="w-fit">
                  By: {assessment.enteredBy}
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* ========== Cardiovascular Assessments ========== */}
            <FormSection title="Cardiovascular Assessments">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Colour"
                  fieldName="cardiovascular_assessments.colour"
                  register={register}
                  options={["", "pink", "pale", "cyanotic"]}
                />
                <InputBlock
                  label="Vitals - Rhythm"
                  fieldName="cardiovascular_assessments.vitals.rhythm"
                  register={register}
                />
                <InputBlock
                  label="Vitals - BP"
                  fieldName="cardiovascular_assessments.vitals.bp"
                  register={register}
                />
                <InputBlock
                  label="Vitals - Heart Sound"
                  fieldName="cardiovascular_assessments.vitals.heart_sound"
                  register={register}
                />
                <SelectBlock
                  label="Storipheries"
                  fieldName="cardiovascular_assessments.storipheries"
                  register={register}
                  options={["", "warm", "cold"]}
                />
                <SelectBlock
                  label="Pedal Pulse Felt"
                  fieldName="cardiovascular_assessments.pedal_pulse_felt"
                  register={register}
                  options={["", "feeble", "absent"]}
                />
                <SelectBlock
                  label="Edema Status"
                  fieldName="cardiovascular_assessments.edema.status"
                  register={register}
                  options={["", "absent", "present"]}
                />
                <InputBlock
                  label="Edema Present Site"
                  fieldName="cardiovascular_assessments.edema.present_site"
                  register={register}
                />
                <SelectBlock
                  label="Chest Pain"
                  fieldName="cardiovascular_assessments.chest_pain"
                  register={register}
                  options={["", "absent", "present"]}
                />
                <SelectBlock
                  label="DVT"
                  fieldName="cardiovascular_assessments.dvt"
                  register={register}
                  options={["", "none", "low", "med", "high"]}
                />
              </div>
            </FormSection>

            {/* ========== Respiratory Assessment ========== */}
            <FormSection title="Respiratory Assessment">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Respirations"
                  fieldName="respiratory_assessment.respirations"
                  register={register}
                  options={["", "regular", "labored", "non-labored"]}
                />
                <SelectBlock
                  label="Use of Accessory Muscles"
                  fieldName="respiratory_assessment.use_of_accessory_muscles"
                  register={register}
                  options={["", "equal", "unequal"]}
                />
                <InputBlock
                  label="RR (Respiratory Rate)"
                  fieldName="respiratory_assessment.rr"
                  register={register}
                />
                <InputBlock
                  label="O2 Saturation"
                  fieldName="respiratory_assessment.o2_saturation"
                  register={register}
                />
                <SelectBlock
                  label="On Auscultation - Air Entry"
                  fieldName="respiratory_assessment.on_auscultation.air_entry"
                  register={register}
                  options={["", "equal", "unequal"]}
                />
                <SelectBlock
                  label="Food Consumed?"
                  fieldName="respiratory_assessment.food.consumed"
                  register={register}
                  options={["", "no", "yes"]}
                />
                <InputBlock
                  label="Food Details"
                  fieldName="respiratory_assessment.food.details"
                  register={register}
                />
                <SelectBlock
                  label="Abnormal Breath Sound"
                  fieldName="respiratory_assessment.abnormal_breath_sound"
                  register={register}
                  options={["", "absent", "present"]}
                />
                <SelectBlock
                  label="Cough Status"
                  fieldName="respiratory_assessment.cough.status"
                  register={register}
                  options={["", "absent", "present"]}
                />
                <SelectBlock
                  label="Cough Type"
                  fieldName="respiratory_assessment.cough.type"
                  register={register}
                  options={["", "productive", "non-productive"]}
                />
                <InputBlock
                  label="Cough Since When"
                  fieldName="respiratory_assessment.cough.since_when"
                  register={register}
                />
                <SelectBlock
                  label="Secretions"
                  fieldName="respiratory_assessment.secretions"
                  register={register}
                  options={["", "frequent", "occasional", "purulent", "mucopurulent"]}
                />
              </div>
            </FormSection>

            {/* ========== Urinary System ========== */}
            <FormSection title="Urinary System">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="If Voiding"
                  fieldName="urinary_system.if_voiding"
                  register={register}
                  options={[
                    "",
                    "anuric",
                    "incontinent",
                    "catheter",
                    "av_fistula",
                    "other",
                  ]}
                />
                <SelectBlock
                  label="U-Line"
                  fieldName="urinary_system.u_line"
                  register={register}
                  options={["", "clear", "cloudy", "other"]}
                />
                <SelectBlock
                  label="Sediments"
                  fieldName="urinary_system.sediments"
                  register={register}
                  options={["", "concentrated", "yellow"]}
                />
              </div>
            </FormSection>

            {/* ========== Gastrointestinal System ========== */}
            <FormSection title="Gastrointestinal System">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Abdomen"
                  fieldName="gastrointestinal_system.abdomen"
                  register={register}
                  options={["", "soft", "tender", "guarding"]}
                />
                <SelectBlock
                  label="Diet"
                  fieldName="gastrointestinal_system.diet"
                  register={register}
                  options={["", "normal", "lfd", "srd", "diabetic_diet"]}
                />
                <SelectBlock
                  label="Bowl Sounds"
                  fieldName="gastrointestinal_system.bowl_sounds"
                  register={register}
                  options={["", "normal", "absent"]}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Last Bowel Movement (Date)
                  </label>
                  <Input
                    type="date"
                    {...register("gastrointestinal_system.last_bowel_movement.date")}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Last Bowel Movement (Time)
                  </label>
                  <Input
                    type="time"
                    {...register("gastrointestinal_system.last_bowel_movement.time")}
                    className="w-full"
                  />
                </div>
              </div>
            </FormSection>

            {/* ========== Musculoskeletal Assessment ========== */}
            <FormSection title="Musculoskeletal Assessment">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Range of Motion to All Extremities"
                  fieldName="musculoskeletal_assessment.range_of_motion_to_all_extremities"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <SelectBlock
                  label="Swelling/Tenderness Status"
                  fieldName="musculoskeletal_assessment.present_swelling_tenderness.status"
                  register={register}
                  options={["", "absent", "present"]}
                />
                <InputBlock
                  label="Swelling/Tenderness Site"
                  fieldName="musculoskeletal_assessment.present_swelling_tenderness.present_site"
                  register={register}
                />
              </div>
            </FormSection>

            {/* ========== Integumentary System ========== */}
            <FormSection title="Integumentary System">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Colour"
                  fieldName="integumentary_system.colour"
                  register={register}
                  options={["", "cool", "warm"]}
                />
                <SelectBlock
                  label="Moisture"
                  fieldName="integumentary_system.moisture"
                  register={register}
                  options={["", "dry", "moist"]}
                />
                <InputBlock
                  label="Braden Risk Score (ICU)"
                  fieldName="integumentary_system.braden_risk_score"
                  register={register}
                />
                <InputBlock
                  label="Head"
                  fieldName="integumentary_system.vitals.head"
                  register={register}
                />
                <InputBlock
                  label="Crum"
                  fieldName="integumentary_system.vitals.crum"
                  register={register}
                />
                <SelectBlock
                  label="Redness"
                  fieldName="integumentary_system.vitals.redness"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <SelectBlock
                  label="Peel Sore"
                  fieldName="integumentary_system.vitals.peel_sore"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <SelectBlock
                  label="Pressure Sore Position"
                  fieldName="integumentary_system.pressure_sore.position"
                  register={register}
                  options={["", "L", "R"]}
                />
                <InputBlock
                  label="Pressure Sore Size"
                  fieldName="integumentary_system.pressure_sore.size"
                  register={register}
                />
                <SelectBlock
                  label="Healing Status"
                  fieldName="integumentary_system.pressure_sore.healing_status"
                  register={register}
                  options={["", "healing", "non_healing"]}
                />
              </div>
            </FormSection>

            {/* ========== Meta Info ========== */}
            <FormSection title="Meta Info">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <Input type="date" {...register("meta.date")} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Time
                  </label>
                  <Input type="time" {...register("meta.time")} className="w-full" />
                </div>
                <InputBlock
                  label="Name of RN"
                  fieldName="meta.name_of_rn"
                  register={register}
                />
                <InputBlock
                  label="Signature"
                  fieldName="meta.signature"
                  register={register}
                />
                <InputBlock label="LOC" fieldName="meta.loc" register={register} />
                <InputBlock label="GCS" fieldName="meta.gcs" register={register} />
              </div>
            </FormSection>

            {/* ========== Admission Info ========== */}
            <FormSection title="Admission Info">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Arrival to Unit By"
                  fieldName="admission_info.arrival_to_unit_by"
                  register={register}
                  options={["", "walking", "wheel_chair", "stretcher"]}
                />
                <SelectBlock
                  label="Admitted From"
                  fieldName="admission_info.admitted_from"
                  register={register}
                  options={["", "home", "clinic", "nursing_home", "casualty"]}
                />
                <SelectBlock
                  label="Patient Belongings"
                  fieldName="admission_info.patient_belongings"
                  register={register}
                  options={["", "watch", "jewellery", "any_other"]}
                />
                <InputBlock
                  label="Relationship"
                  fieldName="admission_info.relationship"
                  register={register}
                />
                <InputBlock
                  label="Informant Name"
                  fieldName="admission_info.informant_name"
                  register={register}
                />
              </div>
            </FormSection>

            {/* ========== Assessment Info ========== */}
            <FormSection title="Assessment Info">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Any Allergies"
                  fieldName="assessment_info.any_allergies"
                  register={register}
                  options={["", "no", "yes"]}
                />
                <SelectBlock
                  label="Latex Allergy"
                  fieldName="assessment_info.latex_allergy"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <SelectBlock
                  label="Medications - Status"
                  fieldName="assessment_info.medications.status"
                  register={register}
                  options={["", "no", "yes"]}
                />
                <InputBlock
                  label="If Yes, Which Medications"
                  fieldName="assessment_info.medications.if_yes"
                  register={register}
                />
                <SelectBlock
                  label="Food Consumption"
                  fieldName="assessment_info.food.consumption"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <SelectBlock
                  label="Habits"
                  fieldName="assessment_info.habits"
                  register={register}
                  options={["", "alcohol", "smoking", "any_other"]}
                />
              </div>
            </FormSection>

            {/* ========== Medical History ========== */}
            <FormSection title="Medical History">
              <div>
                <CheckboxGroup
                  label="Conditions"
                  fieldName="medical_history.conditions"
                  register={register}
                  options={[
                    { value: "no_problems", label: "No Problems" },
                    { value: "stroke", label: "Stroke" },
                    { value: "hypertension", label: "Hypertension" },
                    { value: "stomach_bowel_problems", label: "Stomach/Bowel Problems" },
                    { value: "ischemic_heart_disease", label: "Ischemic Heart Disease" },
                    { value: "diabetes", label: "Diabetes" },
                    { value: "kidney_bladder_problem", label: "Kidney/Bladder Problem" },
                    {
                      value: "recent_exposure_to_contagious_disease",
                      label: "Recent Exposure to Contagious Disease",
                    },
                  ]}
                />
              </div>
            </FormSection>

            {/* ========== Pregnancy Info ========== */}
            <FormSection title="Pregnancy Info">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Are You Pregnant?"
                  fieldName="pregnancy_info.are_you_pregnant"
                  register={register}
                  options={["", "not_applicable", "yes_due_date", "no"]}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <Input
                    type="date"
                    {...register("pregnancy_info.due_date")}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    LMP
                  </label>
                  <Input
                    type="date"
                    {...register("pregnancy_info.lmp")}
                    className="w-full"
                  />
                </div>
              </div>
            </FormSection>

            {/* ========== Surgery History ========== */}
            <FormSection title="Surgery History">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputBlock
                  label="Major Illness/Surgery/Accidents Description"
                  fieldName="surgery_history.major_illness_surgery_accidents.description"
                  register={register}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date of Event
                  </label>
                  <Input
                    type="date"
                    {...register(
                      "surgery_history.major_illness_surgery_accidents.date_event"
                    )}
                    className="w-full"
                  />
                </div>
              </div>
            </FormSection>

            {/* ========== Implants ========== */}
            <FormSection title="Implants">
              <CheckboxGroup
                label="Implants"
                fieldName="implants"
                register={register}
                options={[
                  { value: "prosthesis", label: "Prosthesis" },
                  { value: "pacemaker", label: "Pacemaker" },
                  { value: "aicd", label: "AICD" },
                  { value: "any_other", label: "Any Other" },
                ]}
              />
            </FormSection>

            {/* ========== Activity & Exercise ========== */}
            <FormSection title="Activity & Exercise">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectBlock
                  label="Requires Assisting Devices?"
                  fieldName="activity_exercise.requires_assisting_devices"
                  register={register}
                  options={["", "yes", "no"]}
                />
                <MultiCheckboxGroup
                  label="Devices"
                  fieldName="activity_exercise.devices"
                  register={register}
                  options={[
                    { value: "walker", label: "Walker" },
                    { value: "cane", label: "Cane" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <SelectBlock
                  label="Difficulty with ADL?"
                  fieldName="activity_exercise.difficulty_with_adl"
                  register={register}
                  options={["", "no", "yes"]}
                />
                <MultiCheckboxGroup
                  label="ADL Tasks"
                  fieldName="activity_exercise.adl_tasks"
                  register={register}
                  options={[
                    { value: "bathing", label: "Bathing" },
                    { value: "toileting", label: "Toileting" },
                    { value: "climbing_stairs", label: "Climbing Stairs" },
                    { value: "walking", label: "Walking" },
                    { value: "feeding", label: "Feeding" },
                    { value: "house_chores", label: "House Chores" },
                  ]}
                />
              </div>
            </FormSection>

            {/* ========== Neurologic Assessment ========== */}
            <FormSection title="Neurologic Assessment">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SelectBlock
                  label="Speech"
                  fieldName="neurologic_assessment.speech"
                  register={register}
                  options={["", "clear", "slurred"]}
                />
                <SelectBlock
                  label="LOC"
                  fieldName="neurologic_assessment.loc"
                  register={register}
                  options={[
                    "",
                    "alert_oriented",
                    "drowsy",
                    "sedated",
                    "unresponsive",
                    "disoriented",
                    "other",
                  ]}
                />
                <SelectBlock
                  label="Physical Limitation"
                  fieldName="neurologic_assessment.physical_limitation"
                  register={register}
                  options={["", "no_limitations", "hearing_impairment"]}
                />
                <InputBlock
                  label="GCS"
                  fieldName="neurologic_assessment.gsc"
                  register={register}
                />
              </div>
            </FormSection>

            {/* ========== Pain Assessment ========== */}
            <FormSection title="Pain Assessment">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputBlock
                  label="Pain Score (0-10)"
                  fieldName="pain_assessment.pain_score"
                  register={register}
                />
                <InputBlock
                  label="Pain Location"
                  fieldName="pain_assessment.location"
                  register={register}
                />
              </div>
            </FormSection>

            {/* Sticky Save Button */}
            <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t flex justify-between items-center mt-8">
              <div>
                {isDirty && (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Unsaved changes
                  </Badge>
                )}
                {saveSuccess && (
                  <Alert className="bg-green-50 text-green-700 border-green-200 py-2 px-3">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <AlertDescription>
                      Assessment saved successfully!
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <Button type="submit" className="gap-2" disabled={saving || !isDirty}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Assessment
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Display Additional Info if already saved */}
          {assessment?.timestamp && (
            <div className="mt-6 text-sm text-gray-500">
              <p>
                <strong>Last Updated:</strong>{" "}
                {format(new Date(assessment.timestamp), "PPpp")}
              </p>
              <p>
                <strong>Entered By:</strong> {assessment.enteredBy}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== Reusable Form Components ========== //

// Form Section with title
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="bg-slate-50 px-4 py-3 border-b">
        <h3 className="text-md font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// For <select> with single choice
function SelectBlock({
  label,
  fieldName,
  register,
  options,
}: {
  label: string;
  fieldName: string;
  register: any;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        {...register(fieldName)}
        className="w-full border rounded-md px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === ""
              ? "--Select--"
              : opt
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
          </option>
        ))}
      </select>
    </div>
  );
}

// For <input type="text"> fields
function InputBlock({
  label,
  fieldName,
  register,
}: {
  label: string;
  fieldName: string;
  register: any;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <Input
        type="text"
        placeholder={label}
        {...register(fieldName)}
        className="w-full focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

// For multiple checkboxes -> array of strings
function CheckboxGroup({
  label,
  fieldName,
  register,
  options,
}: {
  label: string;
  fieldName: string;
  register: any;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center space-x-2 bg-slate-50 p-2 rounded-md hover:bg-slate-100 transition-colors"
          >
            <input
              type="checkbox"
              value={opt.value}
              {...register(`${fieldName}`)}
              className="rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-800">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// For multiple checkboxes -> array of strings
function MultiCheckboxGroup({
  label,
  fieldName,
  register,
  options,
}: {
  label: string;
  fieldName: string;
  register: any;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center space-x-2 bg-slate-50 p-2 rounded-md hover:bg-slate-100 transition-colors"
          >
            <input
              type="checkbox"
              value={opt.value}
              {...register(`${fieldName}`)}
              className="rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-800">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
