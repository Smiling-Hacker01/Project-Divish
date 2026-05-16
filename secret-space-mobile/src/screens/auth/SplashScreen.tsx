import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, Text, Button, BrandMark } from '@/components';
import { useTheme } from '@/theme';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const theme = useTheme();
  return (
    <ScreenContainer glowCorner="top-left" edges={['top', 'bottom']}>
      <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
        <View style={styles.heroBlock}>
          <BrandMark size={104} />
          <Text variant="display" align="center" style={{ marginTop: 24 }}>
            The Secret Space
          </Text>
          <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
            A private place for two.
          </Text>
        </View>

        <View style={styles.ctas}>
          <Button
            label="Create our space"
            fullWidth
            onPress={() => navigation.navigate('SignUp')}
            trailingIcon="arrow-right"
          />
          <Button
            label="Join with a code"
            variant="secondary"
            fullWidth
            style={{ marginTop: 12 }}
            onPress={() => navigation.navigate('JoinCode')}
          />
          <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 24, alignSelf: 'center' }}>
            <Text variant="bodySmall" color="muted">
              Already have an account?{' '}
              <Text variant="bodySmall" color="primary" weight="semibold">
                Sign in
              </Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', paddingVertical: 48 },
  heroBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ctas: { paddingBottom: 24 },
});
