// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// const firebaseConfig = {
//   apiKey: "AIzaSyDdvjIZI-BBBubiE_B6f29tFcOGek3MY4Y",
//   authDomain: "medford-e07a1.firebaseapp.com",
//   projectId: "medford-e07a1",
//   storageBucket: "medford-e07a1.firebasestorage.app",
//   messagingSenderId: "15585322243",
//   appId: "1:15585322243:web:8aaaab45f2345847373536",
//   measurementId: "G-SR1NMTGT1T"
// };

const firebaseConfig = {
  apiKey: "AIzaSyDOlJU3qctCx_77DdhqDg-T9IvUGkMV1LU",
  authDomain: "face-recognition-d6dcd.firebaseapp.com",
  databaseURL: "https://face-recognition-d6dcd-default-rtdb.firebaseio.com",
  projectId: "face-recognition-d6dcd",
  storageBucket: "face-recognition-d6dcd.firebasestorage.app",
  messagingSenderId: "585222259083",
  appId: "1:585222259083:web:e5a09bf166a9651b262f8e",
  measurementId: "G-SQ0ZLK8ZRX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getDatabase(app);
const storage = getStorage(app);

export { auth, provider, signInWithPopup, signOut ,db , storage };
