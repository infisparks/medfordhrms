"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import { format, isSameDay, parseISO } from "date-fns";
import { Search, Trash2, Download, FileText, Activity } from 'lucide-react';
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { useRive } from '@rive-app/react-canvas';

interface IPathologyTest {
  id: string;
  name: string;
  phone: string;
  pathologyTestName: string;
  amount: number;
  date: string;
  doctor: string;
}

interface IDoctor {
  id: string;
  name: string;
}

export default function PathologyAdmin() {
  const [pathologyTests, setPathologyTests] = useState<IPathologyTest[]>([]);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [filteredPathologyTests, setFilteredPathologyTests] = useState<IPathologyTest[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const { RiveComponent } = useRive({
    src: '/animations/lab_animation.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
  });

  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      const doctorsList: IDoctor[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          doctorsList.push({
            id: key,
            name: data[key].name,
          });
        });
      }
      setDoctors(doctorsList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const pathologyTestsRef = ref(db, "bloodTests");
    const unsubscribe = onValue(pathologyTestsRef, (snapshot) => {
      const data = snapshot.val();
      const pathologyTestList: IPathologyTest[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const entry = data[key];
          pathologyTestList.push({
            id: key,
            name: entry.name,
            phone: entry.phone,
            pathologyTestName: entry.bloodTestName,
            amount: entry.amount,
            date: entry.timestamp
              ? new Date(entry.timestamp).toISOString()
              : new Date().toISOString(),
            doctor: entry.doctor || "N/A",
          });
        });
      }
      setPathologyTests(pathologyTestList);
      setFilteredPathologyTests(pathologyTestList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const doctorMap = useRef<{ [key: string]: string }>({});

  useEffect(() => {
    const map: { [key: string]: string } = {};
    doctors.forEach((doctor) => {
      map[doctor.id] = doctor.name;
    });
    doctorMap.current = map;
  }, [doctors]);

  useEffect(() => {
    let tempPathologyTests = [...pathologyTests];

    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      tempPathologyTests = tempPathologyTests.filter((pt) =>
        isSameDay(new Date(pt.date), parsedDate)
      );
    }

    if (searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase();
      tempPathologyTests = tempPathologyTests.filter(
        (pt) =>
          pt.name.toLowerCase().includes(lowerQuery) ||
          pt.phone.includes(lowerQuery) ||
          pt.pathologyTestName.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredPathologyTests(tempPathologyTests);
  }, [searchQuery, selectedDate, pathologyTests]);

  const exportToExcel = () => {
    const dataToExport = filteredPathologyTests.map((pt) => ({
      "Patient Name": pt.name,
      "Phone Number": pt.phone,
      "Pathology Test Name": pt.pathologyTestName,
      Amount: pt.amount,
      Date: format(parseISO(pt.date), "PPP"),
      Doctor: doctorMap.current[pt.doctor] || "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pathology Tests");
    XLSX.writeFile(workbook, "Pathology_Tests_Report.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["Patient Name", "Phone Number", "Pathology Test Name", "Amount", "Date", "Doctor"];
    const tableRows: string[][] = [];

    filteredPathologyTests.forEach((pt) => {
      const ptData: string[] = [
        pt.name,
        pt.phone,
        pt.pathologyTestName,
        pt.amount.toString(),
        format(parseISO(pt.date), "PPP"),
        doctorMap.current[pt.doctor] || "N/A",
      ];
      tableRows.push(ptData);
    });

    doc.text("Pathology Tests Report", 14, 15);
    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });

    doc.save(`Pathology_Tests_Report_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
  };

  const deletePathologyTest = async (id: string) => {
    if (confirm("Are you sure you want to delete this pathology test entry?")) {
      try {
        const ptRef = ref(db, `pathologyTests/${id}`);
        await remove(ptRef);
        toast.success("Pathology test entry deleted successfully!");
      } catch (error) {
        console.error("Error deleting pathology test entry:", error);
        toast.error("Failed to delete pathology test entry.");
      }
    }
  };

  const totalAmount = filteredPathologyTests.reduce((acc, pt) => acc + pt.amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 py-10">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-10 text-indigo-800 animate-fade-in-down">
          Pathology Management Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 ease-in-out">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
              <Activity className="h-5 w-5 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-indigo-600">₹ {totalAmount}</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 ease-in-out">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Search</h3>
              <Search className="h-5 w-5 text-indigo-500" />
            </div>
            <input
              type="text"
              placeholder="Search by Name, Phone, or Test"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 ease-in-out">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Filter by Date</h3>
              <FileText className="h-5 w-5 text-indigo-500" />
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
            />
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md transform hover:scale-105 transition-transform duration-300 ease-in-out">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Export</h3>
              <Download className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="flex justify-between">
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors duration-300"
              >
                Excel
              </button>
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors duration-300"
              >
                PDF
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pathology Test</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPathologyTests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        No pathology tests found.
                      </td>
                    </tr>
                  ) : (
                    filteredPathologyTests.map((pt) => (
                      <tr key={pt.id} className="hover:bg-gray-50 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pt.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pt.phone}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pt.pathologyTestName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹ {pt.amount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(parseISO(pt.date), "PPP")}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doctorMap.current[pt.doctor] || "N/A"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => deletePathologyTest(pt.id)}
                            className="text-red-600 hover:text-red-900 transition-colors duration-200"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <div style={{ width: '300px', height: '300px' }}>
            <RiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
}
