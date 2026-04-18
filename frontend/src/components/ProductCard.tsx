import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { LuPlus } from "react-icons/lu";
import type { ProductCardItem } from "../data/mockSellerHome";

type ProductCardProps = {
  item: ProductCardItem;
  onAdd?: (productId: string) => void;
  disabled?: boolean;
};

export function ProductCard({ item, onAdd, disabled }: ProductCardProps) {
  return (
    <HStack
      align="center"
      justify="space-between"
      spacing={4}
      bg="rgba(255, 255, 255, 0.82)"
      border="1px solid rgba(255, 255, 255, 0.6)"
      borderRadius="28px"
      px={5}
      py={4}
      boxShadow="0 14px 34px rgba(0, 0, 0, 0.04)"
      backdropFilter="blur(14px)"
      transition="all 0.2s ease"
      _active={{ transform: "scale(0.985)", bg: "rgba(255, 255, 255, 0.9)" }}
    >
      <VStack align="start" spacing={0.5} flex="1">
        <Text fontSize="md" fontWeight="850" lineHeight="1.2" color="surface.900">
          {item.name}
        </Text>
        <HStack spacing={2}>
          <Text color="brand.500" fontSize="sm" fontWeight="800">
            EUR {item.price.toFixed(2)}
          </Text>
          <Box w="1px" h="10px" bg="surface.200" />
          <Text color="surface.500" fontSize="xs" fontWeight="700">
            Stock {item.stock}
          </Text>
        </HStack>
      </VStack>

      <Button
        aria-label={`Add ${item.name} to cart`}
        w="48px"
        h="48px"
        borderRadius="16px"
        bg="brand.500"
        color="white"
        p={0}
        _hover={{ bg: "brand.600" }}
        _active={{ bg: "brand.700", transform: "scale(0.92)" }}
        boxShadow="0 8px 20px rgba(74, 132, 244, 0.3)"
        isDisabled={disabled}
        onClick={() => onAdd?.(item.id)}
      >
        <LuPlus size={24} strokeWidth={3} />
      </Button>
    </HStack>
  );
}
