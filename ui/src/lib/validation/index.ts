import * as z from 'zod'

export const SigninValidationSchema = z.object({
  username: z.string().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
})

export const DecisionValidationSchema = z.object({
  comment: z.string().max(500, 'Комментарий слишком длинный').optional(),
})
