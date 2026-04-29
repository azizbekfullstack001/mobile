import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { auth, db } from './firebaseConfig';

export default function Register() {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    const trimName  = name.trim();
    const trimEmail = email.trim().toLowerCase();

    if (!trimName || !trimEmail || !password.trim()) {
      return Alert.alert('Xato', "Iltimos, barcha maydonlarni to'ldiring!");
    }
    if (password.length < 6) {
      return Alert.alert('Xato', "Parol kamida 6 ta belgidan iborat bo'lishi kerak!");
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, trimEmail, password);
      await updateProfile(cred.user, { displayName: trimName });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid:         cred.user.uid,
        name:        trimName,
        displayName: trimName,
        email:       trimEmail,
        role:        'pending',
        createdAt:   serverTimestamp(),
      });
      router.replace('/pending');
    } catch (e: any) {
      const msg =
        e.code === 'auth/email-already-in-use'
          ? "Bu email allaqachon ro'yxatdan o'tgan!"
          : e.code === 'auth/invalid-email'
          ? "Email noto'g'ri formatda!"
          : e.code === 'auth/network-request-failed'
          ? "Internet aloqasi yo'q. Qayta urinib ko'ring."
          : "Ro'yxatdan o'tishda xatolik yuz berdi.";
      Alert.alert('Xato', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.bgOverlay} />

      {/* Decorative glows */}
      <View style={s.glow1} pointerEvents="none" />
      <View style={s.glow2} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <Animated.View entering={FadeInUp.duration(900)} style={s.header}>
              <View style={s.logo}>
                <FontAwesome5 name="user-plus" size={30} color="#fff" />
              </View>
              <Text style={s.appTitle}>AImath Academy</Text>
              <Text style={s.appSub}>Platformaga qo'shiling</Text>
            </Animated.View>

            {/* Card */}
            <Animated.View entering={FadeInDown.delay(200).duration(900)} style={s.card}>
              <Text style={s.cardTitle}>Hisob yaratish</Text>

              <Text style={s.label}>To'liq ismingiz</Text>
              <View style={s.inputBox}>
                <TextInput
                  style={s.input}
                  placeholder="Ism va familiya"
                  placeholderTextColor="#94A3B8"
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <Text style={s.label}>Email manzilingiz</Text>
              <View style={s.inputBox}>
                <TextInput
                  style={s.input}
                  placeholder="example@mail.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <Text style={s.label}>Parol yarating</Text>
              <View style={[s.inputBox, s.row]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Kamida 6 belgi"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <TouchableOpacity
                  onPress={() => setShowPw(p => !p)}
                  style={s.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPw ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>

              {/* Password hint */}
              {password.length > 0 && password.length < 6 && (
                <Animated.View entering={FadeInDown.duration(300)} style={s.hintRow}>
                  <Ionicons name="alert-circle-outline" size={13} color="#F87171" />
                  <Text style={s.hintTxt}>Parol kamida 6 ta belgi bo'lishi kerak</Text>
                </Animated.View>
              )}

              <TouchableOpacity
                style={[s.btn, loading && s.btnDis]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={s.btnInner}>
                    <Text style={s.btnTxt}>Ro'yxatdan o'tish</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Info note */}
              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={14} color="#64748B" />
                <Text style={s.infoTxt}>
                  Ro'yxatdan o'tgach hisobingiz admin tomonidan tasdiqlanadi
                </Text>
              </View>
            </Animated.View>

            {/* Footer */}
            <Animated.View entering={FadeInDown.delay(400).duration(900)} style={s.footer}>
              <Text style={s.footerTxt}>Profilingiz bormi? </Text>
              <TouchableOpacity onPress={() => router.replace('/login')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.link}>Kirish qiling</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#1E1B4B' },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#1E1B4B' },
  glow1:     { position: 'absolute', top: -80, right: -60,  width: 260, height: 260, borderRadius: 130, backgroundColor: '#10B981', opacity: 0.08 },
  glow2:     { position: 'absolute', bottom: 40, left: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: '#6366F1', opacity: 0.07 },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24 },

  header:   { alignItems: 'center', marginBottom: 28 },
  logo:     {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#10B981',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#10B981', shadowOpacity: 0.45, shadowRadius: 16, elevation: 14,
  },
  appTitle: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  appSub:   { fontSize: 14, color: '#CBD5E1', marginTop: 5 },

  card:      {
    backgroundColor: '#fff', borderRadius: 32, padding: 26,
    elevation: 18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 22, textAlign: 'center' },

  label:    { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6, marginLeft: 4 },
  inputBox: {
    backgroundColor: '#F1F5F9', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 16, overflow: 'hidden',
  },
  row:      { flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  input:    { paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: '#1E293B', fontWeight: '500' },
  eyeBtn:   { marginLeft: 8, padding: 2 },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -10, marginBottom: 10, marginLeft: 4 },
  hintTxt: { fontSize: 11, color: '#F87171', fontWeight: '600' },

  btn:      {
    backgroundColor: '#10B981', borderRadius: 20, height: 62,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
    shadowColor: '#10B981', shadowOpacity: 0.38, shadowRadius: 10, elevation: 8,
  },
  btnDis:   { backgroundColor: '#94A3B8', elevation: 0, shadowOpacity: 0 },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  btnTxt:   { color: '#fff', fontSize: 17, fontWeight: '800' },

  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 14, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  infoTxt:  { flex: 1, fontSize: 11, color: '#64748B', lineHeight: 16 },

  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerTxt: { color: '#E2E8F0', fontSize: 14, fontWeight: '500' },
  link:      { color: '#10B981', fontSize: 14, fontWeight: '800' },
});