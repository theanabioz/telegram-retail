export type ProductCardItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

export const sellerHomeMock = {
  storeName: "Central Mall Store",
  operatorName: "John",
  shiftActive: true,
  localIpLabel: "172.20.10.3",
  products: [
    { id: "1", name: "CBD Relax Oil 10%", price: 29.9, stock: 24 },
    { id: "2", name: "CBD Sleep Oil 15%", price: 39.9, stock: 16 },
    { id: "3", name: "CBD Gummies Berry", price: 24.9, stock: 32 },
    { id: "4", name: "CBD Recovery Balm 750mg", price: 34.9, stock: 18 },
    { id: "5", name: "CBD Vape Cartridge Mint", price: 44.9, stock: 12 },
    { id: "6", name: "CBD Capsules 25mg", price: 31.9, stock: 20 },
    { id: "7", name: "CBD Pet Oil 5%", price: 27.9, stock: 14 }
  ] satisfies ProductCardItem[],
};
