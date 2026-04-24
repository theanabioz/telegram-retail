import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

type AdminTaskScreenProps = {
  title: string;
  description: string;
  onClose: () => void;
  primaryAction: ReactNode;
  children: ReactNode;
  inputPanel?: ReactNode;
  topLabel?: string;
};

export function AdminTaskScreen({
  title,
  description,
  onClose,
  primaryAction,
  children,
  inputPanel,
  topLabel,
}: AdminTaskScreenProps) {
  return (
    <Box position="fixed" inset={0} zIndex={1400}>
      <Box
        position="absolute"
        inset={0}
        bg="rgba(248, 247, 244, 0.74)"
        backdropFilter="blur(18px)"
        onClick={onClose}
      />
      <Box position="absolute" inset={0} onClick={(event) => event.stopPropagation()}>
        <Box
          w="100%"
          h="100%"
          bg="linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,247,244,0.98) 62%, rgba(241,239,234,0.98) 100%)"
          display="flex"
          flexDirection="column"
          overscrollBehavior="contain"
        >
          <Box
            px={4}
            pt="calc(14px + var(--telegram-safe-area-top, 0px))"
            pb={4}
            borderBottom="1px solid rgba(226,224,218,0.86)"
            bg="rgba(255,255,255,0.72)"
            backdropFilter="blur(14px)"
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
                <Text fontWeight="900" fontSize={{ base: "xl", sm: "2xl" }} letterSpacing="0" lineHeight="1.08" lineClamp={2}>
                  {title}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700" lineHeight="1.4">
                  {description}
                </Text>
              </VStack>

              <Button
                aria-label="Close task screen"
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
            display="flex"
            flexDirection="column"
            justifyContent={inputPanel ? "flex-end" : "flex-start"}
          >
            <VStack align="stretch" gap={4}>
              {children}
            </VStack>
          </Box>

          {inputPanel ? (
            <Box
              px={3}
              pt={3}
              pb="calc(8px + env(safe-area-inset-bottom, 0px))"
              bg="linear-gradient(180deg, rgba(224,228,235,0.96) 0%, rgba(208,213,221,0.98) 100%)"
              borderTop="1px solid rgba(193,198,207,0.92)"
              backdropFilter="blur(20px)"
              boxShadow="0 -18px 34px rgba(21,28,38,0.12)"
            >
              <VStack align="stretch" gap={3}>
                {primaryAction}
                {inputPanel}
              </VStack>
            </Box>
          ) : (
            <Box
              px={4}
              pt={3}
              pb="calc(12px + env(safe-area-inset-bottom, 0px))"
              borderTop="1px solid rgba(226,224,218,0.72)"
              bg="rgba(255,255,255,0.94)"
              backdropFilter="blur(12px)"
              boxShadow="0 -10px 28px rgba(18,18,18,0.05)"
            >
              {primaryAction}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
