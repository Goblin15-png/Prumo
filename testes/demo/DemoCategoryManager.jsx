import React, { useMemo, useRef } from 'react';
import AdminCategoryManager from '../../frontend/src/components/AdminCategoryManager';
import { createDemoCategoryService } from './demoCategoryService';

export default function DemoCategoryManager({ products, categories, onProductsChanged, onCategoriesChanged }) {
  const current = useRef({ products, categories });
  current.current = { products, categories };
  const service = useMemo(() => createDemoCategoryService(
    () => current.current,
    (next) => { current.current = { ...current.current, categories: next }; onCategoriesChanged(next); },
    (next) => { current.current = { ...current.current, products: next }; onProductsChanged(next); },
  ), [onProductsChanged, onCategoriesChanged]);
  return <AdminCategoryManager service={service} refreshKey={products} />;
}
