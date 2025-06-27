"use client"; // Ensure this is a client component

import { useEffect, useState } from "react";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "../components/Sidebar"; // Adjust this import based on your project structure
import { auth } from "../lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { getDatabase, ref, onValue } from "firebase/database"; // For reading user type from Realtime DB
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "regenerator-runtime/runtime"; // Add this line

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Logged-in Firebase user
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // "admin", "staff", "opd", "ipd", "opd-ipd" (or null if not found)
  const [userType, setUserType] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // 1. Check if user is authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch user type from Realtime Database
  useEffect(() => {
    if (user) {
      const db = getDatabase();
      const userRef = ref(db, `user/${user.uid}`); // e.g. "user/UID" => { type: "staff" }
      onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        setUserType(data?.type ?? null);
      });
    } else {
      setUserType(null);
    }
  }, [user]);

  // 3. Protect routes
  useEffect(() => {
    if (loading) return;

    // Not logged in => only /login or /register allowed
    if (!user) {
      const publicPaths = ["/login", "/register"];
      if (!publicPaths.includes(pathname)) {
        router.push("/login");
      }
      return;
    }

    // If logged in, disallow /login & /register
    if (pathname === "/login" || pathname === "/register") {
      router.push("/dashboard");
      return;
    }

    // STAFF: redirect to OPD on restricted pages
    if (userType === "staff") {
      const restrictedPaths = [
        "/dashboard",
        "/opdadmin",
        "/ipdadmin",
        "/patientadmin",
        "/bloodadmin",
        "/mortalityadmin",
        "/surgeryadmin",
        "/dr",
      ];
      if (restrictedPaths.includes(pathname)) {
        router.push("/opd");
      }
      return;
    }

    // OPD only
    if (userType === "opd") {
      const allowedPaths = ["/opd", "/opdlist", "/addDoctor",  "/edit-appointment"];
      if (!allowedPaths.some(path => pathname.startsWith(path))) {
        router.push("/opd");
      }
      return;
    }

    // IPD only
    if (userType === "ipd") {
      const allowedBasePaths = [
        "/ipd",
        "/billing",
        "/bed-management",
        "/addDoctor",
        "/manage",
        "/discharge-summary",
        "/drugchart",
        "/ot"
      ];
      if (!allowedBasePaths.some(base => pathname.startsWith(base))) {
        router.push("/ipd");
      }
      return;
    }

    // OPD-IPD combined: allow both sets
    if (userType === "opd-ipd") {
      const allowedBasePaths = [
        // OPD routes
        "/opd",
        "/opdlist",
        "/addDoctor",
        // IPD routes
       "/edit-appointment",
        "/ipd",
        "/billing",
        "/bed-management",
        "/manage",
        "/discharge-summary",
        "/drugchart",
        "/ot"
      ];
      if (!allowedBasePaths.some(base => pathname.startsWith(base))) {
        router.push("/opd");
      }
      return;
    }

    // (Admins or other roles fall through without extra guards)

  }, [user, userType, loading, pathname, router]);

  return (
    <html lang="en">
      <head>{/* Any global <head> elements */}</head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <ToastContainer />
        {loading ? (
          <div className="flex items-center justify-center min-h-screen">
            <p>Loading...</p>
          </div>
        ) : user ? (
          <div className="flex">
            {/* Pass userType to the Sidebar */}
            <Sidebar userType={userType} />
            <main className="flex-1 ml-0 bg-gray-50 min-h-screen">
              {children}
            </main>
          </div>
        ) : (
          // Not logged in => show children (login/register)
          <>{children}</>
        )}
      </body>
    </html>
  );
}
