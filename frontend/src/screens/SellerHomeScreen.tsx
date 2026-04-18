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
    const reason = draft.reason.trim();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      window.alert("Enter a quantity greater than 0.");
      return;
    }

    if (!reason) {
      window.alert("Reason is required for stock changes.");
      return;
    }

    const label = operation === "restock" ? "restock" : "write off";
    if (!window.confirm(`Confirm ${label} of ${quantity} unit(s)?`)) {
      return;
    }

    if (operation === "restock") {
      void restockProduct(productId, quantity, reason);
    } else {
      void writeoffProduct(productId, quantity, reason);
    }

    updateStockDraft(productId, { reason: "" });
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
        <ModalOverlay bg="rgba(23, 22, 20, 0.24)" backdropFilter="blur(3px)" />
        <ModalContent
          mx={3}
          mt="auto"
          mb={3}
          borderRadius="30px"
          bg="rgba(255,255,255,0.96)"
          boxShadow="0 28px 80px rgba(17,17,17,0.22)"
          overflow="hidden"
        >
          <ModalHeader px={4} pt={4} pb={2}>
            <VStack align="start" spacing={1}>
              <Text fontSize="xs" color="surface.500" letterSpacing="0.08em" textTransform="uppercase">
                Discount
              </Text>
              <Text fontSize="lg" fontWeight="900" noOfLines={1}>
                {discountModalItem.product_name_snapshot}
              </Text>
            </VStack>
          </ModalHeader>
          <ModalCloseButton top={4} right={4} borderRadius="14px" />
          <ModalBody px={4} pb={4}>
            <VStack align="stretch" spacing={4}>
              <HStack spacing={2} bg="rgba(241,240,236,0.78)" borderRadius="18px" p={1}>
                {(["amount", "percent"] as const).map((type) => {
                  const isSelected = discountDraft.type === type;

                  return (
                    <Button
                      key={type}
                      flex="1"
                      borderRadius="15px"
                      bg={isSelected ? "brand.500" : "transparent"}
                      color={isSelected ? "white" : "surface.700"}
                      _hover={{ bg: isSelected ? "brand.600" : "rgba(255,255,255,0.74)" }}
                      onClick={() => updateDiscountDraft(discountModalItem.id, { type })}
                    >
                      {type === "amount" ? "EUR" : "%"}
                    </Button>
                  );
                })}
              </HStack>

              <Box bg="rgba(241,240,236,0.72)" borderRadius="22px" px={4} py={3}>
                <HStack justify="space-between" align="end">
                  <VStack align="start" spacing={1}>
                    <Text fontSize="xs" color="surface.500" fontWeight="800" textTransform="uppercase">
                      Value
                    </Text>
                    <Text fontSize="3xl" fontWeight="900" letterSpacing="-0.04em">
                      {discountDraft.value || "0"}
                      <Box as="span" fontSize="lg" color="surface.500" ml={2}>
                        {discountDraft.type === "amount" ? "EUR" : "%"}
                      </Box>
                    </Text>
                  </VStack>
                  <VStack align="end" spacing={1}>
                    <Text fontSize="xs" color="surface.500" fontWeight="800" textTransform="uppercase">
                      New price
                    </Text>
                    <Text fontWeight="900">EUR {previewFinalPrice.toFixed(2)}</Text>
                  </VStack>
                </HStack>
              </Box>

              <SimpleGrid columns={3} spacing={2}>
                {keypad.map((key) => (
                  <Button
                    key={key}
                    h="56px"
                    borderRadius="18px"
                    bg={key === "backspace" ? "rgba(241,240,236,0.9)" : "white"}
                    color="surface.900"
                    fontSize={key === "backspace" ? "lg" : "xl"}
                    fontWeight="900"
                    boxShadow="inset 0 0 0 1px rgba(226,224,218,0.8)"
                    _hover={{ bg: "rgba(245,244,241,0.96)" }}
                    onClick={() => pressDiscountKey(discountModalItem, key)}
                    aria-label={key === "backspace" ? "Discount backspace" : `Discount digit ${key}`}
                  >
                    {key === "backspace" ? "Del" : key}
                  </Button>
                ))}
              </SimpleGrid>

              <HStack spacing={2}>
                <Button
                  flex="1"
                  h="52px"
                  borderRadius="17px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => pressDiscountKey(discountModalItem, "clear")}
                >
                  Clear input
                </Button>
                <Button
                  flex="1"
                  h="52px"
                  borderRadius="17px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.800" }}
                  onClick={() => applyDiscount(discountModalItem)}
                >
                  Apply
                </Button>
              </HStack>

              {discountModalItem.discount_type ? (
                <Button
                  h="46px"
                  borderRadius="16px"
                  variant="ghost"
                  color="red.500"
                  onClick={() => clearDiscount(discountModalItem)}
                >
                  Remove discount
                </Button>
              ) : null}
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
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" pr={9}>
          <Text fontWeight="900" fontSize="lg">
            Draft Cart
          </Text>
          <Text color="surface.500" fontWeight="700" fontSize="sm">
            {draft.summary.itemsCount} items
          </Text>
        </HStack>

        {draft.items.map((item) => (
          <VStack key={item.id} align="stretch" spacing={3}>
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={0}>
                <Text fontWeight="800">{item.product_name_snapshot}</Text>
                <Text fontSize="sm" color="surface.500">
                  Qty {item.quantity} · EUR {item.final_price.toFixed(2)}
                  {item.discount_type ? " after discount" : ""}
                </Text>
              </VStack>
              <Text fontWeight="800">EUR {item.line_total.toFixed(2)}</Text>
            </HStack>

            <HStack justify="space-between" spacing={3}>
              <Button
                size="sm"
                borderRadius="14px"
                variant="ghost"
                color="surface.500"
                px={0}
                onClick={() => openDiscountModal(item)}
              >
                {item.discount_type
                  ? `Discount ${item.discount_type === "amount" ? "EUR" : "%"} ${item.discount_value}`
                  : "Add discount"}
              </Button>
              {item.discount_type ? (
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="ghost"
                  color="surface.500"
                  onClick={() => clearDiscount(item)}
                >
                  Clear
                </Button>
              ) : null}
            </HStack>

            <HStack spacing={2}>
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                borderColor="var(--app-border)"
                onClick={() => void updateDraftItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                isDisabled={item.quantity <= 1}
                isLoading={actionLoading}
              >
                -1
              </Button>
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                borderColor="var(--app-border)"
                onClick={() => void updateDraftItem(item.id, { quantity: item.quantity + 1 })}
                isLoading={actionLoading}
              >
                +1
              </Button>
              <Button
                size="sm"
                borderRadius="14px"
                variant="ghost"
                colorScheme="red"
                leftIcon={<Box as={HiOutlineTrash} boxSize={4} />}
                onClick={() => void removeDraftItem(item.id)}
                isLoading={actionLoading}
              >
                Remove
              </Button>
            </HStack>
          </VStack>
        ))}

        <Divider />

        <HStack justify="space-between">
          <Text color="surface.500" fontWeight="700">
            Total
          </Text>
          <Text fontSize="xl" fontWeight="900">
            EUR {draft.summary.totalAmount.toFixed(2)}
          </Text>
        </HStack>

        <HStack spacing={3}>
          <Button
            flex="1"
            borderRadius="16px"
            variant="outline"
            borderColor="var(--app-border)"
            onClick={() => void checkout("cash")}
            isLoading={actionLoading}
          >
            Cash
          </Button>
          <Button
            flex="1"
            borderRadius="16px"
            bg="brand.500"
            color="white"
            _hover={{ bg: "brand.600" }}
            onClick={() => void checkout("card")}
            isLoading={actionLoading}
          >
            Card
          </Button>
        </HStack>
      </VStack>
    );
  };

  const renderDraftCartSheet = () => (
    isDraftCartOpen && draft?.items.length ? (
      <Box position="fixed" inset={0} zIndex={40}>
        <Box
          position="absolute"
          inset={0}
          bg="rgba(23, 22, 20, 0.14)"
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
          maxH="82vh"
          bg="white"
          borderTopRadius="30px"
          boxShadow="0 28px 80px rgba(17,17,17,0.22)"
          overflowY="auto"
          px={4}
          pt={5}
          pb={4}
        >
          <IconButton
            aria-label="Close Draft Cart"
            icon={<Text fontSize="2xl" lineHeight="1">×</Text>}
            position="absolute"
            top={4}
            right={4}
            size="sm"
            borderRadius="14px"
            variant="ghost"
            onClick={() => setIsDraftCartOpen(false)}
          />
          {renderDraftCartContent()}
        </Box>
      </Box>
    ) : null
  );

  const renderDraftCartBar = () => {
    if (activeTab !== "checkout" || !draft || draft.items.length === 0 || isDraftCartOpen) {
      return null;
    }

    return (
      <Box position="fixed" left={0} right={0} bottom="104px" zIndex={29} px={3}>
        <Container maxW="container.sm" px={0}>
          <HStack
            as="button"
            type="button"
            w="100%"
            justify="space-between"
            bg="surface.900"
            color="white"
            borderRadius="22px"
            px={4}
            py={3}
            boxShadow="0 18px 44px rgba(24, 24, 24, 0.24)"
            onClick={() => setIsDraftCartOpen(true)}
          >
            <VStack align="start" spacing={0}>
              <Text fontWeight="900">Draft Cart</Text>
              <Text fontSize="sm" color="rgba(255,255,255,0.72)" fontWeight="700">
                {draft.summary.itemsCount} items
              </Text>
            </VStack>
            <HStack spacing={3}>
              <Text fontSize="lg" fontWeight="900">
                EUR {draft.summary.totalAmount.toFixed(2)}
              </Text>
              <Box
                px={3}
                h="34px"
                borderRadius="14px"
                bg="rgba(255,255,255,0.14)"
                display="grid"
                placeItems="center"
                fontWeight="900"
                fontSize="sm"
              >
                Open
              </Box>
            </HStack>
          </HStack>
        </Container>
      </Box>
    );
  };

  const renderCheckoutTab = () => (
    <VStack spacing={4} align="stretch">
      {!shiftActive ? (
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
          <Box
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
            onClick={() => setSelectedSaleId(sale.id)}
          >
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="800">
                    {sale.status === "deleted" ? "Deleted Sale" : "Completed Sale"}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {new Date(sale.created_at).toLocaleString()} · {sale.payment_method.toUpperCase()}
                  </Text>
                </VStack>
                <Text fontWeight="900">EUR {sale.total_amount.toFixed(2)}</Text>
              </HStack>

              {sale.items.map((item) => (
                <HStack key={item.id} justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700">
                      {item.product_name_snapshot}
                    </Text>
                    <Text fontSize="xs" color="surface.500">
                      Qty {item.quantity} · EUR {item.final_price.toFixed(2)}
                    </Text>
                  </VStack>
                  <Text fontSize="sm" fontWeight="800">
                    EUR {item.line_total.toFixed(2)}
                  </Text>
                </HStack>
              ))}
              <Text fontSize="xs" color="surface.500">
                Tap to open receipt
              </Text>
            </VStack>
          </Box>
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
    <VStack spacing={4} align="stretch">
      {products.map((item) => (
        <Box key={item.id} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <VStack align="start" spacing={0}>
              <Text fontWeight="800">{item.name}</Text>
              <Text fontSize="sm" color="surface.500">
                EUR {item.price.toFixed(2)} · Stock {item.stock}
              </Text>
            </VStack>
            <SimpleGrid columns={2} spacing={2}>
              <Input
                value={getStockDraft(item.id).quantity}
                onChange={(event) => updateStockDraft(item.id, { quantity: event.target.value })}
                placeholder="Qty"
                inputMode="decimal"
                borderRadius="14px"
                bg="white"
                borderColor="var(--app-border)"
              />
              <Input
                value={getStockDraft(item.id).reason}
                onChange={(event) => updateStockDraft(item.id, { reason: event.target.value })}
                placeholder="Reason"
                borderRadius="14px"
                bg="white"
                borderColor="var(--app-border)"
              />
            </SimpleGrid>
            <SimpleGrid columns={2} spacing={2}>
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                borderColor="var(--app-border)"
                onClick={() => runStockOperation(item.id, "restock")}
                isLoading={actionLoading}
                leftIcon={<Box as={HiOutlineArchiveBox} boxSize={4} />}
              >
                Restock
              </Button>
              <Button
                size="sm"
                borderRadius="14px"
                variant="outline"
                borderColor="var(--app-border)"
                onClick={() => runStockOperation(item.id, "writeoff")}
                isLoading={actionLoading}
                leftIcon={<Box as={HiOutlineTrash} boxSize={4} />}
              >
                Writeoff
              </Button>
            </SimpleGrid>
          </VStack>
        </Box>
      ))}

      {inventoryHistory.length > 0 ? (
        <Box
          bg={panelSurface}
          borderRadius={panelRadius}
          px={4}
          py={4}
          boxShadow={panelShadow}
        >
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
                Inventory History
              </Text>
              <Text color="surface.500" fontWeight="700" fontSize="sm">
                {inventoryHistory.length} entries
              </Text>
            </HStack>

            {inventoryHistory.map((entry) => (
              <HStack key={entry.id} justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="700">{entry.product?.name ?? "Unknown product"}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {entry.movementType} · balance {entry.balanceAfter}
                  </Text>
                  {entry.reason ? (
                    <Text fontSize="xs" color="surface.500">
                      {entry.reason}
                    </Text>
                  ) : null}
                </VStack>
                <Text
                  fontWeight="800"
                  color={entry.quantityDelta >= 0 ? "green.500" : "red.400"}
                >
                  {entry.quantityDelta >= 0 ? "+" : ""}
                  {entry.quantityDelta}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      ) : null}
    </VStack>
  );

  const renderShiftTab = () => (
    <VStack spacing={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">Shift Control</Text>
            <Text color="surface.500" fontWeight="700">{shiftLabel}</Text>
          </HStack>

          <SimpleGrid columns={2} spacing={3}>
            <Box bg={innerSurface} borderRadius="18px" px={3} py={3}>
              <Text fontSize="xs" color="surface.500" textTransform="uppercase">Worked</Text>
              <Text fontWeight="900" fontSize="xl">
                {shiftSummary ? formatDuration(shiftSummary.workedSeconds) : "0h 0m"}
              </Text>
            </Box>
            <Box bg={innerSurface} borderRadius="18px" px={3} py={3}>
              <Text fontSize="xs" color="surface.500" textTransform="uppercase">Paused</Text>
              <Text fontWeight="900" fontSize="xl">
                {shiftSummary ? formatDuration(shiftSummary.pausedSeconds) : "0h 0m"}
              </Text>
            </Box>
          </SimpleGrid>

          {!shiftActive && shiftStatus !== "paused" ? (
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
          ) : null}

          <HStack spacing={3}>
            <Button
              flex="1"
              borderRadius="16px"
              variant="outline"
              onClick={() => void pauseShift()}
              isDisabled={shiftStatus !== "active"}
              isLoading={actionLoading}
              leftIcon={<Box as={HiOutlinePause} boxSize={4} />}
            >
              Pause
            </Button>
            <Button
              flex="1"
              borderRadius="16px"
              variant="outline"
              onClick={() => void resumeShift()}
              isDisabled={shiftStatus !== "paused"}
              isLoading={actionLoading}
              leftIcon={<Box as={HiOutlinePlay} boxSize={4} />}
            >
              Resume
            </Button>
          </HStack>

          <Button
            borderRadius="16px"
            colorScheme="red"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Stop this shift now?")) {
                void stopShift();
              }
            }}
            isDisabled={shiftStatus === "inactive" || shiftStatus === "closed"}
            isLoading={actionLoading}
            leftIcon={<Box as={HiOutlinePower} boxSize={4} />}
          >
            Stop Shift
          </Button>
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">Shift History</Text>
            <Button
              size="sm"
              borderRadius="14px"
              variant="outline"
              borderColor="var(--app-border)"
              onClick={() => {
                const next = !showFullShiftHistory;
                setShowFullShiftHistory(next);
                void loadShiftHistory(next ? 50 : 7, 0);
              }}
            >
              {showFullShiftHistory ? "Last 7" : "Full list"}
            </Button>
          </HStack>

          {shiftHistory.map((entry) => (
            <Box
              key={entry.shift.id}
              bg={innerSurface}
              borderRadius="18px"
              px={3}
              py={3}
              onClick={() => {
                if (!showFullShiftHistory) {
                  setShowFullShiftHistory(true);
                  void loadShiftHistory(50, 0);
                }
              }}
            >
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="800">
                    {new Date(entry.shift.started_at).toLocaleDateString()}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {new Date(entry.shift.started_at).toLocaleTimeString()} - {entry.shift.ended_at ? new Date(entry.shift.ended_at).toLocaleTimeString() : "Open"}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {entry.shift.status}
                  </Text>
                </VStack>
                <VStack align="end" spacing={0}>
                  <Text fontWeight="900">{formatDuration(entry.summary.workedSeconds)}</Text>
                  <Text fontSize="xs" color="surface.500">
                    Pause {formatDuration(entry.summary.pausedSeconds)}
                  </Text>
                </VStack>
              </HStack>
            </Box>
          ))}

          {shiftHistory.length === 0 ? (
            <Text color="surface.500" fontSize="sm">
              No shifts yet.
            </Text>
          ) : null}

          {showFullShiftHistory && shiftHistoryPagination?.hasMore ? (
            <Button
              borderRadius="16px"
              variant="outline"
              borderColor="var(--app-border)"
              onClick={() => void loadShiftHistory(50, (shiftHistoryPagination.offset ?? 0) + 50)}
            >
              Load More
            </Button>
          ) : null}
        </VStack>
      </Box>
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
    <Box minH="100vh" px={3} pt={4} pb="140px">
      <Container maxW="container.sm" px={0}>
        <VStack spacing={5} align="stretch">
          <Box
            bg="rgba(255, 255, 255, 0.78)"
            border="1px solid rgba(255, 255, 255, 0.86)"
            borderRadius="28px"
            px={3}
            py={3}
            boxShadow="0 18px 44px rgba(41, 36, 26, 0.055)"
            backdropFilter="blur(12px)"
          >
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="start" spacing={3}>
                <VStack align="start" spacing={0} minW={0} flex="1">
                  <Text
                    fontSize="xs"
                    color="surface.500"
                    fontWeight="800"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                  >
                    Current Store
                  </Text>
                  <Text
                    fontSize="2xl"
                    lineHeight="1.08"
                    fontWeight="900"
                    letterSpacing="-0.035em"
                    color="surface.900"
                    noOfLines={1}
                    w="100%"
                  >
                    {storeName}
                  </Text>
                </VStack>

                <HStack
                  spacing={2}
                  bg="rgba(255,255,255,0.92)"
                  border="1px solid rgba(226,224,218,0.72)"
                  borderRadius="999px"
                  px={2}
                  py={1.5}
                  boxShadow="0 10px 24px rgba(17, 17, 17, 0.05)"
                  maxW="48%"
                  minW={0}
                >
                  <Avatar size="xs" name={operatorName} bg="surface.200" color="surface.800" />
                  <Text fontWeight="850" fontSize="sm" noOfLines={1} minW={0}>
                    {operatorName}
                  </Text>
                </HStack>
              </HStack>

              <InputGroup size="md">
                <InputLeftElement pointerEvents="none" color="surface.500" h="50px">
                  <Box as={HiOutlineMagnifyingGlass} boxSize={5} />
                </InputLeftElement>
                <Input
                  placeholder="Search product..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  borderRadius="18px"
                  borderColor="rgba(226,224,218,0.92)"
                  bg="rgba(255,255,255,0.94)"
                  h="50px"
                  fontWeight="700"
                  _placeholder={{ color: "surface.500", fontWeight: 600 }}
                  _focusVisible={{
                    borderColor: "brand.400",
                    boxShadow: "0 0 0 1px rgba(90,145,251,0.35)",
                  }}
                />
                <InputRightElement w="58px" h="50px">
                  <IconButton
                    aria-label="Filters"
                    icon={<Box as={HiOutlineAdjustmentsHorizontal} boxSize={5} />}
                    size="sm"
                    borderRadius="14px"
                    bg="brand.50"
                    color="brand.600"
                    _hover={{ bg: "brand.100" }}
                  />
                </InputRightElement>
              </InputGroup>
            </VStack>
          </Box>

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

      {renderDraftCartBar()}
      {renderDraftCartSheet()}
      {renderDiscountModal()}

      <Box
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={30}
        px={3}
      >
        <Container maxW="container.sm" px={0}>
          <BottomNav activeTab={activeTab} onChange={setActiveTab} />
        </Container>
      </Box>
    </Box>
  );
}
