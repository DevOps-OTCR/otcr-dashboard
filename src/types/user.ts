import { z } from "zod"

export const UserRole = {
  ADMIN: "admin",
  USER: "user",
  MODERATOR: "moderator",
} as const

export type UserRole = typeof UserRole[keyof typeof UserRole]

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["admin", "user", "moderator"]).default("user"),
})

export const UpdateUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["admin", "user", "moderator"]).optional(),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

export interface User {
  id: string
  email: string
  name: string | null
  role: string
  createdAt: Date
  updatedAt: Date
}
