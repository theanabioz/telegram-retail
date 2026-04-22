import { Box, Button, HStack, Modal, ModalBody, ModalContent, ModalOverlay, Text, VStack } from "@chakra-ui/react";
import { LuArchiveRestore, LuBox, LuPackageMinus, LuPackagePlus, LuPower, LuTrash2 } from "react-icons/lu";

export type ConfirmActionModalState = {
  title: string;
  description: string;
  confirmLabel: string;
  icon?: "archive" | "delete" | "power" | "restore" | "restock" | "writeoff";
  tone?: "danger" | "primary";
  onConfirm: () => void;
};

type ConfirmActionModalProps = {
  action: ConfirmActionModalState | null;
  cancelLabel: string;
  onClose: () => void;
};

export function ConfirmActionModal({ action, cancelLabel, onClose }: ConfirmActionModalProps) {
  const isDanger = action?.tone === "danger";
  const Icon =
    action?.icon === "delete"
      ? LuTrash2
      : action?.icon === "archive"
        ? LuBox
        : action?.icon === "restore"
          ? LuArchiveRestore
          : action?.icon === "power"
            ? LuPower
            : action?.icon === "writeoff"
              ? LuPackageMinus
              : LuPackagePlus;

  return (
    <Modal isOpen={Boolean(action)} onClose={onClose} isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="rgba(14, 12, 10, 0.32)" />
      <ModalContent mx={5} borderRadius="30px" bg="rgba(255,255,255,0.96)" boxShadow="0 24px 60px rgba(18, 18, 18, 0.18)">
        <ModalBody px={5} py={5}>
          <VStack align="stretch" spacing={4}>
            <VStack align="start" spacing={2}>
              <Box
                w="42px"
                h="42px"
                borderRadius="16px"
                bg={isDanger ? "rgba(248,113,113,0.12)" : "rgba(74,132,244,0.12)"}
                color={isDanger ? "red.500" : "brand.500"}
                display="grid"
                placeItems="center"
                boxShadow={isDanger ? "0 10px 24px rgba(248,113,113,0.14)" : "0 10px 24px rgba(74,132,244,0.14)"}
              >
                <Box as={Icon} boxSize={5} strokeWidth={2.4} />
              </Box>
              <Text fontSize="xl" fontWeight="900" letterSpacing="-0.03em">
                {action?.title}
              </Text>
              <Text color="surface.500" fontSize="sm" fontWeight="700" lineHeight="1.45">
                {action?.description}
              </Text>
            </VStack>

            <HStack spacing={3}>
              <Button h="50px" flex="1" borderRadius="18px" bg="surface.100" color="surface.700" fontWeight="900" onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button
                h="50px"
                flex="1"
                borderRadius="18px"
                bg={isDanger ? "red.500" : "brand.500"}
                color="white"
                fontWeight="900"
                _hover={{ bg: isDanger ? "red.500" : "brand.500" }}
                onClick={() => {
                  const onConfirm = action?.onConfirm;
                  onClose();
                  onConfirm?.();
                }}
              >
                {action?.confirmLabel}
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
