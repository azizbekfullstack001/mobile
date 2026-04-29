import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { auth, db } from './firebaseConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole = 'super-admin' | 'admin' | 'student' | 'user';

interface AppUser {
  id: string;
  uid?: string;
  name?: string;
  fullName?: string;
  fullname?: string;
  displayName?: string;
  email: string;
  role: AppRole;
  createdAt?: any;
}

const PAGE_SIZE = 10;
const ALLOWED_ROLES: AppRole[] = ['super-admin', 'admin', 'student', 'user'];
const EDITABLE_ROLES: AppRole[] = ['student', 'user', 'admin'];

const ROLE_COLORS: Record<AppRole, string> = {
  'super-admin': '#6366F1',
  admin: '#4F46E5',
  student: '#10B981',
  user: '#F59E0B',
};

const ROLE_LABELS: Record<AppRole, string> = {
  'super-admin': 'SUPER ADMIN',
  admin: 'ADMIN',
  student: 'TALABA',
  user: 'FOYDALANUVCHI',
};

const normalizeRole = (role?: string): AppRole => {
  if (role && ALLOWED_ROLES.includes(role as AppRole)) return role as AppRole;
  return 'user';
};

const getUserName = (user: Partial<AppUser>) => {
  return (
    user.fullName ||
    user.fullname ||
    user.displayName ||
    user.name ||
    user.email ||
    "Noma'lum"
  );
};

const mapUserDoc = (d: any): AppUser => {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    role: normalizeRole(data?.role),
    email: data?.email ?? '',
  } as AppUser;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const currentAdminUid = auth.currentUser?.uid;

  useEffect(() => {
    fetchUsers();
  }, []);

  // Super admin sahifasidan ortga bosilganda student/home profilga o'tib ketmasin.
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => handler.remove();
  }, []);

  // ── Dastlabki yuklash ──
  const fetchUsers = async () => {
    setLoading(true);
    setIsFull(false);
    setLastVisible(null);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const list = snap.docs.map(mapUserDoc);
      setUsers(list);
      setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
      if (snap.docs.length < PAGE_SIZE) setIsFull(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Xato', 'Foydalanuvchilarni yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  // ── Ko'proq yuklash ──
  const fetchMoreUsers = useCallback(async () => {
    if (loadingMore || isFull || search.trim() || !lastVisible) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(mapUserDoc);
      setUsers(prev => [...prev, ...list]);
      setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
      if (snap.docs.length < PAGE_SIZE) setIsFull(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, isFull, search, lastVisible]);

  // ── Yangilash (pull-to-refresh) ──
  const handleRefresh = async () => {
    setRefreshing(true);
    setSearch('');
    await fetchUsers();
    setRefreshing(false);
  };

  // ── Qidiruv ──
  const displayedUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase().trim();
    return users.filter(u =>
      getUserName(u).toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (text === '') {
      fetchUsers();
      setIsFull(false);
    }
  };

  // ── Rol yangilash ──
  const updateRole = async (userId: string, newRole: AppRole) => {
    if (!EDITABLE_ROLES.includes(newRole)) return;

    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;

    const isMe = selectedUser.uid === currentAdminUid || selectedUser.id === currentAdminUid;
    const isSuperAdmin = selectedUser.role === 'super-admin';

    if (isMe) {
      Alert.alert('Xato', "O'zingizning rolingizni o'zgartira olmaysiz!");
      return;
    }

    if (isSuperAdmin) {
      Alert.alert('Xato', "Super admin roli o'zgarmaydi!");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      Alert.alert('Xato', 'Yangilashda xatolik yuz berdi');
    }
  };

  // ── O'chirish ──
  const deleteUser = (userId: string, name = "Foydalanuvchi") => {
    const selectedUser = users.find(u => u.id === userId);
    const isMe = selectedUser?.uid === currentAdminUid || selectedUser?.id === currentAdminUid;
    const isSuperAdmin = selectedUser?.role === 'super-admin';

    if (isMe) {
      return Alert.alert('Xato', "O'zingizni o'chira olmaysiz!");
    }

    if (isSuperAdmin) {
      return Alert.alert('Xato', "Super adminni o'chirib bo'lmaydi!");
    }

    Alert.alert(
      'DIQQAT',
      `${name}ni o'chirishni tasdiqlaysizmi?\n\nBu amalni bekor qilib bo'lmaydi.`,
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: "O'CHIRISH", style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', userId));
              setUsers(prev => prev.filter(u => u.id !== userId));
            } catch {
              Alert.alert('Xato', "O'chirishda xatolik yuz berdi");
            }
          },
        },
      ],
    );
  };


  // ── Chiqish ──
  const handleLogout = () => {
    Alert.alert('Chiqish', 'Super admin paneldan chiqishni istaysizmi?', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'Chiqish',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth.signOut();
            router.replace('/login');
          } catch (e) {
            console.error(e);
            Alert.alert('Xato', 'Tizimdan chiqishda xatolik yuz berdi');
          }
        },
      },
    ]);
  };

  // ── Stats ──
  const stats = useMemo(() => ({
    total: users.length,
    students: users.filter(u => u.role === 'student').length,
    users: users.filter(u => u.role === 'user').length,
    admins: users.filter(u => u.role === 'admin' || u.role === 'super-admin').length,
  }), [users]);

  // ── Footer ──
  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>Yuklanmoqda...</Text>
        </View>
      );
    }
    if (isFull && users.length > 0) {
      return (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ color: '#334155', fontSize: 12 }}>Barcha foydalanuvchilar yuklandi</Text>
        </View>
      );
    }
    return null;
  };

  // ── User card ──
  const renderUserCard = ({ item, index }: { item: AppUser; index: number }) => {
    const isMe = item.uid === currentAdminUid || item.id === currentAdminUid;
    const isSuperAdmin = item.role === 'super-admin';
    const color = ROLE_COLORS[item.role];
    const userName = getUserName(item);

    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index * 50, 300)).duration(400)}
        style={[s.card, isMe && { borderColor: '#6366F1', borderWidth: 2 }]}
      >
        {/* Header */}
        <View style={s.cardHeader}>
          <View style={[s.avatar, { backgroundColor: color }]}>
            <Text style={s.avatarText}>
              {(userName || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.userName} numberOfLines={1}>
                {userName}
              </Text>
              {isMe && (
                <View style={s.meBadge}>
                  <Text style={s.meBadgeTxt}>SIZ</Text>
                </View>
              )}
            </View>
            <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
            <View style={[s.rolePill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
              <Text style={[s.rolePillTxt, { color }]}>{ROLE_LABELS[item.role]}</Text>
            </View>
          </View>
          {!isMe && !isSuperAdmin && (
            <TouchableOpacity
              onPress={() => deleteUser(item.id, userName)}
              style={s.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={16} color="#F87171" />
            </TouchableOpacity>
          )}
        </View>

        {/* Rol boshqaruvi */}
        <View style={s.roleContainer}>
          <Text style={s.roleLabel}>ROLNI BOSHQARISH</Text>
          {isSuperAdmin ? (
            <View style={s.superBadge}>
              <Feather name="shield" size={13} color="#fff" />
              <Text style={s.superBadgeTxt}>SUPER ADMIN — O'ZGARMAS</Text>
            </View>
          ) : (
            <View style={s.btnRow}>
              {EDITABLE_ROLES.map(role => {
                const active = item.role === role;
                const roleColor = ROLE_COLORS[role];
                return (
                  <TouchableOpacity
                    key={role}
                    onPress={() => updateRole(item.id, role)}
                    disabled={isMe || active}
                    style={[
                      s.roleBtn,
                      { borderColor: roleColor },
                      active && { backgroundColor: roleColor },
                      (isMe || active) && { opacity: isMe ? 0.4 : 1 },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.roleBtnText, { color: active ? '#fff' : roleColor }]}>
                      {ROLE_LABELS[role]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          {/* Oldingi kodda bu tugma router.replace('/home') qilgani uchun student profilga o'tib ketardi.
              Endi navigatsiya yo'q: superadmin sahifasida qoladi. */}
          <View style={s.backButton}>
            <Feather name="shield" size={22} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>System Control</Text>
            <View style={s.statusRow}>
              <View style={s.onlineDot} />
              <Text style={s.onlineText}>Super Admin • {users.length} foydalanuvchi</Text>
            </View>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity onPress={handleRefresh} style={s.refreshBtn} disabled={refreshing}>
              <Feather name="refresh-cw" size={16} color={refreshing ? '#475569' : '#6366F1'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={s.logoutIconBtn}>
              <Feather name="log-out" size={16} color="#F87171" />
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View entering={FadeInRight.duration(700)} style={s.statsRow}>
          {[
            { icon: 'users', color: '#6366F1', value: stats.total, label: 'Jami' },
            { icon: 'user-check', color: '#10B981', value: stats.students, label: 'Talabalar' },
            { icon: 'user', color: '#F59E0B', value: stats.users, label: 'Foydalanuvchi' },
            { icon: 'shield', color: '#A855F7', value: stats.admins, label: 'Adminlar' },
          ].map(item => (
            <View key={item.label} style={s.statItem}>
              <Feather name={item.icon as any} size={15} color={item.color} />
              <Text style={[s.statValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.statTitle}>{item.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      {/* Qidiruv */}
      <View style={s.searchContainer}>
        <View style={s.searchBox}>
          <Feather name="search" size={16} color="#64748B" />
          <TextInput
            placeholder="Ism, email yoki rol bo'yicha qidirish..."
            placeholderTextColor="#475569"
            style={s.searchInput}
            value={search}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
        {search.trim() && (
          <Text style={s.searchResultTxt}>
            {displayedUsers.length} natija topildi
          </Text>
        )}
      </View>

      {/* Ro'yxat */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={{ color: '#475569', fontSize: 13 }}>Yuklanmoqda...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedUsers}
          keyExtractor={item => item.id}
          renderItem={renderUserCard}
          contentContainerStyle={{ padding: 18, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          onEndReached={fetchMoreUsers}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Feather name="users" size={44} color="#1E293B" />
              <Text style={s.emptyTitle}>
                {search.trim() ? 'Foydalanuvchi topilmadi' : 'Hech kim yo\'q'}
              </Text>
              <Text style={s.emptySubtxt}>
                {search.trim()
                  ? `"${search}" bo'yicha natija topilmadi`
                  : "Hali hech kim ro'yxatdan o'tmagan"}
              </Text>
            </View>
          }
        />
      )}

      <View style={s.bottomLogoutWrap}>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Feather name="log-out" size={17} color="#fff" />
          <Text style={s.logoutBtnText}>Chiqish</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },

  header: { backgroundColor: '#1E293B', paddingTop: 12, paddingBottom: 20, paddingHorizontal: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 12 },
  backButton: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: { width: 40, height: 40, backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  logoutIconBtn: { width: 40, height: 40, backgroundColor: 'rgba(248,113,113,0.12)', borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981', marginRight: 6 },
  onlineText: { color: '#64748B', fontSize: 11 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  statItem: { flex: 1, backgroundColor: '#0F172A', padding: 10, borderRadius: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1E293B' },
  statValue: { fontSize: 17, fontWeight: '900' },
  statTitle: { fontSize: 9, color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

  searchContainer: { paddingHorizontal: 18, marginTop: 16, gap: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', paddingHorizontal: 14, borderRadius: 16, height: 48, borderWidth: 1, borderColor: '#334155', gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  searchResultTxt: { color: '#475569', fontSize: 11, marginLeft: 4 },

  card: { backgroundColor: '#1E293B', borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  avatar: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  userName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  userEmail: { color: '#475569', fontSize: 12, marginTop: 2, marginBottom: 6 },
  meBadge: { backgroundColor: '#6366F1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  meBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  rolePillTxt: { fontSize: 10, fontWeight: '800' },
  deleteBtn: { padding: 9, backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: 12, marginLeft: 4 },

  roleContainer: { borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12 },
  roleLabel: { color: '#334155', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  roleBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1.5 },
  roleBtnText: { fontSize: 10, fontWeight: '800' },
  superBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#6366F1', padding: 10, borderRadius: 12 },
  superBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },

  bottomLogoutWrap: { paddingHorizontal: 18, paddingBottom: 14, paddingTop: 8, backgroundColor: '#0F172A' },
  logoutBtn: { height: 48, borderRadius: 16, backgroundColor: '#EF4444', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  logoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  emptyBox: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { color: '#475569', fontSize: 15, fontWeight: '700' },
  emptySubtxt: { color: '#334155', fontSize: 12, textAlign: 'center' },
});
