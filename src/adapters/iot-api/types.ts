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

/** `getDevices` 分页响应的信封结构。 */
export const iotListResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z
    .object({
      total: z.number().optional(),
      list: z.array(z.unknown()).optional()
    })
    .optional()
})

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
