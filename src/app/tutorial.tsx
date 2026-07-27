import Slider from '@react-native-community/slider'
import { useState } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import { BellCurve } from '../components/BellCurve'
import {
  SD_BOUNDS,
  TUTORIAL_CALL,
  confidenceInterval80,
  scoreTutorialForecast,
  type TutorialScore,
} from '../tutorial/tutorialCall'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

const SLIDER_MIN_COLOR = '#1E3A5F'
const SLIDER_MAX_COLOR = '#CBD5E1'

function verdictFor(skill: number): string {
  if (skill > 0.3) return 'Well beaten — that is a genuinely skilful forecast.'
  if (skill > 0) return 'You beat climatology. Modest, but real skill.'
  if (skill > -0.3) return 'Climatology edged you out. Try narrowing in on the right value.'
  return 'Climatology won comfortably — confident and wrong is the expensive combination.'
}

export default function TutorialScreen() {
  const { width } = useWindowDimensions()
  const [mean, setMean] = useState<number>(TUTORIAL_CALL.initialMean)
  const [sd, setSd] = useState<number>(TUTORIAL_CALL.initialSd)
  const [score, setScore] = useState<TutorialScore | null>(null)

  const chartWidth = width - 48
  const interval = confidenceInterval80(mean, sd)
  const { unit, axis, truth, climatology } = TUTORIAL_CALL

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 56 }}>
      <Box className="px-6 pt-16">
        <Heading size="xl">Tutorial Call</Heading>
        <Text className="mt-1 text-muted-foreground">{TUTORIAL_CALL.stationLabel}</Text>
        <Text className="mt-4 leading-6 text-foreground">
          {TUTORIAL_CALL.question}. State a whole distribution, not a single number: where you
          centre it, and how confident you are.
        </Text>

        <Box className="mt-6">
          <BellCurve
            mean={mean}
            sd={sd}
            axisMin={axis.min}
            axisMax={axis.max}
            width={chartWidth}
            height={180}
            {...(score !== null ? { truth } : {})}
          />
          <Box className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">
              {axis.min}
              {unit}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {axis.max}
              {unit}
            </Text>
          </Box>
        </Box>

        <Text className="mt-4 text-foreground">
          Centred on <Text className="font-semibold">{mean.toFixed(1)}{unit}</Text> — 80% confident
          it lands between {interval.low.toFixed(1)} and {interval.high.toFixed(1)}
          {unit}.
        </Text>

        <VStack space="sm" className="mt-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Centre
          </Text>
          <Slider
            value={mean}
            onValueChange={setMean}
            minimumValue={axis.min}
            maximumValue={axis.max}
            step={0.1}
            disabled={score !== null}
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
            disabled={score !== null}
            minimumTrackTintColor={SLIDER_MIN_COLOR}
            maximumTrackTintColor={SLIDER_MAX_COLOR}
          />
        </VStack>

        {score === null ? (
          <Button
            className="mt-8"
            onPress={() => setScore(scoreTutorialForecast(mean, sd, truth, climatology))}
          >
            <ButtonText>Commit forecast</ButtonText>
          </Button>
        ) : (
          <Box className="mt-8">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resolved
            </Text>
            <Heading size="lg" className="mt-1">
              It was {truth.toFixed(1)}
              {unit}
            </Heading>
            <Text className="mt-3 leading-6 text-foreground">{verdictFor(score.skill)}</Text>

            <VStack space="xs" className="mt-4">
              <Box className="flex-row justify-between">
                <Text className="text-muted-foreground">Your CRPS (lower is better)</Text>
                <Text className="text-foreground">{score.crps.toFixed(3)}</Text>
              </Box>
              <Box className="flex-row justify-between">
                <Text className="text-muted-foreground">Climatology&rsquo;s CRPS</Text>
                <Text className="text-foreground">{score.baselineCrps.toFixed(3)}</Text>
              </Box>
              <Box className="flex-row justify-between">
                <Text className="text-muted-foreground">Skill score</Text>
                <Text className="font-semibold text-foreground">{score.skill.toFixed(3)}</Text>
              </Box>
            </VStack>

            <Text className="mt-4 leading-6 text-muted-foreground">
              Skill is 1 for a perfect forecast, 0 for tying the baseline, and negative when the
              baseline wins. This is the same CRPS the real game scores you with.
            </Text>

            <Button
              variant="outline"
              className="mt-6"
              onPress={() => {
                setScore(null)
                setMean(TUTORIAL_CALL.initialMean)
                setSd(TUTORIAL_CALL.initialSd)
              }}
            >
              <ButtonText>Try again</ButtonText>
            </Button>
          </Box>
        )}
      </Box>
    </ScrollView>
  )
}
