import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'
import { DEFAULT_UNIT_SYSTEM, UNIT_SYSTEMS, type UnitSystem } from '../settings/unitSystem'
import { loadUnitSystem, saveUnitSystem } from '../settings/unitSystemStorage'

/** DESIGN §13.1: scoring always uses metric internally; this is display-only. */
const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = {
  device: 'Device default',
  metric: 'Metric (°C, mm)',
  imperial: 'Imperial (°F, in)',
}

export default function SettingsScreen() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(DEFAULT_UNIT_SYSTEM)
  // Guards against the initial load resolving *after* the user has already
  // tapped an option — without this, a fast tap during the brief window
  // before loadUnitSystem resolves gets silently reverted back to whatever
  // was previously on disk once that stale read lands.
  const userSelectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadUnitSystem(AsyncStorage).then((stored) => {
      if (!cancelled && !userSelectedRef.current) setUnitSystem(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectUnitSystem = (next: UnitSystem) => {
    userSelectedRef.current = true
    setUnitSystem(next)
    void saveUnitSystem(AsyncStorage, next)
  }

  return (
    <Box className="flex-1 bg-background px-6 pt-16">
      <Heading size="xl">Settings</Heading>

      <Text className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Units
      </Text>
      <Text className="mt-1 text-muted-foreground">
        Scoring always uses metric internally — this only changes how numbers are displayed.
      </Text>

      <VStack space="sm" className="mt-4">
        {UNIT_SYSTEMS.map((option) => (
          <Button
            key={option}
            variant={option === unitSystem ? 'default' : 'outline'}
            className="justify-start"
            onPress={() => selectUnitSystem(option)}
          >
            <ButtonText>{UNIT_SYSTEM_LABELS[option]}</ButtonText>
          </Button>
        ))}
      </VStack>
    </Box>
  )
}
