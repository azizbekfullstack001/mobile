import { Feather, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import YoutubePlayer from 'react-native-youtube-iframe';
import { auth, db } from './firebaseConfig';

// YouTube video ID ni barcha formatlardan ajratib olish
function extractYouTubeId(url?: string): string {
  if (!url) return '';
  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  // youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  // youtube.com/v/VIDEO_ID
  const vMatch = url.match(/\/v\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];
  return '';
}

const { width } = Dimensions.get('window');
const PASS = 80;

const COURSE_COVER_IMAGES = [
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80',
];

const getCourseCoverImage = (course: Course) => {
  const explicit = (course as any)?.image || (course as any)?.imageUrl || (course as any)?.cover || (course as any)?.coverImage;
  if (explicit) return explicit;

  const key = `${course.title ?? ''} ${course.category ?? ''}`.toLowerCase();

  if (key.includes('python')) return COURSE_COVER_IMAGES[1];
  if (key.includes('react')) return COURSE_COVER_IMAGES[0];
  if (key.includes('javascript')) return COURSE_COVER_IMAGES[5];
  if (key.includes('flutter')) return COURSE_COVER_IMAGES[4];
  if (key.includes('firebase')) return COURSE_COVER_IMAGES[2];
  if (key.includes('database') || key.includes('sql')) return COURSE_COVER_IMAGES[3];

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) % COURSE_COVER_IMAGES.length;
  return COURSE_COVER_IMAGES[hash];
};

const getLessonTypeTheme = (lessonType: Lesson['lessonType'] | undefined, T: any) => {
  if (lessonType === 'amaliy') {
    return {
      bg: T.grnBg,
      txt: T.grnTxt,
      accent: T.grn,
      icon: 'code',
      emoji: '🛠️',
    };
  }
  if (lessonType === 'laboratoriya') {
    return {
      bg: T.ambBg,
      txt: T.ambTxt,
      accent: T.amb,
      icon: 'flask',
      emoji: '🧪',
    };
  }
  return {
    bg: T.accBg,
    txt: T.accTxt,
    accent: T.acc,
    icon: 'book-open',
    emoji: '📘',
  };
};


const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  platformName:     'SHODIYEV M',
  certificateType:  'KURS SERTIFIKATI',
  mainTitle:        'SERTIFIKAT',
  introText:        'Ushbu sertifikat quyidagilarga tegishli:',
  completionText:   'kursini muvaffaqiyatli tugatdi',
  directorName:     'Shodiyeva M',
  signatureName:    'Shodiyeva M',
  organizationName: "Rahbar",
  sealText:         'SHODIYEV M',
};

const BASE64_ENCODING =
  (FileSystem as any).EncodingType?.Base64 ??
  (FileSystem as any).EncodingType?.BASE64 ??
  'base64';

const escapeHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeRole = (role?: string) => {
  if (role === 'super-admin' || role === 'admin' || role === 'student' || role === 'user') {
    return role;
  }
  return 'user';
};


const getLessonTypeLabel = (lessonType?: Lesson['lessonType']) => {
  if (lessonType === 'amaliy') return 'amaliy mashg‘ulot';
  if (lessonType === 'laboratoriya') return 'laboratoriya ishi';
  return 'ma’ruza';
};

const getLessonTypeShortLabel = (lessonType?: Lesson['lessonType']) => {
  if (lessonType === 'amaliy') return 'Amaliy';
  if (lessonType === 'laboratoriya') return 'Laboratoriya';
  return 'Ma’ruza';
};

const getLessonTypedNumber = (target: Lesson, allLessons: Lesson[]) => {
  const sameType = allLessons
    .filter(item => item.lessonType === target.lessonType)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const index = sameType.findIndex(item => item.id === target.id);
  return index >= 0 ? index + 1 : target.order ?? 1;
};

const getLessonDisplayTitle = (lesson: Lesson, allLessons: Lesson[]) => {
  const number = getLessonTypedNumber(lesson, allLessons);
  return `${number}-${getLessonTypeLabel(lesson.lessonType)}. ${lesson.title}`;
};


// ─── Ranglar palitralari ────────────────────────────────────────────────────

const LIGHT = {
  bg: '#F2F4F8', surf: '#FFFFFF', card: '#FFFFFF', border: '#E4E9F0',
  border2: '#CBD5E1', txt: '#0F172A', sub: '#64748B', mut: '#94A3B8',
  acc: '#4F6BFF', accBg: '#EEF1FF', accTxt: '#3730A3',
  grn: '#16A34A', grnBg: '#DCFCE7', grnTxt: '#14532D',
  amb: '#D97706', ambBg: '#FEF3C7', ambTxt: '#78350F',
  pur: '#7C3AED', purBg: '#F3E8FF', purTxt: '#4C1D95',
  sky: '#0284C7', skyBg: '#E0F2FE', skyTxt: '#0C4A6E',
  red: '#DC2626', redBg: '#FFF0F0', redTxt: '#7F1D1D',
  nav: '#FFFFFF',
};

const DARK = {
  bg: '#080C14', surf: '#0D1421', card: '#111827', border: '#1E2D40',
  border2: '#2A3A50', txt: '#E8F0FE', sub: '#6B8CAE', mut: '#3A4F6A',
  acc: '#5B73FF', accBg: 'rgba(91,115,255,.13)', accTxt: '#A5B4FF',
  grn: '#00D68F', grnBg: 'rgba(0,214,143,.12)', grnTxt: '#6EE7B7',
  amb: '#FFB938', ambBg: 'rgba(255,185,56,.12)', ambTxt: '#FDE68A',
  pur: '#C084FC', purBg: 'rgba(168,85,247,.12)', purTxt: '#E9D5FF',
  sky: '#38BDF8', skyBg: 'rgba(56,189,248,.12)', skyTxt: '#BAE6FD',
  red: '#FF4B7A', redBg: 'rgba(255,75,122,.12)', redTxt: '#FCA5A5',
  nav: '#0D1421',
};

// Kurs rangiga mos accent ranglarni qaytaradi
function accent(colorKey: string, T: typeof LIGHT) {
  const map: Record<string, { col: string; bg: string; txt: string }> = {
    acc: { col: T.acc, bg: T.accBg, txt: T.accTxt },
    pur: { col: T.pur, bg: T.purBg, txt: T.purTxt },
    sky: { col: T.sky, bg: T.skyBg, txt: T.skyTxt },
    grn: { col: T.grn, bg: T.grnBg, txt: T.grnTxt },
    amb: { col: T.amb, bg: T.ambBg, txt: T.ambTxt },
  };
  return map[colorKey] ?? map.acc;
}

// ─── Typlar ─────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options:  string[];
  correct:  number;
}

interface Lesson {
  id:                string;
  title:             string;
  order:             number;
  lessonType?:       'maruza' | 'amaliy' | 'laboratoriya';
  videoUrl?:         string;
  videoDuration?:    string;
  practicalUrl?:     string;
  practicalDuration?: string;
  theoryText?:       string;
  theoryFileName?:   string;
  theoryFileUri?:    string;
  theoryFileBase64?: string;
  theoryFileMimeType?: string;
  theoryFileSize?:   number;
  theoryFileChunked?: boolean;
  theoryFileChunkCount?: number;
  quiz?:             QuizQuestion[];
}

interface Course {
  id:          string;
  title:       string;
  description?: string;
  category?:   string;
  icon?:       string;
  color?:      string;
  views?:      number;
  createdAt?:  any;
}

interface Result {
  id?:          string;
  studentId:    string;
  courseId:     string;
  lessonId:     string;
  courseTitle:  string;
  lessonTitle:  string;
  score:        number;
  completedAt:  string;
  attempts?:    number;
}

interface LessonProgress {
  id?:          string;
  userId:       string;
  courseId:     string;
  lessonId:     string;
  videoDone?:   boolean;
  theoryDone?:  boolean;
  quizDone?:    boolean;
  completed?:   boolean;
  updatedAt?:   string;
}

interface CertificateSettings {
  platformName:      string;
  certificateType:   string;
  mainTitle:         string;
  introText:         string;
  completionText:    string;
  directorName:      string;
  signatureName:     string;
  organizationName:  string;
  sealText:          string;
}

// ─── Badge komponenti ────────────────────────────────────────────────────────

const Badge = ({
  label, col, bg,
}: { label: string; col: string; bg: string }) => (
  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: bg, alignSelf: 'flex-start' }}>
    <Text style={{ fontSize: 10, fontWeight: '700', color: col }}>{label}</Text>
  </View>
);

// ─── QuizModal ───────────────────────────────────────────────────────────────

const QuizModal = ({
  lesson, course, studentId, T, onClose, onPassed,
}: {
  lesson:    Lesson;
  course:    Course;
  studentId: string;
  T:         typeof LIGHT;
  onClose:   () => void;
  onPassed?: () => void;
}) => {
  const questions = lesson.quiz ?? [];
  const [currentQ, setCurrentQ]   = useState(0);
  const [selected,  setSelected]  = useState<number | null>(null);
  const [answers,   setAnswers]   = useState<(number | null)[]>(
    Array(questions.length).fill(null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [score,     setScore]     = useState(0);
  const [saving,    setSaving]    = useState(false);

  if (questions.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg, padding: 24 }}>
        <Text style={{ color: T.sub, fontSize: 15, textAlign: 'center' }}>
          Bu dars uchun test savollar yo'q.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: T.acc, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}
          onPress={onClose}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Orqaga</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAnswer = (idx: number) => {
    if (submitted) return;
    setSelected(idx);
    const a = [...answers];
    a[currentQ] = idx;
    setAnswers(a);
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(c => c + 1);
      setSelected(answers[currentQ + 1]);
    } else {
      // Hisoblash
      const correct = answers.filter((a, i) => a === questions[i].correct).length;
      const pct     = Math.round((correct / questions.length) * 100);
      setScore(pct);
      setSubmitted(true);
      savResult(pct);
    }
  };

  const savResult = async (pct: number) => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'results'), {
        studentId:   studentId,
        courseId:    course.id,
        lessonId:    lesson.id,
        courseTitle: course.title,
        lessonTitle: lesson.title,
        score:       pct,
        completedAt: new Date().toISOString(),
        attempts:    1,
      } as Omit<Result, 'id'>);

      if (pct >= PASS) {
        onPassed?.();
      }
    } catch (e) {
      console.error('Natija saqlashda xato:', e);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    const passed  = score >= PASS;
    const color   = passed ? T.grn : score >= 50 ? T.amb : T.red;
    const bg      = passed ? T.grnBg : score >= 50 ? T.ambBg : T.redBg;
    const txt     = passed ? T.grnTxt : score >= 50 ? T.ambTxt : T.redTxt;
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg, padding: 24 }}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 30, fontWeight: '900', color }}>{score}%</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '900', color: T.txt, marginBottom: 8 }}>
          {passed ? '🎉 Tabriklaymiz!' : score >= 50 ? '😊 Yaxshi!' : '😓 Harakat qiling!'}
        </Text>
        <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', marginBottom: 24 }}>
          {answers.filter((a, i) => a === questions[i].correct).length}/{questions.length} to'g'ri javob
        </Text>
        <Badge label={passed ? 'O\'tdingiz ✓' : 'O\'tmadingiz'} col={txt} bg={bg} />
        <TouchableOpacity
          style={{ marginTop: 30, backgroundColor: T.acc, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}
          onPress={onClose}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Yopish</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[currentQ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 20 }}>
      {/* Progress */}
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 12, color: T.sub }}>Savol {currentQ + 1}/{questions.length}</Text>
          <Text style={{ fontSize: 12, color: T.sub }}>
            {Math.round(((currentQ) / questions.length) * 100)}%
          </Text>
        </View>
        <View style={{ height: 4, backgroundColor: T.border, borderRadius: 2 }}>
          <View style={{
            height: '100%', borderRadius: 2, backgroundColor: T.acc,
            width: `${((currentQ) / questions.length) * 100}%`,
          }} />
        </View>
      </View>

      {/* Savol */}
      <View style={{ backgroundColor: T.surf, borderRadius: 18, borderWidth: 0.5, borderColor: T.border, padding: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.txt, lineHeight: 24 }}>{q.question}</Text>
      </View>

      {/* Variantlar */}
      {q.options.map((opt, idx) => {
        const isSelected = selected === idx;
        return (
          <TouchableOpacity
            key={idx}
            style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: isSelected ? T.accBg : T.surf,
              borderRadius: 14, borderWidth: 1,
              borderColor: isSelected ? T.acc : T.border,
              padding: 14, marginBottom: 10, gap: 12,
            }}
            onPress={() => handleAnswer(idx)}
            activeOpacity={0.8}
          >
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              borderWidth: 2,
              borderColor: isSelected ? T.acc : T.border2,
              backgroundColor: isSelected ? T.acc : 'transparent',
              justifyContent: 'center', alignItems: 'center',
            }}>
              {isSelected && <Feather name="check" size={13} color="#fff" />}
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: isSelected ? T.accTxt : T.txt }}>
              {String.fromCharCode(65 + idx)}. {opt}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={{
          backgroundColor: selected !== null ? T.acc : T.border,
          borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 8,
          opacity: selected === null ? 0.5 : 1,
        }}
        onPress={handleNext}
        disabled={selected === null}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
          {currentQ < questions.length - 1 ? 'Keyingi →' : 'Yakunlash ✓'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── Asosiy Home komponenti ──────────────────────────────────────────────────

export default function Home() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const user    = auth.currentUser;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  const T = isDark ? DARK : LIGHT;

  const [activeTab, setActiveTab] = useState<'home' | 'progress' | 'favorites' | 'profile'>('home');

  const [courses,     setCourses]     = useState<Course[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [results,     setResults]     = useState<Result[]>([]);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [favorites,   setFavorites]   = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);
  const [courseLessonStats, setCourseLessonStats] = useState<Record<string, { total: number; completed: number }>>({});
  const [certificateSettings, setCertificateSettings] = useState<CertificateSettings>(DEFAULT_CERTIFICATE_SETTINGS);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons,        setLessons]        = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  // viewMode: 'menu' | 'video' | 'practical' | 'quiz' | 'theory'
  const [viewMode, setViewMode] = useState<'menu' | 'video' | 'practical' | 'quiz' | 'theory'>('menu');

  const [passModal,    setPassModal]    = useState(false);
  const [oldPass,      setOldPass]      = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [passLoading,  setPassLoading]  = useState(false);

  // Register paytida users/{uid} ichiga saqlangan ism-familiyani olish
  const userFullName = useMemo(() => {
    const name =
      userProfile?.fullName ||
      userProfile?.fullname ||
      userProfile?.name ||
      userProfile?.displayName ||
      user?.displayName ||
      user?.email ||
      'Talaba';

    return String(name).trim() || 'Talaba';
  }, [userProfile, user]);

  const userInitial = useMemo(() => {
    return (userFullName || 'T').charAt(0).toUpperCase();
  }, [userFullName]);

  const userRole = useMemo(() => normalizeRole(userProfile?.role), [userProfile]);
  const isContentLocked = userRole === 'user';


  // ─── Firebase listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const u1 = onSnapshot(doc(db, 'users', user.uid), snap => setUserProfile(snap.data()));
    const u2 = onSnapshot(
      query(collection(db, 'courses'), orderBy('createdAt', 'desc')),
      snap => {
        setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    const u3 = onSnapshot(
      query(collection(db, 'results'), where('studentId', '==', user.uid)),
      snap => setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as Result))),
    );
    const u4 = onSnapshot(
      doc(db, 'settings', 'certificate'),
      snap => {
        if (snap.exists()) {
          setCertificateSettings({
            ...DEFAULT_CERTIFICATE_SETTINGS,
            ...(snap.data() as Partial<CertificateSettings>),
          });
        } else {
          setCertificateSettings(DEFAULT_CERTIFICATE_SETTINGS);
        }
      },
      () => setCertificateSettings(DEFAULT_CERTIFICATE_SETTINGS),
    );
    const u5 = onSnapshot(
      query(collection(db, 'lessonProgress'), where('userId', '==', user.uid)),
      snap => setLessonProgress(snap.docs.map(d => ({ id: d.id, ...d.data() } as LessonProgress))),
    );
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [user]);

  useEffect(() => {
    if (!selectedCourse) { setLessons([]); return; }
    setLessonsLoading(true);
    const u = onSnapshot(
      query(
        collection(db, 'courses', selectedCourse.id, 'lessons'),
        orderBy('order', 'asc'),
      ),
      snap => {
        setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
        setLessonsLoading(false);
      },
      () => setLessonsLoading(false),
    );
    return () => u();
  }, [selectedCourse]);

  useEffect(() => {
    if (!courses.length || !user?.uid) {
      setCourseLessonStats({});
      return;
    }

    let active = true;

    const loadCourseStats = async () => {
      try {
        const entries = await Promise.all(
          courses.map(async course => {
            const snap = await getDocs(
              query(
                collection(db, 'courses', course.id, 'lessons'),
                orderBy('order', 'asc'),
              ),
            );

            const courseLessons = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));

            const completed = courseLessons.filter(lesson => {
              const progress = lessonProgress.find(
                p => p.courseId === course.id && p.lessonId === lesson.id,
              );

              const bestScoreForLesson = results
                .filter(r => r.courseId === course.id && r.lessonId === lesson.id)
                .reduce((max, item) => Math.max(max, item.score), 0);

              const needVideo = !!lesson.videoUrl;
              const needTheory = !!lesson.theoryFileName || !!lesson.theoryText;
              const needQuiz = (lesson.quiz?.length ?? 0) > 0;

              const videoOk = !needVideo || !!progress?.videoDone;
              const theoryOk = !needTheory || !!progress?.theoryDone;
              const quizOk = !needQuiz || !!progress?.quizDone || bestScoreForLesson >= PASS;

              return videoOk && theoryOk && quizOk;
            }).length;

            return [
              course.id,
              {
                total: courseLessons.length,
                completed,
              },
            ] as const;
          }),
        );

        if (active) {
          setCourseLessonStats(Object.fromEntries(entries));
        }
      } catch (e) {
        console.log('Kurs progressini hisoblashda xato:', e);
      }
    };

    loadCourseStats();

    return () => {
      active = false;
    };
  }, [courses, user?.uid, lessonProgress, results]);

  // ─── BackHandler ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleBack = () => {
      if (passModal)          { setPassModal(false); return true; }
      if (selectedLesson) {
        if (viewMode !== 'menu') { setViewMode('menu'); return true; }
        setSelectedLesson(null);
        return true;
      }
      if (selectedCourse)     { setSelectedCourse(null); return true; }
      if (activeTab !== 'home') { setActiveTab('home'); return true; }
      return false;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => handler.remove();
  }, [passModal, selectedLesson, viewMode, selectedCourse, activeTab]);

  // ─── Hisoblar ───────────────────────────────────────────────────────────────

  // Kurs uchun o'tilgan darslar sonini qaytaradi
  const getPassedCount = useCallback(
    (cId: string) => results.filter(r => r.courseId === cId && r.score >= PASS).length,
    [results],
  );

  // Kurs uchun eng yuqori ball
  const getBestScore = useCallback(
    (cId: string, lId: string) => {
      const filtered = results.filter(r => r.courseId === cId && r.lessonId === lId);
      return filtered.length ? Math.max(...filtered.map(r => r.score)) : null;
    },
    [results],
  );

  const getLessonProgress = useCallback(
    (courseId: string, lessonId: string) =>
      lessonProgress.find(p => p.courseId === courseId && p.lessonId === lessonId),
    [lessonProgress],
  );

  const isLessonFullyCompleted = useCallback(
    (courseId: string, lesson: Lesson) => {
      const p = getLessonProgress(courseId, lesson.id);
      const needVideo = !!lesson.videoUrl;
      const needTheory = !!lesson.theoryFileName || !!lesson.theoryText;
      const needQuiz = (lesson.quiz?.length ?? 0) > 0;

      const videoOk = !needVideo || !!p?.videoDone;
      const theoryOk = !needTheory || !!p?.theoryDone;
      const quizOk = !needQuiz || !!p?.quizDone || (getBestScore(courseId, lesson.id) ?? 0) >= PASS;

      return videoOk && theoryOk && quizOk;
    },
    [getLessonProgress, getBestScore],
  );

  const isLessonUnlocked = useCallback(
    (courseId: string, lessonIndex: number) => {
      if (userRole === 'user') return true;
      if (lessonIndex === 0) return true;
      return lessons
        .slice(0, lessonIndex)
        .every(prevLesson => isLessonFullyCompleted(courseId, prevLesson));
    },
    [lessons, isLessonFullyCompleted, userRole],
  );

  const getCompletedLessonCount = useCallback(
    (courseId: string) =>
      lessons.filter(lesson => isLessonFullyCompleted(courseId, lesson)).length,
    [lessons, isLessonFullyCompleted],
  );

  const saveLessonProgress = useCallback(
    async (
      courseId: string,
      lesson: Lesson,
      patch: Partial<LessonProgress>,
    ) => {
      if (!user?.uid) return;

      const progressId = `${user.uid}_${courseId}_${lesson.id}`;
      const current = lessonProgress.find(
        p => p.courseId === courseId && p.lessonId === lesson.id,
      );

      const next: LessonProgress = {
        userId: user.uid,
        courseId,
        lessonId: lesson.id,
        videoDone: current?.videoDone ?? false,
        theoryDone: current?.theoryDone ?? false,
        quizDone: current?.quizDone ?? false,
        completed: current?.completed ?? false,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      const needVideo = !!lesson.videoUrl;
      const needTheory = !!lesson.theoryFileName || !!lesson.theoryText;
      const needQuiz = (lesson.quiz?.length ?? 0) > 0;

      const videoOk = !needVideo || !!next.videoDone;
      const theoryOk = !needTheory || !!next.theoryDone;
      const quizOk = !needQuiz || !!next.quizDone || (getBestScore(courseId, lesson.id) ?? 0) >= PASS;

      next.completed = videoOk && theoryOk && quizOk;

      await setDoc(doc(db, 'lessonProgress', progressId), next, { merge: true });
    },
    [user?.uid, lessonProgress, getBestScore],
  );


  const favCourses = useMemo(() => courses.filter(c => favorites.has(c.id)), [courses, favorites]);
  const toggleFav  = (id: string) => setFavorites(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const overallPct = results.length
    ? Math.round((results.filter(r => r.score >= PASS).length / results.length) * 100)
    : 0;
  const bestScore  = results.length > 0 ? Math.max(...results.map(r => r.score)) : 0;
  const passedCount = results.filter(r => r.score >= PASS).length;

  // ─── Sertifikat yaratish ───────────────────────────────────────────────────────
  const generateCertificate = async (course: Course) => {
    const studentName = userFullName;
    const completionDate = new Date().toLocaleDateString('uz-UZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const courseResults = results.filter(r => r.courseId === course.id && r.score >= PASS);
    const avgScore = courseResults.length
      ? Math.round(courseResults.reduce((sum, r) => sum + r.score, 0) / courseResults.length)
      : 0;

    const totalLessons = lessons.length || 1;
    const completedLessons = lessons.filter(lesson => isLessonFullyCompleted(course.id, lesson)).length;
    const completionPct = Math.min(Math.round((completedLessons / Math.max(totalLessons, 1)) * 100), 100);

    const cert = {
      ...DEFAULT_CERTIFICATE_SETTINGS,
      ...certificateSettings,
    };

    const certId = `CERT-${course.id.slice(0, 6).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4 landscape; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { width: 100%; min-height: 100vh; font-family: Arial, Helvetica, sans-serif; background: #fff; }

            .page {
              width: 100%;
              min-height: 100vh;
              background:
                linear-gradient(135deg, #8ad9a2 0 16%, transparent 16%),
                linear-gradient(225deg, #ffe866 0 20%, transparent 20%),
                linear-gradient(45deg, #8ccbf2 0 19%, transparent 19%),
                linear-gradient(315deg, #c99bdf 0 18%, transparent 18%),
                linear-gradient(90deg, #f6aed1 0 17%, transparent 17%),
                #ffffff;
              padding: 30px;
              position: relative;
              overflow: hidden;
            }

            .sheet {
              width: calc(100% - 34px);
              height: calc(100vh - 60px);
              min-height: 535px;
              margin: 0 auto;
              background: #ffffff;
              position: relative;
              overflow: hidden;
              border: 1px solid rgba(15, 23, 42, .05);
              box-shadow: 0 18px 45px rgba(15, 23, 42, .10);
            }

            .title {
              text-align: center;
              color: #2f5faa;
              font-size: 54px;
              letter-spacing: 4px;
              font-weight: 500;
              margin-top: 70px;
              text-transform: uppercase;
            }

            .subtitle {
              text-align: center;
              color: #171d3d;
              font-size: 27px;
              line-height: 1.35;
              margin-top: 14px;
              font-weight: 500;
            }

            .name {
              width: 70%;
              margin: 30px auto 0;
              text-align: center;
              color: #111827;
              font-size: 32px;
              font-weight: 800;
              padding-bottom: 8px;
              border-bottom: 3px dotted #111827;
            }

            .course-box {
              width: 72%;
              margin: 22px auto 0;
              text-align: center;
              color: #273152;
              font-size: 19px;
              line-height: 1.55;
            }

            .course-name {
              color: #2f5faa;
              font-size: 24px;
              font-weight: 800;
              margin: 6px 0;
            }

            .percent-box {
              margin: 16px auto 0;
              display: flex;
              justify-content: center;
              gap: 16px;
            }

            .percent-card {
              min-width: 150px;
              border-radius: 16px;
              border: 2px solid #dbeafe;
              background: #f8fbff;
              padding: 10px 14px;
              text-align: center;
            }

            .percent-value { font-size: 28px; font-weight: 900; color: #2f5faa; }
            .percent-label {
              font-size: 11px;
              color: #667085;
              margin-top: 2px;
              text-transform: uppercase;
              letter-spacing: .6px;
            }

            .footer {
              position: absolute;
              left: 110px;
              right: 110px;
              bottom: 56px;
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              z-index: 4;
            }

            .signature-block { width: 220px; text-align: center; }
            .signature {
              color: #0f172a;
              font-family: "Brush Script MT", "Segoe Script", cursive;
              font-size: 28px;
              font-weight: 700;
              transform: rotate(-4deg);
              margin-bottom: -5px;
            }
            .sign-line { border-top: 3px dotted #111827; height: 1px; margin-bottom: 8px; }
            .sign-role { color: #273152; font-size: 14px; font-weight: 600; }

            .seal-wrap {
              width: 128px;
              height: 128px;
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .seal-ribbon {
              position: absolute;
              bottom: -54px;
              left: 42px;
              width: 44px;
              height: 96px;
              background: linear-gradient(180deg, #ffcc37, #f5a800);
              clip-path: polygon(0 0, 100% 0, 75% 100%, 50% 80%, 25% 100%);
              z-index: 1;
            }
            .seal-star {
              width: 118px;
              height: 118px;
              background: #f3c52c;
              clip-path: polygon(50% 0%, 57% 13%, 70% 8%, 75% 22%, 90% 22%, 87% 37%, 100% 50%, 87% 63%, 90% 78%, 75% 78%, 70% 92%, 57% 87%, 50% 100%, 43% 87%, 30% 92%, 25% 78%, 10% 78%, 13% 63%, 0% 50%, 13% 37%, 10% 22%, 25% 22%, 30% 8%, 43% 13%);
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              z-index: 3;
              box-shadow: 0 8px 18px rgba(185, 127, 0, .25);
            }
            .seal-inner {
              width: 76px;
              height: 76px;
              border-radius: 50%;
              background: linear-gradient(135deg, #ffdf65, #ffb700);
              border: 6px solid #fff4b8;
              box-shadow: inset 0 0 0 3px rgba(255,255,255,.65);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #8a5a00;
              font-size: 10px;
              text-align: center;
              font-weight: 900;
              line-height: 1.05;
              padding: 8px;
            }

            .date { width: 220px; text-align: center; }
            .date-line { border-top: 3px dotted #111827; height: 1px; margin-bottom: 8px; }
            .date-value { color: #273152; font-size: 14px; font-weight: 600; }

            .book {
              position: absolute;
              left: -25px;
              top: 54px;
              width: 145px;
              height: 175px;
              transform: rotate(-13deg);
              z-index: 3;
            }
            .book-main {
              position: absolute;
              left: 0;
              top: 14px;
              width: 92px;
              height: 150px;
              background: #2f8ed6;
              border-radius: 6px;
              box-shadow: 8px 8px 0 rgba(29, 78, 216, .18);
            }
            .book-main::before {
              content: "";
              position: absolute;
              left: 14px;
              top: 24px;
              width: 50px;
              height: 6px;
              background: rgba(255,255,255,.25);
              box-shadow: 0 18px 0 rgba(255,255,255,.18), 0 36px 0 rgba(255,255,255,.18);
            }
            .pencil {
              position: absolute;
              left: 96px;
              top: 0;
              width: 18px;
              height: 118px;
              background: linear-gradient(90deg, #f97316 0 32%, #facc15 32% 68%, #ef4444 68%);
              border-radius: 7px;
              transform: rotate(7deg);
            }
            .pencil::before {
              content: "";
              position: absolute;
              top: -19px;
              left: 2px;
              width: 14px;
              height: 20px;
              background: #f9a8d4;
              border-radius: 5px 5px 2px 2px;
            }
            .ruler {
              position: absolute;
              left: 122px;
              top: 36px;
              width: 16px;
              height: 108px;
              background: #f8b4d9;
              transform: rotate(-22deg);
              opacity: .85;
            }

            .cap {
              position: absolute;
              right: -4px;
              top: 18px;
              width: 148px;
              height: 122px;
              z-index: 3;
            }
            .cap-top {
              position: absolute;
              right: 20px;
              top: 22px;
              width: 100px;
              height: 48px;
              background: #2f66b2;
              clip-path: polygon(50% 0, 100% 35%, 50% 70%, 0 35%);
              transform: rotate(12deg);
            }
            .cap-base {
              position: absolute;
              right: 42px;
              top: 58px;
              width: 62px;
              height: 32px;
              background: #2f66b2;
              border-radius: 8px 8px 16px 16px;
              transform: rotate(12deg);
            }
            .diploma {
              position: absolute;
              right: 24px;
              top: 86px;
              width: 88px;
              height: 26px;
              background: #f4e7b2;
              border-radius: 16px;
              transform: rotate(34deg);
              box-shadow: inset -8px 0 0 rgba(0,0,0,.06);
            }
            .tassel {
              position: absolute;
              right: 48px;
              top: 78px;
              width: 5px;
              height: 44px;
              background: #2f66b2;
              transform: rotate(12deg);
              transform-origin: top center;
            }
            .tassel::after {
              content: "";
              position: absolute;
              bottom: -10px;
              left: -7px;
              width: 18px;
              height: 18px;
              background: #2f66b2;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
            }

            .cert-id {
              position: absolute;
              right: 48px;
              bottom: 22px;
              color: #94a3b8;
              font-size: 9px;
              letter-spacing: .5px;
            }
          </style>
        </head>

        <body>
          <div class="page">
            <div class="sheet">
              <div class="book">
                <div class="book-main"></div>
                <div class="pencil"></div>
                <div class="ruler"></div>
              </div>

              <div class="cap">
                <div class="diploma"></div>
                <div class="cap-top"></div>
                <div class="cap-base"></div>
                <div class="tassel"></div>
              </div>

              <div class="title">${escapeHtml(cert.mainTitle || 'SERTIFIKAT')}</div>
              <div class="subtitle">${escapeHtml(cert.introText || 'Ushbu sertifikat quyidagilarga tegishli:')}</div>
              <div class="name">${escapeHtml(studentName)}</div>

              <div class="course-box">
                <div>Kurs nomi:</div>
                <div class="course-name">${escapeHtml(course.title)}</div>
                <div>${escapeHtml(cert.completionText || 'kursini muvaffaqiyatli tugatdi')}</div>
              </div>

              <div class="percent-box">
                <div class="percent-card">
                  <div class="percent-value">${completionPct}%</div>
                  <div class="percent-label">Kurs tugatildi</div>
                </div>
                <div class="percent-card">
                  <div class="percent-value">${avgScore}%</div>
                  <div class="percent-label">O‘rtacha ball</div>
                </div>
              </div>

              <div class="footer">
                <div class="signature-block">
                  <div class="signature">${escapeHtml(cert.signatureName || 'Shodiyeva M')}</div>
                  <div class="sign-line"></div>
                  <div class="sign-role">${escapeHtml(cert.organizationName || 'Rahbar')}: ${escapeHtml(cert.directorName || 'Shodiyeva M')}</div>
                </div>

                <div class="seal-wrap">
                  <div class="seal-ribbon"></div>
                  <div class="seal-star">
                    <div class="seal-inner">${escapeHtml(cert.sealText || 'SHODIYEV M')}</div>
                  </div>
                </div>

                <div class="date">
                  <div class="date-line"></div>
                  <div class="date-value">Berilgan sana: ${escapeHtml(completionDate)}</div>
                </div>
              </div>

              <div class="cert-id">${escapeHtml(certId)}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Sertifikatni saqlash',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Tayyor!', `Sertifikat saqlandi: ${uri}`);
      }
    } catch (e) {
      console.error('Sertifikat yaratishda xato:', e);
      Alert.alert('Xato', 'Sertifikat yaratib bo‘lmadi.');
    }
  };

  const loadTheoryFileBase64 = async (lesson: Lesson) => {
    if (lesson.theoryFileBase64) {
      return lesson.theoryFileBase64;
    }

    if (!selectedCourse || !lesson.theoryFileChunked) {
      return '';
    }

    const chunksSnap = await getDocs(
      query(
        collection(db, 'courses', selectedCourse.id, 'lessons', lesson.id, 'fileChunks'),
        orderBy('index', 'asc'),
      ),
    );

    const chunks = chunksSnap.docs
      .map(d => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index)
      .map(item => item.data);

    return chunks.join('');
  };

  const openTheoryFile = async (lesson: Lesson) => {
    try {
      if (selectedCourse) {
        await saveLessonProgress(selectedCourse.id, lesson, { theoryDone: true });
      }

      const fileBase64 = await loadTheoryFileBase64(lesson);

      if (fileBase64 && lesson.theoryFileName) {
        const safeName = lesson.theoryFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileUri = `${FileSystem.cacheDirectory}${Date.now()}_${safeName}`;

        await FileSystem.writeAsStringAsync(fileUri, fileBase64, {
          encoding: BASE64_ENCODING as any,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: lesson.theoryFileMimeType || 'application/octet-stream',
            dialogTitle: lesson.theoryFileName,
          });
          return;
        }

        const canOpen = await Linking.canOpenURL(fileUri);
        if (canOpen) {
          await Linking.openURL(fileUri);
          return;
        }

        Alert.alert('Tayyor', `Fayl saqlandi: ${fileUri}`);
        return;
      }

      if (lesson.theoryFileUri?.startsWith('http')) {
        await Linking.openURL(lesson.theoryFileUri);
        return;
      }

      if (lesson.theoryFileUri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(lesson.theoryFileUri);
        } else {
          Alert.alert('Xato', 'Qurilmangizda ulashish funksiyasi mavjud emas.');
        }
        return;
      }

      Alert.alert('Xato', 'Nazariy fayl topilmadi.');
    } catch (e) {
      console.error('Fayl ochishda xato:', e);
      Alert.alert('Xato', 'Faylni ochib bo‘lmadi. Qaytadan urinib ko‘ring.');
    }
  };

  // ─── Parol yangilash ─────────────────────────────────────────────────────────
  const handlePassUpdate = async () => {
    if (newPass.length < 6) {
      Alert.alert('Xato', "Parol kamida 6 belgi bo'lishi kerak.");
      return;
    }
    setPassLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user!.email!, oldPass);
      await reauthenticateWithCredential(user!, cred);
      await updatePassword(user!, newPass);
      Alert.alert('Ajoyib!', 'Parol yangilandi');
      setPassModal(false);
      setOldPass('');
      setNewPass('');
    } catch {
      Alert.alert('Xato', 'Eski parol noto\'g\'ri yoki xato yuz berdi.');
    } finally {
      setPassLoading(false);
    }
  };

  // ─── Chiqish ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Chiqish', 'Tizimdan chiqishni istaysizmi?', [
      { text: 'Bekor' },
      {
        text: 'Chiqish', style: 'destructive',
        onPress: () => auth.signOut().then(() => router.replace('/login')),
      },
    ]);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER QISMLARI
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Hero widget ─────────────────────────────────────────────────────────────
  const renderHero = () => {
    const offset = 138.2 - (overallPct / 100) * 138.2;
    const barHeights = [40, 60, 25, 90, 65, 38, 75];
    return (
      <View style={[s.hero, { backgroundColor: T.surf, borderColor: T.border }]}>
        <View style={s.heroRow}>
          {/* Doira progress */}
          <View style={s.ring}>
            <Svg width={56} height={56} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx="28" cy="28" r="22" stroke={T.border} strokeWidth="5" fill="none" />
              <Circle
                cx="28" cy="28" r="22" stroke={T.acc} strokeWidth="5" fill="none"
                strokeDasharray="138.2" strokeDashoffset={offset} strokeLinecap="round"
              />
            </Svg>
            <View style={s.ringC}>
              <Text style={[s.rp, { color: T.acc }]}>{overallPct}%</Text>
              <Text style={[s.rl, { color: T.sub }]}>ball</Text>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[s.ht, { color: T.txt }]}>Yaxshi ketmoqda</Text>
            <Text style={[s.hs, { color: T.sub }]}>
              {passedCount}/{results.length} dars yakunlandi
            </Text>
            <View style={s.bars}>
              {barHeights.map((h, i) => (
                <View
                  key={i}
                  style={[s.bar, {
                    height: `${h}%`,
                    backgroundColor: h > 50 ? T.acc : T.border,
                  }]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={[s.hstats, { borderTopColor: T.border }]}>
          <View style={s.hst}>
            <Text style={[s.hsv, { color: T.grn }]}>{passedCount}</Text>
            <Text style={s.hsl}>Yakunlandi</Text>
          </View>
          <View style={[s.hsp, { backgroundColor: T.border }]} />
          <View style={s.hst}>
            <Text style={[s.hsv, { color: T.acc }]}>{bestScore}%</Text>
            <Text style={s.hsl}>Eng yuqori</Text>
          </View>
          <View style={[s.hsp, { backgroundColor: T.border }]} />
          <View style={s.hst}>
            <Text style={[s.hsv, { color: T.sky }]}>{results.length}</Text>
            <Text style={s.hsl}>Urinish</Text>
          </View>
        </View>
      </View>
    );
  };

  // ── Top kurslar (gorizontal scroll) ─────────────────────────────────────────
  const renderTopScroll = () => {
    const sorted = [...courses].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const rankColors = [
      { bg: T.ambBg, txt: T.ambTxt },
      { bg: isDark ? T.mut : '#F0F0F0', txt: isDark ? T.surf : '#555' },
      { bg: T.accBg, txt: T.accTxt },
    ];
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        {sorted.slice(0, 5).map((c, i) => {
          const ac = accent(c.color ?? 'acc', T);
          const rc = rankColors[i] ?? { bg: T.border, txt: T.sub };
          const maxViews = sorted[0]?.views ?? 1;
          const fillPct = Math.round(((c.views ?? 0) / maxViews) * 100);
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.topCard, { backgroundColor: T.surf, borderColor: T.border }]}
              onPress={() => setSelectedCourse(c)}
              activeOpacity={0.85}
            >
              {/* Rank badge */}
              <View style={[s.rankBadge, { backgroundColor: rc.bg }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: rc.txt }}>{i + 1}</Text>
              </View>
              <View style={[s.topIcon, { backgroundColor: ac.bg }]}>
                <Text style={{ fontSize: 18 }}>{c.icon ?? '📚'}</Text>
              </View>
              <Text style={[s.topName, { color: T.txt }]} numberOfLines={2}>{c.title}</Text>
              <Text style={[s.topViews, { color: T.sub }]}>
                {(c.views ?? 0).toLocaleString()} ko'rish
              </Text>
              <View style={[s.topBar, { backgroundColor: T.border }]}>
                <View style={[s.topFill, { width: `${fillPct}%`, backgroundColor: ac.col }]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  // ── Kurs card ─────────────────────────────────────────────────────────────────
  const renderCourseCard = (c: Course, index: number) => {
    const ac = accent(c.color ?? 'acc', T);
    const loved = favorites.has(c.id);
    const stats = courseLessonStats[c.id];
    const totalLessons = stats?.total ?? ((c as any).lessonsCount || (c as any).lessonCount || 0);
    const doneCount = stats?.completed ?? getPassedCount(c.id);
    const pct = totalLessons > 0
      ? Math.min(Math.round((doneCount / totalLessons) * 100), 100)
      : 0;
    const coverImage = getCourseCoverImage(c);

    return (
      <Animated.View key={c.id} entering={FadeInDown.delay(index * 70)}>
        <TouchableOpacity
          style={[s.courseCardNew, { backgroundColor: T.surf, borderColor: T.border }]}
          onPress={() => setSelectedCourse(c)}
          activeOpacity={0.9}
        >
          <ImageBackground
            source={{ uri: coverImage }}
            resizeMode="cover"
            imageStyle={s.courseCoverImg}
            style={s.courseCover}
          >
            <View style={s.courseCoverShade} />
            <View style={s.courseCoverTop}>
              <View style={[s.courseChip, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                <Text style={{ fontSize: 16 }}>{c.icon ?? '📚'}</Text>
                <Text style={[s.courseChipText, { color: '#16325c' }]}>
                  {c.category ?? 'Kurs'}
                </Text>
              </View>

              <TouchableOpacity
                style={s.courseHeart}
                onPress={() => toggleFav(c.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={loved ? 'heart' : 'heart-outline'}
                  size={18}
                  color={loved ? '#ef4444' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>

            <View style={s.courseCoverBottom}>
              <Text style={s.courseTitleNew} numberOfLines={2}>{c.title}</Text>
              <Text style={s.courseDescNew} numberOfLines={2}>
                {c.description || 'Zamonaviy va qiziqarli darslar to‘plami'}
              </Text>
            </View>
          </ImageBackground>

          <View style={s.courseBodyNew}>
            <View style={s.courseStatRow}>
              <View style={[s.courseMiniStat, { backgroundColor: ac.bg }]}>
                <Feather name="layers" size={14} color={ac.col} />
                <Text style={[s.courseMiniText, { color: ac.txt }]}>
                  {doneCount}/{totalLessons || 0} yakunlangan
                </Text>
              </View>

              <View style={[s.courseMiniStat, { backgroundColor: T.skyBg }]}>
                <Feather name="play-circle" size={14} color={T.skyTxt} />
                <Text style={[s.courseMiniText, { color: T.skyTxt }]}>
                  {(c.views ?? 0).toLocaleString()} ko‘rish
                </Text>
              </View>
            </View>

            <View style={s.courseProgressHead}>
              <Text style={[s.courseProgressLabel, { color: T.sub }]}>O‘zlashtirish</Text>
              <Text style={[s.courseProgressValue, { color: ac.col }]}>
                {totalLessons > 0 ? `${pct}%` : '0%'}
              </Text>
            </View>

            <View style={[s.courseProgressTrack, { backgroundColor: T.border }]}>
              <View style={[s.courseProgressFill, { width: `${pct}%`, backgroundColor: ac.col }]} />
            </View>

            <View style={s.courseBottomRow}>
              <Text style={[s.courseActionHint, { color: T.sub }]}>
                Bosib ichiga kiring
              </Text>
              <View style={[s.courseOpenBtn, { backgroundColor: ac.col }]}>
                <Text style={s.courseOpenBtnText}>Ochish</Text>
                <Feather name="arrow-right" size={14} color="#fff" />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ── Home tab ───────────────────────────────────────────────────────────────── ─────────────────────────────────────────────────────────────────
  const renderHome = () => (
    <View>
      {renderHero()}
      <View style={s.secHd}>
        <Text style={[s.secT, { color: T.txt }]}>Top kurslar</Text>
        <Text style={[s.secA, { color: T.acc }]}>Barchasi</Text>
      </View>
      {renderTopScroll()}

      <View style={s.secHd}>
        <Text style={[s.secT, { color: T.txt }]}>Barcha kurslar</Text>
      </View>
      {courses.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <Text style={{ color: T.sub, fontSize: 14 }}>Kurslar yuklanmoqda...</Text>
        </View>
      ) : (
        courses.map((c, i) => renderCourseCard(c, i))
      )}
    </View>
  );

  // ── Progress tab ──────────────────────────────────────────────────────────────
  const renderProgress = () => {
    const activeCourses = new Set(results.map(r => r.courseId)).size;
    return (
      <View>
        {/* Stat grid */}
        <View style={s.statGrid}>
          {[
            { val: passedCount,     lbl: 'Yakunlangan darslar',  color: T.grn  },
            { val: `${bestScore}%`, lbl: 'Eng yuqori ball',       color: T.acc  },
            { val: activeCourses,   lbl: 'Faol kurslar',          color: T.pur  },
            { val: results.length,  lbl: 'Jami urinishlar',       color: T.amb  },
          ].map((item, i) => (
            <Animated.View key={item.lbl} entering={ZoomIn.delay(i * 60)}>
              <View style={[s.statCard, { backgroundColor: T.surf, borderColor: T.border }]}>
                <Text style={[s.statVal, { color: item.color }]}>{item.val}</Text>
                <Text style={[s.statLbl, { color: T.sub }]}>{item.lbl}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <View style={s.secHd}>
          <Text style={[s.secT, { color: T.txt }]}>So'nggi natijalar</Text>
        </View>

        {results.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Feather name="activity" size={40} color={T.mut} />
            <Text style={{ color: T.sub, fontSize: 14, marginTop: 12 }}>
              Hali testlar topshirilmagan
            </Text>
          </View>
        ) : (
          results.slice(0, 20).map((r, i) => {
            const rc = r.score >= PASS ? T.grn : r.score >= 50 ? T.amb : T.red;
            const rb = r.score >= PASS ? T.grnBg : r.score >= 50 ? T.ambBg : T.redBg;
            const rt = r.score >= PASS ? T.grnTxt : r.score >= 50 ? T.ambTxt : T.redTxt;
            return (
              <Animated.View key={r.id ?? i} entering={FadeInDown.delay(i * 40)}>
                <View style={[s.resultItem, { backgroundColor: T.surf, borderColor: T.border }]}>
                  <View style={[s.riScore, { backgroundColor: rb }]}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: rt }}>{r.score}%</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.txt, marginBottom: 2 }} numberOfLines={1}>
                      {r.lessonTitle}
                    </Text>
                    <Text style={{ fontSize: 10, color: T.sub }}>
                      {r.courseTitle} •{' '}
                      {r.completedAt
                        ? new Date(r.completedAt).toLocaleDateString('uz-UZ')
                        : ''}
                    </Text>
                    <View style={[s.pbar, { backgroundColor: T.border, marginTop: 7 }]}>
                      <View style={[s.pfill, { width: `${r.score}%`, backgroundColor: rc }]} />
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}
      </View>
    );
  };

  // ── Favorites tab ────────────────────────────────────────────────────────────
  const renderFavorites = () => (
    <View>
      <View style={s.secHd}>
        <Text style={[s.secT, { color: T.txt }]}>Sevimli kurslar</Text>
      </View>
      {favCourses.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <Ionicons name="heart-outline" size={44} color={T.mut} />
          <Text style={{ color: T.sub, fontSize: 14, marginTop: 12 }}>
            Hozircha sevimli kurslar yo'q
          </Text>
          <Text style={{ color: T.mut, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
            Kurs kartasidagi ♥ belgisiga bosing
          </Text>
        </View>
      ) : (
        favCourses.map((c, i) => renderCourseCard(c, i))
      )}
    </View>
  );

  // ── Profile tab ──────────────────────────────────────────────────────────────
  const renderProfile = () => (
    <View>
      <View style={[s.profileCard, { backgroundColor: T.surf, borderColor: T.border }]}>
        <View style={[s.av, { backgroundColor: T.acc }]}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: '#fff' }}>
            {userInitial}
          </Text>
        </View>
        <Text style={[s.pname, { color: T.txt }]}>
          {userFullName}
        </Text>
        <Text style={[s.pemail, { color: T.sub }]}>{user?.email}</Text>
        <View style={[s.rolePill, { backgroundColor: T.accBg }]}>
          <Text style={{ color: T.accTxt, fontSize: 11, fontWeight: '700' }}>{userRole === 'user' ? 'Foydalanuvchi' : userRole === 'admin' ? 'Admin' : userRole === 'super-admin' ? 'Super Admin' : 'Talaba'}</Text>
        </View>
      </View>

      <View style={[s.actionGroup, { backgroundColor: T.surf, borderColor: T.border }]}>
        {/* Tungi rejim */}
        <TouchableOpacity style={s.actionRow} onPress={() => setIsDark(!isDark)}>
          <View style={[s.actionIcon, { backgroundColor: T.accBg }]}>
            <Feather name={isDark ? 'sun' : 'moon'} size={15} color={T.acc} />
          </View>
          <Text style={[s.actionLbl, { color: T.txt }]}>Tungi rejim</Text>
          <View style={[s.tog, { backgroundColor: isDark ? T.acc : T.border }]}>
            <View style={[s.tok, { left: isDark ? 21 : 3 }]} />
          </View>
        </TouchableOpacity>

        <View style={[s.actionDiv, { backgroundColor: T.border }]} />

        {/* Parol */}
        <TouchableOpacity style={s.actionRow} onPress={() => setPassModal(true)}>
          <View style={[s.actionIcon, { backgroundColor: T.ambBg }]}>
            <Feather name="lock" size={15} color={T.amb} />
          </View>
          <Text style={[s.actionLbl, { color: T.txt }]}>Parolni yangilash</Text>
          <Feather name="chevron-right" size={16} color={T.sub} />
        </TouchableOpacity>

        <View style={[s.actionDiv, { backgroundColor: T.border }]} />

        {/* Admin bilan bog'lanish */}
        <TouchableOpacity
          style={s.actionRow}
          onPress={() => Linking.openURL('tel:+998884607747')}
        >
          <View style={[s.actionIcon, { backgroundColor: T.grnBg }]}>
            <Feather name="phone-call" size={15} color={T.grn} />
          </View>
          <Text style={[s.actionLbl, { color: T.txt }]}>Admin bilan bog'lanish</Text>
          <Feather name="chevron-right" size={16} color={T.sub} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.logoutBtn, { backgroundColor: T.redBg, borderColor: T.red }]}
        onPress={handleLogout}
      >
        <Feather name="log-out" size={16} color={T.redTxt} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: T.redTxt }}>
          Tizimdan chiqish
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Kurs detail ekrani ───────────────────────────────────────────────────────
  const renderCourseDetail = () => {
    if (!selectedCourse) return null;
    const ac        = accent(selectedCourse.color ?? 'acc', T);
    const doneCount = getCompletedLessonCount(selectedCourse.id);
    const totalLessons = lessons.length || 1;
    const pct = Math.min(Math.round((doneCount / totalLessons) * 100), 100);

    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* Header */}
        <View style={[s.detHeader, { backgroundColor: T.surf, borderBottomColor: T.border }]}>
          <TouchableOpacity
            style={[s.backBtn, { borderColor: T.border, backgroundColor: T.bg }]}
            onPress={() => setSelectedCourse(null)}
          >
            <Feather name="chevron-left" size={16} color={T.sub} />
          </TouchableOpacity>
          <Text style={[s.detTitle, { color: T.txt }]} numberOfLines={1}>
            {selectedCourse.title}
          </Text>
          <TouchableOpacity
            style={s.heartBtn}
            onPress={() => toggleFav(selectedCourse.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={favorites.has(selectedCourse.id) ? 'heart' : 'heart-outline'}
              size={20}
              color={favorites.has(selectedCourse.id) ? T.red : T.sub}
            />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {/* Kurs info card */}
          <View style={[s.courseInfoCard, { backgroundColor: T.surf, borderColor: T.border }]}>
            <View style={s.cicTop}>
              <View style={[s.cicIcon, { backgroundColor: ac.bg }]}>
                <Text style={{ fontSize: 22 }}>{selectedCourse.icon ?? '📚'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cicName, { color: T.txt }]}>{selectedCourse.title}</Text>
                <Text style={[s.cicDesc, { color: T.sub }]} numberOfLines={2}>
                  {selectedCourse.description ?? ''}
                </Text>
              </View>
            </View>
            <View style={s.cicStats}>
              <Badge label={selectedCourse.category ?? 'Asosiy'} col={ac.txt} bg={ac.bg} />
              <Badge label={`${doneCount} yakunlandi`} col={T.grnTxt} bg={T.grnBg} />
              <Badge
                label={`${lessons.filter(x => x.lessonType === 'maruza').length} ma’ruza • ${lessons.filter(x => x.lessonType === 'amaliy').length} amaliy • ${lessons.filter(x => x.lessonType === 'laboratoriya').length} lab`}
                col={T.skyTxt}
                bg={T.skyBg}
              />
            </View>
            {/* Progress bar */}
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: T.sub }}>Umumiy progress</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: ac.col }}>
                  {doneCount}/{totalLessons} • {pct}%
                </Text>
              </View>
              <View style={[s.pbar, { backgroundColor: T.border }]}>
                <View style={[s.pfill, { width: `${pct}%`, backgroundColor: ac.col }]} />
              </View>
            </View>
          </View>

          {/* Sertifikat tugmasi - barcha darslar o'tilganida ko'rinadi */}
          {lessons.length > 0 && doneCount >= lessons.length && (
            <Animated.View entering={ZoomIn.delay(200)}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 10, backgroundColor: T.grnBg, borderRadius: 16,
                  borderWidth: 1.5, borderColor: T.grn, padding: 16, marginBottom: 14,
                }}
                onPress={() => {
                  if (isContentLocked) {
                    Alert.alert('Cheklangan', 'Sertifikat olish uchun Talaba roli kerak.');
                    return;
                  }
                  generateCertificate(selectedCourse);
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 22 }}>🏆</Text>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: T.grnTxt }}>
                    Sertifikat olish
                  </Text>
                  <Text style={{ fontSize: 11, color: T.grn }}>
                    Barcha darslar yakunlandi — PDF yuklab oling
                  </Text>
                </View>
                <Feather name="download" size={18} color={T.grn} />
              </TouchableOpacity>
            </Animated.View>
          )}

          <View style={s.secHd}>
            <Text style={[s.secT, { color: T.txt }]}>Darslar ({lessons.length})</Text>
          </View>

          {lessonsLoading ? (
            <ActivityIndicator color={T.acc} style={{ marginTop: 40 }} />
          ) : lessons.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ color: T.sub }}>Hali darslar yo'q</Text>
            </View>
          ) : (
            lessons.map((l, i) => {
              const bs = getBestScore(selectedCourse.id, l.id);
              const p = getLessonProgress(selectedCourse.id, l.id);
              const isDone = isLessonFullyCompleted(selectedCourse.id, l);
              const unlocked = isLessonUnlocked(selectedCourse.id, i);
              const isActive = !isDone && unlocked;
              return (
                <Animated.View key={l.id} entering={FadeInDown.delay(i * 50)}>
                  <TouchableOpacity
                    style={[
                      s.lessonItem,
                      {
                        backgroundColor: isDone ? T.grnBg : unlocked ? T.surf : T.border,
                        borderColor: isDone ? T.grn : isActive ? T.acc : T.border,
                        opacity: unlocked ? 1 : 0.55,
                      },
                    ]}
                    onPress={() => {
                      if (!unlocked) {
                        Alert.alert('Ketma-ketlik', 'Avval oldingi darsni to‘liq yakunlang: video, nazariya va test bajarilishi kerak.');
                        return;
                      }
                      setSelectedLesson(l);
                      setViewMode('menu');
                    }}
                    activeOpacity={0.85}
                  >
                    {/* Raqam yoki done check */}
                    {isDone ? (
                      <View style={[s.lcheck, { backgroundColor: T.grn }]}>
                        <Feather name="check" size={11} color="#fff" />
                      </View>
                    ) : !unlocked ? (
                      <View style={[s.lnum, { backgroundColor: T.mut }]}>
                        <Feather name="lock" size={11} color="#fff" />
                      </View>
                    ) : (
                      <View style={[s.lnum, { backgroundColor: isActive ? ac.col : T.mut }]}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                          {l.order}
                        </Text>
                      </View>
                    )}

                    <View style={s.linfo}>
                      <Text style={[s.ltit, { color: T.txt }]} numberOfLines={1}>
                        {getLessonDisplayTitle(l, lessons)}
                      </Text>
                      <View style={s.lmeta}>
                        <Badge
                          label={`${getLessonTypedNumber(l, lessons)}-${getLessonTypeShortLabel(l.lessonType)}`}
                          col={l.lessonType === 'amaliy' ? T.grnTxt : l.lessonType === 'laboratoriya' ? T.ambTxt : T.accTxt}
                          bg={l.lessonType === 'amaliy' ? T.grnBg : l.lessonType === 'laboratoriya' ? T.ambBg : T.accBg}
                        />
                        {l.videoDuration && (
                          <Badge label={l.videoDuration} col={T.skyTxt} bg={T.skyBg} />
                        )}
                        {(l.quiz?.length ?? 0) > 0 && (
                          <Badge label={`${l.quiz!.length} savol`} col={T.purTxt} bg={T.purBg} />
                        )}
                        {l.videoUrl && (
                          <Badge label={p?.videoDone ? 'Video ✓' : 'Video'} col={p?.videoDone ? T.grnTxt : T.sub} bg={p?.videoDone ? T.grnBg : T.border} />
                        )}
                        {(l.theoryText || l.theoryFileName) && (
                          <Badge label={p?.theoryDone ? 'Nazariya ✓' : 'Nazariya'} col={p?.theoryDone ? T.grnTxt : T.sub} bg={p?.theoryDone ? T.grnBg : T.border} />
                        )}
                        {(l.quiz?.length ?? 0) > 0 && (
                          <Badge label={(p?.quizDone || (bs ?? 0) >= PASS) ? 'Test ✓' : 'Test'} col={(p?.quizDone || (bs ?? 0) >= PASS) ? T.grnTxt : T.sub} bg={(p?.quizDone || (bs ?? 0) >= PASS) ? T.grnBg : T.border} />
                        )}
                        {bs !== null && (
                          <Badge label={`${bs}%`} col={T.grnTxt} bg={T.grnBg} />
                        )}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={14} color={T.sub} />
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  // ── Dars modal (menu, video, practical, quiz, theory) ────────────────────────
  const renderLessonModal = () => {
    if (!selectedLesson || !selectedCourse) return null;

    if (viewMode === 'menu') {
      const bs      = getBestScore(selectedCourse.id, selectedLesson.id);
      const ac      = accent(selectedCourse.color ?? 'acc', T);
      const related = lessons.filter(x => x.id !== selectedLesson.id).slice(0, 3);

      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: T.bg }}
          contentContainerStyle={{ padding: 14 }}
        >
          {/* Video placeholder */}
          <TouchableOpacity
            style={s.vmPlayer}
            onPress={() => selectedLesson.videoUrl ? setViewMode('video') : null}
            activeOpacity={0.85}
          >
            <View style={s.playCircle}>
              <Feather name="play" size={20} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </TouchableOpacity>

          {/* Meta */}
          <View style={[s.vmMeta, { backgroundColor: T.surf, borderColor: T.border }]}>
            <Text style={[s.vmTitle, { color: T.txt }]}>
              {getLessonDisplayTitle(selectedLesson, lessons)}
            </Text>
            <View style={s.vmTags}>
              {selectedLesson.videoDuration && (
                <Badge label={selectedLesson.videoDuration} col={T.skyTxt} bg={T.skyBg} />
              )}
              {(selectedLesson.quiz?.length ?? 0) > 0 && (
                <Badge label={`${selectedLesson.quiz!.length} savol`} col={T.purTxt} bg={T.purBg} />
              )}
              {selectedLesson.videoUrl && (
                <Badge label={getLessonProgress(selectedCourse.id, selectedLesson.id)?.videoDone ? 'Video ✓' : 'Video kutilmoqda'} col={getLessonProgress(selectedCourse.id, selectedLesson.id)?.videoDone ? T.grnTxt : T.sub} bg={getLessonProgress(selectedCourse.id, selectedLesson.id)?.videoDone ? T.grnBg : T.border} />
              )}
              {(selectedLesson.theoryText || selectedLesson.theoryFileName) && (
                <Badge label={getLessonProgress(selectedCourse.id, selectedLesson.id)?.theoryDone ? 'Nazariya ✓' : 'Nazariya kutilmoqda'} col={getLessonProgress(selectedCourse.id, selectedLesson.id)?.theoryDone ? T.grnTxt : T.sub} bg={getLessonProgress(selectedCourse.id, selectedLesson.id)?.theoryDone ? T.grnBg : T.border} />
              )}
              {bs !== null && (
                <Badge label={`Natija: ${bs}%`} col={T.grnTxt} bg={T.grnBg} />
              )}
            </View>
            <Text style={[s.vmDesc, { color: T.sub }]}>
              {selectedCourse.title} kursining {getLessonTypedNumber(selectedLesson, lessons)}-{getLessonTypeLabel(selectedLesson.lessonType)}.{' '}
              {selectedLesson.theoryText ? selectedLesson.theoryText.slice(0, 100) + '...' : 'Video ko\'rib, so\'ng testni topshiring.'}
            </Text>
            {isContentLocked && (
              <View style={{ marginTop: 12, backgroundColor: T.ambBg, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: T.ambTxt, fontSize: 12, fontWeight: '700' }}>
                  Foydalanuvchi roli: kurslarni ko‘rasiz, ammo video, test va nazariya yopiq.
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={s.vmActions}>
            {selectedLesson.videoUrl ? (
              <TouchableOpacity
                style={[s.vmBtn, { backgroundColor: isContentLocked ? T.border : T.acc, borderColor: isContentLocked ? T.border : T.acc }]}
                onPress={() => {
                  if (isContentLocked) {
                    Alert.alert('Cheklangan', 'Foydalanuvchi roli faqat kurslarni ko‘ra oladi. Video, test va nazariya Talaba roli uchun ochiladi.');
                    return;
                  }
                  setViewMode('video');
                }}
              >
                <Feather name={isContentLocked ? 'lock' : 'play'} size={15} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{isContentLocked ? 'Yopiq' : 'Ko\'rish'}</Text>
              </TouchableOpacity>
            ) : null}

            {selectedLesson.practicalUrl ? (
              <TouchableOpacity
                style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, opacity: isContentLocked ? 0.55 : 1 }]}
                onPress={() => {
                  if (isContentLocked) {
                    Alert.alert('Cheklangan', 'Foydalanuvchi roli uchun amaliy video yopiq.');
                    return;
                  }
                  setViewMode('practical');
                }}
              >
                <Feather name={isContentLocked ? 'lock' : 'play-circle'} size={15} color={T.sub} />
                <Text style={{ color: T.txt, fontSize: 12, fontWeight: '700' }}>Amaliy</Text>
              </TouchableOpacity>
            ) : null}

            {(selectedLesson.quiz?.length ?? 0) > 0 ? (
              <TouchableOpacity
                style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, opacity: isContentLocked ? 0.55 : 1 }]}
                onPress={() => {
                  if (isContentLocked) {
                    Alert.alert('Cheklangan', 'Foydalanuvchi roli uchun test ishlash yopiq.');
                    return;
                  }
                  setViewMode('quiz');
                }}
              >
                <Feather name={isContentLocked ? 'lock' : 'edit-3'} size={15} color={T.sub} />
                <Text style={{ color: T.txt, fontSize: 12, fontWeight: '700' }}>Test</Text>
              </TouchableOpacity>
            ) : null}

            {selectedLesson.theoryText || selectedLesson.theoryFileName ? (
              <TouchableOpacity
                style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, opacity: isContentLocked ? 0.55 : 1 }]}
                onPress={() => {
                  if (isContentLocked) {
                    Alert.alert('Cheklangan', 'Foydalanuvchi roli uchun nazariy qism va fayl yuklab olish yopiq.');
                    return;
                  }
                  setViewMode('theory');
                }}
              >
                <Feather name={isContentLocked ? 'lock' : 'book-open'} size={15} color={T.sub} />
                <Text style={{ color: T.txt, fontSize: 12, fontWeight: '700' }}>Nazariya</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Keyingi darslar */}
          {related.length > 0 && (
            <>
              <Text style={[s.vmRelatedTitle, { color: T.txt }]}>Keyingi darslar</Text>
              {related.map(r => {
                const rbs = getBestScore(selectedCourse.id, r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.relatedItem, { backgroundColor: T.surf, borderColor: T.border }]}
                    onPress={() => { setSelectedLesson(r); setViewMode('menu'); }}
                    activeOpacity={0.85}
                  >
                    <View style={[s.riThumb, { backgroundColor: T.border }]}>
                      <Text style={{ fontSize: 16 }}>{selectedCourse.icon ?? '📚'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.riName, { color: T.txt }]} numberOfLines={1}>{getLessonDisplayTitle(r, lessons)}</Text>
                      <Text style={[s.riMeta, { color: T.sub }]}>
                        {r.videoDuration ?? ''}{r.quiz?.length ? ` • ${r.quiz.length} savol` : ''}
                        {rbs !== null ? ` • ${rbs}%` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={13} color={T.sub} />
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      );
    }

    if (viewMode === 'video') {
      const ytId = extractYouTubeId(selectedLesson.videoUrl);
      return (
        <View style={{ flex: 1, backgroundColor: T.bg, padding: 14 }}>
          {ytId ? (
            <YoutubePlayer
              height={220}
              videoId={ytId}
              onChangeState={(state: string) => {
                if (state === 'ended') {
                  saveLessonProgress(selectedCourse.id, selectedLesson, { videoDone: true });
                }
              }}
            />
          ) : (
            <View style={[s.vmPlayer, { marginBottom: 0 }]}>
              <Text style={{ color: '#fff', fontSize: 14 }}>Video havolasi noto'g'ri</Text>
            </View>
          )}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: T.txt, marginBottom: 8 }}>
              {getLessonDisplayTitle(selectedLesson, lessons)}
            </Text>
            {selectedLesson.videoDuration && (
              <Badge label={`⏱ ${selectedLesson.videoDuration}`} col={T.skyTxt} bg={T.skyBg} />
            )}
          </View>
          <TouchableOpacity
            style={[s.vmBtn, { backgroundColor: T.grnBg, borderColor: T.grn, marginTop: 20, flex: 0 }]}
            onPress={() => saveLessonProgress(selectedCourse.id, selectedLesson, { videoDone: true })}
          >
            <Feather name="check-circle" size={15} color={T.grn} />
            <Text style={{ color: T.grnTxt, fontWeight: '700' }}>Videoni ko‘rdim</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, marginTop: 10, flex: 0 }]}
            onPress={() => setViewMode('menu')}
          >
            <Feather name="arrow-left" size={15} color={T.sub} />
            <Text style={{ color: T.txt, fontWeight: '700' }}>Orqaga</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (viewMode === 'practical') {
      const ytId = extractYouTubeId(selectedLesson.practicalUrl);
      return (
        <View style={{ flex: 1, backgroundColor: T.bg, padding: 14 }}>
          {ytId ? (
            <YoutubePlayer height={220} videoId={ytId} />
          ) : (
            <View style={[s.vmPlayer, { marginBottom: 0 }]}>
              <Text style={{ color: '#fff', fontSize: 14 }}>Amaliy video noto'g'ri</Text>
            </View>
          )}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: T.txt, marginBottom: 8 }}>
              Amaliy mashg'ulot
            </Text>
            {selectedLesson.practicalDuration && (
              <Badge label={`⏱ ${selectedLesson.practicalDuration}`} col={T.grnTxt} bg={T.grnBg} />
            )}
          </View>
          <TouchableOpacity
            style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, marginTop: 20, flex: 0 }]}
            onPress={() => setViewMode('menu')}
          >
            <Feather name="arrow-left" size={15} color={T.sub} />
            <Text style={{ color: T.txt, fontWeight: '700' }}>Orqaga</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (viewMode === 'theory') {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: T.bg }}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        >
          <Text style={{ fontSize: 17, fontWeight: '800', color: T.txt, marginBottom: 16 }}>
            Nazariy qism
          </Text>
          {selectedLesson.theoryText ? (
            <View style={[s.vmMeta, { backgroundColor: T.surf, borderColor: T.border }]}>
              <Text style={{ fontSize: 14, color: T.txt, lineHeight: 22 }}>
                {selectedLesson.theoryText}
              </Text>
            </View>
          ) : null}

          {selectedLesson.theoryFileName ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: T.surf, borderRadius: 14,
              borderWidth: 0.5, borderColor: T.border, padding: 14, marginTop: 12,
            }}>
              <Feather name="file-text" size={20} color={T.pur} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: T.txt, fontWeight: '700', fontSize: 14 }}>
                  {selectedLesson.theoryFileName}
                </Text>
                <Text style={{ color: T.sub, fontSize: 11, marginTop: 2 }}>Nazariy fayl</Text>
              </View>
              {(selectedLesson.theoryFileBase64 || selectedLesson.theoryFileChunked || selectedLesson.theoryFileUri) ? (
                <TouchableOpacity
                  onPress={() => openTheoryFile(selectedLesson)}
                  style={{ backgroundColor: T.purBg, borderRadius: 10, padding: 8 }}
                >
                  <Feather name="download" size={14} color={T.pur} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.vmBtn, { backgroundColor: T.surf, borderColor: T.border, marginTop: 20, flex: 0 }]}
            onPress={() => setViewMode('menu')}
          >
            <Feather name="arrow-left" size={15} color={T.sub} />
            <Text style={{ color: T.txt, fontWeight: '700' }}>Orqaga</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (viewMode === 'quiz') {
      return (
        <QuizModal
          lesson={selectedLesson}
          course={selectedCourse}
          studentId={user!.uid}
          T={T}
          onClose={() => setViewMode('menu')}
          onPassed={() => saveLessonProgress(selectedCourse.id, selectedLesson, { quizDone: true })}
        />
      );
    }

    return null;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.acc} size="large" />
        <Text style={{ color: T.sub, marginTop: 12, fontSize: 14 }}>Yuklanmoqda...</Text>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOT RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: T.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={T.surf}
      />

      {/* ── Kurs detail (selectedCourse bor, selectedLesson yo'q) ── */}
      {selectedCourse && !selectedLesson && renderCourseDetail()}

      {/* ── Asosiy ekran (selectedCourse yo'q) ── */}
      {!selectedCourse && (
        <>
          {/* Topbar */}
          <View style={[s.topbar, { backgroundColor: T.surf, borderBottomColor: T.border }]}>
            <View>
              <Text style={[s.greet, { color: T.sub }]}>Xush kelibsiz,</Text>
              <Text style={[s.uname, { color: T.txt }]}>
                {userFullName}
              </Text>
            </View>
            <View style={s.topbtns}>
              <TouchableOpacity
                style={[s.tbtn, { borderColor: T.border, backgroundColor: T.bg }]}
                onPress={() => setIsDark(!isDark)}
              >
                <Feather name={isDark ? 'sun' : 'moon'} size={16} color={T.sub} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tbtn, { borderColor: T.border, backgroundColor: T.bg }]}
              >
                <Feather name="bell" size={16} color={T.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab content */}
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingBottom: 100 + Math.max(insets.bottom, 12) }}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'home'      && renderHome()}
            {activeTab === 'progress'  && renderProgress()}
            {activeTab === 'favorites' && renderFavorites()}
            {activeTab === 'profile'   && renderProfile()}
          </ScrollView>

          {/* Bottom nav */}
          <View style={[s.nav, { backgroundColor: T.nav, borderTopColor: T.border }]}>
            {([
              { id: 'home',      icon: 'home',     label: 'Bosh'     },
              { id: 'progress',  icon: 'activity',  label: 'Natijalar'},
              { id: 'favorites', icon: 'heart',     label: 'Sevimli'  },
              { id: 'profile',   icon: 'user',      label: 'Profil'   },
            ] as const).map(t => {
              const active = activeTab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={s.ni}
                  onPress={() => setActiveTab(t.id)}
                  activeOpacity={0.8}
                >
                  <Feather name={t.icon as any} size={20} color={active ? T.acc : T.sub} />
                  <Text style={[s.nlbl, { color: active ? T.acc : T.sub, fontWeight: active ? '700' : '400' }]}>
                    {t.label}
                  </Text>
                  {active && <View style={[s.ndot, { backgroundColor: T.acc }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* ── Dars modal ── */}
      <Modal
        visible={!!selectedLesson}
        animationType="slide"
        onRequestClose={() => {
          if (viewMode !== 'menu') { setViewMode('menu'); }
          else { setSelectedLesson(null); }
        }}
      >
        <SafeAreaView style={[s.fill, { backgroundColor: T.bg }]}>
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor={T.surf}
          />
          {/* Modal header */}
          <View style={[s.detHeader, { backgroundColor: T.surf, borderBottomColor: T.border }]}>
            <TouchableOpacity
              style={[s.backBtn, { borderColor: T.border, backgroundColor: T.bg }]}
              onPress={() => {
                if (viewMode !== 'menu') { setViewMode('menu'); }
                else { setSelectedLesson(null); }
              }}
            >
              {viewMode !== 'menu'
                ? <Feather name="arrow-left" size={16} color={T.sub} />
                : <Feather name="x" size={16} color={T.sub} />}
            </TouchableOpacity>
            <Text style={[s.detTitle, { color: T.txt }]} numberOfLines={1}>
              {viewMode === 'menu'      ? selectedLesson ? getLessonDisplayTitle(selectedLesson, lessons) : '' :
               viewMode === 'video'    ? 'Video darslik' :
               viewMode === 'practical'? 'Amaliy mashg\'ulot' :
               viewMode === 'theory'   ? 'Nazariy qism' :
               'Test'}
            </Text>
          </View>
          {renderLessonModal()}
        </SafeAreaView>
      </Modal>

      {/* ── Parol yangilash modali ── */}
      <Modal visible={passModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}
        >
          <View style={{ backgroundColor: T.card, borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.txt, marginBottom: 16 }}>
              Parolni yangilash
            </Text>
            <TextInput
              placeholder="Eski parol"
              placeholderTextColor={T.mut}
              style={{
                borderWidth: 0.5, borderColor: T.border, padding: 12,
                borderRadius: 12, color: T.txt, marginBottom: 12,
                backgroundColor: T.bg,
              }}
              secureTextEntry
              value={oldPass}
              onChangeText={setOldPass}
            />
            <TextInput
              placeholder="Yangi parol (kamida 6 belgi)"
              placeholderTextColor={T.mut}
              style={{
                borderWidth: 0.5, borderColor: T.border, padding: 12,
                borderRadius: 12, color: T.txt, marginBottom: 20,
                backgroundColor: T.bg,
              }}
              secureTextEntry
              value={newPass}
              onChangeText={setNewPass}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1, padding: 14, borderRadius: 12,
                  borderWidth: 0.5, borderColor: T.border, backgroundColor: T.bg,
                }}
                onPress={() => { setPassModal(false); setOldPass(''); setNewPass(''); }}
              >
                <Text style={{ color: T.sub, textAlign: 'center', fontWeight: '700' }}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: T.acc }}
                onPress={handlePassUpdate}
              >
                {passLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Saqlash</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES — HTML dizayniga to'liq mos
// ═══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  fill: { flex: 1 },

  topbar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5 },
  greet:   { fontSize: 11, marginBottom: 1 },
  uname:   { fontSize: 18, fontWeight: '700', lineHeight: 22 },
  topbtns: { flexDirection: 'row', gap: 8 },
  tbtn:    { width: 36, height: 36, borderRadius: 12, borderWidth: 0.5, justifyContent: 'center', alignItems: 'center' },

  hero:    { borderRadius: 20, borderWidth: 0.5, padding: 15, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  ring:    { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  ringC:   { position: 'absolute', alignItems: 'center' },
  rp:      { fontSize: 13, fontWeight: '700' },
  rl:      { fontSize: 8 },
  ht:      { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  hs:      { fontSize: 11, marginBottom: 7 },
  bars:    { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  bar:     { flex: 1, borderRadius: 2 },
  hstats:  { flexDirection: 'row', paddingTop: 10, borderTopWidth: 0.5 },
  hst:     { flex: 1, alignItems: 'center' },
  hsv:     { fontSize: 16, fontWeight: '700' },
  hsl:     { fontSize: 9, marginTop: 1 },
  hsp:     { width: 0.5, marginVertical: 3 },

  secHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9, marginTop: 4 },
  secT:  { fontSize: 13, fontWeight: '700' },
  secA:  { fontSize: 11 },

  topCard:   { width: 150, borderRadius: 16, borderWidth: 0.5, padding: 12, marginRight: 8 },
  rankBadge: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  topIcon:   { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  topName:   { fontSize: 12, fontWeight: '700', lineHeight: 16, marginBottom: 4 },
  topViews:  { fontSize: 10, marginBottom: 6 },
  topBar:    { height: 3, borderRadius: 2, overflow: 'hidden' },
  topFill:   { height: '100%', borderRadius: 2 },

  cc:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 0.5, padding: 12, marginBottom: 8 },
  ccIc:    { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  ccInfo:  { flex: 1, minWidth: 0, marginHorizontal: 10 },
  ccN:     { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  ccMeta:  { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  ccRight: { alignItems: 'flex-end', gap: 4 },
  ccPct:   { fontSize: 12, fontWeight: '700' },
  heartBtn:{ padding: 4 },
  pbar:    { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 7 },
  pfill:   { height: '100%', borderRadius: 2 },

  courseCardNew:     {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  courseCover:       { height: 154, justifyContent: 'space-between' },
  courseCoverImg:    { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  courseCoverShade:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8, 15, 35, 0.33)' },
  courseCoverTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, zIndex: 2 },
  courseChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  courseChipText:    { fontSize: 11, fontWeight: '700' },
  courseHeart:       { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  courseCoverBottom: { paddingHorizontal: 14, paddingBottom: 14, zIndex: 2 },
  courseTitleNew:    { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 6 },
  courseDescNew:     { fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.95)' },
  courseBodyNew:     { padding: 14 },
  courseStatRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  courseMiniStat:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  courseMiniText:    { fontSize: 11, fontWeight: '700' },
  courseProgressHead:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  courseProgressLabel:{ fontSize: 11, fontWeight: '600' },
  courseProgressValue:{ fontSize: 14, fontWeight: '800' },
  courseProgressTrack:{ height: 8, borderRadius: 999, overflow: 'hidden' },
  courseProgressFill: { height: '100%', borderRadius: 999 },
  courseBottomRow:   { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseActionHint:  { fontSize: 11, fontWeight: '600' },
  courseOpenBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  courseOpenBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  statGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard:  { width: (width - 36) / 2, borderRadius: 16, borderWidth: 0.5, padding: 14, alignItems: 'center' },
  statVal:   { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  statLbl:   { fontSize: 10, textAlign: 'center' },
  resultItem:{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 8, gap: 12 },
  riScore:   { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  profileCard: { borderRadius: 20, borderWidth: 0.5, padding: 20, alignItems: 'center', marginBottom: 12 },
  av:          { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  pname:       { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  pemail:      { fontSize: 11, marginBottom: 10 },
  rolePill:    { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },

  actionGroup: { borderRadius: 18, borderWidth: 0.5, overflow: 'hidden', marginBottom: 10 },
  actionRow:   { flexDirection: 'row', alignItems: 'center', padding: 13, paddingHorizontal: 16, gap: 12 },
  actionIcon:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionLbl:   { flex: 1, fontSize: 13, fontWeight: '600' },
  actionDiv:   { height: 0.5, marginLeft: 60 },
  tog:         { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  tok:         { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute' },
  logoutBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 16, borderWidth: 0.5, marginBottom: 20 },

  detHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 0.5 },
  backBtn:   { width: 34, height: 34, borderRadius: 11, borderWidth: 0.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  detTitle:  { flex: 1, fontSize: 15, fontWeight: '700' },

  courseInfoCard: { borderRadius: 18, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  cicTop:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cicIcon:        { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cicName:        { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cicDesc:        { fontSize: 11, lineHeight: 16 },
  cicStats:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },

  lessonItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 15, borderWidth: 0.5, padding: 11, paddingHorizontal: 13, marginBottom: 8, gap: 10 },
  lnum:       { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  lcheck:     { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  linfo:      { flex: 1, minWidth: 0 },
  ltit:       { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  lmeta:      { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },

  lessonCardNew:      {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    marginBottom: 13,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lessonCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  lessonCardLeft:     { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  lessonStatusBubble: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  lessonStatusNumber: { color: '#fff', fontSize: 14, fontWeight: '800' },
  lessonTitleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  lessonTitleNew:     { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  lessonEmoji:        { fontSize: 18 },
  lessonBadgesRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  lessonRightPanel:   { alignItems: 'flex-end', gap: 8 },
  lessonStatePill:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  lessonStateText:    { fontSize: 9, fontWeight: '800' },
  lessonArrowWrap:    { width: 30, height: 30, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  lessonProgressBlock:{ marginTop: 14, gap: 10 },
  lessonStepRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  lessonStepPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  lessonStepText:     { fontSize: 11, fontWeight: '700' },
  lessonSummaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lessonMiniProgress: { flex: 1, height: 7, borderRadius: 999, overflow: 'hidden' },
  lessonMiniProgressFill:{ height: '100%', borderRadius: 999 },
  lessonMiniProgressText:{ fontSize: 11, fontWeight: '700' },

  vmPlayer:      { backgroundColor: '#000', borderRadius: 16, marginBottom: 14, aspectRatio: 16/9, justifyContent: 'center', alignItems: 'center' },
  playCircle:    { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  vmMeta:        { borderRadius: 16, borderWidth: 0.5, padding: 14, marginBottom: 12 },
  vmTitle:       { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  vmTags:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  vmDesc:        { fontSize: 12, lineHeight: 19 },
  vmActions:     { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  vmBtn:         { flex: 1, minWidth: 80, padding: 11, borderRadius: 14, borderWidth: 0.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  vmRelatedTitle:{ fontSize: 13, fontWeight: '700', marginBottom: 8 },
  relatedItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, borderWidth: 0.5, padding: 10, marginBottom: 7 },
  riThumb:       { width: 54, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  riName:        { fontSize: 12, fontWeight: '600' },
  riMeta:        { fontSize: 10, marginTop: 2 },

  nav:  { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: 0.5 },
  ni:   { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 12 },
  nlbl: { fontSize: 10, marginTop: 3 },
  ndot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});