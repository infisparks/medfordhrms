// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB6UXHfZdbn_jSJauHhbTwBvrFGsKnPeTw",
  authDomain: "gautami-55545.firebaseapp.com",
  databaseURL: "https://gautami-55545-default-rtdb.firebaseio.com",
  projectId: "gautami-55545",
  storageBucket: "gautami-55545.appspot.com",
  messagingSenderId: "328668763634",
  appId: "1:328668763634:web:5cd1be7de0e5e08aaa476b",
  measurementId: "G-FZ93TQS67R"
};
// const firebaseConfig = {
//   apiKey: "AIzaSyDOlJU3qctCx_77DdhqDg-T9IvUGkMV1LU",
//   authDomain: "face-recognition-d6dcd.firebaseapp.com",
//   databaseURL: "https://face-recognition-d6dcd-default-rtdb.firebaseio.com",
//   projectId: "face-recognition-d6dcd",
//   storageBucket: "face-recognition-d6dcd.firebasestorage.app",
//   messagingSenderId: "585222259083",
//   appId: "1:585222259083:web:e5a09bf166a9651b262f8e",
//   measurementId: "G-SQ0ZLK8ZRX"
// };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getDatabase(app);
const storage = getStorage(app);

export { auth, provider, signInWithPopup, signOut ,db , storage };
