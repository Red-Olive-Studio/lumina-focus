// Lumina on the phone: the same app as the web build (hosted on GitHub Pages), in a WebView.
// The native side only does what a web page can't: read calendar feeds (no CORS here) and
// schedule notifications that fire while Lumina is closed.
import { useEffect, useRef } from 'react';
import { AppState, Linking, Platform, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

const SITE = 'https://red-olive-studio.github.io/lumina-focus/';

// While Lumina is open it shows its own alerts, so system banners only appear when it's in the background.
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const away = AppState.currentState !== 'active';
    return { shouldShowBanner: away, shouldShowList: away, shouldPlaySound: away, shouldSetBadge: false };
  },
});

async function schedule(items) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const { at, body } of items.slice(0, 60)) { // iOS keeps at most 64
    if (!(at > Date.now()) || typeof body !== 'string') continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Lumina', body: body.slice(0, 200) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'lumina' },
    });
  }
}

async function ics(url) {
  url = String(url).trim().replace(/^webcal:/i, 'https:');
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web link');
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.text()).slice(0, 5e6);
}

export default function App() {
  const web = useRef(null);
  const dark = useColorScheme() === 'dark';

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('lumina', { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
      await Notifications.requestPermissionsAsync();
    })().catch(() => {});
  }, []);

  const reply = (id, ok, value) => web.current?.injectJavaScript(`window.onNative && window.onNative(${JSON.stringify({ id, ok, value })});true;`);

  function onMessage(e) {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'schedule' && Array.isArray(m.items)) schedule(m.items).catch(() => {});
    if (m.type === 'ics') ics(m.url).then(v => reply(m.id, true, v), err => reply(m.id, false, String(err?.message || err)));
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: dark ? '#151412' : '#F7F5F0' }]} edges={['top', 'bottom']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <WebView
          ref={web}
          source={{ uri: SITE }}
          style={styles.web}
          onMessage={onMessage}
          originWhitelist={['https://*']}
          // links to other sites open in the phone's browser, not inside Lumina
          onShouldStartLoadWithRequest={r => { if (r.url.startsWith(SITE)) return true; Linking.openURL(r.url).catch(() => {}); return false; }}
          domStorageEnabled
          cacheEnabled
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, web: { backgroundColor: 'transparent' } });
