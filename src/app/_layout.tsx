import { Stack } from 'expo-router'
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider'
import '../global.css'

export default function RootLayout() {
  return (
    <GluestackUIProvider mode="system">
      <Stack
        screenOptions={{
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Ensemble' }} />
        <Stack.Screen name="chart" options={{ title: 'The Chart' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="tutorial" options={{ title: 'Tutorial Call' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="attribution" options={{ title: 'Data & Attribution' }} />
      </Stack>
    </GluestackUIProvider>
  )
}
