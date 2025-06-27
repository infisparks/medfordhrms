"use client";

import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import {
  ref,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  DataSnapshot,
} from "firebase/database";
import {
  ArrowLeft,
  User,
  Edit3,
  Trash2,
  Search,
  Filter,
  Eye,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import type React from "react";

interface ChangeRecord {
  id: string;
  type: "edit" | "delete";
  appointmentId: string;
  patientId: string;
  patientName: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }>;
  changeMessages?: string[];            // <-- added
  appointmentData?: any;
  editedBy?: string;
  deletedBy?: string;
  editedAt?: string;
  deletedAt?: string;
}

const OPDChangesPage: React.FC = () => {
  const router = useRouter();

  // All change records in local state (we'll push/pop as child events arrive)
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [filteredChanges, setFilteredChanges] = useState<ChangeRecord[]>([]);

  // Search/filter inputs
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "edit" | "delete">("all");

  // Selected record for “View Details”
  const [selectedChange, setSelectedChange] = useState<ChangeRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  //
  // ————————————————————————————————
  //   STREAM “opdChanges” VIA onChildAdded / onChildChanged / onChildRemoved
  // ————————————————————————————————
  useEffect(() => {
    const changesRef = ref(db, "opdChanges");

    // onChildAdded → add a new ChangeRecord
    const unsubAdded = onChildAdded(changesRef, (snap: DataSnapshot) => {
      const key = snap.key!;
      const val = snap.val();
      const rec: ChangeRecord = {
        id: key,
        type: val.type,
        appointmentId: val.appointmentId,
        patientId: val.patientId,
        patientName: val.patientName,
        changes: val.changes,
        changeMessages: val.changeMessages,       // <-- added
        appointmentData: val.appointmentData,
        editedBy: val.editedBy,
        deletedBy: val.deletedBy,
        editedAt: val.editedAt,
        deletedAt: val.deletedAt,
      };

      setChanges((prev) => {
        // Insert and keep list sorted by timestamp descending
        const updated = [...prev, rec];
        updated.sort((a, b) => {
          const dateA = new Date(a.editedAt || a.deletedAt || 0).getTime();
          const dateB = new Date(b.editedAt || b.deletedAt || 0).getTime();
          return dateB - dateA;
        });
        return updated;
      });
    });

    // onChildChanged → replace the existing record with the updated one
    const unsubChanged = onChildChanged(changesRef, (snap: DataSnapshot) => {
      const key = snap.key!;
      const val = snap.val();
      const updatedRec: ChangeRecord = {
        id: key,
        type: val.type,
        appointmentId: val.appointmentId,
        patientId: val.patientId,
        patientName: val.patientName,
        changes: val.changes,
        changeMessages: val.changeMessages,    // <-- added
        appointmentData: val.appointmentData,
        editedBy: val.editedBy,
        deletedBy: val.deletedBy,
        editedAt: val.editedAt,
        deletedAt: val.deletedAt,
      };

      setChanges((prev) => {
        const idx = prev.findIndex((c) => c.id === key);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = updatedRec;
        // re-sort after replacement
        copy.sort((a, b) => {
          const dateA = new Date(a.editedAt || a.deletedAt || 0).getTime();
          const dateB = new Date(b.editedAt || b.deletedAt || 0).getTime();
          return dateB - dateA;
        });
        return copy;
      });
    });

    // onChildRemoved → remove that record from local state
    const unsubRemoved = onChildRemoved(changesRef, (snap: DataSnapshot) => {
      const key = snap.key!;
      setChanges((prev) => prev.filter((c) => c.id !== key));
    });

    // Clean up on unmount
    return () => {
      unsubAdded();
      unsubChanged();
      unsubRemoved();
    };
  }, []);

  //
  // ——————————————
  //   SEARCH + FILTER
  // ——————————————
  useEffect(() => {
    let filtered = changes;

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((c) => c.type === filterType);
    }

    // Filter by searchQuery
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => {
        const matchesName = c.patientName.toLowerCase().includes(query);
        const matchesAppId = c.appointmentId.toLowerCase().includes(query);
        const matchesUser =
          c.editedBy?.toLowerCase().includes(query) ||
          c.deletedBy?.toLowerCase().includes(query);
        return matchesName || matchesAppId || matchesUser;
      });
    }

    setFilteredChanges(filtered);
  }, [searchQuery, filterType, changes]);

  const handleViewDetails = (change: ChangeRecord) => {
    setSelectedChange(change);
    setDetailDialogOpen(true);
  };

  const formatFieldName = (field: string) => {
    const fieldNames: { [key: string]: string } = {
      name: "Patient Name",
      phone: "Phone Number",
      age: "Age",
      gender: "Gender",
      address: "Address",
      date: "Appointment Date",
      time: "Appointment Time",
      paymentMethod: "Payment Method",
      amount: "Amount",
      discount: "Discount",
      serviceName: "Service Name",
      doctor: "Doctor",
      message: "Notes",
      referredBy: "Referred By",
    };
    return fieldNames[field] || field;
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === "") {
      return "Not set";
    }
    if (typeof value === "string" && value.includes("T")) {
      // Likely an ISO string
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    }
    return String(value);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-7xl mx-auto shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold">
                  OPD Changes History
                </CardTitle>
                <CardDescription className="text-blue-100">
                  Track all edits and deletions in the OPD system
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/manage-opd")}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Manage
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Search + Filter Section */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by patient name, appointment ID, or user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <Select
                    value={filterType}
                    onValueChange={(v: "all" | "edit" | "delete") =>
                      setFilterType(v)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Changes</SelectItem>
                      <SelectItem value="edit">Edits Only</SelectItem>
                      <SelectItem value="delete">Deletes Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-gray-600">
                  Total: {filteredChanges.length} changes
                </div>
              </div>
            </div>

            {/* List of change records */}
            {filteredChanges.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchQuery || filterType !== "all"
                  ? "No matching changes found"
                  : "No changes recorded yet"}
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {filteredChanges.map((change) => (
                    <Card
                      key={change.id}
                      className={`overflow-hidden hover:shadow-md transition-shadow ${
                        change.type === "edit"
                          ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
                          : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                      }`}
                    >
                      <CardHeader className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">
                                {change.patientName}
                              </CardTitle>
                              <Badge
                                variant={change.type === "edit" ? "default" : "destructive"}
                                className="flex items-center gap-1"
                              >
                                {change.type === "edit" ? (
                                  <Edit3 className="h-3 w-3" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                {change.type.toUpperCase()}
                              </Badge>
                            </div>
                            <CardDescription className="flex items-center gap-4 text-sm">
                              <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {change.type === "edit"
                                  ? change.editedBy
                                  : change.deletedBy}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {new Date(
                                  change.editedAt || change.deletedAt || ""
                                ).toLocaleString()}
                              </span>
                              <span className="text-xs text-gray-500">
                                ID: {change.appointmentId.slice(-8)}
                              </span>
                            </CardDescription>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(change)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 pt-0">
                        {change.type === "edit" && change.changeMessages && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Total Changes: {change.changeMessages.length}
                            </div>
                            <ul className="list-disc list-inside text-xs">
                              {change.changeMessages.map((msg, idx) => (
                                <li key={idx}>{msg}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {change.type === "delete" && change.appointmentData && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Deleted Appointment Details:
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                              <div>
                                Date:{" "}
                                {new Date(
                                  change.appointmentData.date
                                ).toLocaleDateString()}
                              </div>
                              <div>Time: {change.appointmentData.time}</div>
                              <div>
                                Service: {change.appointmentData.serviceName}
                              </div>
                              <div>Amount: ₹{change.appointmentData.amount}</div>
                              <div>
                                Type: {change.appointmentData.appointmentType}
                              </div>
                              <div>Phone: {change.appointmentData.phone}</div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedChange?.type === "edit" ? (
                <Edit3 className="h-5 w-5 text-blue-500" />
              ) : (
                <Trash2 className="h-5 w-5 text-red-500" />
              )}
              {selectedChange?.type === "edit" ? "Edit Details" : "Delete Details"}
            </DialogTitle>
            <div className="mt-1 text-sm text-gray-500">
              {selectedChange?.type === "edit"
                ? "Changes made to"
                : "Deleted appointment for"}{" "}
              {selectedChange?.patientName}
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-500">
                  Patient Name
                </div>
                <div className="text-lg">{selectedChange?.patientName}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">
                  Appointment ID
                </div>
                <div className="text-lg font-mono">
                  {selectedChange?.appointmentId}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">
                  {selectedChange?.type === "edit" ? "Edited By" : "Deleted By"}
                </div>
                <div className="text-lg">
                  {selectedChange?.type === "edit"
                    ? selectedChange?.editedBy
                    : selectedChange?.deletedBy}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">
                  {selectedChange?.type === "edit" ? "Edit Date" : "Delete Date"}
                </div>
                <div className="text-lg">
                  {new Date(
                    selectedChange?.editedAt || selectedChange?.deletedAt || ""
                  ).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Edit Changes - show messages */}
            {selectedChange?.type === "edit" && selectedChange?.changeMessages && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Field Change Messages</h3>
                <ul className="space-y-2 list-disc list-inside">
                  {selectedChange.changeMessages.map((msg, idx) => (
                    <li key={idx} className="text-sm">
                      {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Delete Details */}
            {selectedChange?.type === "delete" && selectedChange?.appointmentData && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Deleted Appointment Data
                </h3>
                <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        Patient Name
                      </div>
                      <div>{selectedChange.appointmentData.patientName}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Phone</div>
                      <div>{selectedChange.appointmentData.phone}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Date</div>
                      <div>
                        {new Date(
                          selectedChange.appointmentData.date
                        ).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Time</div>
                      <div>{selectedChange.appointmentData.time}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Service</div>
                      <div>{selectedChange.appointmentData.serviceName}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Doctor</div>
                      <div>{selectedChange.appointmentData.doctor}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Amount</div>
                      <div>₹{selectedChange.appointmentData.amount}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Type</div>
                      <div>{selectedChange.appointmentData.appointmentType}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OPDChangesPage;
