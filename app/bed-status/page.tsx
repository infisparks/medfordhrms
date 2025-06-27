// app/ipd/bed-status/page.tsx

"use client";

import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { ref, onValue } from 'firebase/database';
import Head from 'next/head';
import { AiOutlineCheckCircle, AiOutlineCloseCircle } from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Bed {
  bedNumber: string;
  type: string;
  status: string;
}

interface RoomType {
  roomName: string;
  beds: Bed[];
}

const BedStatusPage: React.FC = () => {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  useEffect(() => {
    const bedsRef = ref(db, 'beds');
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomTypesList: RoomType[] = Object.keys(data).map(roomKey => ({
          roomName: roomKey.replace('_', ' ').toUpperCase(),
          beds: Object.keys(data[roomKey]).map(bedKey => ({
            bedNumber: data[roomKey][bedKey].bedNumber,
            type: data[roomKey][bedKey].type,
            status: data[roomKey][bedKey].status,
          })),
        }));
        setRoomTypes(roomTypesList);
      } else {
        setRoomTypes([]);
        toast.info('No bed data available.', {
          position: "top-right",
          autoClose: 5000,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      <Head>
        <title>Bed Status</title>
        <meta name="description" content="View current bed statuses" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-blue-100 to-blue-200 flex items-center justify-center p-6">
        <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-blue-600 mb-8">Bed Status Overview</h2>
          {roomTypes.length === 0 ? (
            <p className="text-gray-500">No rooms available.</p>
          ) : (
            <div className="space-y-8">
              {roomTypes.map((room, index) => (
                <div key={index}>
                  <h3 className="text-2xl font-semibold text-gray-700 mb-4">{room.roomName}</h3>
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr>
                        <th className="border px-4 py-2">Bed Number</th>
                        <th className="border px-4 py-2">Type</th>
                        <th className="border px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.beds.map((bed, bedIndex) => (
                        <tr key={bedIndex} className="text-center">
                          <td className="border px-4 py-2">{bed.bedNumber}</td>
                          <td className="border px-4 py-2">{bed.type}</td>
                          <td className="border px-4 py-2">
                            {bed.status === "Available" ? (
                              <div className="flex items-center justify-center text-green-500">
                                <AiOutlineCheckCircle size={20} className="mr-2" />
                                Available
                              </div>
                            ) : (
                              <div className="flex items-center justify-center text-red-500">
                                <AiOutlineCloseCircle size={20} className="mr-2" />
                                Occupied
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default BedStatusPage;
