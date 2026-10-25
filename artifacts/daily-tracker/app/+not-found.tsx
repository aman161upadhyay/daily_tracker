import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';

export default function NotFoundScreen() {
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Txt role="title1">This screen does not exist.</Txt>
        <Link href="/" style={styles.link}>
          <Txt role="callout" tone="green">
            Back to Today
          </Txt>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
