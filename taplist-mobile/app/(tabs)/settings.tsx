import { ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>About</Text>
      <Text style={styles.body}>
        Placeholder: add compliance copy (zh + en) per docs/no_menu_taplist_adr.md ADR-018.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  body: { lineHeight: 22, opacity: 0.85 },
})
