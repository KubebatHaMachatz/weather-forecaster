import { Box } from './ui/box'
import { Heading } from './ui/heading'
import { Text } from './ui/text'

interface PlaceholderScreenProps {
  readonly title: string
  readonly note: string
}

/** Stands in for a screen not yet built — scaffolding only, not a real UI. */
export function PlaceholderScreen({ title, note }: PlaceholderScreenProps) {
  return (
    <Box className="flex-1 bg-background px-6 pt-24 gap-3">
      <Heading size="xl">{title}</Heading>
      <Text className="text-muted-foreground leading-6">{note}</Text>
    </Box>
  )
}
