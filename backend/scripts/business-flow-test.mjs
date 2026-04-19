#!/usr/bin/env node

import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: new URL("../.env", import.meta.url) });

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4000";
const ADMIN_TELEGRAM_ID = Number(process.env.TEST_ADMIN_TELEGRAM_ID ?? 100000001);
const KEEP_DATA = process.env.KEEP_E2E_DATA === "1" || process.argv.includes("--keep-data");
const apiBaseUrl = (process.env.TEST_API_BASE_URL ?? process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");

if (process.argv.includes("--help")) {
  console.log(`
Hard business-flow regression test for Telegram Retail.

Usage:
  npm run test:business
  TEST_API_BASE_URL=https://telegram-retail-api.vercel.app npm run test:business
  KEEP_E2E_DATA=1 npm run test:business

Environment:
  TEST_API_BASE_URL     Backend origin. Defaults to ${DEFAULT_API_BASE_URL}
  TEST_ADMIN_TELEGRAM_ID  Dev admin telegram id. Defaults to ${ADMIN_TELEGRAM_ID}
  KEEP_E2E_DATA         Skip cleanup for debugging when set to 1
`);
  process.exit(0);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for cleanup/setup");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const runTag = `e2e-${Date.now()}`;
const tempTelegramId = 900000000 + Math.floor(Math.random() * 90000000);

const state = {
  adminToken: null,
  adminUserId: null,
  tempSellerId: null,
  tempSellerToken: null,
  originalStoreId: null,
  tempStoreId: null,
  extraStoreIds: [],
  tempShiftId: null,
  createdProductIds: [],
  liveProductIds: [],
  saleIds: [],
  returnIds: [],
  impersonationLogIds: [],
};

function logStep(message) {
  console.log(`\n[STEP] ${message}`);
}

function logInfo(message) {
  console.log(`[INFO] ${message}`);
}

function describeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function buildHeaders(token, hasBody = false) {
  return {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiRequest(path, { method = "GET", token, body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: buildHeaders(token, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  const data = rawText ? safeJsonParse(rawText) : null;

  if (response.status !== expectedStatus) {
    const errorMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : rawText || `Unexpected status ${response.status}`;
    throw new Error(`${method} ${path} failed with ${response.status}: ${errorMessage}`);
  }

  return data;
}

async function expectApiError(label, executor, expectedStatus, expectedMessagePart) {
  try {
    await executor();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, new RegExp(`\\b${expectedStatus}\\b`), `${label} should return ${expectedStatus}`);
    if (expectedMessagePart) {
      assert.match(message, new RegExp(escapeRegExp(expectedMessagePart), "i"), `${label} message mismatch`);
    }
    logInfo(`${label}: got expected ${expectedStatus}`);
    return;
  }

  throw new Error(`${label} did not fail as expected`);
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sumLineTotals(items) {
  return Number(items.reduce((sum, item) => sum + Number(item.line_total ?? item.lineTotal ?? 0), 0).toFixed(2));
}

function findInventoryItem(inventoryResponse, storeId, productId) {
  return inventoryResponse.items.find((item) => item.storeId === storeId && item.productId === productId);
}

function assertStatus(ok, message) {
  assert.equal(ok, true, message);
}

async function createTempSeller() {
  const { data, error } = await supabase
    .from("users")
    .insert({
      telegram_id: tempTelegramId,
      role: "seller",
      full_name: `E2E Seller ${runTag}`,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create temp seller: ${error.message}`);
  }

  state.tempSellerId = data.id;
}

async function cleanupArtifacts() {
  if (KEEP_DATA) {
    logInfo("KEEP_E2E_DATA=1, skipping cleanup");
    return;
  }

  logStep("Cleaning up test artifacts");

  const cleanupErrors = [];
  const recordCleanupError = (message, error) => {
    cleanupErrors.push(`${message}: ${describeError(error)}`);
  };

  try {
    if (state.tempShiftId && state.tempSellerToken) {
      try {
        await apiRequest("/shifts/stop", {
          method: "POST",
          token: state.tempSellerToken,
          body: {},
        });
      } catch {
        // Shift may already be closed or token cleanup order may differ.
      }
    }

    if (state.saleIds.length > 0 || state.returnIds.length > 0 || state.tempShiftId || state.tempStoreId || state.createdProductIds.length > 0) {
      let movementDelete = supabase.from("inventory_movements").delete();
      if (state.tempStoreId) {
        movementDelete = movementDelete.eq("store_id", state.tempStoreId);
      } else if (state.createdProductIds.length > 0) {
        movementDelete = movementDelete.in("product_id", state.createdProductIds);
      } else if (state.tempShiftId) {
        movementDelete = movementDelete.eq("shift_id", state.tempShiftId);
      }
      const { error: movementsError } = await movementDelete;
      if (movementsError) {
        recordCleanupError("Failed to delete inventory_movements", movementsError);
      }
    }

    if (state.tempSellerId) {
      const { data: returnsRows, error: returnsReadError } = await supabase
        .from("returns")
        .select("id")
        .eq("seller_id", state.tempSellerId);

      if (returnsReadError) {
        recordCleanupError("Failed to read returns", returnsReadError);
      } else if ((returnsRows ?? []).length > 0) {
        const returnIds = returnsRows.map((row) => row.id);

        const { error: returnItemsError } = await supabase.from("return_items").delete().in("return_id", returnIds);
        if (returnItemsError) {
          recordCleanupError("Failed to delete return_items", returnItemsError);
        }

        const { error: returnsError } = await supabase.from("returns").delete().in("id", returnIds);
        if (returnsError) {
          recordCleanupError("Failed to delete returns", returnsError);
        }
      }
    }

    if (state.tempSellerId) {
      const { data: salesRows, error: salesReadError } = await supabase
        .from("sales")
        .select("id")
        .eq("seller_id", state.tempSellerId);

      if (salesReadError) {
        recordCleanupError("Failed to read sales", salesReadError);
      } else if ((salesRows ?? []).length > 0) {
        const saleIds = salesRows.map((row) => row.id);

        const { error: saleItemsError } = await supabase.from("sale_items").delete().in("sale_id", saleIds);
        if (saleItemsError) {
          recordCleanupError("Failed to delete sale_items", saleItemsError);
        }

        const { error: salesError } = await supabase.from("sales").delete().in("id", saleIds);
        if (salesError) {
          recordCleanupError("Failed to delete sales", salesError);
        }
      }
    }

    if (state.tempSellerId) {
      const { data: draftSales, error: draftSalesReadError } = await supabase
        .from("draft_sales")
        .select("id")
        .eq("seller_id", state.tempSellerId);

      if (draftSalesReadError) {
        recordCleanupError("Failed to read draft_sales", draftSalesReadError);
      } else if ((draftSales ?? []).length > 0) {
        const draftIds = draftSales.map((row) => row.id);
        const { error: draftItemsDeleteError } = await supabase
          .from("draft_sale_items")
          .delete()
          .in("draft_sale_id", draftIds);
        if (draftItemsDeleteError) {
          recordCleanupError("Failed to delete draft_sale_items", draftItemsDeleteError);
        }

        const { error: draftSalesDeleteError } = await supabase.from("draft_sales").delete().in("id", draftIds);
        if (draftSalesDeleteError) {
          recordCleanupError("Failed to delete draft_sales", draftSalesDeleteError);
        }
      }
    }

    if (state.tempShiftId) {
      const { error: shiftsError } = await supabase.from("shifts").delete().eq("id", state.tempShiftId);
      if (shiftsError) {
        recordCleanupError("Failed to delete shift", shiftsError);
      }
    }

    if (state.tempSellerId) {
      const { error: impersonationLogsError } = await supabase
        .from("impersonation_logs")
        .delete()
        .eq("seller_user_id", state.tempSellerId);
      if (impersonationLogsError) {
        recordCleanupError("Failed to delete impersonation_logs", impersonationLogsError);
      }

      const { error: assignmentsError } = await supabase.from("user_store_assignments").delete().eq("user_id", state.tempSellerId);
      if (assignmentsError) {
        recordCleanupError("Failed to delete user_store_assignments", assignmentsError);
      }
    }

    if (state.createdProductIds.length > 0) {
      const { error: inventoryError } = await supabase.from("inventory").delete().in("product_id", state.createdProductIds);
      if (inventoryError) {
        recordCleanupError("Failed to delete inventory rows", inventoryError);
      }

      const { error: storeProductsError } = await supabase.from("store_products").delete().in("product_id", state.createdProductIds);
      if (storeProductsError) {
        recordCleanupError("Failed to delete store_products", storeProductsError);
      }

      const { error: productsError } = await supabase.from("products").delete().in("id", state.createdProductIds);
      if (productsError) {
        recordCleanupError("Failed to delete products", productsError);
      }
    }

    if (state.tempStoreId) {
      const { error: tempStoreInventoryError } = await supabase.from("inventory").delete().eq("store_id", state.tempStoreId);
      if (tempStoreInventoryError) {
        recordCleanupError("Failed to delete temp store inventory", tempStoreInventoryError);
      }

      const { error: tempStoreProductsError } = await supabase.from("store_products").delete().eq("store_id", state.tempStoreId);
      if (tempStoreProductsError) {
        recordCleanupError("Failed to delete temp store store_products", tempStoreProductsError);
      }

      const { error: storeDeleteError } = await supabase.from("stores").delete().eq("id", state.tempStoreId);
      if (storeDeleteError) {
        recordCleanupError("Failed to delete temp store", storeDeleteError);
      }
    }

    if (state.extraStoreIds.length > 0) {
      const { error: extraStoreInventoryError } = await supabase.from("inventory").delete().in("store_id", state.extraStoreIds);
      if (extraStoreInventoryError) {
        recordCleanupError("Failed to delete extra store inventory", extraStoreInventoryError);
      }

      const { error: extraStoreProductsError } = await supabase.from("store_products").delete().in("store_id", state.extraStoreIds);
      if (extraStoreProductsError) {
        recordCleanupError("Failed to delete extra store store_products", extraStoreProductsError);
      }

      const { error: extraStoresDeleteError } = await supabase.from("stores").delete().in("id", state.extraStoreIds);
      if (extraStoresDeleteError) {
        recordCleanupError("Failed to delete extra stores", extraStoresDeleteError);
      }
    }

    if (state.tempSellerId) {
      const { error: sellerDeleteError } = await supabase.from("users").delete().eq("id", state.tempSellerId);
      if (sellerDeleteError) {
        recordCleanupError("Failed to delete temp seller", sellerDeleteError);
      }
    }
  } catch (error) {
    recordCleanupError("Unexpected cleanup failure", error);
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("\n"));
  }
}

async function main() {
  logStep(`Running hard business-flow test against ${apiBaseUrl}`);

  logStep("Authenticating admin");
  const adminAuth = await apiRequest("/auth/dev-login", {
    method: "POST",
    body: { telegramId: ADMIN_TELEGRAM_ID },
  });
  state.adminToken = adminAuth.token;

  const adminMe = await apiRequest("/auth/me", { token: state.adminToken });
  state.adminUserId = adminMe.user.id;

  const initialStores = await apiRequest("/admin/stores", { token: state.adminToken });
  const fallbackStore = initialStores.stores.find((store) => store.isActive) ?? initialStores.stores[0];
  assert.ok(fallbackStore, "At least one existing store is required");
  state.originalStoreId = fallbackStore.id;

  await expectApiError(
    "Admin cannot access seller-only startup",
    () => apiRequest("/seller/startup", { token: state.adminToken }),
    403,
    "insufficient permissions"
  );

  logStep("Creating temp store via admin API");
  const createdStore = await apiRequest("/admin/stores", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      name: `E2E Store ${runTag}`,
      address: "Boot phase",
      isActive: true,
    },
  });
  state.tempStoreId = createdStore.store.id;

  const updatedStore = await apiRequest(`/admin/stores/${state.tempStoreId}`, {
    method: "PATCH",
    token: state.adminToken,
    body: {
      name: `E2E Store ${runTag} Updated`,
      address: "Regression Avenue 42",
    },
  });
  assert.match(updatedStore.store.name, /Updated$/, "Store update should persist the new name");

  const inactiveStore = await apiRequest("/admin/stores", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      name: `E2E Inactive Store ${runTag}`,
      address: "Dormant street",
      isActive: false,
    },
  });
  state.extraStoreIds.push(inactiveStore.store.id);

  logStep("Creating live products and one disposable CRUD-only product");
  const liveProductA = await apiRequest("/admin/products", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      name: `CBD Flow Oil ${runTag}`,
      sku: `E2E-A-${Date.now()}`,
      defaultPrice: 34.9,
      isActive: true,
    },
  });
  const liveProductB = await apiRequest("/admin/products", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      name: `CBD Flow Gummies ${runTag}`,
      sku: `E2E-B-${Date.now()}`,
      defaultPrice: 19.9,
      isActive: true,
    },
  });
  const disposableProduct = await apiRequest("/admin/products", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      name: `CBD Disposable ${runTag}`,
      sku: `E2E-D-${Date.now()}`,
      defaultPrice: 9.5,
      isActive: true,
    },
  });

  state.createdProductIds.push(liveProductA.product.id, liveProductB.product.id, disposableProduct.product.id);
  state.liveProductIds.push(liveProductA.product.id, liveProductB.product.id);

  const updatedProductA = await apiRequest(`/admin/products/${liveProductA.product.id}`, {
    method: "PATCH",
    token: state.adminToken,
    body: {
      name: `CBD Flow Oil ${runTag} Premium`,
      defaultPrice: 39.9,
    },
  });
  assert.equal(updatedProductA.product.defaultPrice, 39.9, "Admin product update should change default price");

  await apiRequest(`/admin/products/${disposableProduct.product.id}`, {
    method: "PATCH",
    token: state.adminToken,
    body: {
      name: `CBD Disposable ${runTag} Updated`,
      defaultPrice: 11.25,
    },
  });
  await apiRequest(`/admin/products/${disposableProduct.product.id}`, {
    method: "DELETE",
    token: state.adminToken,
  });
  state.createdProductIds = state.createdProductIds.filter((id) => id !== disposableProduct.product.id);

  logStep("Preparing isolated temp seller");
  await createTempSeller();

  await expectApiError(
    "Seller without assignment cannot authenticate",
    () =>
      apiRequest("/auth/dev-login", {
        method: "POST",
        body: { telegramId: tempTelegramId },
      }),
    403,
    "no active store assignment"
  );

  const assignmentResult = await apiRequest(`/admin/staff/${state.tempSellerId}/assignment`, {
    method: "POST",
    token: state.adminToken,
    body: { storeId: state.tempStoreId },
  });
  assert.equal(assignmentResult.assignment.storeId, state.tempStoreId, "Seller should be assigned to temp store");

  await expectApiError(
    "Seller cannot be assigned to an inactive store",
    () =>
      apiRequest(`/admin/staff/${state.tempSellerId}/assignment`, {
        method: "POST",
        token: state.adminToken,
        body: { storeId: inactiveStore.store.id },
      }),
    409,
    "active store"
  );

  const sellerAuth = await apiRequest("/auth/dev-login", {
    method: "POST",
    body: { telegramId: tempTelegramId },
  });
  state.tempSellerToken = sellerAuth.token;

  const impersonatedSeller = await apiRequest(`/auth/impersonate/${state.tempSellerId}`, {
    method: "POST",
    token: state.adminToken,
  });
  state.impersonationLogIds.push(impersonatedSeller.impersonation.id);
  const impersonatedStartup = await apiRequest("/seller/startup", { token: impersonatedSeller.token });
  assert.equal(impersonatedStartup.catalog, null, "Admin impersonation should inherit seller pre-shift startup state");
  await apiRequest("/auth/impersonate/stop", {
    method: "POST",
    token: state.adminToken,
    body: { logId: impersonatedSeller.impersonation.id },
  });

  await expectApiError(
    "Seller cannot access admin dashboard",
    () => apiRequest("/admin/dashboard", { token: state.tempSellerToken }),
    403,
    "insufficient permissions"
  );

  logStep("Reading admin inventory and updating store-specific settings");
  const initialInventory = await apiRequest(`/admin/inventory?storeId=${state.tempStoreId}&historyLimit=20`, {
    token: state.adminToken,
  });

  const storeProductA = findInventoryItem(initialInventory, state.tempStoreId, liveProductA.product.id);
  const storeProductB = findInventoryItem(initialInventory, state.tempStoreId, liveProductB.product.id);
  assert.ok(storeProductA, "Temp store should receive product A after creation");
  assert.ok(storeProductB, "Temp store should receive product B after creation");

  await apiRequest(`/admin/store-products/${storeProductA.storeProductId}`, {
    method: "PATCH",
    token: state.adminToken,
    body: { price: 37.5 },
  });
  await apiRequest(`/admin/store-products/${storeProductB.storeProductId}`, {
    method: "PATCH",
    token: state.adminToken,
    body: { isEnabled: false },
  });

  logStep("Verifying pre-shift seller restrictions");
  const preShiftStartup = await apiRequest("/seller/startup", { token: state.tempSellerToken });
  assert.equal(preShiftStartup.catalog, null, "Seller startup should not expose catalog without active shift");

  await expectApiError(
    "Catalog requires active shift",
    () => apiRequest("/seller/catalog", { token: state.tempSellerToken }),
    409,
    "active shift is required"
  );

  await expectApiError(
    "Seller cannot start shift in another store",
    () =>
      apiRequest("/shifts/start", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { storeId: state.originalStoreId },
      }),
    403,
    "assigned store"
  );

  logStep("Starting shift and validating pause/resume rules");
  const startedShift = await apiRequest("/shifts/start", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { storeId: state.tempStoreId },
  });
  state.tempShiftId = startedShift.shift.id;

  await expectApiError(
    "Seller cannot start a second shift",
    () =>
      apiRequest("/shifts/start", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { storeId: state.tempStoreId },
      }),
    409,
    "already has an open shift"
  );

  const sellerCatalogAfterStart = await apiRequest("/seller/catalog", { token: state.tempSellerToken });
  const sellerProductA = sellerCatalogAfterStart.products.find((product) => product.id === liveProductA.product.id);
  const sellerProductB = sellerCatalogAfterStart.products.find((product) => product.id === liveProductB.product.id);
  assert.equal(sellerProductA.storePrice, 37.5, "Seller catalog should use store-specific admin price");
  assert.equal(sellerProductB, undefined, "Disabled store-product should be hidden from seller catalog");

  await expectApiError(
    "Disabled product cannot be added to draft",
    () =>
      apiRequest("/seller/draft/items", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { productId: liveProductB.product.id, quantity: 1 },
      }),
    404,
    "not available"
  );

  await apiRequest(`/admin/store-products/${storeProductB.storeProductId}`, {
    method: "PATCH",
    token: state.adminToken,
    body: { isEnabled: true, price: 22.5 },
  });
  const sellerCatalogAfterEnable = await apiRequest("/seller/catalog", { token: state.tempSellerToken });
  const enabledProductB = sellerCatalogAfterEnable.products.find((product) => product.id === liveProductB.product.id);
  assert.ok(enabledProductB, "Re-enabled product should reappear in seller catalog");
  assert.equal(enabledProductB.storePrice, 22.5, "Re-enabled product should use updated store price");

  await apiRequest("/shifts/pause", {
    method: "POST",
    token: state.tempSellerToken,
    body: {},
  });

  await expectApiError(
    "Paused seller cannot add draft items",
    () =>
      apiRequest("/seller/draft/items", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { productId: liveProductA.product.id, quantity: 1 },
      }),
    409,
    "resume the shift"
  );

  await expectApiError(
    "Paused seller cannot edit inventory",
    () =>
      apiRequest("/seller/inventory/restock", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { productId: liveProductB.product.id, quantity: 1, reason: `${runTag} paused restock` },
      }),
    409,
    "resume the shift"
  );

  await apiRequest("/shifts/resume", {
    method: "POST",
    token: state.tempSellerToken,
    body: {},
  });

  await expectApiError(
    "Seller cannot be reassigned during an active shift",
    () =>
      apiRequest(`/admin/staff/${state.tempSellerId}/assignment`, {
        method: "POST",
        token: state.adminToken,
        body: { storeId: state.originalStoreId },
      }),
    409,
    "active shift is open"
  );

  logStep("Applying admin and seller inventory operations");
  await apiRequest("/admin/inventory/adjustment", {
    method: "POST",
    token: state.adminToken,
    expectedStatus: 201,
    body: {
      storeId: state.tempStoreId,
      productId: liveProductA.product.id,
      movementType: "restock",
      quantity: 20,
      reason: `${runTag} admin restock`,
    },
  });
  await apiRequest("/seller/inventory/restock", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      productId: liveProductB.product.id,
      quantity: 10,
      reason: `${runTag} seller restock`,
    },
  });
  await apiRequest("/seller/inventory/manual-adjustment", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      productId: liveProductA.product.id,
      quantity: 1,
      reason: `${runTag} manual correction`,
    },
  });
  await apiRequest("/seller/inventory/writeoff", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      productId: liveProductB.product.id,
      quantity: 1,
      reason: `${runTag} damaged pack`,
    },
  });

  const inventoryAfterOps = await apiRequest(`/admin/inventory?storeId=${state.tempStoreId}&historyLimit=50`, {
    token: state.adminToken,
  });
  assert.equal(findInventoryItem(inventoryAfterOps, state.tempStoreId, liveProductA.product.id).stockQuantity, 21);
  assert.equal(findInventoryItem(inventoryAfterOps, state.tempStoreId, liveProductB.product.id).stockQuantity, 9);

  await expectApiError(
    "Writeoff cannot drop inventory below zero",
    () =>
      apiRequest("/seller/inventory/writeoff", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: {
          productId: liveProductB.product.id,
          quantity: 999,
          reason: `${runTag} impossible writeoff`,
        },
      }),
    409,
    "cannot go below zero"
  );

  logStep("Testing draft cart create, edit, remove and checkout");
  await expectApiError(
    "Cannot checkout empty draft",
    () =>
      apiRequest("/seller/checkout", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { paymentMethod: "cash" },
      }),
    409,
    "draft cart is empty"
  );

  const firstDraft = await apiRequest("/seller/draft/items", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { productId: liveProductA.product.id, quantity: 2 },
  });
  assert.equal(firstDraft.items.length, 1, "Draft should contain first item");

  const secondDraft = await apiRequest("/seller/draft/items", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      productId: liveProductB.product.id,
      quantity: 1,
      discountType: "percent",
      discountValue: 10,
    },
  });
  assert.equal(secondDraft.items.length, 2, "Draft should support multi-item carts");

  const productAItem = secondDraft.items.find((item) => item.product_id === liveProductA.product.id);
  const productBItem = secondDraft.items.find((item) => item.product_id === liveProductB.product.id);
  assert.ok(productAItem && productBItem, "Draft items should exist");

  const updatedDraft = await apiRequest(`/seller/draft/items/${productAItem.id}`, {
    method: "PATCH",
    token: state.tempSellerToken,
    body: {
      quantity: 3,
      discountType: "amount",
      discountValue: 5,
    },
  });
  const updatedA = updatedDraft.items.find((item) => item.id === productAItem.id);
  assert.equal(updatedA.quantity, 3, "Draft item quantity should update");
  assert.equal(updatedA.discount_type, "amount", "Draft item discount type should update");

  const removedAndDraft = await apiRequest(`/seller/draft/items/${productBItem.id}`, {
    method: "DELETE",
    token: state.tempSellerToken,
  });
  assert.equal(removedAndDraft.items.length, 1, "Draft item delete should remove the line");

  const restoredDraft = await apiRequest("/seller/draft/items", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      productId: liveProductB.product.id,
      quantity: 1,
      discountType: "percent",
      discountValue: 10,
    },
  });
  assert.equal(restoredDraft.items.length, 2, "Removed item should be addable again");
  const restoredProductBItem = restoredDraft.items.find((item) => item.product_id === liveProductB.product.id);
  assert.ok(restoredProductBItem, "Re-added draft item should exist with a fresh id");

  const tooLargeDraft = await apiRequest(`/seller/draft/items/${restoredProductBItem.id}`, {
    method: "PATCH",
    token: state.tempSellerToken,
    body: {
      quantity: 999,
    },
  });
  const tooLargeItem = tooLargeDraft.items.find((item) => item.id === restoredProductBItem.id);
  assert.equal(tooLargeItem.quantity, 999, "Draft update should accept the temporary oversized quantity");

  await expectApiError(
    "Checkout should reject insufficient stock",
    () =>
      apiRequest("/seller/checkout", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: { paymentMethod: "card" },
      }),
    409,
    "insufficient stock"
  );

  const normalizedDraft = await apiRequest(`/seller/draft/items/${restoredProductBItem.id}`, {
    method: "PATCH",
    token: state.tempSellerToken,
    body: {
      quantity: 1,
    },
  });
  const normalizedItem = normalizedDraft.items.find((item) => item.id === restoredProductBItem.id);
  assert.equal(normalizedItem.quantity, 1, "Draft quantity should recover after insufficient stock rejection");

  const checkoutOne = await apiRequest("/seller/checkout", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { paymentMethod: "card" },
  });
  state.saleIds.push(checkoutOne.sale.id);
  assert.equal(checkoutOne.sale.payment_method, "card", "Checkout should persist payment method");
  assert.equal(checkoutOne.summary.totalAmount, sumLineTotals(checkoutOne.items), "Checkout summary should match line totals");

  const salesAfterCheckoutOne = await apiRequest("/seller/sales?limit=20", {
    token: state.tempSellerToken,
  });
  const saleOne = salesAfterCheckoutOne.sales.find((sale) => sale.id === checkoutOne.sale.id);
  assert.ok(saleOne, "Completed sale should appear in seller sales list");

  const secondSaleDraft = await apiRequest("/seller/draft/items", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { productId: liveProductA.product.id, quantity: 1 },
  });
  assert.equal(secondSaleDraft.items.length, 1, "Fresh draft should start empty after checkout");

  const checkoutTwo = await apiRequest("/seller/checkout", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { paymentMethod: "cash" },
  });
  state.saleIds.push(checkoutTwo.sale.id);
  const salesAfterCheckoutTwo = await apiRequest("/seller/sales?limit=20", {
    token: state.tempSellerToken,
  });
  const saleTwo = salesAfterCheckoutTwo.sales.find((sale) => sale.id === checkoutTwo.sale.id);
  assert.ok(saleTwo, "Second sale should be available for deletion checks");

  const deletedSale = await apiRequest(`/seller/sales/${checkoutTwo.sale.id}/delete`, {
    method: "POST",
    token: state.tempSellerToken,
    body: { reason: `${runTag} delete completed sale` },
  });
  assert.equal(deletedSale.sale.status, "deleted", "Seller should be able to soft-delete completed sale");

  await expectApiError(
    "Deleted sale cannot be deleted twice",
    () =>
      apiRequest(`/seller/sales/${checkoutTwo.sale.id}/delete`, {
        method: "POST",
        token: state.tempSellerToken,
        body: { reason: `${runTag} second delete attempt` },
      }),
    409,
    "only completed sales can be deleted"
  );

  await expectApiError(
    "Deleted sale cannot be returned",
    () =>
      apiRequest("/seller/returns", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: {
          saleId: checkoutTwo.sale.id,
          reason: `${runTag} invalid return on deleted sale`,
          items: [{ saleItemId: saleTwo.items[0].id, quantity: 1 }],
        },
      }),
    409,
    "only be created for completed sales"
  );

  const thirdSaleDraft = await apiRequest("/seller/draft/items", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { productId: liveProductB.product.id, quantity: 2 },
  });
  assert.equal(thirdSaleDraft.items.length, 1);

  const checkoutThree = await apiRequest("/seller/checkout", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: { paymentMethod: "cash" },
  });
  state.saleIds.push(checkoutThree.sale.id);
  const salesAfterCheckoutThree = await apiRequest("/seller/sales?limit=20", {
    token: state.tempSellerToken,
  });
  const saleThree = salesAfterCheckoutThree.sales.find((sale) => sale.id === checkoutThree.sale.id);
  assert.ok(saleThree, "Third sale should be available for return flow");
  const checkoutThreeItem = saleThree.items[0];

  await expectApiError(
    "Return quantity cannot exceed sold quantity in one request",
    () =>
      apiRequest("/seller/returns", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: {
          saleId: checkoutThree.sale.id,
          reason: `${runTag} oversized return`,
          items: [{ saleItemId: checkoutThreeItem.id, quantity: checkoutThreeItem.quantity + 1 }],
        },
      }),
    409,
    "exceeds sold quantity"
  );

  const createdReturn = await apiRequest("/seller/returns", {
    method: "POST",
    token: state.tempSellerToken,
    expectedStatus: 201,
    body: {
      saleId: checkoutThree.sale.id,
      reason: `${runTag} partial return`,
      items: [{ saleItemId: checkoutThreeItem.id, quantity: 1 }],
    },
  });
  state.returnIds.push(createdReturn.return.id);
  assert.equal(createdReturn.totalAmount, checkoutThreeItem.final_price, "Return total should reflect returned quantity");

  await expectApiError(
    "Return quantity should not exceed remaining quantity after previous returns",
    () =>
      apiRequest("/seller/returns", {
        method: "POST",
        token: state.tempSellerToken,
        expectedStatus: 201,
        body: {
          saleId: checkoutThree.sale.id,
          reason: `${runTag} cumulative over-return`,
          items: [{ saleItemId: checkoutThreeItem.id, quantity: checkoutThreeItem.quantity }],
        },
      }),
    409,
    "remaining"
  );

  logStep("Stopping shift and validating shift history/details");
  const stoppedShift = await apiRequest("/shifts/stop", {
    method: "POST",
    token: state.tempSellerToken,
    body: {},
  });
  assert.equal(stoppedShift.shift.status, "closed", "Shift stop should close the shift");

  const shiftHistory = await apiRequest("/shifts/history?limit=10&offset=0", {
    token: state.tempSellerToken,
  });
  const historyEntry = shiftHistory.items.find((entry) => entry.shift.id === state.tempShiftId);
  assert.ok(historyEntry, "Closed shift should appear in seller history");

  const shiftDetails = await apiRequest(`/shifts/history/${state.tempShiftId}`, {
    token: state.tempSellerToken,
  });
  assert.equal(shiftDetails.salesSummary.count, 2, "Deleted sale should not count in shift completed sales");
  assert.equal(shiftDetails.salesSummary.cashSalesCount, 1, "Only one completed cash sale should remain");
  assert.equal(
    shiftDetails.salesSummary.totalRevenue,
    Number((checkoutOne.sale.total_amount + checkoutThree.sale.total_amount).toFixed(2)),
    "Shift revenue should include only completed sales"
  );

  logStep("Validating admin overview, sales filters and product deletion guard");
  const adminSalesAll = await apiRequest(
    `/admin/sales?storeId=${state.tempStoreId}&saleStatus=all&limit=20`,
    { token: state.adminToken }
  );
  const adminSalesCompleted = await apiRequest(
    `/admin/sales?storeId=${state.tempStoreId}&saleStatus=completed&limit=20`,
    { token: state.adminToken }
  );
  const adminSalesDeleted = await apiRequest(
    `/admin/sales?storeId=${state.tempStoreId}&saleStatus=deleted&limit=20`,
    { token: state.adminToken }
  );

  assert.equal(adminSalesCompleted.sales.length, 2, "Admin completed filter should show two sales");
  assert.equal(adminSalesDeleted.sales.length, 1, "Admin deleted filter should show one deleted sale");
  assert.equal(adminSalesAll.returns.length, 1, "Admin sales overview should expose created return");
  assert.equal(adminSalesDeleted.sales[0].id, checkoutTwo.sale.id, "Deleted sale should be the soft-deleted one");

  const finalInventory = await apiRequest(`/admin/inventory?storeId=${state.tempStoreId}&historyLimit=100`, {
    token: state.adminToken,
  });
  assert.equal(findInventoryItem(finalInventory, state.tempStoreId, liveProductA.product.id).stockQuantity, 18);
  assert.equal(findInventoryItem(finalInventory, state.tempStoreId, liveProductB.product.id).stockQuantity, 7);
  assertStatus(
    finalInventory.history.some((entry) => entry.movementType === "sale_deletion"),
    "Inventory history should include sale deletion movement"
  );
  assertStatus(
    finalInventory.history.some((entry) => entry.movementType === "return"),
    "Inventory history should include return movement"
  );

  const dashboard = await apiRequest("/admin/dashboard?recentSalesLimit=20&lowStockLimit=20", {
    token: state.adminToken,
  });
  assertStatus(
    dashboard.recentSales.some((sale) => sale.id === checkoutOne.sale.id),
    "Admin dashboard should include the first completed sale"
  );
  const tempStorePerformance = dashboard.storePerformance.find((store) => store.id === state.tempStoreId);
  assert.ok(tempStorePerformance, "Dashboard should include the temporary store in store performance");
  assert.equal(tempStorePerformance.salesCount, 2, "Store performance should count only completed sales");
  assert.equal(
    tempStorePerformance.revenue,
    Number((checkoutOne.sale.total_amount + checkoutThree.sale.total_amount).toFixed(2)),
    "Store performance revenue should exclude deleted sales"
  );

  await expectApiError(
    "Product with history cannot be deleted",
    () =>
      apiRequest(`/admin/products/${liveProductA.product.id}`, {
        method: "DELETE",
        token: state.adminToken,
      }),
    409,
    "preserve reports"
  );

  console.log("\n[PASS] Hard business-flow regression passed");
  console.log(
    JSON.stringify(
      {
        apiBaseUrl,
        runTag,
        tempStoreId: state.tempStoreId,
        tempSellerId: state.tempSellerId,
        shiftId: state.tempShiftId,
        saleIds: state.saleIds,
        returnIds: state.returnIds,
      },
      null,
      2
    )
  );
}

let mainError = null;

try {
  await main();
} catch (error) {
  mainError = error;
} finally {
  try {
    await cleanupArtifacts();
  } catch (cleanupError) {
    if (mainError) {
      console.error(`\n[CLEANUP ERROR] ${describeError(cleanupError)}`);
    } else {
      throw cleanupError;
    }
  }
}

if (mainError) {
  throw mainError;
}
