import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from './firebaseConfig';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !password) {
      return Alert.alert('Xato', 'Email va parolni kiriting');
    }
    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, trimEmail, password);
      const userDoc  = await getDoc(doc(db, 'users', userCred.user.uid));
      if (userDoc.exists()) {
        const role = userDoc.data().role;
        if (role === 'super-admin') router.replace('/superadmin');
        else if (role === 'admin')  router.replace('/admin');
        else                        router.replace('/home');
      } else {
        router.replace('/home');
      }
    } catch {
      Alert.alert('Xato', "Email yoki parol noto'g'ri");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#4F46E5', '#7C3AED', '#C026D3']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[s.circle, { top: -60, right: -60, opacity: 0.2 }]} />
      <View style={[s.circle, { bottom: -100, left: -80, width: 260, height: 260, opacity: 0.12 }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.kav}
      >
        <View style={s.card}>
          <Text style={s.title}>Xush kelibsiz</Text>
          <Text style={s.subtitle}>Davom etish uchun tizimga kiring</Text>

          {/* Email */}
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Email manzilingiz"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Parol */}
          <View style={[s.inputWrap, s.row]}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Parolingiz"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity
              onPress={() => setShowPw(p => !p)}
              style={s.eyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.eyeTxt}>{showPw ? "Yashir" : "Ko'rsat"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.btn, loading && s.btnDis]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Tizimga kirish</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={s.footer} onPress={() => router.push('/register')}>
            <Text style={s.footerTxt}>
              Akkauntingiz yo'qmi?{' '}
              <Text style={s.link}>Ro'yxatdan o'ting</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1 },
  circle:  { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#fff' },
  kav:     { flex: 1, justifyContent: 'center', padding: 20 },
  card:    {
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingHorizontal: 26,
    paddingVertical: 42,
    borderRadius: 36,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 12,
  },
  title:    { fontSize: 30, fontWeight: '900', color: '#1E293B', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 30 },
  inputWrap:{
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    overflow: 'hidden',
  },
  row:      { flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  input:    { paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, color: '#1E293B' },
  eyeBtn:   { marginLeft: 8 },
  eyeTxt:   { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  btn:      {
    backgroundColor: '#4F46E5',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  btnDis:   { backgroundColor: '#94A3B8', elevation: 0, shadowOpacity: 0 },
  btnTxt:   { color: '#fff', fontSize: 18, fontWeight: '800' },
  footer:   { marginTop: 24, alignItems: 'center' },
  footerTxt:{ color: '#64748B', fontSize: 14 },
  link:     { color: '#4F46E5', fontWeight: '800' },
});
