import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth } from './firebaseConfig';

export default function Pending() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (e) { console.error(e); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={styles.title}>Hisobingiz ko'rilmoqda</Text>
      <Text style={styles.desc}>Admin sizni tasdiqlashi bilan barcha kurslar va darslar ochiladi. Iltimos, kuting.</Text>
      
      <TouchableOpacity style={styles.btn} onPress={handleSignOut}>
        <Text style={styles.btnText}>Tizimdan chiqish</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 35, backgroundColor: '#fff' },
  icon: { fontSize: 80, marginBottom: 25 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1E293B', textAlign: 'center' },
  desc: { textAlign: 'center', color: '#64748B', marginTop: 15, marginBottom: 45, fontSize: 16, lineHeight: 24 },
  btn: { backgroundColor: '#F1F5F9', padding: 18, borderRadius: 15, width: '100%', alignItems: 'center' },
  btnText: { color: '#EF4444', fontSize: 16, fontWeight: 'bold' }
});