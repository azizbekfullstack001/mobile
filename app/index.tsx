import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { auth, db } from './firebaseConfig';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // 1. Auth holatini tinglash
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log("Foydalanuvchi tizimga kirmagan. Login sahifasiga...");
        return router.replace('/login');
      }

      try {
        console.log("Foydalanuvchi UID:", user.uid);
        
        // 2. Firestore'dan ma'lumotni olish
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          console.log("Firestore'da foydalanuvchi hujjati topilmadi!");
          return router.replace('/login');
        }

        const userData = userDoc.data();
        const role = userData.role;
        console.log("Firestore'dan olingan rol:", role);

        // 3. YO'NALTIRISH LOGIKASI (Ustuvorlik bo'yicha)
        
        // MUHIM: Har bir shartdan keyin 'return' ishlating, shunda kod pastga davom etmaydi
        if (role === 'super-admin') {
          console.log("Super Admin aniqlandi. Sahifa: superadmin");
          return router.replace('/superadmin');
        }

        if (role === 'admin') {
          console.log("Admin aniqlandi. Sahifa: admin");
          return router.replace('/admin');
        }

        if (role === 'pending') {
          console.log("Kutilayotgan foydalanuvchi. Sahifa: pending");
          return router.replace('/pending');
        }

        if (role === 'student') {
          console.log("Talaba aniqlandi. Sahifa: home");
          return router.replace('/home');
        }

        // Agar rol yuqoridagilarning hech biriga tushmasa (masalan, noto'g'ri yozilgan bo'lsa)
        console.warn("Noma'lum rol aniqlandi:", role);
        return router.replace('/login');

      } catch (error) {
        console.error("Index sahifasida xatolik:", error);
        return router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={styles.loadingText}>Yuklanmoqda...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#F8FAFC'
  },
  loadingText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 14
  }
});