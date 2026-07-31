/** Fixed anti-reverse CT product on the company Mongo log shard. */
export const DEFAULT_CT_PRODUCT_ID = '689adc659f04ec32f7642fbb'

export function defaultDeviceLogCollection(productId: string = DEFAULT_CT_PRODUCT_ID): string {
  return `device_log_${productId}`
}

export function resolveMongoProductId(productId?: string | null): string {
  const trimmed = productId?.trim()
  return trimmed || DEFAULT_CT_PRODUCT_ID
}

export function resolveMongoCollectionName(params: {
  collection?: string | null
  productId?: string | null
}): string {
  const explicit = params.collection?.trim()
  if (explicit) return explicit
  return defaultDeviceLogCollection(resolveMongoProductId(params.productId))
}
