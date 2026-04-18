import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  LuBoxes,
  LuLayoutDashboard,
  LuReceiptText,
  LuSettings2,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import type { IconType } from "react-icons";

export type AdminTab = "dashboard" | "sales" | "inventory" | "stores" | "staff" | "options";

type NavItem = {
  id: AdminTab;
  label: string;
  icon: IconType;
};

const items: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LuLayoutDashboard },
  { id: "sales", label: "Sales", icon: LuReceiptText },
  { id: "inventory", label: "Inventory", icon: LuBoxes },
  { id: "stores", label: "Stores", icon: LuStore },
  { id: "staff", label: "Staff", icon: LuUsers },
  { id: "options", label: "Options", icon: LuSettings2 },
];

type AdminNavProps = {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
};

export function AdminNav({ activeTab, onChange }: AdminNavProps) {
  return (
    <Box
      as="nav"
      bg="rgba(255, 255, 255, 0.98)"
      borderTop="1px solid rgba(232, 229, 223, 0.96)"
      borderTopRadius="30px"
      px={3}
      pt={2.5}
      pb="max(8px, env(safe-area-inset-bottom, 0px))"
      boxShadow="0 -8px 30px rgba(20, 20, 20, 0.08)"
    >
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
              minH="48px"
              borderRadius="12px"
              bg="transparent"
              transition="all 0.18s ease"
            >
              <Box
                w="38px"
                h="38px"
                borderRadius="14px"
                display="grid"
                placeItems="center"
                color={isActive ? "brand.500" : "surface.500"}
                bg={isActive ? "rgba(82, 129, 236, 0.10)" : "transparent"}
              >
                <Icon size={23} strokeWidth={2.2} />
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
    </Box>
  );
}
