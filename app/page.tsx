"use client"; // Mark this as a Client Component

import { useRouter } from 'next/navigation'; // Import useRouter

export default function Home() {
  const router = useRouter(); // Initialize the router

  const redirectToDashboard = () => {
    router.push('/opd'); // Redirect to the /dashboard route
  };

  return (
    <div className="flex items-center justify-center bg-white h-screen bg-gradient-to-br ">
      <button
        onClick={redirectToDashboard}
        className="px-6 py-3 text-lg font-semibold bg-blue-600 text-white rounded-lg shadow-md  focus:outline-none focus:ring-4 focus:ring-blue-300 transition-transform transform hover:scale-105"
      >
        Go To opd
      </button>
    </div>
  );
}
