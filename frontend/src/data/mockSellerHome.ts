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
    { id: "1", name: "Americano Coffee", price: 3.5, stock: 100 },
    { id: "2", name: "Butter Croissant", price: 2.2, stock: 20 },
    { id: "3", name: "Tuna Sandwich", price: 5.9, stock: 10 },
    { id: "4", name: "Fresh Orange Juice", price: 4.0, stock: 30 },
    { id: "5", name: "Cappuccino", price: 3.9, stock: 40 },
    { id: "6", name: "Chocolate Muffin", price: 2.8, stock: 18 }
  ] satisfies ProductCardItem[],
};
