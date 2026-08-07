/**
 * 造梦者 IoT 平台（https://iot.dream-maker.com）数据类型定义。
 *
 * 所有字段均设为可选，因为 `getDevices` / `getDevice` 在实际返回中可能缺字段。
 * 调用方在消费前应使用本文件导出的 zod schema 做安全校验。
 */
import { z } from 'zod'

/** 单个设备对象（来自 IoT 平台）。字段全部可选，API 可能缺字段。 */
export const iotDeviceSchema = z.object({
  id: z.string().min(1).optional(),
  sn: z.string().optional(),
  productId: z.string().optional(),
  nickname: z.string().optional(),
  deviceKey: z.string().optional(),
  online: z.boolean().optional(),
  product: z
    .object({
      productNameCn: z.string().optional(),
      productModel: z.string().optional()
    })
    .optional(),
  moduleName: z.string().optional()
})

/** `getDevices` 分页响应的信封结构。
 *
 * 真实造梦者 IoT 平台（iot.iald.cn）返回的是 Spring Data 分页结构：
 * `data.content`（设备数组）、`data.totalElements`（总数）、`data.totalPages` 等。
 * 旧代码只认 `data.list` / `data.total`，导致 `safeParse` 虽通过但取不到列表、
 * 第一页即静默返回空。这里同时兼容两种结构。
 */
export const iotListResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      total: z.number().optional(),
      list: z.array(z.unknown()).optional(),
      // 真实接口（Spring Data page）字段
      content: z.array(z.unknown()).optional(),
      totalElements: z.number().optional(),
      numberOfElements: z.number().optional(),
      totalPages: z.number().optional(),
      first: z.boolean().optional(),
      last: z.boolean().optional(),
      empty: z.boolean().optional(),
      pageable: z.unknown().optional(),
      sort: z.unknown().optional(),
      number: z.number().optional(),
      size: z.number().optional()
    })
    .optional()
})

/** 从分页响应里安全地取出设备数组（兼容 content / list 两种字段）。 */
export function iotListContent(data: IotListResponse['data']): unknown[] {
  if (!data) return []
  const content = data.content ?? data.list
  return Array.isArray(content) ? content : []
}

/** 从分页响应里安全地取出设备总数（兼容 totalElements / total 两种字段）。 */
export function iotListTotal(data: IotListResponse['data']): number {
  if (!data) return 0
  return data.totalElements ?? data.total ?? 0
}

/** 设备详情（`getDevice`）返回的单设备信封（data 直接是设备对象，可能为空）。 */
export const iotDeviceResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: iotDeviceSchema.nullish()
})

/** zod 推断类型：单个设备。 */
export type IotDevice = z.infer<typeof iotDeviceSchema>

/** zod 推断类型：分页列表响应。 */
export type IotListResponse = z.infer<typeof iotListResponseSchema>

/** zod 推断类型：设备详情响应。 */
export type IotDeviceResponse = z.infer<typeof iotDeviceResponseSchema>
