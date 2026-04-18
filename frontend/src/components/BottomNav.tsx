import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  HiOutlineArchiveBox,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineShoppingCart,
  HiOutlineReceiptPercent,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type SellerTab = "checkout" | "orders" | "stock" | "shift" | "options";

type NavItem = {
  id: SellerTab;
  label: string;
  icon: IconType;
};

const items: NavItem[] = [
  { id: "checkout", label: "Checkout", icon: HiOutlineShoppingCart },
  { id: "orders", label: "Orders", icon: HiOutlineReceiptPercent },
  { id: "stock", label: "My Stock", icon: HiOutlineArchiveBox },
  { id: "shift", label: "Shift", icon: HiOutlineClock },
  { id: "options", label: "Options", icon: HiOutlineCog6Tooth },
];

type BottomNavProps = {
  activeTab: SellerTab;
  onChange: (tab: SellerTab) => void;
  hasAttachedBar?: boolean;
};

export function BottomNav({ activeTab, onChange, hasAttachedBar = false }: BottomNavProps) {
  return (
    <HStack
      as="nav"
      justify="space-between"
      align="stretch"
      bg="rgba(255, 255, 255, 0.98)"
      border="1px solid rgba(232, 229, 223, 0.96)"
      borderRadius="28px"
      px={2}
      pt={hasAttachedBar ? 3.5 : 2.5}
      pb="calc(10px + env(safe-area-inset-bottom, 0px))"
      boxShadow="0 10px 24px rgba(20, 20, 20, 0.08)"
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
            spacing={1}
            color={isActive ? "surface.900" : "surface.500"}
            fontWeight={isActive ? "900" : "750"}
            cursor="pointer"
            onClick={() => onChange(item.id)}
            border={0}
            px={1}
            py={1}
            minH="50px"
            borderRadius="16px"
            bg="transparent"
            transition="color 0.18s ease"
          >
            <Box
              w="26px"
              h="26px"
              display="grid"
              placeItems="center"
              color={isActive ? "brand.500" : "surface.500"}
            >
              <Box as={Icon} boxSize={5.5} strokeWidth={1.8} />
            </Box>
            <Text
              fontSize="10px"
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
  );
}
