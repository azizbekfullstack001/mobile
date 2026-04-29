import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');

interface FooterProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const FooterNav: React.FC<FooterProps> = ({ activeTab, setActiveTab }) => {
  
  const tabs = [
    { id: 'Home', icon: 'home', label: 'Home' },
    { id: 'My Courses', icon: 'play-circle', label: 'My Courses' },
    { id: 'Blogs', icon: 'book', label: 'Blogs' },
    { id: 'Profile', icon: 'person', label: 'My Profile' },
  ];

  return (
    <View style={styles.footerContainer}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity 
            key={tab.id} 
            style={styles.tabButton} 
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isActive ? (tab.icon as any) : (`${tab.icon}-outline` as any)} 
              size={24} 
              color={isActive ? '#6366F1' : '#94A3B8'} 
            />
            <Text style={[styles.tabLabel, { color: isActive ? '#6366F1' : '#94A3B8' }]}>
              {tab.label}
            </Text>
            {/* Aktiv tab uchun kichik nuqta (Indikator) */}
            {isActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: Platform.OS === 'ios' ? 90 : 75,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    // Shaffof soya (Shadow)
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: width / 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6366F1',
    marginTop: 4,
    position: 'absolute',
    bottom: -8,
  }
});

export default FooterNav;