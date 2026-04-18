import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArchiveBox,
  HiOutlineMagnifyingGlass,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlinePower,
  HiOutlineTrash,
  HiOutlineWifi,
} from "react-icons/hi2";
import { LuClock3, LuShoppingCart } from "react-icons/lu";
import { BottomNav, type SellerTab } from "../components/BottomNav";
import { ProductCard } from "../components/ProductCard";
import { useSellerHomeStore } from "../store/useSellerHomeStore";
import type { DraftResponse } from "../types/seller";

type SellerHomeScreenProps = {
  currentPanel: "admin" | "seller";
  onSwitchPanel: (panel: "admin" | "seller") => Promise<void>;
};

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

const panelSurface = "rgba(255,255,255,0.88)";
const panelShadow = "0 18px 36px rgba(18, 18, 18, 0.06)";
const panelRadius = "24px";
const innerSurface = "rgba(241,240,236,0.82)";
const bottomDockReservedSpace = "calc(96px + env(safe-area-inset-bottom, 0px))";
const bottomDockWithCartReservedSpace = "calc(148px + env(safe-area-inset-bottom, 0px))";

export function SellerHomeScreen({ currentPanel, onSwitchPanel }: SellerHomeScreenProps) {
  const {
    actionLoading,
    addToDraft,
    bootstrap,
    checkout,
    draft,
    error,
    inventoryHistory,
    loadShiftHistory,
    loading,
    localIpLabel,
    mode,
    operatorName,
    pauseShift,
    products,
    removeDraftItem,
    restockProduct,
    resumeShift,
    sales,
    shiftActive,
    shiftHistory,
    shiftHistoryPagination,
    shiftStatus,
    shiftSummary,
    startShift,
    stopShift,
    storeName,
    updateDraftItem,
    writeoffProduct,
  } = useSellerHomeStore();

  const [activeTab, setActiveTab] = useState<SellerTab>("checkout");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockEdits, setStockEdits] = useState<Record<string, { quantity: string; reason: string }>>({});
  const [discountEdits, setDiscountEdits] = useState<Record<string, { type: "amount" | "percent"; value: string }>>({});
  const [discountModalItemId, setDiscountModalItemId] = useState<string | null>(null);
  const [isDraftCartOpen, setIsDraftCartOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [showFullShiftHistory, setShowFullShiftHistory] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!draft?.items.length && isDraftCartOpen) {
      setIsDraftCartOpen(false);
    }
  }, [draft?.items.length, isDraftCartOpen]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return products;
    }

    return products.filter((item) => item.name.toLowerCase().includes(query));
  }, [products, searchQuery]);

  const discountModalItem = discountModalItemId
    ? draft?.items.find((item) => item.id === discountModalItemId) ?? null
    : null;

  const shiftLabel =
    shiftStatus === "active"
      ? "Shift Active"
      : shiftStatus === "paused"
        ? "Shift Paused"
        : "Shift Not Started";

  const getStockDraft = (productId: string) =>
    stockEdits[productId] ?? {
      quantity: "1",
      reason: "",
    };

  const updateStockDraft = (productId: string, updates: Partial<{ quantity: string; reason: string }>) => {
    const current = getStockDraft(productId);
    setStockEdits((drafts) => ({
      ...drafts,
      [productId]: {
        ...current,
        ...updates,
      },
    }));
  };

  const runStockOperation = (productId: string, operation: "restock" | "writeoff") => {
    const draft = getStockDraft(productId);
    const quantity = Number(draft.quantity);
    const defaultReason = operation === "restock" ? "Manual Restock" : "Manual Write-off";

    if (!Number.isFinite(quantity) || quantity <= 0) {
      window.alert("Select a quantity greater than 0.");
      return;
    }

    const label = operation === "restock" ? "restock" : "write off";
    if (!window.confirm(`Confirm ${label} of ${quantity} unit(s)?`)) {
      return;
    }

    if (operation === "restock") {
      void restockProduct(productId, quantity, defaultReason);
    } else {
      void writeoffProduct(productId, quantity, defaultReason);
    }

    updateStockDraft(productId, { quantity: "1" });
  };

  const getDiscountDraft = (item: DraftResponse["items"][number]) =>
    discountEdits[item.id] ?? {
      type: item.discount_type ?? "amount",
      value: item.discount_value == null ? "" : String(item.discount_value),
    };

  const updateDiscountDraft = (
    itemId: string,
    updates: Partial<{ type: "amount" | "percent"; value: string }>
  ) => {
    const item = draft?.items.find((draftItem) => draftItem.id === itemId);
    const base = {
      type: item?.discount_type ?? "amount",
      value: item?.discount_value == null ? "" : String(item.discount_value),
    };

    setDiscountEdits((current) => ({
      ...current,
      [itemId]: { ...base, ...current[itemId], ...updates },
    }));
  };

  const openDiscountModal = (item: DraftResponse["items"][number]) => {
    setDiscountEdits((current) => ({
      ...current,
      [item.id]: current[item.id] ?? {
        type: item.discount_type ?? "amount",
        value: item.discount_value == null ? "" : String(item.discount_value),
      },
    }));
    setDiscountModalItemId(item.id);
  };

  const pressDiscountKey = (item: DraftResponse["items"][number], key: string) => {
    const discountDraft = getDiscountDraft(item);

    if (key === "backspace") {
      updateDiscountDraft(item.id, { value: discountDraft.value.slice(0, -1) });
      return;
    }

    if (key === "clear") {
      updateDiscountDraft(item.id, { value: "" });
      return;
    }

    if (key === "." && discountDraft.value.includes(".")) {
      return;
    }

    const nextValue = key === "." && !discountDraft.value ? "0." : `${discountDraft.value}${key}`;
    const normalizedValue = nextValue.startsWith("00") && !nextValue.startsWith("0.") ? nextValue.replace(/^0+/, "0") : nextValue;

    if (normalizedValue.length <= 8) {
      updateDiscountDraft(item.id, { value: normalizedValue });
    }
  };

  const applyDiscount = (item: DraftResponse["items"][number]) => {
    const discountDraft = getDiscountDraft(item);
    const rawValue = discountDraft.value.trim();

    if (!rawValue) {
      void updateDraftItem(item.id, {
        quantity: item.quantity,
        discountType: null,
        discountValue: null,
      });
      return;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value < 0) {
      window.alert("Enter a valid discount.");
      return;
    }

    if (discountDraft.type === "percent" && value > 100) {
      window.alert("Percent discount cannot be more than 100%.");
      return;
    }

    if (discountDraft.type === "amount" && value > item.base_price) {
      window.alert("Amount discount cannot be more than the unit price.");
      return;
    }

    void updateDraftItem(item.id, {
      quantity: item.quantity,
      discountType: discountDraft.type,
      discountValue: value,
    });
    setDiscountModalItemId(null);
  };

  const clearDiscount = (item: DraftResponse["items"][number]) => {
    setDiscountEdits((current) => ({
      ...current,
      [item.id]: {
        type: item.discount_type ?? "amount",
        value: "",
      },
    }));

    void updateDraftItem(item.id, {
      quantity: item.quantity,
      discountType: null,
      discountValue: null,
    });
    setDiscountModalItemId(null);
  };

  const renderDiscountModal = () => {
    if (!discountModalItem) {
      return null;
    }

    const discountDraft = getDiscountDraft(discountModalItem);
    const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];
    const previewValue = Number(discountDraft.value || 0);
    const previewFinalPrice =
      discountDraft.type === "percent"
        ? Math.max(0, discountModalItem.base_price * (1 - previewValue / 100))
        : Math.max(0, discountModalItem.base_price - previewValue);

    return (
      <Modal
        isOpen={Boolean(discountModalItem)}
        onClose={() => setDiscountModalItemId(null)}
        motionPreset="slideInBottom"
        isCentered={false}
      >
        <ModalOverlay bg="rgba(14, 12, 10, 0.3)" />
        <ModalContent
          mx={3}
          mt="auto"
          mb={4}
          borderRadius="32px"
          bg="white"
          boxShadow="0 28px 80px rgba(0,0,0,0.22)"
          overflow="hidden"
          pb={2}
        >
          <ModalHeader px={6} pt={6} pb={2}>
            <VStack align="start" spacing={1}>
              <Text fontSize="11px" color="brand.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase">
                Adjustment
              </Text>
              <Text fontSize="xl" fontWeight="900" noOfLines={1} letterSpacing="-0.01em">
                {discountModalItem.product_name_snapshot}
              </Text>
            </VStack>
          </ModalHeader>
          <ModalCloseButton top={6} right={6} borderRadius="full" bg="surface.50" />
          <ModalBody px={6} pb={6}>
            <VStack align="stretch" spacing={5}>
              <HStack spacing={2} bg="surface.50" borderRadius="20px" p={1.5}>
                {(["amount", "percent"] as const).map((type) => {
                  const isSelected = discountDraft.type === type;

                  return (
                    <Button
                      key={type}
                      flex="1"
                      h="44px"
                      borderRadius="16px"
                      bg={isSelected ? "white" : "transparent"}
                      color={isSelected ? "brand.500" : "surface.500"}
                      boxShadow={isSelected ? "0 4px 12px rgba(0,0,0,0.06)" : "none"}
                      _hover={{ bg: isSelected ? "white" : "rgba(255,255,255,0.4)" }}
                      onClick={() => updateDiscountDraft(discountModalItem.id, { type })}
                      fontSize="sm"
                      fontWeight="800"
                    >
                      {type === "amount" ? "Fixed EUR" : "Percent %"}
                    </Button>
                  );
                })}
              </HStack>

              <Box bg="surface.900" borderRadius="24px" px={5} py={4} color="white">
                <HStack justify="space-between" align="center">
                  <VStack align="start" spacing={0}>
                    <Text fontSize="10px" color="rgba(255,255,255,0.6)" fontWeight="800" textTransform="uppercase" letterSpacing="0.04em">
                      Discount Value
                    </Text>
                    <Text fontSize="3xl" fontWeight="900" letterSpacing="-0.02em">
                      {discountDraft.value || "0"}
                      <Box as="span" fontSize="lg" color="rgba(255,255,255,0.4)" ml={2} fontWeight="700">
                        {discountDraft.type === "amount" ? "EUR" : "%"}
                      </Box>
                    </Text>
                  </VStack>
                  <VStack align="end" spacing={0}>
                    <Text fontSize="10px" color="rgba(255,255,255,0.6)" fontWeight="800" textTransform="uppercase" letterSpacing="0.04em">
                      Final Price
                    </Text>
                    <Text fontSize="xl" fontWeight="900">EUR {previewFinalPrice.toFixed(2)}</Text>
                  </VStack>
                </HStack>
              </Box>

              <SimpleGrid columns={3} spacing={3}>
                {keypad.map((key) => (
                  <Button
                    key={key}
                    h="64px"
                    borderRadius="20px"
                    bg={key === "backspace" ? "surface.50" : "white"}
                    color="surface.900"
                    fontSize={key === "backspace" ? "md" : "2xl"}
                    fontWeight="800"
                    border="1px solid"
                    borderColor="surface.100"
                    _hover={{ bg: "surface.50" }}
                    _active={{ transform: "scale(0.92)", bg: "surface.100" }}
                    onClick={() => pressDiscountKey(discountModalItem, key)}
                  >
                    {key === "backspace" ? "Del" : key}
                  </Button>
                ))}
              </SimpleGrid>

              <VStack spacing={3}>
                <HStack spacing={3} w="full">
                  <Button
                    flex="1"
                    h="56px"
                    borderRadius="20px"
                    variant="outline"
                    borderColor="surface.200"
                    fontWeight="800"
                    onClick={() => pressDiscountKey(discountModalItem, "clear")}
                  >
                    Clear
                  </Button>
                  <Button
                    flex="1.5"
                    h="56px"
                    borderRadius="20px"
                    bg="brand.500"
                    color="white"
                    fontWeight="800"
                    _hover={{ bg: "brand.600" }}
                    _active={{ transform: "scale(0.96)" }}
                    onClick={() => applyDiscount(discountModalItem)}
                  >
                    Apply Discount
                  </Button>
                </HStack>

                {discountModalItem.discount_type ? (
                  <Button
                    w="full"
                    h="44px"
                    borderRadius="16px"
                    variant="ghost"
                    color="red.500"
                    fontSize="sm"
                    fontWeight="700"
                    onClick={() => clearDiscount(discountModalItem)}
                  >
                    Remove Discount
                  </Button>
                ) : null}
              </VStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  };

  const renderDraftCartContent = () => {
    if (!draft || draft.items.length === 0) {
      return null;
    }

    return (
      <VStack align="stretch" spacing={4}>
        <VStack align="stretch" spacing={3}>
          {draft.items.map((item) => (
            <Box
              key={item.id}
              bg="surface.50"
              borderRadius="24px"
              p={4}
              border="1px solid"
              borderColor="surface.100"
            >
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={0.5}>
                    <Text fontWeight="800" fontSize="md" color="surface.900" noOfLines={2}>
                      {item.product_name_snapshot}
                    </Text>
                    <HStack spacing={2}>
                      <Text fontSize="sm" color="surface.500" fontWeight="600">
                        EUR {item.final_price.toFixed(2)}
                      </Text>
                      {item.discount_type && (
                        <Box bg="green.50" px={2} py={0.5} borderRadius="6px">
                          <Text fontSize="10px" color="green.600" fontWeight="800" textTransform="uppercase">
                            -{item.discount_type === "percent" ? `${item.discount_value}%` : `EUR ${item.discount_value}`}
                          </Text>
                        </Box>
                      )}
                    </HStack>
                  </VStack>
                  <Text fontWeight="900" fontSize="lg" color="surface.900">
                    EUR {item.line_total.toFixed(2)}
                  </Text>
                </HStack>

                <HStack justify="space-between" align="center">
                  <HStack 
                    bg="white" 
                    borderRadius="16px" 
                    p={1} 
                    border="1px solid" 
                    borderColor="surface.200"
                    spacing={0}
                  >
                    <IconButton
                      aria-label="Decrease quantity"
                      icon={<Text fontSize="xl">−</Text>}
                      size="sm"
                      w="36px"
                      h="36px"
                      borderRadius="12px"
                      variant="ghost"
                      onClick={() => void updateDraftItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                      isDisabled={item.quantity <= 1 || actionLoading}
                    />
                    <Text w="44px" textAlign="center" fontWeight="800" fontSize="md">
                      {item.quantity}
                    </Text>
                    <IconButton
                      aria-label="Increase quantity"
                      icon={<Text fontSize="xl">+</Text>}
                      size="sm"
                      w="36px"
                      h="36px"
                      borderRadius="12px"
                      variant="ghost"
                      onClick={() => void updateDraftItem(item.id, { quantity: item.quantity + 1 })}
                      isLoading={actionLoading}
                    />
                  </HStack>

                  <HStack spacing={2}>
                    <Button
                      size="sm"
                      h="38px"
                      borderRadius="14px"
                      variant="outline"
                      borderColor="surface.200"
                      color="surface.600"
                      fontSize="xs"
                      fontWeight="700"
                      onClick={() => openDiscountModal(item)}
                      leftIcon={<Box as={HiOutlineAdjustmentsHorizontal} boxSize={3.5} />}
                    >
                      {item.discount_type ? "Edit Discount" : "Add Discount"}
                    </Button>
                    <IconButton
                      aria-label="Remove item"
                      icon={<Box as={HiOutlineTrash} boxSize={4} />}
                      size="sm"
                      h="38px"
                      w="38px"
                      borderRadius="14px"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => void removeDraftItem(item.id)}
                      isLoading={actionLoading}
                    />
                  </HStack>
                </HStack>
              </VStack>
            </Box>
          ))}
        </VStack>

        <Box 
          bg="surface.900" 
          borderRadius="24px" 
          p={4} 
          color="white" 
          boxShadow="0 10px 30px rgba(0,0,0,0.1)"
          mt={2}
        >
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" opacity={0.8}>
              <Text fontWeight="700" fontSize="sm">Items Count</Text>
              <Text fontWeight="800" fontSize="sm">{draft.summary.itemsCount}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontWeight="700" fontSize="md">Total Amount</Text>
              <Text fontSize="xl" fontWeight="900" letterSpacing="-0.02em">
                EUR {draft.summary.totalAmount.toFixed(2)}
              </Text>
            </HStack>
            
            <HStack spacing={3} pt={1}>
              <Button
                flex="1"
                h="52px"
                borderRadius="18px"
                bg="rgba(255,255,255,0.12)"
                color="white"
                border="1px solid rgba(255,255,255,0.2)"
                _hover={{ bg: "rgba(255,255,255,0.18)" }}
                _active={{ transform: "scale(0.96)" }}
                onClick={() => void checkout("cash")}
                isLoading={actionLoading}
                fontSize="sm"
                fontWeight="800"
              >
                Cash
              </Button>
              <Button
                flex="1"
                h="52px"
                borderRadius="18px"
                bg="brand.500"
                color="white"
                _hover={{ bg: "brand.600" }}
                _active={{ transform: "scale(0.96)" }}
                onClick={() => void checkout("card")}
                isLoading={actionLoading}
                fontSize="sm"
                fontWeight="800"
                boxShadow="0 8px 20px rgba(74, 132, 244, 0.4)"
              >
                Card Pay
              </Button>
            </HStack>
          </VStack>
        </Box>
      </VStack>
    );
  };

  const renderDraftCartSheet = () => (
    isDraftCartOpen && draft?.items.length ? (
      <Box position="fixed" inset={0} zIndex={40}>
        <Box
          position="absolute"
          inset={0}
          bg="rgba(14, 12, 10, 0.4)"
          onClick={() => setIsDraftCartOpen(false)}
        />
        <Box
          role="dialog"
          aria-modal="true"
          aria-label="Draft Cart"
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          maxH="88vh"
          bg="white"
          borderTopRadius="32px"
          boxShadow="0 -20px 60px rgba(0,0,0,0.15)"
          overflow="hidden"
          display="flex"
          flexDirection="column"
        >
          {/* Handle for the sheet */}
          <Box w="full" py={3} display="flex" justifyContent="center" onClick={() => setIsDraftCartOpen(false)} cursor="pointer">
            <Box w="40px" h="4px" borderRadius="full" bg="surface.200" />
          </Box>
          
          <Box px={5} pb={6} pt={2} overflowY="auto" flex="1">
            <HStack justify="space-between" mb={6} align="center">
              <VStack align="start" spacing={0}>
                <Text fontWeight="900" fontSize="2xl" letterSpacing="-0.02em">
                  Draft Cart
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {draft.summary.itemsCount} products added
                </Text>
              </VStack>
              <IconButton
                aria-label="Close Draft Cart"
                icon={<Text fontSize="2xl" lineHeight="1">×</Text>}
                size="md"
                borderRadius="full"
                variant="ghost"
                bg="surface.50"
                onClick={() => setIsDraftCartOpen(false)}
              />
            </HStack>
            {renderDraftCartContent()}
          </Box>
        </Box>
      </Box>
    ) : null
  );

  const renderDraftCartBar = () => {
    if (activeTab !== "checkout" || !draft || draft.items.length === 0 || isDraftCartOpen) {
      return null;
    }

    return (
      <HStack
        as="button"
        type="button"
        w="100%"
        justify="space-between"
        align="center"
        bg="brand.500"
        color="white"
        borderRadius="20px"
        px={4}
        py={3.5}
        boxShadow="0 12px 24px rgba(74, 132, 244, 0.3)"
        onClick={() => setIsDraftCartOpen(true)}
        transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        _active={{ transform: "scale(0.97)", bg: "brand.600" }}
      >
        <HStack spacing={3}>
          <Box
            w="40px"
            h="40px"
            borderRadius="12px"
            bg="rgba(255,255,255,0.2)"
            display="grid"
            placeItems="center"
          >
            <Box as={LuShoppingCart} boxSize={5} strokeWidth={2.5} />
          </Box>
          <VStack align="start" spacing={0}>
            <Text fontWeight="800" fontSize="sm" lineHeight="1.1">
              {draft.summary.itemsCount} Items
            </Text>
            <Text fontSize="11px" color="rgba(255,255,255,0.8)" fontWeight="700" textTransform="uppercase" letterSpacing="0.04em">
              View Cart Details
            </Text>
          </VStack>
        </HStack>
        
        <HStack spacing={3}>
          <Text fontSize="lg" fontWeight="900" letterSpacing="-0.02em">
            EUR {draft.summary.totalAmount.toFixed(2)}
          </Text>
          <Box
            w="32px"
            h="32px"
            borderRadius="full"
            bg="white"
            color="brand.500"
            display="grid"
            placeItems="center"
            fontWeight="900"
          >
            →
          </Box>
        </HStack>
      </HStack>
    );
  };

  const renderCheckoutTab = () => (
    <VStack spacing={4} align="stretch">
      {!loading && !shiftActive ? (
        <Box
          bg={panelSurface}
          borderRadius={panelRadius}
          px={4}
          py={4}
          boxShadow={panelShadow}
        >
          <VStack align="start" spacing={3}>
            <Text fontSize="lg" fontWeight="800">
              Start your shift to unlock live sales
            </Text>
            <Text color="surface.600" fontSize="sm">
              The app is connected to the real backend. Once the shift is open, products and cart switch from demo mode to live mode.
            </Text>
            <Button
              borderRadius="16px"
              bg="brand.500"
              color="white"
              _hover={{ bg: "brand.600" }}
              isLoading={actionLoading}
              onClick={() => void startShift()}
            >
              Start Shift
            </Button>
          </VStack>
        </Box>
      ) : null}

      {filteredProducts.map((item) => (
        <ProductCard
          key={item.id}
          item={item}
          onAdd={(productId) => void addToDraft(productId)}
          disabled={!shiftActive || actionLoading}
        />
      ))}
    </VStack>
  );

  const selectedSale = selectedSaleId ? sales.find((sale) => sale.id === selectedSaleId) ?? null : null;

  const renderReceipt = () => {
    if (!selectedSale) {
      return null;
    }

    return (
      <VStack spacing={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={4}>
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={1}>
                <Text fontWeight="900" fontSize="xl">
                  Receipt
                </Text>
                <Text fontSize="sm" color="surface.500">
                  {new Date(selectedSale.created_at).toLocaleString()}
                </Text>
                <Text fontSize="sm" color="surface.500">
                  {selectedSale.payment_method.toUpperCase()} · {selectedSale.status}
                </Text>
              </VStack>
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                borderColor="var(--app-border)"
                onClick={() => setSelectedSaleId(null)}
              >
                Back
              </Button>
            </HStack>

            <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

            {selectedSale.items.map((item) => (
              <HStack key={item.id} justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="800">{item.product_name_snapshot}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {item.sku_snapshot} · Qty {item.quantity} x EUR {item.final_price.toFixed(2)}
                  </Text>
                  {item.discount_type ? (
                    <Text fontSize="xs" color="surface.500">
                      Discount {item.discount_type}: {item.discount_value}
                    </Text>
                  ) : null}
                </VStack>
                <Text fontWeight="900">EUR {item.line_total.toFixed(2)}</Text>
              </HStack>
            ))}

            <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

            <VStack align="stretch" spacing={2}>
              <HStack justify="space-between">
                <Text color="surface.500" fontWeight="700">
                  Subtotal
                </Text>
                <Text fontWeight="800">EUR {selectedSale.subtotal_amount.toFixed(2)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="surface.500" fontWeight="700">
                  Discount
                </Text>
                <Text fontWeight="800">EUR {selectedSale.discount_amount.toFixed(2)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text fontSize="lg" fontWeight="900">
                  Total
                </Text>
                <Text fontSize="lg" fontWeight="900">
                  EUR {selectedSale.total_amount.toFixed(2)}
                </Text>
              </HStack>
            </VStack>

            <Text fontSize="xs" color="surface.500">
              Sale ID: {selectedSale.id}
            </Text>
          </VStack>
        </Box>
      </VStack>
    );
  };

  const renderOrdersTab = () => selectedSale ? renderReceipt() : (
    <VStack spacing={4} align="stretch">
      {sales.length > 0 ? (
        sales.map((sale) => (
          <HStack
            key={sale.id}
            as="button"
            type="button"
            textAlign="left"
            bg={panelSurface}
            borderRadius={panelRadius}
            px={4}
            py={4}
            boxShadow={panelShadow}
            border={0}
            justify="space-between"
            align="center"
            onClick={() => setSelectedSaleId(sale.id)}
          >
            <VStack align="start" spacing={0.5}>
              <Text fontWeight="800">
                {sale.status === "deleted" ? "Deleted Sale" : "Completed Sale"}
              </Text>
              <Text fontSize="sm" color="surface.500">
                {new Date(sale.created_at).toLocaleDateString()}
              </Text>
              <Text fontSize="sm" color="surface.500">
                {new Date(sale.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })} · {sale.payment_method.toUpperCase()}
              </Text>
            </VStack>

            <VStack align="end" spacing={0.5}>
              <Text fontWeight="900" fontSize="lg">
                EUR {sale.total_amount.toFixed(2)}
              </Text>
              <Text fontSize="xs" color="surface.500" fontWeight="700">
                Open receipt
              </Text>
            </VStack>
          </HStack>
        ))
      ) : (
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
          <Text fontWeight="800">No sales yet</Text>
          <Text color="surface.500" fontSize="sm">
            Completed sales and returns will appear here.
          </Text>
        </Box>
      )}
    </VStack>
  );

  const renderStockTab = () => (
    <VStack spacing={5} align="stretch">
      {products.map((item) => {
        const draft = getStockDraft(item.id);
        const isLowStock = item.stock < 5;
        const adjQty = Number(draft.quantity || 1);
        
        return (
          <Box 
            key={item.id} 
            bg="white" 
            borderRadius="28px" 
            p={5} 
            boxShadow="0 10px 30px rgba(0,0,0,0.04)"
            border="1px solid"
            borderColor="surface.100"
          >
            <VStack align="stretch" spacing={5}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0.5}>
                  <Text fontWeight="850" fontSize="lg" color="surface.900">
                    {item.name}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="600">
                    EUR {item.price.toFixed(2)} · Current Stock: {item.stock}
                  </Text>
                </VStack>
                <Box 
                  bg={isLowStock ? "red.50" : "brand.50"} 
                  px={3} 
                  py={1.5} 
                  borderRadius="14px"
                >
                  <Text fontSize="md" fontWeight="900" color={isLowStock ? "red.600" : "brand.600"}>
                    {item.stock}
                  </Text>
                </Box>
              </HStack>

              <VStack spacing={4}>
                <HStack justify="center" spacing={6} bg="surface.50" py={3} px={6} borderRadius="20px">
                  <IconButton
                    aria-label="Decrease adjustment quantity"
                    icon={<Text fontSize="2xl" lineHeight="1">−</Text>}
                    onClick={() => updateStockDraft(item.id, { quantity: String(Math.max(1, adjQty - 1)) })}
                    variant="ghost"
                    color="surface.600"
                    size="lg"
                    isRound
                  />
                  <VStack spacing={0}>
                    <Text fontSize="2xl" fontWeight="900" color="surface.900" lineHeight="1">
                      {adjQty}
                    </Text>
                    <Text fontSize="10px" fontWeight="800" color="surface.400" textTransform="uppercase">
                      Adjust By
                    </Text>
                  </VStack>
                  <IconButton
                    aria-label="Increase adjustment quantity"
                    icon={<Text fontSize="2xl" lineHeight="1">+</Text>}
                    onClick={() => updateStockDraft(item.id, { quantity: String(adjQty + 1) })}
                    variant="ghost"
                    color="surface.600"
                    size="lg"
                    isRound
                  />
                </HStack>

                <HStack spacing={3} w="full">
                  <Button
                    flex="1"
                    h="52px"
                    borderRadius="18px"
                    bg="white"
                    color="surface.900"
                    border="1px solid"
                    borderColor="surface.200"
                    fontSize="sm"
                    fontWeight="800"
                    onClick={() => runStockOperation(item.id, "restock")}
                    isLoading={actionLoading}
                    leftIcon={<Box as={HiOutlineArchiveBox} boxSize={5} />}
                    _active={{ transform: "scale(0.96)", bg: "surface.50" }}
                  >
                    Restock
                  </Button>
                  <Button
                    flex="1"
                    h="52px"
                    borderRadius="18px"
                    bg="white"
                    color="red.500"
                    border="1px solid"
                    borderColor="red.100"
                    fontSize="sm"
                    fontWeight="800"
                    onClick={() => runStockOperation(item.id, "writeoff")}
                    isLoading={actionLoading}
                    leftIcon={<Box as={HiOutlineTrash} boxSize={5} />}
                    _active={{ transform: "scale(0.96)", bg: "red.50" }}
                  >
                    Write-off
                  </Button>
                </HStack>
              </VStack>
            </VStack>
          </Box>
        );
      })}

    </VStack>
  );

  const renderShiftTab = () => (
    <VStack spacing={5} align="stretch">
      <Box 
        bg="white" 
        borderRadius="28px" 
        p={6} 
        boxShadow="0 10px 30px rgba(0,0,0,0.04)"
        border="1px solid"
        borderColor="surface.100"
      >
        <VStack align="stretch" spacing={6}>
          <HStack justify="space-between" align="center">
            <VStack align="start" spacing={0.5}>
              <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">
                Shift Control
              </Text>
              <HStack spacing={1.5}>
                <Box 
                  w="8px" 
                  h="8px" 
                  borderRadius="full" 
                  bg={shiftStatus === "active" ? "green.500" : shiftStatus === "paused" ? "orange.400" : "surface.300"} 
                />
                <Text color="surface.500" fontWeight="700" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em">
                  {shiftLabel}
                </Text>
              </HStack>
            </VStack>
          </HStack>

          <SimpleGrid columns={2} spacing={4}>
            <VStack align="start" spacing={1} bg="surface.50" p={4} borderRadius="22px" border="1px solid" borderColor="surface.100">
              <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase" letterSpacing="0.04em">
                Time Worked
              </Text>
              <Text fontWeight="900" fontSize="2xl" color="surface.900" letterSpacing="-0.02em">
                {shiftSummary ? formatDuration(shiftSummary.workedSeconds) : "0h 0m"}
              </Text>
            </VStack>
            <VStack align="start" spacing={1} bg="surface.50" p={4} borderRadius="22px" border="1px solid" borderColor="surface.100">
              <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase" letterSpacing="0.04em">
                On Break
              </Text>
              <Text fontWeight="900" fontSize="2xl" color="surface.900" letterSpacing="-0.02em">
                {shiftSummary ? formatDuration(shiftSummary.pausedSeconds) : "0h 0m"}
              </Text>
            </VStack>
          </SimpleGrid>

          <VStack spacing={3}>
            {!shiftActive && shiftStatus !== "paused" ? (
              <Button
                w="full"
                h="56px"
                borderRadius="20px"
                bg="brand.500"
                color="white"
                fontSize="md"
                fontWeight="800"
                _hover={{ bg: "brand.600" }}
                _active={{ transform: "scale(0.97)" }}
                boxShadow="0 8px 24px rgba(74, 132, 244, 0.3)"
                isLoading={actionLoading}
                onClick={() => void startShift()}
              >
                Start New Shift
              </Button>
            ) : (
              <>
                <HStack spacing={3} w="full">
                  <Button
                    flex="1"
                    h="52px"
                    borderRadius="18px"
                    variant="outline"
                    borderColor="surface.200"
                    color="surface.700"
                    fontWeight="800"
                    onClick={() => void pauseShift()}
                    isDisabled={shiftStatus !== "active"}
                    isLoading={actionLoading}
                    leftIcon={<Box as={HiOutlinePause} boxSize={5} />}
                    _active={{ bg: "surface.50" }}
                  >
                    Pause
                  </Button>
                  <Button
                    flex="1"
                    h="52px"
                    borderRadius="18px"
                    variant="outline"
                    borderColor="surface.200"
                    color="surface.700"
                    fontWeight="800"
                    onClick={() => void resumeShift()}
                    isDisabled={shiftStatus !== "paused"}
                    isLoading={actionLoading}
                    leftIcon={<Box as={HiOutlinePlay} boxSize={5} />}
                    _active={{ bg: "surface.50" }}
                  >
                    Resume
                  </Button>
                </HStack>
                <Button
                  w="full"
                  h="52px"
                  borderRadius="18px"
                  variant="ghost"
                  color="red.500"
                  fontWeight="800"
                  onClick={() => {
                    if (window.confirm("Stop this shift now?")) {
                      void stopShift();
                    }
                  }}
                  isDisabled={shiftStatus === "inactive" || shiftStatus === "closed"}
                  isLoading={actionLoading}
                  leftIcon={<Box as={HiOutlinePower} boxSize={5} />}
                >
                  End Shift
                </Button>
              </>
            )}
          </VStack>
        </VStack>
      </Box>

      <VStack align="stretch" spacing={4} mt={2}>
        <HStack justify="space-between" px={1}>
          <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">Shift History</Text>
          <Button
            size="sm"
            borderRadius="12px"
            variant="ghost"
            color="brand.500"
            fontWeight="800"
            onClick={() => {
              const next = !showFullShiftHistory;
              setShowFullShiftHistory(next);
              void loadShiftHistory(next ? 50 : 7, 0);
            }}
          >
            {showFullShiftHistory ? "Show Recent" : "View All"}
          </Button>
        </HStack>

        <VStack spacing={3} align="stretch">
          {shiftHistory.map((entry) => (
            <Box
              key={entry.shift.id}
              bg="rgba(255,255,255,0.6)"
              p={4}
              borderRadius="24px"
              border="1px solid"
              borderColor="surface.100"
              transition="all 0.2s ease"
              _active={{ bg: "white", transform: "scale(0.985)" }}
            >
              <HStack justify="space-between" align="center">
                <HStack spacing={4}>
                  <Box 
                    w="44px" 
                    h="44px" 
                    borderRadius="14px" 
                    bg="surface.50" 
                    display="grid" 
                    placeItems="center"
                    color="surface.400"
                  >
                    <Box as={LuClock3} boxSize={6} />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="850" fontSize="sm" color="surface.900">
                      {new Date(entry.shift.started_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </Text>
                    <Text fontSize="xs" color="surface.500" fontWeight="600">
                      {new Date(entry.shift.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                      {" - "} 
                      {entry.shift.ended_at 
                        ? new Date(entry.shift.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : "Ongoing"}
                    </Text>
                  </VStack>
                </HStack>
                <VStack align="end" spacing={0}>
                  <Text fontWeight="900" fontSize="md" color="surface.900">
                    {formatDuration(entry.summary.workedSeconds)}
                  </Text>
                  <Text fontSize="10px" color="surface.400" fontWeight="700" textTransform="uppercase">
                    {entry.shift.status}
                  </Text>
                </VStack>
              </HStack>
            </Box>
          ))}

          {shiftHistory.length === 0 && (
            <Text color="surface.400" fontSize="sm" textAlign="center" py={4} fontWeight="600">
              No shift records found
            </Text>
          )}

          {showFullShiftHistory && shiftHistoryPagination?.hasMore && (
            <Button
              borderRadius="18px"
              variant="outline"
              borderColor="surface.200"
              fontWeight="800"
              onClick={() => void loadShiftHistory(50, (shiftHistoryPagination.offset ?? 0) + 50)}
              mt={2}
            >
              Load Older Shifts
            </Button>
          )}
        </VStack>
      </VStack>
    </VStack>
  );

  const renderOptionsTab = () => (
    <VStack spacing={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <Text fontWeight="900" fontSize="lg">Session Info</Text>
          <HStack justify="space-between">
            <Text color="surface.500">Operator</Text>
            <Text fontWeight="800">{operatorName}</Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="surface.500">Store</Text>
            <Text fontWeight="800">{storeName}</Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="surface.500">Mode</Text>
            <Text fontWeight="800">{mode === "live" ? "Live mode" : "Demo mode"}</Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="surface.500">Device</Text>
            <Text fontWeight="800">{localIpLabel}</Text>
          </HStack>
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <Text fontWeight="900" fontSize="lg">Developer Switch</Text>
          <Text color="surface.500" fontSize="sm">
            Switch between seller and admin without restarting the app.
          </Text>
          <HStack spacing={3}>
            <Button
              flex="1"
              borderRadius="16px"
              bg={currentPanel === "seller" ? "brand.500" : "rgba(241,240,236,0.95)"}
              color={currentPanel === "seller" ? "white" : "surface.800"}
              _hover={{
                bg: currentPanel === "seller" ? "brand.600" : "rgba(225,223,218,0.95)",
              }}
              onClick={() => void onSwitchPanel("seller")}
            >
              Seller
            </Button>
            <Button
              flex="1"
              borderRadius="16px"
              bg={currentPanel === "admin" ? "brand.500" : "rgba(241,240,236,0.95)"}
              color={currentPanel === "admin" ? "white" : "surface.800"}
              _hover={{
                bg: currentPanel === "admin" ? "brand.600" : "rgba(225,223,218,0.95)",
              }}
              onClick={() => void onSwitchPanel("admin")}
            >
              Admin
            </Button>
          </HStack>
        </VStack>
      </Box>
    </VStack>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "orders":
        return renderOrdersTab();
      case "stock":
        return renderStockTab();
      case "shift":
        return renderShiftTab();
      case "options":
        return renderOptionsTab();
      case "checkout":
      default:
        return renderCheckoutTab();
    }
  };

  return (
    <Box
      minH="100vh"
      px={3}
      pt={4}
      pb={activeTab === "checkout" && draft?.items.length && !isDraftCartOpen
        ? bottomDockWithCartReservedSpace
        : bottomDockReservedSpace}
    >
      <Container maxW="container.sm" px={0}>
        <VStack spacing={5} align="stretch">
        <VStack spacing={6} align="stretch" pt={2} mb={2}>
          <HStack justify="space-between" align="center" px={1}>
            <VStack align="start" spacing={0}>
              <Text
                fontSize="3xl"
                fontWeight="900"
                letterSpacing="-0.04em"
                color="surface.900"
                lineHeight="1"
              >
                {storeName}
              </Text>
              <HStack spacing={1.5} mt={1}>
                <Box w="6px" h="6px" borderRadius="full" bg="green.500" />
                <Text fontSize="xs" fontWeight="700" color="surface.500" textTransform="uppercase" letterSpacing="0.05em">
                  Live Terminal
                </Text>
              </HStack>
            </VStack>

            <HStack 
              spacing={2.5} 
              bg="rgba(255,255,255,0.6)" 
              backdropFilter="blur(10px)"
              pl={1.5} 
              pr={3.5} 
              py={1.5} 
              borderRadius="full" 
              border="1px solid"
              borderColor="rgba(255,255,255,0.8)"
              boxShadow="0 4px 12px rgba(0,0,0,0.03)"
            >
              <Avatar 
                size="xs" 
                name={operatorName} 
                bg="brand.500" 
                color="white" 
                fontWeight="800"
                fontSize="10px"
              />
              <Text fontWeight="800" fontSize="sm" color="surface.700" letterSpacing="-0.01em">
                {operatorName.split(' ')[0]}
              </Text>
            </HStack>
          </HStack>

          <InputGroup size="md">
            <InputLeftElement pointerEvents="none" color="surface.500" h="54px" pl={2}>
              <Box as={HiOutlineMagnifyingGlass} boxSize={5} strokeWidth={2.5} />
            </InputLeftElement>
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              borderRadius="20px"
              border="1px solid"
              borderColor="rgba(0, 0, 0, 0.06)"
              bg="white"
              h="54px"
              fontSize="md"
              fontWeight="650"
              px={5}
              boxShadow="0 4px 12px rgba(0, 0, 0, 0.03)"
              _placeholder={{ color: "surface.400", fontWeight: 600 }}
              _focusVisible={{
                borderColor: "brand.300",
                boxShadow: "0 8px 24px rgba(74, 132, 244, 0.12)",
              }}
              transition="all 0.2s ease"
            />
            <InputRightElement w="62px" h="54px" pr={1}>
              <IconButton
                aria-label="Filters"
                icon={<Box as={HiOutlineAdjustmentsHorizontal} boxSize={5} strokeWidth={2} />}
                size="sm"
                borderRadius="14px"
                bg="surface.50"
                color="surface.600"
                _hover={{ bg: "brand.50", color: "brand.600" }}
              />
            </InputRightElement>
          </InputGroup>
        </VStack>

          {renderActiveTab()}

          <HStack
            justify="space-between"
            bg="rgba(255,255,255,0.74)"
            borderRadius={panelRadius}
            px={4}
            py={3}
            boxShadow={panelShadow}
          >
            <HStack spacing={3}>
              <Box
                w="42px"
                h="42px"
                borderRadius="14px"
                bg="surface.100"
                display="grid"
                placeItems="center"
                color="surface.700"
              >
                <Box as={HiOutlineWifi} boxSize={5} />
              </Box>
              <VStack align="start" spacing={0}>
                <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="surface.500">
                  Local Device
                </Text>
                <Text fontWeight="800">{localIpLabel}</Text>
              </VStack>
            </HStack>

            <VStack align="end" spacing={0}>
              <Text color="surface.500" fontWeight="700" fontSize="sm">
                {loading ? "Loading..." : mode === "live" ? "Live mode" : "Demo mode"}
              </Text>
              {error ? (
                <Text color="red.400" fontSize="xs" maxW="180px" textAlign="right">
                  {error}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        </VStack>
      </Container>

      {renderDraftCartSheet()}
      {renderDiscountModal()}

      <Box
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={30}
      >
        <BottomNav
          activeTab={activeTab}
          onChange={setActiveTab}
          topAccessory={renderDraftCartBar()}
        />
      </Box>
    </Box>
  );
}
