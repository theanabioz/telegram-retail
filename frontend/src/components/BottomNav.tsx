import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  HiArchiveBox,
  HiClock,
  HiCog6Tooth,
  HiShoppingCart,
  HiReceiptPercent,
} from "react-icons/hi2";
import type { IconType } from "react-icons";
import type { ReactNode } from "react";

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
  topAccessory?: ReactNode;
};

export function BottomNav({ activeTab, onChange, topAccessory }: BottomNavProps) {
  return (
    <VStack
      as="nav"
      align="stretch"
      bg="rgba(255, 255, 255, 0.98)"
      border="1px solid rgba(232, 229, 223, 0.96)"
      borderRadius="24px"
      px={2}
      pt={topAccessory ? 2 : 1.5}
      pb="calc(7px + env(safe-area-inset-bottom, 0px))"
      boxShadow="0 12px 26px rgba(20, 20, 20, 0.07)"
      spacing={topAccessory ? 2 : 0}
    >
      {topAccessory ? (
        <Box px={0.5}>
          {topAccessory}
        </Box>
      ) : null}

      <HStack justify="space-between" align="stretch">
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
              spacing={0.5}
              color={isActive ? "surface.900" : "surface.500"}
              fontWeight={isActive ? "900" : "750"}
              cursor="pointer"
              onClick={() => onChange(item.id)}
              border={0}
              px={0.5}
              py={0.5}
              minH="40px"
              borderRadius="12px"
              bg="transparent"
              transition="all 0.18s ease"
            >
              <Box
                w="32px"
                h="32px"
                borderRadius="11px"
                display="grid"
                placeItems="center"
                color={isActive ? "brand.500" : "surface.500"}
                bg={isActive ? "rgba(82, 129, 236, 0.10)" : "transparent"}
              >
                <Icon size={20} />
              </Box>
              <Text
                fontSize="8px"
                letterSpacing="-0.02em"
                lineHeight="1"
                noOfLines={1}
                color={isActive ? "brand.500" : "surface.500"}
                fontWeight={isActive ? "800" : "700"}
              >
                {item.label}
              </Text>
            </VStack>
          );
        })}
      </HStack>
    </VStack>
  );
}
