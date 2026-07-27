import AsyncStorage from '@react-native-async-storage/async-storage'
import Slider from '@react-native-community/slider'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native'
import { BellCurve } from '../components/BellCurve'
import { ProbabilityDial } from '../components/ProbabilityDial'
import { loadCallHistory, recordCall, type CallHistoryEntry } from '../history/callHistory'
import { answerFormFor, commitmentFor, describeForecast, type StatedForecast } from '../history/commitment'
import { createTrustedClock } from '../api/trustedClock'
import { confidenceInterval80 } from '../tutorial/tutorialCall'
import { useTodaysCall } from '../hooks/useTodaysCall'
import type { Call } from '../puzzle/daily'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

const SLIDER_MIN_COLOR = '#1E3A5F'
const SLIDER_MAX_COLOR = '#CBD5E1'

/** Wide enough for any station on Earth, at the resolution a slider can express. */
const TEMPERATURE_AXIS = { min: -40, max: 50 }
const SD_BOUNDS = { min: 0.5, max: 10 }

const QUESTION_TEXT: Record<Call['questionType'], (call: Call) => string> = {
  'point-temperature': (call) =>
    `What will the temperature be at ${String(call.targetHourLocal ?? 15).padStart(2, '0')}:00 local?`,
  'daily-extreme': () => 'What will tomorrow’s maximum temperature be?',
  precipitation: () => 'Will at least 0.2 mm of rain fall tomorrow?',
  'gust-exceedance': () => 'Will gusts exceed 40 km/h tomorrow?',
}

export default function CallScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const state = useTodaysCall()

  const [history, setHistory] = useState<CallHistoryEntry[] | null>(null)
  const [mean, setMean] = useState(10)
  const [sd, setSd] = useState(4)
  const [probability, setProbability] = useState(0.5)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadCallHistory(AsyncStorage).then((loaded) => {
      if (!cancelled) setHistory(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading' || history === null) {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </Box>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <Box className="flex-1 bg-background px-6 pt-16">
        <Heading size="xl">No Call available</Heading>
        <Text className="mt-3 leading-6 text-muted-foreground">
          Ensemble takes the date from Open-Meteo rather than your device, so everyone gets the
          same Call. That needs a connection.
        </Text>
      </Box>
    )
  }

  const { call, date } = state
  const existing = commitmentFor(history, date)
  const answerForm = answerFormFor(call.questionType)
  const chartWidth = width - 48

  /**
   * DESIGN §10: a committed answer "cannot be edited". Once today is
   * called, this screen becomes a read-only record of what was stated —
   * there is deliberately no path back to the controls.
   */
  if (existing?.forecast !== undefined) {
    return (
      <Box className="flex-1 bg-background px-6 pt-16">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Committed
        </Text>
        <Heading size="xl" className="mt-1">
          {call.stationLabel}
        </Heading>
        <Text className="mt-3 leading-6 text-foreground">
          {QUESTION_TEXT[call.questionType](call)}
        </Text>
        <Text className="mt-4 text-lg font-semibold text-foreground">
          {describeForecast(existing.forecast, answerForm === 'distribution' ? '°C' : '')}
        </Text>
        <Text className="mt-4 leading-6 text-muted-foreground">
          Your answer is locked in. It resolves once {call.targetDate} has passed at the station,
          and the score appears in History.
        </Text>
        <Button variant="outline" className="mt-8 self-start" onPress={() => router.back()}>
          <ButtonText>Back</ButtonText>
        </Button>
      </Box>
    )
  }

  const forecast: StatedForecast =
    answerForm === 'distribution' ? { kind: 'distribution', mean, sd } : { kind: 'probability', probability }

  const commit = async () => {
    setCommitting(true)
    // The commit timestamp must be the TRUSTED one (DESIGN §10), and it may
    // legitimately be unknown offline — better to record the commitment
    // without a timestamp than to stamp it with a clock the player controls.
    const committedAt = (await createTrustedClock(AsyncStorage).now())?.getTime()
    await recordCall(AsyncStorage, {
      date,
      stationLabel: call.stationLabel,
      questionType: call.questionType,
      forecast,
      ...(committedAt !== undefined ? { committedAt } : {}),
    })
    setHistory(await loadCallHistory(AsyncStorage))
    setCommitting(false)
  }

  const interval = confidenceInterval80(mean, sd)

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 56 }}>
      <Box className="px-6 pt-16">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&rsquo;s Call
        </Text>
        <Heading size="xl" className="mt-1">
          {call.stationLabel}
        </Heading>
        <Text className="mt-3 leading-6 text-foreground">
          {QUESTION_TEXT[call.questionType](call)}
        </Text>
        <Text className="mt-1 text-muted-foreground">Resolves for {call.targetDate}.</Text>

        {answerForm === 'distribution' ? (
          <>
            <Box className="mt-6">
              <BellCurve
                mean={mean}
                sd={sd}
                axisMin={TEMPERATURE_AXIS.min}
                axisMax={TEMPERATURE_AXIS.max}
                width={chartWidth}
                height={160}
              />
              <Box className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">{TEMPERATURE_AXIS.min}°C</Text>
                <Text className="text-xs text-muted-foreground">{TEMPERATURE_AXIS.max}°C</Text>
              </Box>
            </Box>
            <Text className="mt-4 text-foreground">
              Centred on <Text className="font-semibold">{mean.toFixed(1)}°C</Text> — 80% confident
              between {interval.low.toFixed(1)} and {interval.high.toFixed(1)}°C.
            </Text>
            <VStack space="sm" className="mt-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Centre
              </Text>
              <Slider
                value={mean}
                onValueChange={setMean}
                minimumValue={TEMPERATURE_AXIS.min}
                maximumValue={TEMPERATURE_AXIS.max}
                step={0.1}
                minimumTrackTintColor={SLIDER_MIN_COLOR}
                maximumTrackTintColor={SLIDER_MAX_COLOR}
              />
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confidence (narrower = riskier)
              </Text>
              <Slider
                value={sd}
                onValueChange={setSd}
                minimumValue={SD_BOUNDS.min}
                maximumValue={SD_BOUNDS.max}
                step={0.1}
                minimumTrackTintColor={SLIDER_MIN_COLOR}
                maximumTrackTintColor={SLIDER_MAX_COLOR}
              />
            </VStack>
          </>
        ) : (
          <>
            <Box className="mt-6 items-center">
              <ProbabilityDial probability={probability} size={chartWidth} />
            </Box>
            <Text className="mt-4 text-center text-2xl font-semibold text-foreground">
              {Math.round(probability * 100)}%
            </Text>
            <Text className="mt-1 text-center text-muted-foreground">
              50% is always allowed and always scores zero — honest ignorance is free.
            </Text>
            <Slider
              value={probability}
              onValueChange={setProbability}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              minimumTrackTintColor={SLIDER_MIN_COLOR}
              maximumTrackTintColor={SLIDER_MAX_COLOR}
              style={{ marginTop: 16 }}
            />
          </>
        )}

        <Button className="mt-8" isDisabled={committing} onPress={() => void commit()}>
          <ButtonText>{committing ? 'Committing…' : 'Commit — this cannot be undone'}</ButtonText>
        </Button>
      </Box>
    </ScrollView>
  )
}
