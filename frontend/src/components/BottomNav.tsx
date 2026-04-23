import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  LuClock3,
  LuPackage2,
  LuReceiptText,
  LuSettings2,
  LuShoppingCart,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { useRef, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";

export type SellerTab = "checkout" | "orders" | "stock" | "shift" | "options";

type NavItem = {
  id: SellerTab;
  labelKey: "nav.checkout" | "nav.orders" | "nav.stock" | "nav.shift" | "nav.settings";
  icon: IconType;
};

const items: NavItem[] = [
  { id: "checkout", labelKey: "nav.checkout", icon: LuShoppingCart },
  { id: "orders", labelKey: "nav.orders", icon: LuReceiptText },
  { id: "stock", labelKey: "nav.stock", icon: LuPackage2 },
  { id: "shift", labelKey: "nav.shift", icon: LuClock3 },
  { id: "options", labelKey: "nav.settings", icon: LuSettings2 },
];

type BottomNavProps = {
  activeTab: SellerTab;
  onChange: (tab: SellerTab) => void;
  onReselect?: (tab: SellerTab) => void;
  topAccessory?: ReactNode;
};

export function BottomNav({ activeTab, onChange, onReselect, topAccessory }: BottomNavProps) {
  const pointerHandledTabRef = useRef<SellerTab | null>(null);
  const { t } = useI18n();

  const activateTab = (tab: SellerTab, isActive: boolean) => {
    if (isActive) {
      onReselect?.(tab);
      return;
    }

    onChange(tab);
  };

  return (
    <Box
      as="nav"
      position="relative"
      bg="rgba(255, 255, 255, 0.82)"
      backdropFilter="blur(20px) saturate(180%)"
      borderTop="1px solid rgba(255, 255, 255, 0.5)"
      px={4}
      pt={topAccessory ? 10 : 3}
      pb="max(12px, env(safe-area-inset-bottom, 12px))"
      boxShadow="0 -10px 40px rgba(0, 0, 0, 0.06)"
    >
      {topAccessory ? (
        <Box position="absolute" left={4} right={4} top="-42px">
          {topAccessory}
        </Box>
      ) : null}
      <HStack justify="space-between" align="center" gap={1}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const label = t(item.labelKey);

          return (
            <VStack
              aria-label={`Open ${label} tab`}
              aria-current={isActive ? "page" : undefined}
              flex="1"
              gap={1}
              color={isActive ? "brand.500" : "surface.400"}
              cursor="pointer"
              border={0}
              p={1}
              minH="54px"
              borderRadius="16px"
              bg="transparent"
              css={{
                WebkitTapHighlightColor: "transparent",
                appearance: "none",
                touchAction: "manipulation",
                userSelect: "none"
              }}
              transition="transform 180ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease"
              _active={{ bg: "transparent", boxShadow: "none", transform: "scale(0.965)" }}
              _focus={{ boxShadow: "none" }}
              _focusVisible={{ boxShadow: "none" }}
              position="relative"
              asChild><button
                  type="button"
                  key={item.id}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse" && event.button !== 0) {
                      return;
                    }

                    pointerHandledTabRef.current = item.id;
                    activateTab(item.id, isActive);
                  }}
                  onClick={() => {
                    if (pointerHandledTabRef.current === item.id) {
                      pointerHandledTabRef.current = null;
                      return;
                    }

                    activateTab(item.id, isActive);
                  }}>
                  <Box
                    w="42px"
                    h="32px"
                    borderRadius="12px"
                    display="grid"
                    placeItems="center"
                    color={isActive ? "brand.500" : "surface.500"}
                    bg={isActive ? "rgba(74, 132, 244, 0.08)" : "transparent"}
                    transition="background-color 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1)"
                    transform={isActive ? "translateY(-1px)" : "translateY(0)"}
                  >
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  </Box>
                  <Text
                    fontSize="10px"
                    letterSpacing="0.01em"
                    lineHeight="1.2"
                    fontWeight={isActive ? "800" : "600"}
                    transition="color 160ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1)"
                    transform={isActive ? "translateY(-0.5px)" : "translateY(0)"}
                  >
                    {label}
                  </Text>
                  {isActive && (
                    <Box
                      position="absolute"
                      bottom="-4px"
                      w="4px"
                      h="4px"
                      borderRadius="full"
                      bg="brand.500"
                    />
                  )}
                </button></VStack>
          );
        })}
      </HStack>
    </Box>
  );
}
