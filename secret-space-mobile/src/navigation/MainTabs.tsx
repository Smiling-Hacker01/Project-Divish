import React from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { GlassSurface } from '@/components/GlassSurface';
import { Text } from '@/components/Text';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { DiaryFeedScreen } from '@/screens/diary/DiaryFeedScreen';
import { CouponsListScreen } from '@/screens/coupons/CouponsListScreen';
import { LoveBotScreen } from '@/screens/lovebot/LoveBotScreen';
import { VaultStackNavigator } from './VaultStack';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Diary" component={DiaryFeedScreen} />
      <Tab.Screen name="Coupons" component={CouponsListScreen} />
      <Tab.Screen name="LoveBot" component={LoveBotScreen} />
      <Tab.Screen name="Vault" component={VaultStackNavigator} />
    </Tab.Navigator>
  );
}

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Diary: 'book-open',
  Coupons: 'tag',
  LoveBot: 'message-circle',
  Vault: 'lock',
};

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: Math.max(insets.bottom, 12) + 12,
          paddingHorizontal: theme.spacing.lg,
        },
      ]}
    >
      <GlassSurface radius={32} style={[styles.bar, { borderColor: theme.colors.hairlineStrong }]}>
        <View style={styles.row}>
          {/* Render the four side tabs in a flat row; the center button is overlaid absolutely. */}
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const isCenter = index === 2;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
            };

            if (isCenter) {
              // Empty spacer keeps the layout balanced — the actual button is in the absolute overlay below.
              return <View key={route.key} style={styles.tab} />;
            }

            return (
              <Pressable key={route.key} onPress={onPress} style={styles.tab}>
                <Feather
                  name={ICONS[route.name]}
                  size={22}
                  color={focused ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  variant="caption"
                  style={{
                    color: focused ? theme.colors.primary : theme.colors.muted,
                    marginTop: 2,
                    fontSize: 10,
                  }}
                >
                  {route.name === 'LoveBot' ? 'Bot' : route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>

      {/* Center button — absolutely positioned so it's always perfectly centered, regardless of how the
          surrounding tab labels wrap. Uses pointerEvents to stay tappable above the bar. */}
      <View pointerEvents="box-none" style={styles.centerOverlay}>
        <Pressable
          onPress={() => {
            const centerRoute = state.routes[2];
            if (!centerRoute) return;
            const event = navigation.emit({
              type: 'tabPress',
              target: centerRoute.key,
              canPreventDefault: true,
            });
            if (state.index !== 2 && !event.defaultPrevented) {
              navigation.navigate(centerRoute.name as never);
            }
          }}
        >
          <LinearGradient
            colors={theme.gradientStops as unknown as readonly [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.centerBtn, { borderColor: theme.colors.background }, theme.shadows.glow]}
          >
            <Feather name={ICONS[state.routes[2]?.name ?? 'Coupons']} size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CENTER_BTN_SIZE = 56;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'stretch' },
  bar: { height: 64 },
  row: { flexDirection: 'row', alignItems: 'center', height: '100%' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Pin to exact half of the screen so it can't drift when the wrap padding changes
  // or one tab label happens to be wider than the others.
  centerOverlay: {
    position: 'absolute',
    top: -16,
    left: SCREEN_WIDTH / 2 - CENTER_BTN_SIZE / 2,
    width: CENTER_BTN_SIZE,
    height: CENTER_BTN_SIZE,
  },
  centerBtn: {
    width: CENTER_BTN_SIZE,
    height: CENTER_BTN_SIZE,
    borderRadius: CENTER_BTN_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
