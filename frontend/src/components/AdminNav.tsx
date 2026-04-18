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
      bg="rgba(255, 255, 255, 0.9)"
      backdropFilter="blur(22px)"
      border="1px solid rgba(226, 224, 218, 0.86)"
      borderRadius="26px"
      px={2}
      pt={2}
      pb="calc(8px + env(safe-area-inset-bottom, 0px))"
      boxShadow="0 18px 46px rgba(20, 20, 20, 0.12)"
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
            py={1.5}
            minH="54px"
            borderRadius="18px"
            bg="transparent"
            transition="all 0.18s ease"
          >
            <Box
              w="36px"
              h="36px"
              borderRadius="15px"
              display="grid"
              placeItems="center"
              bg={isActive ? "surface.900" : "transparent"}
              color={isActive ? "white" : "surface.600"}
              boxShadow={isActive ? "0 10px 24px rgba(22, 22, 22, 0.18)" : "none"}
            >
              <Box as={Icon} boxSize={6} />
            </Box>
            <Text fontSize="10px" letterSpacing="-0.02em" lineHeight="1" noOfLines={1}>
              {item.label}
            </Text>
          </VStack>
        );
      })}
    </HStack>
  );
}
