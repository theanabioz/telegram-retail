import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import {
  LuBoxes,
  LuLayoutDashboard,
  LuReceiptText,
  LuSettings2,
  LuUsers,
} from "react-icons/lu";
import { useRef } from "react";
import type { IconType } from "react-icons";
import { useI18n } from "../lib/i18n";

export type AdminTab = "overview" | "sales" | "inventory" | "team" | "settings";

type NavItem = {
  id: AdminTab;
  labelKey: "nav.overview" | "nav.sales" | "nav.inventory" | "nav.team" | "nav.settings";
  icon: IconType;
};

const items: NavItem[] = [
  { id: "overview", labelKey: "nav.overview", icon: LuLayoutDashboard },
  { id: "sales", labelKey: "nav.sales", icon: LuReceiptText },
  { id: "inventory", labelKey: "nav.inventory", icon: LuBoxes },
  { id: "team", labelKey: "nav.team", icon: LuUsers },
  { id: "settings", labelKey: "nav.settings", icon: LuSettings2 },
];

type AdminNavProps = {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
  onReselect?: (tab: AdminTab) => void;
};

export function AdminNav({ activeTab, onChange, onReselect }: AdminNavProps) {
  const pointerHandledTabRef = useRef<AdminTab | null>(null);
  const { t } = useI18n();

  const activateTab = (tab: AdminTab, isActive: boolean) => {
    if (isActive) {
      onReselect?.(tab);
      return;
    }

    onChange(tab);
  };

  return (
    <Box
      as="nav"
      bg="rgba(255, 255, 255, 0.98)"
      borderTop="1px solid rgba(232, 229, 223, 0.96)"
      borderTopRadius="0"
      px={3}
      pt={2.5}
      pb="max(8px, env(safe-area-inset-bottom, 0px))"
      boxShadow="0 -8px 30px rgba(20, 20, 20, 0.08)"
    >
      <HStack justify="space-between" align="stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const label = t(item.labelKey);

          return (
            <VStack
              as="button"
              type="button"
              aria-label={`Open ${label} tab`}
              aria-current={isActive ? "page" : undefined}
              key={item.id}
              flex="1"
              spacing={0.5}
              color={isActive ? "surface.900" : "surface.500"}
              fontWeight={isActive ? "900" : "750"}
              cursor="pointer"
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
              }}
              border={0}
              px={0.5}
              py={0.5}
              minH="48px"
              borderRadius="12px"
              bg="transparent"
              _active={{ bg: "transparent", boxShadow: "none" }}
              _focus={{ boxShadow: "none" }}
              _focusVisible={{ boxShadow: "none" }}
              sx={{
                WebkitTapHighlightColor: "transparent",
                appearance: "none",
                touchAction: "manipulation",
                userSelect: "none",
              }}
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
                {label}
              </Text>
            </VStack>
          );
        })}
      </HStack>
    </Box>
  );
}
