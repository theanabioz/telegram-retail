import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

type AdminFormScreenProps = {
  title: string;
  description: string;
  topLabel?: string;
  progressLabel?: string;
  onClose: () => void;
  children: ReactNode;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  primaryActionLoading?: boolean;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  secondaryActionDisabled?: boolean;
  onSecondaryAction?: () => void;
};

export function AdminFormScreen({
  title,
  description,
  topLabel,
  progressLabel,
  onClose,
  children,
  primaryActionLabel,
  primaryActionDisabled,
  primaryActionLoading,
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionDisabled,
  onSecondaryAction,
}: AdminFormScreenProps) {
  return (
    <Box position="fixed" inset={0} zIndex={1450}>
      <Box
        position="absolute"
        inset={0}
        bg="rgba(248,247,244,0.78)"
        backdropFilter="blur(18px)"
        onClick={onClose}
      />
      <Box position="absolute" inset={0} onClick={(event) => event.stopPropagation()}>
        <Box
          w="100%"
          h="var(--app-stable-viewport-height, var(--app-viewport-height, 100vh))"
          maxH="100%"
          display="flex"
          flexDirection="column"
          bg="linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(248,247,244,0.985) 64%, rgba(243,241,236,0.99) 100%)"
          overscrollBehavior="contain"
        >
          <Box
            px={4}
            pt="calc(14px + var(--telegram-safe-area-top, 0px))"
            pb={4}
            borderBottom="1px solid rgba(226,224,218,0.82)"
            bg="rgba(255,255,255,0.78)"
            backdropFilter="blur(16px)"
          >
            <HStack justify="space-between" align="start" gap={3}>
              <VStack align="start" gap={1} minW={0}>
                {topLabel ? (
                  <Text
                    fontSize="10px"
                    color="surface.500"
                    textTransform="uppercase"
                    letterSpacing="0.12em"
                    fontWeight="900"
                  >
                    {topLabel}
                  </Text>
                ) : null}
                <Text fontWeight="900" fontSize="2xl" letterSpacing="-0.04em" lineHeight="1">
                  {title}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700" lineHeight="1.45">
                  {description}
                </Text>
                {progressLabel ? (
                  <Box
                    mt={2}
                    px={3}
                    py={1.5}
                    borderRadius="999px"
                    bg="rgba(241,240,236,0.92)"
                    color="surface.600"
                    fontSize="xs"
                    fontWeight="900"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                  >
                    {progressLabel}
                  </Box>
                ) : null}
              </VStack>

              <Button
                aria-label="Close form"
                minW="44px"
                h="44px"
                px={0}
                borderRadius="999px"
                bg="rgba(241,240,236,0.96)"
                color="surface.700"
                fontSize="24px"
                lineHeight="1"
                fontWeight="700"
                _hover={{ bg: "rgba(232,231,226,0.96)" }}
                onClick={onClose}
                flexShrink={0}
              >
                ×
              </Button>
            </HStack>
          </Box>

          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            px={4}
            py={4}
            pb="calc(136px + var(--app-keyboard-offset, 0px))"
            overscrollBehavior="contain"
            scrollPaddingTop="120px"
            scrollPaddingBottom="220px"
            css={{
              WebkitOverflowScrolling: "touch"
            }}
          >
            <VStack align="stretch" gap={4}>
              {children}
            </VStack>
          </Box>

          <Box
            px={4}
            pt={3}
            pb="calc(12px + env(safe-area-inset-bottom, 0px) + var(--app-keyboard-offset, 0px))"
            borderTop="1px solid rgba(223,224,227,0.9)"
            bg="rgba(250,251,252,0.88)"
            backdropFilter="blur(18px)"
            boxShadow="0 -16px 34px rgba(21,28,38,0.08)"
          >
            <HStack gap={3}>
              {secondaryActionLabel && onSecondaryAction ? (
                <Button
                  flex={secondaryActionLabel ? "0 0 120px" : undefined}
                  h="56px"
                  borderRadius="22px"
                  bg="rgba(234,236,240,0.98)"
                  color="surface.800"
                  fontWeight="900"
                  fontSize="md"
                  _hover={{ bg: "rgba(224,227,232,1)" }}
                  disabled={secondaryActionDisabled}
                  onClick={onSecondaryAction}
                >
                  {secondaryActionLabel}
                </Button>
              ) : null}
              <Button
                flex="1"
                h="56px"
                borderRadius="22px"
                bg="surface.900"
                color="white"
                fontWeight="900"
                fontSize="lg"
                _hover={{ bg: "surface.700" }}
                disabled={primaryActionDisabled}
                loading={primaryActionLoading}
                onClick={onPrimaryAction}
              >
                {primaryActionLabel}
              </Button>
            </HStack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
