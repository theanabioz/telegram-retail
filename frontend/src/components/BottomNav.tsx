import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  HiArchiveBox,
  HiClock,
  HiCog6Tooth,
  HiShoppingCart,
  HiReceiptPercent,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type SellerTab = "checkout" | "orders" | "stock" | "shift" | "options";

type NavItem = {
  id: SellerTab;
  label: string;
  icon: IconType;
};

const items: NavItem[] = [
  { id: "checkout", label: "Checkout", icon: HiShoppingCart },
  { id: "orders", label: "Orders", icon: HiReceiptPercent },
  { id: "stock", label: "My Stock", icon: HiArchiveBox },
  { id: "shift", label: "Shift", icon: HiClock },
  { id: "options", label: "Options", icon: HiCog6Tooth },
];

type BottomNavProps = {
  activeTab: SellerTab;
  onChange: (tab: SellerTab) => void;
};

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <HStack
      as="nav"
      justify="space-between"
      align="stretch"
      bg="rgba(255, 255, 255, 0.94)"
      backdropFilter="blur(24px)"
      borderTop="1px solid rgba(226, 224, 218, 0.9)"
      borderRadius="28px 28px 0 0"
      px={2}
      pt={2}
      pb="calc(12px + env(safe-area-inset-bottom, 0px))"
      boxShadow="0 -16px 36px rgba(20, 20, 20, 0.07)"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <VStack
            as="button"
            type="button"
            aria-label={`Open ${item.label} tab`}
            aria-current={isActive ? "page" : undefined}
            key={item.label}
            flex="1"
            spacing={1.5}
            color={isActive ? "brand.600" : "surface.500"}
            fontWeight={isActive ? "800" : "700"}
            cursor="pointer"
            onClick={() => onChange(item.id)}
            border={0}
            px={1.5}
            py={2}
            borderRadius="20px"
            bg={isActive ? "rgba(238, 245, 255, 0.95)" : "transparent"}
            transition="all 0.18s ease"
          >
            <Box
              w="44px"
              h="44px"
              borderRadius="15px"
              display="grid"
              placeItems="center"
              bg={isActive ? "white" : "rgba(241, 240, 236, 0.95)"}
              boxShadow={
                isActive
                  ? "0 8px 20px rgba(74, 132, 244, 0.18)"
                  : "inset 0 0 0 1px rgba(226, 224, 218, 0.9)"
              }
            >
              <Box as={Icon} boxSize={7} />
            </Box>
            <Text fontSize="11px" letterSpacing="-0.01em" lineHeight="1">
              {item.label}
            </Text>
          </VStack>
        );
      })}
    </HStack>
  );
}
