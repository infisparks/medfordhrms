export interface VitalSigns {
    bloodPressure: string
    gcs: number
    oxygenSaturation: string
    pulse: string
    respiratoryRate: string
    temperature: string
  }
  
  export interface CasualtyRecord {
    id: string
    age: number
    attendingDoctor: string
    broughtBy: string
    broughtDead: boolean
    caseType: string
    createdAt: string
    date: string
    dob: string
    gender: string
    incidentDescription: string
    isMLC: boolean
    mlcNumber: string
    modeOfArrival: string
    name: string
    otherCaseType: string
    patientId: string
    phone: string
    policeInformed: boolean
    referralHospital: string
    status: string
    time: string
    triageCategory: string
    vitalSigns: VitalSigns
  }
  
  export interface Patient {
    address: string
    age: number
    casualty: Record<string, CasualtyRecord>
    createdAt: string
    dob: string
    gender: string
    name: string
    phone: string
    uhid: string
    updatedAt: string
  }
  
  export interface ServiceItem {
    id: string
    serviceName: string
    doctorName?: string
    type: "service" | "doctorvisit"
    amount: number
    createdAt: string
  }
  
  export interface Payment {
    id: string
    amount: number
    paymentType: string
    date: string
    createdAt: string
  }
  
  export interface CasualtyBilling {
    services: ServiceItem[]
    payments: Payment[]
    discount?: number
    totalAmount?: number
  }
  