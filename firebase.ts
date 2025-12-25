import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAGHcySeJp2BidB3GMNkeG_3gB_4fU3ybc",
  authDomain: "insanus-planner---ter2.firebaseapp.com",
  projectId: "insanus-planner---ter2",
  storageBucket: "insanus-planner---ter2.firebasestorage.app",
  messagingSenderId: "1041626167126",
  appId: "1:1041626167126:web:4f3af8354ddb3321d988f7",
  measurementId: "G-NB6K7XDDV3"
};

// Initialize Firebase
// Note: In a real deployment, ensure these environment variables are valid.
// For this demo, we initialize it but will largely use local state to ensure functionality 
// without requiring a live backend connection immediately.
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;