// Firebase Configuration
// Replace these values with your own Firebase project credentials.
// See README.md for setup instructions.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBruzSFQB5BmNDLGlnc3C60zPiSfUMQHOA",
  authDomain: "airis-ux-study.firebaseapp.com",
  projectId: "airis-ux-study",
  storageBucket: "airis-ux-study.firebasestorage.app",
  messagingSenderId: "513768474168",
  appId: "1:513768474168:web:26594af6f700d5363ac8cd",
  measurementId: "G-7T8METBJDX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
