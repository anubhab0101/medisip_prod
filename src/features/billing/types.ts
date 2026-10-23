export type CatalogItem = {
  id: string;
  name: string;
  genericName: string;
  gstBasisPoints: number;
  schedule: string;
  batches: {
    id: string;
    batchNo: string;
    expiryDate: Date;
    qtyOnHand: number;
    qtyReserved: number;
    mrpPaise: number;
  }[];
};
export type CartLine = {
  medicine: CatalogItem;
  quantity: number;
  discountBasisPoints: number;
  batchId: string;
};
