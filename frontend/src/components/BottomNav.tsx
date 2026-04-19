import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  LuClock3,
  LuPackage2,
  LuReceiptText,
  LuSettings2,
  LuShoppingCart,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import type { ReactNode } from "react";

export type SellerTab = "checkout" | "orders" | "stock" | "shift" | "options";

type NavItem = {
  id: SellerTab;
  label: string;
  icon: IconType;
};

const items: NavItem[] = [
  { id: "checkout", label: "Checkout", icon: LuShoppingCart },
  { id: "orders", label: "Orders", icon: LuReceiptText },
  { id: "stock", label: "My Stock", icon: LuPackage2 },
  { id: "shift", label: "Shift", icon: LuClock3 },
  { id: "options", label: "Settings", icon: LuSettings2 },
];

type BottomNavProps = {
  activeTab: SellerTab;
  onChange: (tab: SellerTab) => void;
  onReselect?: (tab: SellerTab) => void;
  topAccessory?: ReactNode;
};

export function BottomNav({ activeTab, onChange, onReselect, topAccessory }: BottomNavProps) {
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

      <HStack justify="space-between" align="center" spacing={1}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <VStack
              as="button"
              type="button"
              aria-label={`Open ${item.label} tab`}
              aria-current={isActive ? "page" : undefined}
              key={item.id}
              flex="1"
              spacing={1}
              color={isActive ? "brand.500" : "surface.400"}
              cursor="pointer"
              onClick={() => {
                if (isActive) {
                  onReselect?.(item.id);
                  return;
                }

                onChange(item.id);
              }}
              border={0}
              p={1}
              minH="54px"
              borderRadius="16px"
              bg="transparent"
              transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
              _active={{ transform: "scale(0.94)" }}
              position="relative"
            >
              <Box
                w="42px"
                h="32px"
                borderRadius="12px"
                display="grid"
                placeItems="center"
                color={isActive ? "brand.500" : "surface.500"}
                bg={isActive ? "rgba(74, 132, 244, 0.08)" : "transparent"}
                transition="all 0.2s ease"
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </Box>
              <Text
                fontSize="10px"
                letterSpacing="0.01em"
                lineHeight="1.2"
                fontWeight={isActive ? "800" : "600"}
                transition="all 0.2s ease"
              >
                {item.label}
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
            </VStack>
          );
        })}
      </HStack>
    </Box>
  );
}
