import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, SlideInRight, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from './firebaseConfig';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

interface PickedFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

interface Lesson {
  id: string;
  title: string;
  description: string;
  lessonType: 'maruza' | 'amaliy' | 'laboratoriya';
  videoUrl: string;
  videoDuration?: string;
  theoryText?: string;
  theoryFileName?: string;
  theoryFileUri?: string;
  theoryFileBase64?: string;
  theoryFileMimeType?: string;
  theoryFileSize?: number;
  theoryFileChunked?: boolean;
  theoryFileChunkCount?: number;
  order: number;
  quiz: QuizQuestion[];
  createdAt: any;
}

interface Course {
  id: string;
  title: string;
  description?: string;
  category?: string;
  createdAt: any;
}

type UserRole = 'super-admin' | 'admin' | 'student' | 'user';

interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
  fullName?: string;
  name?: string;
}

interface Result {
  id: string;
  studentId: string;
  courseTitle: string;
  lessonTitle?: string;
  score: number;
  completedAt: string;
  attempts?: number;
}

interface CertificateSettings {
  platformName: string;
  certificateType: string;
  mainTitle: string;
  introText: string;
  completionText: string;
  directorName: string;
  signatureName: string;
  organizationName: string;
  sealText: string;
  updatedAt?: any;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = {
  bg: '#060B14',
  surface: '#0D1421',
  card: '#111827',
  card2: '#1A2332',
  border: '#1E2D40',
  border2: '#253347',
  text: '#E8F0FE',
  sub: '#6B8CAE',
  muted: '#3A4F6A',
  indigo: '#5B73FF',
  cyan: '#06C8D4',
  emerald: '#00D68F',
  amber: '#FFB938',
  rose: '#FF4B7A',
  purple: '#A855F7',
  sky: '#38BDF8',
  white: '#FFFFFF',
};

// Firestore document limiti 1MB atrofida. Base64 hajmni kattalashtiradi,
// shuning uchun fayl base64 bo‘laklarga ajratilib saqlanadi.
const MAX_FIRESTORE_FILE_BYTES = 1024 * 1024;
const FIRESTORE_BASE64_CHUNK_SIZE = 450 * 1024;

// Expo SDK 54+ da readAsStringAsync legacy API hisoblanadi, shuning uchun expo-file-system/legacy ishlatiladi.
// Expo versiyalarida EncodingType.Base64 ba'zan undefined bo'ladi.
// Shu sabab fallback sifatida oddiy 'base64' ishlatiladi.
const BASE64_ENCODING =
  (FileSystem as any).EncodingType?.Base64 ??
  (FileSystem as any).EncodingType?.BASE64 ??
  'base64';

const EMPTY_QUIZ: QuizQuestion = {
  question: '',
  options: ['', '', '', ''],
  correct: 0,
};


const COMMON_WRONG_OPTIONS = [
  "Ma'lumotlar bazasini o'chirish uchun",
  "Faqat rasm chizish uchun",
  "Internet tezligini oshirish uchun",
  "Kompyuterni o'chirish uchun",
  "Faqat o'yin o'ynash uchun",
  "Printer sozlash uchun",
  "Parolni tiklash uchun",
  "Fayl nomini o'zgartirish uchun",
  "Faqat matnni ranglash uchun",
  "Telefon xotirasini tozalash uchun",
];

const cleanTextForQuiz = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();

const splitTextIntoSentences = (text: string) => {
  const cleaned = cleanTextForQuiz(text);

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 35 && s.split(' ').length >= 6)
    .slice(0, 30);
};

const makeQuestionFromSentence = (sentence: string, index: number) => {
  const s = sentence.replace(/[.!?]+$/g, '').trim();

  const patterns: Array<{
    re: RegExp;
    build: (m: RegExpMatchArray) => QuizQuestion | null;
  }> = [
    {
      re: /^(.+?)\s+(?:bu|—|-|:)\s+(.+)$/i,
      build: m => {
        const subject = m[1]?.trim();
        const answer = m[2]?.trim();
        if (!subject || !answer || answer.length < 8) return null;

        return {
          question: `${subject} nima?`,
          options: [answer, ...COMMON_WRONG_OPTIONS.slice(index, index + 3)],
          correct: 0,
        };
      },
    },
    {
      re: /^(.+?)\s+(?:uchun|maqsadida)\s+(.+)$/i,
      build: m => {
        const before = m[1]?.trim();
        const after = m[2]?.trim();
        if (!before || !after || after.length < 8) return null;

        return {
          question: `${before} nima uchun ishlatiladi?`,
          options: [after, ...COMMON_WRONG_OPTIONS.slice(index + 1, index + 4)],
          correct: 0,
        };
      },
    },
    {
      re: /^(.+?)\s+(?:deb ataladi|deyiladi)$/i,
      build: m => {
        const answer = m[1]?.trim();
        if (!answer || answer.length < 8) return null;

        return {
          question: `Qaysi ta'rif to'g'ri?`,
          options: [answer, ...COMMON_WRONG_OPTIONS.slice(index + 2, index + 5)],
          correct: 0,
        };
      },
    },
  ];

  for (const pattern of patterns) {
    const match = s.match(pattern.re);
    if (match) {
      const built = pattern.build(match);
      if (built) return built;
    }
  }

  const words = s.split(' ').filter(Boolean);
  const answer = words.slice(Math.max(0, words.length - 7)).join(' ');

  return {
    question: `${index + 1}-savol. Quyidagi fikr nimaga tegishli? "${words.slice(0, Math.min(8, words.length)).join(' ')}..."`,
    options: [
      answer || s,
      COMMON_WRONG_OPTIONS[(index + 0) % COMMON_WRONG_OPTIONS.length],
      COMMON_WRONG_OPTIONS[(index + 3) % COMMON_WRONG_OPTIONS.length],
      COMMON_WRONG_OPTIONS[(index + 6) % COMMON_WRONG_OPTIONS.length],
    ],
    correct: 0,
  };
};

const generateQuizFromText = (text: string, count = 10): QuizQuestion[] => {
  const sentences = splitTextIntoSentences(text);
  const uniqueQuestions: QuizQuestion[] = [];

  sentences.forEach((sentence, index) => {
    if (uniqueQuestions.length >= count) return;

    const q = makeQuestionFromSentence(sentence, index);
    const questionExists = uniqueQuestions.some(item => item.question === q.question);

    if (!questionExists) {
      const options = q.options
        .map(opt => cleanTextForQuiz(opt))
        .filter(Boolean)
        .slice(0, 4);

      while (options.length < 4) {
        const wrong = COMMON_WRONG_OPTIONS[(index + options.length) % COMMON_WRONG_OPTIONS.length];
        if (!options.includes(wrong)) options.push(wrong);
        else options.push(`Noto'g'ri javob ${options.length}`);
      }

      uniqueQuestions.push({
        question: cleanTextForQuiz(q.question),
        options,
        correct: 0,
      });
    }
  });

  return uniqueQuestions.slice(0, count);
};

const ROLE_LABELS: Record<UserRole, string> = {
  'super-admin': 'Super Admin',
  admin: 'Admin',
  student: 'Talaba',
  user: 'Foydalanuvchi',
};

const ROLE_COLORS: Record<UserRole, string> = {
  'super-admin': P.purple,
  admin: P.amber,
  student: P.emerald,
  user: P.rose,
};

const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  platformName: 'Shodiyev M',
  certificateType: 'KURS SERTIFIKATI',
  mainTitle: 'Sertifikat',
  introText: 'Ushbu sertifikat shuni tasdiqlaydiki',
  completionText: 'kursini muvaffaqiyatli tugatdi',
  directorName: 'Shodiyeva Muborak',
  signatureName: 'M. Shodiyeva',
  organizationName: "Shodiyev M ta'lim platformasi direktori",
  sealText: 'SHODIYEV M',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

const normalizeRole = (role?: string): UserRole => {
  if (role === 'super-admin' || role === 'admin' || role === 'student' || role === 'user') {
    return role;
  }
  return 'user';
};

const getUserName = (u: AppUser) =>
  u.fullName || u.displayName || u.name || u.email || "Noma'lum";


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



const Pill = ({ label, color, small }: { label: string; color: string; small?: boolean }) => (
  <View
    style={{
      paddingHorizontal: small ? 7 : 10,
      paddingVertical: small ? 2 : 4,
      borderRadius: 8,
      backgroundColor: color + '22',
      alignSelf: 'flex-start',
    }}
  >
    <Text
      style={{
        fontSize: small ? 9 : 11,
        fontWeight: '800',
        color,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </Text>
  </View>
);

const MiniBarChart = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data, 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 44 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: color + '22',
            borderRadius: 4,
            overflow: 'hidden',
            height: '100%',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              height: `${(v / max) * 100}%`,
              backgroundColor: color,
              borderRadius: 4,
            }}
          />
        </View>
      ))}
    </View>
  );
};

const Divider = () => <View style={{ height: 1, backgroundColor: P.border, marginVertical: 4 }} />;

// ─── QuizBuilder ──────────────────────────────────────────────────────────────

const QuizBuilder = ({
  quiz,
  onChange,
}: {
  quiz: QuizQuestion[];
  onChange: (q: QuizQuestion[]) => void;
}) => {
  const update = (qIdx: number, field: string, value: any, oIdx?: number) => {
    const q = quiz.map(item => ({ ...item, options: [...item.options] }));

    if (field === 'question') q[qIdx].question = value;
    if (field === 'correct') q[qIdx].correct = value;
    if (field === 'option' && oIdx !== undefined) q[qIdx].options[oIdx] = value;

    onChange(q);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Feather name="help-circle" size={15} color={P.amber} />
        <Text style={{ fontSize: 11, fontWeight: '800', color: P.amber, letterSpacing: 1 }}>
          TEST SAVOLLAR ({quiz.length})
        </Text>
      </View>

      {quiz.map((q, qIdx) => (
        <View key={qIdx} style={qb.card}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <View style={qb.badge}>
              <Text style={{ color: P.amber, fontSize: 11, fontWeight: '800' }}>
                Savol {qIdx + 1}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => onChange(quiz.filter((_, i) => i !== qIdx))}
              style={qb.trash}
            >
              <Feather name="trash-2" size={14} color={P.rose} />
            </TouchableOpacity>
          </View>

          <TextInput
            placeholder="Savol matni..."
            style={qb.input}
            placeholderTextColor={P.muted}
            value={q.question}
            onChangeText={v => update(qIdx, 'question', v)}
            multiline
          />

          {q.options.map((opt, oIdx) => (
            <TouchableOpacity
              key={oIdx}
              style={[
                qb.optRow,
                {
                  borderColor: q.correct === oIdx ? P.emerald : P.border2,
                  backgroundColor: q.correct === oIdx ? P.emerald + '11' : 'transparent',
                },
              ]}
              onPress={() => update(qIdx, 'correct', oIdx)}
            >
              <View style={[qb.radio, { borderColor: q.correct === oIdx ? P.emerald : P.muted }]}>
                {q.correct === oIdx && <View style={[qb.radioDot, { backgroundColor: P.emerald }]} />}
              </View>

              <TextInput
                placeholder={`Variant ${String.fromCharCode(65 + oIdx)}`}
                style={[qb.optInput, { color: q.correct === oIdx ? P.emerald : P.text }]}
                placeholderTextColor={P.muted}
                value={opt}
                onChangeText={v => update(qIdx, 'option', v, oIdx)}
              />

              {q.correct === oIdx && <Feather name="check" size={14} color={P.emerald} />}
            </TouchableOpacity>
          ))}

          <Text style={{ fontSize: 10, color: P.muted, marginTop: 4 }}>
            Variant yoniga bosib to'g'ri javobni belgilang
          </Text>
        </View>
      ))}

      <TouchableOpacity
        style={qb.addBtn}
        onPress={() => onChange([...quiz, { ...EMPTY_QUIZ, options: ['', '', '', ''] }])}
      >
        <Feather name="plus-circle" size={16} color={P.amber} />
        <Text style={{ color: P.amber, fontWeight: '700', marginLeft: 8, fontSize: 13 }}>
          Savol qo'shish
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const qb = StyleSheet.create({
  card: {
    backgroundColor: P.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  badge: {
    backgroundColor: P.amber + '22',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  trash: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: P.rose + '18',
  },
  input: {
    backgroundColor: P.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border2,
    padding: 12,
    color: P.text,
    fontSize: 14,
    marginBottom: 10,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.amber + '44',
    borderRadius: 14,
    padding: 14,
    borderStyle: 'dashed',
  },
});

// ─── LessonForm ───────────────────────────────────────────────────────────────

interface LessonFormData {
  title: string;
  description: string;
  lessonType: 'maruza' | 'amaliy' | 'laboratoriya';
  videoUrl: string;
  videoDuration: string;
  theoryText: string;
  theoryFile: PickedFile | null;
  quiz: QuizQuestion[];
}

const FilePicker = ({
  file,
  onPick,
  onRemove,
}: {
  file: PickedFile | null;
  onPick: () => void;
  onRemove: () => void;
}) => {
  if (file) {
    const sizeKb = file.size ? Math.round(file.size / 1024) : null;
    const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';

    const extColor: Record<string, string> = {
      DOCX: P.indigo,
      DOC: P.indigo,
      PDF: P.rose,
      PPTX: P.amber,
      PPT: P.amber,
      TXT: P.sub,
    };

    const color = extColor[ext] ?? P.sub;

    return (
      <View style={fp.selectedBox}>
        <View style={[fp.extBadge, { backgroundColor: color + '22' }]}>
          <Text style={[fp.extTxt, { color }]}>{ext}</Text>
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={fp.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          {sizeKb ? <Text style={fp.fileMeta}>{sizeKb} KB</Text> : null}
        </View>

        <TouchableOpacity onPress={onRemove} style={fp.removeBtn}>
          <Feather name="x" size={14} color={P.rose} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={fp.pickBtn} onPress={onPick} activeOpacity={0.8}>
      <View style={fp.pickIcon}>
        <Feather name="upload" size={20} color={P.purple} />
      </View>

      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={fp.pickTitle}>Fayl yuklash</Text>
        <Text style={fp.pickSub}>PDF, Word, PPTX yoki TXT — 1MB gacha</Text>
      </View>

      <Feather name="chevron-right" size={16} color={P.sub} />
    </TouchableOpacity>
  );
};

const fp = StyleSheet.create({
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.purple + '10',
    borderWidth: 1,
    borderColor: P.purple + '33',
    borderRadius: 16,
    padding: 16,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  pickIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: P.purple + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickTitle: {
    color: P.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 3,
  },
  pickSub: {
    color: P.sub,
    fontSize: 11,
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.border2,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  extBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  extTxt: {
    fontSize: 11,
    fontWeight: '900',
  },
  fileName: {
    color: P.text,
    fontWeight: '700',
    fontSize: 13,
  },
  fileMeta: {
    color: P.sub,
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: P.rose + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
});


const StableInputField = React.memo((props: any) => (
  <TextInput {...props} style={[mf.field, props.style]} placeholderTextColor={P.muted} />
));

const LessonForm = ({
  initial,
  onSave,
  onCancel,
  saving,
  title,
  uploadProgress = 0,
}: {
  initial: {
    title?: string;
    description?: string;
    lessonType?: 'maruza' | 'amaliy' | 'laboratoriya';
    videoUrl?: string;
    videoDuration?: string;
    theoryText?: string;
    theoryFileName?: string;
    theoryFileUri?: string;
    order?: number;
    quiz: QuizQuestion[];
  };
  onSave: (d: LessonFormData) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  uploadProgress?: number;
}) => {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<LessonFormData>({
    title: initial.title ?? '',
    description: initial.description ?? '',
    lessonType: initial.lessonType ?? 'maruza',
    videoUrl: initial.videoUrl ?? '',
    videoDuration: initial.videoDuration ?? '',
    theoryText: initial.theoryText ?? '',
    theoryFile: initial.theoryFileName
      ? { name: initial.theoryFileName, uri: initial.theoryFileUri ?? '' }
      : null,
    quiz: initial.quiz ?? [],
  });

  const [quizSourceText, setQuizSourceText] = useState('');
  const f = (k: keyof LessonFormData) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/pdf',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];

        setForm(p => ({
          ...p,
          theoryFile: {
            name: asset.name,
            uri: asset.uri,
            size: asset.size,
            mimeType: asset.mimeType,
          },
        }));
      }
    } catch {
      Alert.alert('Xato', "Faylni tanlashda xatolik yuz berdi");
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert('Xato', 'Dars nomini kiriting!');
      return;
    }

    onSave(form);
  };

  const handleGenerateQuiz = () => {
    const source = quizSourceText.trim() || form.theoryText.trim() || form.description.trim();

    if (!source || source.length < 120) {
      Alert.alert(
        'Matn yetarli emas',
        'Kamida 120 ta belgidan iborat nazariy matn kiriting yoki "Qo‘shimcha matn" maydonini to‘ldiring.',
      );
      return;
    }

    const generated = generateQuizFromText(source, 10);

    if (generated.length === 0) {
      Alert.alert('Xato', 'Bu matndan test tuzib bo‘lmadi. Iltimos, uzunroq va tushunarliroq matn kiriting.');
      return;
    }

    setForm(prev => ({
      ...prev,
      quiz: generated,
    }));

    Alert.alert('✅ Tayyor', `${generated.length} ta test avtomatik yaratildi. Xohlasangiz pastda tahrirlashingiz mumkin.`);
  };

  const SectionLabel = ({ icon, label, color }: { icon: string; label: string; color: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: color + '18',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '800', color, letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );

  const Lbl = ({ text }: { text: string }) => (
    <Text style={{ fontSize: 12, fontWeight: '700', color: P.sub, marginBottom: 6, marginTop: 4 }}>
      {text}
    </Text>
  );


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: P.bg }}>
      <View style={[mf.hdr, { borderBottomColor: P.border }]}>
        <TouchableOpacity onPress={onCancel} style={mf.backBtn} disabled={saving}>
          <Feather name="x" size={20} color={P.sub} />
        </TouchableOpacity>

        <Text style={mf.hdrTitle}>{title}</Text>

        <TouchableOpacity
          style={[mf.saveBtn, { opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color={P.white} /> : <Text style={mf.saveTxt}>Saqlash</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 112 }}
        keyboardShouldPersistTaps="handled"
      >
        {saving && (
          <View style={lf.uploadBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ActivityIndicator size="small" color={P.indigo} />
              <Text style={{ color: P.text, fontWeight: '700', marginLeft: 10 }}>
                Saqlanmoqda...
              </Text>
              <Text style={{ color: P.indigo, fontWeight: '900', marginLeft: 'auto' }}>
                {uploadProgress}%
              </Text>
            </View>

            <View style={lf.progressBg}>
              <View style={[lf.progressFill, { width: `${uploadProgress}%` }]} />
            </View>

            <Text style={{ color: P.sub, fontSize: 11, marginTop: 8 }}>
              Fayl Firestore bo‘laklariga saqlanmoqda. Maksimal fayl hajmi: 1MB.
            </Text>
          </View>
        )}

        <View style={mf.section}>
          <SectionLabel icon="file-text" label="ASOSIY MA'LUMOTLAR" color={P.indigo} />

          <Lbl text="Dars nomi *" />
          <StableInputField
            value={form.title}
            onChangeText={f('title')}
            placeholder="Masalan: 1-dars — O'zgaruvchilar"
            editable={!saving}
          />

          <Lbl text="Dars tavsifi" />
          <StableInputField
            value={form.description}
            onChangeText={f('description')}
            placeholder="Dars haqida qisqacha ma'lumot..."
            multiline
            style={{ height: 70, textAlignVertical: 'top' }}
            editable={!saving}
          />

          <Lbl text="Dars turi *" />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['maruza', 'amaliy', 'laboratoriya'] as const).map(type => {
              const isSelected = form.lessonType === type;

              const labels: Record<string, string> = {
                maruza: 'Maruza',
                amaliy: 'Amaliy',
                laboratoriya: 'Laboratoriya',
              };

              const colors: Record<string, string> = {
                maruza: P.indigo,
                amaliy: P.emerald,
                laboratoriya: P.amber,
              };

              const color = colors[type];

              return (
                <TouchableOpacity
                  key={type}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isSelected ? color : P.border2,
                    backgroundColor: isSelected ? color + '15' : P.surface,
                    alignItems: 'center',
                    opacity: saving ? 0.5 : 1,
                  }}
                  onPress={() => !saving && setForm(p => ({ ...p, lessonType: type }))}
                  disabled={saving}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isSelected ? color : P.sub }}>
                    {labels[type]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={mf.section}>
          <SectionLabel icon="video" label="VIDEO DARSLIK" color={P.sky} />

          <Lbl text="YouTube havolasi" />
          <StableInputField
            value={form.videoUrl}
            onChangeText={f('videoUrl')}
            placeholder="https://youtube.com/watch?v=..."
            autoCapitalize="none"
            keyboardType="url"
            editable={!saving}
          />

          <Lbl text="Davomiyligi" />
          <StableInputField
            value={form.videoDuration}
            onChangeText={f('videoDuration')}
            placeholder="12:34"
            style={{ marginBottom: 0 }}
            editable={!saving}
          />

          {!!form.videoUrl && (
            <View style={[lf.urlPreview, { borderColor: P.sky + '33' }]}>
              <Feather name="link" size={12} color={P.sky} />
              <Text style={{ flex: 1, color: P.sky, fontSize: 11, marginLeft: 6 }} numberOfLines={1}>
                {form.videoUrl}
              </Text>
              <View
                style={{
                  backgroundColor: P.sky + '22',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 5,
                }}
              >
                <Text style={{ color: P.sky, fontSize: 10, fontWeight: '800' }}>YouTube ✓</Text>
              </View>
            </View>
          )}
        </View>

        <View style={mf.section}>
          <SectionLabel icon="book-open" label="NAZARIY QISM" color={P.purple} />

          <Lbl text="Qo'shimcha matn" />
          <StableInputField
            value={form.theoryText}
            onChangeText={f('theoryText')}
            placeholder="Nazariy ma'lumot, izoh..."
            multiline
            style={{ height: 90, textAlignVertical: 'top' }}
            editable={!saving}
          />

          <Lbl text="Nazariy fayl" />
          <FilePicker
            file={form.theoryFile}
            onPick={pickFile}
            onRemove={() => !saving && setForm(p => ({ ...p, theoryFile: null }))}
          />

          <View style={lf.infoBox}>
            <Feather name="info" size={12} color={P.purple} />
            <Text style={[lf.infoTxt, { color: P.sub }]}>
              PDF, Word, PPTX yoki TXT fayl 1MB gacha Firestore bo‘laklariga saqlanadi.
            </Text>
          </View>
        </View>

        <View style={mf.section}>
          <SectionLabel icon="zap" label="MATNDAN AVTOMATIK TEST YARATISH" color={P.cyan} />

          <Lbl text="Matn kiriting yoki nazariy qism matnidan foydalaning" />
          <TextInput
            value={quizSourceText}
            onChangeText={setQuizSourceText}
            placeholder="Masalan: React Native mobil ilovalar yaratish uchun ishlatiladi. Komponentlar UI qismlarini yaratadi..."
            placeholderTextColor={P.muted}
            multiline
            style={[mf.field, { height: 120, textAlignVertical: 'top' }]}
            editable={!saving}
          />

          <View style={lf.infoBox}>
            <Feather name="info" size={12} color={P.cyan} />
            <Text style={[lf.infoTxt, { color: P.sub }]}>
              Bu oddiy generator: matndagi gaplardan 10 ta savol tuzadi. To‘g‘ri javob har doim A variantga joylanadi, keyin qo‘lda tahrirlashingiz mumkin.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[lf.generateQuizBtn, { opacity: saving ? 0.55 : 1 }]}
              onPress={handleGenerateQuiz}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Feather name="zap" size={16} color={P.white} />
              <Text style={lf.generateQuizTxt}>10 ta test yaratish</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[lf.generateQuizGhost, { opacity: saving ? 0.55 : 1 }]}
              onPress={() => setQuizSourceText(form.theoryText || form.description)}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Feather name="copy" size={15} color={P.cyan} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={mf.section}>
          <QuizBuilder quiz={form.quiz} onChange={q => !saving && setForm(p => ({ ...p, quiz: q }))} />

          {form.quiz.length === 0 && (
            <View style={lf.infoBox}>
              <Feather name="info" size={12} color={P.amber} />
              <Text style={[lf.infoTxt, { color: P.amber + 'BB' }]}>
                Savollar ixtiyoriy. Test kerak bo'lsa yuqoridagi tugmani bosing.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const lf = StyleSheet.create({
  uploadBox: {
    backgroundColor: P.indigo + '15',
    borderWidth: 1,
    borderColor: P.indigo + '44',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  progressBg: {
    height: 7,
    backgroundColor: P.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: P.indigo,
    borderRadius: 10,
  },
  urlPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: P.surface,
    borderWidth: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: P.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: P.border,
  },
  infoTxt: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  generateQuizBtn: {
    flex: 1,
    backgroundColor: P.cyan,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  generateQuizTxt: {
    color: P.white,
    fontWeight: '800',
    fontSize: 13,
  },
  generateQuizGhost: {
    width: 48,
    borderRadius: 14,
    backgroundColor: P.cyan + '18',
    borderWidth: 1,
    borderColor: P.cyan + '44',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ─── CourseForm ───────────────────────────────────────────────────────────────

interface CourseFormData {
  title: string;
  description: string;
  category: string;
}

const CATS = ['Frontend', 'Backend', 'Mobile', 'Dizayn', 'Data Science', 'DevOps', 'Boshqa'];

const CourseForm = ({
  initial,
  onSave,
  onCancel,
  saving,
  title,
}: {
  initial: Partial<Course>;
  onSave: (d: CourseFormData) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) => {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CourseFormData>({
    title: initial.title ?? '',
    description: initial.description ?? '',
    category: initial.category ?? '',
  });

  const f = (k: keyof CourseFormData) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: P.bg }}>
      <View style={[mf.hdr, { borderBottomColor: P.border }]}>
        <TouchableOpacity onPress={onCancel} style={mf.backBtn} disabled={saving}>
          <Feather name="x" size={20} color={P.sub} />
        </TouchableOpacity>

        <Text style={mf.hdrTitle}>{title}</Text>

        <TouchableOpacity
          style={[mf.saveBtn, { opacity: saving ? 0.6 : 1 }]}
          onPress={() => onSave(form)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color={P.white} /> : <Text style={mf.saveTxt}>Saqlash</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 92 }}>
        <View style={mf.section}>
          <Text style={mf.sectionLbl}>KURS MA'LUMOTLARI</Text>

          <Text style={mf.lbl}>Kurs nomi *</Text>
          <TextInput
            style={mf.field}
            value={form.title}
            onChangeText={f('title')}
            placeholder="Masalan: React Native asoslari"
            placeholderTextColor={P.muted}
            editable={!saving}
          />

          <Text style={mf.lbl}>Tavsif</Text>
          <TextInput
            style={[mf.field, { height: 90, textAlignVertical: 'top' }]}
            value={form.description}
            onChangeText={f('description')}
            placeholder="Kurs haqida qisqacha..."
            placeholderTextColor={P.muted}
            multiline
            editable={!saving}
          />

          <Text style={mf.lbl}>Kategoriya</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {CATS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    mf.catChip,
                    {
                      borderColor: form.category === cat ? P.indigo : P.border2,
                      backgroundColor: form.category === cat ? P.indigo + '22' : 'transparent',
                      opacity: saving ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => !saving && setForm(p => ({ ...p, category: cat }))}
                  disabled={saving}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: form.category === cat ? P.indigo : P.sub,
                    }}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TextInput
            style={mf.field}
            value={form.category}
            onChangeText={f('category')}
            placeholder="Yoki o'zingiz kiriting..."
            placeholderTextColor={P.muted}
            editable={!saving}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const mf = StyleSheet.create({
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: P.card2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hdrTitle: {
    flex: 1,
    color: P.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: P.indigo,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  saveTxt: {
    color: P.white,
    fontWeight: '800',
    fontSize: 13,
  },
  section: {
    backgroundColor: P.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  sectionLbl: {
    fontSize: 10,
    fontWeight: '800',
    color: P.sub,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  lbl: {
    fontSize: 12,
    fontWeight: '700',
    color: P.sub,
    marginBottom: 6,
    marginTop: 4,
  },
  field: {
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.border2,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: P.text,
    marginBottom: 12,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});

// ─── Nav ──────────────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'courses' | 'students' | 'monitoring' | 'settings';

const NAV: { key: Screen; icon: string; label: string }[] = [
  { key: 'dashboard', icon: 'home', label: 'Bosh sahifa' },
  { key: 'courses', icon: 'book', label: 'Kurslar' },
  { key: 'students', icon: 'users', label: 'Talabalar' },
  { key: 'monitoring', icon: 'bar-chart-2', label: 'Natijalar' },
  { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
];

// ─── AdminPanel ───────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [courses, setCourses] = useState<Course[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);

  const [courseFormModal, setCourseFormModal] = useState<{ mode: 'add' | 'edit'; data?: Course } | null>(null);
  const [lessonFormModal, setLessonFormModal] = useState<{ mode: 'add' | 'edit'; data?: Lesson } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userActionModal, setUserActionModal] = useState<AppUser | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [certificateSettings, setCertificateSettings] = useState<CertificateSettings>(DEFAULT_CERTIFICATE_SETTINGS);
  const [certSaving, setCertSaving] = useState(false);

  const dq = useDebounce(search, 250);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'courses'), orderBy('createdAt', 'desc')),
      snap => {
        setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        setLoading(false);
      },
      () => setLoading(false),
    );

    const u2 = onSnapshot(query(collection(db, 'users')), snap =>
      setAllUsers(
        snap.docs.map(d => {
          const raw = { id: d.id, ...d.data() } as any;
          return {
            ...raw,
            role: normalizeRole(raw.role),
          } as AppUser;
        }),
      ),
    );

    const u3 = onSnapshot(
      query(collection(db, 'results'), orderBy('completedAt', 'desc')),
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

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setLessons([]);
      return;
    }

    setLessonsLoading(true);

    const u = onSnapshot(
      query(collection(db, 'courses', selectedCourse.id, 'lessons'), orderBy('order', 'asc')),
      snap => {
        setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
        setLessonsLoading(false);
      },
      () => setLessonsLoading(false),
    );

    return () => u();
  }, [selectedCourse]);

  const analytics = useMemo(() => {
    const students = allUsers.filter(u => u.role === 'student').length;
    const users = allUsers.filter(u => u.role === 'user').length;
    const admins = allUsers.filter(u => u.role === 'admin' || u.role === 'super-admin').length;
    const avgScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
    const passRate = results.length ? Math.round((results.filter(r => r.score >= 80).length / results.length) * 100) : 0;
    const now = Date.now();

    const last7 = Array.from({ length: 7 }, (_, i) => {
      const start = new Date(now - (6 - i) * 86400000);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      return results.filter(r => {
        const d = new Date(r.completedAt).getTime();
        return d >= start.getTime() && d < end.getTime();
      }).length;
    });

    return { students, users, admins, avgScore, passRate, last7 };
  }, [allUsers, results]);

  const filteredCourses = useMemo(
    () => courses.filter(c => c.title.toLowerCase().includes(dq.toLowerCase())),
    [courses, dq],
  );

  const filteredUsers = useMemo(
    () =>
      allUsers.filter(u => {
        const name = getUserName(u).toLowerCase();
        const ms = (u.email || '').toLowerCase().includes(dq.toLowerCase()) || name.includes(dq.toLowerCase());
        return ms && (roleFilter === 'all' || u.role === roleFilter);
      }),
    [allUsers, dq, roleFilter],
  );

  const filteredResults = useMemo(
    () => results.filter(r => r.courseTitle.toLowerCase().includes(dq.toLowerCase())),
    [results, dq],
  );

  const prepareTheoryFileForFirestore = async (
    file: PickedFile,
  ): Promise<{
    fileName: string;
    fileBase64: string;
    fileMimeType: string;
    fileSize: number;
    fileUri: string;
  }> => {
    if (!file?.uri) {
      throw new Error("Fayl manzili topilmadi. Faylni qaytadan tanlang.");
    }

    let size = file.size ?? 0;

    if (!size) {
      try {
        const info = await FileSystem.getInfoAsync(file.uri, { size: true });
        size = info.exists && typeof info.size === 'number' ? info.size : 0;
      } catch {
        size = 0;
      }
    }

    if (size > MAX_FIRESTORE_FILE_BYTES) {
      throw new Error(
        "Fayl hajmi katta. Maksimal 1MB gacha PDF, Word, PPTX yoki TXT fayl tanlang.",
      );
    }

    let fileBase64 = '';

    try {
      fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: BASE64_ENCODING as any,
      });
    } catch (e: any) {
      throw new Error(
        e?.message
          ? `Faylni base64 qilib o'qib bo'lmadi: ${e.message}`
          : "Faylni base64 qilib o'qib bo'lmadi. Faylni qaytadan tanlang.",
      );
    }

    if (!fileBase64) {
      throw new Error("Fayl base64 qiymati bo'sh chiqdi. Faylni qaytadan tanlang.");
    }

    return {
      fileName: file.name,
      fileBase64,
      fileMimeType: file.mimeType || 'application/octet-stream',
      fileSize: size,
      fileUri: file.uri,
    };
  };

  const getFileChunks = (base64: string) => {
    const chunks: string[] = [];

    for (let i = 0; i < base64.length; i += FIRESTORE_BASE64_CHUNK_SIZE) {
      chunks.push(base64.slice(i, i + FIRESTORE_BASE64_CHUNK_SIZE));
    }

    return chunks;
  };

  const deleteTheoryFileChunks = async (courseId: string, lessonId: string) => {
    const chunksSnap = await getDocs(
      collection(db, 'courses', courseId, 'lessons', lessonId, 'fileChunks'),
    );

    if (chunksSnap.empty) return;

    let batch = writeBatch(db);
    let count = 0;

    for (const chunkDoc of chunksSnap.docs) {
      batch.delete(chunkDoc.ref);
      count += 1;

      if (count >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
  };

  const saveTheoryFileChunks = async (
    courseId: string,
    lessonId: string,
    fileBase64: string,
  ) => {
    const chunks = getFileChunks(fileBase64);

    let batch = writeBatch(db);
    let count = 0;

    chunks.forEach((chunk, index) => {
      const chunkRef = doc(db, 'courses', courseId, 'lessons', lessonId, 'fileChunks', String(index).padStart(4, '0'));
      batch.set(chunkRef, {
        index,
        data: chunk,
      });
      count += 1;
    });

    if (count > 0) {
      await batch.commit();
    }

    return chunks.length;
  };

  // ── Course CRUD ──

  const saveCourse = async (form: CourseFormData) => {
    if (!form.title.trim()) {
      Alert.alert('Xato', 'Kurs nomini kiriting!');
      return;
    }

    setSaving(true);

    try {
      if (courseFormModal?.mode === 'edit' && courseFormModal.data?.id) {
        await updateDoc(doc(db, 'courses', courseFormModal.data.id), {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
        });
      } else {
        await addDoc(collection(db, 'courses'), {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          createdAt: serverTimestamp(),
        });
      }

      setCourseFormModal(null);
      Alert.alert('✅', courseFormModal?.mode === 'edit' ? 'Kurs yangilandi!' : 'Kurs yaratildi!');
    } catch {
      Alert.alert('Xato', "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  const deleteCourse = (id: string) => {
    Alert.alert("O'chirish", "Kurs va barcha darslari o'chiriladi!", [
      { text: 'Bekor' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            const snap = await getDocs(collection(db, 'courses', id, 'lessons'));
            const batch = writeBatch(db);

            for (const lessonDoc of snap.docs) {
              await deleteTheoryFileChunks(id, lessonDoc.id);
              batch.delete(lessonDoc.ref);
            }

            batch.delete(doc(db, 'courses', id));
            await batch.commit();

            if (selectedCourse?.id === id) setSelectedCourse(null);
          } catch {
            Alert.alert('Xato', "O'chirishda xatolik");
          }
        },
      },
    ]);
  };

  const batchDeleteCourses = () => {
    Alert.alert("Batch o'chirish", `${selectedIds.size} ta kurs o'chirilsinmi?`, [
      { text: 'Bekor' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            for (const id of selectedIds) {
              const snap = await getDocs(collection(db, 'courses', id, 'lessons'));
              const batch = writeBatch(db);

              for (const lessonDoc of snap.docs) {
                await deleteTheoryFileChunks(id, lessonDoc.id);
                batch.delete(lessonDoc.ref);
              }

              batch.delete(doc(db, 'courses', id));
              await batch.commit();
            }

            setSelectedIds(new Set());
            setBatchMode(false);
          } catch {
            Alert.alert('Xato', "O'chirishda xatolik");
          }
        },
      },
    ]);
  };

  // ── Lesson CRUD ──

  const saveLesson = async (form: LessonFormData) => {
    if (!selectedCourse) {
      Alert.alert('Xato', 'Kurs tanlanmagan!');
      return;
    }

    if (!form.title.trim()) {
      Alert.alert('Xato', 'Dars nomini kiriting!');
      return;
    }

    const cleanQuiz = form.quiz
      .filter(q => q.question.trim())
      .map(q => ({
        question: q.question.trim(),
        options: q.options.map(o => o.trim()),
        correct: q.correct,
      }));

    setSaving(true);
    setUploadProgress(0);

    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim(),
        lessonType: form.lessonType,
        videoUrl: form.videoUrl.trim(),
        videoDuration: form.videoDuration.trim(),
        theoryText: form.theoryText.trim(),
        quiz: cleanQuiz,
      };

      const editingLesson = lessonFormModal?.mode === 'edit' && lessonFormModal.data?.id;
      let preparedFile: Awaited<ReturnType<typeof prepareTheoryFileForFirestore>> | null = null;

      if (form.theoryFile) {
        const oldFileName = lessonFormModal?.data?.theoryFileName;
        const oldFileUri = lessonFormModal?.data?.theoryFileUri;

        const isOldFile =
          !!editingLesson &&
          !!oldFileName &&
          form.theoryFile.name === oldFileName &&
          form.theoryFile.uri === oldFileUri &&
          !!lessonFormModal?.data?.theoryFileChunked;

        if (isOldFile) {
          payload.theoryFileName = lessonFormModal.data?.theoryFileName ?? '';
          payload.theoryFileUri = lessonFormModal.data?.theoryFileUri ?? '';
          payload.theoryFileMimeType = lessonFormModal.data?.theoryFileMimeType ?? 'application/octet-stream';
          payload.theoryFileSize = lessonFormModal.data?.theoryFileSize ?? 0;
          payload.theoryFileChunked = true;
          payload.theoryFileChunkCount = lessonFormModal.data?.theoryFileChunkCount ?? 0;
          payload.theoryFileBase64 = '';
          setUploadProgress(100);
        } else {
          setUploadProgress(15);
          preparedFile = await prepareTheoryFileForFirestore(form.theoryFile);
          setUploadProgress(45);

          payload.theoryFileName = preparedFile.fileName;
          payload.theoryFileUri = preparedFile.fileUri;
          payload.theoryFileMimeType = preparedFile.fileMimeType;
          payload.theoryFileSize = preparedFile.fileSize;
          payload.theoryFileChunked = true;
          payload.theoryFileBase64 = '';
        }
      } else {
        payload.theoryFileName = '';
        payload.theoryFileUri = '';
        payload.theoryFileBase64 = '';
        payload.theoryFileMimeType = '';
        payload.theoryFileSize = 0;
        payload.theoryFileChunked = false;
        payload.theoryFileChunkCount = 0;
        setUploadProgress(100);
      }

      if (editingLesson) {
        payload.order = lessonFormModal.data!.order;

        await updateDoc(
          doc(db, 'courses', selectedCourse.id, 'lessons', lessonFormModal.data!.id),
          payload,
        );

        if (preparedFile) {
          await deleteTheoryFileChunks(selectedCourse.id, lessonFormModal.data!.id);
          setUploadProgress(65);
          const chunkCount = await saveTheoryFileChunks(
            selectedCourse.id,
            lessonFormModal.data!.id,
            preparedFile.fileBase64,
          );
          setUploadProgress(90);

          await updateDoc(
            doc(db, 'courses', selectedCourse.id, 'lessons', lessonFormModal.data!.id),
            {
              theoryFileChunkCount: chunkCount,
              theoryFileChunked: true,
            },
          );
        } else if (!form.theoryFile) {
          await deleteTheoryFileChunks(selectedCourse.id, lessonFormModal.data!.id);
        }
      } else {
        payload.order = lessons.length + 1;
        payload.createdAt = serverTimestamp();

        const lessonRef = await addDoc(collection(db, 'courses', selectedCourse.id, 'lessons'), payload);

        if (preparedFile) {
          setUploadProgress(65);
          const chunkCount = await saveTheoryFileChunks(
            selectedCourse.id,
            lessonRef.id,
            preparedFile.fileBase64,
          );
          setUploadProgress(90);

          await updateDoc(lessonRef, {
            theoryFileChunkCount: chunkCount,
            theoryFileChunked: true,
          });
        }
      }

      setUploadProgress(100);
      setLessonFormModal(null);
      Alert.alert('✅ Tayyor', lessonFormModal?.mode === 'edit' ? 'Dars yangilandi!' : "Dars qo'shildi!");
    } catch (e: any) {
      console.error('Dars saqlash xatosi:', e);
      Alert.alert(
        'Xato',
        e?.message
          ? `Fayl yoki darsni saqlab bo'lmadi.\n\n${e.message}`
          : "Fayl yoki darsni saqlab bo'lmadi.",
      );
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const deleteLesson = (id: string) => {
    if (!selectedCourse) return;

    const lesson = lessons.find(l => l.id === id);

    Alert.alert("O'chirish", "Darsni o'chirmoqchimisiz?", [
      { text: 'Bekor' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {

            await deleteTheoryFileChunks(selectedCourse.id, id);
            await deleteDoc(doc(db, 'courses', selectedCourse.id, 'lessons', id));
          } catch {
            Alert.alert('Xato', "O'chirishda xatolik");
          }
        },
      },
    ]);
  };

  const reorderLesson = (id: string, dir: 'up' | 'down') => {
    if (!selectedCourse) return;

    const idx = lessons.findIndex(l => l.id === id);

    if (dir === 'up' && idx > 0) {
      updateDoc(doc(db, 'courses', selectedCourse.id, 'lessons', id), {
        order: lessons[idx].order - 1,
      });
      updateDoc(doc(db, 'courses', selectedCourse.id, 'lessons', lessons[idx - 1].id), {
        order: lessons[idx - 1].order + 1,
      });
    } else if (dir === 'down' && idx < lessons.length - 1) {
      updateDoc(doc(db, 'courses', selectedCourse.id, 'lessons', id), {
        order: lessons[idx].order + 1,
      });
      updateDoc(doc(db, 'courses', selectedCourse.id, 'lessons', lessons[idx + 1].id), {
        order: lessons[idx + 1].order - 1,
      });
    }
  };

  const setUserRole = async (userId: string, role: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      setUserActionModal(null);
    } catch {
      Alert.alert('Xato', "Rolni o'zgartirib bo'lmadi");
    }
  };

  const handleLogout = () => {
    Alert.alert('Tizimdan chiqish', 'Haqiqatan ham chiqmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'Chiqish',
        style: 'destructive',
        onPress: () => auth.signOut().then(() => router.replace('/login')),
      },
    ]);
  };

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[a.root, a.center]}>
        <ActivityIndicator size="large" color={P.indigo} />
        <Text style={{ color: P.sub, marginTop: 12 }}>Yuklanmoqda...</Text>
      </View>
    );
  }

  // ─── Screens ──────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 + Math.max(insets.bottom, 12) }}>
      <Animated.View entering={FadeInUp.duration(400)}>
        <Text style={a.screenTitle}>Dashboard</Text>
        <Text style={a.screenSub}>Tizim holati va statistikasi</Text>
      </Animated.View>

      <View style={a.kpiRow}>
        {[
          { v: courses.length, label: 'Kurslar', color: P.indigo, icon: 'book' },
          { v: analytics.students, label: 'Talabalar', color: P.emerald, icon: 'users' },
          { v: analytics.users, label: 'Foydalanuvchi', color: P.rose, icon: 'user' },
          { v: results.length, label: 'Natijalar', color: P.cyan, icon: 'bar-chart-2' },
        ].map((item, i) => (
          <Animated.View key={item.label} entering={ZoomIn.delay(i * 70)}>
            <View style={[a.kpiCard, { borderColor: item.color + '33' }]}>
              <View style={[a.kpiIcon, { backgroundColor: item.color + '18' }]}>
                <Feather name={item.icon as any} size={15} color={item.color} />
              </View>
              <Text style={[a.kpiVal, { color: item.color }]}>{item.v}</Text>
              <Text style={a.kpiLbl}>{item.label}</Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.delay(150)} style={a.analyticsCard}>
        <TouchableOpacity style={a.analyticsHdr} onPress={() => setAnalyticsOpen(o => !o)} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: P.indigo + '22',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Feather name="activity" size={16} color={P.indigo} />
            </View>

            <View>
              <Text style={{ color: P.text, fontWeight: '800', fontSize: 15 }}>Faollik (7 kun)</Text>
              <Text style={{ color: P.sub, fontSize: 12 }}>Testlar topshirilishi</Text>
            </View>
          </View>

          <Feather name={analyticsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={P.sub} />
        </TouchableOpacity>

        {analyticsOpen && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <MiniBarChart data={analytics.last7} color={P.indigo} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              {[
                { v: `${analytics.avgScore}%`, l: "O'rtacha ball", c: P.emerald },
                { v: `${analytics.passRate}%`, l: "O'tish darajasi", c: P.cyan },
                { v: results.length, l: 'Jami urinish', c: P.amber },
              ].map(m => (
                <View key={m.l} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: m.c }}>{m.v}</Text>
                  <Text style={{ fontSize: 11, color: P.sub, marginTop: 2, textAlign: 'center' }}>
                    {m.l}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Animated.View>

      <Text style={a.sectionLbl}>TEZKOR AMALLAR</Text>

      <View style={a.quickRow}>
        {[
          {
            label: 'Yangi kurs',
            icon: 'plus-circle',
            color: P.indigo,
            action: () => {
              setScreen('courses');
              setCourseFormModal({ mode: 'add' });
            },
          },
          { label: 'Talabalar', icon: 'users', color: P.emerald, action: () => setScreen('students') },
          { label: 'Natijalar', icon: 'bar-chart-2', color: P.cyan, action: () => setScreen('monitoring') },
          { label: 'Sozlamalar', icon: 'settings', color: P.amber, action: () => setScreen('settings') },
        ].map(item => (
          <TouchableOpacity
            key={item.label}
            style={[a.quickCard, { borderColor: item.color + '33' }]}
            onPress={item.action}
            activeOpacity={0.8}
          >
            <View style={[a.quickIcon, { backgroundColor: item.color + '18' }]}>
              <Feather name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={[a.quickLabel, { color: item.color }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={a.sectionLbl}>SO'NGGI NATIJALAR</Text>

      {results.slice(0, 5).map((r, i) => {
        const rc = r.score >= 80 ? P.emerald : r.score >= 50 ? P.amber : P.rose;

        return (
          <Animated.View key={r.id} entering={FadeInDown.delay(i * 50)}>
            <View style={a.recentRow}>
              <View style={[a.recentAvatar, { backgroundColor: rc + '18' }]}>
                <Text style={{ color: rc, fontWeight: '900', fontSize: 11 }}>{r.score}%</Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {r.courseTitle}
                </Text>
                <Text style={{ color: P.sub, fontSize: 11, marginTop: 2 }}>
                  {r.lessonTitle ?? ''} • {r.completedAt ? new Date(r.completedAt).toLocaleDateString('uz-UZ') : ''}
                </Text>
              </View>

              {r.attempts ? <Pill label={`${r.attempts}x`} color={P.sub} small /> : null}
            </View>
          </Animated.View>
        );
      })}
    </ScrollView>
  );

  const renderCourses = () => (
    <View style={{ flex: 1 }}>
      <View style={a.toolbar}>
        <View style={a.searchWrap}>
          <Feather name="search" size={15} color={P.sub} />
          <TextInput
            style={a.searchInput}
            placeholder="Kurs qidirish..."
            placeholderTextColor={P.muted}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={14} color={P.sub} />
            </TouchableOpacity>
          )}
        </View>

        {batchMode ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[a.toolBtn, { backgroundColor: P.rose + '22', borderColor: P.rose + '44' }]}
              onPress={batchDeleteCourses}
              disabled={selectedIds.size === 0}
            >
              <Feather name="trash-2" size={15} color={P.rose} />
              <Text style={{ color: P.rose, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
                {selectedIds.size}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={a.toolBtn}
              onPress={() => {
                setBatchMode(false);
                setSelectedIds(new Set());
              }}
            >
              <Feather name="x" size={15} color={P.sub} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={a.toolBtn} onPress={() => setBatchMode(true)}>
              <Feather name="check-square" size={15} color={P.sub} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[a.toolBtn, { backgroundColor: P.indigo, borderColor: P.indigo }]}
              onPress={() => setCourseFormModal({ mode: 'add' })}
            >
              <Feather name="plus" size={15} color={P.white} />
              <Text style={{ color: P.white, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
                Yangi Kurs
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={filteredCourses}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 + Math.max(insets.bottom, 12) }}
        ListEmptyComponent={
          <View style={a.emptyBox}>
            <Feather name="folder" size={44} color={P.muted} />
            <Text style={a.emptyTxt}>Kurslar topilmadi</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isSel = selectedIds.has(item.id);

          return (
            <Animated.View entering={FadeInDown.delay(index * 40)}>
              <TouchableOpacity
                style={[a.courseCard, isSel && { borderColor: P.indigo }]}
                onPress={() => {
                  if (batchMode) {
                    const n = new Set(selectedIds);
                    isSel ? n.delete(item.id) : n.add(item.id);
                    setSelectedIds(n);
                  } else {
                    setSelectedCourse(item);
                    setSearch('');
                  }
                }}
                onLongPress={() => {
                  setBatchMode(true);
                  const n = new Set(selectedIds);
                  n.add(item.id);
                  setSelectedIds(n);
                }}
                activeOpacity={0.85}
              >
                {batchMode && (
                  <View
                    style={[
                      a.checkbox,
                      {
                        borderColor: isSel ? P.indigo : P.border2,
                        backgroundColor: isSel ? P.indigo : 'transparent',
                      },
                    ]}
                  >
                    {isSel && <Feather name="check" size={11} color={P.white} />}
                  </View>
                )}

                <View style={[a.courseIconWrap, { backgroundColor: P.indigo + '18' }]}>
                  <MaterialCommunityIcons name="folder-play-outline" size={24} color={P.indigo} />
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: P.text, fontWeight: '800', fontSize: 15 }}>{item.title}</Text>
                  <Text style={{ color: P.sub, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                    {item.description || "Tavsif yo'q"}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    {item.category ? <Pill label={item.category} color={P.purple} small /> : null}
                  </View>
                </View>

                {!batchMode && (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity style={a.iconBtn} onPress={() => setCourseFormModal({ mode: 'edit', data: item })}>
                      <Feather name="edit-2" size={14} color={P.indigo} />
                    </TouchableOpacity>

                    <TouchableOpacity style={a.iconBtn} onPress={() => deleteCourse(item.id)}>
                      <Feather name="trash-2" size={14} color={P.rose} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
    </View>
  );

  const renderLessons = () => {
    if (!selectedCourse) return null;

    return (
      <View style={{ flex: 1 }}>
        <View style={a.courseInfoBar}>
          <TouchableOpacity
            onPress={() => {
              setSelectedCourse(null);
              setSearch('');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Feather name="arrow-left" size={15} color={P.sub} />
            <Text style={{ color: P.sub, fontSize: 13 }}>Kurslar</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Text style={{ color: P.text, fontSize: 18, fontWeight: '900' }} numberOfLines={1}>
              {selectedCourse.title}
            </Text>
            {selectedCourse.category ? <Pill label={selectedCourse.category} color={P.purple} small /> : null}
          </View>

          <Text style={{ color: P.sub, fontSize: 12, marginTop: 4 }}>
            {lessons.filter(x => x.lessonType === 'maruza').length} ma’ruza •{' '}
            {lessons.filter(x => x.lessonType === 'amaliy').length} amaliy •{' '}
            {lessons.filter(x => x.lessonType === 'laboratoriya').length} laboratoriya
          </Text>
        </View>

        <View style={[a.toolbar, { paddingTop: 8 }]}>
          <Text style={{ color: P.sub, fontSize: 13 }}>Barcha darslar</Text>

          <TouchableOpacity
            style={[a.toolBtn, { backgroundColor: P.emerald + '18', borderColor: P.emerald + '44' }]}
            onPress={() => setLessonFormModal({ mode: 'add' })}
          >
            <Feather name="plus" size={15} color={P.emerald} />
            <Text style={{ color: P.emerald, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
              Dars qo'shish
            </Text>
          </TouchableOpacity>
        </View>

        {lessonsLoading ? (
          <View style={a.center}>
            <ActivityIndicator color={P.indigo} />
          </View>
        ) : (
          <FlatList
            data={lessons}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 + Math.max(insets.bottom, 12) }}
            ListEmptyComponent={
              <View style={a.emptyBox}>
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={44} color={P.muted} />
                <Text style={a.emptyTxt}>Hali darslar yo'q</Text>
                <TouchableOpacity style={a.emptyBtn} onPress={() => setLessonFormModal({ mode: 'add' })}>
                  <Text style={{ color: P.indigo, fontWeight: '700', fontSize: 13 }}>
                    Birinchi darsni qo'shing
                  </Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(index * 50)}>
                <View style={a.lessonCard}>
                  <View style={[a.orderBadge, { backgroundColor: P.indigo }]}>
                    <Text style={{ color: P.white, fontWeight: '900', fontSize: 12 }}>{item.order}</Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ color: P.text, fontWeight: '800', fontSize: 14 }}>
                      {getLessonDisplayTitle(item, lessons)}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                      <Pill
                        label={`${getLessonTypedNumber(item, lessons)}-${getLessonTypeShortLabel(item.lessonType)}`}
                        color={item.lessonType === 'amaliy' ? P.emerald : item.lessonType === 'laboratoriya' ? P.amber : P.indigo}
                        small
                      />
                      {item.videoDuration ? <Pill label={`⏱ ${item.videoDuration}`} color={P.sky} small /> : null}
                      {item.videoUrl ? <Pill label="Video ✓" color={P.emerald} small /> : <Pill label="Video yo'q" color={P.rose} small />}
                      {(item.quiz?.length ?? 0) > 0 ? <Pill label={`${item.quiz.length} savol`} color={P.amber} small /> : null}
                      {item.theoryText || item.theoryFileName ? <Pill label="Nazariya ✓" color={P.purple} small /> : null}
                      {item.theoryFileName ? (
                        <Pill label={item.theoryFileName.split('.').pop()?.toUpperCase() ?? 'FILE'} color={P.indigo} small />
                      ) : null}
                      {item.theoryFileUri ? <Pill label="Fayl ✓" color={P.cyan} small /> : null}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity
                        style={[a.iconBtn, { opacity: index === 0 ? 0.3 : 1 }]}
                        onPress={() => reorderLesson(item.id, 'up')}
                        disabled={index === 0}
                      >
                        <Feather name="chevron-up" size={14} color={P.sub} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[a.iconBtn, { opacity: index === lessons.length - 1 ? 0.3 : 1 }]}
                        onPress={() => reorderLesson(item.id, 'down')}
                        disabled={index === lessons.length - 1}
                      >
                        <Feather name="chevron-down" size={14} color={P.sub} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity style={a.iconBtn} onPress={() => setLessonFormModal({ mode: 'edit', data: item })}>
                        <Feather name="edit-2" size={14} color={P.indigo} />
                      </TouchableOpacity>

                      <TouchableOpacity style={a.iconBtn} onPress={() => deleteLesson(item.id)}>
                        <Feather name="trash-2" size={14} color={P.rose} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Animated.View>
            )}
          />
        )}
      </View>
    );
  };

  const renderStudents = () => (
    <View style={{ flex: 1 }}>
      <View style={a.toolbar}>
        <View style={a.searchWrap}>
          <Feather name="search" size={15} color={P.sub} />
          <TextInput
            style={a.searchInput}
            placeholder="Qidirish..."
            placeholderTextColor={P.muted}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={14} color={P.sub} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 8, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { key: 'all', label: `Hammasi (${allUsers.length})` },
            { key: 'student', label: `Talaba (${analytics.students})` },
            { key: 'user', label: `Foydalanuvchi (${analytics.users})` },
            { key: 'admin', label: 'Admin' },
            { key: 'super-admin', label: 'Super Admin' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                a.filterChip,
                {
                  borderColor: roleFilter === f.key ? P.indigo : P.border2,
                  backgroundColor: roleFilter === f.key ? P.indigo + '22' : 'transparent',
                },
              ]}
              onPress={() => setRoleFilter(f.key as any)}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: roleFilter === f.key ? P.indigo : P.sub }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <FlatList
        data={filteredUsers}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 + Math.max(insets.bottom, 12) }}
        ListEmptyComponent={
          <View style={a.emptyBox}>
            <Text style={a.emptyTxt}>Foydalanuvchi topilmadi</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const color = ROLE_COLORS[item.role] ?? P.sub;

          return (
            <Animated.View entering={FadeInDown.delay(index * 40)}>
              <TouchableOpacity style={a.userCard} onPress={() => setUserActionModal(item)} activeOpacity={0.85}>
                <View style={[a.userAvatar, { backgroundColor: color + '22' }]}>
                  <Text style={{ color, fontWeight: '900', fontSize: 16 }}>
                    {getUserName(item)[0]?.toUpperCase() || '?'}
                  </Text>
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }}>{item.email}</Text>
                  <Text style={{ color: P.sub, fontSize: 12, marginTop: 2 }}>
                    {getUserName(item)}
                  </Text>
                </View>

                <View style={[a.roleBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color }}>{ROLE_LABELS[item.role]}</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
    </View>
  );

  const renderMonitoring = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 + Math.max(insets.bottom, 12) }}>
      <View style={a.monitorSummary}>
        {[
          { label: "O'rtacha ball", value: `${analytics.avgScore}%`, color: P.indigo },
          { label: "O'tish darajasi", value: `${analytics.passRate}%`, color: P.emerald },
          { label: 'Jami urinish', value: results.length, color: P.cyan },
        ].map(item => (
          <View key={item.label} style={[a.monitorCard, { borderColor: item.color + '33' }]}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: item.color }}>{item.value}</Text>
            <Text style={{ color: P.sub, fontSize: 10, marginTop: 4, textAlign: 'center' }}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={a.chartCard}>
        <Text style={{ color: P.text, fontWeight: '700', fontSize: 14, marginBottom: 12 }}>
          So'nggi 7 kun faolligi
        </Text>
        <MiniBarChart data={analytics.last7} color={P.indigo} />
      </View>

      <View style={[a.searchWrap, { marginBottom: 12 }]}>
        <Feather name="search" size={15} color={P.sub} />
        <TextInput
          style={a.searchInput}
          placeholder="Kurs bo'yicha qidirish..."
          placeholderTextColor={P.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {filteredResults.map((r, i) => {
        const rc = r.score >= 80 ? P.emerald : r.score >= 50 ? P.amber : P.rose;

        return (
          <Animated.View key={r.id} entering={FadeInDown.delay(i * 40)}>
            <View style={a.resultCard}>
              <View style={[a.resultScoreBubble, { backgroundColor: rc + '18' }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: rc }}>{r.score}%</Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {r.courseTitle}
                </Text>

                {r.lessonTitle ? (
                  <Text style={{ color: P.sub, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                    {r.lessonTitle}
                  </Text>
                ) : null}

                <Text style={{ color: P.muted, fontSize: 11, marginTop: 3 }}>
                  {r.completedAt ? new Date(r.completedAt).toLocaleDateString('uz-UZ') : ''}
                  {r.attempts ? ` • ${r.attempts} urinish` : ''}
                </Text>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </ScrollView>
  );

  const updateCertificateSetting = (key: keyof CertificateSettings, value: string) => {
    setCertificateSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveCertificateSettings = async () => {
    if (!certificateSettings.platformName.trim()) {
      Alert.alert('Xato', 'Platforma nomini kiriting.');
      return;
    }

    if (!certificateSettings.directorName.trim()) {
      Alert.alert('Xato', 'Direktor ism familiyasini kiriting.');
      return;
    }

    setCertSaving(true);

    try {
      await setDoc(
        doc(db, 'settings', 'certificate'),
        {
          ...certificateSettings,
          platformName: certificateSettings.platformName.trim(),
          certificateType: certificateSettings.certificateType.trim(),
          mainTitle: certificateSettings.mainTitle.trim(),
          introText: certificateSettings.introText.trim(),
          completionText: certificateSettings.completionText.trim(),
          directorName: certificateSettings.directorName.trim(),
          signatureName: certificateSettings.signatureName.trim(),
          organizationName: certificateSettings.organizationName.trim(),
          sealText: certificateSettings.sealText.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      Alert.alert('✅ Tayyor', 'Sertifikat sozlamalari saqlandi.');
    } catch (e) {
      console.error('Sertifikat sozlamalarini saqlash xatosi:', e);
      Alert.alert('Xato', 'Sertifikat sozlamalarini saqlab bo‘lmadi.');
    } finally {
      setCertSaving(false);
    }
  };

  const renderSettings = () => (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 + Math.max(insets.bottom, 12) }}>
      <Text style={a.screenTitle}>Sozlamalar</Text>
      <Text style={a.screenSub}>Tizim, hisob va sertifikat sozlamalari</Text>

      <Text style={[a.sectionLbl, { marginTop: 8 }]}>HISOB</Text>

      <View style={a.settingsCard}>
        <TouchableOpacity style={a.settingsRow} onPress={() => Linking.openURL('tel:+998884607747')}>
          <View style={[a.settingsIcon, { backgroundColor: P.emerald + '18' }]}>
            <Feather name="phone-call" size={16} color={P.emerald} />
          </View>
          <Text style={a.settingsRowTxt}>Texnik yordam</Text>
          <Feather name="chevron-right" size={16} color={P.sub} />
        </TouchableOpacity>

        <Divider />

        <TouchableOpacity style={a.settingsRow} onPress={handleLogout}>
          <View style={[a.settingsIcon, { backgroundColor: P.rose + '18' }]}>
            <Feather name="log-out" size={16} color={P.rose} />
          </View>
          <Text style={[a.settingsRowTxt, { color: P.rose }]}>Tizimdan chiqish</Text>
          <Feather name="chevron-right" size={16} color={P.rose} />
        </TouchableOpacity>
      </View>

      <Text style={[a.sectionLbl, { marginTop: 20 }]}>SERTIFIKAT SOZLAMALARI</Text>

      <View style={a.certificatePreviewCard}>
        <View style={a.certPreviewLeft}>
          <Text style={a.certMiniBrand}>{certificateSettings.platformName || 'Shodiyev M'}</Text>
          <Text style={a.certMiniTitle}>{certificateSettings.mainTitle || 'Sertifikat'}</Text>
          <Text style={a.certMiniText}>{certificateSettings.introText || 'Ushbu sertifikat shuni tasdiqlaydiki'}</Text>
          <Text style={a.certMiniName}>Ism Familiya</Text>
          <Text style={a.certMiniCourse}>“Kurs nomi”</Text>
          <Text style={a.certMiniText}>{certificateSettings.completionText || 'kursini muvaffaqiyatli tugatdi'}</Text>
          <View style={a.certMiniSignature}>
            <Text style={a.certMiniSign}>{certificateSettings.signatureName || 'M. Shodiyeva'}</Text>
            <View style={a.certMiniLine} />
            <Text style={a.certMiniDirector}>{certificateSettings.directorName || 'Shodiyeva Muborak'}</Text>
          </View>
        </View>

        <View style={a.certPreviewRibbon}>
          <Text style={a.certRibbonText}>{certificateSettings.certificateType || 'KURS SERTIFIKATI'}</Text>
          <View style={a.certSeal}>
            <Text style={a.certSealText}>{certificateSettings.sealText || 'SHODIYEV M'}</Text>
          </View>
        </View>
      </View>

      <View style={a.settingsCard}>
        <View style={a.formBlock}>
          <Text style={a.formLabel}>Platforma nomi</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.platformName}
            onChangeText={v => updateCertificateSetting('platformName', v)}
            placeholder="Shodiyev M"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Sertifikat turi</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.certificateType}
            onChangeText={v => updateCertificateSetting('certificateType', v)}
            placeholder="KURS SERTIFIKATI"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Asosiy sarlavha</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.mainTitle}
            onChangeText={v => updateCertificateSetting('mainTitle', v)}
            placeholder="Sertifikat"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Kirish matni</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.introText}
            onChangeText={v => updateCertificateSetting('introText', v)}
            placeholder="Ushbu sertifikat shuni tasdiqlaydiki"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Kurs tugatish matni</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.completionText}
            onChangeText={v => updateCertificateSetting('completionText', v)}
            placeholder="kursini muvaffaqiyatli tugatdi"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Direktor ism familiyasi</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.directorName}
            onChangeText={v => updateCertificateSetting('directorName', v)}
            placeholder="Shodiyeva Muborak"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Imzo yozuvi</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.signatureName}
            onChangeText={v => updateCertificateSetting('signatureName', v)}
            placeholder="M. Shodiyeva"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Lavozim / tashkilot yozuvi</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.organizationName}
            onChangeText={v => updateCertificateSetting('organizationName', v)}
            placeholder="Shodiyev M ta'lim platformasi direktori"
            placeholderTextColor={P.muted}
          />

          <Text style={a.formLabel}>Muhr ichidagi yozuv</Text>
          <TextInput
            style={a.settingsInput}
            value={certificateSettings.sealText}
            onChangeText={v => updateCertificateSetting('sealText', v)}
            placeholder="SHODIYEV M"
            placeholderTextColor={P.muted}
          />

          <TouchableOpacity
            style={[a.saveCertificateBtn, { opacity: certSaving ? 0.6 : 1 }]}
            onPress={saveCertificateSettings}
            disabled={certSaving}
            activeOpacity={0.85}
          >
            {certSaving ? (
              <ActivityIndicator size="small" color={P.white} />
            ) : (
              <>
                <Feather name="save" size={16} color={P.white} />
                <Text style={a.saveCertificateTxt}>Sertifikat sozlamalarini saqlash</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={a.resetCertificateBtn}
            onPress={() => setCertificateSettings(DEFAULT_CERTIFICATE_SETTINGS)}
            disabled={certSaving}
            activeOpacity={0.85}
          >
            <Feather name="refresh-ccw" size={15} color={P.sub} />
            <Text style={a.resetCertificateTxt}>Standart holatga qaytarish</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[a.sectionLbl, { marginTop: 20 }]}>MA'LUMOTLAR</Text>

      <View style={a.settingsCard}>
        {[
          { label: 'Jami kurslar', value: courses.length, color: P.indigo },
          { label: 'Jami foydalanuvchilar', value: allUsers.length, color: P.emerald },
          { label: 'Jami natijalar', value: results.length, color: P.cyan },
          { label: "O'rtacha ball", value: `${analytics.avgScore}%`, color: P.amber },
          { label: "O'tish darajasi", value: `${analytics.passRate}%`, color: P.purple },
        ].map((item, i) => (
          <View key={item.label}>
            {i > 0 && <Divider />}
            <View style={a.settingsRow}>
              <Text style={a.settingsRowTxt}>{item.label}</Text>
              <Text style={{ fontWeight: '800', fontSize: 15, color: item.color }}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // ─── Root Render ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={a.root}>
      <StatusBar barStyle="light-content" backgroundColor={P.bg} translucent={false} />

      <View style={a.topBar}>
        {selectedCourse && screen === 'courses' ? (
          <TouchableOpacity
            onPress={() => {
              setSelectedCourse(null);
              setSearch('');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Feather name="arrow-left" size={18} color={P.sub} />
            <Text style={{ color: P.sub, fontSize: 14 }}>Kurslar</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={a.logoMark}>
              <MaterialCommunityIcons name="shield-crown" size={16} color={P.indigo} />
            </View>
            <Text style={a.topBarTitle}>{NAV.find(n => n.key === screen)?.label ?? 'Admin'}</Text>
          </View>
        )}

        <TouchableOpacity style={a.menuBtnTop} onPress={() => setSidebarOpen(true)}>
          <Feather name="menu" size={20} color={P.text} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {screen === 'dashboard' && renderDashboard()}
        {screen === 'courses' && !selectedCourse && renderCourses()}
        {screen === 'courses' && selectedCourse && renderLessons()}
        {screen === 'students' && renderStudents()}
        {screen === 'monitoring' && renderMonitoring()}
        {screen === 'settings' && renderSettings()}
      </View>

      <View style={[a.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {NAV.map(item => {
          const active = screen === item.key;

          return (
            <TouchableOpacity
              key={item.key}
              style={a.navItem}
              onPress={() => {
                setScreen(item.key);
                setSearch('');
                if (item.key !== 'courses') setSelectedCourse(null);
              }}
              activeOpacity={0.8}
            >
              <View style={[a.navIconWrap, active && { backgroundColor: P.indigo + '22' }]}>
                <Feather name={item.icon as any} size={20} color={active ? P.indigo : P.muted} />
              </View>
              <Text style={[a.navLabel, { color: active ? P.indigo : P.muted }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={!!courseFormModal} animationType="slide">
        {courseFormModal && (
          <CourseForm
            title={courseFormModal.mode === 'add' ? 'Yangi Kurs' : 'Kursni Tahrirlash'}
            initial={{
              title: courseFormModal.data?.title ?? '',
              description: courseFormModal.data?.description ?? '',
              category: courseFormModal.data?.category ?? '',
            }}
            onSave={saveCourse}
            onCancel={() => setCourseFormModal(null)}
            saving={saving}
          />
        )}
      </Modal>

      <Modal visible={!!lessonFormModal} animationType="slide">
        {lessonFormModal && (
          <LessonForm
            title={lessonFormModal.mode === 'add' ? 'Yangi Dars' : 'Darsni Tahrirlash'}
            initial={{
              title: lessonFormModal.data?.title ?? '',
              description: lessonFormModal.data?.description ?? '',
              lessonType: lessonFormModal.data?.lessonType ?? 'maruza',
              videoUrl: lessonFormModal.data?.videoUrl ?? '',
              videoDuration: lessonFormModal.data?.videoDuration ?? '',
              theoryText: lessonFormModal.data?.theoryText ?? '',
              theoryFileName: lessonFormModal.data?.theoryFileName,
              theoryFileUri: lessonFormModal.data?.theoryFileUri,
              quiz: lessonFormModal.data?.quiz ?? [],
            }}
            onSave={saveLesson}
            onCancel={() => {
              if (!saving) setLessonFormModal(null);
            }}
            saving={saving}
            uploadProgress={uploadProgress}
          />
        )}
      </Modal>

      <Modal visible={!!userActionModal} transparent animationType="fade">
        <View style={a.overlayCenter}>
          {userActionModal && (
            <View style={a.actionSheet}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={[a.userAvatar, { backgroundColor: ROLE_COLORS[userActionModal.role] + '22' }]}>
                  <Text style={{ color: ROLE_COLORS[userActionModal.role], fontWeight: '900', fontSize: 18 }}>
                    {getUserName(userActionModal)[0]?.toUpperCase() || '?'}
                  </Text>
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }}>{userActionModal.email}</Text>
                  <Text style={{ color: P.sub, fontSize: 12 }}>{getUserName(userActionModal)}</Text>
                </View>
              </View>

              <Divider />

              <Text style={[a.sectionLbl, { marginTop: 12 }]}>ROL O'ZGARTIRISH</Text>

              {(['student', 'user', 'admin'] as UserRole[]).map(role => {
                const isActive = userActionModal.role === role;
                const color = ROLE_COLORS[role];

                return (
                  <TouchableOpacity
                    key={role}
                    style={[
                      a.roleOption,
                      {
                        borderColor: isActive ? color + '55' : P.border2,
                        backgroundColor: isActive ? color + '11' : 'transparent',
                      },
                    ]}
                    onPress={() => setUserRole(userActionModal.id, role)}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />

                    <Text
                      style={[
                        { flex: 1, fontSize: 15, fontWeight: '700', marginLeft: 12 },
                        { color: isActive ? color : P.text },
                      ]}
                    >
                      {ROLE_LABELS[role]}
                    </Text>

                    {isActive && <Feather name="check" size={14} color={color} />}
                  </TouchableOpacity>
                );
              })}

              {userActionModal.role === 'super-admin' && (
                <View style={[a.roleOption, { borderColor: P.purple + '55', backgroundColor: P.purple + '11' }]}>
                  <Feather name="shield" size={16} color={P.purple} />
                  <Text style={{ flex: 1, color: P.purple, fontWeight: '800', marginLeft: 12 }}>
                    Super Admin o'zgarmaydi
                  </Text>
                </View>
              )}

              <TouchableOpacity style={{ alignItems: 'center', padding: 16, marginTop: 4 }} onPress={() => setUserActionModal(null)}>
                <Text style={{ color: P.sub, fontWeight: '700' }}>Yopish</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={sidebarOpen} transparent animationType="fade">
        <TouchableOpacity style={a.overlayDark} activeOpacity={1} onPress={() => setSidebarOpen(false)}>
          <View style={{ flex: 1 }} />

          <Animated.View entering={SlideInRight.springify()} style={a.sidebar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 }}>
              <View style={[a.logoMark, { width: 44, height: 44, borderRadius: 14 }]}>
                <MaterialCommunityIcons name="shield-crown" size={22} color={P.indigo} />
              </View>

              <View>
                <Text style={{ color: P.text, fontSize: 18, fontWeight: '900' }}>Admin Panel</Text>
                <Text style={{ color: P.sub, fontSize: 12 }}>{auth.currentUser?.email}</Text>
              </View>
            </View>

            <Divider />

            <View style={{ marginTop: 12 }}>
              {NAV.map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[a.sideItem, screen === item.key && { backgroundColor: P.indigo + '15' }]}
                  onPress={() => {
                    setScreen(item.key);
                    setSidebarOpen(false);
                    setSearch('');
                    if (item.key !== 'courses') setSelectedCourse(null);
                  }}
                >
                  <Feather name={item.icon as any} size={18} color={screen === item.key ? P.indigo : P.sub} />

                  <Text
                    style={[
                      { flex: 1, fontSize: 15, fontWeight: '700', marginLeft: 14 },
                      { color: screen === item.key ? P.text : P.sub },
                    ]}
                  >
                    {item.label}
                  </Text>

                  {screen === item.key && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P.indigo }} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1 }} />

            <Divider />

            <TouchableOpacity
              style={[a.sideItem, { marginTop: 8 }]}
              onPress={() => {
                setSidebarOpen(false);
                handleLogout();
              }}
            >
              <Feather name="log-out" size={18} color={P.rose} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', marginLeft: 14, color: P.rose }}>
                Tizimdan chiqish
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: P.indigo + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    color: P.text,
    fontSize: 18,
    fontWeight: '900',
  },
  menuBtnTop: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: P.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },

  screenTitle: {
    color: P.text,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 4,
  },
  screenSub: {
    color: P.sub,
    fontSize: 13,
    marginBottom: 20,
  },
  sectionLbl: {
    color: P.sub,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    width: (width - 56) / 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: P.card,
    gap: 4,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: '900',
  },
  kpiLbl: {
    fontSize: 9,
    color: P.sub,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  analyticsCard: {
    backgroundColor: P.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: P.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  analyticsHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },

  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickCard: {
    width: (width - 56) / 2,
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '800',
  },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.border,
    marginBottom: 8,
  },
  recentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: P.text,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.border2,
  },

  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: P.border,
    padding: 16,
    marginBottom: 10,
  },
  courseIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  courseInfoBar: {
    backgroundColor: P.card,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },

  lessonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.border,
    padding: 16,
    marginBottom: 10,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTxt: {
    color: P.sub,
    fontSize: 14,
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.indigo + '55',
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.border,
    padding: 16,
    marginBottom: 8,
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },

  monitorSummary: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  monitorCard: {
    flex: 1,
    backgroundColor: P.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  chartCard: {
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.border,
    padding: 16,
    marginBottom: 16,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    padding: 14,
    marginBottom: 8,
  },
  resultScoreBubble: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  settingsCard: {
    backgroundColor: P.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsRowTxt: {
    flex: 1,
    color: P.text,
    fontWeight: '600',
    fontSize: 15,
  },

  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: P.card2,
    borderWidth: 1,
    borderColor: P.border2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  overlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: P.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: P.surface,
    borderTopWidth: 1,
    borderTopColor: P.border,
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navIconWrap: {
    width: 44,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  overlayDark: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
  },
  sidebar: {
    width: width * 0.72,
    height: '100%',
    backgroundColor: P.surface,
    borderLeftWidth: 1,
    borderLeftColor: P.border,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 2,
  },
});
