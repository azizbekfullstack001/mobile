import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDr7IAmWiHm5PoyxNNkc6mzEZr-1Oujq_8",
  authDomain: "e-learning-app-495c0.firebaseapp.com",
  projectId: "e-learning-app-495c0",
  storageBucket: "e-learning-app-495c0.firebasestorage.app",
  messagingSenderId: "171608506895",
  appId: "1:171608506895:web:030d279e1e8c65f9cd597a"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const db = getFirestore(app);

// Expo Router uchun majburiy default export
export default function FirebaseSetup() { return null; }