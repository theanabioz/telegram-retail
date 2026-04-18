import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  HiBuildingStorefront,
  HiChartBarSquare,
  HiOutlineReceiptPercent,
  HiOutlineUsers,
  HiSquares2X2,
  HiWrenchScrewdriver,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AdminTab = "dashboard" | "sales" | "inventory" | "stores" | "staff" | "options";

type NavItem = {
  id: AdminTab;
  label: string;
  icon: IconType;
};

const items: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: HiChartBarSquare },
  { id: "sales", label: "Sales", icon: HiOutlineReceiptPercent },
  { id: "inventory", label: "Inventory", icon: HiSquares2X2 },
  { id: "stores", label: "Stores", icon: HiBuildingStorefront },
  { id: "staff", label: "Staff", icon: HiOutlineUsers },
  { id: "options", label: "Options", icon: HiWrenchScrewdriver },
];

type AdminNavProps = {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
};

export function AdminNav({ activeTab, onChange }: AdminNavProps) {
  return (
    <HStack
      as="nav"
      justify="space-between"
      align="stretch"
      bg="rgba(255, 255, 255, 0.98)"
      border="1px solid rgba(232, 229, 223, 0.96)"
      borderRadius="26px"
      px={2}
      pt={2}
      pb="calc(8px + env(safe-area-inset-bottom, 0px))"
      boxShadow="0 10px 22px rgba(20, 20, 20, 0.07)"
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
            py={0.5}
            minH="44px"
            borderRadius="14px"
            bg="transparent"
            transition="all 0.18s ease"
          >
            <Box
              w="30px"
              h="30px"
              borderRadius="12px"
              display="grid"
              placeItems="center"
              color={isActive ? "brand.500" : "surface.500"}
              bg={isActive ? "rgba(82, 129, 236, 0.10)" : "transparent"}
            >
              <Box as={Icon} boxSize={5} />
            </Box>
            <Text
              fontSize="9px"
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
