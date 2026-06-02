// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA7qpdE_c4GyqN5RJ8DApGI4yR2KYmxoeE",
    authDomain: "fsmap-c9846.firebaseapp.com",
    projectId: "fsmap-c9846",
    storageBucket: "fsmap-c9846.firebasestorage.app",
    messagingSenderId: "872680368099",
    appId: "1:872680368099:web:d8d77729774f2183ed22d6",
    measurementId: "G-1W1ZW1P1L8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
