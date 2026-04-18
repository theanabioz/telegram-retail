import { AddIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import type { ProductCardItem } from "../data/mockSellerHome";

type ProductCardProps = {
  item: ProductCardItem;
  onAdd?: (productId: string) => void;
  disabled?: boolean;
};

export function ProductCard({ item, onAdd, disabled }: ProductCardProps) {
  return (
    <HStack
      align="stretch"
      justify="space-between"
      spacing={4}
      bg="rgba(255, 255, 255, 0.86)"
      border="1px solid rgba(255, 255, 255, 0.88)"
      borderRadius="24px"
      px={4}
      py={4}
      boxShadow="0 16px 34px rgba(29, 31, 35, 0.055)"
      backdropFilter="blur(12px)"
    >
      <VStack align="start" spacing={1}>
        <Text fontSize="lg" fontWeight="800" lineHeight="1.2">
          {item.name}
        </Text>
        <Text color="var(--app-muted)" fontSize="sm" fontWeight="600">
          EUR {item.price.toFixed(2)} · Stock: {item.stock}
        </Text>
      </VStack>

      <Button
        aria-label={`Add ${item.name} to cart`}
        alignSelf="center"
        minW="54px"
        h="54px"
        borderRadius="18px"
        bg="brand.500"
        color="white"
        _hover={{ bg: "brand.600" }}
        _active={{ bg: "brand.700" }}
        boxShadow="0 12px 24px rgba(74, 132, 244, 0.32)"
        isDisabled={disabled}
        onClick={() => onAdd?.(item.id)}
      >
        <AddIcon />
      </Button>
    </HStack>
  );
}
